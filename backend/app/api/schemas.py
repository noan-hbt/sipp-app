from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class RefreshIn(BaseModel):
    refresh_token: str


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
    next_lesson_id: str | None


class CompleteIn(BaseModel):
    answers: list[dict[str, Any]] = Field(
        default_factory=list, description="Free-form per-block answers, stored as-is."
    )


class CompleteOut(BaseModel):
    lesson_id: str
    next_lesson_id: str | None
    progress: Progress
