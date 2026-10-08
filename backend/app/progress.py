"""Gamification: stars per lesson and daily streak."""

from datetime import date, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import Score
from app.models import ConceptCard, Lesson, Sip, User, utcnow


def stars_for(score: Score | None) -> int:
    if score is None or score.total == 0:
        return 3
    ratio = min(score.correct, score.total) / score.total
    if ratio >= 1:
        return 3
    if ratio >= 0.5:
        return 2
    return 1


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
        "total_stars": sum(s or 0 for _, s in rows),
        "week": [monday + timedelta(days=i) in days for i in range(7)],
        "month": today.strftime("%Y-%m"),
        "month_days": sorted(d.day for d in days if (d.year, d.month) == (today.year, today.month)),
        "today": today.day,
        "concepts": concepts or 0,
    }
