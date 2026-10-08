"""Minimal Postgres-backed job queue (FOR UPDATE SKIP LOCKED)."""

from datetime import timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Job, JobStatus, Lesson, LessonStatus, Program, ProgramStatus, Sip, SipStatus, utcnow


class ClaimLost(Exception):
    pass


async def enqueue(session: AsyncSession, type: str, payload: dict[str, Any]) -> Job:
    job = Job(type=type, payload=payload, max_attempts=get_settings().job_max_attempts)
    session.add(job)
    await session.flush()
    return job


async def claim(session: AsyncSession) -> Job | None:
    """Atomically take the next runnable job. Commits."""
    while True:
        now = utcnow()
        stale = now - timedelta(minutes=get_settings().job_stale_minutes)
        runnable = or_(
            (Job.status == JobStatus.QUEUED) & (Job.run_after <= now),
            (Job.status == JobStatus.RUNNING) & (Job.locked_at < stale),
        )
        job = (await session.execute(
            select(Job).where(runnable).order_by(Job.created_at).limit(1)
            .with_for_update(skip_locked=True)
        )).scalar_one_or_none()
        if job is None:
            await session.commit()
            return None
        previous_status = job.status
        exhausted = job.attempts >= job.max_attempts
        values = (
            {"status": JobStatus.FAILED, "locked_at": None, "claim_token": None,
             "error": "Job reached maximum attempts"}
            if exhausted else
            {"status": JobStatus.RUNNING, "locked_at": now, "claim_token": str(uuid4()),
             "attempts": Job.attempts + 1}
        )
        claimed = (await session.execute(
            update(Job).where(Job.id == job.id, runnable, Job.attempts == job.attempts)
            .values(**values).returning(Job)
            .execution_options(populate_existing=True, synchronize_session=False)
        )).scalar_one_or_none()
        if claimed is None:
            await session.rollback()
            continue
        if exhausted:
            await _resource_failure(session, claimed, claimed.error, retry=False)
        elif previous_status == JobStatus.RUNNING:
            await _reset_resource(session, claimed)
        await session.commit()
        if not exhausted:
            return claimed


def _owned(job: Job):
    return (Job.id == job.id) & (Job.status == JobStatus.RUNNING) & (Job.claim_token == job.claim_token)


async def check_claim(session: AsyncSession, job: Job | None = None) -> None:
    job = job or session.info.get("job_claim")
    if job is None:
        return
    with session.no_autoflush:
        result = await session.execute(
            update(Job).where(_owned(job)).values(locked_at=utcnow())
            .execution_options(synchronize_session=False)
        )
    if result.rowcount != 1:
        raise ClaimLost(job.id)


async def heartbeat(session: AsyncSession, job: Job) -> None:
    await check_claim(session, job)
    await session.commit()


async def finish(session: AsyncSession, job: Job) -> bool:
    result = await session.execute(
        update(Job).where(_owned(job))
        .values(status=JobStatus.DONE, error=None, locked_at=None, claim_token=None)
        .execution_options(synchronize_session=False)
    )
    await session.commit()
    return result.rowcount == 1


async def fail(session: AsyncSession, job: Job, error: str) -> bool | None:
    """Record job and resource failure together. Caller commits."""
    retry = job.attempts < job.max_attempts
    result = await session.execute(
        update(Job).where(_owned(job)).values(
            error=error[:4000], status=JobStatus.QUEUED if retry else JobStatus.FAILED,
            run_after=utcnow() + timedelta(seconds=30 * 2 ** (job.attempts - 1)),
            locked_at=None, claim_token=None,
        ).execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        return None
    await _resource_failure(session, job, error, retry)
    return retry


async def release(session: AsyncSession, job: Job) -> bool:
    """Give a job back to the queue without counting the attempt (worker shutdown)."""
    result = await session.execute(
        update(Job).where(_owned(job)).values(
            status=JobStatus.QUEUED, attempts=max(0, job.attempts - 1),
            locked_at=None, claim_token=None, run_after=utcnow(),
        ).execution_options(synchronize_session=False)
    )
    if result.rowcount == 1:
        await _reset_resource(session, job)
    await session.commit()
    return result.rowcount == 1


async def _reset_resource(session: AsyncSession, job: Job) -> None:
    if job.type == "generate_lesson":
        await session.execute(update(Lesson).where(
            Lesson.id == job.payload["lesson_id"], Lesson.status == LessonStatus.GENERATING,
        ).values(status=LessonStatus.QUEUED))
    elif job.type == "build_sip":
        await session.execute(update(Sip).where(
            Sip.id == job.payload["sip_id"], Sip.status == SipStatus.GENERATING,
        ).values(status=SipStatus.QUEUED))


async def _resource_failure(session: AsyncSession, job: Job, error: str, retry: bool) -> None:
    if job.type == "build_sip":
        sip = await session.get(Sip, job.payload["sip_id"], populate_existing=True)
        if sip and sip.status in (SipStatus.QUEUED, SipStatus.GENERATING):
            sip.status = SipStatus.QUEUED if retry else SipStatus.FAILED
            sip.error = None if retry else error[:2000]
            if not retry and sip.program_id:
                program = await session.get(Program, sip.program_id, with_for_update=True)
                usable = await session.scalar(select(Sip.id).where(
                    Sip.program_id == sip.program_id, Sip.status != SipStatus.FAILED,
                ).limit(1))
                if program and usable is None:
                    program.status, program.error = ProgramStatus.FAILED, error[:2000]
    elif job.type == "extend_program" and not retry:
        program = await session.get(Program, job.payload["program_id"])
        if program and program.status == ProgramStatus.GENERATING:
            await session.execute(update(Sip).where(Sip.program_id == program.id)
                                  .values(program_id=None, chapter=None))
            await session.delete(program)
    elif job.type == "adjust_program" and not retry:
        await session.execute(update(Program).where(
            Program.id == job.payload["program_id"], Program.status == ProgramStatus.ADJUSTING,
        ).values(status=ProgramStatus.READY))
    elif job.type == "generate_lesson":
        await session.execute(update(Lesson).where(
            Lesson.id == job.payload["lesson_id"],
            Lesson.status.in_((LessonStatus.QUEUED, LessonStatus.GENERATING)),
        ).values(status=LessonStatus.QUEUED if retry else LessonStatus.FAILED,
                 error=None if retry else error[:2000]))
