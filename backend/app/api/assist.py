"""Synchronous LLM calls made while the learner waits: profile preview and in-lesson help."""

import dataclasses
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import HelpIn, HelpOut, InterpretIn, InterpretOut
from app.api.sips import _own_lesson
from app.auth import current_user
from app.config import get_settings
from app.db import get_session
from app.llm.client import ChatClient, LLMError, OpenRouterClient
from app.llm.record import make_llm
from app.models import LessonStatus, Sip, User
from app.pipeline import prompts
from app.pipeline.schemas import HelpAnswer, LearningProfile
from app.plans import check_plan, plan_status
from app.quota import check_cost

router = APIRouter(tags=["assist"])

_client: ChatClient | None = None


def chat_client() -> ChatClient:
    global _client
    if _client is None:
        _client = OpenRouterClient()
    return _client


def _unavailable() -> HTTPException:
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        {"code": "llm_unavailable", "message": "the assistant is unavailable, retry in a moment"},
    )


@router.post("/sips/interpret", response_model=InterpretOut)
async def interpret(
    body: InterpretIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    client: ChatClient = Depends(chat_client),
):
    """What Sipp understood of the request, shown for confirmation before the path is built.
    Pass the (possibly edited) profile back to `POST /sips`."""
    s = get_settings()
    await check_cost(session, user)
    plan = await check_plan(session, user)
    llm = make_llm(client, user_id=user.id)
    if plan["lite"]:
        llm = dataclasses.replace(llm, lite=True)
    try:
        profile = await llm.generate("interpretation", prompts.INTERPRETATION, body.input.strip(), LearningProfile)
    except LLMError as e:
        raise _unavailable() from e
    lo, hi = s.lite_lesson_budget if plan["lite"] else s.lesson_budget.get(profile.scope, s.lesson_budget["standard"])
    return InterpretOut(
        profile=profile.model_dump(),
        lessons_min=lo,
        lessons_max=hi,
        program=profile.breadth == "program" and not plan["lite"],
    )


def _compact(block: dict) -> str:
    return json.dumps(block, ensure_ascii=False)


@router.post("/lessons/{lesson_id}/help", response_model=HelpOut)
async def lesson_help(
    lesson_id: str,
    body: HelpIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    client: ChatClient = Depends(chat_client),
):
    """Explains one block of the lesson again: another way, simpler, an example, the hard
    words, or the learner's own question."""
    lesson = await _own_lesson(session, user, lesson_id)
    if lesson.status != LessonStatus.READY or not lesson.blocks:
        raise HTTPException(status.HTTP_409_CONFLICT, "lesson is not ready")
    if body.block >= len(lesson.blocks):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "no such block")
    if body.kind == "question" and not (body.question or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "question is empty")
    await check_cost(session, user)
    sip = await session.get(Sip, lesson.sip_id)
    profile = sip.profile or {}
    language = profile.get("language", "fr")
    before = lesson.blocks[: body.block]
    user_msg = (
        f"Learner level: {profile.get('current_level', 'unknown')}\n"
        f"Lesson: {lesson.title}\nObjective: {lesson.objective}\n\n"
        "Blocks the learner already read:\n"
        + ("\n".join(_compact(b) for b in before[-6:]) or "(none)")
        + f"\n\nBlock they need help with:\n{_compact(lesson.blocks[body.block])}\n\n"
        f"Request kind: {body.kind}"
        + (f"\nLearner's question:\n<<<\n{body.question.strip()}\n>>>" if body.kind == "question" else "")
    )
    plan = await plan_status(session, user)
    llm = make_llm(client, sip_id=sip.id, lesson_id=lesson.id, user_id=user.id)
    if plan["lite"]:
        llm = dataclasses.replace(llm, lite=True)
    try:
        out = await llm.generate("help", prompts.HELP.format(language=language), user_msg, HelpAnswer, escalate=False)
    except LLMError as e:
        raise _unavailable() from e
    return HelpOut(answer=out.answer)
