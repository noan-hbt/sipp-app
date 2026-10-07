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
    from app.models import LLMCall

    for _ in range(2):  # no daily Sip cap anymore: plans limit generations
        assert (await auth_client.post("/sips", json={"input": "taux"})).status_code == 202

    sip_id = (await auth_client.get("/sips")).json()[0]["id"]
    async with SessionLocal() as s:
        s.add(LLMCall(stage="curriculum", model="m", sip_id=sip_id, cost=5.0))
        await s.commit()
    u = (await auth_client.get("/auth/me/usage")).json()
    assert u["sips_last_24h"] == 2 and u["cost_last_24h_usd"] == 5.0
    r = await auth_client.post("/sips", json={"input": "taux"})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "daily_budget_reached"
