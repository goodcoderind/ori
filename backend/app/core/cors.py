"""
CORS configuration.

Origins allowed:
  - DASHBOARD_ORIGIN env var (e.g. http://localhost:3000 in dev,
    https://prosocratic.ai in prod)
  - Chrome extension origins:
      dev   → any chrome-extension://<id>  (regex, controlled by EXTENSION_DEV_MODE=true)
      prod  → add specific extension IDs to ALLOWED_EXTENSION_ORIGINS env var (comma-separated)

Credentials (cookies / Authorization header) are allowed because the dashboard
uses session-based auth when cloud sync is enabled.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

# Regex matching any unpacked Chrome extension origin.
_CHROME_EXT_REGEX = r"chrome-extension://[a-z]{32}"


def configure_cors(app: FastAPI) -> None:
    settings = get_settings()

    explicit_origins = [settings.dashboard_origin]

    # In dev mode allow any chrome-extension://<id> via regex.
    # In prod, restrict to known extension IDs listed in explicit_origins.
    origin_regex: str | None = _CHROME_EXT_REGEX if settings.extension_dev_mode else None

    middleware_kwargs: dict = {
        "allow_origins": explicit_origins,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": [
            "Authorization",
            "Content-Type",
            "X-User-Id",
            "X-Request-Id",
        ],
        "expose_headers": ["X-Request-Id"],
        "max_age": 600,
    }

    if origin_regex:
        middleware_kwargs["allow_origin_regex"] = origin_regex

    app.add_middleware(CORSMiddleware, **middleware_kwargs)
