from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class RefreshIn(BaseModel):
    refresh_token: str


class DeleteAccountIn(BaseModel):
    password: str


class UsageOut(BaseModel):
    sips_last_24h: int
    max_sips_per_day: int
    cost_last_24h_usd: float
    max_cost_per_day_usd: float


class PlanOut(BaseModel):
    plan: str
    on_trial: bool
    plan_expires_at: datetime | None
    trial_available: bool
    trial_days: int
    slots: int
    slots_used: int
    sips_per_month: int
    sips_this_month: int
    lite: bool


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    created_at: datetime


class SipCreate(BaseModel):
    input: str = Field(min_length=3, max_length=4000, description="What the user wants to learn.")


class Progress(BaseModel):
    completed: int
    total: int


class SipSummary(BaseModel):
    id: str
    title: str | None
    input_text: str
    status: str
    stage: str | None
    error: str | None
    progress: Progress
    next_lesson_id: str | None
    next_lesson_title: str | None = None
    lite: bool = False
    created_at: datetime


class LessonBrief(BaseModel):
    id: str
    key: str
    position: int
    title: str
    objective: str
    concepts: list[str]
    prerequisites: list[str]
    status: str
    completed: bool
    stars: int | None


class ModuleOut(BaseModel):
    id: str
    position: int
    title: str
    role: str
    objectives: list[str]
    lessons: list[LessonBrief]


class SipDetail(SipSummary):
    summary: str | None
    profile: dict[str, Any] | None
    modules: list[ModuleOut]


class LessonOut(BaseModel):
    id: str
    sip_id: str
    module_id: str
    key: str
    title: str
    objective: str
    concepts: list[str]
    status: str
    error: str | None
    blocks: list[dict[str, Any]] | None
    summary: str | None
    concepts_taught: list[str] | None
    completed_at: datetime | None
    stars: int | None
    next_lesson_id: str | None
    resume: dict[str, Any] | None = None


class ResumeIn(BaseModel):
    step: int = Field(ge=0, description="Index of the block the learner is on.")
    answers: list[dict[str, Any]] = Field(default_factory=list, max_length=200)


class Score(BaseModel):
    correct: int = Field(ge=0)
    total: int = Field(ge=0)


class CompleteIn(BaseModel):
    answers: list[dict[str, Any]] = Field(
        default_factory=list, description="Free-form per-block answers, stored as-is."
    )
    score: Score | None = Field(default=None, description="Graded questions only (not open ones).")


class CompleteOut(BaseModel):
    lesson_id: str
    next_lesson_id: str | None
    progress: Progress
    stars: int
    streak_days: int


class StatsOut(BaseModel):
    streak_days: int
    completed_today: bool
    lessons_completed: int
    total_stars: int
