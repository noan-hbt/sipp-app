import asyncio
import threading

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app import auth
from app.config import get_settings
from app.db import SessionLocal
from app.models import RefreshToken, User


async def test_register_login_refresh_logout(client):
    r = await client.post("/auth/register", json={"email": "Me@X.io", "password": "password123"})
    assert r.status_code == 201
    tokens = r.json()

    assert (await client.post("/auth/register", json={"email": "me@x.io", "password": "password123"})).status_code == 409
    assert (await client.post("/auth/login", json={"email": "me@x.io", "password": "wrongpass1"})).status_code == 401
    assert (await client.post("/auth/login", json={"email": "me@x.io", "password": "password123"})).status_code == 200

    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.json()["email"] == "me@x.io"
    assert (await client.get("/auth/me")).status_code == 401
    assert (await client.get("/auth/me", headers={"Authorization": "Bearer junk"})).status_code == 401

    # refresh rotates: old refresh token becomes invalid
    r = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert (await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401

    # refresh token cannot be used as access token
    h = {"Authorization": f"Bearer {new['refresh_token']}"}
    assert (await client.get("/auth/me", headers=h)).status_code == 401

    assert (await client.post("/auth/logout", json={"refresh_token": new["refresh_token"]})).status_code == 204
    assert (await client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})).status_code == 401


async def test_delete_account_cascades(auth_client):
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import RefreshToken, Sip, User

    await auth_client.post("/sips", json={"input": "taux"})
    r = await auth_client.request("DELETE", "/auth/me", json={"password": "wrong-pass"})
    assert r.status_code == 403
    r = await auth_client.request("DELETE", "/auth/me", json={"password": "password123"})
    assert r.status_code == 204
    assert (await auth_client.get("/auth/me")).status_code == 401
    async with SessionLocal() as s:
        for model in (User, Sip, RefreshToken):
            assert await s.scalar(select(func.count()).select_from(model)) == 0


async def test_daily_limits(auth_client, monkeypatch):
    from app.db import SessionLocal
    from app.models import LLMCall, Sip

    for _ in range(2):  # no daily Sip cap anymore: plans limit generations
        assert (await auth_client.post("/sips", json={"input": "taux"})).status_code == 202

    sip_id = (await auth_client.get("/sips")).json()[0]["id"]
    async with SessionLocal() as s:
        sip = await s.get(Sip, sip_id)
        s.add(LLMCall(stage="curriculum", model="m", sip_id=sip_id, user_id=sip.user_id, cost=5.0))
        await s.commit()
    u = (await auth_client.get("/auth/me/usage")).json()
    assert u["sips_last_24h"] == 2 and u["cost_last_24h_usd"] == 5.0
    r = await auth_client.post("/sips", json={"input": "taux"})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "daily_budget_reached"


async def test_refresh_consumed_once(client):
    tokens = (await client.post("/auth/register", json={"email": "race@x.io", "password": "password123"})).json()
    responses = await asyncio.gather(*(
        client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        for _ in range(2)
    ))
    assert sorted(r.status_code for r in responses) == [200, 401]
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(RefreshToken)) == 2
        assert await s.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.revoked_at.is_(None))) == 1


@pytest.mark.parametrize("secret", ["", " ", "short", "change-me", "x" * 31])
def test_invalid_jwt_secret(secret, monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "prod")
    monkeypatch.setattr(get_settings(), "jwt_secret", secret)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        auth.validate_jwt_secret()


@pytest.mark.parametrize("algorithm, minimum", [("HS256", 32), ("HS384", 48), ("HS512", 64)])
def test_jwt_secret_minimum(algorithm, minimum, monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "prod")
    monkeypatch.setattr(get_settings(), "jwt_algorithm", algorithm)
    monkeypatch.setattr(get_settings(), "jwt_secret", "x" * minimum)
    auth.validate_jwt_secret()
    monkeypatch.setattr(get_settings(), "jwt_secret", "x" * (minimum - 1))
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        auth.validate_jwt_secret()


@pytest.mark.parametrize("endpoint", ["register", "login", "refresh"])
async def test_token_encoding_failure_rolls_back(client, monkeypatch, endpoint):
    credentials = {"email": "encode@x.io", "password": "password123"}
    tokens = None
    if endpoint != "register":
        tokens = (await client.post("/auth/register", json=credentials)).json()

    def fail(_):
        raise RuntimeError("encoding failed")

    monkeypatch.setattr(auth, "create_access_token", fail)
    body = {"refresh_token": tokens["refresh_token"]} if endpoint == "refresh" else credentials
    with pytest.raises(RuntimeError, match="encoding failed"):
        await client.post(f"/auth/{endpoint}", json=body)
    async with SessionLocal() as s:
        expected = int(endpoint != "register")
        assert await s.scalar(select(func.count()).select_from(User)) == expected
        assert await s.scalar(select(func.count()).select_from(RefreshToken)) == expected
        assert await s.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.revoked_at.is_not(None))) == 0


async def test_register_collision_returns_conflict(client, monkeypatch):
    both_checked = asyncio.Event()
    checked = 0

    async def delayed_hash(password):
        nonlocal checked
        checked += 1
        if checked == 2:
            both_checked.set()
        await asyncio.wait_for(both_checked.wait(), timeout=2)
        return await auth.hash_password_async(password)

    monkeypatch.setattr("app.api.auth.hash_password_async", delayed_hash)
    responses = await asyncio.gather(*(
        client.post("/auth/register", json={"email": "same@x.io", "password": "password123"})
        for _ in range(2)
    ))
    assert sorted(r.status_code for r in responses) == [201, 409]
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(User)) == 1
        assert await s.scalar(select(func.count()).select_from(RefreshToken)) == 1


async def test_register_preserves_other_integrity_errors(client, monkeypatch):
    async def invalid_hash(_):
        return None

    monkeypatch.setattr("app.api.auth.hash_password_async", invalid_hash)
    with pytest.raises(IntegrityError, match="users.password_hash"):
        await client.post("/auth/register", json={"email": "invalid@x.io", "password": "password123"})
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize("endpoint", ["register", "login", "refresh"])
async def test_auth_rate_limit(client, monkeypatch, endpoint):
    monkeypatch.setattr(get_settings(), "auth_rate_limits", {"register": 2, "login": 2, "refresh": 2})
    monkeypatch.setattr(auth, "monotonic", lambda: 100)
    body = {"refresh_token": "invalid"} if endpoint == "refresh" else {"email": "limit@x.io", "password": "password123"}
    for i in range(2):
        assert (await client.post(f"/auth/{endpoint}", json=body, headers={"X-Forwarded-For": f"198.51.100.{i}"})).status_code != 429
    response = await client.post(f"/auth/{endpoint}", json=body, headers={"X-Forwarded-For": "198.51.100.99"})
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "auth_rate_limited"
    assert response.headers["Retry-After"] == "60"


async def test_auth_rate_limit_per_ip_and_cleanup(client, monkeypatch):
    from starlette.requests import Request

    monkeypatch.setattr(get_settings(), "auth_rate_limits", {"register": 1, "login": 1, "refresh": 1})
    now = 100
    monkeypatch.setattr(auth, "monotonic", lambda: now)

    def request(ip):
        return Request({"type": "http", "path": "/auth/login", "headers": [], "client": (ip, 1)})

    await auth.limit_auth_attempts(request("198.51.100.1"))
    await auth.limit_auth_attempts(request("198.51.100.2"))
    with pytest.raises(HTTPException) as exc:
        await auth.limit_auth_attempts(request("198.51.100.1"))
    assert exc.value.status_code == 429
    now = 161
    await auth.limit_auth_attempts(request("198.51.100.1"))
    assert len(auth._auth_attempts) == 1


async def test_password_work_is_off_loop_and_bounded(monkeypatch):
    release = threading.Event()
    entered = threading.Event()
    lock = threading.Lock()
    threads = []

    def work(result):
        with lock:
            threads.append(threading.get_ident())
            if len(threads) == get_settings().auth_password_workers:
                entered.set()
        assert release.wait(5)
        return result

    monkeypatch.setattr(auth, "hash_password", lambda _: work("hashed"))
    monkeypatch.setattr(auth, "verify_password", lambda *_: work(True))
    first = asyncio.create_task(auth.hash_password_async("password123"))
    second = asyncio.create_task(auth.verify_password_async("password123", "hash"))
    try:
        assert await asyncio.wait_for(asyncio.to_thread(entered.wait, 2), timeout=3)
        assert all(thread != threading.get_ident() for thread in threads)
        # A third call waits for a free slot instead of failing.
        third = asyncio.create_task(auth.hash_password_async("password123"))
        await asyncio.sleep(0.2)
        assert not third.done() and len(threads) == get_settings().auth_password_workers
        release.set()
        assert await asyncio.wait_for(third, 5) == "hashed"
    finally:
        release.set()
        await asyncio.gather(first, second, return_exceptions=True)
        await asyncio.sleep(0.01)
