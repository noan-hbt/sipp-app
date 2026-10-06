import json

from app.llm.client import Completion, LLMError

PROFILE = {
    "topic": "taux d'intérêt",
    "title": "Comprendre les taux",
    "language": "fr",
    "current_level": "beginner",
    "target_level": "intermediate",
    "goals": ["comprendre l'effet des taux sur l'économie"],
    "depth": "working",
    "scope": "standard",
}
CURRICULUM = {
    "summary": "Un parcours court sur les taux.",
    "modules": [
        {"title": "Bases", "role": "poser les fondations", "objectives": ["définir un taux"], "estimated_lessons": 2},
        {"title": "Effets", "role": "comprendre les effets", "objectives": ["relier taux et inflation"], "estimated_lessons": 2},
    ],
}
MAPPING = {
    "lessons": [
        {"title": "Qu'est-ce qu'un taux", "objective": "définir", "prerequisites": [], "concepts": ["taux d'intérêt"]},
        {"title": "Taux directeur", "objective": "expliquer", "prerequisites": ["M1L1", "M9L9"], "concepts": ["taux directeur"]},
    ]
}
PLAN = {
    "objective": "définir un taux",
    "concepts": ["taux d'intérêt"],
    "hook": "scenario",
    "sequence": ["scenario: ...", "concept: ...", "question(single_choice): ...", "recap"],
    "intuition": "le prix de l'argent",
    "checks": [{"kind": "single_choice", "targets": "définition"}],
}
DRAFT = {
    "blocks": [
        {"type": "scenario", "setting": "Léa à la banque", "narrative": "Léa veut emprunter 10 000 euros pour une voiture."},
        {"type": "concept", "name": "taux d'intérêt", "definition": "Le prix de l'argent emprunté.", "explanation": "Exprimé en pourcentage par an."},
        {"type": "comparison", "title": "Fixe vs variable", "dimensions": ["évolution"], "items": [{"name": "fixe", "values": ["stable"]}, {"name": "variable", "values": ["suit le marché"]}]},
        {"type": "misconception", "statement": "Un taux bas est toujours une bonne affaire.", "is_true": False, "correction": "Ça dépend des frais et de la durée."},
        {"type": "question", "kind": "single_choice", "prompt": "Un taux d'intérêt est...", "options": [{"id": "a", "text": "le prix de l'argent"}, {"id": "b", "text": "une taxe"}], "correct_option_ids": ["a"], "explanation": "C'est le coût de l'emprunt."},
        {"type": "question", "kind": "true_false", "prompt": "Le taux s'exprime en %.", "answer": True, "explanation": "Oui, par an en général."},
        {"type": "application", "prompt": "Quel est le taux de ton dernier crédit ?"},
        {"type": "recap", "points": ["Un taux = prix de l'argent"], "concepts": ["taux d'intérêt"]},
    ],
    "summary": "Définition du taux d'intérêt.",
    "concepts_taught": ["taux d'intérêt"],
}
REVIEW_PASS = {"verdict": "pass", "issues": []}
REVIEW_REVISE = {
    "verdict": "revise",
    "issues": [{"severity": "major", "category": "factual", "block_index": 1, "description": "x", "fix": "y"}],
}

DEFAULTS = {
    "LearningProfile": PROFILE,
    "Curriculum": CURRICULUM,
    "ModuleMapping": MAPPING,
    "LessonPlan": PLAN,
    "LessonDraft": DRAFT,
    "Review": REVIEW_PASS,
}


class FakeClient:
    """Returns canned outputs per schema. `queue[name]` overrides the next responses."""

    def __init__(self, queue: dict[str, list] | None = None):
        self.queue = {k: list(v) for k, v in (queue or {}).items()}
        self.calls: list[tuple[str, str]] = []

    async def complete(self, model, messages, schema_name, schema):
        self.calls.append((schema_name, model))
        q = self.queue.get(schema_name)
        value = q.pop(0) if q else DEFAULTS[schema_name]
        if isinstance(value, Exception):
            raise value
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        return Completion(text=text, model=model, prompt_tokens=10, completion_tokens=20)


__all__ = ["FakeClient", "LLMError"]
