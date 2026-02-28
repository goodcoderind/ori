"""
Pytest fixtures shared across the test suite.

The TestClient is synchronous (uses HTTPX under the hood) which is sufficient
for all current tests.  For async route tests add `@pytest.mark.anyio` and use
`AsyncClient` instead.
"""

import os

import pytest
from fastapi.testclient import TestClient

# ── Env defaults for testing ──────────────────────────────────────────────────
# Set before importing app so pydantic-settings picks them up.
# These values must satisfy all startup validators.

_TEST_ENV = {
    "ENVIRONMENT": "test",
    "DEBUG": "true",
    "LOG_LEVEL": "warning",       # quieten output during tests
    "MINIMAX_API_KEY": "test-key-not-real",
    "AWS_REGION": "us-east-1",
    "STORE_RAW_ANSWERS": "false",
    "STORE_PAGE_CONTEXT": "false",
}

for k, v in _TEST_ENV.items():
    os.environ.setdefault(k, v)


# ── Import app after env is set ───────────────────────────────────────────────
from app.config import get_settings  # noqa: E402
from app.main import app             # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _clear_settings_cache():
    """
    Bust the lru_cache on get_settings() between test sessions so env patches
    applied in individual tests take effect.
    """
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    """Synchronous HTTPX test client wrapping the FastAPI app."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
def authed_headers() -> dict[str, str]:
    """Headers that satisfy the X-User-Id requirement on protected endpoints."""
    return {"X-User-Id": "550e8400-e29b-41d4-a716-446655440000"}
