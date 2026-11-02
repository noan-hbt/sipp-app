"""The "come back" email: sent by the worker once per break, a few days after the last lesson.

One email per break (nudged_at after the last activity), at the learner's local evening hour, and only
for recent breaks so that turning it on never mails every account that left long ago.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import emails
from app.config import get_settings
from app.models import Lesson, Sip, SipStatus, User, utcnow
from app.progress import _zone


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


async def next_lesson(session: AsyncSession, user: User) -> tuple[str | None, str | None, str | None]:
    """(sip title, lesson title, lesson id) to pick up: the Sip last learned in, else the newest ready one."""
    sip_id = await session.scalar(
        select(Lesson.sip_id)
        .join(Sip, Sip.id == Lesson.sip_id)
        .where(Sip.user_id == user.id, Lesson.completed_at.is_not(None))
        .order_by(Lesson.completed_at.desc())
        .limit(1)
    )
    if sip_id is None:
        sip_id = await session.scalar(
            select(Sip.id).where(Sip.user_id == user.id, Sip.status == SipStatus.READY).order_by(Sip.created_at.desc()).limit(1)
        )
    if sip_id is None:
        return None, None, None
    sip = await session.get(Sip, sip_id)
    lesson = await session.scalar(
        select(Lesson).where(Lesson.sip_id == sip_id, Lesson.completed_at.is_(None)).order_by(Lesson.global_index).limit(1)
    )
    if sip is None or lesson is None:
        return None, None, None
    return sip.title or sip.input_text[:80], lesson.title, lesson.id


async def send_due_nudges(session: AsyncSession, now: datetime | None = None) -> int:
    s = get_settings()
    now = now or utcnow()
    after = timedelta(days=s.nudge_after_days)
    window = timedelta(days=s.nudge_window_days)
    last = (
        select(Sip.user_id.label("user_id"), func.max(Lesson.completed_at).label("last"))
        .join(Lesson, Lesson.sip_id == Sip.id)
        .where(Lesson.completed_at.is_not(None))
        .group_by(Sip.user_id)
        .subquery()
    )
    rows = (
        await session.execute(
            select(User, last.c.last)
            .outerjoin(last, last.c.user_id == User.id)
            .where(User.email_nudges.is_(True), User.created_at <= now - after)
        )
    ).all()
    sent = 0
    for user, last_lesson in rows:
        activity = _aware(last_lesson or user.created_at)
        if not (now - window <= activity <= now - after):
            continue
        if user.nudged_at is not None and _aware(user.nudged_at) >= activity:
            continue
        if now.astimezone(_zone(user.timezone or "Europe/Paris")).hour != s.nudge_local_hour:
            continue
        user.nudged_at = now  # before sending: a failed send is not retried every 5 minutes
        await session.commit()
        sip_title, lesson_title, lesson_id = await next_lesson(session, user)
        if await emails.send(emails.nudge(user, sip_title, lesson_title, lesson_id)):
            sent += 1
    return sent
