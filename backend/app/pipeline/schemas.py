"""Structured outputs of each pipeline stage."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.pipeline.blocks import Block


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


# 1. Interpretation -----------------------------------------------------------


class SkillLevel(_Out):
    area: str
    level: Literal["none", "beginner", "intermediate", "advanced", "expert"]


class LearningProfile(_Out):
    topic: str
    title: str = Field(description="Short, catchy title for this Sip, in the learner's language.")
    language: str = Field(description="ISO 639-1 code of the language to teach in, e.g. 'fr'.")
    current_level: Literal["none", "beginner", "intermediate", "advanced", "expert"]
    level_details: list[SkillLevel] = Field(
        default_factory=list, description="Per-area levels when they differ."
    )
    target_level: Literal["beginner", "intermediate", "advanced", "expert"]
    goals: list[str] = Field(min_length=1)
    prior_knowledge: list[str] = Field(default_factory=list)
    depth: Literal["overview", "working", "deep", "expert"]
    scope: Literal["focused", "standard", "comprehensive"] = Field(
        description="Breadth of the path: focused = one narrow question or skill, "
        "standard = understand a topic well, comprehensive = master a whole field."
    )
    breadth: Literal["single", "program"] = Field(
        default="single",
        description="single = fits in one path of at most ~25 five-minute lessons; "
        "program = a big goal that needs several such paths (chapters).",
    )
    context: str | None = Field(default=None, description="Why they learn it, use case.")
    assumptions: list[str] = Field(
        default_factory=list, description="Assumptions made where the input was silent."
    )


# 1b. Roadmap (big goals only) -------------------------------------------------


class RoadmapChapter(_Out):
    title: str = Field(description="Short chapter title (max ~6 words).")
    outcome: str = Field(description="What the learner can do after it, one sentence.")
    level: Literal["core", "advanced"] = Field(
        description="core = needed to reach the goal, advanced = going further."
    )
    estimated_lessons: int = Field(ge=4, le=25, description="Number of ~5-minute lessons.")


class Roadmap(_Out):
    title: str = Field(description="Short title of the whole program, in the learner's language.")
    summary: str = Field(description="2-3 sentences: where the program leads.")
    chapters: list[RoadmapChapter] = Field(min_length=2, max_length=15)


class RoadmapExtension(_Out):
    title: str = Field(description="Short title of the whole journey, in the learner's language.")
    summary: str = Field(description="2-3 sentences: where the program leads.")
    chapters: list[RoadmapChapter] = Field(
        min_length=2, max_length=6, description="Follow-up chapters only, not the finished one."
    )


class RoadmapAdjustment(_Out):
    changed: bool = Field(description="False when the remaining chapters still fit as they are.")
    note: str | None = Field(
        default=None,
        description="When changed: one warm sentence to the learner (tutoiement in French) "
        "saying what changed and why.",
    )
    chapters: list[RoadmapChapter] = Field(
        default_factory=list, max_length=12, description="The full list of REMAINING chapters, in order."
    )


# 2. Curriculum ---------------------------------------------------------------


class CurriculumModule(_Out):
    title: str
    role: str = Field(description="Why this module exists in the path.")
    objectives: list[str] = Field(min_length=1, max_length=6)
    estimated_lessons: int = Field(ge=1, description="Number of ~5-minute lessons needed.")


class Curriculum(_Out):
    summary: str = Field(description="2-3 sentence description of the whole path.")
    modules: list[CurriculumModule] = Field(min_length=1)


# 3. Mapping ------------------------------------------------------------------


class MappedLesson(_Out):
    title: str
    objective: str
    prerequisites: list[str] = Field(
        default_factory=list, description="Keys of earlier lessons, e.g. 'M1L2'."
    )
    concepts: list[str] = Field(min_length=1, max_length=4)


class ModuleMapping(_Out):
    lessons: list[MappedLesson] = Field(min_length=1)


# 4. Planning -----------------------------------------------------------------


class PlannedCheck(_Out):
    kind: Literal["single_choice", "multiple_choice", "true_false", "open"]
    targets: str = Field(description="What understanding it verifies.")


class LessonPlan(_Out):
    objective: str = Field(description="Precise, observable learning objective.")
    concepts: list[str] = Field(min_length=1)
    hook: str = Field(description="How the lesson opens (scenario, question, surprise).")
    sequence: list[str] = Field(
        min_length=3, description="Ordered teaching steps, each mapped to a block type."
    )
    intuition: str
    examples: list[str] = Field(default_factory=list)
    misconceptions: list[str] = Field(default_factory=list)
    checks: list[PlannedCheck] = Field(min_length=1)
    application: str | None = None
    reuses: list[str] = Field(
        default_factory=list, description="Previously taught concepts to build upon."
    )


# 5. Writing ------------------------------------------------------------------


class LessonDraft(_Out):
    blocks: list[Block] = Field(min_length=3)
    summary: str = Field(description="2-3 sentences of what was taught, for future lessons.")
    concepts_taught: list[str] = Field(min_length=1)


# 6. Review -------------------------------------------------------------------


class ReviewIssue(_Out):
    severity: Literal["minor", "major", "critical"]
    category: Literal[
        "factual",
        "missing_concept",
        "contradiction",
        "repetition",
        "concept_before_intro",
        "difficulty",
        "misleading_example",
        "objective_missed",
        "density",
        "off_topic",
        "other",
    ]
    block_index: int | None = None
    description: str
    fix: str


class Review(_Out):
    verdict: Literal["pass", "revise"]
    issues: list[ReviewIssue] = Field(default_factory=list)
