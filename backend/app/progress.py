"""Gamification: stars per lesson and daily streak."""

from datetime import date, timedelta, timezone
import math
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import Score
from app.models import ConceptCard, Lesson, Sip, User, utcnow

# Stars earned once every lesson of a module is finished.
MODULE_BONUS = 3


def finished_modules(lessons: list[tuple[str, bool]]) -> set[str]:
    """Module ids whose lessons are all completed, from (module_id, completed) pairs."""
    open_ = {m for m, done in lessons if not done}
    return {m for m, _ in lessons} - open_


def stars_for(score: Score | None) -> int:
    if score is None or score.total == 0:
        return 3
    ratio = min(score.correct, score.total) / score.total
    if ratio >= 1:
        return 3
    if ratio >= 0.5:
        return 2
    return 1


def score_for(blocks: list[dict], answers: list[dict], fallback: Score | None) -> Score | None:
    by_block = {a["block"]: a for a in answers}
    correct = total = 0
    for i, block in enumerate(blocks):
        answer = by_block.get(i, {})
        value = answer.get("value", answer.get("choice"))
        type_ = block.get("type")
        kind = block.get("kind")
        if type_ == "question" and kind in ("single_choice", "multiple_choice") and block.get("correct_option_ids"):
            if isinstance(value, str):
                value = [value]
            ok = (
                isinstance(value, list) and all(isinstance(v, str) for v in value)
                and len(value) == len(set(value)) and set(value) == set(block["correct_option_ids"])
            )
        elif type_ == "question" and kind == "true_false" and isinstance(block.get("answer"), bool):
            ok = isinstance(value, bool) and value == block["answer"]
        elif type_ == "misconception" and isinstance(block.get("is_true"), bool):
            ok = isinstance(value, bool) and value == block["is_true"]
        elif type_ == "fill_blanks" and block.get("blanks"):
            expected = [b["answer"].strip().casefold() for b in block["blanks"]]
            ok = (
                isinstance(value, list) and all(isinstance(v, str) for v in value)
                and [v.strip().casefold() for v in value] == expected
            )
        elif type_ == "estimate" and isinstance(block.get("answer"), (int, float)):
            ok = (
                isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
                and abs(value - block["answer"]) <= block.get("tolerance", 0)
            )
        else:
            continue
        total += 1
        correct += bool(ok)
    return Score(correct=correct, total=total) if total else fallback


def _zone(tz: str):
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def streak(days: set[date], today: date) -> int:
    """Consecutive days ending today, or yesterday if nothing done yet today."""
    start = today if today in days else today - timedelta(days=1)
    n = 0
    while start - timedelta(days=n) in days:
        n += 1
    return n


async def stats(session: AsyncSession, user: User, tz: str = "UTC") -> dict:
    zone = _zone(tz)
    rows = (
        await session.execute(
            select(Lesson.completed_at, Lesson.stars)
            .join(Sip, Sip.id == Lesson.sip_id)
            .where(Sip.user_id == user.id, Lesson.completed_at.is_not(None))
        )
    ).all()
    modules = (
        await session.execute(
            select(Lesson.module_id, Lesson.completed_at.is_not(None))
            .join(Sip, Sip.id == Lesson.sip_id)
            .where(Sip.user_id == user.id)
        )
    ).all()
    bonus = MODULE_BONUS * len(finished_modules([(m, bool(d)) for m, d in modules]))
    days = set()
    for completed_at, _ in rows:
        dt = completed_at if completed_at.tzinfo else completed_at.replace(tzinfo=timezone.utc)
        days.add(dt.astimezone(zone).date())
    today = utcnow().astimezone(zone).date()
    monday = today - timedelta(days=today.weekday())
    concepts = await session.scalar(
        select(func.count()).select_from(ConceptCard).where(ConceptCard.user_id == user.id)
    )
    return {
        "streak_days": streak(days, today),
        "completed_today": today in days,
        "lessons_completed": len(rows),
        "total_stars": sum(s or 0 for _, s in rows) + bonus,
        "week": [monday + timedelta(days=i) in days for i in range(7)],
        "month": today.strftime("%Y-%m"),
        "month_days": sorted(d.day for d in days if (d.year, d.month) == (today.year, today.month)),
        "today": today.day,
        "concepts": concepts or 0,
    }
