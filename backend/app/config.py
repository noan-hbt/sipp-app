from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    database_url: str = "sqlite+aiosqlite:///./sipp.db"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    refresh_token_days: int = 60

    # OpenRouter
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_app_name: str = "Sipp"
    openrouter_app_url: str = "https://sipp.app"
    llm_timeout_seconds: float = 180.0
    # "json_schema" (structured outputs) or "json_object" (schema in prompt only)
    llm_response_format: str = "json_schema"
    llm_validation_retries: int = 1

    # Models per pipeline stage (OpenRouter slugs)
    model_interpretation: str = "openai/gpt-6-luna"
    model_curriculum: str = "anthropic/claude-opus-5.5"
    model_mapping: str = "openai/gpt-6.1-sol"
    model_planning: str = "openai/gpt-6-luna"
    model_writing: str = "openai/gpt-6-luna"
    model_review: str = "openai/gpt-6-luna"
    model_escalation: str = "openai/gpt-6.1-sol"

    # Guardrails (limits, never targets)
    max_modules: int = 12
    max_lessons_per_module: int = 15
    lesson_minutes: int = 5
    max_revisions: int = 1
    # Total lessons budget per profile scope (min, max)
    lesson_budget: dict[str, tuple[int, int]] = {
        "focused": (3, 10),
        "standard": (10, 25),
        "comprehensive": (25, 60),
    }

    # Worker
    worker_poll_seconds: float = 1.0
    worker_concurrency: int = 3
    job_max_attempts: int = 3
    job_stale_minutes: int = 15

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, v: str) -> str:
        # Railway provides postgresql://... ; we need the asyncpg driver.
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    def model_for(self, stage: str) -> str:
        return getattr(self, f"model_{stage}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
