from datetime import timedelta

from sqlalchemy import update

from app.concepts import REVIEW_INTERVALS
from app.db import SessionLocal
from app.models import ConceptCard, Lesson, utcnow
from tests.fakes import FakeClient
from tests.test_flow import drain


async def _ready_lesson(c):
    sip_id = (await c.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(FakeClient())
    return sip_id, (await c.get(f"/sips/{sip_id}")).json()["modules"][0]["lessons"][0]


async def _make_due():
    async with SessionLocal() as s:
        await s.execute(update(ConceptCard).values(due_at=utcnow() - timedelta(minutes=1)))
        await s.commit()


async def test_finishing_a_lesson_adds_its_notions(auth_client):
    sip_id, l1 = await _ready_lesson(auth_client)
    assert (await auth_client.get("/me/concepts")).json() == []
    await auth_client.post(f"/lessons/{l1['id']}/complete", json={})
    await auth_client.post(f"/lessons/{l1['id']}/complete", json={})  # replay adds nothing
    concepts = (await auth_client.get("/me/concepts")).json()
    assert [(c["name"], c["definition"], c["mastery"], c["due"]) for c in concepts] == [
        ("taux d'intérêt", "Le prix de l'argent emprunté.", 1, False)
    ]
    assert concepts[0]["sip_id"] == sip_id and concepts[0]["sip_title"] == "Comprendre les taux"
    # not due before tomorrow
    assert (await auth_client.get("/me/review")).json() == {"due_count": 0, "cards": []}


async def test_review_moves_cards_between_boxes(auth_client):
    _, l1 = await _ready_lesson(auth_client)
    await auth_client.post(f"/lessons/{l1['id']}/complete", json={})
    await _make_due()
    review = (await auth_client.get("/me/review")).json()
    assert review["due_count"] == 1
    card = review["cards"][0]

    r = (await auth_client.post(f"/me/review/{card['id']}", json={"knew": True})).json()
    assert r["due"] is False and r["mastery"] == 2 and r["last_reviewed_at"]
    async with SessionLocal() as s:
        c = await s.get(ConceptCard, card["id"])
        assert c.box == 1 and c.reviews == 1
        assert abs((c.due_at.replace(tzinfo=None) - utcnow().replace(tzinfo=None)) - timedelta(days=REVIEW_INTERVALS[1])) < timedelta(minutes=1)

    await _make_due()
    r = (await auth_client.post(f"/me/review/{card['id']}", json={"knew": False})).json()
    assert r["mastery"] == 1
    async with SessionLocal() as s:
        c = await s.get(ConceptCard, card["id"])
        assert c.box == 0 and c.lapses == 1


async def test_lessons_finished_before_cards_existed_are_backfilled(auth_client):
    _, l1 = await _ready_lesson(auth_client)
    async with SessionLocal() as s:
        await s.execute(update(Lesson).where(Lesson.id == l1["id"]).values(completed_at=utcnow() - timedelta(days=3)))
        await s.commit()
    review = (await auth_client.get("/me/review")).json()
    assert review["due_count"] == 1 and review["cards"][0]["name"] == "taux d'intérêt"
    assert (await auth_client.get("/auth/me/stats")).json()["concepts"] == 1


async def test_cards_are_private(auth_client, client):
    _, l1 = await _ready_lesson(auth_client)
    await auth_client.post(f"/lessons/{l1['id']}/complete", json={})
    card_id = (await auth_client.get("/me/concepts")).json()[0]["id"]
    r = await client.post("/auth/register", json={"email": "other@b.co", "password": "password123"})
    other = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.get("/me/concepts", headers=other)).json() == []
    assert (await client.post(f"/me/review/{card_id}", json={"knew": True}, headers=other)).status_code == 404
