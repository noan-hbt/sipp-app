import copy

import pytest

from app.pipeline.calc import FormulaError, close, evaluate
from app.pipeline.schemas import LessonDraft
from app.pipeline.solve import Solved, disagreements, drop_disputed, solve_input
from tests.fakes import DRAFT

SWIPE = {
    "type": "swipe",
    "cards": [
        {"statement": "Un taux s'exprime en %.", "is_true": True, "why": "Oui."},
        {"statement": "Un taux bas est toujours mieux.", "is_true": False, "why": "Non."},
        {"statement": "Le taux fixe ne bouge pas.", "is_true": True, "why": "Oui."},
        {"statement": "Le taux variable ne bouge jamais.", "is_true": False, "why": "Non."},
    ],
}
FILL = {
    "type": "fill_blanks",
    "text": "Le taux est le {1} de l'argent, payé à la {2}.",
    "blanks": [{"answer": "prix"}, {"answer": "banque"}],
    "distractors": ["poids", "mairie"],
    "explanation": "Le prix de l'argent.",
}


def _draft(*extra):
    data = copy.deepcopy(DRAFT)
    data["blocks"] = data["blocks"][:-1] + list(extra) + data["blocks"][-1:]
    return LessonDraft.model_validate(data)


def test_solver_never_sees_the_answers():
    text, key = solve_input(_draft(SWIPE, FILL), "seed")
    for leaked in ("correct_option_ids", "is_true", "C'est le coût de l'emprunt", "Ça dépend des frais", '"answer"'):
        assert leaked not in text
    assert set(key) == {"b3", "b4", "b5", "b7c0", "b7c1", "b7c2", "b7c3", "b8"}
    assert key["b4"]["expected"] == {"a"} and key["b5"]["expected"] is True


def test_only_sure_disagreements_count():
    _, key = solve_input(_draft(SWIPE, FILL), "seed")
    blanks = key["b8"]["expected"]
    solved = Solved.model_validate({"items": [
        {"item": "b4", "choice": ["b"], "sure": True, "note": "a tax is not a price"},
        {"item": "b5", "truth": False, "sure": False},
        {"item": "b3", "truth": False, "sure": True},
        {"item": "b7c1", "truth": True, "sure": True},
        {"item": "b8", "choice": blanks, "sure": True},
    ]})
    found = disagreements(solved, key)
    assert [(d["item"], d["block"], d["card"]) for d in found] == [("b4", 4, None), ("b7c1", 7, 1)]
    assert "a tax is not a price" in found[0]["detail"]


def test_disputed_items_are_dropped_only_if_the_lesson_stays_valid():
    draft = _draft(SWIPE)
    found = [{"item": "b4", "block": 4, "card": None, "detail": "x"}, {"item": "b7c1", "block": 7, "card": 1, "detail": "y"}]
    fixed, removed = drop_disputed(draft, found, ["taux d'intérêt"], [], 5)
    assert removed == found
    assert len(fixed.blocks) == len(draft.blocks) - 1
    swipe = next(b for b in fixed.blocks if b.type == "swipe")
    assert [c.statement for c in swipe.cards] == [SWIPE["cards"][i]["statement"] for i in (0, 2, 3)]

    # Removing every check would leave a lesson without one: keep it as it is.
    only = _draft()
    every = [{"item": f"b{i}", "block": i, "card": None, "detail": "z"} for i in (3, 4, 5)]
    kept, removed = drop_disputed(only, every, ["taux d'intérêt"], [], 5)
    assert kept is only and removed == []


def test_formulas_are_computed_safely():
    assert evaluate("10000 * (1 + 0.05) ** x", 2) == pytest.approx(11025)
    assert evaluate("sqrt(x) + pi - pi", 9) == 3
    assert evaluate("2^x", 3) == 8
    for bad in ("__import__('os')", "x.real", "open('f')", "y + 1", "10 ** 10000", "1 / (x - 2)"):
        with pytest.raises(FormulaError):
            evaluate(bad, 2)
    assert close(11000, 11025) and not close(10000, 11025)
    assert close(0.33, 1 / 3) and not close(0.4, 1 / 3)
