"""
Consistent JSON error envelope for all error conditions.

Every error response has the shape:

    {
        "error": {
            "code":       "<SNAKE_CASE_CODE>",
            "message":    "<human readable>",
            "request_id": "<uuid>"
        }
    }

Handlers registered here cover:
  - HTTPException (FastAPI / Starlette raises these for 4xx/5xx)
  - RequestValidationError (pydantic v2 input validation failures → 422)
  - Catch-all Exception (unexpected 500s — message is generic in production)
"""

import logging

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("prosocratic.errors")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def error_body(code: str, message: str, request_id: str) -> dict:
    return {"error": {"code": code, "message": message, "request_id": request_id}}


def error_response(
    code: str,
    message: str,
    request_id: str,
    status_code: int,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=error_body(code, message, request_id),
    )


# ── Handlers ──────────────────────────────────────────────────────────────────


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    rid = _request_id(request)
    response = error_response(
        code=f"HTTP_{exc.status_code}",
        message=str(exc.detail),
        request_id=rid,
        status_code=exc.status_code,
    )
    # Forward headers the exception carries (e.g. Retry-After for 429).
    if exc.headers:
        for key, value in exc.headers.items():
            response.headers[key] = value
    return response


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    rid = _request_id(request)

    # Flatten pydantic v2 error list into a readable message.
    parts = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err["loc"] if l != "body")
        parts.append(f"{loc}: {err['msg']}" if loc else err["msg"])
    message = "; ".join(parts) or "Request validation failed"

    return error_response(
        code="VALIDATION_ERROR",
        message=message,
        request_id=rid,
        status_code=422,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    from app.config import get_settings

    rid = _request_id(request)
    logger.exception("Unhandled exception", extra={"request_id": rid})

    # Expose details only in debug mode; never leak stack traces to clients in prod.
    settings = get_settings()
    message = repr(exc) if settings.debug else "An unexpected error occurred."

    return error_response(
        code="INTERNAL_ERROR",
        message=message,
        request_id=rid,
        status_code=500,
    )
