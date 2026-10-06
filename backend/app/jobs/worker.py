"""Background worker: `python -m app.jobs.worker`."""

import asyncio
import logging
import signal

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import queue
from app.llm.client import CallRecord, OpenRouterClient, StructuredLLM
from app.models import Job, Lesson, LessonStatus, LLMCall, Sip, SipStatus
from app.pipeline import engine

log = logging.getLogger("sipp.worker")


def make_llm(client=None, sip_id: str | None = None, lesson_id: str | None = None) -> StructuredLLM:
    async def record(rec: CallRecord) -> None:
        c = rec.completion
        async with SessionLocal() as s:
            s.add(
                LLMCall(
                    stage=rec.stage,
                    model=c.model if c else rec.model,
                    sip_id=sip_id,
                    lesson_id=lesson_id,
                    prompt_tokens=c.prompt_tokens if c else None,
                    completion_tokens=c.completion_tokens if c else None,
                    cost=c.cost if c else None,
                    latency_ms=rec.latency_ms,
                    ok=rec.ok,
                    error=rec.error[:4000] if rec.error else None,
                )
            )
            await s.commit()

    return StructuredLLM(client=client or OpenRouterClient(), recorder=record)


async def run_job(job: Job, client=None) -> None:
    async with SessionLocal() as session:
        if job.type == engine.JOB_BUILD_SIP:
            sip_id = job.payload["sip_id"]
            await engine.build_sip(session, make_llm(client, sip_id=sip_id), sip_id)
        elif job.type == engine.JOB_GENERATE_LESSON:
            lesson_id = job.payload["lesson_id"]
            lesson = await session.get(Lesson, lesson_id)
            llm = make_llm(client, sip_id=lesson.sip_id if lesson else None, lesson_id=lesson_id)
            await engine.generate_lesson(session, llm, lesson_id, chain=job.payload.get("chain", False))
        else:
            raise ValueError(f"unknown job type {job.type}")


async def on_failure(job: Job, error: str) -> None:
    async with SessionLocal() as session:
        retry = await queue.fail(session, job.id, error)
        if job.type == engine.JOB_BUILD_SIP:
            sip = await session.get(Sip, job.payload["sip_id"])
            if sip:
                sip.status = SipStatus.QUEUED if retry else SipStatus.FAILED
                sip.error = None if retry else error[:2000]
        elif job.type == engine.JOB_GENERATE_LESSON:
            lesson = await session.get(Lesson, job.payload["lesson_id"])
            if lesson:
                lesson.status = LessonStatus.QUEUED if retry else LessonStatus.FAILED
                lesson.error = None if retry else error[:2000]
        await session.commit()


async def process_one(client=None) -> bool:
    """Claim and run one job. Returns False if the queue was empty."""
    async with SessionLocal() as session:
        job = await queue.claim(session)
    if job is None:
        return False
    log.info("job %s %s attempt %d", job.id, job.type, job.attempts)
    try:
        await run_job(job, client)
    except asyncio.CancelledError:
        # Shutdown (deploy/restart): hand the job back so another worker resumes it now.
        async with SessionLocal() as session:
            await asyncio.shield(queue.release(session, job.id))
        log.info("job %s released on shutdown", job.id)
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("job %s failed", job.id)
        await on_failure(job, f"{type(e).__name__}: {e}")
    else:
        async with SessionLocal() as session:
            await queue.finish(session, job.id)
    return True


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    s = get_settings()
    client = OpenRouterClient()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows
            pass

    async def slot() -> None:
        failures = 0
        while not stop.is_set():
            try:
                busy = await process_one(client)
                failures = 0
            except Exception as e:  # DB down / not migrated yet: keep alive, back off
                if failures == 0:
                    log.exception("worker loop error")
                else:
                    log.warning("worker loop error (x%d): %s", failures + 1, type(e).__name__)
                failures += 1
                busy = False
            if not busy:
                delay = min(30.0, s.worker_poll_seconds * 2**failures) if failures else s.worker_poll_seconds
                try:
                    await asyncio.wait_for(stop.wait(), timeout=delay)
                except TimeoutError:
                    pass

    log.info("worker started (concurrency=%d)", s.worker_concurrency)
    tasks = [asyncio.create_task(slot()) for _ in range(s.worker_concurrency)]
    await stop.wait()
    log.info("shutdown: releasing in-flight jobs")
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
