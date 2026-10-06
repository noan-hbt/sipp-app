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


def test_curriculum_budget_enforced():
    from app.pipeline.engine import _bounded_curriculum
    from tests.fakes import CURRICULUM

    C = _bounded_curriculum(max_modules=12, max_per_module=15, max_total=3)
    with pytest.raises(ValidationError, match="budget"):
        C.model_validate(CURRICULUM)  # 2 + 2 > 3
    assert _bounded_curriculum(12, 15, 4).model_validate(CURRICULUM)
    assert C.model_json_schema()["title"] == "Curriculum"


def test_code_and_math_blocks():
    code = {"type": "code", "language": "python", "code": "import numpy as np\nx = np.ones(3)", "explanation": "x est un vecteur."}
    math = {"type": "math", "latex": r"\mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V", "explanation": "e", "variables": [{"symbol": "d_k", "meaning": "dimension des clés"}]}
    inline = {"type": "text", "content": "La clé $k_i$ et le coût \$5."}
    d = copy.deepcopy(DRAFT)
    d["blocks"][1:1] = [code, math, inline]
    assert check_lesson(LessonDraft.model_validate(d), [], [], 5).ok

    bad = copy.deepcopy(DRAFT)
    bad["blocks"][1:1] = [
        {**code, "code": "\n".join(["x = 1"] * 30)},
        {**math, "latex": r"\frac{a}{b"},
        {**math, "latex": "$x$", "explanation": "f"},
        {"type": "text", "content": "la clé $k_i sans fermeture"},
    ]
    errors = check_lesson(LessonDraft.model_validate(bad), [], [], 5).errors
    assert any("(code)" in e for e in errors)
    assert any("unbalanced braces" in e for e in errors)
    assert any("$ delimiters" in e for e in errors)
    assert any("inline math" in e for e in errors)
