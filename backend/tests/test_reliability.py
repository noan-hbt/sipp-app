import copy
from datetime import timedelta

from sqlalchemy import select, update

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import worker
from app.models import Job, Lesson, Module, Sip, utcnow
from app.pipeline import prompts
from app.pipeline.checks import check_lesson
from app.pipeline.schemas import LessonDraft
from tests.fakes import DRAFT, MAPPING, FakeClient
from tests.test_flow import drain

SWIPE = {
    "type": "swipe",
    "cards": [
        {"statement": "Un taux s'exprime en %.", "is_true": True, "why": "Oui."},
        {"statement": "Un taux bas est toujours mieux.", "is_true": False, "why": "Non."},
        {"statement": "Le taux fixe ne bouge pas.", "is_true": True, "why": "Oui."},
        {"statement": "Le taux variable ne bouge jamais.", "is_true": False, "why": "Non."},
    ],
}
WITH_SWIPE = {**DRAFT, "blocks": DRAFT["blocks"][:-1] + [SWIPE] + DRAFT["blocks"][-1:]}  # swipe is block 7


async def _first(sip_id):
    async with SessionLocal() as s:
        return await s.scalar(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.global_index == 0))


async def test_first_lesson_is_queued_as_soon_as_its_module_is_mapped(auth_client):
    seen = []

    class Watch(FakeClient):
        async def complete(self, model, messages, schema_name, schema, options=None):
            if schema_name == "ModuleMapping":
                async with SessionLocal() as s:
                    jobs = (await s.scalars(select(Job).where(Job.type == "generate_lesson"))).all()
                    seen.append(len(jobs))
            return await super().complete(model, messages, schema_name, schema, options)

    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    assert await worker.process_one(Watch())
    assert seen == [0, 1]  # mapping M2 starts with the M1L1 job already queued
    async with SessionLocal() as s:
        sip = await s.get(Sip, sip_id)
        assert sip.status == "ready" and sip.ready_at is not None
        assert sip.meta == {"prompts": prompts.VERSION, "models": {
            "interpretation": "openai/gpt-6-luna", "curriculum": "anthropic/claude-opus-5.5", "mapping": "openai/gpt-6.1-sol",
        }}
    await drain(FakeClient())
    first = await _first(sip_id)
    assert first.status == "ready" and first.generated_at is not None
    assert first.meta["prompts"] == prompts.VERSION and set(first.meta["models"]) == {"planning", "writing", "review", "solve"}


async def test_a_retry_resumes_after_the_modules_already_mapped(auth_client):
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    broken = FakeClient({"ModuleMapping": [MAPPING] + [{"nope": 1}] * 20})
    for _ in range(3):
        async with SessionLocal() as s:
            await s.execute(update(Job).where(Job.type == "build_sip").values(run_after=utcnow() - timedelta(minutes=1)))
            await s.commit()
        assert await worker.process_one(broken)
    async with SessionLocal() as s:
        assert (await s.get(Sip, sip_id)).status == "failed"
        kept = (await s.scalars(select(Module).where(Module.sip_id == sip_id))).all()
    assert [m.position for m in kept] == [1]
    first_id = (await _first(sip_id)).id

    assert (await auth_client.post(f"/sips/{sip_id}/retry")).status_code == 202
    fresh = FakeClient()
    await drain(fresh)
    assert [c for c, _ in fresh.calls].count("ModuleMapping") == 1  # only M2
    async with SessionLocal() as s:
        sip = await s.get(Sip, sip_id)
        lessons = (await s.scalars(select(Lesson).where(Lesson.sip_id == sip_id).order_by(Lesson.global_index))).all()
    assert sip.status == "ready"
    assert [l.key for l in lessons] == ["M1L1", "M1L2", "M2L1", "M2L2"]
    assert [l.global_index for l in lessons] == [0, 1, 2, 3]
    assert lessons[0].id == first_id and lessons[0].status == "ready"


async def test_a_wrong_answer_key_is_revised_then_dropped(auth_client):
    sure_wrong = {"items": [{"item": "b7c1", "truth": True, "sure": True, "note": "depends on fees"}]}
    fake = FakeClient({"LessonDraft": [WITH_SWIPE, WITH_SWIPE], "Solved": [sure_wrong, sure_wrong]})
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    assert await worker.process_one(fake)  # build
    assert await worker.process_one(fake)  # first lesson
    first = await _first(sip_id)
    assert first.status == "ready" and first.revisions == 1
    revision = next(msgs for name, _, msgs in fake.sent if name == "LessonDraft" and "ISSUES TO FIX" in msgs[-1]["content"])
    assert "[critical/answer_key] block 7 card 1" in revision[-1]["content"]
    swipe = next(b for b in first.blocks if b["type"] == "swipe")
    assert [c["statement"] for c in swipe["cards"]] == [SWIPE["cards"][i]["statement"] for i in (0, 2, 3)]
    assert len(first.review["solve"]["disagreements"]) == 2 and len(first.review["solve"]["removed"]) == 1


async def test_the_solver_never_sees_the_key_and_unsure_answers_pass(auth_client):
    unsure = {"items": [{"item": "b4", "choice": ["b"], "sure": False, "note": "ambiguous"}]}
    fake = FakeClient({"Solved": [unsure]})
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(fake)
    first = await _first(sip_id)
    assert first.status == "ready" and first.revisions == 0
    solve_msgs = next(msgs for name, _, msgs in fake.sent if name == "Solved")
    assert "correct_option_ids" not in solve_msgs[-1]["content"] and "C'est le coût" not in solve_msgs[-1]["content"]


async def test_calls_carry_the_stage_ceiling(auth_client):
    fake = FakeClient()
    await auth_client.post("/sips", json={"input": "taux"})
    await drain(fake)
    caps = get_settings().llm_max_tokens
    by_schema = {name: options for name, options in fake.options}
    assert by_schema["LessonDraft"] == {"max_tokens": caps["writing"]}
    assert by_schema["Solved"] == {"max_tokens": caps["solve"]}


def test_simulate_values_are_checked_against_their_formula():
    simulate = {
        "type": "simulate", "prompt": "Place 10 000 € à 5 %.", "parameter": "Durée", "parameter_unit": "ans",
        "output": "Intérêts", "output_unit": "€", "takeaway": "Ça accélère.",
        "points": [{"x": 1, "y": 500}, {"x": 10, "y": 6289}, {"x": 20, "y": 20000}],
        "formula": "10000 * 1.05 ** x - 10000",
    }
    data = copy.deepcopy(DRAFT)
    data["blocks"].insert(3, simulate)
    errors = check_lesson(LessonDraft.model_validate(data), ["taux d'intérêt"], [], 5).errors
    assert errors == [
        "block 3 (simulate) values disagree with its formula '10000 * 1.05 ** x - 10000': at x=20 y is 20000, "
        "the formula gives 1.653e+04. Fix the values (and any number quoted in the text), or the formula if it is the wrong one"
    ]
    simulate["points"][2]["y"] = 16533
    assert check_lesson(LessonDraft.model_validate(data), ["taux d'intérêt"], [], 5).errors == []
    simulate["formula"] = "import os"
    assert "cannot be computed" in check_lesson(LessonDraft.model_validate(data), ["taux d'intérêt"], [], 5).errors[0]


async def test_style_issues_left_after_the_revision_do_not_fail_the_lesson(auth_client):
    style = {"verdict": "revise", "issues": [
        {"severity": "major", "category": "repetition", "block_index": 2, "description": "says it twice", "fix": "cut"},
    ]}
    wrong = {"verdict": "revise", "issues": [
        {"severity": "major", "category": "factual", "block_index": 1, "description": "wrong rate", "fix": "fix"},
    ]}
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    await drain(FakeClient({"Review": [style, style]}))
    first = await _first(sip_id)
    assert first.status == "ready" and first.revisions == 1

    sip_id = (await auth_client.post("/sips", json={"input": "autre"})).json()["id"]
    await drain(FakeClient({"Review": [wrong, wrong]}))
    first = await _first(sip_id)
    assert first.status == "failed" and first.error == "wrong rate"
