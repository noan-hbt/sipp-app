"""Notions met in finished lessons: the learner's notebook and spaced review (Leitner boxes)."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
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
                created_at=_aware(learned_at),
            )
        )
    return out


async def add_cards(session: AsyncSession, lesson: Lesson, user_id: str, learned_at: datetime) -> None:
    insert = pg_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert
    for card in cards_from_lesson(lesson, user_id, learned_at):
        await session.execute(
            insert(ConceptCard)
            .values(
                user_id=card.user_id,
                sip_id=card.sip_id,
                lesson_id=card.lesson_id,
                name=card.name,
                definition=card.definition,
                explanation=card.explanation,
                due_at=card.due_at,
                created_at=card.created_at,
            )
            .on_conflict_do_nothing(index_elements=["lesson_id", "name"])
        )


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
    for lesson in lessons:
        await add_cards(session, lesson, user.id, lesson.completed_at)
    if lessons:
        await session.commit()


def mastery(card: ConceptCard) -> int:
    """1 = fragile, 2 = on its way, 3 = well learned."""
    if card.box >= 3:
        return 3
    return 2 if card.box >= 1 else 1


def is_due(card: ConceptCard, now: datetime | None = None) -> bool:
    return _aware(card.due_at) <= (now or utcnow())


async def review(session: AsyncSession, card: ConceptCard, knew: bool) -> None:
    now = utcnow()
    if not is_due(card, now):
        return
    box = min(card.box + 1, len(REVIEW_INTERVALS) - 1) if knew else 0
    await session.execute(
        update(ConceptCard)
        .where(ConceptCard.id == card.id, ConceptCard.due_at <= now)
        .values(
            box=box,
            reviews=ConceptCard.reviews + 1,
            lapses=ConceptCard.lapses + (0 if knew else 1),
            last_reviewed_at=now,
            due_at=now + timedelta(days=REVIEW_INTERVALS[box]),
        )
        .execution_options(synchronize_session=False)
    )
