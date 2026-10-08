"""Notions met in finished lessons: the learner's notebook and spaced review (Leitner boxes)."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConceptCard, Lesson, Sip, User, utcnow

# Days until the next review once a card reaches each box.
REVIEW_INTERVALS = [1, 3, 7, 16, 35, 90]
REVIEW_SESSION_SIZE = 5


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def cards_from_lesson(lesson: Lesson, user_id: str, learned_at: datetime) -> list[ConceptCard]:
    """One card per concept block; the same name twice in a lesson keeps the first."""
    seen: set[str] = set()
    out = []
    for b in lesson.blocks or []:
        if b.get("type") != "concept":
            continue
        name = (b.get("name") or "").strip()[:300]
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append(
            ConceptCard(
                user_id=user_id,
                sip_id=lesson.sip_id,
                lesson_id=lesson.id,
                name=name,
                definition=b.get("definition") or "",
                explanation=b.get("explanation"),
                due_at=_aware(learned_at) + timedelta(days=REVIEW_INTERVALS[0]),
            )
        )
    return out


async def sync_cards(session: AsyncSession, user: User) -> None:
    """Creates the cards of finished lessons that have none yet (lessons finished before cards existed)."""
    has_cards = select(ConceptCard.lesson_id).where(ConceptCard.user_id == user.id)
    lessons = (
        (
            await session.execute(
                select(Lesson)
                .join(Sip, Sip.id == Lesson.sip_id)
                .where(
                    Sip.user_id == user.id,
                    Lesson.completed_at.is_not(None),
                    Lesson.id.not_in(has_cards),
                )
            )
        )
        .scalars()
        .all()
    )
    added = False
    for lesson in lessons:
        for card in cards_from_lesson(lesson, user.id, lesson.completed_at):
            session.add(card)
            added = True
    if added:
        await session.commit()


def mastery(card: ConceptCard) -> int:
    """1 = fragile, 2 = on its way, 3 = well learned."""
    if card.box >= 3:
        return 3
    return 2 if card.box >= 1 else 1


def is_due(card: ConceptCard, now: datetime | None = None) -> bool:
    return _aware(card.due_at) <= (now or utcnow())


def review(card: ConceptCard, knew: bool) -> None:
    now = utcnow()
    card.reviews += 1
    card.last_reviewed_at = now
    if knew:
        card.box = min(card.box + 1, len(REVIEW_INTERVALS) - 1)
    else:
        card.box = 0
        card.lapses += 1
    card.due_at = now + timedelta(days=REVIEW_INTERVALS[card.box])
