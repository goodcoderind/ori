"""
Structured JSON logging with two key features:

1. RequestIdMiddleware — assigns X-Request-Id to every request (uses incoming
   header if present, otherwise generates a UUID4).  The ID is stored in a
   contextvars.ContextVar so all log records emitted during the request
   automatically carry it via RequestIdFilter.

2. PrivacyFilter — scrubs SENSITIVE_FIELDS from every log record before it is
   formatted.  This is a safety net: no application code should log these fields
   in the first place, but the filter guarantees they never appear in output even
   if they slip through accidentally.

   Sensitive fields: page_context, answer_text, page_html, raw_html
"""

import contextvars
import json
import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Fields that must never appear in logs.
SENSITIVE_FIELDS: frozenset[str] = frozenset(
    {
        "page_context",
        "answer_text",
        "page_html",
        "raw_html",
        "cleaned_text_snippet",  # nested content from the Socratic endpoint
    }
)

# ContextVar propagates request_id to all log records within a request.
_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)


# ── Filters ───────────────────────────────────────────────────────────────────


class PrivacyFilter(logging.Filter):
    """Strip sensitive fields from any log record regardless of where it came from."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        # Scrub from the message if it's a dict (structured log call).
        if isinstance(record.msg, dict):
            for field in SENSITIVE_FIELDS:
                record.msg.pop(field, None)

        # Scrub from kwargs-style extra attributes attached directly to the record.
        for field in SENSITIVE_FIELDS:
            if hasattr(record, field):
                setattr(record, field, "[REDACTED]")

        return True


class RequestIdFilter(logging.Filter):
    """Inject the current request_id (from ContextVar) into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        record.request_id = _request_id_ctx.get("")  # type: ignore[attr-defined]
        return True


# ── Formatter ─────────────────────────────────────────────────────────────────


class JSONFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
        }

        # request_id is injected by RequestIdFilter; may be absent in CLI/test contexts.
        request_id = getattr(record, "request_id", "")
        if request_id:
            payload["request_id"] = request_id

        # Message: structured dict or plain string.
        msg = record.getMessage()
        if isinstance(record.msg, dict):
            payload["event"] = record.msg
        else:
            payload["message"] = msg

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


# ── Setup ─────────────────────────────────────────────────────────────────────


def configure_logging(log_level: str = "INFO") -> None:
    """Call once at application startup."""
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    handler.addFilter(PrivacyFilter())
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level.upper())

    # Quieten noisy third-party loggers.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)


# ── Middleware ────────────────────────────────────────────────────────────────


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Assigns a request ID to every inbound request.

    - Reuses X-Request-Id header if the client supplied one.
    - Otherwise generates a UUID4.
    - Sets the ID in a ContextVar so log records emitted downstream carry it.
    - Echoes the ID in the X-Request-Id response header.
    """

    _logger = logging.getLogger("prosocratic.request")

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id

        token = _request_id_ctx.set(request_id)
        start = time.perf_counter()

        try:
            response = await call_next(request)
        finally:
            elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
            _request_id_ctx.reset(token)

        response.headers["X-Request-Id"] = request_id

        self._logger.info(
            {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": elapsed_ms,
            }
        )

        return response
