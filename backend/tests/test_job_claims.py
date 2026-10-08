import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import queue, worker
from app.models import Job, JobStatus, Program, ProgramStatus, Sip, SipStatus, utcnow
from tests.fakes import FakeClient


async def _new_job(auth_client, max_attempts=3):
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    async with SessionLocal() as session:
        job = (await session.scalars(select(Job))).one()
        job.max_attempts = max_attempts
        await session.commit()
    return sip_id


async def _claim():
    async with SessionLocal() as session:
        return await queue.claim(session)


async def _expire(job):
    async with SessionLocal() as session:
        await session.execute(update(Job).where(Job.id == job.id).values(
            locked_at=utcnow() - timedelta(minutes=30),
        ))
        await session.commit()


async def test_concurrent_claims_have_one_owner(auth_client):
    await _new_job(auth_client)
    claims = await asyncio.gather(_claim(), _claim())
    jobs = [job for job in claims if job is not None]
    assert len(jobs) == 1
    assert jobs[0].attempts == 1 and jobs[0].claim_token


async def test_heartbeat_prevents_reclaim(auth_client):
    await _new_job(auth_client)
    job = await _claim()
    await _expire(job)
    async with SessionLocal() as session:
        await queue.heartbeat(session, job)
    assert await _claim() is None
    async with SessionLocal() as session:
        assert (await session.get(Job, job.id)).attempts == 1


async def test_stale_owner_cannot_mutate_new_claim_or_publish(auth_client):
    sip_id = await _new_job(auth_client)
    old = await _claim()
    await _expire(old)
    current = await _claim()
    assert current.attempts == 2 and current.claim_token != old.claim_token
    async with SessionLocal() as session:
        assert await queue.fail(session, old, "old worker") is None
        await session.commit()
        assert not await queue.finish(session, old)
        assert not await queue.release(session, old)
        sip = await session.get(Sip, sip_id)
        sip.title = "stale publication"
        session.info["job_claim"] = old
        with pytest.raises(queue.ClaimLost):
            await queue.check_claim(session)
        await session.rollback()
    async with SessionLocal() as session:
        job = await session.get(Job, current.id)
        assert job.status == JobStatus.RUNNING and job.claim_token == current.claim_token
        assert job.attempts == 2
        assert (await session.get(Sip, sip_id)).title is None


async def test_release_does_not_reuse_claim_token(auth_client):
    await _new_job(auth_client)
    old = await _claim()
    async with SessionLocal() as session:
        assert await queue.release(session, old)
    current = await _claim()
    assert current.attempts == old.attempts == 1
    assert current.claim_token != old.claim_token
    async with SessionLocal() as session:
        assert not await queue.finish(session, old)
        assert not await queue.release(session, old)
        assert await queue.fail(session, old, "old worker") is None


@pytest.mark.parametrize("status", [JobStatus.QUEUED, JobStatus.RUNNING])
async def test_claim_terminalizes_exhausted_job_and_resource(auth_client, status):
    sip_id = await _new_job(auth_client, max_attempts=1)
    job = await _claim()
    async with SessionLocal() as session:
        await session.execute(update(Job).where(Job.id == job.id).values(
            status=status, locked_at=utcnow() - timedelta(minutes=30),
        ))
        sip = await session.get(Sip, sip_id)
        sip.status = SipStatus.GENERATING
        await session.commit()
    assert await _claim() is None
    async with SessionLocal() as session:
        job = await session.get(Job, job.id)
        assert job.status == JobStatus.FAILED and job.attempts == 1
        assert job.claim_token is None and job.locked_at is None
        assert (await session.get(Sip, sip_id)).status == SipStatus.FAILED


async def test_failure_transaction_rolls_back_job_and_resource(auth_client):
    sip_id = await _new_job(auth_client, max_attempts=1)
    job = await _claim()
    async with SessionLocal() as session:
        assert await queue.fail(session, job, "failed") is False
        await session.rollback()
    async with SessionLocal() as session:
        assert (await session.get(Job, job.id)).status == JobStatus.RUNNING
        assert (await session.get(Sip, sip_id)).status == SipStatus.QUEUED
    await worker.on_failure(job, "failed")
    async with SessionLocal() as session:
        assert (await session.get(Job, job.id)).status == JobStatus.FAILED
        assert (await session.get(Sip, sip_id)).status == SipStatus.FAILED


async def test_exhausted_claim_rolls_back_when_resource_failure_errors(auth_client, monkeypatch):
    sip_id = await _new_job(auth_client, max_attempts=1)
    job = await _claim()
    await _expire(job)

    async def broken_resource_failure(*args, **kwargs):
        raise RuntimeError("interrupted before resource update")

    monkeypatch.setattr(queue, "_resource_failure", broken_resource_failure)
    with pytest.raises(RuntimeError):
        await _claim()
    async with SessionLocal() as session:
        assert (await session.get(Job, job.id)).status == JobStatus.RUNNING
        assert (await session.get(Sip, sip_id)).status == SipStatus.QUEUED


async def test_reclaimed_worker_cannot_publish_llm_result(auth_client):
    sip_id = await _new_job(auth_client)
    started, resume = asyncio.Event(), asyncio.Event()

    class SlowClient(FakeClient):
        async def complete(self, model, messages, schema_name, schema):
            if schema_name == "LearningProfile":
                started.set()
                await resume.wait()
            return await super().complete(model, messages, schema_name, schema)

    task = asyncio.create_task(worker.process_one(SlowClient()))
    await asyncio.wait_for(started.wait(), timeout=2)
    try:
        async with SessionLocal() as session:
            old = (await session.scalars(select(Job))).one()
        await _expire(old)
        current = await _claim()
        assert current.claim_token != old.claim_token
    finally:
        resume.set()
    assert await asyncio.wait_for(task, timeout=2)
    async with SessionLocal() as session:
        sip = await session.get(Sip, sip_id)
        assert sip.status == SipStatus.QUEUED and sip.profile is None and sip.title is None
        job = await session.get(Job, current.id)
        assert job.status == JobStatus.RUNNING and job.claim_token == current.claim_token
    await worker.run_job(current, FakeClient())
    async with SessionLocal() as session:
        assert await queue.finish(session, current)
        assert (await session.get(Sip, sip_id)).status == SipStatus.READY


@pytest.mark.parametrize("usable", [None, SipStatus.READY, SipStatus.GENERATING])
async def test_terminal_build_marks_empty_program_failed(auth_client, usable):
    sip_id = await _new_job(auth_client, max_attempts=1)
    async with SessionLocal() as session:
        sip = await session.get(Sip, sip_id)
        program = Program(user_id=sip.user_id, roadmap=[])
        session.add(program)
        await session.flush()
        program_id = program.id
        sip.program_id, sip.chapter = program_id, 1
        if usable:
            session.add(Sip(user_id=sip.user_id, input_text="autre chapitre",
                            program_id=program_id, chapter=2, status=usable))
        await session.commit()
    job = await _claim()
    await worker.on_failure(job, "failed curriculum")
    async with SessionLocal() as session:
        program = await session.get(Program, program_id)
        assert program.status == (ProgramStatus.READY if usable else ProgramStatus.FAILED)
        assert (await session.get(Sip, sip_id)).status == SipStatus.FAILED


async def test_worker_renews_claim_during_long_job(auth_client, monkeypatch):
    await _new_job(auth_client)
    monkeypatch.setattr(get_settings(), "job_stale_minutes", 0.005)
    started = asyncio.Event()

    async def slow_job(job, client=None):
        started.set()
        await asyncio.sleep(0.65)

    monkeypatch.setattr(worker, "run_job", slow_job)
    task = asyncio.create_task(worker.process_one())
    await asyncio.wait_for(started.wait(), timeout=2)
    await asyncio.sleep(0.45)
    assert await _claim() is None
    assert await asyncio.wait_for(task, timeout=2)
    async with SessionLocal() as session:
        job = (await session.scalars(select(Job))).one()
        assert job.status == JobStatus.DONE and job.attempts == 1


async def test_worker_cancels_work_when_claim_is_lost(auth_client, monkeypatch):
    await _new_job(auth_client)
    monkeypatch.setattr(get_settings(), "job_stale_minutes", 0.001)
    started, cancelled = asyncio.Event(), asyncio.Event()

    async def slow_job(job, client=None):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(worker, "run_job", slow_job)
    task = asyncio.create_task(worker.process_one())
    await asyncio.wait_for(started.wait(), timeout=2)
    async with SessionLocal() as session:
        await session.execute(update(Job).values(claim_token="replacement"))
        await session.commit()
    assert await asyncio.wait_for(task, timeout=2)
    assert cancelled.is_set()
    async with SessionLocal() as session:
        job = (await session.scalars(select(Job))).one()
        assert job.status == JobStatus.RUNNING and job.claim_token == "replacement"
