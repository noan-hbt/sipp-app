"""Daily reminders by web push. Sent by the worker; a no-op until VAPID keys are set."""

import asyncio
import json
import logging
from datetime import datetime

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Lesson, Sip, User, utcnow
from app.progress import _zone

log = logging.getLogger("sipp.push")

MESSAGES = [
    "Ta leçon de 5 minutes t’attend.",
    "Un Sip avant de passer à autre chose ?",
    "Cinq minutes pour garder ta série.",
]


def enabled() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def _send(subscription: dict, payload: dict) -> int | None:
    """Returns the HTTP status on a delivery error (410/404 = subscription gone), None on success."""
    s = get_settings()
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
            ttl=6 * 3600,
        )
        return None
    except WebPushException as e:
        return e.response.status_code if e.response is not None else 0


async def send(user: User, payload: dict) -> bool:
    """Sends one push; drops the subscription when the browser says it is gone."""
    if not user.push_subscription:
        return False
    status = await asyncio.to_thread(_send, user.push_subscription, payload)
    if status in (404, 410):
        user.push_subscription = None
    elif status is not None:
        log.warning("push to %s failed: HTTP %s", user.id, status)
    return status is None


async def _done_today(session: AsyncSession, user: User, local_today) -> bool:
    zone = _zone(user.timezone or "UTC")
    last = await session.scalar(
        select(Lesson.completed_at)
        .join(Sip, Sip.id == Lesson.sip_id)
        .where(Sip.user_id == user.id, Lesson.completed_at.is_not(None))
        .order_by(Lesson.completed_at.desc())
        .limit(1)
    )
    if last is None:
        return False
    return last.astimezone(zone).date() == local_today


async def send_due_reminders(session: AsyncSession, now: datetime | None = None) -> int:
    """Users whose reminder hour has come in their timezone, who have not learned today yet."""
    now = now or utcnow()
    users = (
        await session.scalars(
            select(User).where(User.reminder_hour.is_not(None), User.push_subscription.is_not(None))
        )
    ).all()
    sent = 0
    for user in users:
        local = now.astimezone(_zone(user.timezone or "UTC"))
        today = local.date().isoformat()
        if local.hour != user.reminder_hour or user.reminded_on == today:
            continue
        user.reminded_on = today
        if await _done_today(session, user, local.date()):
            continue
        body = MESSAGES[local.toordinal() % len(MESSAGES)]
        if await send(user, {"title": "Sipp", "body": body, "url": "/"}):
            sent += 1
    await session.commit()
    return sent
