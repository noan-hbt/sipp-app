"""Minimal Postgres-backed job queue (FOR UPDATE SKIP LOCKED)."""

from datetime import timedelta
from typing import Any

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Job, JobStatus, utcnow


async def enqueue(session: AsyncSession, type: str, payload: dict[str, Any]) -> Job:
    job = Job(type=type, payload=payload, max_attempts=get_settings().job_max_attempts)
    session.add(job)
    await session.flush()
    return job


async def claim(session: AsyncSession) -> Job | None:
    """Atomically take the next runnable job. Commits."""
    now = utcnow()
    stale = now - timedelta(minutes=get_settings().job_stale_minutes)
    stmt = (
        select(Job)
        .where(
            or_(
                (Job.status == JobStatus.QUEUED) & (Job.run_after <= now),
                # crashed worker: job stuck in running
                (Job.status == JobStatus.RUNNING) & (Job.locked_at < stale),
            )
        )
        .order_by(Job.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is None:
        await session.commit()
        return None
    job.status = JobStatus.RUNNING
    job.locked_at = now
    job.attempts += 1
    await session.commit()
    return job


async def finish(session: AsyncSession, job_id: str) -> None:
    await session.execute(
        update(Job).where(Job.id == job_id).values(status=JobStatus.DONE, error=None)
    )
    await session.commit()


async def fail(session: AsyncSession, job_id: str, error: str) -> bool:
    """Record a failure. Returns True if the job will be retried."""
    job = await session.get(Job, job_id)
    if job is None:
        return False
    job.error = error[:4000]
    retry = job.attempts < job.max_attempts
    if retry:
        job.status = JobStatus.QUEUED
        job.run_after = utcnow() + timedelta(seconds=30 * 2 ** (job.attempts - 1))
    else:
        job.status = JobStatus.FAILED
    job.locked_at = None
    await session.commit()
    return retry
