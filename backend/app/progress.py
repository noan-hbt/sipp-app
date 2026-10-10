"""Gamification: stars per lesson and daily streak."""

from datetime import date, timedelta, timezone
import math
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import Score
from app.config import get_settings
from app.models import ConceptCard, Lesson, Module, Sip, User, utcnow

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
        if type_ == "swipe" and block.get("cards"):
            # Each card is its own check: one verdict per card, in order.
            truths = [c.get("is_true") for c in block["cards"]]
            picks = value if isinstance(value, list) else []
            total += len(truths)
            correct += sum(1 for t, v in zip(truths, picks) if isinstance(v, bool) and v == t)
            continue
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


# One missed day per week is forgiven: losing a long streak to a single busy day makes people quit.
FREEZE_EVERY_DAYS = 7


def streak_detail(days: set[date], today: date, freeze: bool = True) -> tuple[int, list[date]]:
    """Active days in a row ending today (or yesterday), and the missed days a freeze bridged."""
    d = today if today in days else today - timedelta(days=1)
    n, frozen = 0, []
    while True:
        if d in days:
            n += 1
        elif (
            freeze and n > 0 and d - timedelta(days=1) in days
            and (not frozen or (frozen[-1] - d).days >= FREEZE_EVERY_DAYS)
        ):
            frozen.append(d)
        else:
            break
        d -= timedelta(days=1)
    return n, frozen


def streak(days: set[date], today: date, freeze: bool = False) -> int:
    """Consecutive active days ending today, or yesterday if nothing done yet today."""
    return streak_detail(days, today, freeze)[0]


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
    days: set[date] = set()
    per_day: dict[date, int] = {}
    for completed_at, _ in rows:
        dt = completed_at if completed_at.tzinfo else completed_at.replace(tzinfo=timezone.utc)
        day = dt.astimezone(zone).date()
        days.add(day)
        per_day[day] = per_day.get(day, 0) + 1
    today = utcnow().astimezone(zone).date()
    monday = today - timedelta(days=today.weekday())
    concepts = await session.scalar(
        select(func.count()).select_from(ConceptCard).where(ConceptCard.user_id == user.id)
    )
    quiz_stars = await session.scalar(
        select(func.coalesce(func.sum(Module.quiz_stars), 0))
        .join(Sip, Sip.id == Module.sip_id)
        .where(Sip.user_id == user.id)
    )
    card_days = (
        await session.scalars(select(ConceptCard.created_at).where(ConceptCard.user_id == user.id))
    ).all()

    def week_of(start: date) -> dict:
        end = start + timedelta(days=7)
        lessons = sum(n for d, n in per_day.items() if start <= d < end)
        notions = sum(
            1 for c in card_days
            if start <= (c if c.tzinfo else c.replace(tzinfo=timezone.utc)).astimezone(zone).date() < end
        )
        return {"lessons": lessons, "minutes": lessons * get_settings().lesson_minutes, "notions": notions,
                "active_days": sum(1 for d in days if start <= d < end)}

    n, frozen = streak_detail(days, today)
    return {
        "streak_days": n,
        "freeze_used": [d.isoformat() for d in frozen],
        "freeze_available": not any((today - d).days < FREEZE_EVERY_DAYS for d in frozen),
        "lessons_today": per_day.get(today, 0),
        "daily_goal": user.daily_goal,
        "this_week": week_of(monday),
        "last_week": week_of(monday - timedelta(days=7)),
        "completed_today": today in days,
        "lessons_completed": len(rows),
        "total_stars": sum(s or 0 for _, s in rows) + bonus + (quiz_stars or 0),
        "week": [monday + timedelta(days=i) in days for i in range(7)],
        "month": today.strftime("%Y-%m"),
        "month_days": sorted(d.day for d in days if (d.year, d.month) == (today.year, today.month)),
        "today": today.day,
        "concepts": concepts or 0,
    }
