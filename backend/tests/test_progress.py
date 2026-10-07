from datetime import date

from app.api.schemas import Score
from app.progress import stars_for, streak
from tests.test_flow import drain
from tests.fakes import FakeClient


def test_stars():
    assert stars_for(None) == 3
    assert stars_for(Score(correct=0, total=0)) == 3
    assert stars_for(Score(correct=2, total=2)) == 3
    assert stars_for(Score(correct=1, total=2)) == 2
    assert stars_for(Score(correct=0, total=3)) == 1


def test_streak():
    d = date(2026, 10, 7)
    assert streak(set(), d) == 0
    assert streak({d}, d) == 1
    assert streak({date(2026, 10, 6), date(2026, 10, 5)}, d) == 2  # today not done yet
    assert streak({d, date(2026, 10, 5)}, d) == 1


async def test_complete_gives_stars_and_streak(auth_client):
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(FakeClient())
    l1 = (await auth_client.get(f"/sips/{sip_id}")).json()["modules"][0]["lessons"][0]
    r = await auth_client.post(
        f"/lessons/{l1['id']}/complete?tz=Europe/Paris", json={"score": {"correct": 1, "total": 2}}
    )
    assert r.json()["stars"] == 2 and r.json()["streak_days"] == 1
    # replay keeps the best
    r = await auth_client.post(f"/lessons/{l1['id']}/complete", json={"score": {"correct": 0, "total": 2}})
    assert r.json()["stars"] == 2
    s = (await auth_client.get("/auth/me/stats?tz=Europe/Paris")).json()
    assert s == {"streak_days": 1, "completed_today": True, "lessons_completed": 1, "total_stars": 2}
    assert (await auth_client.get(f"/sips/{sip_id}")).json()["modules"][0]["lessons"][0]["stars"] == 2


async def test_cors_preflight(client):
    r = await client.options(
        "/sips",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
