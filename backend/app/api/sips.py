from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    CompleteIn,
    CompleteOut,
    LessonBrief,
    LessonOut,
    ModuleOut,
    Progress,
    ResumeIn,
    SipCreate,
    SipDetail,
    SipSummary,
)
from app.auth import current_user
from app.db import get_session
from app.jobs.queue import enqueue
from app.models import Lesson, LessonStatus, Module, Sip, SipStatus, User, utcnow
from app.pipeline import engine
from app.plans import check_plan, count_generation
from app.progress import stars_for, stats
from app.quota import check_cost

router = APIRouter(tags=["sips"])

MAX_ACTIVE_BUILDS = 3


async def _own_sip(session: AsyncSession, user: User, sip_id: str) -> Sip:
    sip = await session.get(Sip, sip_id)
    if sip is None or sip.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "sip not found")
    return sip


async def _own_lesson(session: AsyncSession, user: User, lesson_id: str) -> Lesson:
    lesson = await session.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "lesson not found")
    await _own_sip(session, user, lesson.sip_id)
    return lesson


async def _lessons(session: AsyncSession, sip_id: str) -> list[Lesson]:
    return list(
        (
            await session.execute(
                select(Lesson).where(Lesson.sip_id == sip_id).order_by(Lesson.global_index)
            )
        )
        .scalars()
        .all()
    )


def _progress(lessons: list[Lesson]) -> tuple[Progress, str | None]:
    done = sum(1 for l in lessons if l.completed_at)
    nxt = next((l.id for l in lessons if not l.completed_at), None)
    return Progress(completed=done, total=len(lessons)), nxt


def _summary(sip: Sip, lessons: list[Lesson]) -> dict:
    progress, nxt = _progress(lessons)
    return dict(
        id=sip.id,
        title=sip.title,
        input_text=sip.input_text,
        status=sip.status,
        stage=sip.stage,
        error=sip.error,
        progress=progress,
        next_lesson_id=nxt,
        next_lesson_title=next((l.title for l in lessons if l.id == nxt), None),
        lite=sip.lite,
        program_id=sip.program_id,
        chapter=sip.chapter,
        created_at=sip.created_at,
    )


@router.post("/sips", response_model=SipSummary, status_code=202)
async def create_sip(
    body: SipCreate, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    active = await session.scalar(
        select(func.count())
        .select_from(Sip)
        .where(Sip.user_id == user.id, Sip.status.in_([SipStatus.QUEUED, SipStatus.GENERATING]))
    )
    if active >= MAX_ACTIVE_BUILDS:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"code": "too_many_active_builds", "message": "too many sips being generated"},
        )
    await check_cost(session, user)
    plan = await check_plan(session, user)
    sip = Sip(user_id=user.id, input_text=body.input.strip(), lite=plan["lite"])
    count_generation(user)
    session.add(sip)
    await session.flush()
    await enqueue(session, engine.JOB_BUILD_SIP, {"sip_id": sip.id})
    await session.commit()
    return _summary(sip, [])


@router.get("/sips", response_model=list[SipSummary])
async def list_sips(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    sips = (
        (await session.execute(select(Sip).where(Sip.user_id == user.id).order_by(Sip.created_at.desc())))
        .scalars()
        .all()
    )
    lessons = (
        (
            await session.execute(
                select(Lesson)
                .where(Lesson.sip_id.in_([s.id for s in sips]))
                .order_by(Lesson.global_index)
            )
        )
        .scalars()
        .all()
        if sips
        else []
    )
    by_sip: dict[str, list[Lesson]] = {}
    for l in lessons:
        by_sip.setdefault(l.sip_id, []).append(l)
    return [_summary(s, by_sip.get(s.id, [])) for s in sips]


@router.get("/sips/{sip_id}", response_model=SipDetail)
async def get_sip(
    sip_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    sip = await _own_sip(session, user, sip_id)
    modules = (
        (await session.execute(select(Module).where(Module.sip_id == sip.id).order_by(Module.position)))
        .scalars()
        .all()
    )
    lessons = await _lessons(session, sip.id)
    out_modules = [
        ModuleOut(
            id=m.id,
            position=m.position,
            title=m.title,
            role=m.role,
            objectives=m.objectives,
            lessons=[
                LessonBrief(
                    id=l.id,
                    key=l.key,
                    position=l.position,
                    title=l.title,
                    objective=l.objective,
                    concepts=l.concepts,
                    prerequisites=l.prerequisites,
                    status=l.status,
                    completed=l.completed_at is not None,
                    stars=l.stars,
                )
                for l in lessons
                if l.module_id == m.id
            ],
        )
        for m in modules
    ]
    return SipDetail(
        **_summary(sip, lessons),
        summary=sip.summary,
        profile=sip.profile,
        outline=[m.get("title", "") for m in (sip.curriculum or {}).get("modules", [])],
        modules=out_modules,
    )


@router.delete("/sips/{sip_id}", status_code=204)
async def delete_sip(
    sip_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    await _own_sip(session, user, sip_id)
    await session.execute(delete(Sip).where(Sip.id == sip_id))  # FK cascades
    await session.commit()


@router.post("/sips/{sip_id}/retry", response_model=SipSummary, status_code=202)
async def retry_sip(
    sip_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    sip = await _own_sip(session, user, sip_id)
    if sip.status != SipStatus.FAILED:
        raise HTTPException(status.HTTP_409_CONFLICT, "sip is not in failed state")
    sip.status, sip.error = SipStatus.QUEUED, None
    await enqueue(session, engine.JOB_BUILD_SIP, {"sip_id": sip.id})
    await session.commit()
    return _summary(sip, [])


# --- Lessons --------------------------------------------------------------------


async def _lesson_out(session: AsyncSession, lesson: Lesson) -> LessonOut:
    nxt = await engine.next_lesson(session, lesson)
    return LessonOut(
        id=lesson.id,
        sip_id=lesson.sip_id,
        module_id=lesson.module_id,
        key=lesson.key,
        title=lesson.title,
        objective=lesson.objective,
        concepts=lesson.concepts,
        status=lesson.status,
        error=lesson.error,
        blocks=lesson.blocks if lesson.status == LessonStatus.READY else None,
        summary=lesson.summary,
        concepts_taught=lesson.concepts_taught,
        completed_at=lesson.completed_at,
        stars=lesson.stars,
        next_lesson_id=nxt.id if nxt else None,
        resume=None if lesson.completed_at else lesson.resume,
    )


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
async def get_lesson(
    lesson_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Returns the lesson. If not generated yet, generation is queued (poll until `ready`)."""
    lesson = await _own_lesson(session, user, lesson_id)
    if lesson.status in (LessonStatus.PENDING, LessonStatus.FAILED):
        await check_cost(session, user)
    if await engine.request_lesson(session, lesson, chain=True):
        await session.commit()
    return await _lesson_out(session, lesson)


@router.post("/lessons/{lesson_id}/complete", response_model=CompleteOut)
async def complete_lesson(
    lesson_id: str,
    body: CompleteIn,
    tz: str = "UTC",
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    lesson = await _own_lesson(session, user, lesson_id)
    if lesson.status != LessonStatus.READY:
        raise HTTPException(status.HTTP_409_CONFLICT, "lesson is not ready")
    if lesson.completed_at is None:
        lesson.completed_at = utcnow()
    lesson.answers = body.answers
    lesson.resume = None
    stars = stars_for(body.score)
    lesson.stars = max(lesson.stars or 0, stars)

    # Keep the next lesson (and the one after) warm.
    nxt = await engine.next_lesson(session, lesson)
    if nxt is not None and not await engine.request_lesson(session, nxt, chain=True):
        after = await engine.next_lesson(session, nxt)
        if after is not None:
            await engine.request_lesson(session, after, chain=False)
    await session.commit()

    progress, _ = _progress(await _lessons(session, lesson.sip_id))
    st = await stats(session, user, tz)
    return CompleteOut(
        lesson_id=lesson.id,
        next_lesson_id=nxt.id if nxt else None,
        progress=progress,
        stars=lesson.stars,
        streak_days=st["streak_days"],
    )


@router.put("/lessons/{lesson_id}/resume", status_code=204)
async def save_resume(
    lesson_id: str,
    body: ResumeIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Saves where the learner stopped, so reopening the lesson resumes at that block."""
    lesson = await _own_lesson(session, user, lesson_id)
    lesson.resume = body.model_dump()
    await session.commit()
