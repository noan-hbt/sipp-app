"""Background worker: `python -m app.jobs.worker`."""

import asyncio
import logging
import signal

from app import billing
from app.config import get_settings
from app.db import SessionLocal
from app.jobs import queue
from app.llm.client import OpenRouterClient
from app.llm.record import make_llm
from app.models import Job, Lesson, Program, Sip
from app.observability import init_sentry
from app.paddle import PaddleClient
from app.pipeline import engine, programs

log = logging.getLogger("sipp.worker")


async def run_job(job: Job, client=None) -> None:
    async with SessionLocal() as session:
        session.info["job_claim"] = job
        await queue.check_claim(session)
        await session.commit()
        if job.type == engine.JOB_BUILD_SIP:
            sip_id = job.payload["sip_id"]
            sip = await session.get(Sip, sip_id)
            if sip is None:
                return
            await engine.build_sip(session, make_llm(client, sip_id=sip_id, user_id=sip.user_id), sip_id)
        elif job.type == programs.JOB_EXTEND_PROGRAM:
            program = await session.get(Program, job.payload["program_id"])
            if program is None:
                return
            await programs.extend_program(session, make_llm(client, user_id=program.user_id), program.id)
        elif job.type == programs.JOB_ADJUST_PROGRAM:
            program = await session.get(Program, job.payload["program_id"])
            if program is None:
                return
            await programs.adjust_program(session, make_llm(client, user_id=program.user_id), program.id)
        elif job.type == engine.JOB_GENERATE_LESSON:
            lesson_id = job.payload["lesson_id"]
            lesson = await session.get(Lesson, lesson_id)
            sip = await session.get(Sip, lesson.sip_id) if lesson else None
            if sip is None:
                return
            llm = make_llm(client, sip_id=sip.id, lesson_id=lesson_id, user_id=sip.user_id)
            await engine.generate_lesson(session, llm, lesson_id, chain=job.payload.get("chain", False))
        else:
            raise ValueError(f"unknown job type {job.type}")


async def on_failure(job: Job, error: str) -> None:
    async with SessionLocal() as session:
        await queue.fail(session, job, error)
        await session.commit()


async def _heartbeat(job: Job) -> None:
    interval = max(0.1, get_settings().job_stale_minutes * 60 / 3)
    while True:
        await asyncio.sleep(interval)
        async with SessionLocal() as session:
            await queue.heartbeat(session, job)


async def process_one(client=None) -> bool:
    """Claim and run one job. Returns False if the queue was empty."""
    async with SessionLocal() as session:
        job = await queue.claim(session)
    if job is None:
        return False
    log.info("job %s %s attempt %d", job.id, job.type, job.attempts)
    run = asyncio.create_task(run_job(job, client))
    heartbeat = asyncio.create_task(_heartbeat(job))
    try:
        done, _ = await asyncio.wait((run, heartbeat), return_when=asyncio.FIRST_COMPLETED)
        if heartbeat in done:
            heartbeat.result()
        await run
    except asyncio.CancelledError:
        run.cancel()
        await asyncio.gather(run, return_exceptions=True)
        async with SessionLocal() as session:
            await asyncio.shield(queue.release(session, job))
        log.info("job %s released on shutdown", job.id)
        raise
    except queue.ClaimLost:
        run.cancel()
        await asyncio.gather(run, return_exceptions=True)
        log.info("job %s claim lost", job.id)
    except Exception as e:  # noqa: BLE001
        run.cancel()
        await asyncio.gather(run, return_exceptions=True)
        log.exception("job %s failed", job.id)
        await on_failure(job, f"{type(e).__name__}: {e}")
    else:
        async with SessionLocal() as session:
            await queue.finish(session, job)
    finally:
        heartbeat.cancel()
        await asyncio.gather(heartbeat, return_exceptions=True)
    return True


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    s = get_settings()
    init_sentry("worker")
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

    async def billing_sync() -> None:
        """Catches webhooks Paddle never delivered; idempotent, so several workers are fine."""
        paddle = PaddleClient()
        while not stop.is_set():
            if s.billing_enabled:
                try:
                    async with SessionLocal() as session:
                        n = await billing.reconcile(session, paddle)
                    if n:
                        log.info("billing: %d subscriptions re-read from Paddle", n)
                except Exception:  # noqa: BLE001
                    log.exception("billing reconciliation failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=6 * 3600)
            except TimeoutError:
                pass

    log.info("worker started (concurrency=%d)", s.worker_concurrency)
    tasks = [asyncio.create_task(slot()) for _ in range(s.worker_concurrency)]
    tasks.append(asyncio.create_task(billing_sync()))
    await stop.wait()
    log.info("shutdown: releasing in-flight jobs")
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
