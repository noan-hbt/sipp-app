import asyncio
import hashlib
import math
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from time import monotonic

import jwt
import sentry_sdk
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import RefreshToken, User, utcnow

_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)
_password_pool = ThreadPoolExecutor(max_workers=get_settings().auth_password_workers)
_password_slots = asyncio.BoundedSemaphore(get_settings().auth_password_workers)
_auth_attempts: dict[tuple[str, str], tuple[int, float]] = {}


def validate_jwt_secret() -> None:
    s = get_settings()
    if s.env == "dev" and s.jwt_secret == "change-me":
        return
    minimum = {"HS256": 32, "HS384": 48, "HS512": 64}.get(s.jwt_algorithm, 1)
    if not s.jwt_secret.strip() or len(s.jwt_secret.encode()) < minimum:
        raise RuntimeError(f"JWT_SECRET must contain at least {minimum} bytes")


async def limit_auth_attempts(request: Request) -> None:
    s = get_settings()
    now = monotonic()
    for key, (_, until) in list(_auth_attempts.items()):
        if until <= now:
            del _auth_attempts[key]
    endpoint = request.url.path.rsplit("/", 1)[-1]
    key = (endpoint, request.client.host if request.client else "unknown")
    count, until = _auth_attempts.get(key, (0, now + s.auth_rate_limit_window_seconds))
    if count >= s.auth_rate_limits[endpoint]:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"code": "auth_rate_limited"},
            headers={"Retry-After": str(max(1, math.ceil(until - now)))},
        )
    _auth_attempts[key] = (count + 1, until)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


async def _password_work(function, *args):
    # Wait for a free hashing slot: bounds CPU without failing a login in a burst.
    await _password_slots.acquire()
    future = asyncio.get_running_loop().run_in_executor(_password_pool, function, *args)
    future.add_done_callback(lambda _: _password_slots.release())
    return await asyncio.shield(future)


async def hash_password_async(password: str) -> str:
    return await _password_work(hash_password, password)


async def verify_password_async(password: str, password_hash: str) -> bool:
    return await _password_work(verify_password, password, password_hash)


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
    access = create_access_token(user.id)
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
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": s.access_token_minutes * 60,
    }


async def rotate_refresh_token(session: AsyncSession, refresh: str) -> dict:
    now = utcnow()
    user_id = (
        await session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.token_hash == _sha256(refresh),
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            )
            .values(revoked_at=now)
            .returning(RefreshToken.user_id)
        )
    ).scalar_one_or_none()
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    user = await session.get(User, user_id)
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
    sentry_sdk.set_user({"id": user.id})  # id only, never the email
    return user
