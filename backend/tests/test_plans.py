import asyncio
from datetime import timedelta

from sqlalchemy import func, select, update

from app.config import get_settings
from app.db import SessionLocal
from app.models import Job, Sip, User, utcnow


async def _set_plan(plan: str, expires=None):
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan=plan, plan_expires_at=expires))
        await s.commit()


async def test_free_plan_slot_and_lite(auth_client):
    await _set_plan("free")
    p = (await auth_client.get("/auth/me/plan")).json()
    assert p["plan"] == "free" and p["slots"] == 1 and p["lite"] and p["trial_available"]
    r = await auth_client.post("/sips", json={"input": "le café"})
    assert r.status_code == 202 and r.json()["lite"] is True
    r = await auth_client.post("/sips", json={"input": "la bière"})
    assert r.status_code == 402 and r.json()["detail"]["code"] == "no_free_slot"


async def test_monthly_limit_counts_deleted_slots(auth_client):
    await _set_plan("free")
    sid = (await auth_client.post("/sips", json={"input": "le café"})).json()["id"]
    await auth_client.delete(f"/sips/{sid}")
    # Deleting frees the slot, not the month's generation.
    r = await auth_client.post("/sips", json={"input": "le thé"})
    assert r.status_code == 402 and r.json()["detail"]["code"] == "monthly_limit"


async def test_trial_once_and_expiry(auth_client):
    await _set_plan("free")
    p = (await auth_client.post("/auth/me/trial")).json()
    assert p["plan"] == get_settings().trial_plan and p["on_trial"] and not p["trial_available"]
    assert (await auth_client.post("/auth/me/trial")).status_code == 409
    r = await auth_client.post("/sips", json={"input": "le café"})
    assert r.json()["lite"] is False
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan_expires_at=utcnow() - timedelta(minutes=1)))
        await s.commit()
    p = (await auth_client.get("/auth/me/plan")).json()
    assert p["plan"] == "free" and not p["on_trial"]


async def test_export(auth_client):
    await auth_client.post("/sips", json={"input": "le café"})
    data = (await auth_client.get("/auth/me/export")).json()
    assert data["account"]["email"] == "a@b.co" and data["sips"][0]["request"] == "le café"


async def test_public_plans(client):
    plans = (await client.get("/auth/plans")).json()
    assert [p["name"] for p in plans] == ["free", "basic", "plus"]
    assert plans[0] == {"name": "free", "slots": 1, "sips_per_month": 1, "lite": True}


async def test_concurrent_creations_reserve_last_slot(auth_client):
    await _set_plan("free")
    responses = await asyncio.gather(
        auth_client.post("/sips", json={"input": "le café"}),
        auth_client.post("/sips", json={"input": "la bière"}),
    )
    assert sorted(r.status_code for r in responses) == [202, 402]
    plan = (await auth_client.get("/auth/me/plan")).json()
    assert plan["slots_used"] == plan["sips_this_month"] == 1
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Job)) == 1


async def test_concurrent_creations_limit_active_builds(auth_client):
    responses = await asyncio.gather(
        *(auth_client.post("/sips", json={"input": f"Sujet {i}"}) for i in range(4))
    )
    assert sorted(r.status_code for r in responses) == [202, 202, 202, 429]
    rejected = next(r for r in responses if r.status_code == 429)
    assert rejected.json()["detail"]["code"] == "too_many_active_builds"
    assert (await auth_client.get("/auth/me/plan")).json()["sips_this_month"] == 3


async def test_retry_requires_free_slot_without_monthly_charge(auth_client):
    await _set_plan("free")
    async with SessionLocal() as s:
        user = await s.scalar(select(User))
        user.gen_month, user.gen_count = utcnow().strftime("%Y-%m"), 1
        failed = Sip(user_id=user.id, input_text="le café", status="failed")
        ready = Sip(user_id=user.id, input_text="le thé", status="ready")
        s.add_all([failed, ready])
        await s.commit()
        failed_id, ready_id = failed.id, ready.id

    r = await auth_client.post(f"/sips/{failed_id}/retry")
    assert r.status_code == 402 and r.json()["detail"]["code"] == "no_free_slot"
    assert (await auth_client.get("/auth/me/plan")).json()["slots_used"] == 1
    await auth_client.delete(f"/sips/{ready_id}")
    r = await auth_client.post(f"/sips/{failed_id}/retry")
    assert r.status_code == 202, r.text
    plan = (await auth_client.get("/auth/me/plan")).json()
    assert plan["slots_used"] == plan["sips_this_month"] == 1


async def test_retry_checks_active_build_limit(auth_client):
    async with SessionLocal() as s:
        user_id = await s.scalar(select(User.id))
        failed = Sip(user_id=user_id, input_text="le café", status="failed")
        s.add(failed)
        s.add_all(Sip(user_id=user_id, input_text=f"Sujet {i}") for i in range(3))
        await s.commit()
        failed_id = failed.id
    r = await auth_client.post(f"/sips/{failed_id}/retry")
    assert r.status_code == 429 and r.json()["detail"]["code"] == "too_many_active_builds"
    async with SessionLocal() as s:
        assert (await s.get(Sip, failed_id)).status == "failed"
        assert await s.scalar(select(func.count()).select_from(Job)) == 0
