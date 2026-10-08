import asyncio
import copy

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import worker
from app.llm.client import StructuredLLM
from app.models import Job, Lesson, LessonStatus, Program, ProgramStatus, Sip
from app.pipeline import engine, programs
from app.pipeline.blocks import EstimateBlock, QuestionBlock
from app.pipeline.schemas import (
    CurriculumModule, LearningProfile, MappedLesson, Roadmap, RoadmapChapter, RoadmapExtension,
)
from tests.fakes import CURRICULUM, DRAFT, MAPPING, PROFILE, REVIEW_PASS, REVIEW_REVISE, FakeClient
from tests.test_programs import EXTENSION, ROADMAP, _program_client


async def _mapped_sip(auth_client, fake=None):
    sip_id = (await auth_client.post("/sips", json={"input": "taux"})).json()["id"]
    assert await worker.process_one(fake or FakeClient())
    return sip_id


async def test_stale_lesson_requests_enqueue_once(auth_client):
    sip_id = await _mapped_sip(auth_client)
    async with SessionLocal() as first, SessionLocal() as second:
        lesson = await first.scalar(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.global_index == 1))
        stale = await second.get(Lesson, lesson.id)
        assert await engine.request_lesson(first, lesson)
        await first.commit()
        assert not await engine.request_lesson(second, stale)
        await second.commit()
        jobs = (await second.scalars(select(Job).where(Job.type == engine.JOB_GENERATE_LESSON))).all()
        assert sum(job.payload["lesson_id"] == lesson.id for job in jobs) == 1
        assert (await second.get(Lesson, lesson.id)).status == LessonStatus.QUEUED


async def test_lesson_generation_has_one_owner(auth_client):
    entered, proceed = asyncio.Event(), asyncio.Event()

    class Paused(FakeClient):
        async def complete(self, model, messages, schema_name, schema):
            if schema_name == "LessonPlan":
                entered.set()
                await proceed.wait()
            return await super().complete(model, messages, schema_name, schema)

    sip_id = await _mapped_sip(auth_client)
    async with SessionLocal() as first, SessionLocal() as second:
        lesson = await first.scalar(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.global_index == 1))
        stale = await second.get(Lesson, lesson.id)
        fake, duplicate = Paused(), FakeClient()
        task = asyncio.create_task(engine.generate_lesson(first, StructuredLLM(fake), lesson.id))
        try:
            await asyncio.wait_for(entered.wait(), timeout=5)
            await engine.generate_lesson(second, StructuredLLM(duplicate), stale.id)
            assert duplicate.calls == []
        finally:
            proceed.set()
            await task
        await second.refresh(stale)
        assert stale.status == LessonStatus.READY


async def test_structural_failure_is_recoverable_without_prefetch(auth_client):
    invalid = {**DRAFT, "blocks": DRAFT["blocks"][:-1]}
    fake = FakeClient({"LessonDraft": [invalid, invalid]})
    sip_id = await _mapped_sip(auth_client, fake)
    assert await worker.process_one(fake)
    async with SessionLocal() as session:
        lessons = (await session.scalars(select(Lesson).where(Lesson.sip_id == sip_id).order_by(Lesson.global_index))).all()
        assert lessons[0].status == LessonStatus.FAILED
        assert "recap" in lessons[0].error
        assert lessons[0].review["unresolved_errors"]
        assert lessons[1].status == LessonStatus.PENDING
        first_id = lessons[0].id
    assert not await worker.process_one(fake)
    queued = await auth_client.get(f"/lessons/{first_id}")
    assert queued.status_code == 200
    assert queued.json()["status"] == LessonStatus.QUEUED
    assert queued.json()["blocks"] is None
    assert await worker.process_one(FakeClient())
    assert (await auth_client.get(f"/lessons/{first_id}")).json()["status"] == LessonStatus.READY


@pytest.mark.parametrize("final_review, status", [(REVIEW_PASS, LessonStatus.READY), (REVIEW_REVISE, LessonStatus.FAILED)])
async def test_final_review_controls_publication(auth_client, monkeypatch, final_review, status):
    monkeypatch.setattr(get_settings(), "max_revisions", 3 if status == LessonStatus.READY else 1)
    fake = FakeClient({"Review": [REVIEW_REVISE, final_review]})
    sip_id = await _mapped_sip(auth_client, fake)
    assert await worker.process_one(fake)
    async with SessionLocal() as session:
        lesson = await session.scalar(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.global_index == 0))
        assert lesson.status == status
        assert lesson.revisions == 1
        assert [round["review"]["verdict"] for round in lesson.review["rounds"]] == ["revise", final_review["verdict"]]
    assert [schema for schema, _ in fake.calls].count("LessonDraft") == 2
    assert [schema for schema, _ in fake.calls].count("Review") == 2
    if status == LessonStatus.FAILED:
        assert not await worker.process_one(fake)


async def test_mapping_uses_remaining_global_budget(auth_client):
    curriculum = {**CURRICULUM, "modules": [{**CURRICULUM["modules"][0], "title": f"M{i}", "estimated_lessons": 1} for i in range(10)]}

    class MappingClient(FakeClient):
        def __init__(self):
            super().__init__({"LearningProfile": [{**PROFILE, "scope": "focused"}], "Curriculum": [curriculum]})
            self.limits = []

        async def complete(self, model, messages, schema_name, schema):
            if schema_name == "ModuleMapping":
                limit = schema["properties"]["lessons"]["maxItems"]
                self.limits.append(limit)
                assert "Remaining global lesson budget:" in messages[1]["content"]
                self.queue["ModuleMapping"] = [{"lessons": [copy.deepcopy(MAPPING["lessons"][0]) for _ in range(min(3, limit))]}]
            return await super().complete(model, messages, schema_name, schema)

    fake = MappingClient()
    sip_id = await _mapped_sip(auth_client, fake)
    async with SessionLocal() as session:
        assert (await session.get(Sip, sip_id)).status == "ready"
        assert await session.scalar(select(func.count()).select_from(Lesson).where(Lesson.sip_id == sip_id)) == 10
    assert fake.limits == [1] * 10


async def test_adjustment_can_remove_all_remaining_chapters(auth_client):
    sip_id = await _mapped_sip(auth_client, _program_client())
    async with SessionLocal() as session:
        sip = await session.get(Sip, sip_id)
        program = await session.get(Program, sip.program_id)
        program.status = ProgramStatus.ADJUSTING
        await session.commit()
        fake = FakeClient({"RoadmapAdjustment": [{"changed": True, "note": "Parcours complet.", "chapters": []}]})
        await programs.adjust_program(session, StructuredLLM(fake), program.id)
        assert program.roadmap == ROADMAP["chapters"][:1]
        assert program.note == "Parcours complet."
        assert program.status == ProgramStatus.READY


@pytest.mark.parametrize("schema, value", [
    (LearningProfile, PROFILE), (Roadmap, ROADMAP), (RoadmapExtension, EXTENSION),
    (RoadmapChapter, ROADMAP["chapters"][0]), (CurriculumModule, CURRICULUM["modules"][0]),
    (MappedLesson, MAPPING["lessons"][0]),
])
def test_pipeline_titles_match_database_limits(schema, value):
    assert schema.model_validate({**value, "title": "x" * 300})
    with pytest.raises(ValidationError, match="300"):
        schema.model_validate({**value, "title": "x" * 301})


def test_multiple_choice_rejects_duplicate_correct_ids():
    question = DRAFT["blocks"][4]
    with pytest.raises(ValidationError, match="must be unique"):
        QuestionBlock.model_validate({**question, "kind": "multiple_choice", "correct_option_ids": ["a", "a"]})


ESTIMATE = {"type": "estimate", "prompt": "Combien ?", "min": 0, "max": 100, "step": 10, "answer": 42, "tolerance": 0, "explanation": "x"}


@pytest.mark.parametrize("values, valid", [
    ({}, False), ({"tolerance": 1.9}, False), ({"tolerance": 2}, True),
    ({"max": 95, "answer": 94, "tolerance": 3}, False),
    ({"max": 95, "answer": 94, "tolerance": 4}, True),
    ({"min": 0.15, "max": 0.9, "step": 0.25, "answer": 0.4}, True),
    ({"min": 0, "max": 1, "step": 0.1, "answer": 0.3}, True),
    ({"answer": 40.00000000000001}, False),
    ({"min": -10, "max": 10, "step": 3, "answer": -7}, True),
])
def test_estimate_requires_reachable_answer(values, valid):
    if valid:
        assert EstimateBlock.model_validate({**ESTIMATE, **values})
    else:
        with pytest.raises(ValidationError, match="unreachable"):
            EstimateBlock.model_validate({**ESTIMATE, **values})


@pytest.mark.parametrize("field", ["min", "max", "step", "answer", "tolerance"])
@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_estimate_rejects_non_finite_numbers(field, value):
    with pytest.raises(ValidationError):
        EstimateBlock.model_validate({**ESTIMATE, field: value})
