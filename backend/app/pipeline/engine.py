"""Pipeline orchestration.

build_sip:        interpretation -> curriculum -> mapping   (roadmap, once per Sip)
generate_lesson:  planning -> writing -> checks + review -> (one revision)   (per lesson)
"""

import asyncio
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
from app.llm.client import LLMError, StructuredLLM
from app.models import Lesson, LessonStatus, Module, Program, Sip, SipStatus, User, utcnow
from app.pipeline import programs, prompts, solve
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
from app.pipeline.solve import Solved
from app.quota import check_cost

log = logging.getLogger(__name__)

RECENT_SUMMARIES = 8

# After the revisions, a lesson still reaches the learner unless it is wrong: a remaining
# critical issue, or a major one in these categories. Style issues (repetition, density...)
# are worth one revision, not a failed lesson the learner has to retry.
BLOCKING = {"factual", "contradiction", "misleading_example"}


def blocking(review: Review) -> list:
    return [
        i for i in review.issues
        if i.severity == "critical" or (i.severity == "major" and i.category in BLOCKING)
    ]

JOB_BUILD_SIP = "build_sip"
JOB_GENERATE_LESSON = "generate_lesson"


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1)


# --- Jobs entry points ---------------------------------------------------------



# What the learner said about past lessons ("too easy" / "too hard"), for the ones not written yet.
DIFFICULTY_NOTES = {
    -2: "LEARNER FEEDBACK: past lessons felt much too hard. Go slower: one idea at a time, more concrete examples, simpler words, easier questions.",
    -1: "LEARNER FEEDBACK: past lessons felt a bit hard. Slightly slower pace and an extra example before questions.",
    1: "LEARNER FEEDBACK: past lessons felt a bit easy. Slightly denser, skip the obvious, slightly harder questions.",
    2: "LEARNER FEEDBACK: past lessons felt much too easy. Go deeper and faster, assume the basics, use challenging questions.",
}

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
        owner = await session.get(User, sip.user_id)
        profile = await llm.generate(
            "interpretation",
            prompts.INTERPRETATION,
            prompts.interpretation_input(sip.input_text, owner.language if owner else None),
            LearningProfile,
        )
        await check_claim(session)
        sip.profile = profile.model_dump()
        sip.title = profile.title
    profile = LearningProfile.model_validate(sip.profile)
    if profile.safety == "refuse":
        # Nothing is built and the creation is given back; the note says why, kindly.
        sip.status, sip.stage, sip.error = SipStatus.FAILED, "refused", profile.safety_note or "refused"
        owner = await session.get(User, sip.user_id)
        if owner is not None and owner.gen_count > 0:
            owner.gen_count -= 1
        await session.commit()
        return

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
        budget_min, budget_max = max(8, est - 3), min(max(est, 8) + 4, s.lesson_budget["standard"][1])
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

    # 3. Mapping, one module at a time. Each module is saved as soon as it is mapped, so the
    # first lesson starts being written while later modules are still mapped, and a retry
    # resumes after the last saved module.
    await check_claim(session)
    overview = "\n".join(
        f"M{i}. {m.title} — {m.role}" for i, m in enumerate(curriculum.modules, start=1)
    )
    saved = (
        (await session.execute(select(Module).where(Module.sip_id == sip.id).order_by(Module.position)))
        .scalars()
        .all()
    )
    saved_lessons = (
        (await session.execute(select(Lesson).where(Lesson.sip_id == sip.id).order_by(Lesson.global_index)))
        .scalars()
        .all()
    )
    if [m.position for m in saved] != list(range(1, len(saved) + 1)) or len(saved) > len(curriculum.modules):
        await session.execute(delete(Module).where(Module.sip_id == sip.id))
        saved, saved_lessons = [], []
    known_keys = [l.key for l in saved_lessons]
    previous_lines = [f"{l.key}: {l.title} — concepts: {', '.join(l.concepts)}" for l in saved_lessons]
    remaining = budget_max - len(saved_lessons)
    gi = len(saved_lessons)
    for mi, cm in enumerate(curriculum.modules, start=1):
        if mi <= len(saved):
            continue
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

        await check_claim(session)
        module = Module(
            sip_id=sip.id, position=mi, title=cm.title, role=cm.role, objectives=cm.objectives
        )
        session.add(module)
        await session.flush()
        for li, ml in enumerate(mapping.lessons, start=1):
            key = f"M{mi}L{li}"
            known_keys.append(key)
            previous_lines.append(f"{key}: {ml.title} — concepts: {', '.join(ml.concepts)}")
            session.add(Lesson(
                sip_id=sip.id,
                module_id=module.id,
                position=li,
                global_index=gi,
                key=key,
                title=ml.title,
                objective=ml.objective,
                prerequisites=ml.prerequisites,
                concepts=ml.concepts,
            ))
            gi += 1
        remaining -= len(mapping.lessons)
        await session.flush()
        if mi == 1:
            # The learner waits for this one: start writing it now.
            await request_lesson(session, await _first_lesson(session, sip.id), chain=True, optional=True)
        await session.commit()

    if gi > budget_max:
        raise ValueError("mapping exceeds the total lesson budget")
    await check_claim(session)
    sip.status, sip.stage, sip.ready_at = SipStatus.READY, None, utcnow()
    sip.meta = {"prompts": prompts.VERSION, "models": dict(llm.used)}
    first = await _first_lesson(session, sip.id)
    if first is not None:
        if first.status == LessonStatus.READY:
            # Written before the last module was mapped: its prefetch found no next lesson yet.
            nxt = await next_lesson(session, first)
            if nxt is not None:
                await request_lesson(session, nxt, chain=False, optional=True)
        else:
            await request_lesson(session, first, chain=True, optional=True)
    await session.commit()


async def _first_lesson(session: AsyncSession, sip_id: str) -> Lesson | None:
    return (
        await session.execute(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.global_index == 0))
    ).scalar_one_or_none()


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

    # From the stored curriculum: the first lesson is written while later modules are still mapped.
    planned = [(m["title"], m["role"]) for m in (sip.curriculum or {}).get("modules", [])] or [
        (m.title, m.role) for m in modules
    ]
    parts = [
        f"LEARNING PROFILE:\n{_dump(sip.profile)}",
        *([chapter_ctx] if chapter_ctx else []),
        "CURRICULUM:\n"
        + "\n".join(
            f"{'>>' if i == module.position else '  '} M{i}. {title} — {role}"
            for i, (title, role) in enumerate(planned, start=1)
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
    if sip.difficulty:
        context = "\n\n".join([context, DIFFICULTY_NOTES[max(-2, min(2, sip.difficulty))]])
    fmt = {"lesson_minutes": s.lesson_minutes, "language": language}

    # 4. Planning
    plan = await llm.generate("planning", prompts.PLANNING.format(**fmt), context, LessonPlan)

    # 5. Writing
    writing_input = f"{context}\n\nLESSON PLAN:\n{_dump(plan.model_dump())}"
    draft = await llm.generate("writing", prompts.WRITING.format(**fmt), writing_input, LessonDraft)

    # 6. Deterministic checks, LLM review and the blind answer-key check (in parallel),
    # at most `max_revisions` revisions; answers still disputed after that are dropped.
    seed = lesson.id

    async def inspect(draft: LessonDraft):
        checks = check_lesson(draft, lesson.concepts, known, s.lesson_minutes)
        review_call = llm.generate(
            "review",
            prompts.REVIEW.format(**fmt),
            f"{context}\n\nLESSON PLAN:\n{_dump(plan.model_dump())}\n\n"
            f"LESSON (blocks are 0-indexed):\n{_dump(draft.model_dump())}",
            Review,
            escalate=False,
        )
        solve_text, key = solve.solve_input(draft, seed) if s.solve_enabled else (None, {})
        if solve_text is None:
            return checks, await review_call, []
        review, solved = await asyncio.gather(
            review_call,
            llm.generate("solve", prompts.SOLVE, solve_text, Solved, escalate=False),
            return_exceptions=True,
        )
        if isinstance(review, BaseException):
            raise review
        if isinstance(solved, BaseException):
            # An extra check: if it cannot run, the lesson goes on with the review alone.
            if not isinstance(solved, (LLMError, HTTPException)):
                raise solved
            log.warning("lesson %s: answer check skipped: %s", lesson.id, solved)
            return checks, review, []
        return checks, review, solve.disagreements(solved, key)

    checks, review, disputed = await inspect(draft)
    revisions = 0
    review_log: list[dict[str, Any]] = [
        {"checks": {"errors": checks.errors, "warnings": checks.warnings}, "review": review.model_dump(), "disputed": disputed}
    ]
    while (checks.errors or review.verdict == "revise" or disputed) and revisions < s.max_revisions:
        issues = [f"- [structure] {e}" for e in checks.errors] + [
            f"- [{i.severity}/{i.category}] block {i.block_index}: {i.description} -> fix: {i.fix}"
            for i in review.issues
            if i.severity != "minor" or review.verdict == "revise"
        ] + [
            f"- [critical/answer_key] block {d['block']}"
            + (f" card {d['card']}" if d["card"] is not None else "")
            + f": {d['detail']}. Check the fact; fix the key, or reword the item so only one answer is defensible."
            for d in disputed
        ]
        draft = await llm.generate(
            "writing",
            prompts.WRITING.format(**fmt) + "\n\n" + prompts.REVISION,
            f"{writing_input}\n\nCURRENT LESSON:\n{_dump(draft.model_dump())}\n\n"
            "ISSUES TO FIX:\n" + "\n".join(issues),
            LessonDraft,
        )
        revisions += 1
        checks, review, disputed = await inspect(draft)
        review_log.append({
            "checks": {"errors": checks.errors, "warnings": checks.warnings},
            "review": review.model_dump(),
            "disputed": disputed,
        })

    removed: list[dict[str, Any]] = []
    if disputed and not checks.errors:
        # Still disputed after the revision: drop the item if the lesson holds without it,
        # otherwise keep it (the solver can be the one that is wrong) and leave the trace.
        draft, removed = solve.drop_disputed(draft, disputed, lesson.concepts, known, s.lesson_minutes)

    await check_claim(session)
    lesson.plan = plan.model_dump()
    lesson.blocks = [b.model_dump(exclude_none=True) for b in draft.blocks]
    lesson.summary = draft.summary
    lesson.concepts_taught = draft.concepts_taught
    lesson.review = {
        "rounds": review_log,
        "unresolved_errors": checks.errors,
        "solve": {"disagreements": [d for r in review_log for d in r["disputed"]], "removed": removed},
    }
    lesson.revisions = revisions
    lesson.meta = {"prompts": prompts.VERSION, "models": dict(llm.used)}
    lesson.generated_at = utcnow()
    failed = bool(checks.errors) or bool(blocking(review))
    lesson.status = LessonStatus.FAILED if failed else LessonStatus.READY
    lesson.error = "; ".join(
        checks.errors
        or [i.description for i in blocking(review)]
        or ["lesson still requires revision"]
    )[:2000] if failed else None
    if chain and not failed:
        nxt = await next_lesson(session, lesson)
        if nxt is not None:
            await request_lesson(session, nxt, chain=False, optional=True)  # prefetch one ahead, no cascade
    await session.commit()
