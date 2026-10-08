from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ConceptOut, ReviewIn, ReviewOut
from app.auth import current_user
from app.concepts import REVIEW_SESSION_SIZE, is_due, mastery, review, sync_cards
from app.db import get_session
from app.models import ConceptCard, Lesson, Sip, User

router = APIRouter(tags=["concepts"])


async def _cards(session: AsyncSession, user: User) -> list[tuple[ConceptCard, Sip, Lesson]]:
    await sync_cards(session, user)
    rows = await session.execute(
        select(ConceptCard, Sip, Lesson)
        .join(Sip, Sip.id == ConceptCard.sip_id)
        .join(Lesson, Lesson.id == ConceptCard.lesson_id)
        .where(ConceptCard.user_id == user.id)
    )
    return [tuple(r) for r in rows.all()]


def _out(card: ConceptCard, sip: Sip, lesson: Lesson) -> ConceptOut:
    return ConceptOut(
        id=card.id,
        name=card.name,
        definition=card.definition,
        explanation=card.explanation,
        sip_id=sip.id,
        sip_title=sip.title or sip.input_text[:80],
        lesson_id=lesson.id,
        lesson_title=lesson.title,
        mastery=mastery(card),
        due=is_due(card),
        learned_at=lesson.completed_at or card.created_at,
        last_reviewed_at=card.last_reviewed_at,
    )


@router.get("/me/concepts", response_model=list[ConceptOut])
async def list_concepts(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Every notion met in a finished lesson, cards due for review first."""
    cards = await _cards(session, user)
    cards.sort(key=lambda r: (not is_due(r[0]), r[0].name.lower()))
    return [_out(*r) for r in cards]


@router.get("/me/review", response_model=ReviewOut)
async def review_session(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Today's review: the cards that are due, oldest first, at most one short session."""
    due = [r for r in await _cards(session, user) if is_due(r[0])]
    due.sort(key=lambda r: r[0].due_at)
    return ReviewOut(due_count=len(due), cards=[_out(*r) for r in due[:REVIEW_SESSION_SIZE]])


@router.post("/me/review/{card_id}", response_model=ConceptOut)
async def review_card(
    card_id: str,
    body: ReviewIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    card = await session.scalar(
        select(ConceptCard)
        .where(ConceptCard.id == card_id, ConceptCard.user_id == user.id)
        .with_for_update()
    )
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "card not found")
    await review(session, card, body.knew)
    await session.commit()
    await session.refresh(card)
    sip = await session.get(Sip, card.sip_id)
    lesson = await session.get(Lesson, card.lesson_id)
    return _out(card, sip, lesson)
