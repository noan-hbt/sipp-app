from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    Credentials,
    DeleteAccountIn,
    PlanOut,
    RefreshIn,
    StatsOut,
    TokenOut,
    UsageOut,
    UserOut,
)
from app.auth import (
    current_user,
    hash_password,
    issue_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from app.db import get_session
from app.models import Lesson, Module, Sip, User
from app.plans import plan_status, start_trial
from app.progress import stats
from app.quota import usage

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: Credentials, session: AsyncSession = Depends(get_session)):
    email = body.email.lower()
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(email=email, password_hash=hash_password(body.password))
    session.add(user)
    await session.flush()
    return await issue_tokens(session, user)


@router.post("/login", response_model=TokenOut)
async def login(body: Credentials, session: AsyncSession = Depends(get_session)):
    user = (
        await session.execute(select(User).where(User.email == body.email.lower()))
    ).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    return await issue_tokens(session, user)


@router.post("/refresh", response_model=TokenOut)
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
    """Streak and stars. `tz` is the device's IANA timezone (e.g. Europe/Paris)."""
    return await stats(session, user, tz)


@router.get("/me/plan", response_model=PlanOut)
async def me_plan(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Plan, library slots and monthly generations."""
    return await plan_status(session, user)


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
    }


@router.delete("/me", status_code=204)
async def delete_account(
    body: DeleteAccountIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    """Permanently deletes the account and all its data (sips, lessons, tokens)."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid password")
    await session.execute(delete(User).where(User.id == user.id))  # FK cascades
    await session.commit()
