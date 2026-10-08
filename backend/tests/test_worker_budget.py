from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import worker
from app.models import Job, Lesson, LessonStatus, LLMCall, Sip
from tests.fakes import FakeClient


async def test_worker_checks_budget_before_paid_call(auth_client):
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    async with SessionLocal() as s:
        sip = await s.get(Sip, sip_id)
        s.add(LLMCall(stage="help", model="m", user_id=sip.user_id, cost=5))
        await s.commit()
    fake = FakeClient()
    assert await worker.process_one(fake)
    assert fake.calls == []
    async with SessionLocal() as s:
        job = (await s.scalars(select(Job))).one()
        assert job.status == "queued" and "daily_budget_reached" in job.error


async def test_worker_publishes_lesson_when_prefetch_budget_refused(auth_client, monkeypatch):
    class ExpensiveReview(FakeClient):
        async def complete(self, model, messages, schema_name, schema):
            result = await super().complete(model, messages, schema_name, schema)
            if schema_name == "Review":
                result.cost = 0.25
            return result

    monkeypatch.setattr(get_settings(), "max_cost_per_day_usd", 0.26)
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    fake = ExpensiveReview()
    assert await worker.process_one(fake)
    assert await worker.process_one(fake)
    async with SessionLocal() as s:
        lessons = (await s.scalars(select(Lesson).where(Lesson.sip_id == sip_id).order_by(Lesson.global_index))).all()
        assert lessons[0].status == LessonStatus.READY
        assert lessons[1].status == LessonStatus.PENDING
    assert not await worker.process_one(fake)
