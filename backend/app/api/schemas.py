from datetime import datetime
import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, model_validator


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class RefreshIn(BaseModel):
    refresh_token: str


class DeleteAccountIn(BaseModel):
    password: str


class UsageOut(BaseModel):
    sips_last_24h: int
    cost_last_24h_usd: float
    max_cost_per_day_usd: float


class SubscriptionOut(BaseModel):
    status: str  # active, trialing, past_due
    interval: str
    current_period_end: datetime | None
    cancel_at_period_end: bool


class FeaturesOut(BaseModel):
    audio: bool
    quiz: bool
    notes: int = Field(description="Passages kept at once, 0 = no limit.")
    help_per_day: int


class PlanOut(BaseModel):
    billing_enabled: bool
    subscription: SubscriptionOut | None
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
    features: FeaturesOut | None = None


class PlanInfo(BaseModel):
    name: str
    slots: int
    sips_per_month: int
    lite: bool
    hours_per_month: float
    # Cents, tax included, per interval ("month", "year"); empty for the free plan.
    prices: dict[str, int]
    features: FeaturesOut | None = None


class CheckoutIn(BaseModel):
    plan: Literal["basic", "plus"]
    interval: Literal["month", "year"]
    # Express request to start before the 14-day withdrawal period ends.
    consent: StrictBool


class CheckoutOut(BaseModel):
    transaction_id: str
    client_token: str
    environment: str
    success_url: str


class PortalOut(BaseModel):
    url: str
    cancel_url: str | None


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
    model_config = ConfigDict(str_strip_whitespace=True)
    input: str = Field(min_length=3, max_length=4000, description="What the user wants to learn.")
    profile: dict[str, Any] | None = Field(
        default=None, description="The confirmed profile from `POST /sips/interpret`, possibly edited."
    )


class InterpretIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    input: str = Field(min_length=3, max_length=4000)


class InterpretOut(BaseModel):
    profile: dict[str, Any]
    lessons_min: int
    lessons_max: int
    program: bool = Field(description="A big goal: the path will be split into chapters.")


class HelpIn(BaseModel):
    block: int = Field(ge=0, description="Index of the block the learner needs help with.")
    kind: Literal["rephrase", "simpler", "example", "word", "question"]
    question: str | None = Field(default=None, max_length=500)


class HelpOut(BaseModel):
    answer: str


class Progress(BaseModel):
    completed: int
    total: int


class SipSummary(BaseModel):
    id: str
    title: str | None
    theme: str | None = Field(default=None, description="Visual theme key chosen when the Sip was understood.")
    input_text: str
    status: str
    stage: str | None
    error: str | None
    progress: Progress
    next_lesson_id: str | None
    next_lesson_title: str | None = None
    lite: bool = False
    program_id: str | None = None
    chapter: int | None = None
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
    bonus_stars: int = Field(default=3, description="Stars earned by finishing every lesson of the module.")
    bonus_earned: bool = False
    quiz_stars: int | None = Field(default=None, description="Best end-of-module quiz result, once taken.")


class SipDetail(SipSummary):
    summary: str | None
    profile: dict[str, Any] | None
    outline: list[str] = Field(default_factory=list, description="Module titles, known before mapping ends.")
    modules: list[ModuleOut]


class ChapterOut(BaseModel):
    position: int
    title: str
    outcome: str
    level: str
    estimated_lessons: int
    sip: SipSummary | None


class ProgramOut(BaseModel):
    id: str
    status: str
    error: str | None
    title: str | None
    theme: str | None = None
    summary: str | None
    lite: bool
    note: str | None = None
    chapters: list[ChapterOut]
    created_at: datetime


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


class MatchAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mistakes: int = Field(ge=0, le=10000)


AnswerText = Annotated[str, Field(max_length=4000)]
AnswerValue = AnswerText | StrictBool | Annotated[float, Field(allow_inf_nan=False)] | Annotated[list[AnswerText], Field(max_length=50)] | MatchAnswer | None


class BlockAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    block: int = Field(ge=0, lt=200)
    value: AnswerValue = None
    correct: bool | None = None
    choice: AnswerText | None = None


class AnswersIn(BaseModel):
    answers: list[BlockAnswer] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _size(self):
        encoded = [json.dumps(a.model_dump(exclude_unset=True), ensure_ascii=False).encode() for a in self.answers]
        if any(len(a) > 8192 for a in encoded) or sum(map(len, encoded)) > 32768:
            raise ValueError("answers are too large")
        if len({a.block for a in self.answers}) != len(self.answers):
            raise ValueError("duplicate block answers")
        return self


class ResumeIn(AnswersIn):
    step: int = Field(ge=0, description="Index of the block the learner is on.")


class Score(BaseModel):
    correct: int = Field(ge=0)
    total: int = Field(ge=0)

    @model_validator(mode="after")
    def _bound(self):
        self.correct = min(self.correct, self.total)
        return self


class CompleteIn(AnswersIn):
    score: Score | None = Field(default=None, description="Graded questions only (not open ones).")


class CompleteOut(BaseModel):
    lesson_id: str
    next_lesson_id: str | None
    progress: Progress
    stars: int
    streak_days: int
    module_bonus: int = Field(default=0, description="Bonus stars earned now: this lesson finished its module.")
    module_id: str | None = None
    module_done: bool = Field(default=False, description="Every lesson of this lesson's module is finished: quiz open.")


class WeekOut(BaseModel):
    lessons: int
    minutes: int
    notions: int
    active_days: int


class StatsOut(BaseModel):
    streak_days: int
    completed_today: bool
    lessons_completed: int
    total_stars: int
    week: list[bool] = Field(default_factory=list, description="Active days of the current week, Monday first.")
    month: str = Field(default="", description="Current month in the device's timezone, YYYY-MM.")
    month_days: list[int] = Field(default_factory=list, description="Days of the current month with a finished lesson.")
    today: int = Field(default=1, description="Day of the month today, in the device's timezone.")
    concepts: int = Field(default=0, description="Notions met in finished lessons.")
    lessons_today: int = 0
    daily_goal: int = 1
    freeze_available: bool = True
    freeze_used: list[str] = Field(default_factory=list, description="Missed days a streak freeze bridged.")
    this_week: WeekOut | None = None
    last_week: WeekOut | None = None


class SettingsIn(BaseModel):
    daily_goal: int | None = Field(default=None, ge=1, le=5)
    # Local hour for the daily reminder, or -1 to turn it off.
    reminder_hour: int | None = Field(default=None, ge=-1, le=23)
    timezone: str | None = Field(default=None, max_length=64)


class SettingsOut(BaseModel):
    daily_goal: int
    reminder_hour: int | None
    timezone: str | None
    push_enabled: bool
    push_public_key: str | None


class PushIn(BaseModel):
    endpoint: str = Field(max_length=2000)
    keys: dict[str, str]


class ConceptOut(BaseModel):
    id: str
    name: str
    definition: str
    explanation: str | None
    sip_id: str
    sip_title: str
    lesson_id: str
    lesson_title: str
    mastery: int = Field(description="1 fragile, 2 on its way, 3 well learned.")
    due: bool = Field(description="Due for review now.")
    learned_at: datetime
    last_reviewed_at: datetime | None


class ReviewOut(BaseModel):
    due_count: int
    cards: list[ConceptOut]


class ReviewIn(BaseModel):
    knew: bool
