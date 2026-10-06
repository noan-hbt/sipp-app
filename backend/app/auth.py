import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import RefreshToken, User, utcnow

_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(user_id: str) -> str:
    s = get_settings()
    now = utcnow()
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=s.access_token_minutes),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


async def issue_tokens(session: AsyncSession, user: User) -> dict:
    s = get_settings()
    refresh = secrets.token_urlsafe(48)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_sha256(refresh),
            expires_at=utcnow() + timedelta(days=s.refresh_token_days),
        )
    )
    await session.commit()
    return {
        "access_token": create_access_token(user.id),
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": s.access_token_minutes * 60,
    }


async def rotate_refresh_token(session: AsyncSession, refresh: str) -> dict:
    row = (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == _sha256(refresh)))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None or _aware(row.expires_at) < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    row.revoked_at = utcnow()
    user = await session.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    return await issue_tokens(session, user)


async def revoke_refresh_token(session: AsyncSession, refresh: str) -> None:
    row = (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == _sha256(refresh)))
    ).scalar_one_or_none()
    if row is not None and row.revoked_at is None:
        row.revoked_at = utcnow()
        await session.commit()


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "not authenticated", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    s = get_settings()
    try:
        payload = jwt.decode(creds.credentials, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        raise unauthorized
    if payload.get("type") != "access":
        raise unauthorized
    user = await session.get(User, payload.get("sub"))
    if user is None:
        raise unauthorized
    return user
