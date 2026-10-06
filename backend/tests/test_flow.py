from datetime import timedelta

from sqlalchemy import func, select, update

from app.db import SessionLocal
from app.jobs import worker
from app.models import Job, Lesson, LLMCall, utcnow
from app.pipeline.engine import build_lesson_context
from tests.fakes import REVIEW_REVISE, FakeClient


async def drain(client) -> int:
    n = 0
    while await worker.process_one(client):
        n += 1
    return n


async def lessons_of(c, sip_id):
    return [l for m in (await c.get(f"/sips/{sip_id}")).json()["modules"] for l in m["lessons"]]


async def test_end_to_end(auth_client, client):
    fake = FakeClient()
    r = await auth_client.post("/sips", json={"input": "Je veux comprendre les taux d'intérêt"})
    assert r.status_code == 202
    sip_id = r.json()["id"]

    await drain(fake)

    sip = (await auth_client.get(f"/sips/{sip_id}")).json()
    assert sip["status"] == "ready", sip["error"]
    assert sip["title"] == "Comprendre les taux"
    assert len(sip["modules"]) == 2
    lessons = [l for m in sip["modules"] for l in m["lessons"]]
    assert [l["key"] for l in lessons] == ["M1L1", "M1L2", "M2L1", "M2L2"]
    assert lessons[1]["prerequisites"] == ["M1L1"]  # invalid M9L9 dropped
    # first lesson generated + one prefetched, no cascade
    assert [l["status"] for l in lessons] == ["ready", "ready", "pending", "pending"]
    assert sip["progress"] == {"completed": 0, "total": 4}
    assert sip["next_lesson_id"] == lessons[0]["id"]

    l1 = (await auth_client.get(f"/lessons/{lessons[0]['id']}")).json()
    assert l1["blocks"][-1]["type"] == "recap"
    assert l1["next_lesson_id"] == lessons[1]["id"]

    # completing L1: L2 already ready -> L3 prefetched
    r = await auth_client.post(
        f"/lessons/{lessons[0]['id']}/complete", json={"answers": [{"block": 4, "choice": "a"}]}
    )
    assert r.json()["progress"] == {"completed": 1, "total": 4}
    await drain(fake)
    assert [l["status"] for l in await lessons_of(auth_client, sip_id)] == ["ready", "ready", "ready", "pending"]

    # opening a pending lesson queues it
    l4 = (await auth_client.get(f"/lessons/{lessons[3]['id']}")).json()
    assert l4["status"] == "queued" and l4["blocks"] is None
    await drain(fake)
    assert (await auth_client.get(f"/lessons/{lessons[3]['id']}")).json()["status"] == "ready"

    listed = (await auth_client.get("/sips")).json()
    assert listed[0]["progress"]["completed"] == 1

    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(LLMCall)) > 0

    # another user cannot see it
    other = await client.post("/auth/register", json={"email": "z@z.co", "password": "password123"})
    h = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.get(f"/sips/{sip_id}", headers=h)).status_code == 404
    assert (await client.get(f"/lessons/{lessons[0]['id']}", headers=h)).status_code == 404

    assert (await auth_client.delete(f"/sips/{sip_id}")).status_code == 204
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Lesson)) == 0


async def test_lesson_context_uses_previous_lessons(auth_client):
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(FakeClient())
    async with SessionLocal() as s:
        l2 = (
            await s.execute(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.key == "M1L2"))
        ).scalar_one()
        ctx, known = await build_lesson_context(s, l2)
    assert known == ["taux d'intérêt"]
    assert "PREREQUISITE LESSONS" in ctx and "Définition du taux d'intérêt." in ctx
    assert "PREVIOUS LESSON RECAP (M1L1)" in ctx


async def test_review_triggers_single_revision(auth_client):
    fake = FakeClient({"Review": [REVIEW_REVISE, REVIEW_REVISE]})
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(fake)
    async with SessionLocal() as s:
        l1 = (
            await s.execute(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.key == "M1L1"))
        ).scalar_one()
    assert l1.revisions == 1
    # L1 and L2 each: draft + one revision (never a second review/revision)
    assert [c for c, _ in fake.calls].count("LessonDraft") == 4
    assert [c for c, _ in fake.calls].count("Review") == 2


async def test_failure_retries_then_fails(auth_client):
    fake = FakeClient({"LearningProfile": [{"nope": 1}] * 20})
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    for _ in range(3):
        async with SessionLocal() as s:  # make retries immediate
            await s.execute(update(Job).values(run_after=utcnow() - timedelta(minutes=1)))
            await s.commit()
        assert await worker.process_one(fake)
    sip = (await auth_client.get(f"/sips/{sip_id}")).json()
    assert sip["status"] == "failed" and "interpretation" in sip["error"]

    assert (await auth_client.post(f"/sips/{sip_id}/retry")).status_code == 202
    await drain(FakeClient())
    assert (await auth_client.get(f"/sips/{sip_id}")).json()["status"] == "ready"


async def test_cancelled_job_is_released(auth_client):
    import asyncio

    class Slow(FakeClient):
        async def complete(self, *a, **k):
            await asyncio.sleep(10)

    await auth_client.post("/sips", json={"input": "taux"})
    task = asyncio.create_task(worker.process_one(Slow()))
    await asyncio.sleep(0.5)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    async with SessionLocal() as s:
        job = (await s.execute(select(Job))).scalar_one()
    assert job.status == "queued" and job.attempts == 0
    assert await worker.process_one(FakeClient())
