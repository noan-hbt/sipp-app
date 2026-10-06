"""Sipp pedagogical blocks (V1 primitives).

A block is a pedagogical unit, not a screen: the iOS renderer decides how to
display it. The Writer only produces these structures.

Inline math: any learner-facing text field may contain inline LaTeX between single
dollars, e.g. "la clé $k_i$". Display formulas go in a `math` block.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Str = Annotated[str, Field(min_length=1)]


class _Block(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Content -----------------------------------------------------------------


class TextBlock(_Block):
    type: Literal["text"]
    content: Str


class ConceptBlock(_Block):
    type: Literal["concept"]
    name: Str
    definition: Str = Field(description="One-sentence definition.")
    explanation: Str = Field(description="Short elaboration building intuition.")


class ExampleBlock(_Block):
    type: Literal["example"]
    title: Str
    content: Str


class ScenarioBlock(_Block):
    type: Literal["scenario"]
    setting: Str = Field(description="Who/where, one or two sentences.")
    narrative: Str
    prompt: str | None = Field(default=None, description="Optional reflective prompt.")


class AnalogyPair(_Block):
    source: Str
    target: Str


class AnalogyBlock(_Block):
    type: Literal["analogy"]
    source: Str = Field(description="The familiar thing.")
    target: Str = Field(description="The concept being explained.")
    explanation: Str
    mappings: list[AnalogyPair] = Field(min_length=1, max_length=6)
    limits: str | None = Field(default=None, description="Where the analogy breaks down.")


class ComparisonItem(_Block):
    name: Str
    values: list[Str] = Field(description="One value per dimension, same order.")


class ComparisonBlock(_Block):
    type: Literal["comparison"]
    title: Str
    dimensions: list[Str] = Field(min_length=1, max_length=6)
    items: list[ComparisonItem] = Field(min_length=2, max_length=5)
    takeaway: str | None = None

    @model_validator(mode="after")
    def _shape(self) -> "ComparisonBlock":
        n = len(self.dimensions)
        for item in self.items:
            if len(item.values) != n:
                raise ValueError(
                    f"comparison item '{item.name}' has {len(item.values)} values, "
                    f"expected {n} (one per dimension)"
                )
        return self


class SequenceStep(_Block):
    title: Str
    description: Str


class SequenceBlock(_Block):
    type: Literal["sequence"]
    title: Str
    steps: list[SequenceStep] = Field(min_length=2, max_length=10)


class CauseEffectLink(_Block):
    label: Str
    explanation: str | None = None


class CauseEffectBlock(_Block):
    type: Literal["cause_effect"]
    title: Str
    chain: list[CauseEffectLink] = Field(min_length=2, max_length=8)


class CodeBlock(_Block):
    type: Literal["code"]
    language: Str = Field(description="e.g. 'python', 'sql', 'bash'.")
    code: Str = Field(description="Short, runnable when possible, max ~20 lines.")
    explanation: Str = Field(description="What to notice in this code.")
    caption: str | None = None


class MathVariable(_Block):
    symbol: Str = Field(description="LaTeX, e.g. 'd_k'.")
    meaning: Str


class MathBlock(_Block):
    type: Literal["math"]
    latex: Str = Field(description="Display formula in LaTeX, without $ delimiters.")
    explanation: Str = Field(description="What the formula says, in words.")
    variables: list[MathVariable] = Field(default_factory=list, max_length=8)


# --- Interactions ------------------------------------------------------------


class MisconceptionBlock(_Block):
    type: Literal["misconception"]
    statement: Str = Field(description="The belief, phrased as a claim to judge.")
    is_true: bool = Field(description="Usually false.")
    correction: Str


class QuestionOption(_Block):
    id: Str
    text: Str


class QuestionBlock(_Block):
    type: Literal["question"]
    kind: Literal["single_choice", "multiple_choice", "true_false", "open"]
    prompt: Str
    options: list[QuestionOption] = Field(default_factory=list)
    correct_option_ids: list[str] = Field(default_factory=list)
    answer: bool | None = Field(default=None, description="true_false only.")
    expected_answer: str | None = Field(
        default=None, description="open only: model answer / key points."
    )
    explanation: Str = Field(description="Shown after answering, whatever the result.")

    @model_validator(mode="after")
    def _consistency(self) -> "QuestionBlock":
        ids = [o.id for o in self.options]
        if len(set(ids)) != len(ids):
            raise ValueError("question option ids must be unique")
        if self.kind in ("single_choice", "multiple_choice"):
            if not 2 <= len(self.options) <= 6:
                raise ValueError(f"{self.kind} needs 2-6 options")
            if not self.correct_option_ids:
                raise ValueError(f"{self.kind} needs correct_option_ids")
            unknown = set(self.correct_option_ids) - set(ids)
            if unknown:
                raise ValueError(f"correct_option_ids reference unknown ids {sorted(unknown)}")
            if self.kind == "single_choice" and len(self.correct_option_ids) != 1:
                raise ValueError("single_choice needs exactly one correct option")
        elif self.kind == "true_false":
            if self.answer is None:
                raise ValueError("true_false needs 'answer'")
            if self.options or self.correct_option_ids:
                raise ValueError("true_false must not have options")
        elif self.kind == "open":
            if self.options or self.correct_option_ids:
                raise ValueError("open question must not have options")
            if not self.expected_answer:
                raise ValueError("open question needs 'expected_answer'")
        return self


class ApplicationBlock(_Block):
    type: Literal["application"]
    prompt: Str
    guidance: str | None = None
    optional: bool = True


# --- Conclusion --------------------------------------------------------------


class RecapBlock(_Block):
    type: Literal["recap"]
    points: list[Str] = Field(min_length=1, max_length=6)
    concepts: list[Str] = Field(default_factory=list)


Block = Annotated[
    TextBlock
    | ConceptBlock
    | ExampleBlock
    | ScenarioBlock
    | AnalogyBlock
    | ComparisonBlock
    | SequenceBlock
    | CauseEffectBlock
    | CodeBlock
    | MathBlock
    | MisconceptionBlock
    | QuestionBlock
    | ApplicationBlock
    | RecapBlock,
    Field(discriminator="type"),
]

BLOCK_TYPES = [
    "text",
    "concept",
    "example",
    "scenario",
    "analogy",
    "comparison",
    "sequence",
    "cause_effect",
    "code",
    "math",
    "misconception",
    "question",
    "application",
    "recap",
]
