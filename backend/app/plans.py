"""Plans: library slots, monthly Sip generations."""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing import ever_subscribed, live_subscription
from app.config import get_settings
from app.models import Program, ProgramStatus, Sip, SipStatus, User, utcnow


MAX_ACTIVE_BUILDS = 3


async def check_active_builds(session: AsyncSession, user: User) -> None:
    active = await session.scalar(
        select(func.count())
        .select_from(Sip)
        .where(Sip.user_id == user.id, Sip.status.in_([SipStatus.QUEUED, SipStatus.GENERATING]))
    )
    if active >= MAX_ACTIVE_BUILDS:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"code": "too_many_active_builds", "message": "too many sips being generated"},
        )


def effective_plan(user: User) -> str:
    s = get_settings()
    exp = user.plan_expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=utcnow().tzinfo)
    if user.plan not in s.plans or (exp is not None and exp <= utcnow()):
        return "free"
    return user.plan


FREE_FEATURES = {"audio": False, "quiz": False, "notes": 10, "help_per_day": 5}


def features(user: User) -> dict:
    """What the user's current plan unlocks (an unknown plan gets the free set)."""
    return {**FREE_FEATURES, **get_settings().plan_features.get(effective_plan(user), {})}


def require_feature(user: User, name: str) -> None:
    if not features(user)[name]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {"code": "plan_feature", "message": f"{name} is not included in this plan", "feature": name},
        )


def _month() -> str:
    return utcnow().strftime("%Y-%m")


def count_generation(user: User) -> None:
    month = _month()
    if user.gen_month != month:
        user.gen_month, user.gen_count = month, 0
    user.gen_count += 1


async def plan_status(session: AsyncSession, user: User) -> dict:
    s = get_settings()
    name = effective_plan(user)
    limits = s.plans[name]
    # A slot holds a standalone Sip or a whole program; failed builds never take one.
    standalone = await session.scalar(
        select(func.count())
        .select_from(Sip)
        .where(Sip.user_id == user.id, Sip.program_id.is_(None), Sip.status != SipStatus.FAILED)
    )
    programs = await session.scalar(
        select(func.count()).select_from(Program).where(Program.user_id == user.id, Program.status != ProgramStatus.FAILED)
    )
    used = (standalone or 0) + (programs or 0)
    this_month = user.gen_count if user.gen_month == _month() else 0
    sub = await live_subscription(session, user.id) if name != "free" else None
    # Apple grants the introductory trial once per Apple ID; never offered again after any subscription here.
    trial_available = (
        s.billing_enabled and name == "free" and user.trial_started_at is None
        and not await ever_subscribed(session, user.id)
    )
    return {
        "billing_enabled": s.billing_enabled,
        "subscription": None if sub is None else {
            "status": sub.status,
            "interval": sub.interval,
            "current_period_end": sub.current_period_end,
            "cancel_at_period_end": sub.cancel_at_period_end,
        },
        "plan": name,
        "on_trial": sub is not None and sub.status == "trialing",
        "plan_expires_at": user.plan_expires_at if name != "free" else None,
        "trial_available": trial_available,
        "trial_days": s.trial_days,
        "slots": limits["slots"],
        "slots_used": used or 0,
        "sips_per_month": limits["sips_per_month"],
        "sips_this_month": this_month or 0,
        "lite": bool(limits["lite"]),
        "features": features(user),
    }


async def check_plan(session: AsyncSession, user: User, new_slot: bool = True, monthly: bool = True) -> dict:
    """Chapters reuse a slot; retries reuse their monthly generation."""
    p = await plan_status(session, user)
    if new_slot and p["slots_used"] >= p["slots"]:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            {"code": "no_free_slot", "message": "library is full: delete a Sip or upgrade"},
        )
    if monthly and p["sips_this_month"] >= p["sips_per_month"]:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            {"code": "monthly_limit", "message": "monthly generations used up"},
        )
    return p

