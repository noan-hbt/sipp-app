"""Around the lessons: how they felt, problems reported, passages kept, end-of-module quiz."""

import random

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import AnswersIn
from app.api.sips import _own_lesson, _own_sip
from app.auth import current_user
from app.db import get_session
from app.models import Lesson, LessonFeedback, Module, Note, Sip, User
from app.progress import score_for, stars_for

router = APIRouter(tags=["learning"])

# Blocks the quiz can reuse: graded on the server, answerable out of their lesson.
QUIZ_TYPES = {"question", "misconception", "fill_blanks", "estimate"}
QUIZ_SIZE = 5


class FeedbackIn(BaseModel):
    feeling: str | None = Field(default=None, pattern="^(easy|ok|hard)$")
    problem: str | None = Field(default=None, pattern="^(wrong|unclear|broken|other)$")
    comment: str | None = Field(default=None, max_length=1000)
    block: int | None = Field(default=None, ge=0, le=200)


class NoteIn(BaseModel):
    block: int = Field(ge=0, le=200)
    quote: str = Field(min_length=1, max_length=2000)
    text: str | None = Field(default=None, max_length=1000)


class NoteOut(BaseModel):
    id: str
    lesson_id: str
    lesson_title: str
    sip_id: str
    sip_title: str
    block: int
    quote: str
    text: str | None


class QuizItem(BaseModel):
    lesson_id: str
    block_index: int
    block: dict


class QuizOut(BaseModel):
    module_id: str
    title: str
    items: list[QuizItem]
    best_stars: int | None


class QuizRef(BaseModel):
    lesson_id: str
    block_index: int = Field(ge=0, le=200)


class QuizIn(AnswersIn):
    items: list[QuizRef] = Field(max_length=QUIZ_SIZE)


class QuizResult(BaseModel):
    correct: int
    total: int
    stars: int
    best_stars: int
    gained: int


@router.post("/lessons/{lesson_id}/feedback", status_code=204)
async def lesson_feedback(
    lesson_id: str, body: FeedbackIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Too easy / too hard tunes the Sip's next lessons; a problem report is kept for review."""
    if not body.feeling and not body.problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "nothing to record")
    lesson = await _own_lesson(session, user, lesson_id)
    session.add(LessonFeedback(user_id=user.id, lesson_id=lesson.id, **body.model_dump()))
    if body.feeling in ("easy", "hard"):
        sip = await session.get(Sip, lesson.sip_id)
        sip.difficulty = max(-2, min(2, sip.difficulty + (1 if body.feeling == "easy" else -1)))
    await session.commit()


def _note_out(note: Note, lesson: Lesson, sip: Sip) -> NoteOut:
    return NoteOut(
        id=note.id, lesson_id=lesson.id, lesson_title=lesson.title, sip_id=sip.id,
        sip_title=sip.title or sip.input_text[:80], block=note.block, quote=note.quote, text=note.text,
    )


@router.get("/me/notes", response_model=list[NoteOut])
async def list_notes(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rows = await session.execute(
        select(Note, Lesson, Sip)
        .join(Lesson, Lesson.id == Note.lesson_id)
        .join(Sip, Sip.id == Lesson.sip_id)
        .where(Note.user_id == user.id)
        .order_by(Note.created_at.desc())
    )
    return [_note_out(*r) for r in rows.all()]


@router.post("/lessons/{lesson_id}/notes", response_model=NoteOut, status_code=201)
async def add_note(
    lesson_id: str, body: NoteIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Keeps a passage of the lesson; keeping the same block twice updates it."""
    lesson = await _own_lesson(session, user, lesson_id)
    if body.block >= len(lesson.blocks or []):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown block")
    note = await session.scalar(
        select(Note).where(Note.user_id == user.id, Note.lesson_id == lesson.id, Note.block == body.block)
    )
    if note is None:
        note = Note(user_id=user.id, lesson_id=lesson.id, block=body.block, quote=body.quote)
        session.add(note)
    note.quote, note.text = body.quote, body.text
    await session.commit()
    return _note_out(note, lesson, await session.get(Sip, lesson.sip_id))


@router.delete("/me/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    note = await session.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "note not found")
    await session.delete(note)
    await session.commit()


async def _own_module(session: AsyncSession, user: User, module_id: str) -> tuple[Module, list[Lesson]]:
    module = await session.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "module not found")
    await _own_sip(session, user, module.sip_id)
    lessons = list(
        (await session.scalars(select(Lesson).where(Lesson.module_id == module.id).order_by(Lesson.position))).all()
    )
    if not lessons or any(l.completed_at is None for l in lessons):
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "module_not_finished", "message": "finish the module first"})
    return module, lessons


@router.get("/modules/{module_id}/quiz", response_model=QuizOut)
async def module_quiz(module_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """A few questions picked across the module's lessons, shuffled: no generation, no wait."""
    module, lessons = await _own_module(session, user, module_id)
    pool = [
        QuizItem(lesson_id=l.id, block_index=i, block=b)
        for l in lessons
        for i, b in enumerate(l.blocks or [])
        if b.get("type") in QUIZ_TYPES and not (b.get("type") == "question" and b.get("kind") == "open")
    ]
    random.shuffle(pool)
    # Spread over lessons: one per lesson first, then fill up.
    picked, seen = [], set()
    for item in pool:
        if item.lesson_id not in seen:
            picked.append(item)
            seen.add(item.lesson_id)
    picked += [item for item in pool if item not in picked]
    return QuizOut(module_id=module.id, title=module.title, items=picked[:QUIZ_SIZE], best_stars=module.quiz_stars)


@router.post("/modules/{module_id}/quiz", response_model=QuizResult)
async def submit_quiz(
    module_id: str, body: QuizIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Graded on the server from the original blocks. Best result counts, extra stars only once."""
    module, lessons = await _own_module(session, user, module_id)
    by_id = {l.id: l for l in lessons}
    blocks = []
    for ref in body.items:
        lesson = by_id.get(ref.lesson_id)
        lesson_blocks = (lesson.blocks or []) if lesson else []
        if ref.block_index >= len(lesson_blocks) or lesson_blocks[ref.block_index].get("type") not in QUIZ_TYPES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown quiz question")
        blocks.append(lesson_blocks[ref.block_index])
    if any(a.block >= len(blocks) for a in body.answers):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "answers reference unknown questions")
    score = score_for(blocks, [a.model_dump(exclude_unset=True) for a in body.answers], None)
    if score is None or score.total == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "no graded question")
    stars = stars_for(score)
    before = module.quiz_stars or 0
    module.quiz_stars = max(before, stars)
    await session.commit()
    return QuizResult(
        correct=score.correct, total=score.total, stars=stars, best_stars=module.quiz_stars,
        gained=module.quiz_stars - before,
    )
