import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import get_settings
from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    plan: Mapped[str] = mapped_column(
        String(20), default=lambda: get_settings().default_plan, server_default="free"
    )
    # Paid/trial plan end; past it the user falls back to "free".
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # New Sips generated in `gen_month` ("YYYY-MM"); kept even if the Sip is deleted.
    gen_month: Mapped[str | None] = mapped_column(String(7))
    gen_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProgramStatus:
    GENERATING = "generating"  # roadmap being written ("go further" on a finished Sip)
    ADJUSTING = "adjusting"  # remaining chapters being re-planned after a finished chapter
    READY = "ready"
    FAILED = "failed"


class Program(TimestampMixin, Base):
    """A big learning goal split into chapters; each chapter becomes a Sip on demand."""

    __tablename__ = "programs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=ProgramStatus.READY)
    title: Mapped[str | None] = mapped_column(String(300))
    summary: Mapped[str | None] = mapped_column(Text)
    profile: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # [{title, outcome, level: core|advanced, estimated_lessons}], position = index + 1
    roadmap: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    lite: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Learner-facing sentence on the last roadmap adjustment, if it changed anything.
    note: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)


class SipStatus:
    QUEUED = "queued"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class Sip(TimestampMixin, Base):
    __tablename__ = "sips"
    __table_args__ = (UniqueConstraint("program_id", "chapter", name="uq_sips_program_chapter"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    input_text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=SipStatus.QUEUED)
    stage: Mapped[str | None] = mapped_column(String(30))
    title: Mapped[str | None] = mapped_column(String(300))
    summary: Mapped[str | None] = mapped_column(Text)
    profile: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    curriculum: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    # Lite generation (free plan): reduced course, smaller models.
    lite: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Chapter of a program (1-based), or standalone when null.
    program_id: Mapped[str | None] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), index=True
    )
    chapter: Mapped[int | None] = mapped_column(Integer)
    adjustment_queued: Mapped[bool] = mapped_column(default=False, server_default=false())

    modules: Mapped[list["Module"]] = relationship(
        back_populates="sip", cascade="all, delete-orphan", order_by="Module.position"
    )


class Module(Base):
    __tablename__ = "modules"
    __table_args__ = (UniqueConstraint("sip_id", "position"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sip_id: Mapped[str] = mapped_column(ForeignKey("sips.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(Text)
    objectives: Mapped[list[str]] = mapped_column(JSON, default=list)

    sip: Mapped[Sip] = relationship(back_populates="modules")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="Lesson.position"
    )


class LessonStatus:
    PENDING = "pending"  # mapped, not generated yet
    QUEUED = "queued"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class Lesson(TimestampMixin, Base):
    __tablename__ = "lessons"
    __table_args__ = (UniqueConstraint("sip_id", "key"), UniqueConstraint("sip_id", "global_index"))

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sip_id: Mapped[str] = mapped_column(ForeignKey("sips.id", ondelete="CASCADE"), index=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)  # 1-based within module
    global_index: Mapped[int] = mapped_column(Integer)  # 0-based across the sip
    key: Mapped[str] = mapped_column(String(20))  # e.g. "M2L3"
    title: Mapped[str] = mapped_column(String(300))
    objective: Mapped[str] = mapped_column(Text)
    prerequisites: Mapped[list[str]] = mapped_column(JSON, default=list)
    concepts: Mapped[list[str]] = mapped_column(JSON, default=list)

    status: Mapped[str] = mapped_column(String(20), default=LessonStatus.PENDING)
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    blocks: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    summary: Mapped[str | None] = mapped_column(Text)
    concepts_taught: Mapped[list[str] | None] = mapped_column(JSON)
    review: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    revisions: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)

    answers: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    stars: Mapped[int | None] = mapped_column(Integer)  # best result, 1-3
    resume: Mapped[dict[str, Any] | None] = mapped_column(JSON)  # in-progress step + answers
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    module: Mapped[Module] = relationship(back_populates="lessons")


class JobStatus:
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class Job(TimestampMixin, Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    type: Mapped[str] = mapped_column(String(50), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default=JobStatus.QUEUED, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claim_token: Mapped[str | None] = mapped_column(String(36))
    error: Mapped[str | None] = mapped_column(Text)


class ConceptCard(Base):
    """A notion the learner met in a finished lesson, scheduled for spaced review."""

    __tablename__ = "concept_cards"
    __table_args__ = (UniqueConstraint("lesson_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sip_id: Mapped[str] = mapped_column(ForeignKey("sips.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(300))
    definition: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    # Leitner box: 0 = just learned / forgotten, up to len(REVIEW_INTERVALS) - 1.
    box: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    reviews: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    lapses: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BudgetLock(Base):
    __tablename__ = "budget_lock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)


class LLMCall(Base):
    """Usage log for cost tracking and debugging."""

    __tablename__ = "llm_calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    stage: Mapped[str] = mapped_column(String(30), index=True)
    model: Mapped[str] = mapped_column(String(100))
    sip_id: Mapped[str | None] = mapped_column(String(36), index=True)
    lesson_id: Mapped[str | None] = mapped_column(String(36))
    # Kept independently of the Sip, including after deletion.
    user_id: Mapped[str | None] = mapped_column(String(36), index=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[float | None] = mapped_column()
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    ok: Mapped[bool] = mapped_column(default=True)
    error: Mapped[str | None] = mapped_column(Text)
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
