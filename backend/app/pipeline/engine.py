"""Pipeline orchestration.

build_sip:        interpretation -> curriculum -> mapping   (roadmap, once per Sip)
generate_lesson:  planning -> writing -> checks + review -> (one revision)   (per lesson)
"""

import dataclasses
import json
import logging
from typing import Any

from fastapi import HTTPException
from pydantic import Field, create_model, model_validator
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.jobs.queue import check_claim, enqueue
from app.llm.client import StructuredLLM
from app.models import Lesson, LessonStatus, Module, Program, Sip, SipStatus, User
from app.pipeline import programs, prompts
from app.pipeline.checks import check_lesson, clean_mapping, normalize
from app.pipeline.schemas import (
    Curriculum,
    CurriculumModule,
    LearningProfile,
    LessonDraft,
    LessonPlan,
    MappedLesson,
    ModuleMapping,
    Review,
)
from app.quota import check_cost

log = logging.getLogger(__name__)

RECENT_SUMMARIES = 8

JOB_BUILD_SIP = "build_sip"
JOB_GENERATE_LESSON = "generate_lesson"


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1)


# --- Jobs entry points ---------------------------------------------------------


async def request_lesson(
    session: AsyncSession, lesson: Lesson, chain: bool = True, optional: bool = False
) -> bool:
    """Queue generation of a lesson if needed. Returns True if a job was queued."""
    if lesson.status not in (LessonStatus.PENDING, LessonStatus.FAILED):
        return False
    await check_claim(session)
    sip = await session.get(Sip, lesson.sip_id)
    user = await session.get(User, sip.user_id)
    try:
        await check_cost(session, user)
    except HTTPException as e:
        if optional and e.status_code == 429 and isinstance(e.detail, dict) and e.detail.get("code") in (
            "daily_budget_reached", "global_daily_budget_reached"
        ):
            return False
        raise
    queued = await session.execute(
        update(Lesson).where(
            Lesson.id == lesson.id, Lesson.status.in_((LessonStatus.PENDING, LessonStatus.FAILED))
        ).values(status=LessonStatus.QUEUED, error=None)
    )
    if not queued.rowcount:
        await session.refresh(lesson)
        return False
    await enqueue(session, JOB_GENERATE_LESSON, {"lesson_id": lesson.id, "chain": chain})
    return True


async def next_lesson(session: AsyncSession, lesson: Lesson) -> Lesson | None:
    return (
        await session.execute(
            select(Lesson).where(
                Lesson.sip_id == lesson.sip_id, Lesson.global_index == lesson.global_index + 1
            )
        )
    ).scalar_one_or_none()


# --- Roadmap ---------------------------------------------------------------------


def _bounded_curriculum(max_modules: int, max_per_module: int, max_total: int) -> type[Curriculum]:
    def _budget(self):
        total = sum(m.estimated_lessons for m in self.modules)
        if total > max_total:
            raise ValueError(
                f"total estimated_lessons is {total}, budget is at most {max_total}: "
                "cut side topics or merge modules"
            )
        over = [m.title for m in self.modules if m.estimated_lessons > max_per_module]
        if over:
            raise ValueError(f"modules over {max_per_module} lessons: {over}")
        return self

    return create_model(
        "Curriculum",
        __base__=Curriculum,
        __validators__={"_budget": model_validator(mode="after")(_budget)},
        modules=(list[CurriculumModule], Field(min_length=1, max_length=max_modules)),
    )


async def build_sip(session: AsyncSession, llm: StructuredLLM, sip_id: str) -> None:
    s = get_settings()
    sip = await session.get(Sip, sip_id)
    if sip is None or sip.status == SipStatus.READY:
        return
    await check_claim(session)
    sip.status, sip.error = SipStatus.GENERATING, None
    if sip.lite:
        llm = dataclasses.replace(llm, lite=True)

    # 1. Interpretation (reused on retry)
    if sip.profile is None:
        sip.stage = "interpretation"
        await session.commit()
        profile = await llm.generate(
            "interpretation", prompts.INTERPRETATION, sip.input_text, LearningProfile
        )
        await check_claim(session)
        sip.profile = profile.model_dump()
        sip.title = profile.title
    profile = LearningProfile.model_validate(sip.profile)

    # 1b. Big goal: write the program roadmap, this Sip becomes its first chapter.
    if sip.program_id is None and profile.breadth == "program":
        sip.stage = "roadmap"
        await session.commit()
        await programs.create_program(session, llm, sip, profile)
    chapter_ctx, chapter_known = await programs.program_context(session, sip)

    budget_min, budget_max = s.lesson_budget.get(profile.scope, s.lesson_budget["standard"])
    max_modules = s.max_modules
    if sip.program_id is not None:
        est = programs.chapter_of(await session.get(Program, sip.program_id), sip.chapter)[
            "estimated_lessons"
        ]
        budget_min, budget_max = max(3, est - 3), min(est + 4, s.lesson_budget["standard"][1])
    if sip.lite:
        budget_min, budget_max = s.lite_lesson_budget
        max_modules = s.lite_max_modules

    # 2. Curriculum (reused on retry)
    if sip.curriculum is None:
        sip.stage = "curriculum"
        await session.commit()
        bounded = _bounded_curriculum(max_modules, s.max_lessons_per_module, budget_max)
        curriculum = await llm.generate(
            "curriculum",
            prompts.CURRICULUM.format(
                lesson_minutes=s.lesson_minutes,
                max_modules=max_modules,
                budget_min=budget_min,
                budget_max=budget_max,
                language=profile.language,
            ),
            f"Learner's own words:\n{sip.input_text}\n\nLearning profile:\n{_dump(sip.profile)}"
            + (f"\n\nThis path is a CHAPTER of a program:\n{chapter_ctx}" if chapter_ctx else ""),
            bounded,
        )
        await check_claim(session)
        sip.curriculum = curriculum.model_dump()
        sip.summary = curriculum.summary
    curriculum = Curriculum.model_validate(sip.curriculum)

    # 3. Mapping (restart from scratch on retry: modules are cheap compared to coherence)
    await check_claim(session)
    await session.execute(delete(Module).where(Module.sip_id == sip.id))
    overview = "\n".join(
        f"M{i}. {m.title} — {m.role}" for i, m in enumerate(curriculum.modules, start=1)
    )
    mapped: list[tuple[CurriculumModule, ModuleMapping]] = []
    known_keys: list[str] = []
    previous_lines: list[str] = []
    remaining = budget_max
    for mi, cm in enumerate(curriculum.modules, start=1):
        await check_claim(session)
        sip.stage = f"mapping:{mi}/{len(curriculum.modules)}"
        await session.commit()
        user = (
            f"Learning profile:\n{_dump(sip.profile)}\n\n"
            f"Curriculum:\n{overview}\n\n"
            f"Module to map: M{mi}. {cm.title}\nRole: {cm.role}\n"
            f"Remaining global lesson budget: {remaining}; reserve one lesson per later module.\n"
            f"Objectives:\n" + "\n".join(f"- {o}" for o in cm.objectives) + "\n\n"
            "Lessons already mapped in previous modules:\n"
            + ("\n".join(previous_lines) if previous_lines else "(none)")
            + (
                "\n\nAlready taught in earlier chapters of the program (do not re-teach):\n"
                + ", ".join(chapter_known)
                if chapter_known
                else ""
            )
        )
        max_lessons = min(
            s.max_lessons_per_module, cm.estimated_lessons + (0 if sip.lite else 2),
            remaining - (len(curriculum.modules) - mi),
        )
        if max_lessons < 1:
            raise ValueError("curriculum exceeds the total lesson budget")
        bounded_mapping = create_model(
            "ModuleMapping",
            __base__=ModuleMapping,
            lessons=(list[MappedLesson], Field(min_length=1, max_length=max_lessons)),
        )
        mapping = await llm.generate(
            "mapping",
            prompts.MAPPING.format(
                lesson_minutes=s.lesson_minutes,
                estimated=cm.estimated_lessons,
                max_lessons=max_lessons,
                module_key=f"M{mi}",
                language=profile.language,
            ),
            user,
            bounded_mapping,
        )
        mapping, res = clean_mapping(mapping, mi, known_keys, max_lessons)
        if res.errors:
            raise ValueError("; ".join(res.errors))
        for w in res.warnings:
            log.info("sip %s mapping: %s", sip.id, w)
        for li, ml in enumerate(mapping.lessons, start=1):
            key = f"M{mi}L{li}"
            known_keys.append(key)
            previous_lines.append(f"{key}: {ml.title} — concepts: {', '.join(ml.concepts)}")
        mapped.append((cm, mapping))
        remaining -= len(mapping.lessons)

    if sum(len(mapping.lessons) for _, mapping in mapped) > budget_max:
        raise ValueError("mapping exceeds the total lesson budget")
    await check_claim(session)
    gi = 0
    first: Lesson | None = None
    for mi, (cm, mapping) in enumerate(mapped, start=1):
        module = Module(
            sip_id=sip.id, position=mi, title=cm.title, role=cm.role, objectives=cm.objectives
        )
        session.add(module)
        await session.flush()
        for li, ml in enumerate(mapping.lessons, start=1):
            lesson = Lesson(
                sip_id=sip.id,
                module_id=module.id,
                position=li,
                global_index=gi,
                key=f"M{mi}L{li}",
                title=ml.title,
                objective=ml.objective,
                prerequisites=ml.prerequisites,
                concepts=ml.concepts,
            )
            session.add(lesson)
            first = first or lesson
            gi += 1
    await session.flush()

    sip.status, sip.stage = SipStatus.READY, None
    if first is not None:
        await request_lesson(session, first, chain=True, optional=True)
    await session.commit()


# --- Lesson ------------------------------------------------------------------------


async def build_lesson_context(session: AsyncSession, lesson: Lesson) -> tuple[str, list[str]]:
    """Context for planning/writing/review + list of known concepts."""
    sip = await session.get(Sip, lesson.sip_id)
    modules = (
        (await session.execute(select(Module).where(Module.sip_id == sip.id).order_by(Module.position)))
        .scalars()
        .all()
    )
    lessons = (
        (await session.execute(select(Lesson).where(Lesson.sip_id == sip.id).order_by(Lesson.global_index)))
        .scalars()
        .all()
    )
    by_key = {l.key: l for l in lessons}
    module = next(m for m in modules if m.id == lesson.module_id)
    earlier = [l for l in lessons if l.global_index < lesson.global_index]

    chapter_ctx, known = await programs.program_context(session, sip)
    seen: set[str] = {normalize(c) for c in known}
    for l in earlier:
        for c in l.concepts_taught or l.concepts:
            if normalize(c) not in seen:
                seen.add(normalize(c))
                known.append(c)

    parts = [
        f"LEARNING PROFILE:\n{_dump(sip.profile)}",
        *([chapter_ctx] if chapter_ctx else []),
        "CURRICULUM:\n"
        + "\n".join(
            f"{'>>' if m.id == module.id else '  '} M{m.position}. {m.title} — {m.role}" for m in modules
        ),
        f"CURRENT MODULE: M{module.position}. {module.title}\nRole: {module.role}\nObjectives:\n"
        + "\n".join(f"- {o}" for o in module.objectives)
        + "\nLessons:\n"
        + "\n".join(
            f"{'>>' if l.id == lesson.id else '  '} {l.key}: {l.title}"
            for l in lessons
            if l.module_id == module.id
        ),
    ]

    prereq_lines = []
    for key in lesson.prerequisites:
        p = by_key.get(key)
        if p:
            detail = p.summary or f"(planned) {p.objective}"
            prereq_lines.append(f"- {p.key} {p.title}: {detail}")
    if prereq_lines:
        parts.append("PREREQUISITE LESSONS:\n" + "\n".join(prereq_lines))

    recent = earlier[-RECENT_SUMMARIES:]
    older = earlier[:-RECENT_SUMMARIES] if len(earlier) > RECENT_SUMMARIES else []
    if older:
        parts.append("OLDER LESSONS:\n" + "\n".join(f"- {l.key}: {l.title}" for l in older))
    if recent:
        lines = []
        for l in recent:
            if l.summary:
                lines.append(f"- {l.key} {l.title}: {l.summary}")
            else:
                lines.append(f"- {l.key} {l.title} (not generated yet, planned objective): {l.objective}")
        parts.append("RECENT LESSONS:\n" + "\n".join(lines))
    last = earlier[-1] if earlier else None
    if last is not None and last.blocks:
        recap = next((b for b in reversed(last.blocks) if b.get("type") == "recap"), None)
        if recap:
            parts.append(
                f"PREVIOUS LESSON RECAP ({last.key}):\n" + "\n".join(f"- {p}" for p in recap["points"])
            )

    parts.append("KNOWN CONCEPTS (already taught):\n" + (", ".join(known) if known else "(none)"))
    parts.append(
        f"LESSON TO PRODUCE: {lesson.key} — {lesson.title}\n"
        f"Objective: {lesson.objective}\nPlanned concepts: {', '.join(lesson.concepts)}"
    )
    return "\n\n".join(parts), known


async def generate_lesson(
    session: AsyncSession, llm: StructuredLLM, lesson_id: str, chain: bool = False
) -> None:
    s = get_settings()
    lesson = await session.get(Lesson, lesson_id)
    if lesson is None:
        return
    await check_claim(session)
    claimed = await session.execute(
        update(Lesson).where(
            Lesson.id == lesson_id,
            Lesson.status.in_((LessonStatus.PENDING, LessonStatus.QUEUED, LessonStatus.FAILED)),
        ).values(status=LessonStatus.GENERATING, error=None)
    )
    if not claimed.rowcount:
        await session.commit()
        return
    sip = await session.get(Sip, lesson.sip_id)
    if sip.lite:
        llm = dataclasses.replace(llm, lite=True)
    language = (sip.profile or {}).get("language", "en")
    await session.commit()

    context, known = await build_lesson_context(session, lesson)
    fmt = {"lesson_minutes": s.lesson_minutes, "language": language}

    # 4. Planning
    plan = await llm.generate("planning", prompts.PLANNING.format(**fmt), context, LessonPlan)

    # 5. Writing
    writing_input = f"{context}\n\nLESSON PLAN:\n{_dump(plan.model_dump())}"
    draft = await llm.generate("writing", prompts.WRITING.format(**fmt), writing_input, LessonDraft)

    # 6. Deterministic checks + LLM review, at most `max_revisions` revisions
    checks = check_lesson(draft, lesson.concepts, known, s.lesson_minutes)
    review = await llm.generate(
        "review",
        prompts.REVIEW.format(**fmt),
        f"{context}\n\nLESSON PLAN:\n{_dump(plan.model_dump())}\n\n"
        f"LESSON (blocks are 0-indexed):\n{_dump(draft.model_dump())}",
        Review,
        escalate=False,
    )
    revisions = 0
    review_log: list[dict[str, Any]] = [
        {"checks": {"errors": checks.errors, "warnings": checks.warnings}, "review": review.model_dump()}
    ]
    while (checks.errors or review.verdict == "revise") and revisions < s.max_revisions:
        issues = [f"- [structure] {e}" for e in checks.errors] + [
            f"- [{i.severity}/{i.category}] block {i.block_index}: {i.description} -> fix: {i.fix}"
            for i in review.issues
            if i.severity != "minor" or review.verdict == "revise"
        ]
        draft = await llm.generate(
            "writing",
            prompts.WRITING.format(**fmt) + "\n\n" + prompts.REVISION,
            f"{writing_input}\n\nCURRENT LESSON:\n{_dump(draft.model_dump())}\n\n"
            "ISSUES TO FIX:\n" + "\n".join(issues),
            LessonDraft,
        )
        revisions += 1
        checks = check_lesson(draft, lesson.concepts, known, s.lesson_minutes)
        review = await llm.generate(
            "review",
            prompts.REVIEW.format(**fmt),
            f"{context}\n\nLESSON PLAN:\n{_dump(plan.model_dump())}\n\n"
            f"LESSON (blocks are 0-indexed):\n{_dump(draft.model_dump())}",
            Review,
            escalate=False,
        )
        review_log.append({
            "checks": {"errors": checks.errors, "warnings": checks.warnings},
            "review": review.model_dump(),
        })

    await check_claim(session)
    lesson.plan = plan.model_dump()
    lesson.blocks = [b.model_dump(exclude_none=True) for b in draft.blocks]
    lesson.summary = draft.summary
    lesson.concepts_taught = draft.concepts_taught
    lesson.review = {"rounds": review_log, "unresolved_errors": checks.errors}
    lesson.revisions = revisions
    failed = bool(checks.errors) or review.verdict == "revise"
    lesson.status = LessonStatus.FAILED if failed else LessonStatus.READY
    lesson.error = "; ".join(
        checks.errors or [i.description for i in review.issues] or ["lesson still requires revision"]
    )[:2000] if failed else None
    if chain and not failed:
        nxt = await next_lesson(session, lesson)
        if nxt is not None:
            await request_lesson(session, nxt, chain=False, optional=True)  # prefetch one ahead, no cascade
    await session.commit()
