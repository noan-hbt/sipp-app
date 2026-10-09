from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    # Web push reminders (VAPID); off when empty. Public key in base64url (uncompressed point).
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:hello@sipp.app"
    # Error tracking; off when empty.
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = Field(default=0.1, ge=0, le=1)
    # Comma-separated origins allowed to call the API from a browser (the PWA)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = "sqlite+aiosqlite:///./sipp.db"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    refresh_token_days: int = 60
    auth_rate_limit_window_seconds: int = Field(default=60, ge=1)
    auth_rate_limits: dict[str, int] = {"register": 5, "login": 20, "refresh": 30}
    auth_password_workers: int = Field(default=2, ge=1)

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
    model_roadmap: str = "anthropic/claude-opus-5.5"
    model_mapping: str = "openai/gpt-6.1-sol"
    model_planning: str = "openai/gpt-6-luna"
    model_writing: str = "openai/gpt-6-luna"
    model_review: str = "openai/gpt-6-luna"
    model_escalation: str = "openai/gpt-6.1-sol"
    model_help: str = "openai/gpt-6-luna"

    # Guardrails (limits, never targets)
    max_modules: int = 12
    max_lessons_per_module: int = 15
    lesson_minutes: int = 5
    max_revisions: int = 1
    # Total lessons budget per profile scope (min, max)
    lesson_budget: dict[str, tuple[int, int]] = {
        "focused": (8, 15),
        "standard": (15, 30),
        "comprehensive": (30, 60),
    }
    # Typical lessons in a full Sip, only to show learning hours on the offers.
    typical_lessons_per_sip: int = 18

    # Per-user spending guards (rolling 24h)
    max_cost_per_day_usd: float = 1.0
    max_global_cost_per_day_usd: float = Field(default=50.0, gt=0)
    llm_reservation_cost_usd: float = Field(default=0.05, gt=0)
    # Above worker_concurrency: a user's build + preloads + help must never trip it.
    llm_max_concurrent_per_user: int = Field(default=5, ge=1)
    max_help_per_day: int = 30

    # Billing (Paddle, merchant of record). Off until every key and price id is set.
    paddle_env: str = "sandbox"  # sandbox | production
    paddle_api_key: str = ""
    paddle_webhook_secret: str = ""
    paddle_client_token: str = ""  # public, for Paddle.js
    paddle_price_basic_month: str = ""
    paddle_price_basic_year: str = ""
    paddle_price_plus_month: str = ""
    paddle_price_plus_year: str = ""
    # Shown on the offers (cents, tax included); must match the Paddle prices.
    plan_prices: dict[str, dict[str, int]] = {
        "basic": {"month": 599, "year": 5990},
        "plus": {"month": 1299, "year": 12990},
    }
    public_app_url: str = "http://localhost:5173"
    # Access kept while Paddle retries a failed renewal.
    billing_grace_days: int = 7
    # Slack after a paid period ends, in case the renewal webhook is late.
    billing_period_slack_hours: int = 48
    billing_webhook_tolerance_seconds: int = 300

    # Plans: library slots (Sips kept at once) and new Sips per calendar month.
    # Paddle subscriptions and the one-time trial set user.plan.
    plans: dict[str, dict[str, int | bool]] = {
        "free": {"slots": 1, "sips_per_month": 1, "lite": True},
        "basic": {"slots": 3, "sips_per_month": 4, "lite": False},
        "plus": {"slots": 10, "sips_per_month": 15, "lite": False},
        "max": {"slots": 1000, "sips_per_month": 1000, "lite": False},  # internal / team
    }
    default_plan: str = "free"
    trial_plan: str = "basic"
    trial_days: int = 7
    # Lite generation: one small model everywhere, short course.
    model_lite: str = "openai/gpt-6-luna"
    lite_lesson_budget: tuple[int, int] = (3, 5)
    lite_max_modules: int = 2
    max_program_chapters: int = 15

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

    @field_validator("auth_rate_limits")
    @classmethod
    def _auth_limits(cls, v: dict[str, int]) -> dict[str, int]:
        if set(v) != {"register", "login", "refresh"} or any(limit < 1 for limit in v.values()):
            raise ValueError("auth_rate_limits must contain positive register, login and refresh limits")
        return v

    def model_for(self, stage: str) -> str:
        return getattr(self, f"model_{stage}")

    def paddle_prices(self) -> dict[tuple[str, str], str]:
        """(plan, interval) -> Paddle price id, only for configured prices."""
        prices = {
            ("basic", "month"): self.paddle_price_basic_month,
            ("basic", "year"): self.paddle_price_basic_year,
            ("plus", "month"): self.paddle_price_plus_month,
            ("plus", "year"): self.paddle_price_plus_year,
        }
        return {k: v for k, v in prices.items() if v}

    @property
    def billing_enabled(self) -> bool:
        return bool(
            self.paddle_api_key and self.paddle_webhook_secret and self.paddle_client_token
            and len(self.paddle_prices()) == 4
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
