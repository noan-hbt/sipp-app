from sqlalchemy import func, select

from app.api.assist import chat_client
from app.db import SessionLocal
from app.llm.client import LLMError
from app.main import app
from app.models import LLMCall
from tests.fakes import PROFILE, FakeClient
from tests.test_flow import drain


def use(fake):
    app.dependency_overrides[chat_client] = lambda: fake
    return fake


async def test_interpret_then_create_with_edited_profile(auth_client):
    fake = use(FakeClient())
    try:
        r = await auth_client.post("/sips/interpret", json={"input": "Je veux comprendre les taux"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    out = r.json()
    assert out["profile"]["title"] == "Comprendre les taux" and out["profile"]["out_of_scope"] == []
    assert (out["lessons_min"], out["lessons_max"], out["program"]) == (10, 25, False)
    async with SessionLocal() as s:
        call = (await s.execute(select(LLMCall))).scalar_one()
        assert call.stage == "interpretation" and call.user_id and call.sip_id is None

    profile = {**out["profile"], "current_level": "intermediate", "out_of_scope": ["Histoire des banques"]}
    sip_id = (await auth_client.post("/sips", json={"input": "Je veux comprendre les taux", "profile": profile})).json()["id"]
    worker = FakeClient()
    await drain(worker)
    sip = (await auth_client.get(f"/sips/{sip_id}")).json()
    assert sip["status"] == "ready"
    assert sip["profile"]["current_level"] == "intermediate"
    assert "LearningProfile" not in [name for name, _ in worker.calls]  # interpretation skipped
    assert len(fake.calls) == 1


async def test_create_rejects_invalid_profile(auth_client):
    r = await auth_client.post("/sips", json={"input": "taux", "profile": {"topic": "x"}})
    assert r.status_code == 422
    r = await auth_client.post("/sips", json={"input": "taux", "profile": {**PROFILE, "context": "x" * 9000}})
    assert r.status_code == 422


async def test_interpret_provider_down(auth_client):
    use(FakeClient({"LearningProfile": [LLMError("down")] * 4}))
    try:
        r = await auth_client.post("/sips/interpret", json={"input": "taux"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 503 and r.json()["detail"]["code"] == "llm_unavailable"


async def test_help_on_a_block(auth_client):
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(FakeClient())
    lesson_id = (await auth_client.get(f"/sips/{sip_id}")).json()["modules"][0]["lessons"][0]["id"]
    fake = use(FakeClient())
    try:
        r = await auth_client.post(f"/lessons/{lesson_id}/help", json={"block": 1, "kind": "simpler"})
        assert r.status_code == 200 and "loyer" in r.json()["answer"]
        assert (await auth_client.post(f"/lessons/{lesson_id}/help", json={"block": 99, "kind": "simpler"})).status_code == 422
        assert (await auth_client.post(f"/lessons/{lesson_id}/help", json={"block": 1, "kind": "question", "question": " "})).status_code == 422
        r = await auth_client.post(f"/lessons/{lesson_id}/help", json={"block": 1, "kind": "question", "question": "Pourquoi par an ?"})
        assert r.status_code == 200
    finally:
        app.dependency_overrides.clear()
    assert len(fake.calls) == 2
    async with SessionLocal() as s:
        n = await s.scalar(select(func.count()).select_from(LLMCall).where(LLMCall.stage == "help", LLMCall.lesson_id == lesson_id))
        assert n == 2


async def test_help_daily_limit(auth_client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_help_per_day", 1)
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(FakeClient())
    lesson_id = (await auth_client.get(f"/sips/{sip_id}")).json()["modules"][0]["lessons"][0]["id"]
    use(FakeClient())
    try:
        assert (await auth_client.post(f"/lessons/{lesson_id}/help", json={"block": 0, "kind": "example"})).status_code == 200
        r = await auth_client.post(f"/lessons/{lesson_id}/help", json={"block": 0, "kind": "example"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 429 and r.json()["detail"]["code"] == "help_limit"
