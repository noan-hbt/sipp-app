import pytest
from pydantic import ValidationError

from app.pipeline.blocks import HookBlock, PredictBlock, SimulateBlock, SwipeBlock
from app.progress import score_for

CARDS = [
    {"statement": "Rembourser plus tôt réduit les intérêts.", "is_true": True, "why": "Tu dois moins."},
    {"statement": "Le taux ne change rien.", "is_true": False, "why": "Il fixe le loyer de l'argent."},
    {"statement": "Les intérêts baissent avec le temps.", "is_true": True, "why": "Le capital dû baisse."},
]


def test_hook_needs_question_teaser_and_answer():
    HookBlock(type="hook", question="Combien tu rends ?", teaser="Tu sauras le calculer.", answer="Environ 91 000 €.")
    with pytest.raises(ValidationError):
        HookBlock(type="hook", question="Combien ?", teaser="", answer="x")


def test_predict_number_and_choice_shapes():
    PredictBlock(type="predict", kind="number", prompt="Combien ?", min=0, max=200000, step=1000, answer=91000, unit="€", reveal="Presque la moitié.")
    PredictBlock(
        type="predict", kind="choice", prompt="Lequel ?", options=[{"id": "a", "text": "A"}, {"id": "b", "text": "B"}], answer_id="b", reveal="B."
    )
    with pytest.raises(ValidationError):
        PredictBlock(type="predict", kind="number", prompt="?", min=0, max=10, step=1, answer=11, reveal="x")
    with pytest.raises(ValidationError):
        PredictBlock(type="predict", kind="choice", prompt="?", options=[{"id": "a", "text": "A"}, {"id": "b", "text": "B"}], answer_id="c", reveal="x")


def test_swipe_must_mix_true_and_false():
    SwipeBlock(type="swipe", cards=CARDS)
    with pytest.raises(ValidationError):
        SwipeBlock(type="swipe", cards=[{**c, "is_true": True} for c in CARDS])


def test_simulate_points_increase_and_start_exists():
    pts = [{"x": 10, "y": 42988}, {"x": 15, "y": 66288}, {"x": 20, "y": 90871}]
    SimulateBlock(type="simulate", prompt="Et si ?", parameter="Durée", parameter_unit="ans", output="Intérêts", output_unit="€", points=pts, start=2, takeaway="Plus long = plus cher.")
    with pytest.raises(ValidationError):
        SimulateBlock(type="simulate", prompt="?", parameter="p", output="o", points=pts[::-1], takeaway="t")
    with pytest.raises(ValidationError):
        SimulateBlock(type="simulate", prompt="?", parameter="p", output="o", points=pts, start=3, takeaway="t")


def test_swipe_cards_are_scored_one_by_one_and_predict_is_not_graded():
    blocks = [
        {"type": "predict", "kind": "number", "answer": 5},
        {"type": "swipe", "cards": CARDS},
    ]
    answers = [{"block": 0, "value": 3}, {"block": 1, "value": [True, True, True]}]
    score = score_for(blocks, answers, None)
    assert (score.correct, score.total) == (2, 3)
