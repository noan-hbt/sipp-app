from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, update

from app import push
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
    s = (await auth_client.put("/auth/me/settings", json={"daily_goal": 3, "reminder_hour": 19, "timezone": "Europe/Paris"})).json()
    assert (s["daily_goal"], s["reminder_hour"], s["timezone"]) == (3, 19, "Europe/Paris")
    assert (await auth_client.put("/auth/me/settings", json={"timezone": "Mars/Base"})).status_code == 422
    assert (await auth_client.put("/auth/me/settings", json={"reminder_hour": -1})).json()["reminder_hour"] is None
    stats = (await auth_client.get("/auth/me/stats?tz=Europe/Paris")).json()
    assert stats["daily_goal"] == 3 and stats["lessons_today"] == 0 and stats["this_week"]["lessons"] == 0


async def test_push_subscription_and_reminder_once_a_day(auth_client, monkeypatch):
    sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k", "auth": "a"}}
    assert (await auth_client.put("/auth/me/push", json=sub)).json()["push_enabled"]
    await auth_client.put("/auth/me/settings", json={"reminder_hour": 18, "timezone": "Europe/Paris"})
    sent = []
    monkeypatch.setattr(push, "_send", lambda subscription, payload: sent.append(payload) or None)
    at_18_paris = datetime(2026, 10, 9, 16, 5, tzinfo=timezone.utc)
    async with SessionLocal() as s:
        assert await push.send_due_reminders(s, at_18_paris) == 1
        assert await push.send_due_reminders(s, at_18_paris + timedelta(minutes=10)) == 0
        assert await push.send_due_reminders(s, at_18_paris - timedelta(hours=1)) == 0
    assert len(sent) == 1
    # A gone subscription is dropped.
    monkeypatch.setattr(push, "_send", lambda subscription, payload: 410)
    async with SessionLocal() as s:
        await s.execute(update(User).values(reminded_on=None))
        await s.commit()
        await push.send_due_reminders(s, at_18_paris)
    assert not (await auth_client.get("/auth/me/settings")).json()["push_enabled"]


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
