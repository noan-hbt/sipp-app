"""App Store subscriptions (through RevenueCat) -> user access.

RevenueCat holds the receipts. Sipp never trusts a webhook body or the app: on any sign that a customer
changed, it re-reads the customer from RevenueCat and projects their subscriptions into user.plan.
"""

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import BillingSubscription, User, utcnow
from app.revenuecat import RevenueCatClient

log = logging.getLogger("sipp.billing")

# Statuses that grant the subscribed plan (past_due: renewal failing, inside Apple's grace period).
LIVE = ("active", "trialing", "past_due")
# Plans a subscription may set or take away; internal plans (e.g. "max") are never touched.
MANAGED_PLANS = ("free", "basic", "plus")
_RANK = {"basic": 1, "plus": 2}


def parse_dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _aware(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=utcnow().tzinfo) if value is not None and value.tzinfo is None else value


def _plan_for(product_id: str) -> tuple[str, str] | None:
    for key, pid in get_settings().store_products().items():
        if pid == product_id:
            return key
    return None


def _status(info: dict[str, Any], now: datetime) -> tuple[str, datetime | None]:
    """(status, end of access) of one RevenueCat subscription entry."""
    expires = parse_dt(info.get("expires_date"))
    grace = parse_dt(info.get("grace_period_expires_date"))
    end = max((d for d in (expires, grace) if d is not None), default=None)
    if info.get("refunded_at"):
        return "refunded", expires
    if end is not None and end <= now:
        return "expired", end
    if info.get("billing_issues_detected_at"):
        return "past_due", end
    return ("trialing" if info.get("period_type") == "trial" else "active"), end


async def live_subscription(session: AsyncSession, user_id: str) -> BillingSubscription | None:
    subs = (
        await session.scalars(
            select(BillingSubscription).where(
                BillingSubscription.user_id == user_id, BillingSubscription.status.in_(LIVE)
            )
        )
    ).all()
    return max(subs, key=lambda x: (_RANK.get(x.plan, 0), _aware(x.current_period_end) or utcnow()), default=None)


async def ever_subscribed(session: AsyncSession, user_id: str) -> bool:
    return (
        await session.scalar(select(BillingSubscription.id).where(BillingSubscription.user_id == user_id).limit(1))
    ) is not None


async def refresh_access(session: AsyncSession, user: User) -> None:
    """Sets user.plan / plan_expires_at from the user's best live subscription."""
    s = get_settings()
    if user.plan not in MANAGED_PLANS:
        return
    sub = await live_subscription(session, user.id)
    if sub is None:
        if await ever_subscribed(session, user.id):
            user.plan, user.plan_expires_at = "free", None
        return
    user.plan = sub.plan
    end = _aware(sub.current_period_end)
    # Slack in case the renewal reaches us late; an expired one is caught by the next sync anyway.
    user.plan_expires_at = (end or utcnow() + timedelta(days=32)) + timedelta(hours=s.billing_period_slack_hours)


async def sync(session: AsyncSession, user: User, rc: RevenueCatClient) -> None:
    """Re-reads the user's purchases from RevenueCat and applies them. Raises RevenueCatError."""
    subscriber = await rc.subscriber(user.id)
    now = utcnow()
    seen: set[str] = set()
    for product_id, info in (subscriber.get("subscriptions") or {}).items():
        plan = _plan_for(product_id)
        if plan is None:
            log.error("user %s has an unknown product %s, ignored", user.id, product_id)
            continue
        sub_id = f"rc:{user.id}:{product_id}"
        seen.add(sub_id)
        sub = await session.get(BillingSubscription, sub_id)
        if sub is None:
            sub = BillingSubscription(id=sub_id, user_id=user.id)
            session.add(sub)
        status, end = _status(info, now)
        sub.plan, sub.interval = plan
        sub.product_id = product_id
        sub.store = info.get("store")
        sub.sandbox = bool(info.get("is_sandbox"))
        sub.status = status
        sub.current_period_end = end
        sub.cancel_at_period_end = info.get("unsubscribe_detected_at") is not None and status in LIVE
        sub.past_due_since = parse_dt(info.get("billing_issues_detected_at")) if status == "past_due" else None
        sub.event_at = now
    # A purchase restored on another account moves there (RevenueCat transfer): this one loses it.
    for sub in (
        await session.scalars(select(BillingSubscription).where(BillingSubscription.user_id == user.id))
    ).all():
        if sub.id not in seen and sub.status in LIVE:
            sub.status, sub.event_at = "transferred", now
    await session.flush()
    others = (await session.scalars(
        select(BillingSubscription).where(BillingSubscription.user_id == user.id, BillingSubscription.status.in_(LIVE))
    )).all()
    if len(others) > 1:
        log.warning("user %s has %d live subscriptions: %s", user.id, len(others), [x.id for x in others])
    await refresh_access(session, user)


def users_in_event(event: dict[str, Any]) -> list[str]:
    """Every app user id a webhook event concerns (a transfer touches both sides)."""
    ids = [event.get("app_user_id"), event.get("original_app_user_id")]
    ids += list(event.get("aliases") or []) + list(event.get("transferred_from") or []) + list(event.get("transferred_to") or [])
    # RevenueCat's own anonymous ids are never Sipp users.
    return list(dict.fromkeys(i for i in ids if i and not i.startswith("$RCAnonymousID")))


async def reconcile(session: AsyncSession, rc: RevenueCatClient, stale_hours: int = 20) -> int:
    """Re-reads the users whose live subscription was not refreshed lately (missed webhooks, renewals)."""
    cutoff = utcnow() - timedelta(hours=stale_hours)
    user_ids = (
        await session.scalars(
            select(BillingSubscription.user_id).where(
                BillingSubscription.status.in_(LIVE),
                BillingSubscription.updated_at < cutoff,
                BillingSubscription.user_id.is_not(None),
            ).distinct()
        )
    ).all()
    for user_id in user_ids:
        user = await session.get(User, user_id)
        if user is not None:
            await sync(session, user, rc)
            await session.commit()
    return len(user_ids)
