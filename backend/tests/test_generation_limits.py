import pytest
from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import ConceptCard, Job, Lesson, LLMCall, Module, Program, Sip, User


async def _lessons(*, program=False, pending=True, spent=True):
    async with SessionLocal() as s:
        user_id = await s.scalar(select(User.id))
        parent = None
        if program:
            parent = Program(user_id=user_id, roadmap=[{}, {}])
            s.add(parent)
            await s.flush()
        sip = Sip(
            user_id=user_id,
            input_text="les taux",
            status="ready",
            program_id=parent.id if parent else None,
            chapter=1 if parent else None,
        )
        s.add(sip)
        await s.flush()
        module = Module(sip_id=sip.id, position=1, title="Bases", role="core")
        s.add(module)
        await s.flush()
        lessons = [
            Lesson(
                sip_id=sip.id,
                module_id=module.id,
                position=i + 1,
                global_index=i,
                key=f"M1L{i + 1}",
                title="Les taux",
                objective="Comprendre un taux",
                status="ready" if i == 0 else "pending",
                blocks=[{"type": "concept", "name": "Taux", "definition": "Un rapport"}] if i == 0 else None,
            )
            for i in range(2 if pending else 1)
        ]
        s.add_all(lessons)
        if spent:
            s.add(LLMCall(user_id=user_id, sip_id=sip.id, stage="draft", model="test", cost=get_settings().max_cost_per_day_usd + 1))
        await s.commit()
        return sip.id, [l.id for l in lessons], parent.id if parent else None


async def test_retry_rejects_exhausted_budget(auth_client):
    async with SessionLocal() as s:
        user_id = await s.scalar(select(User.id))
        sip = Sip(user_id=user_id, input_text="les taux", status="failed", error="failed")
        s.add(sip)
        s.add(LLMCall(user_id=user_id, stage="draft", model="test", cost=get_settings().max_cost_per_day_usd + 1))
        await s.commit()
        sip_id = sip.id
    r = await auth_client.post(f"/sips/{sip_id}/retry")
    assert r.status_code == 429 and r.json()["detail"]["code"] == "daily_budget_reached"
    async with SessionLocal() as s:
        sip = await s.get(Sip, sip_id)
        assert sip.status == "failed" and sip.error == "failed"
        assert await s.scalar(select(func.count()).select_from(Job)) == 0


async def test_completion_saves_progress_when_prefetch_budget_rejected(auth_client):
    _, lessons, _ = await _lessons()
    answers = [{"block": 0, "choice": "a"}]
    r = await auth_client.post(f"/lessons/{lessons[0]}/complete", json={"answers": answers})
    assert r.status_code == 200, r.text
    assert r.json()["progress"] == {"completed": 1, "total": 2}
    assert r.json()["stars"] == 3
    async with SessionLocal() as s:
        first, second = await s.get(Lesson, lessons[0]), await s.get(Lesson, lessons[1])
        assert first.completed_at is not None and first.answers == answers and first.stars == 3
        assert second.status == "pending"
        assert await s.scalar(select(func.count()).select_from(Job)) == 0
        assert await s.scalar(select(func.count()).select_from(ConceptCard)) == 1


async def test_completion_saves_progress_when_adjustment_budget_rejected(auth_client):
    sip_id, lessons, program_id = await _lessons(program=True, pending=False)
    r = await auth_client.post(f"/lessons/{lessons[0]}/complete", json={"answers": []})
    assert r.status_code == 200, r.text
    assert r.json()["progress"] == {"completed": 1, "total": 1}
    async with SessionLocal() as s:
        assert (await s.get(Lesson, lessons[0])).completed_at is not None
        assert (await s.get(Program, program_id)).status == "ready"
        assert not (await s.get(Sip, sip_id)).adjustment_queued
        assert await s.scalar(select(func.count()).select_from(Job)) == 0


async def test_replayed_completion_does_not_enqueue_another_adjustment(auth_client):
    sip_id, lessons, program_id = await _lessons(program=True, pending=False, spent=False)
    for _ in range(3):
        r = await auth_client.post(f"/lessons/{lessons[0]}/complete", json={"answers": []})
        assert r.status_code == 200, r.text
        async with SessionLocal() as s:
            program = await s.get(Program, program_id)
            program.status = "ready"
            await s.commit()
    async with SessionLocal() as s:
        assert (await s.get(Sip, sip_id)).adjustment_queued
        assert await s.scalar(select(func.count()).select_from(Job)) == 1
        assert await s.scalar(select(func.count()).select_from(ConceptCard)) == 1


@pytest.mark.parametrize("endpoint", ["/sips", "/sips/interpret"])
@pytest.mark.parametrize("text", ["   ", " \n\t ", "  ab  "])
async def test_blank_or_short_normalized_input_is_rejected(auth_client, endpoint, text):
    r = await auth_client.post(endpoint, json={"input": text})
    assert r.status_code == 422
    async with SessionLocal() as s:
        assert (await s.scalar(select(User))).gen_count == 0
        assert await s.scalar(select(func.count()).select_from(Job)) == 0
        assert await s.scalar(select(func.count()).select_from(LLMCall)) == 0


async def test_create_normalizes_input_before_storage(auth_client):
    r = await auth_client.post("/sips", json={"input": "  les taux \n"})
    assert r.status_code == 202, r.text
    assert r.json()["input_text"] == "les taux"
