from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import Credentials, RefreshIn, TokenOut, UserOut
from app.auth import (
    current_user,
    hash_password,
    issue_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from app.db import get_session
from app.models import User

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
