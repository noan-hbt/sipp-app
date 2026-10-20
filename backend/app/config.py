from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


AUTH_RATE_LIMITS = {"register": 5, "login": 20, "refresh": 30, "forgot": 5, "reset": 10}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    # Reminders through Apple Push Notification service (token auth, a .p8 key); off when empty.
    apns_key_id: str = ""
    apns_team_id: str = ""
    apns_private_key: str = ""  # contents of the .p8 file
    apns_topic: str = "app.sipp"  # the app's bundle id
    # Password reset codes by email (Resend); without a key the code is only logged, in dev.
    resend_api_key: str = ""
    email_from: str = "Sipp <hello@sipp.app>"
    # Error tracking; off when empty.
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = Field(default=0.1, ge=0, le=1)
    # Comma-separated origins allowed to call the API: the iOS app (capacitor://localhost) and the dev server
    cors_origins: str = "capacitor://localhost,http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = "sqlite+aiosqlite:///./sipp.db"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    refresh_token_days: int = 60
    auth_rate_limit_window_seconds: int = Field(default=60, ge=1)
    auth_rate_limits: dict[str, int] = AUTH_RATE_LIMITS
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
    # Output ceiling per stage (reasoning included): a runaway answer stops there instead of
    # costing minutes and dollars. Generous: the longest real outputs are ~5x below.
    llm_max_tokens: dict[str, int] = {
        "interpretation": 8000, "roadmap": 16000, "curriculum": 16000, "mapping": 12000,
        "planning": 12000, "writing": 24000, "review": 12000, "solve": 8000, "help": 6000,
    }
    # Reasoning effort per stage ("low", "medium", "high"); a stage left out uses the model default.
    llm_reasoning: dict[str, str] = {}

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
    # Answers each lesson's graded items without their key (pipeline/solve.py).
    model_solve: str = "openai/gpt-6-luna"
    solve_enabled: bool = True

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

    # Billing: App Store subscriptions through RevenueCat. Off until both secrets are set.
    revenuecat_secret_key: str = ""  # sk_..., server side only
    revenuecat_webhook_auth: str = ""  # the Authorization header value set on the RevenueCat webhook
    # App Store Connect product ids, one per plan and interval.
    store_product_basic_month: str = "sipp_basic_month"
    store_product_basic_year: str = "sipp_basic_year"
    store_product_plus_month: str = "sipp_plus_month"
    store_product_plus_year: str = "sipp_plus_year"
    # Reference prices (cents, tax included) for the comparison; the app shows the App Store's own.
    plan_prices: dict[str, dict[str, int]] = {
        "basic": {"month": 599, "year": 5990},
        "plus": {"month": 1299, "year": 12990},
    }
    # Slack after a paid period ends, in case the renewal reaches us late.
    billing_period_slack_hours: int = 48

    # Plans: library slots (Sips kept at once) and new Sips per calendar month.
    # App Store subscriptions set user.plan.
    plans: dict[str, dict[str, int | bool]] = {
        "free": {"slots": 1, "sips_per_month": 1, "lite": True},
        "basic": {"slots": 3, "sips_per_month": 4, "lite": False},
        "plus": {"slots": 10, "sips_per_month": 15, "lite": False},
        "max": {"slots": 1000, "sips_per_month": 1000, "lite": False},  # internal / team
    }
    # What each plan unlocks besides its quotas. notes: passages kept at once (0 = no limit);
    # help_per_day is capped by max_help_per_day too.
    plan_features: dict[str, dict[str, int | bool]] = {
        "free": {"audio": False, "quiz": False, "notes": 10, "help_per_day": 5},
        "basic": {"audio": True, "quiz": True, "notes": 0, "help_per_day": 30},
        "plus": {"audio": True, "quiz": True, "notes": 0, "help_per_day": 60},
        "max": {"audio": True, "quiz": True, "notes": 0, "help_per_day": 60},
    }
    default_plan: str = "free"
    # The introductory free trial set on the App Store subscriptions (shown in the app, granted by Apple).
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
        # Endpoints left out keep their default, so an older AUTH_RATE_LIMITS still starts.
        v = {**AUTH_RATE_LIMITS, **v}
        if set(v) != set(AUTH_RATE_LIMITS) or any(limit < 1 for limit in v.values()):
            raise ValueError(f"auth_rate_limits takes positive limits for {', '.join(AUTH_RATE_LIMITS)} only")
        return v

    def model_for(self, stage: str) -> str:
        return getattr(self, f"model_{stage}")

    def store_products(self) -> dict[tuple[str, str], str]:
        """(plan, interval) -> App Store product id."""
        return {
            ("basic", "month"): self.store_product_basic_month,
            ("basic", "year"): self.store_product_basic_year,
            ("plus", "month"): self.store_product_plus_month,
            ("plus", "year"): self.store_product_plus_year,
        }

    @property
    def billing_enabled(self) -> bool:
        return bool(self.revenuecat_secret_key and self.revenuecat_webhook_auth)


@lru_cache
def get_settings() -> Settings:
    return Settings()
