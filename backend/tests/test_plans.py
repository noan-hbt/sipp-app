from datetime import timedelta

from sqlalchemy import update

from app.config import get_settings
from app.db import SessionLocal
from app.models import Sip, User, utcnow


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
