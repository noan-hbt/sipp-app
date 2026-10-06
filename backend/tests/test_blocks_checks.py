import copy

import pytest
from pydantic import ValidationError

from app.pipeline.checks import check_lesson, clean_mapping
from app.pipeline.schemas import LessonDraft, ModuleMapping
from tests.fakes import DRAFT, MAPPING


def draft(**changes):
    d = copy.deepcopy(DRAFT)
    d.update(changes)
    return LessonDraft.model_validate(d)


def test_valid_draft_passes_checks():
    res = check_lesson(draft(), ["taux d'intérêt"], [], 5)
    assert res.ok, res.errors


OPTS = [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}]


@pytest.mark.parametrize(
    "block",
    [
        {"type": "question", "kind": "single_choice", "prompt": "?", "options": OPTS, "correct_option_ids": ["a", "b"], "explanation": "e"},
        {"type": "question", "kind": "single_choice", "prompt": "?", "options": OPTS, "correct_option_ids": ["z"], "explanation": "e"},
        {"type": "question", "kind": "true_false", "prompt": "?", "explanation": "e"},
        {"type": "question", "kind": "open", "prompt": "?", "explanation": "e"},
        {"type": "comparison", "title": "t", "dimensions": ["a", "b"], "items": [{"name": "x", "values": ["1"]}, {"name": "y", "values": ["1", "2"]}]},
        {"type": "unknown", "content": "x"},
        {"type": "text", "content": "x", "extra": 1},
    ],
)
def test_invalid_blocks_rejected(block):
    d = copy.deepcopy(DRAFT)
    d["blocks"].insert(1, block)
    with pytest.raises(ValidationError):
        LessonDraft.model_validate(d)


def test_structural_errors():
    blocks = copy.deepcopy(DRAFT)["blocks"]
    no_recap = draft(blocks=blocks[:-1])
    assert any("recap" in e for e in check_lesson(no_recap, [], [], 5).errors)

    no_question = draft(blocks=[b for b in blocks if b["type"] != "question"])
    assert any("question" in e for e in check_lesson(no_question, [], [], 5).errors)

    dup = draft(blocks=[blocks[0], blocks[0]] + blocks[1:])
    assert any("duplicates" in e for e in check_lesson(dup, [], [], 5).errors)

    long_text = draft(blocks=[{"type": "text", "content": "mot " * 200}] + blocks)
    assert any("too long" in e for e in check_lesson(long_text, [], [], 5).errors)

    res = check_lesson(draft(), ["taux d'intérêt"], ["Taux d'intérêt"], 5)
    assert any("re-introduces" in w for w in res.warnings)


def test_mapping_prerequisites_must_be_earlier():
    m = ModuleMapping.model_validate(
        {
            "lessons": [
                {"title": "a", "objective": "o", "prerequisites": ["M1L2"], "concepts": ["x"]},  # forward ref
                {"title": "b", "objective": "o", "prerequisites": ["m1l1", "M1L1", "M0L1"], "concepts": ["y"]},
            ]
        }
    )
    m, res = clean_mapping(m, 1, [], 15)
    assert m.lessons[0].prerequisites == []
    assert m.lessons[1].prerequisites == ["M1L1"]
    assert res.ok and len(res.warnings) == 2
    _, res = clean_mapping(ModuleMapping.model_validate(MAPPING), 1, [], 1)
    assert not res.ok
