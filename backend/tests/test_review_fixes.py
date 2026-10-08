import asyncio
import json
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import func, select

from app.api.schemas import Score
from app.db import SessionLocal
from app.models import ConceptCard, Job, Lesson, Module, Program, Sip, User, utcnow
from app.progress import score_for
from tests.fakes import PROFILE


@pytest.mark.parametrize("block,value", [
    ({"type": "question", "kind": "single_choice", "correct_option_ids": ["a"]}, ["a"]),
    ({"type": "question", "kind": "multiple_choice", "correct_option_ids": ["a", "b"]}, ["b", "a"]),
    ({"type": "question", "kind": "true_false", "answer": True}, True),
    ({"type": "misconception", "is_true": False}, False),
    ({"type": "fill_blanks", "blanks": [{"answer": "Prix"}]}, [" prix "]),
    ({"type": "estimate", "answer": 42, "tolerance": 2}, 40),
])
def test_objective_score_ignores_client_grade(block, value):
    score = score_for([block], [{"block": 0, "value": value, "correct": False}], Score(correct=0, total=99))
    assert score == Score(correct=1, total=1)
    assert score_for([block], [], Score(correct=99, total=1)) == Score(correct=0, total=1)


def test_score_rejects_duplicate_choices_and_bounds_fallback():
    block = {"type": "question", "kind": "multiple_choice", "correct_option_ids": ["a"]}
    assert score_for([block], [{"block": 0, "value": ["a", "a"]}], None) == Score(correct=0, total=1)
    assert score_for([{"type": "match"}], [], Score(correct=100, total=1)) == Score(correct=1, total=1)


async def ready_lesson():
    async with SessionLocal() as s:
        user = await s.scalar(select(User))
        sip = Sip(user_id=user.id, input_text="les taux", status="ready")
        s.add(sip)
        await s.flush()
        module = Module(sip_id=sip.id, position=1, title="Bases", role="core")
        s.add(module)
        await s.flush()
        lesson = Lesson(
            sip_id=sip.id, module_id=module.id, position=1, global_index=0, key="M1L1",
            title="Taux", objective="Comprendre", status="ready", blocks=[
                {"type": "concept", "name": "Taux", "definition": "Un rapport"},
                {"type": "question", "kind": "single_choice", "correct_option_ids": ["a"]},
            ],
        )
        s.add(lesson)
        await s.commit()
        return lesson.id


async def test_completion_recomputes_forged_score(auth_client):
    lesson_id = await ready_lesson()
    r = await auth_client.post(f"/lessons/{lesson_id}/complete", json={
        "answers": [{"block": 1, "value": ["b"], "correct": True}], "score": {"correct": 100, "total": 1},
    })
    assert r.status_code == 200, r.text
    assert r.json()["stars"] == 1


async def test_profile_title_rejected_before_creating_sip(auth_client):
    r = await auth_client.post("/sips", json={"input": "les taux", "profile": {**PROFILE, "title": "x" * 301}})
    assert r.status_code == 422
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Sip)) == 0
        assert await s.scalar(select(func.count()).select_from(Job)) == 0
        assert (await s.scalar(select(User))).gen_count == 0


async def test_concurrent_completion_creates_cards_and_bonus_once(auth_client):
    lesson_id = await ready_lesson()
    results = await asyncio.gather(*[
        auth_client.post(f"/lessons/{lesson_id}/complete", json={"answers": [{"block": 1, "value": ["a"]}]})
        for _ in range(2)
    ])
    assert [r.status_code for r in results] == [200, 200]
    assert sorted(r.json()["module_bonus"] for r in results) == [0, 3]
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(ConceptCard)) == 1


@pytest.mark.parametrize("suffix,method", [("complete", "post"), ("resume", "put")])
async def test_answers_size_type_and_block_limits(auth_client, suffix, method):
    lesson_id = await ready_lesson()
    url = f"/lessons/{lesson_id}/{suffix}"
    send = getattr(auth_client, method)
    base = {"step": 0} if suffix == "resume" else {}
    for answers in (
        [{"block": 1, "value": "x" * 4001}],
        [{"block": 1, "value": {"arbitrary": "data"}}],
        [{"block": 1, "value": True}, {"block": 1, "value": False}],
        [{"block": 2, "value": True}],
        [{"block": i, "value": True} for i in range(201)],
        [{"block": 1, "value": ["x" * 2000] * 5}],
        [{"block": i, "value": "x" * 4000} for i in range(10)],
    ):
        r = await send(url, json={**base, "answers": answers})
        assert r.status_code == 422, r.text
    r = await send(url, content=json.dumps({**base, "answers": [{"block": 1, "value": "x" * 70000}]}), headers={"Content-Type": "application/json"})
    assert r.status_code == 413

    async def oversized_chunks():
        yield b" " * 32000
        yield b" " * 40000

    r = await send(url, content=oversized_chunks(), headers={"Content-Type": "application/json"})
    assert r.status_code == 413
    async with SessionLocal() as s:
        lesson = await s.get(Lesson, lesson_id)
        assert lesson.completed_at is None and lesson.resume is None


async def test_concurrent_chapter_start_creates_one_sip_and_job(auth_client):
    async with SessionLocal() as s:
        user_id = await s.scalar(select(User.id))
        program = Program(user_id=user_id, roadmap=[{"title": "Taux", "outcome": "Comprendre", "level": "core", "estimated_lessons": 1}])
        s.add(program)
        await s.commit()
        program_id = program.id
    results = await asyncio.gather(*[auth_client.post(f"/programs/{program_id}/chapters/1") for _ in range(2)])
    assert sorted(r.status_code for r in results) == [202, 409]
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Sip)) == 1
        assert await s.scalar(select(func.count()).select_from(Job)) == 1
        assert (await s.scalar(select(User))).gen_count == 1


async def test_failed_program_frees_slot_and_retry_reserves_it(auth_client):
    async with SessionLocal() as s:
        user = await s.scalar(select(User))
        user.plan, user.gen_month, user.gen_count = "free", utcnow().strftime("%Y-%m"), 1
        program = Program(user_id=user.id, status="failed", roadmap=[])
        s.add(program)
        await s.flush()
        failed = Sip(user_id=user.id, input_text="Taux", program_id=program.id, chapter=1, status="failed")
        occupied = Sip(user_id=user.id, input_text="Autre", status="ready")
        s.add_all([failed, occupied])
        await s.commit()
        failed_id, occupied_id, program_id = failed.id, occupied.id, program.id
    assert (await auth_client.get("/auth/me/plan")).json()["slots_used"] == 1
    assert (await auth_client.post(f"/sips/{failed_id}/retry")).status_code == 402
    await auth_client.delete(f"/sips/{occupied_id}")
    assert (await auth_client.get("/auth/me/plan")).json()["slots_used"] == 0
    assert (await auth_client.post(f"/sips/{failed_id}/retry")).status_code == 202
    assert (await auth_client.get("/auth/me/plan")).json()["slots_used"] == 1
    async with SessionLocal() as s:
        assert (await s.get(Program, program_id)).status == "ready"
        assert (await s.scalar(select(User))).gen_count == 1


def test_real_run_rejects_negative_lessons_before_database_creation(tmp_path):
    db = tmp_path / "paid.db"
    result = subprocess.run([sys.executable, "-m", "scripts.real_run", "topic", "--lessons", "-1", "--db", str(db)], capture_output=True, text=True)
    assert result.returncode == 2 and "non-negative" in result.stderr
    assert not db.exists()


def test_real_run_zero_is_accepted_without_running_pipeline(tmp_path):
    script = Path(__file__).resolve().parents[1] / "scripts" / "real_run.py"
    db = tmp_path / "paid.db"
    code = "import runpy,sys; script,db=sys.argv[1:]; sys.argv=['real_run','topic','--lessons','0','--db',db]; result=runpy.run_path(script); print(result['args'].lessons)"
    result = subprocess.run([sys.executable, "-c", code, str(script), str(db)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "0" and not db.exists()
