"""
Dashboard endpoints — read-only views for the web application (Client B).

GET /v1/dashboard/summary?user_id=       — aggregated study metrics
GET /v1/dashboard/sessions?user_id=      — per-session summary list
GET /v1/dashboard/session/{session_id}?user_id= — full session detail

Auth:
  All endpoints require X-User-Id header (UUID v4).
  The ?user_id= query parameter must match the X-User-Id header value.
  Users may only view their own data; mismatches return HTTP 403.

No data is written by any dashboard endpoint.
No LLM calls are made.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.security import require_user_id
from app.services.dashboard_service import get_dashboard_service

router = APIRouter(prefix="/v1/dashboard", tags=["profiles"])
logger = logging.getLogger("prosocratic.routes.dashboard")

UserId = Annotated[str, Depends(require_user_id)]


# ── Helpers ────────────────────────────────────────────────────────────────────


def _assert_own(query_user_id: str, header_user_id: str) -> None:
    """Raise 403 if the query param user_id does not match the authenticated header."""
    if query_user_id != header_user_id:
        raise HTTPException(
            status_code=403,
            detail="user_id query parameter must match your X-User-Id header.",
        )


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get(
    "/summary",
    summary="Aggregated study metrics",
    description=(
        "Returns focus state distribution, time-of-day heatmap, technique success "
        "rates, mastery map, and upcoming spaced-repetition reviews. "
        "Computed from stored aggregates; no LLM calls."
    ),
)
async def summary(
    user_id: Annotated[str, Query(description="Must match X-User-Id header.")],
    auth_user_id: UserId,
) -> dict:
    _assert_own(user_id, auth_user_id)

    service = get_dashboard_service()
    result = service.get_summary(user_id)

    logger.debug({"event": "dashboard_summary", "user_id": user_id})
    return result


@router.get(
    "/sessions",
    summary="Session list with per-session metrics",
    description=(
        "Returns a list of recent sessions with duration, nudge count, average "
        "confidence, and micro-assessment scores."
    ),
)
async def sessions_list(
    user_id: Annotated[str, Query(description="Must match X-User-Id header.")],
    auth_user_id: UserId,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[dict]:
    _assert_own(user_id, auth_user_id)

    service = get_dashboard_service()
    result = service.get_sessions_list(user_id, limit=limit)

    logger.debug({"event": "dashboard_sessions_list", "user_id": user_id, "count": len(result)})
    return result


@router.get(
    "/session/{session_id}",
    summary="Full session detail",
    description=(
        "Returns the complete event timeline, rolled-up state counts, and "
        "micro-assessment attempt metas for a single session."
    ),
)
async def session_detail(
    session_id: str,
    user_id: Annotated[str, Query(description="Must match X-User-Id header.")],
    auth_user_id: UserId,
) -> dict:
    _assert_own(user_id, auth_user_id)

    service = get_dashboard_service()
    result = service.get_session_detail(user_id, session_id)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id!r} not found for this user.",
        )

    logger.debug({"event": "dashboard_session_detail", "user_id": user_id, "session_id": session_id})
    return result
