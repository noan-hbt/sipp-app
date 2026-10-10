from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ChapterOut, ProgramOut, SipSummary
from app.api.sips import _lessons, _own_sip, _summary
from app.auth import current_user
from app.db import get_session
from app.jobs.queue import enqueue
from app.models import Lesson, Program, ProgramStatus, Sip, SipStatus, User, utcnow
from app.pipeline import engine, programs
from app.plans import check_active_builds, check_plan, count_generation
from app.quota import check_cost, lock_user
from app.themes import theme_of

router = APIRouter(tags=["programs"])


async def _own_program(session: AsyncSession, user: User, program_id: str) -> Program:
    program = await session.get(Program, program_id)
    if program is None or program.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "program not found")
    return program


async def _out(session: AsyncSession, program: Program) -> ProgramOut:
    sips = (await session.execute(select(Sip).where(Sip.program_id == program.id))).scalars().all()
    lessons = (
        (await session.execute(select(Lesson).where(Lesson.sip_id.in_([s.id for s in sips])).order_by(Lesson.global_index)))
        .scalars()
        .all()
        if sips
        else []
    )
    by_chapter = {s.chapter: s for s in sips}
    return ProgramOut(
        id=program.id,
        status=program.status,
        error=program.error,
        title=program.title,
        theme=theme_of(program.profile),
        summary=program.summary,
        lite=program.lite,
        note=program.note,
        created_at=program.created_at,
        chapters=[
            ChapterOut(
                position=i,
                title=c["title"],
                outcome=c["outcome"],
                level=c["level"],
                estimated_lessons=c["estimated_lessons"],
                sip=(
                    _summary(by_chapter[i], [l for l in lessons if l.sip_id == by_chapter[i].id])
                    if i in by_chapter
                    else None
                ),
            )
            for i, c in enumerate(program.roadmap, start=1)
        ],
    )


@router.get("/programs", response_model=list[ProgramOut])
async def list_programs(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rows = (
        (await session.execute(select(Program).where(Program.user_id == user.id).order_by(Program.created_at.desc())))
        .scalars()
        .all()
    )
    return [await _out(session, p) for p in rows]


@router.get("/programs/{program_id}", response_model=ProgramOut)
async def get_program(
    program_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    return await _out(session, await _own_program(session, user, program_id))


@router.delete("/programs/{program_id}", status_code=204)
async def delete_program(
    program_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Deletes the program and all its chapters' Sips."""
    await _own_program(session, user, program_id)
    await session.execute(delete(Sip).where(Sip.program_id == program_id))
    await session.execute(delete(Program).where(Program.id == program_id))
    await session.commit()


@router.post("/programs/{program_id}/chapters/{position}", response_model=SipSummary, status_code=202)
async def start_chapter(
    program_id: str,
    position: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Generates a chapter as a new Sip. Costs one monthly generation, no extra slot."""
    user = await lock_user(session, user)
    program = await _own_program(session, user, program_id)
    stale = program.updated_at.replace(tzinfo=timezone.utc) if program.updated_at.tzinfo is None else program.updated_at
    if program.status == ProgramStatus.ADJUSTING and utcnow() - stale < timedelta(minutes=3):
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "program_adjusting", "message": "roadmap being adjusted"})
    if program.status not in (ProgramStatus.READY, ProgramStatus.ADJUSTING):
        raise HTTPException(status.HTTP_409_CONFLICT, "program is not ready")
    if not 1 <= position <= len(program.roadmap):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "chapter not found")
    exists = await session.scalar(select(Sip.id).where(Sip.program_id == program.id, Sip.chapter == position))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "chapter_exists", "sip_id": exists})
    await check_active_builds(session, user)
    await check_cost(session, user)
    plan = await check_plan(session, user, new_slot=False)
    chapter = programs.chapter_of(program, position)
    sip = Sip(
        user_id=user.id,
        input_text=f"{chapter['title']} — {chapter['outcome']}",
        title=chapter["title"],
        profile=program.profile,
        program_id=program.id,
        chapter=position,
        lite=plan["lite"],
    )
    count_generation(user)
    program.note = None  # shown until the learner moves on
    session.add(sip)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        exists = await session.scalar(select(Sip.id).where(Sip.program_id == program_id, Sip.chapter == position))
        if exists:
            raise HTTPException(status.HTTP_409_CONFLICT, {"code": "chapter_exists", "sip_id": exists})
        raise
    await enqueue(session, engine.JOB_BUILD_SIP, {"sip_id": sip.id})
    await session.commit()
    return _summary(sip, [])


@router.post("/sips/{sip_id}/extend", response_model=ProgramOut, status_code=202)
async def extend_sip(
    sip_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """'Go further': turns a finished standalone Sip into chapter 1 of a new program."""
    user = await lock_user(session, user)
    sip = await _own_sip(session, user, sip_id)
    if sip.program_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "already_in_program", "program_id": sip.program_id})
    lessons = await _lessons(session, sip.id)
    if sip.status != SipStatus.READY or not lessons or any(l.completed_at is None for l in lessons):
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "sip_not_finished", "message": "finish the Sip first"})
    await check_cost(session, user)
    program = Program(
        user_id=user.id,
        status=ProgramStatus.GENERATING,
        title=sip.title,
        profile=sip.profile,
        roadmap=[],
        lite=sip.lite,
    )
    session.add(program)
    await session.flush()
    sip.program_id, sip.chapter = program.id, 1
    await enqueue(session, programs.JOB_EXTEND_PROGRAM, {"program_id": program.id})
    await session.commit()
    return await _out(session, program)
