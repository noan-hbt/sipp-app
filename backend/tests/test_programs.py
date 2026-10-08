from unittest.mock import patch

from sqlalchemy import select, update

from app.db import SessionLocal
from app.models import Job, Lesson, LLMCall, Program, Sip, User, utcnow
from tests.fakes import PROFILE, FakeClient
from tests.test_flow import drain


ROADMAP = {
    "title": "Maitriser les taux",
    "summary": "Des bases des taux aux effets sur l'economie.",
    "chapters": [
        {
            "title": "Les bases des taux",
            "outcome": "Expliquer le prix de l'argent.",
            "level": "core",
            "estimated_lessons": 4,
        },
        {
            "title": "Taux et inflation",
            "outcome": "Relier taux directeurs et inflation.",
            "level": "advanced",
            "estimated_lessons": 6,
        },
    ],
}
EXTENSION = {
    "title": "Aller plus loin avec les taux",
    "summary": "Appliquer les bases aux obligations et a la politique monetaire.",
    "chapters": [
        {
            "title": "Comprendre les obligations",
            "outcome": "Relier rendement et prix d'une obligation.",
            "level": "core",
            "estimated_lessons": 4,
        },
        {
            "title": "Politique monetaire",
            "outcome": "Interpreter une decision de banque centrale.",
            "level": "advanced",
            "estimated_lessons": 6,
        },
    ],
}


def _program_client():
    return FakeClient({"LearningProfile": [{**PROFILE, "breadth": "program"}], "Roadmap": [ROADMAP]})


async def _build_sip(c, fake):
    r = await c.post("/sips", json={"input": "Je veux maitriser les taux"})
    assert r.status_code == 202, r.text
    sip_id = r.json()["id"]
    await drain(fake)
    r = await c.get(f"/sips/{sip_id}")
    assert r.status_code == 200
    sip = r.json()
    assert sip["status"] == "ready", sip["error"]
    assert sip["modules"] and all(m["lessons"] for m in sip["modules"])
    return sip


async def test_program_request_builds_first_chapter_with_context(auth_client):
    fake = _program_client()
    with patch.object(fake, "complete", wraps=fake.complete) as complete:
        sip = await _build_sip(auth_client, fake)

    r = await auth_client.get("/programs")
    assert r.status_code == 200
    programs = r.json()
    assert len(programs) == 1
    program = programs[0]
    assert program["status"] == "ready" and program["error"] is None
    assert program["title"] == ROADMAP["title"]
    assert program["summary"] == ROADMAP["summary"]
    assert [c["position"] for c in program["chapters"]] == [1, 2]
    for position, (chapter, expected) in enumerate(zip(program["chapters"], ROADMAP["chapters"]), start=1):
        assert {k: v for k, v in chapter.items() if k != "sip"} == {**expected, "position": position}
    first = program["chapters"][0]["sip"]
    assert first["id"] == sip["id"]
    assert first["status"] == "ready"
    assert first["chapter"] == sip["chapter"] == 1
    assert first["program_id"] == sip["program_id"] == program["id"]
    assert first["title"] == sip["title"] == ROADMAP["chapters"][0]["title"]
    assert program["chapters"][1]["sip"] is None

    r = await auth_client.get(f"/programs/{program['id']}")
    assert r.status_code == 200 and r.json() == program
    assert [name for name, _ in fake.calls].count("Roadmap") == 1
    assert [name for name, _ in fake.calls].count("Curriculum") == 1
    async with SessionLocal() as s:
        owner = await s.scalar(select(User.id))
        calls = (await s.execute(select(LLMCall))).scalars().all()
        assert calls and all(call.user_id == owner for call in calls)
    messages = next(call.args[1] for call in complete.await_args_list if call.args[2] == "Curriculum")
    user_message = next(m["content"] for m in messages if m["role"] == "user")
    assert f"PROGRAM: {ROADMAP['title']}" in user_message
    assert f"THIS CHAPTER (1): {ROADMAP['chapters'][0]['title']}" in user_message


async def test_chapter_counts_generation_without_slot_and_rejects_duplicates(auth_client):
    fake = _program_client()
    first = await _build_sip(auth_client, fake)
    program_id = first["program_id"]
    before = (await auth_client.get("/auth/me/plan")).json()
    assert before["slots_used"] == before["sips_this_month"] == 1

    r = await auth_client.post(f"/programs/{program_id}/chapters/2")
    assert r.status_code == 202, r.text
    chapter = r.json()
    assert chapter["chapter"] == 2 and chapter["program_id"] == program_id
    assert chapter["title"] == ROADMAP["chapters"][1]["title"]
    assert chapter["status"] == "queued" and chapter["id"] != first["id"]
    after = (await auth_client.get("/auth/me/plan")).json()
    assert after["slots_used"] == before["slots_used"] == 1
    assert after["sips_this_month"] == before["sips_this_month"] + 1

    r = await auth_client.post(f"/programs/{program_id}/chapters/2")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "chapter_exists"
    assert r.json()["detail"]["sip_id"] == chapter["id"]
    for position in (0, len(ROADMAP["chapters"]) + 1):
        assert (await auth_client.post(f"/programs/{program_id}/chapters/{position}")).status_code == 404
    assert (await auth_client.get("/auth/me/plan")).json()["sips_this_month"] == after["sips_this_month"]

    await drain(fake)
    sip = (await auth_client.get(f"/sips/{chapter['id']}")).json()
    assert sip["status"] == "ready", sip["error"]
    assert sip["chapter"] == 2 and sip["program_id"] == program_id
    assert sip["title"] == chapter["title"] and sip["modules"]
    program = (await auth_client.get(f"/programs/{program_id}")).json()
    assert [c["sip"]["id"] for c in program["chapters"]] == [first["id"], sip["id"]]


async def test_free_plan_can_generate_chapter_in_occupied_slot(auth_client):
    fake = _program_client()
    first = await _build_sip(auth_client, fake)
    # Model an existing program carried into a month with one generation left.
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan="free", gen_month=utcnow().strftime("%Y-%m"), gen_count=0))
        await s.commit()
    before = (await auth_client.get("/auth/me/plan")).json()
    assert before["plan"] == "free" and before["slots_used"] == before["slots"] == 1
    assert before["sips_this_month"] == 0 and before["sips_per_month"] == 1

    r = await auth_client.post("/sips", json={"input": "Un nouveau sujet"})
    assert r.status_code == 402 and r.json()["detail"]["code"] == "no_free_slot"
    r = await auth_client.post(f"/programs/{first['program_id']}/chapters/2")
    assert r.status_code == 202, r.text
    chapter = r.json()
    assert chapter["chapter"] == 2 and chapter["program_id"] == first["program_id"]
    assert chapter["lite"] is True
    after = (await auth_client.get("/auth/me/plan")).json()
    assert after["slots_used"] == 1 and after["sips_this_month"] == 1
    await drain(fake)
    sip = (await auth_client.get(f"/sips/{chapter['id']}")).json()
    assert sip["status"] == "ready", sip["error"]
    assert sip["modules"]


async def test_finished_sip_extends_into_program(auth_client):
    fake = FakeClient({"RoadmapExtension": [EXTENSION]})
    sip = await _build_sip(auth_client, fake)
    sip_id = sip["id"]
    assert sip["program_id"] is None and sip["chapter"] is None
    r = await auth_client.post(f"/sips/{sip_id}/extend")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "sip_not_finished"
    assert (await auth_client.get("/programs")).json() == []

    async with SessionLocal() as s:
        await s.execute(update(Lesson).where(Lesson.sip_id == sip_id).values(completed_at=utcnow()))
        await s.commit()
    r = await auth_client.post(f"/sips/{sip_id}/extend")
    assert r.status_code == 202, r.text
    generating = r.json()
    assert generating["status"] == "generating" and generating["chapters"] == []
    await drain(fake)

    r = await auth_client.get(f"/programs/{generating['id']}")
    assert r.status_code == 200
    program = r.json()
    assert program["status"] == "ready" and program["error"] is None
    assert program["title"] == EXTENSION["title"] and program["summary"] == EXTENSION["summary"]
    assert len(program["chapters"]) == 1 + len(EXTENSION["chapters"])
    first = program["chapters"][0]
    assert first["position"] == 1 and first["title"] == sip["title"]
    assert first["sip"]["id"] == sip_id and first["sip"]["status"] == "ready"
    assert first["sip"]["chapter"] == 1 and first["sip"]["program_id"] == program["id"]
    assert first["sip"]["progress"] == {"completed": 4, "total": 4}
    for position, (chapter, expected) in enumerate(zip(program["chapters"][1:], EXTENSION["chapters"]), start=2):
        assert chapter == {**expected, "position": position, "sip": None}
    assert [name for name, _ in fake.calls].count("RoadmapExtension") == 1
    async with SessionLocal() as s:
        owner = await s.scalar(select(User.id))
        call = await s.scalar(select(LLMCall).where(LLMCall.stage == "roadmap", LLMCall.sip_id.is_(None)))
        assert call is not None and call.user_id == owner
    updated = (await auth_client.get(f"/sips/{sip_id}")).json()
    assert updated["program_id"] == program["id"] and updated["chapter"] == 1
    assert [m["id"] for m in updated["modules"]] == [m["id"] for m in sip["modules"]]
    assert all(l["completed"] for m in updated["modules"] for l in m["lessons"])
    r = await auth_client.post(f"/sips/{sip_id}/extend")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "already_in_program"
    assert r.json()["detail"]["program_id"] == program["id"]
    assert len((await auth_client.get("/programs")).json()) == 1


async def test_delete_program_removes_its_sips(auth_client):
    fake = _program_client()
    first = await _build_sip(auth_client, fake)
    program_id = first["program_id"]
    r = await auth_client.post(f"/programs/{program_id}/chapters/2")
    assert r.status_code == 202
    second_id = r.json()["id"]
    await drain(fake)
    standalone = await _build_sip(auth_client, FakeClient())
    assert {s["id"] for s in (await auth_client.get("/sips")).json()} == {
        first["id"], second_id, standalone["id"]
    }

    assert (await auth_client.delete(f"/programs/{program_id}")).status_code == 204
    assert (await auth_client.get(f"/programs/{program_id}")).status_code == 404
    assert (await auth_client.get("/programs")).json() == []
    assert [s["id"] for s in (await auth_client.get("/sips")).json()] == [standalone["id"]]
    for sip_id in (first["id"], second_id):
        assert (await auth_client.get(f"/sips/{sip_id}")).status_code == 404
    async with SessionLocal() as s:
        assert await s.get(Program, program_id) is None
        assert await s.get(Sip, first["id"]) is None and await s.get(Sip, second_id) is None
        assert await s.scalar(select(Lesson.id).where(Lesson.sip_id.in_([first["id"], second_id]))) is None


ADJUSTMENT = {
    "changed": True,
    "note": "Tu as eu du mal sur les bases, on consolide avant d'avancer.",
    "chapters": [
        {"title": "Consolider les bases", "outcome": "Calculer un taux simple sans hesiter.", "level": "core", "estimated_lessons": 6},
        {"title": "Taux et inflation", "outcome": "Relier taux directeurs et inflation.", "level": "advanced", "estimated_lessons": 6},
    ],
}


async def _finish_chapter(c, sip_id):
    """Marks every lesson ready and completed but the last, then completes it through the API."""
    async with SessionLocal() as s:
        lessons = (await s.execute(select(Lesson).where(Lesson.sip_id == sip_id).order_by(Lesson.global_index))).scalars().all()
        for l in lessons:
            l.status, l.blocks = "ready", l.blocks or []
            if l is not lessons[-1]:
                l.completed_at, l.stars = utcnow(), 1
        await s.commit()
        last = lessons[-1].id
    r = await c.post(f"/lessons/{last}/complete", json={"answers": [], "score": {"correct": 0, "total": 2}})
    assert r.status_code == 200, r.text


async def test_finished_chapter_adjusts_remaining_roadmap(auth_client):
    fake = FakeClient({**_program_client().queue, "RoadmapAdjustment": [ADJUSTMENT]})
    sip = await _build_sip(auth_client, fake)
    pid = sip["program_id"]
    await _finish_chapter(auth_client, sip["id"])

    program = (await auth_client.get(f"/programs/{pid}")).json()
    assert program["status"] == "adjusting"
    r = await auth_client.post(f"/programs/{pid}/chapters/2")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "program_adjusting"

    await drain(fake)
    program = (await auth_client.get(f"/programs/{pid}")).json()
    assert program["status"] == "ready" and program["note"] == ADJUSTMENT["note"]
    assert [c["title"] for c in program["chapters"]] == [ROADMAP["chapters"][0]["title"]] + [c["title"] for c in ADJUSTMENT["chapters"]]
    assert program["chapters"][0]["sip"]["id"] == sip["id"]
    async with SessionLocal() as s:
        owner = await s.scalar(select(User.id))
        call = await s.scalar(select(LLMCall).where(LLMCall.stage == "roadmap", LLMCall.sip_id.is_(None)))
        assert call is not None and call.user_id == owner

    r = await auth_client.post(f"/programs/{pid}/chapters/2")
    assert r.status_code == 202, r.text
    assert r.json()["title"] == "Consolider les bases"
    assert (await auth_client.get(f"/programs/{pid}")).json()["note"] is None


async def test_unchanged_adjustment_keeps_roadmap(auth_client):
    keep = {"changed": False, "note": None, "chapters": []}
    fake = FakeClient({**_program_client().queue, "RoadmapAdjustment": [keep]})
    sip = await _build_sip(auth_client, fake)
    await _finish_chapter(auth_client, sip["id"])
    await drain(fake)
    program = (await auth_client.get(f"/programs/{sip['program_id']}")).json()
    assert program["status"] == "ready" and program["note"] is None
    assert [c["title"] for c in program["chapters"]] == [c["title"] for c in ROADMAP["chapters"]]


async def test_chapter_checks_active_build_limit(auth_client):
    async with SessionLocal() as s:
        user_id = await s.scalar(select(User.id))
        program = Program(user_id=user_id, roadmap=ROADMAP["chapters"])
        s.add(program)
        s.add_all(Sip(user_id=user_id, input_text=f"Sujet {i}") for i in range(3))
        await s.commit()
        program_id = program.id
    r = await auth_client.post(f"/programs/{program_id}/chapters/1")
    assert r.status_code == 429 and r.json()["detail"]["code"] == "too_many_active_builds"
    async with SessionLocal() as s:
        assert await s.scalar(select(Sip.id).where(Sip.program_id == program_id)) is None
        assert await s.scalar(select(Job.id)) is None
        assert (await s.scalar(select(User))).gen_count == 0


async def test_retry_chapter_reuses_program_slot_and_monthly_generation(auth_client):
    async with SessionLocal() as s:
        user = await s.scalar(select(User))
        user.plan, user.gen_month, user.gen_count = "free", utcnow().strftime("%Y-%m"), 1
        program = Program(user_id=user.id, roadmap=ROADMAP["chapters"])
        s.add(program)
        await s.flush()
        sip = Sip(user_id=user.id, program_id=program.id, chapter=1, input_text="les taux", status="failed")
        s.add(sip)
        await s.commit()
        sip_id = sip.id
    r = await auth_client.post(f"/sips/{sip_id}/retry")
    assert r.status_code == 202, r.text
    plan = (await auth_client.get("/auth/me/plan")).json()
    assert plan["slots_used"] == plan["slots"] == 1
    assert plan["sips_this_month"] == plan["sips_per_month"] == 1
