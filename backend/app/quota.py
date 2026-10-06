"""Per-user spending guards (rolling 24h window)."""

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import LLMCall, Sip, User, utcnow


async def usage(session: AsyncSession, user: User) -> dict:
    s = get_settings()
    since = utcnow() - timedelta(hours=24)
    sips = await session.scalar(
        select(func.count()).select_from(Sip).where(Sip.user_id == user.id, Sip.created_at >= since)
    )
    cost = await session.scalar(
        select(func.coalesce(func.sum(LLMCall.cost), 0.0))
        .join(Sip, Sip.id == LLMCall.sip_id)
        .where(Sip.user_id == user.id, LLMCall.created_at >= since)
    )
    return {
        "sips_last_24h": sips or 0,
        "max_sips_per_day": s.max_sips_per_day,
        "cost_last_24h_usd": round(float(cost or 0), 4),
        "max_cost_per_day_usd": s.max_cost_per_day_usd,
    }


async def check_cost(session: AsyncSession, user: User) -> dict:
    u = await usage(session, user)
    if u["cost_last_24h_usd"] >= u["max_cost_per_day_usd"]:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"code": "daily_budget_reached", "message": "daily generation budget reached, retry later"},
        )
    return u


async def check_new_sip(session: AsyncSession, user: User) -> None:
    u = await check_cost(session, user)
    if u["sips_last_24h"] >= u["max_sips_per_day"]:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"code": "daily_sip_limit", "message": f"max {u['max_sips_per_day']} new sips per 24h"},
        )
