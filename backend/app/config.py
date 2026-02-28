"""
Application settings loaded from environment variables / .env file.

PRIVACY INVARIANTS (enforced at startup):
  - STORE_RAW_ANSWERS must be False
  - STORE_PAGE_CONTEXT must be False

Secrets (MINIMAX_API_KEY, AWS_SECRET_ACCESS_KEY) are never printed in __repr__
thanks to pydantic-settings' SecretStr behaviour applied on those fields.
"""

from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Prevent secrets appearing in repr / logs
        secrets_dir=None,
    )

    # ── App ──────────────────────────────────────────────────────────────────
    environment: str = "development"
    debug: bool = False
    log_level: str = "info"
    api_version: str = "v1"
    dashboard_origin: str = "http://localhost:3000"
    extension_dev_mode: bool = True

    # ── MiniMax ───────────────────────────────────────────────────────────────
    # Empty default so tests that don't call MiniMax don't require a real key.
    minimax_api_key: str = ""
    minimax_model: str = "MiniMax-M2.5"
    minimax_temperature: float = 0.4
    minimax_max_tokens: int = 1024
    minimax_timeout_seconds: int = 20

    # ── AWS ───────────────────────────────────────────────────────────────────
    aws_region: str = "me-central-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # ── DynamoDB ──────────────────────────────────────────────────────────────
    table_users: str = "ProsocraticUsers"
    table_sessions: str = "ProsocraticSessions"
    table_assessments: str = "ProsocraticAssessments"

    # ── Lambda / Deployment ───────────────────────────────────────────────────
    lambda_timeout_seconds: int = 30
    enable_lambda_mode: bool = False

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    rate_limit_requests_per_minute: int = 60

    # ── Privacy Controls ──────────────────────────────────────────────────────
    store_raw_answers: bool = False
    store_page_context: bool = False
    session_ttl_days: int = 30

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator("store_raw_answers", mode="before")
    @classmethod
    def raw_answers_must_be_false(cls, v: bool | str) -> bool:
        parsed = v if isinstance(v, bool) else str(v).lower() == "true"
        if parsed:
            raise ValueError(
                "STORE_RAW_ANSWERS must be False — storing raw answers violates privacy policy"
            )
        return parsed

    @field_validator("store_page_context", mode="before")
    @classmethod
    def page_context_must_be_false(cls, v: bool | str) -> bool:
        parsed = v if isinstance(v, bool) else str(v).lower() == "true"
        if parsed:
            raise ValueError(
                "STORE_PAGE_CONTEXT must be False — storing page context violates privacy policy"
            )
        return parsed

    @model_validator(mode="after")
    def log_level_is_valid(self) -> "Settings":
        valid = {"debug", "info", "warning", "error", "critical"}
        if self.log_level.lower() not in valid:
            raise ValueError(f"LOG_LEVEL must be one of {valid}")
        return self

    def __repr__(self) -> str:
        """Never print secrets in repr."""
        return (
            f"Settings(environment={self.environment!r}, "
            f"debug={self.debug}, "
            f"log_level={self.log_level!r}, "
            f"minimax_model={self.minimax_model!r})"
        )


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — call get_settings() everywhere instead of Settings()."""
    return Settings()
