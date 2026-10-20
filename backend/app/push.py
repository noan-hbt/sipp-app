"""Daily reminders through Apple Push Notification service. Sent by the worker; a no-op until the APNs key is set."""

import logging
import time
from datetime import datetime

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Lesson, Sip, User, utcnow
from app.progress import _zone

log = logging.getLogger("sipp.push")

# Daily reminders, rotating by day, in the user's interface language (French when unset).
MESSAGES = {
    "fr": [
        "Ta leçon de 5 minutes t’attend.",
        "Un Sip avant de passer à autre chose ?",
        "Cinq minutes pour garder ta série.",
    ],
    "en": [
        "Your 5-minute lesson is waiting.",
        "One Sip before you move on?",
        "Five minutes to keep your streak.",
    ],
}
SAMPLE = {
    "fr": "C’est comme ça que je te rappellerai ta leçon.",
    "en": "This is how I’ll remind you about your lesson.",
}


def _lang(user: User) -> str:
    return user.language if user.language in MESSAGES else "fr"


def sample(user: User) -> str:
    """The test notification, in the user's language."""
    return SAMPLE[_lang(user)]


def enabled() -> bool:
    s = get_settings()
    return bool(s.apns_key_id and s.apns_team_id and s.apns_private_key)


HOSTS = {False: "https://api.push.apple.com", True: "https://api.sandbox.push.apple.com"}
_bearer: tuple[float, str] | None = None
_http: httpx.AsyncClient | None = None


def _token() -> str:
    """Provider token, reused for 50 minutes (Apple refuses one older than an hour, or renewed too often)."""
    global _bearer
    if _bearer is None or time.time() - _bearer[0] > 50 * 60:
        s = get_settings()
        now = time.time()
        # A one-line environment variable carries the .p8 line breaks as \n.
        key = s.apns_private_key.replace("\\n", "\n")
        _bearer = (now, jwt.encode({"iss": s.apns_team_id, "iat": int(now)}, key, algorithm="ES256", headers={"kid": s.apns_key_id}))
    return _bearer[1]


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(http2=True, timeout=15.0)
    return _http


async def _post(token: str, sandbox: bool, payload: dict) -> tuple[int, str]:
    """(HTTP status, Apple's reason) of one delivery."""
    body = {"aps": {"alert": {"title": payload["title"], "body": payload["body"]}, "sound": "default"}, "url": payload.get("url", "/")}
    try:
        r = await _client().post(
            f"{HOSTS[sandbox]}/3/device/{token}",
            json=body,
            headers={
                "authorization": f"bearer {_token()}",
                "apns-topic": get_settings().apns_topic,
                "apns-push-type": "alert",
                "apns-expiration": str(int(time.time()) + 6 * 3600),
            },
        )
    except httpx.HTTPError as e:
        return 0, type(e).__name__
    if r.status_code == 200:
        return 200, ""
    try:
        return r.status_code, r.json().get("reason", "")
    except ValueError:
        return r.status_code, ""


async def send(user: User, payload: dict) -> bool:
    """Sends one push; drops the token when Apple says it is gone.

    Debug and TestFlight builds differ: a token is tried on the production gateway, then on the
    sandbox one, and the gateway that accepts it is remembered."""
    device = user.push_subscription or {}
    token = device.get("apns")
    if not token:
        return False
    sandbox = bool(device.get("sandbox"))
    status, reason = await _post(token, sandbox, payload)
    if status == 400 and reason == "BadDeviceToken":
        status, reason = await _post(token, not sandbox, payload)
        if status == 200:
            user.push_subscription = {"apns": token, "sandbox": not sandbox}
    if status == 410 or (status == 400 and reason in ("BadDeviceToken", "DeviceTokenNotForTopic")):
        user.push_subscription = None
    elif status != 200:
        log.warning("push to %s failed: HTTP %s %s", user.id, status, reason)
    return status == 200


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
        messages = MESSAGES[_lang(user)]
        body = messages[local.toordinal() % len(messages)]
        if await send(user, {"title": "Sipp", "body": body, "url": "/"}):
            sent += 1
    await session.commit()
    return sent
