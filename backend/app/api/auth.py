import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    Credentials,
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
    current_user,
    hash_password_async,
    issue_tokens,
    limit_auth_attempts,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password_async,
)
from app import push
from app.billing import live_subscription
from app.concepts import sync_cards
from app.config import get_settings
from app.db import get_session
from app.models import ConceptCard, Lesson, Module, Note, Sip, User
from app.paddle import PaddleClient, PaddleError, get_paddle
from app.plans import plan_status, start_trial
from app.progress import stats
from app.quota import usage

log = logging.getLogger("sipp.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[Depends(limit_auth_attempts)])
async def register(body: Credentials, session: AsyncSession = Depends(get_session)):
    email = body.email.lower()
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(email=email, password_hash=await hash_password_async(body.password))
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
    return await issue_tokens(session, user)


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


@router.post("/logout", status_code=204)
async def logout(body: RefreshIn, session: AsyncSession = Depends(get_session)):
    await revoke_refresh_token(session, body.refresh_token)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
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
        push_enabled=user.push_subscription is not None,
        push_public_key=s.vapid_public_key or None,
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
    await push.send(user, {"title": "Sipp", "body": "C’est comme ça que je te rappellerai ta leçon.", "url": "/"})
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
        "settings": {"daily_goal": user.daily_goal, "reminder_hour": user.reminder_hour, "timezone": user.timezone},
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
