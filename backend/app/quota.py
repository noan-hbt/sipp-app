"""Per-user spending guard (rolling 24h cost). Sip counts are limited by plans."""

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import LLMCall, Sip, User, utcnow


async def usage(session: AsyncSession, user: User) -> dict:
    s = get_settings()
    since = utcnow() - timedelta(hours=24)
    sips = await session.scalar(
        select(func.count()).select_from(Sip).where(Sip.user_id == user.id, Sip.created_at >= since)
    )
    # Sip builds and lessons are billed through their Sip; previews and help carry the user.
    cost = await session.scalar(
        select(func.coalesce(func.sum(LLMCall.cost), 0.0))
        .outerjoin(Sip, Sip.id == LLMCall.sip_id)
        .where(or_(Sip.user_id == user.id, LLMCall.user_id == user.id), LLMCall.created_at >= since)
    )
    return {
        "sips_last_24h": sips or 0,
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
