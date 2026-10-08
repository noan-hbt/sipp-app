import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select, update

from app.config import get_settings
from app.db import SessionLocal
from app.llm.client import CallRecord, Completion, LLMError
from app.llm.record import make_llm
from app.models import LLMCall, Sip, User, utcnow
from app.pipeline.schemas import HelpAnswer, LearningProfile
from app.quota import check_cost, finish_call, lock_user, reserve_call, usage
from tests.fakes import PROFILE, FakeClient


async def new_user(email="quota@example.com"):
    async with SessionLocal() as s:
        user = User(email=email, password_hash="unused")
        s.add(user)
        await s.commit()
        return user


async def reserve(user, stage="interpretation"):
    async with SessionLocal() as s:
        call = await reserve_call(s, user.id, stage, "model")
        await s.commit()
        return call


async def finish(call, completion=None, error=None):
    async with SessionLocal() as s:
        await finish_call(s, call.id, CallRecord(call.stage, call.model, 1, error is None, completion, error))
        await s.commit()


async def test_spending_survives_sip_deletion_and_ignores_unattributed_calls():
    user = await new_user()
    async with SessionLocal() as s:
        sip = Sip(user_id=user.id, input_text="topic")
        s.add(sip)
        await s.flush()
        s.add_all([
            LLMCall(stage="writing", model="m", user_id=user.id, sip_id=sip.id, cost=0.2),
            LLMCall(stage="writing", model="m", sip_id=sip.id, cost=0.3),
        ])
        await s.commit()
        await s.execute(delete(Sip).where(Sip.id == sip.id))
        await s.commit()
        assert (await usage(s, user))["cost_last_24h_usd"] == 0.2


async def test_make_llm_derives_owner_from_sip():
    user = await new_user()
    async with SessionLocal() as s:
        sip = Sip(user_id=user.id, input_text="topic")
        s.add(sip)
        await s.commit()
    await make_llm(FakeClient(), sip_id=sip.id).generate("interpretation", "system", "user", LearningProfile)
    async with SessionLocal() as s:
        call = (await s.execute(select(LLMCall))).scalar_one()
        assert call.user_id == user.id and call.reserved_until is None and call.ok
    fake = FakeClient()
    with pytest.raises(ValueError, match="require"):
        await make_llm(fake).generate("interpretation", "system", "user", LearningProfile)
    assert fake.calls == []


async def test_concurrent_help_reservations_allow_only_last_place(monkeypatch):
    monkeypatch.setattr(get_settings(), "max_help_per_day", 1)
    user = await new_user()
    results = await asyncio.gather(reserve(user, "help"), reserve(user, "help"), return_exceptions=True)
    calls = [r for r in results if isinstance(r, LLMCall)]
    rejected = [r for r in results if isinstance(r, HTTPException)]
    assert len(calls) == len(rejected) == 1
    assert rejected[0].detail["code"] == "help_limit"
    await finish(calls[0], Completion("{}", "model", cost=0.01))
    with pytest.raises(HTTPException) as caught:
        await reserve(user, "help")
    assert caught.value.detail["code"] == "help_limit"


async def test_global_budget_is_reserved_across_users_and_survives_account_deletion(monkeypatch):
    monkeypatch.setattr(get_settings(), "max_global_cost_per_day_usd", 0.05)
    users = [await new_user("first@example.com"), await new_user("second@example.com")]
    results = await asyncio.gather(*(reserve(user) for user in users), return_exceptions=True)
    calls = [r for r in results if isinstance(r, LLMCall)]
    rejected = [r for r in results if isinstance(r, HTTPException)]
    assert len(calls) == len(rejected) == 1
    assert rejected[0].detail["code"] == "global_daily_budget_reached"
    await finish(calls[0], Completion("{}", "model", cost=0.05))
    async with SessionLocal() as s:
        await s.execute(delete(User).where(User.id == calls[0].user_id))
        await s.commit()
        other = next(u for u in users if u.id != calls[0].user_id)
        with pytest.raises(HTTPException) as caught:
            await check_cost(s, other)
        assert caught.value.detail["code"] == "global_daily_budget_reached"


async def test_concurrency_limit_releases_after_finalization(monkeypatch):
    monkeypatch.setattr(get_settings(), "llm_max_concurrent_per_user", 1)
    user = await new_user()
    first = await reserve(user)
    with pytest.raises(HTTPException) as caught:
        await reserve(user)
    assert caught.value.detail["code"] == "llm_concurrency_limit"
    await finish(first, Completion("{}", "model", cost=0.01))
    assert (await reserve(user)).id != first.id


async def test_validation_retry_cannot_exceed_reserved_budget(monkeypatch):
    monkeypatch.setattr(get_settings(), "max_cost_per_day_usd", 0.06)
    user = await new_user()

    class Invalid:
        calls = 0

        async def complete(self, model, messages, schema_name, schema):
            self.calls += 1
            return Completion("invalid JSON", model, cost=0.03)

    fake = Invalid()
    with pytest.raises(HTTPException) as caught:
        await make_llm(fake, user_id=user.id).generate("interpretation", "system", "user", LearningProfile)
    assert caught.value.detail["code"] == "daily_budget_reached" and fake.calls == 1
    async with SessionLocal() as s:
        call = (await s.execute(select(LLMCall))).scalar_one()
        assert call.cost == 0.03 and not call.ok and call.reserved_until is None


async def test_provider_failure_retains_unknown_cost_and_blocks_escalation(monkeypatch):
    monkeypatch.setattr(get_settings(), "max_cost_per_day_usd", 0.06)
    user = await new_user()
    fake = FakeClient({"LearningProfile": [LLMError("transport failed"), PROFILE]})
    with pytest.raises(HTTPException) as caught:
        await make_llm(fake, user_id=user.id).generate("interpretation", "system", "user", LearningProfile)
    assert caught.value.detail["code"] == "daily_budget_reached" and len(fake.calls) == 1
    async with SessionLocal() as s:
        call = (await s.execute(select(LLMCall))).scalar_one()
        assert call.cost == 0.05 and call.reserved_until is None


async def test_cancellation_releases_help_and_concurrency_but_preserves_unknown_cost(monkeypatch):
    monkeypatch.setattr(get_settings(), "max_help_per_day", 1)
    monkeypatch.setattr(get_settings(), "llm_max_concurrent_per_user", 1)
    user = await new_user()
    started = asyncio.Event()

    class Waiting:
        async def complete(self, *args):
            started.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(make_llm(Waiting(), user_id=user.id).generate("help", "system", "user", HelpAnswer))
    await asyncio.wait_for(started.wait(), 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    async with SessionLocal() as s:
        call = (await s.execute(select(LLMCall))).scalar_one()
        assert call.cost == 0.05 and not call.ok and call.reserved_until is None
    assert (await reserve(user, "help")).id != call.id


async def test_expired_reservations_release_concurrency_but_keep_spending(monkeypatch):
    monkeypatch.setattr(get_settings(), "llm_max_concurrent_per_user", 1)
    user = await new_user()
    first = await reserve(user)
    async with SessionLocal() as s:
        await s.execute(update(LLMCall).where(LLMCall.id == first.id).values(reserved_until=utcnow() - timedelta(seconds=1)))
        await s.commit()
        assert (await usage(s, user))["cost_last_24h_usd"] == 0.05
    assert (await reserve(user)).id != first.id


async def test_financial_record_errors_propagate(monkeypatch):
    import app.llm.record as record

    user = await new_user()

    async def fail(*args):
        raise RuntimeError("write failed")

    monkeypatch.setattr(record, "finish_call", fail)
    with pytest.raises(RuntimeError, match="write failed"):
        await make_llm(FakeClient(), user_id=user.id).generate("interpretation", "system", "user", LearningProfile)
    async with SessionLocal() as s:
        call = (await s.execute(select(LLMCall))).scalar_one()
        assert call.cost == 0.05 and call.reserved_until is not None


async def test_cancellation_during_finalization_waits_for_cost_record(monkeypatch):
    import app.llm.record as record

    user = await new_user()
    started, proceed = asyncio.Event(), asyncio.Event()
    original = record.finish_call

    async def waiting(*args):
        started.set()
        await proceed.wait()
        await original(*args)

    monkeypatch.setattr(record, "finish_call", waiting)
    task = asyncio.create_task(make_llm(FakeClient(), user_id=user.id).generate("interpretation", "system", "user", LearningProfile))
    await asyncio.wait_for(started.wait(), 2)
    task.cancel()
    proceed.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    async with SessionLocal() as s:
        call = (await s.execute(select(LLMCall))).scalar_one()
        assert call.ok and call.cost == 0.001 and call.reserved_until is None


async def test_lock_user_refreshes_stale_monthly_counter():
    user = await new_user()
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == user.id).values(gen_count=2))
        await s.commit()
    async with SessionLocal() as s:
        stale = await s.merge(user, load=False)
        assert stale.gen_count == 0
        assert (await lock_user(s, stale)).gen_count == 2
