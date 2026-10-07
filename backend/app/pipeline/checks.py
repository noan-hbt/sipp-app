"""Deterministic structural checks (cheaper and more reliable than an LLM)."""

import re
from dataclasses import dataclass, field

from app.pipeline.blocks import (
    CodeBlock,
    ConceptBlock,
    MathBlock,
    QuestionBlock,
    FillBlanksBlock,
    MatchBlock,
    EstimateBlock,
    RecapBlock,
)
from app.pipeline.schemas import LessonDraft, ModuleMapping

WORDS_PER_MINUTE = 200
SECONDS_PER_INTERACTION = 20


@dataclass
class CheckResult:
    errors: list[str] = field(default_factory=list)  # must be fixed
    warnings: list[str] = field(default_factory=list)  # informative

    @property
    def ok(self) -> bool:
        return not self.errors


def normalize(concept: str) -> str:
    return re.sub(r"\s+", " ", concept.strip().lower())


# --- Mapping -----------------------------------------------------------------


def clean_mapping(
    mapping: ModuleMapping,
    module_index: int,
    known_keys: list[str],
    max_lessons: int,
) -> tuple[ModuleMapping, CheckResult]:
    """Validate one module mapping. Fixes what can be fixed deterministically.

    - prerequisites must reference EARLIER lessons (guarantees an acyclic graph)
    - duplicate prerequisites removed
    - lesson count limit
    """
    res = CheckResult()
    if len(mapping.lessons) > max_lessons:
        res.errors.append(
            f"module has {len(mapping.lessons)} lessons, limit is {max_lessons}"
        )
    available = list(known_keys)
    for i, lesson in enumerate(mapping.lessons, start=1):
        key = f"M{module_index}L{i}"
        kept: list[str] = []
        for p in lesson.prerequisites:
            p = p.strip().upper()
            if p in available and p not in kept:
                kept.append(p)
            elif p not in available:
                res.warnings.append(f"{key}: dropped invalid prerequisite '{p}'")
        lesson.prerequisites = kept
        available.append(key)
    return mapping, res


# --- Lesson ------------------------------------------------------------------


def _words(*texts: str | None) -> int:
    return sum(len(t.split()) for t in texts if t)


def block_words(block) -> int:
    data = block.model_dump(exclude={"type"})
    total = 0

    def walk(v):
        nonlocal total
        if isinstance(v, str):
            total += len(v.split())
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(data)
    return total


def latex_balanced(latex: str) -> bool:
    depth = 0
    escaped = False
    for ch in latex:
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def inline_math_unbalanced(block) -> bool:
    """Odd count of unescaped '$' in any text field (code and math blocks excluded)."""
    if isinstance(block, (CodeBlock, MathBlock)):
        return False
    found = False

    def walk(v):
        nonlocal found
        if isinstance(v, str):
            if (v.count("$") - v.count("\\$")) % 2:
                found = True
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(block.model_dump(exclude={"type"}))
    return found


CHECK_BLOCKS = (QuestionBlock, FillBlanksBlock, MatchBlock, EstimateBlock)


def estimate_minutes(draft: LessonDraft) -> float:
    words = sum(block_words(b) for b in draft.blocks)
    interactions = sum(1 for b in draft.blocks if b.type in ("question", "misconception", "application", "fill_blanks", "match", "estimate"))
    return words / WORDS_PER_MINUTE + interactions * SECONDS_PER_INTERACTION / 60


def check_lesson(
    draft: LessonDraft,
    planned_concepts: list[str],
    known_concepts: list[str],
    lesson_minutes: int,
) -> CheckResult:
    res = CheckResult()
    blocks = draft.blocks

    recaps = [i for i, b in enumerate(blocks) if isinstance(b, RecapBlock)]
    if not recaps:
        res.errors.append("lesson must end with a 'recap' block")
    elif recaps != [len(blocks) - 1]:
        res.errors.append("exactly one 'recap' block is allowed and it must be the last block")

    if not any(isinstance(b, CHECK_BLOCKS) for b in blocks):
        res.errors.append("lesson needs at least one comprehension check (question, fill_blanks, match or estimate)")

    if isinstance(blocks[0], (*CHECK_BLOCKS, RecapBlock)):
        res.errors.append("lesson must not open with a question or recap")

    # duplicated content
    seen: dict[str, int] = {}
    for i, b in enumerate(blocks):
        sig = normalize(b.model_dump_json())
        if sig in seen:
            res.errors.append(f"block {i} duplicates block {seen[sig]}")
        seen[sig] = i

    # concept introduced twice
    concept_names = [normalize(b.name) for b in blocks if isinstance(b, ConceptBlock)]
    dupes = {c for c in concept_names if concept_names.count(c) > 1}
    if dupes:
        res.errors.append(f"concept introduced more than once: {sorted(dupes)}")
    known = {normalize(c) for c in known_concepts}
    reintroduced = sorted({c for c in concept_names if c in known})
    if reintroduced:
        res.warnings.append(f"re-introduces already taught concepts: {reintroduced}")

    # text block length (mobile)
    for i, b in enumerate(blocks):
        if b.type == "text" and _words(b.content) > 120:
            res.errors.append(f"block {i} (text) is too long for mobile ({_words(b.content)} words, max ~80)")

    for i, b in enumerate(blocks):
        if isinstance(b, CodeBlock):
            lines = len(b.code.strip("\n").splitlines())
            if lines > 25:
                res.errors.append(f"block {i} (code) has {lines} lines, max ~20 for mobile")
        elif isinstance(b, MathBlock):
            if not latex_balanced(b.latex):
                res.errors.append(f"block {i} (math) has unbalanced braces in latex")
            if b.latex.strip().startswith("$"):
                res.errors.append(f"block {i} (math) latex must not include $ delimiters")
    for i, b in enumerate(blocks):
        if inline_math_unbalanced(b):
            res.errors.append(f"block {i} has an odd number of '$' (unclosed inline math)")

    # coverage of planned concepts (soft: wording can differ)
    taught = {normalize(c) for c in draft.concepts_taught}
    missing = [c for c in planned_concepts if normalize(c) not in taught]
    if missing and len(missing) == len(planned_concepts):
        res.warnings.append(f"none of the planned concepts appear in concepts_taught: {missing}")
    elif missing:
        res.warnings.append(f"planned concepts not listed in concepts_taught: {missing}")

    # duration
    minutes = estimate_minutes(draft)
    if minutes > lesson_minutes * 2:
        res.errors.append(f"lesson too long (~{minutes:.1f} min for a {lesson_minutes} min target)")
    elif minutes > lesson_minutes * 1.5:
        res.warnings.append(f"lesson is long (~{minutes:.1f} min)")
    elif minutes < lesson_minutes * 0.4:
        res.warnings.append(f"lesson is short (~{minutes:.1f} min)")

    return res
