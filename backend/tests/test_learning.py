from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, update

from app import push
from app.config import get_settings
from app.db import SessionLocal
from app.models import Lesson, LessonFeedback, Module, Sip, User
from app.progress import streak, streak_detail
from tests.fakes import FakeClient
from tests.test_flow import drain, lessons_of


async def _ready_sip(c) -> tuple[str, list[dict]]:
    sip_id = (await c.post("/sips", json={"input": "les taux"})).json()["id"]
    fake = FakeClient()
    await drain(fake)
    lessons = await lessons_of(c, sip_id)
    for l in lessons:  # generate everything
        await c.get(f"/lessons/{l['id']}")
        await drain(fake)
    return sip_id, await lessons_of(c, sip_id)


def test_streak_freeze_bridges_one_missed_day_a_week():
    d = date(2026, 10, 9)
    days = {d, d - timedelta(days=2), d - timedelta(days=3)}  # missed the 8th
    assert streak(days, d) == 1
    n, frozen = streak_detail(days, d)
    assert n == 3 and frozen == [d - timedelta(days=1)]
    # Two misses within a week: only the first is forgiven.
    days = {d, d - timedelta(days=2), d - timedelta(days=4)}
    assert streak_detail(days, d)[0] == 2


async def test_settings_goal_reminder_and_timezone(auth_client):
    s = (await auth_client.get("/auth/me/settings")).json()
    assert s["daily_goal"] == 1 and s["reminder_hour"] is None and not s["push_enabled"]
    await auth_client.get("/auth/me/stats?tz=America/New_York")
    assert (await auth_client.get("/auth/me/settings")).json()["timezone"] == "America/New_York"
    s = (await auth_client.put("/auth/me/settings", json={"daily_goal": 3, "reminder_hour": 19, "timezone": "Europe/Paris"})).json()
    assert (s["daily_goal"], s["reminder_hour"], s["timezone"]) == (3, 19, "Europe/Paris")
    assert (await auth_client.put("/auth/me/settings", json={"timezone": "Mars/Base"})).status_code == 422
    assert (await auth_client.put("/auth/me/settings", json={"reminder_hour": -1})).json()["reminder_hour"] is None
    stats = (await auth_client.get("/auth/me/stats?tz=Europe/Paris")).json()
    assert stats["daily_goal"] == 3 and stats["lessons_today"] == 0 and stats["this_week"]["lessons"] == 0


TOKEN = "ab" * 32


async def test_push_token_and_reminder_once_a_day(auth_client, monkeypatch):
    assert (await auth_client.put("/auth/me/push", json={"token": "not hex"})).status_code == 422
    assert (await auth_client.put("/auth/me/push", json={"token": TOKEN.upper()})).json()["push_enabled"]
    await auth_client.put("/auth/me/settings", json={"reminder_hour": 18, "timezone": "Europe/Paris"})
    sent = []

    async def delivered(token, sandbox, payload):
        sent.append((token, sandbox, payload))
        return 200, ""

    monkeypatch.setattr(push, "_post", delivered)
    at_18_paris = datetime(2026, 10, 9, 16, 5, tzinfo=timezone.utc)
    async with SessionLocal() as s:
        assert await push.send_due_reminders(s, at_18_paris) == 1
        assert await push.send_due_reminders(s, at_18_paris + timedelta(minutes=10)) == 0
        assert await push.send_due_reminders(s, at_18_paris - timedelta(hours=1)) == 0
    assert len(sent) == 1 and sent[0][:2] == (TOKEN, False) and sent[0][2]["body"] in push.MESSAGES["fr"]
    # Reminders follow the interface language.
    assert (await auth_client.put("/auth/me/settings", json={"language": "en"})).json()["language"] == "en"
    assert (await auth_client.put("/auth/me/settings", json={"language": "de"})).status_code == 422
    async with SessionLocal() as s:
        await s.execute(update(User).values(reminded_on=None))
        await s.commit()
        assert await push.send_due_reminders(s, at_18_paris) == 1
    assert sent[-1][2]["body"] in push.MESSAGES["en"]
    # A gone token is dropped.

    async def gone(token, sandbox, payload):
        return 410, "Unregistered"

    monkeypatch.setattr(push, "_post", gone)
    async with SessionLocal() as s:
        await s.execute(update(User).values(reminded_on=None))
        await s.commit()
        await push.send_due_reminders(s, at_18_paris)
    assert not (await auth_client.get("/auth/me/settings")).json()["push_enabled"]


async def test_a_development_build_token_is_sent_to_the_sandbox_gateway(auth_client, monkeypatch):
    await auth_client.put("/auth/me/push", json={"token": TOKEN})
    tried = []

    async def only_sandbox(token, sandbox, payload):
        tried.append(sandbox)
        return (200, "") if sandbox else (400, "BadDeviceToken")

    monkeypatch.setattr(push, "_post", only_sandbox)
    async with SessionLocal() as s:
        user = await s.scalar(select(User))
        assert await push.send(user, {"title": "Sipp", "body": "x"})
        assert await push.send(user, {"title": "Sipp", "body": "y"})
        await s.commit()
    assert tried == [False, True, True]  # remembered after the first fallback
    assert (await auth_client.get("/auth/me/settings")).json()["push_enabled"]


async def test_feedback_tunes_difficulty_and_keeps_reports(auth_client):
    sip_id, lessons = await _ready_sip(auth_client)
    lid = lessons[0]["id"]
    for _ in range(3):
        assert (await auth_client.post(f"/lessons/{lid}/feedback", json={"feeling": "easy"})).status_code == 204
    await auth_client.post(f"/lessons/{lid}/feedback", json={"problem": "wrong", "comment": "le taux est faux", "block": 2})
    assert (await auth_client.post(f"/lessons/{lid}/feedback", json={})).status_code == 422
    async with SessionLocal() as s:
        assert (await s.get(Sip, sip_id)).difficulty == 2
        reports = (await s.scalars(select(LessonFeedback).where(LessonFeedback.problem.is_not(None)))).all()
        assert [(r.problem, r.block) for r in reports] == [("wrong", 2)]


async def test_notes_keep_update_list_delete(auth_client):
    _, lessons = await _ready_sip(auth_client)
    lid = lessons[0]["id"]
    n = (await auth_client.post(f"/lessons/{lid}/notes", json={"block": 0, "quote": "Un taux"})).json()
    again = (await auth_client.post(f"/lessons/{lid}/notes", json={"block": 0, "quote": "Un taux", "text": "à retenir"})).json()
    assert again["id"] == n["id"] and again["text"] == "à retenir"
    assert (await auth_client.post(f"/lessons/{lid}/notes", json={"block": 99, "quote": "x"})).status_code == 422
    assert [x["quote"] for x in (await auth_client.get("/me/notes")).json()] == ["Un taux"]
    assert (await auth_client.delete(f"/me/notes/{n['id']}")).status_code == 204
    assert (await auth_client.get("/me/notes")).json() == []


async def test_module_quiz_after_module_and_best_stars(auth_client):
    sip_id, _ = await _ready_sip(auth_client)
    module = (await auth_client.get(f"/sips/{sip_id}")).json()["modules"][0]
    module_id = module["id"]
    assert (await auth_client.get(f"/modules/{module_id}/quiz")).status_code == 409
    for l in module["lessons"]:
        r = (await auth_client.post(f"/lessons/{l['id']}/complete", json={"answers": []})).json()
    assert r["module_done"] and r["module_id"] == module_id
    quiz = (await auth_client.get(f"/modules/{module_id}/quiz")).json()
    assert quiz["items"] and quiz["best_stars"] is None
    items = [{"lesson_id": i["lesson_id"], "block_index": i["block_index"]} for i in quiz["items"]]

    def right(block):
        if block["type"] == "question" and block.get("correct_option_ids"):
            return {"value": block["correct_option_ids"]}
        if block["type"] == "question":
            return {"value": block["answer"]}
        if block["type"] == "misconception":
            return {"value": block["is_true"]}
        if block["type"] == "fill_blanks":
            return {"value": [b["answer"] for b in block["blanks"]]}
        return {"value": block["answer"]}

    answers = [{"block": i, **right(it["block"])} for i, it in enumerate(quiz["items"])]
    res = (await auth_client.post(f"/modules/{module_id}/quiz", json={"items": items, "answers": answers})).json()
    assert res["stars"] == 3 and res["gained"] == 3
    res = (await auth_client.post(f"/modules/{module_id}/quiz", json={"items": items, "answers": []})).json()
    assert res["stars"] == 1 and res["best_stars"] == 3 and res["gained"] == 0
    bad = [{"lesson_id": items[0]["lesson_id"], "block_index": 0}]
    async with SessionLocal() as s:
        first = await s.get(Lesson, items[0]["lesson_id"])
        if (first.blocks or [{}])[0].get("type") not in ("question", "misconception", "fill_blanks", "estimate"):
            assert (await auth_client.post(f"/modules/{module_id}/quiz", json={"items": bad, "answers": []})).status_code == 422
        assert (await s.get(Module, module_id)).quiz_stars == 3
    stats = (await auth_client.get("/auth/me/stats")).json()
    assert stats["lessons_today"] >= 2


async def _make_free(c):
    uid = (await c.get("/auth/me")).json()["id"]
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == uid).values(plan="free"))
        await s.commit()


async def test_free_plan_locks_quiz_and_caps_notes(auth_client, monkeypatch):
    sip_id, lessons = await _ready_sip(auth_client)
    module = (await auth_client.get(f"/sips/{sip_id}")).json()["modules"][0]
    for l in module["lessons"]:
        await auth_client.post(f"/lessons/{l['id']}/complete", json={"answers": []})
    await _make_free(auth_client)
    plan = (await auth_client.get("/auth/me/plan")).json()
    assert plan["features"] == {"audio": False, "quiz": False, "notes": 10, "help_per_day": 5}
    r = await auth_client.get(f"/modules/{module['id']}/quiz")
    assert r.status_code == 403 and r.json()["detail"]["feature"] == "quiz"
    monkeypatch.setitem(get_settings().plan_features, "free", {"audio": False, "quiz": False, "notes": 1, "help_per_day": 5})
    lid = lessons[0]["id"]
    assert (await auth_client.post(f"/lessons/{lid}/notes", json={"block": 0, "quote": "a"})).status_code == 201
    # Editing a kept passage is fine, a new one is over the limit.
    assert (await auth_client.post(f"/lessons/{lid}/notes", json={"block": 0, "quote": "a", "text": "b"})).status_code == 201
    r = await auth_client.post(f"/lessons/{lid}/notes", json={"block": 1, "quote": "c"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "notes_limit"
