from app.pipeline.schemas import LearningProfile
from app.themes import theme_of

BASE = dict(
    topic="Crédit immobilier",
    title="Comprendre le crédit immobilier",
    language="fr",
    current_level="none",
    target_level="beginner",
    goals=["Lire une offre de prêt"],
    depth="working",
    scope="focused",
)


def test_profile_keeps_a_known_theme():
    assert LearningProfile.model_validate({**BASE, "theme": "finance"}).theme == "finance"


def test_unknown_or_missing_theme_falls_back_to_general():
    assert LearningProfile.model_validate({**BASE, "theme": "mortgages"}).theme == "general"
    assert LearningProfile.model_validate(BASE).theme == "general"


def test_theme_of_ignores_old_or_bad_profiles():
    assert theme_of({"theme": "history"}) == "history"
    assert theme_of({"theme": "nope"}) is None
    assert theme_of(None) is None
