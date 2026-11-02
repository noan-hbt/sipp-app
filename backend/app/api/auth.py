import logging
import secrets
from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    ChangePasswordIn,
    Credentials,
    ForgotPasswordIn,
    ResetPasswordIn,
    UnsubscribeIn,
    DeleteAccountIn,
    PlanInfo,
    PlanOut,
    PushIn,
    RefreshIn,
    SettingsIn,
    SettingsOut,
    StatsOut,
    TokenOut,
    UsageOut,
    UserOut,
)
from app.auth import (
    _sha256,
    current_user,
    hash_password_async,
    issue_tokens,
    limit_auth_attempts,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password_async,
)
from app import emails, push
from app.billing import live_subscription
from app.concepts import sync_cards
from app.config import get_settings
from app.db import get_session
from app.models import ConceptCard, Lesson, Module, Note, PasswordReset, RefreshToken, Sip, User, utcnow
from app.paddle import PaddleClient, PaddleError, get_paddle
from app.plans import FREE_FEATURES, plan_status, start_trial
from app.progress import stats
from app.quota import usage

log = logging.getLogger("sipp.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[Depends(limit_auth_attempts)])
async def register(body: Credentials, background: BackgroundTasks, session: AsyncSession = Depends(get_session)):
    email = body.email.lower()
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(email=email, password_hash=await hash_password_async(body.password), language=body.language)
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        if str(exc.orig) == "UNIQUE constraint failed: users.email" or (
            getattr(exc.orig, "sqlstate", None) == "23505"
            and getattr(exc.orig.__cause__, "constraint_name", None) == "ix_users_email"
        ):
            raise HTTPException(status.HTTP_409_CONFLICT, "email already registered") from exc
        raise
    tokens = await issue_tokens(session, user)
    background.add_task(emails.send, emails.welcome(user))
    return tokens


@router.post("/login", response_model=TokenOut, dependencies=[Depends(limit_auth_attempts)])
async def login(body: Credentials, session: AsyncSession = Depends(get_session)):
    user = (
        await session.execute(select(User).where(User.email == body.email.lower()))
    ).scalar_one_or_none()
    if user is None or not await verify_password_async(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    return await issue_tokens(session, user)


@router.post("/refresh", response_model=TokenOut, dependencies=[Depends(limit_auth_attempts)])
async def refresh(body: RefreshIn, session: AsyncSession = Depends(get_session)):
    return await rotate_refresh_token(session, body.refresh_token)


async def _set_password(session: AsyncSession, user: User, password: str) -> None:
    """New password: every session and pending reset link is revoked (the caller issues a fresh session)."""
    now = utcnow()
    user.password_hash = await hash_password_async(password)
    await session.execute(
        update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now)
    )
    await session.execute(
        update(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None)).values(used_at=now)
    )


@router.post("/password/forgot", status_code=204, dependencies=[Depends(limit_auth_attempts)])
async def forgot_password(body: ForgotPasswordIn, background: BackgroundTasks, session: AsyncSession = Depends(get_session)):
    """Emails a one-time link to choose a new password. Same answer whether the account exists or not."""
    s = get_settings()
    user = (await session.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if user is None:
        return
    now = utcnow()
    recent = await session.scalar(
        select(PasswordReset.id).where(PasswordReset.user_id == user.id, PasswordReset.created_at > now - timedelta(minutes=1))
    )
    if recent is not None:  # a double tap sends one email
        return
    token = secrets.token_urlsafe(32)
    session.add(PasswordReset(user_id=user.id, token_hash=_sha256(token), expires_at=now + timedelta(minutes=s.password_reset_minutes)))
    await session.commit()
    background.add_task(emails.send, emails.password_reset(user, token, s.password_reset_minutes))


@router.post("/password/reset", response_model=TokenOut, dependencies=[Depends(limit_auth_attempts)])
async def reset_password(body: ResetPasswordIn, background: BackgroundTasks, session: AsyncSession = Depends(get_session)):
    """Sets the new password from an emailed link, signs out every device, and signs this one in."""
    now = utcnow()
    user_id = (
        await session.execute(
            update(PasswordReset)
            .where(PasswordReset.token_hash == _sha256(body.token), PasswordReset.used_at.is_(None), PasswordReset.expires_at > now)
            .values(used_at=now)
            .returning(PasswordReset.user_id)
        )
    ).scalar_one_or_none()
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, {"code": "reset_link_invalid", "message": "this link is invalid or expired"})
    await _set_password(session, user, body.password)
    tokens = await issue_tokens(session, user)
    background.add_task(emails.send, emails.password_changed(user))
    return tokens


@router.post("/me/password", response_model=TokenOut, dependencies=[Depends(limit_auth_attempts)])
async def change_password(
    body: ChangePasswordIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Changes the password; other devices are signed out, this one gets a fresh session."""
    if not await verify_password_async(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid password")
    await _set_password(session, user, body.new_password)
    tokens = await issue_tokens(session, user)
    background.add_task(emails.send, emails.password_changed(user))
    return tokens


@router.post("/email/unsubscribe", status_code=204)
async def unsubscribe(body: UnsubscribeIn, session: AsyncSession = Depends(get_session)):
    """The link at the bottom of a reminder email: no sign-in needed, it only turns those emails off."""
    user_id = emails.read_unsubscribe_token(body.token)
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, {"code": "unsubscribe_link_invalid", "message": "invalid link"})
    user.email_nudges = False
    await session.commit()


@router.post("/logout", status_code=204)
async def logout(body: RefreshIn, session: AsyncSession = Depends(get_session)):
    await revoke_refresh_token(session, body.refresh_token)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return user


@router.post("/me/ai-consent", response_model=UserOut)
async def ai_consent(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """The user agrees that their requests are sent to AI model providers to write lessons."""
    if user.ai_consent_at is None:
        user.ai_consent_at = utcnow()
        await session.commit()
    return user


@router.get("/me/usage", response_model=UsageOut)
async def me_usage(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    return await usage(session, user)


@router.get("/me/stats", response_model=StatsOut)
async def me_stats(
    tz: str = "UTC", user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Streak, stars and this month's active days. `tz` is the device's IANA timezone (e.g. Europe/Paris)."""
    moved = False
    if tz != "UTC" and tz != user.timezone:
        try:
            ZoneInfo(tz)
            user.timezone = tz  # reminders fire at the learner's local hour
            moved = True
        except (ZoneInfoNotFoundError, ValueError):
            pass
    await sync_cards(session, user)
    out = await stats(session, user, tz)
    if moved:
        await session.commit()
    return out


def _settings_out(user: User) -> SettingsOut:
    s = get_settings()
    return SettingsOut(
        daily_goal=user.daily_goal,
        reminder_hour=user.reminder_hour,
        timezone=user.timezone,
        language=user.language,
        push_enabled=user.push_subscription is not None,
        push_public_key=s.vapid_public_key or None,
        email_nudges=user.email_nudges,
    )


@router.get("/me/settings", response_model=SettingsOut)
async def get_settings_(user: User = Depends(current_user)):
    """Daily goal and reminder."""
    return _settings_out(user)


@router.put("/me/settings", response_model=SettingsOut)
async def put_settings(body: SettingsIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if body.daily_goal is not None:
        user.daily_goal = body.daily_goal
    if body.reminder_hour is not None:
        user.reminder_hour = None if body.reminder_hour < 0 else body.reminder_hour
        user.reminded_on = None
    if body.timezone:
        try:
            ZoneInfo(body.timezone)
            user.timezone = body.timezone
        except (ZoneInfoNotFoundError, ValueError) as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "unknown timezone") from e
    if body.language:
        user.language = body.language
    if body.email_nudges is not None:
        user.email_nudges = body.email_nudges
    await session.commit()
    return _settings_out(user)


@router.put("/me/push", response_model=SettingsOut)
async def put_push(body: PushIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Stores this device's web push subscription (one device per account)."""
    if not body.endpoint.startswith("https://") or not {"p256dh", "auth"} <= set(body.keys):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid push subscription")
    user.push_subscription = {"endpoint": body.endpoint, "keys": {k: body.keys[k] for k in ("p256dh", "auth")}}
    await session.commit()
    return _settings_out(user)


@router.delete("/me/push", response_model=SettingsOut)
async def delete_push(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    user.push_subscription = None
    await session.commit()
    return _settings_out(user)


@router.post("/me/push/test", status_code=204)
async def test_push(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Sends a sample reminder right away, so the learner sees what it looks like."""
    if not push.enabled() or not user.push_subscription:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "push_off", "message": "notifications are off"})
    await push.send(user, {"title": "Sipp", "body": push.sample(user), "url": "/"})
    await session.commit()


@router.get("/me/plan", response_model=PlanOut)
async def me_plan(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Plan, library slots and monthly generations."""
    return await plan_status(session, user)


@router.get("/plans", response_model=list[PlanInfo])
async def list_plans():
    """The public plans and their limits (the internal team plan is left out)."""
    s = get_settings()
    def hours(p: dict) -> float:
        lessons = sum(s.lite_lesson_budget) / 2 if p["lite"] else s.typical_lessons_per_sip
        return round(int(p["sips_per_month"]) * lessons * s.lesson_minutes / 60, 1)

    return [
        PlanInfo(
            name=name, slots=int(p["slots"]), sips_per_month=int(p["sips_per_month"]),
            lite=bool(p["lite"]), hours_per_month=hours(p), prices=s.plan_prices.get(name, {}),
            features={**FREE_FEATURES, **s.plan_features.get(name, {})},
        )
        for name, p in s.plans.items()
        if name != "max"
    ]


@router.post("/me/trial", response_model=PlanOut)
async def me_trial(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Starts the one-time free trial of the paid plan."""
    start_trial(user)
    await session.commit()
    return await plan_status(session, user)


@router.get("/me/export")
async def me_export(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """All the user's data as JSON (GDPR portability)."""
    sips = (await session.execute(select(Sip).where(Sip.user_id == user.id).order_by(Sip.created_at))).scalars().all()
    ids = [x.id for x in sips]
    modules = (await session.execute(select(Module).where(Module.sip_id.in_(ids)))).scalars().all() if ids else []
    lessons = (await session.execute(select(Lesson).where(Lesson.sip_id.in_(ids)))).scalars().all() if ids else []
    cards = (await session.execute(select(ConceptCard).where(ConceptCard.user_id == user.id))).scalars().all()
    notes = (await session.execute(select(Note).where(Note.user_id == user.id).order_by(Note.created_at))).scalars().all()
    titles = {l.id: l.title for l in lessons}

    def lesson_out(l: Lesson) -> dict:
        return {
            "key": l.key,
            "title": l.title,
            "objective": l.objective,
            "blocks": l.blocks,
            "answers": l.answers,
            "stars": l.stars,
            "completed_at": l.completed_at,
        }

    return {
        "account": {"email": user.email, "created_at": user.created_at, "plan": user.plan},
        "sips": [
            {
                "title": x.title,
                "request": x.input_text,
                "created_at": x.created_at,
                "summary": x.summary,
                "modules": [
                    {
                        "title": m.title,
                        "lessons": [
                            lesson_out(l)
                            for l in sorted(lessons, key=lambda l: l.position)
                            if l.module_id == m.id
                        ],
                    }
                    for m in sorted(modules, key=lambda m: m.position)
                    if m.sip_id == x.id
                ],
            }
            for x in sips
        ],
        "notions": [
            {
                "name": c.name,
                "definition": c.definition,
                "reviews": c.reviews,
                "next_review": c.due_at,
            }
            for c in sorted(cards, key=lambda c: c.name.lower())
        ],
        "notes": [
            {"lesson": titles.get(n.lesson_id), "quote": n.quote, "text": n.text, "created_at": n.created_at}
            for n in notes
        ],
        "settings": {
            "daily_goal": user.daily_goal, "reminder_hour": user.reminder_hour, "timezone": user.timezone,
            "email_reminders": user.email_nudges,
        },
    }


@router.delete("/me", status_code=204)
async def delete_account(
    body: DeleteAccountIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    paddle: PaddleClient = Depends(get_paddle),
):
    """Permanently deletes the account and all its data (sips, lessons, tokens).

    A running subscription is cancelled at Paddle first, so a deleted account is never billed
    again; billing records stay, detached from the user, for accounting."""
    if not await verify_password_async(body.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid password")
    sub = await live_subscription(session, user.id)
    if sub is not None:
        try:
            await paddle.cancel_subscription(sub.id)
        except PaddleError as e:
            log.error("cancel %s before account deletion failed: %s", sub.id, e)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                {"code": "billing_cancel_failed", "message": "subscription could not be cancelled, retry later"},
            ) from e
        sub.status = "canceled"
    await session.execute(delete(User).where(User.id == user.id))  # FK cascades
    await session.commit()
