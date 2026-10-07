"""Plans: library slots, monthly Sip generations, free trial."""

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Program, Sip, SipStatus, User, utcnow


def effective_plan(user: User) -> str:
    s = get_settings()
    exp = user.plan_expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=utcnow().tzinfo)
    if user.plan not in s.plans or (exp is not None and exp <= utcnow()):
        return "free"
    return user.plan


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
    programs = await session.scalar(select(func.count()).select_from(Program).where(Program.user_id == user.id))
    used = (standalone or 0) + (programs or 0)
    this_month = user.gen_count if user.gen_month == _month() else 0
    on_trial = user.trial_started_at is not None and name == s.trial_plan and user.plan_expires_at is not None
    return {
        "plan": name,
        "on_trial": on_trial,
        "plan_expires_at": user.plan_expires_at if name != "free" else None,
        "trial_available": user.trial_started_at is None,
        "trial_days": s.trial_days,
        "slots": limits["slots"],
        "slots_used": used or 0,
        "sips_per_month": limits["sips_per_month"],
        "sips_this_month": this_month or 0,
        "lite": bool(limits["lite"]),
    }


async def check_plan(session: AsyncSession, user: User, new_slot: bool = True) -> dict:
    """`new_slot=False` for a chapter of an existing program: only the monthly count applies."""
    p = await plan_status(session, user)
    if new_slot and p["slots_used"] >= p["slots"]:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            {"code": "no_free_slot", "message": "library is full: delete a Sip or upgrade"},
        )
    if p["sips_this_month"] >= p["sips_per_month"]:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            {"code": "monthly_limit", "message": "monthly generations used up"},
        )
    return p


def start_trial(user: User) -> None:
    s = get_settings()
    if user.trial_started_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "trial_used", "message": "trial already used"})
    now = utcnow()
    user.trial_started_at = now
    user.plan = s.trial_plan
    user.plan_expires_at = now + timedelta(days=s.trial_days)
