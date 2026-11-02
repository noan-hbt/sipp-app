from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app import emails, nudges
from app.db import SessionLocal
from app.models import Lesson, Module, PasswordReset, Sip, SipStatus, User, utcnow


@pytest.fixture
def outbox(monkeypatch):
    sent: list[emails.Email] = []

    async def deliver(email):
        sent.append(email)
        return True

    monkeypatch.setattr(emails, "_deliver", deliver)
    return sent


def _token_from(email: emails.Email) -> str:
    return email.text.split("token=")[1].split()[0]


async def test_register_sends_welcome_in_language(client, outbox):
    r = await client.post("/auth/register", json={"email": "w@x.io", "password": "password123", "language": "en"})
    assert r.status_code == 201
    assert [e.kind for e in outbox] == ["welcome"]
    assert outbox[0].to == "w@x.io" and outbox[0].subject == "Welcome to Sipp"
    assert "List-Unsubscribe" not in outbox[0].headers


async def test_forgot_and_reset_password(client, outbox):
    await client.post("/auth/register", json={"email": "me@x.io", "password": "password123"})
    old = (await client.post("/auth/login", json={"email": "me@x.io", "password": "password123"})).json()
    outbox.clear()

    # Unknown address: same answer, nothing sent.
    assert (await client.post("/auth/password/forgot", json={"email": "nobody@x.io"})).status_code == 204
    assert outbox == []

    assert (await client.post("/auth/password/forgot", json={"email": "ME@x.io"})).status_code == 204
    assert (await client.post("/auth/password/forgot", json={"email": "me@x.io"})).status_code == 204  # double tap
    assert [e.kind for e in outbox] == ["password_reset"]
    token = _token_from(outbox[0])
    assert "/reset-password?token=" in outbox[0].html

    assert (await client.post("/auth/password/reset", json={"token": "x" * 20, "password": "newpassword1"})).status_code == 400
    r = await client.post("/auth/password/reset", json={"token": token, "password": "newpassword1"})
    assert r.status_code == 200 and r.json()["access_token"]
    assert outbox[-1].kind == "password_changed"

    # One use only; old password and old sessions are gone.
    r = await client.post("/auth/password/reset", json={"token": token, "password": "another-pass"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "reset_link_invalid"
    assert (await client.post("/auth/login", json={"email": "me@x.io", "password": "password123"})).status_code == 401
    assert (await client.post("/auth/login", json={"email": "me@x.io", "password": "newpassword1"})).status_code == 200
    assert (await client.post("/auth/refresh", json={"refresh_token": old["refresh_token"]})).status_code == 401


async def test_reset_link_expires(client, outbox):
    await client.post("/auth/register", json={"email": "me@x.io", "password": "password123"})
    await client.post("/auth/password/forgot", json={"email": "me@x.io"})
    token = _token_from(outbox[-1])
    async with SessionLocal() as s:
        row = (await s.execute(select(PasswordReset))).scalar_one()
        row.expires_at = utcnow() - timedelta(minutes=1)
        await s.commit()
    assert (await client.post("/auth/password/reset", json={"token": token, "password": "newpassword1"})).status_code == 400


async def test_change_password(auth_client, outbox):
    r = await auth_client.post("/auth/me/password", json={"current_password": "wrong-pass", "new_password": "newpassword1"})
    assert r.status_code == 403
    r = await auth_client.post("/auth/me/password", json={"current_password": "password123", "new_password": "newpassword1"})
    assert r.status_code == 200
    assert outbox[-1].kind == "password_changed"
    assert (await auth_client.post("/auth/login", json={"email": "a@b.co", "password": "newpassword1"})).status_code == 200


async def test_email_settings_and_unsubscribe(auth_client):
    assert (await auth_client.get("/auth/me/settings")).json()["email_nudges"] is True
    r = await auth_client.put("/auth/me/settings", json={"email_nudges": False})
    assert r.json()["email_nudges"] is False
    await auth_client.put("/auth/me/settings", json={"email_nudges": True})

    async with SessionLocal() as s:
        user = (await s.execute(select(User))).scalar_one()
    token = emails.unsubscribe_token(user)
    assert (await auth_client.post("/auth/email/unsubscribe", json={"token": "junk"})).status_code == 400
    assert (await auth_client.post("/auth/email/unsubscribe", json={"token": token})).status_code == 204
    assert (await auth_client.get("/auth/me/settings")).json()["email_nudges"] is False


async def _learner(last_lesson_days_ago: float | None, tz="Europe/Paris") -> str:
    now = utcnow()
    async with SessionLocal() as s:
        user = User(email="n@x.io", password_hash="x", timezone=tz, created_at=now - timedelta(days=30))
        s.add(user)
        await s.flush()
        sip = Sip(user_id=user.id, input_text="le café", title="Le café", status=SipStatus.READY)
        s.add(sip)
        await s.flush()
        module = Module(sip_id=sip.id, position=1, title="M1", role="r", objectives=[])
        s.add(module)
        await s.flush()
        for i in range(2):
            s.add(Lesson(
                sip_id=sip.id, module_id=module.id, position=i + 1, global_index=i, key=f"M1L{i + 1}",
                title=f"Leçon {i + 1}", objective="o",
                completed_at=now - timedelta(days=last_lesson_days_ago) if i == 0 and last_lesson_days_ago is not None else None,
            ))
        await s.commit()
        return user.id


def _at_local_hour(hour: int, tz="Europe/Paris"):
    local = utcnow().astimezone(ZoneInfo(tz)).replace(hour=hour, minute=2)
    return local.astimezone(ZoneInfo("UTC"))


async def test_nudge_once_per_break(outbox):
    await _learner(last_lesson_days_ago=4)
    async with SessionLocal() as s:
        assert await nudges.send_due_nudges(s, _at_local_hour(10)) == 0  # not the evening yet
        now = _at_local_hour(18)
        assert await nudges.send_due_nudges(s, now) == 1
        assert await nudges.send_due_nudges(s, now + timedelta(minutes=5)) == 0
        assert await nudges.send_due_nudges(s, now + timedelta(days=1)) == 0
    email = outbox[0]
    assert email.kind == "nudge" and "Leçon 2" in email.subject
    assert "List-Unsubscribe" in email.headers and "/unsubscribe?token=" in email.html


@pytest.mark.parametrize("days_ago", [1, 40])
async def test_no_nudge_too_soon_or_too_late(outbox, days_ago):
    await _learner(last_lesson_days_ago=days_ago)
    async with SessionLocal() as s:
        assert await nudges.send_due_nudges(s, _at_local_hour(18)) == 0


async def test_no_nudge_when_turned_off(outbox):
    user_id = await _learner(last_lesson_days_ago=4)
    async with SessionLocal() as s:
        (await s.get(User, user_id)).email_nudges = False
        await s.commit()
        assert await nudges.send_due_nudges(s, _at_local_hour(18)) == 0


def test_titles_are_escaped():
    user = User(email="a@b.co", password_hash="x")
    email = emails.nudge(user, "<b>Sip</b>", "<script>x</script>", "id")
    assert "<script>" not in email.html and "&lt;script&gt;" in email.html
