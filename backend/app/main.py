"""
ProSocratic FastAPI application entry-point.

Start locally:
    uvicorn app.main:app --reload

AWS Lambda handler:
    The `handler` symbol at the bottom is picked up by the SAM template.
"""

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from mangum import Mangum
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.core.cors import configure_cors
from app.core.errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import RequestIdMiddleware, configure_logging
from app.routes import assessments, dashboard, health, microassess, profiles, questions, sessions, socratic, techniques

# ── Startup ───────────────────────────────────────────────────────────────────

settings = get_settings()
configure_logging(settings.log_level)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ProSocratic API",
    description=(
        "Privacy-first AI study companion backend.\n\n"
        "**Privacy guarantees enforced server-side:**\n"
        "- `page_context` and `answer_text` are never persisted or logged.\n"
        "- Only derived scores, error types, and timestamps reach DynamoDB.\n"
        "- Raw telemetry streams are never accepted.\n"
    ),
    version="0.1.0",
    openapi_tags=[
        {
            "name": "system",
            "description": "Health and readiness endpoints. No authentication required.",
        },
        {
            "name": "sessions",
            "description": "Study session lifecycle — open, update state, close.",
        },
        {
            "name": "questions",
            "description": (
                "Question answering. Accepts an ephemeral `page_context` snippet "
                "that is used only inside the MiniMax prompt and is never stored or logged."
            ),
        },
        {
            "name": "techniques",
            "description": "Technique scoring and selection based on behavioural signal summaries.",
        },
        {
            "name": "assessments",
            "description": (
                "Micro-assessment scoring. Raw answer text is scored by MiniMax and "
                "discarded; only the derived score and error type are persisted."
            ),
        },
        {
            "name": "profiles",
            "description": "Learner profile CRUD — read, update, export, delete.",
        },
    ],
    # OpenAPI docs always available (requirement); disable in prod by setting
    # docs_url=None / redoc_url=None via env if desired.
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ── Middleware (outermost first) ───────────────────────────────────────────────

# RequestIdMiddleware must come before CORS so the ID is set before any
# pre-flight response or error handler runs.
app.add_middleware(RequestIdMiddleware)
configure_cors(app)

# ── Exception handlers ────────────────────────────────────────────────────────
# FastAPI's HTTPException is a subclass of Starlette's HTTPException.
# The Router raises starlette.exceptions.HTTPException for 404s, so we must
# register our handler for the base Starlette class too — otherwise only the
# FastAPI default handler fires for routing failures.

app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, unhandled_exception_handler)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(questions.router)
app.include_router(techniques.router)
app.include_router(assessments.router)
app.include_router(profiles.router)
app.include_router(socratic.router)
app.include_router(microassess.router)
app.include_router(dashboard.router)

# ── AWS Lambda handler ────────────────────────────────────────────────────────

handler = Mangum(app, lifespan="off")
