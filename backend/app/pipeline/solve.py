"""Blind answer-key check: a second call takes the lesson's graded items without their answers.

The writer and the reviewer both see the answer key, so they tend to agree with it. Here a
model answers each item cold; where it is sure and disagrees with the key, the item is sent
back for revision, and dropped if the revision still disagrees. Comparing answers is code.
"""

import random
from typing import Any, Literal

from pydantic import Field

from app.pipeline.blocks import (
    EstimateBlock,
    FillBlanksBlock,
    MatchBlock,
    MisconceptionBlock,
    PredictBlock,
    QuestionBlock,
    SwipeBlock,
)
from app.pipeline.checks import check_lesson
from app.pipeline.schemas import LessonDraft, _Out

# Fields that give an answer away: never shown to the solver.
HIDDEN = {
    "correct_option_ids", "answer", "answer_id", "is_true", "explanation", "correction", "why",
    "reveal", "expected_answer", "tolerance", "blanks", "distractors", "pairs", "cards", "options",
}


class SolvedItem(_Out):
    item: str = Field(description="The item id, as given.")
    choice: list[str] = Field(
        default_factory=list,
        description="Ids you pick: options for a choice item, one word id per blank for fill_blanks, "
        "one right-side id per left item (in order) for match.",
    )
    truth: bool | None = Field(default=None, description="true/false items: is the statement true?")
    number: float | None = Field(default=None, description="number items: your best value.")
    sure: bool = Field(description="True only if you are confident a well-informed person would answer the same.")
    note: str | None = Field(default=None, description="If the item is ambiguous or the lesson states something false, say why.")


class Solved(_Out):
    items: list[SolvedItem]


Kind = Literal["choice", "multi", "truth", "number", "blanks", "match"]


def _items(draft: LessonDraft, seed: str) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Items shown to the solver (no answers), and the key kept here, both by item id."""
    rng = random.Random(seed)
    shown: list[dict[str, Any]] = []
    key: dict[str, dict[str, Any]] = {}

    def add(item_id: str, block: int, kind: Kind, show: dict[str, Any], expected: Any, **extra: Any) -> None:
        shown.append({"item": item_id, "answer_as": kind, **show})
        key[item_id] = {"block": block, "kind": kind, "expected": expected, **extra}

    for i, b in enumerate(draft.blocks):
        if isinstance(b, QuestionBlock):
            opts = [{"id": o.id, "text": o.text} for o in b.options]
            if b.kind == "single_choice":
                add(f"b{i}", i, "choice", {"prompt": b.prompt, "options": opts}, set(b.correct_option_ids))
            elif b.kind == "multiple_choice":
                add(f"b{i}", i, "multi", {"prompt": b.prompt, "options": opts, "pick": "all correct options"}, set(b.correct_option_ids))
            elif b.kind == "true_false":
                add(f"b{i}", i, "truth", {"statement": b.prompt}, b.answer)
        elif isinstance(b, MisconceptionBlock):
            add(f"b{i}", i, "truth", {"statement": b.statement}, b.is_true)
        elif isinstance(b, SwipeBlock):
            for c, card in enumerate(b.cards):
                add(f"b{i}c{c}", i, "truth", {"statement": card.statement}, card.is_true, card=c)
        elif isinstance(b, PredictBlock):
            if b.kind == "choice":
                opts = [{"id": o.id, "text": o.text} for o in b.options]
                add(f"b{i}", i, "choice", {"prompt": b.prompt, "options": opts}, {b.answer_id})
            else:
                add(f"b{i}", i, "number", {"prompt": b.prompt, "unit": b.unit, "range": [b.min, b.max]}, b.answer,
                    tolerance=(b.max - b.min) * 0.1)
        elif isinstance(b, EstimateBlock):
            add(f"b{i}", i, "number", {"prompt": b.prompt, "unit": b.unit, "range": [b.min, b.max]}, b.answer,
                tolerance=b.tolerance)
        elif isinstance(b, FillBlanksBlock):
            words = [x.answer for x in b.blanks] + list(b.distractors)
            ids = [f"w{n}" for n in range(1, len(words) + 1)]
            order = list(range(len(words)))
            rng.shuffle(order)
            bank = [{"id": ids[k], "text": words[j]} for k, j in enumerate(order)]
            by_word = {words[j]: ids[k] for k, j in enumerate(order)}
            add(f"b{i}", i, "blanks", {"text": b.text, "words": bank}, [by_word[x.answer] for x in b.blanks])
        elif isinstance(b, MatchBlock):
            rights = list(range(len(b.pairs)))
            rng.shuffle(rights)
            right_ids = {j: f"r{k + 1}" for k, j in enumerate(rights)}
            add(
                f"b{i}", i, "match",
                {"prompt": b.prompt, "left": [p.left for p in b.pairs], "right": [{"id": right_ids[j], "text": b.pairs[j].right} for j in rights]},
                [right_ids[j] for j in range(len(b.pairs))],
            )
    return shown, key


def lesson_text(draft: LessonDraft) -> list[dict[str, Any]]:
    """The lesson as the learner reads it, minus anything that reveals an answer."""
    out = []
    for i, b in enumerate(draft.blocks):
        data = b.model_dump(exclude_none=True)
        out.append({"block": i, **{k: v for k, v in data.items() if k not in HIDDEN}})
    return out


def solve_input(draft: LessonDraft, seed: str) -> tuple[str | None, dict[str, dict[str, Any]]]:
    import json

    shown, key = _items(draft, seed)
    if not shown:
        return None, key
    text = (
        "LESSON (answers removed):\n" + json.dumps(lesson_text(draft), ensure_ascii=False, indent=1)
        + "\n\nITEMS TO ANSWER:\n" + json.dumps(shown, ensure_ascii=False, indent=1)
    )
    return text, key


def disagreements(solved: Solved, key: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Items where the solver is sure and its answer differs from the key."""
    out = []
    for s in solved.items:
        k = key.get(s.item)
        if k is None or not s.sure:
            continue
        kind, expected = k["kind"], k["expected"]
        if kind in ("choice", "multi"):
            got: Any = set(s.choice)
            wrong = got != expected
        elif kind == "truth":
            got = s.truth
            wrong = got is not None and got != expected
        elif kind == "number":
            got = s.number
            wrong = got is not None and abs(got - expected) > k["tolerance"]
        else:
            got = list(s.choice)
            wrong = got != expected
        if wrong:
            exp = sorted(expected) if isinstance(expected, set) else expected
            gv = sorted(got) if isinstance(got, set) else got
            detail = f"an independent solver answered {gv}, the key says {exp}"
            if s.note:
                detail += f" ({s.note})"
            out.append({"item": s.item, "block": k["block"], "card": k.get("card"), "detail": detail})
    return out


def drop_disputed(
    draft: LessonDraft, found: list[dict[str, Any]], planned: list[str], known: list[str], minutes: int
) -> tuple[LessonDraft, list[dict[str, Any]]]:
    """Remove still-disputed items when the lesson stays valid without them; returns what was removed."""
    blocks = list(draft.blocks)
    cards: dict[int, set[int]] = {}
    whole: set[int] = set()
    for d in found:
        if d["card"] is None:
            whole.add(d["block"])
        else:
            cards.setdefault(d["block"], set()).add(d["card"])
    for i, dropped in cards.items():
        if i in whole:
            continue
        b = blocks[i]
        kept = [c for n, c in enumerate(b.cards) if n not in dropped]
        if len(kept) >= 3 and len({c.is_true for c in kept}) == 2:
            blocks[i] = b.model_copy(update={"cards": kept})
        else:
            whole.add(i)
    candidate = draft.model_copy(update={"blocks": [b for n, b in enumerate(blocks) if n not in whole]})
    if check_lesson(candidate, planned, known, minutes).errors:
        return draft, []
    return candidate, found
