"""Rolling 24h spending guards, including calls still in flight."""

from datetime import timedelta
from math import isfinite

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import BudgetLock, LLMCall, Sip, User, utcnow


async def lock_user(session: AsyncSession, user: User) -> User:
    await session.execute(
        update(User).where(User.id == user.id).values(gen_count=User.gen_count)
        .execution_options(synchronize_session=False)
    )
    return (await session.execute(
        select(User).where(User.id == user.id).execution_options(populate_existing=True)
    )).scalar_one()


async def _lock_budget(session: AsyncSession) -> None:
    insert = sqlite_insert if session.get_bind().dialect.name == "sqlite" else pg_insert
    await session.execute(insert(BudgetLock).values(id=1).on_conflict_do_nothing(index_elements=["id"]))
    await session.execute(update(BudgetLock).where(BudgetLock.id == 1).values(id=BudgetLock.id))


async def _cost(session: AsyncSession, user_id: str | None = None) -> float:
    now = utcnow()
    q = select(func.coalesce(func.sum(LLMCall.cost), 0.0)).where(
        or_(LLMCall.created_at >= now - timedelta(hours=24), LLMCall.reserved_until > now)
    )
    if user_id is not None:
        q = q.where(LLMCall.user_id == user_id)
    return float(await session.scalar(q) or 0)


def _limit(code: str, message: str) -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, {"code": code, "message": message})


async def _check_budget(session: AsyncSession, user_id: str) -> None:
    s = get_settings()
    amount = s.llm_reservation_cost_usd
    if await _cost(session, user_id) + amount > s.max_cost_per_day_usd:
        raise _limit("daily_budget_reached", "daily generation budget reached, retry later")
    if await _cost(session) + amount > s.max_global_cost_per_day_usd:
        raise _limit("global_daily_budget_reached", "daily generation budget reached, retry later")


async def reserve_call(
    session: AsyncSession, user_id: str, stage: str, model: str,
    sip_id: str | None = None, lesson_id: str | None = None,
) -> LLMCall:
    s = get_settings()
    await _lock_budget(session)
    if not await session.get(User, user_id):
        raise ValueError("LLM calls require an existing user")
    await _check_budget(session, user_id)
    now = utcnow()
    active = await session.scalar(select(func.count()).select_from(LLMCall).where(
        LLMCall.user_id == user_id, LLMCall.reserved_until > now
    ))
    if (active or 0) >= s.llm_max_concurrent_per_user:
        raise _limit("llm_concurrency_limit", "too many simultaneous generations, retry later")
    if stage == "help":
        used = await session.scalar(select(func.count()).select_from(LLMCall).where(
            LLMCall.user_id == user_id, LLMCall.stage == "help",
            LLMCall.created_at >= now - timedelta(hours=24),
            or_(LLMCall.ok.is_(True), LLMCall.reserved_until > now),
        ))
        if (used or 0) >= s.max_help_per_day:
            raise _limit("help_limit", "help used a lot today, retry tomorrow")
    call = LLMCall(
        stage=stage, model=model, user_id=user_id, sip_id=sip_id, lesson_id=lesson_id,
        cost=s.llm_reservation_cost_usd, ok=False,
        reserved_until=now + timedelta(seconds=s.llm_timeout_seconds * 3 + 40),
    )
    session.add(call)
    await session.flush()
    return call


async def finish_call(session: AsyncSession, call_id: str, rec) -> None:
    await _lock_budget(session)
    call = await session.get(LLMCall, call_id)
    if call is None:
        raise ValueError("LLM reservation missing")
    c = rec.completion
    call.model = c.model if c else rec.model
    call.prompt_tokens = c.prompt_tokens if c else None
    call.completion_tokens = c.completion_tokens if c else None
    if c is not None and c.cost is not None and isfinite(c.cost) and c.cost >= 0:
        call.cost = c.cost
    call.latency_ms = rec.latency_ms
    call.ok = rec.ok
    call.error = rec.error[:4000] if rec.error else None
    call.reserved_until = None


async def usage(session: AsyncSession, user: User) -> dict:
    s = get_settings()
    since = utcnow() - timedelta(hours=24)
    sips = await session.scalar(
        select(func.count()).select_from(Sip).where(Sip.user_id == user.id, Sip.created_at >= since)
    )
    cost = await _cost(session, user.id)
    return {
        "sips_last_24h": sips or 0,
        "cost_last_24h_usd": round(float(cost or 0), 4),
        "max_cost_per_day_usd": s.max_cost_per_day_usd,
    }


async def check_cost(session: AsyncSession, user: User) -> dict:
    await _check_budget(session, user.id)
    return await usage(session, user)
