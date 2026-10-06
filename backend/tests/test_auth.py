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
