"""Programs: big goals split into chapters, each chapter generated as a Sip on demand.

create_program:  roadmap for a big request, the request's Sip becomes chapter 1
extend_program:  "go further" after a finished Sip, which becomes chapter 1
program_context: what a chapter's generation must know about the program so far
"""

import dataclasses
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.llm.client import StructuredLLM
from app.models import Lesson, Module, Program, ProgramStatus, Sip
from app.pipeline import prompts
from app.pipeline.checks import normalize
from app.pipeline.schemas import LearningProfile, Roadmap, RoadmapAdjustment, RoadmapExtension

JOB_EXTEND_PROGRAM = "extend_program"
JOB_ADJUST_PROGRAM = "adjust_program"


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1)


def chapter_of(program: Program, position: int) -> dict[str, Any]:
    return program.roadmap[position - 1]


async def create_program(
    session: AsyncSession, llm: StructuredLLM, sip: Sip, profile: LearningProfile
) -> Program:
    s = get_settings()
    roadmap = await llm.generate(
        "roadmap",
        prompts.ROADMAP.format(lesson_minutes=s.lesson_minutes, language=profile.language),
        f"Learner's own words:\n{sip.input_text}\n\nLearning profile:\n{_dump(sip.profile)}",
        Roadmap,
    )
    program = Program(
        user_id=sip.user_id,
        title=roadmap.title,
        summary=roadmap.summary,
        profile=sip.profile,
        roadmap=[c.model_dump() for c in roadmap.chapters],
        lite=sip.lite,
    )
    session.add(program)
    await session.flush()
    sip.program_id, sip.chapter = program.id, 1
    sip.title = roadmap.chapters[0].title
    return program


async def extend_program(session: AsyncSession, llm: StructuredLLM, program_id: str) -> None:
    s = get_settings()
    program = await session.get(Program, program_id)
    if program is None or program.status == ProgramStatus.READY:
        return
    if program.lite:
        llm = dataclasses.replace(llm, lite=True)
    first = (
        await session.execute(select(Sip).where(Sip.program_id == program.id, Sip.chapter == 1))
    ).scalar_one()
    profile = LearningProfile.model_validate(first.profile)
    modules = (
        (await session.execute(select(Module).where(Module.sip_id == first.id).order_by(Module.position)))
        .scalars()
        .all()
    )
    user = (
        f"Learning profile:\n{_dump(first.profile)}\n\n"
        f"FINISHED PATH: {first.title}\n{first.summary or ''}\nModules:\n"
        + "\n".join(f"- {m.title}: {'; '.join(m.objectives)}" for m in modules)
        + "\n\nConcepts taught:\n"
        + ", ".join(await _concepts(session, first))
    )
    ext = await llm.generate(
        "roadmap",
        prompts.EXTENSION.format(lesson_minutes=s.lesson_minutes, language=profile.language),
        user,
        RoadmapExtension,
    )
    done = {
        "title": first.title or profile.title,
        "outcome": first.summary or (profile.goals[0] if profile.goals else ""),
        "level": "core",
        "estimated_lessons": max(4, min(25, len(await _lessons(session, first)))),
    }
    program.title, program.summary = ext.title, ext.summary
    program.roadmap = [done] + [c.model_dump() for c in ext.chapters]
    program.status, program.error = ProgramStatus.READY, None
    await session.commit()


async def _generated_chapters(session: AsyncSession, program: Program) -> list[Sip]:
    return list(
        (await session.execute(select(Sip).where(Sip.program_id == program.id).order_by(Sip.chapter)))
        .scalars()
        .all()
    )


async def should_adjust(session: AsyncSession, sip: Sip) -> bool:
    """A chapter was just finished and chapters remain to be generated."""
    if sip.program_id is None or sip.adjustment_queued:
        return False
    lessons = await _lessons(session, sip)
    if not lessons or any(l.completed_at is None for l in lessons):
        return False
    program = await session.get(Program, sip.program_id)
    if program is None or program.status != ProgramStatus.READY:
        return False
    generated = await _generated_chapters(session, program)
    return max(s.chapter or 0 for s in generated) < len(program.roadmap)


async def adjust_program(session: AsyncSession, llm: StructuredLLM, program_id: str) -> None:
    """Re-plan the chapters not generated yet, from what was taught and how the learner did."""
    s = get_settings()
    program = await session.get(Program, program_id)
    if program is None or program.status != ProgramStatus.ADJUSTING:
        return
    if program.lite:
        llm = dataclasses.replace(llm, lite=True)
    generated = await _generated_chapters(session, program)
    fixed = max((x.chapter or 0) for x in generated) if generated else 0
    profile = LearningProfile.model_validate(program.profile)

    lines = [f"PROGRAM: {program.title}\n{program.summary or ''}", "\nCHAPTERS ALREADY GENERATED (fixed):"]
    by_chapter = {x.chapter: x for x in generated}
    for i, c in enumerate(program.roadmap[:fixed], start=1):
        x = by_chapter.get(i)
        if x is None:
            lines.append(f"{i}. {c['title']} — {c['outcome']} (skipped by the learner)")
            continue
        lessons = await _lessons(session, x)
        done = [l for l in lessons if l.completed_at]
        stars = [l.stars for l in done if l.stars]
        weak = [l.title for l in done if l.stars is not None and l.stars <= 1]
        lines.append(
            f"{i}. {c['title']} — {c['outcome']}\n"
            f"   taught: {', '.join(await _concepts(session, x)) or '(nothing yet)'}\n"
            f"   progress: {len(done)}/{len(lessons)} lessons, average stars "
            + (f"{sum(stars) / len(stars):.1f}/3" if stars else "n/a")
            + (f"\n   struggled with: {'; '.join(weak)}" if weak else "")
        )
    lines.append("\nREMAINING CHAPTERS (to re-plan):")
    for i, c in enumerate(program.roadmap[fixed:], start=fixed + 1):
        lines.append(f"{i}. [{c['level']}] {c['title']} — {c['outcome']} ({c['estimated_lessons']} lessons)")

    adj = await llm.generate(
        "roadmap",
        prompts.ADJUST.format(language=profile.language),
        f"Learning profile:\n{_dump(program.profile)}\n\n" + "\n".join(lines),
        RoadmapAdjustment,
    )
    await session.refresh(program)
    still_fixed = max((x.chapter or 0) for x in await _generated_chapters(session, program))
    room = s.max_program_chapters - fixed
    if adj.changed and adj.chapters and still_fixed == fixed and room > 0:
        program.roadmap = program.roadmap[:fixed] + [c.model_dump() for c in adj.chapters[:room]]
        program.note = adj.note
    program.status = ProgramStatus.READY
    await session.commit()


async def _lessons(session: AsyncSession, sip: Sip) -> list[Lesson]:
    return list(
        (await session.execute(select(Lesson).where(Lesson.sip_id == sip.id).order_by(Lesson.global_index)))
        .scalars()
        .all()
    )


async def _concepts(session: AsyncSession, sip: Sip) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for l in await _lessons(session, sip):
        for c in l.concepts_taught or l.concepts:
            if normalize(c) not in seen:
                seen.add(normalize(c))
                out.append(c)
    return out


async def program_context(session: AsyncSession, sip: Sip) -> tuple[str, list[str]]:
    """Program overview and earlier chapters, plus concepts they taught. Empty if standalone."""
    if sip.program_id is None or sip.chapter is None:
        return "", []
    program = await session.get(Program, sip.program_id)
    earlier = (
        (
            await session.execute(
                select(Sip)
                .where(Sip.program_id == program.id, Sip.chapter < sip.chapter)
                .order_by(Sip.chapter)
            )
        )
        .scalars()
        .all()
    )
    lines = [f"PROGRAM: {program.title}\n{program.summary or ''}\nChapters:"]
    for i, c in enumerate(program.roadmap, start=1):
        mark = ">>" if i == sip.chapter else "  "
        lines.append(f"{mark} {i}. [{c['level']}] {c['title']} — {c['outcome']}")
    chapter = chapter_of(program, sip.chapter)
    lines.append(f"\nTHIS CHAPTER ({sip.chapter}): {chapter['title']}\nOutcome: {chapter['outcome']}")

    known: list[str] = []
    seen: set[str] = set()
    for prev in earlier:
        concepts = await _concepts(session, prev)
        weak = [l.title for l in await _lessons(session, prev) if l.stars is not None and l.stars <= 1]
        lines.append(
            f"\nEARLIER CHAPTER {prev.chapter}: {prev.title}\n{prev.summary or ''}\n"
            f"Concepts taught: {', '.join(concepts) or '(none yet)'}"
            + (f"\nLearner struggled with: {'; '.join(weak)}" if weak else "")
        )
        for c in concepts:
            if normalize(c) not in seen:
                seen.add(normalize(c))
                known.append(c)
    return "\n".join(lines), known
