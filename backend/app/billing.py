"""Paddle subscriptions -> user access. Paddle owns payments; Sipp projects them into user.plan."""

import hashlib
import hmac
import logging
import time
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import BillingRecord, BillingSubscription, User, utcnow
from app.paddle import PaddleClient

log = logging.getLogger("sipp.billing")

# Statuses that grant the subscribed plan (past_due only during the grace period).
LIVE = ("active", "trialing", "past_due")
# Plans Paddle may set or take away; internal plans (e.g. "max") are never touched.
MANAGED_PLANS = ("free", "basic", "plus")
_RANK = {"basic": 1, "plus": 2}


def verify_signature(raw: bytes, header: str | None, now: float | None = None) -> bool:
    """Paddle-Signature: ts=<unix>;h1=<hex hmac-sha256 of "ts:body">, several h1 during secret rotation."""
    s = get_settings()
    if not header or not s.paddle_webhook_secret:
        return False
    parts: dict[str, list[str]] = {}
    for item in header.split(";"):
        key, _, value = item.partition("=")
        parts.setdefault(key.strip(), []).append(value.strip())
    try:
        ts = int(parts["ts"][0])
    except (KeyError, ValueError):
        return False
    if abs((now if now is not None else time.time()) - ts) > s.billing_webhook_tolerance_seconds:
        return False
    expected = hmac.new(s.paddle_webhook_secret.encode(), f"{ts}:".encode() + raw, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, h) for h in parts.get("h1", []))


def parse_dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _aware(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=utcnow().tzinfo) if value is not None and value.tzinfo is None else value


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _plan_for(price_id: str | None) -> tuple[str, str] | None:
    for key, pid in get_settings().paddle_prices().items():
        if pid == price_id:
            return key
    return None


async def _owner(session: AsyncSession, custom_data: dict | None, customer_id: str | None) -> User | None:
    user_id = (custom_data or {}).get("user_id")
    if user_id:
        user = await session.get(User, user_id)
        if user is not None:
            return user
    if customer_id:
        return await session.scalar(select(User).where(User.billing_customer_id == customer_id))
    return None


async def live_subscription(session: AsyncSession, user_id: str) -> BillingSubscription | None:
    subs = (
        await session.scalars(
            select(BillingSubscription).where(
                BillingSubscription.user_id == user_id, BillingSubscription.status.in_(LIVE)
            )
        )
    ).all()
    return max(subs, key=lambda x: (_RANK.get(x.plan, 0), _aware(x.event_at) or utcnow()), default=None)


async def refresh_access(session: AsyncSession, user: User) -> None:
    """Sets user.plan / plan_expires_at from the user's best live subscription."""
    s = get_settings()
    if user.plan not in MANAGED_PLANS:
        return
    sub = await live_subscription(session, user.id)
    if sub is None:
        had_billing = await session.scalar(
            select(BillingSubscription.id).where(BillingSubscription.user_id == user.id).limit(1)
        )
        if had_billing:
            user.plan, user.plan_expires_at = "free", None
        return
    user.plan = sub.plan
    if sub.status == "past_due":
        user.plan_expires_at = (_aware(sub.past_due_since) or utcnow()) + timedelta(days=s.billing_grace_days)
    elif sub.current_period_end is not None:
        user.plan_expires_at = _aware(sub.current_period_end) + timedelta(hours=s.billing_period_slack_hours)
    else:
        user.plan_expires_at = utcnow() + timedelta(days=32)


async def apply_subscription(session: AsyncSession, data: dict, occurred_at: datetime) -> BillingSubscription | None:
    """Upserts a Paddle subscription entity; an older state never overwrites a newer one."""
    sub = await session.get(BillingSubscription, data["id"])
    if sub is not None and sub.event_at is not None and occurred_at <= _aware(sub.event_at):
        return sub
    items = data.get("items") or []
    plan = _plan_for(((items[0] if items else {}).get("price") or {}).get("id"))
    if plan is None:
        log.error("subscription %s has an unknown price, ignored", data["id"])
        return None
    user = await _owner(session, data.get("custom_data"), data.get("customer_id"))
    if sub is None:
        sub = BillingSubscription(id=data["id"])
        session.add(sub)
    elif user is None and sub.user_id is not None:
        user = await session.get(User, sub.user_id)
    status = data["status"]
    sub.plan, sub.interval = plan
    sub.status = status
    sub.customer_id = data.get("customer_id")
    sub.current_period_end = parse_dt((data.get("current_billing_period") or {}).get("ends_at"))
    sub.cancel_at_period_end = (data.get("scheduled_change") or {}).get("action") == "cancel"
    sub.past_due_since = (_aware(sub.past_due_since) or occurred_at) if status == "past_due" else None
    sub.event_at = occurred_at
    if user is not None:
        if sub.user_id is None:
            sub.user_id = user.id
        other = await live_subscription(session, user.id)
        if status in LIVE and other is not None and other.id != sub.id:
            log.error("user %s has two live subscriptions (%s, %s): refund one", user.id, other.id, sub.id)
        user.billing_customer_id = user.billing_customer_id or sub.customer_id
        await session.flush()
        await refresh_access(session, user)
    else:
        log.error("subscription %s has no known owner", sub.id)
    return sub


async def _record(session: AsyncSession, kind: str, data: dict, occurred_at: datetime) -> BillingRecord | None:
    rec = await session.get(BillingRecord, data["id"])
    if rec is not None and rec.occurred_at is not None and occurred_at <= _aware(rec.occurred_at):
        return rec
    user = await _owner(session, data.get("custom_data"), data.get("customer_id"))
    if rec is None:
        rec = BillingRecord(id=data["id"], kind=kind)
        session.add(rec)
    totals = (data.get("details") or {}).get("totals") if kind == "transaction" else data.get("totals")
    totals = totals or {}
    rec.user_id = user.id if user is not None else rec.user_id
    rec.subscription_id = data.get("subscription_id")
    rec.transaction_id = data.get("transaction_id")
    rec.action = data.get("action")
    rec.status = data["status"]
    rec.total, rec.tax = _int(totals.get("total")), _int(totals.get("tax"))
    rec.currency = totals.get("currency_code") or data.get("currency_code")
    rec.invoice_number = data.get("invoice_number")
    rec.occurred_at = occurred_at
    if kind == "transaction" and user is not None:
        user.billing_customer_id = user.billing_customer_id or data.get("customer_id")
        # The checkout transaction carries the owner; link a subscription that arrived without one.
        sub = await session.get(BillingSubscription, data["subscription_id"]) if data.get("subscription_id") else None
        if sub is not None and sub.user_id is None:
            sub.user_id = user.id
            await session.flush()
            await refresh_access(session, user)
    if kind == "adjustment" and rec.action == "chargeback":
        log.error("chargeback %s on transaction %s (user %s)", rec.id, rec.transaction_id, rec.user_id)
    return rec


async def handle_event(session: AsyncSession, event: dict) -> None:
    kind, _, _ = event["event_type"].partition(".")
    occurred_at = parse_dt(event.get("occurred_at")) or utcnow()
    data = event["data"]
    if kind == "subscription":
        await apply_subscription(session, data, occurred_at)
    elif kind == "transaction":
        await _record(session, "transaction", data, occurred_at)
    elif kind == "adjustment":
        await _record(session, "adjustment", data, occurred_at)


async def reconcile(session: AsyncSession, paddle: PaddleClient, stale_hours: int = 20) -> int:
    """Re-reads from Paddle the live subscriptions not updated lately (missed webhooks)."""
    cutoff = utcnow() - timedelta(hours=stale_hours)
    ids = (
        await session.scalars(
            select(BillingSubscription.id).where(
                BillingSubscription.status.in_(LIVE), BillingSubscription.updated_at < cutoff
            )
        )
    ).all()
    for sub_id in ids:
        data = await paddle.get_subscription(sub_id)
        await apply_subscription(session, data, utcnow())
        await session.commit()
    return len(ids)
