"""
Learner profile endpoints.

GET    /v1/profiles/{user_id}           — dashboard summary
PUT    /v1/profiles/{user_id}           — update modality_pref
DELETE /v1/profiles/{user_id}           — full data deletion (GDPR right to erasure)
GET    /v1/profiles/{user_id}/export    — download full profile as JSON

The user_id in the path must match the X-User-Id header — users can only access
their own profile.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.core.security import require_user_id
from app.storage import get_storage

router = APIRouter(prefix="/v1/profiles", tags=["profiles"])
logger = logging.getLogger("prosocratic.routes.profiles")

UserId = Annotated[str, Depends(require_user_id)]


# ── Request / Response schemas ─────────────────────────────────────────────────


class UpdateProfileRequest(BaseModel):
    modality_pref: str | None = None  # e.g. "visual", "text", "audio"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _assert_own_profile(path_user_id: str, header_user_id: str) -> None:
    """Users may only read/write their own profile."""
    if path_user_id != header_user_id:
        raise HTTPException(
            status_code=403,
            detail="You may only access your own profile.",
        )


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/{user_id}")
async def get_profile(user_id: str, auth_user_id: UserId) -> dict:
    """
    Return a dashboard summary: top techniques, mastery map, recent sessions.
    """
    _assert_own_profile(user_id, auth_user_id)
    storage = get_storage()
    return storage.dashboard_summary(user_id)


@router.put("/{user_id}", status_code=204)
async def update_profile(
    user_id: str,
    body: UpdateProfileRequest,
    auth_user_id: UserId,
) -> None:
    """Update mutable profile fields (currently: modality_pref)."""
    _assert_own_profile(user_id, auth_user_id)
    storage = get_storage()
    profile = storage.get_or_create_user(user_id)
    if body.modality_pref is not None:
        profile.modality_pref = body.modality_pref
        storage._put_user(profile)


@router.delete("/{user_id}", status_code=204)
async def delete_profile(user_id: str, auth_user_id: UserId) -> None:
    """
    Delete ALL data for this user:
      - USER record from TABLE_USERS
      - All SESSION records from TABLE_SESSIONS
      - All ASSESSMENT records from TABLE_ASSESSMENTS

    This implements the right to erasure. The operation is best-effort across
    tables — a partial failure logs a warning but does not block the response.
    """
    _assert_own_profile(user_id, auth_user_id)
    storage = get_storage()

    # Delete user profile.
    try:
        storage._users().delete_item(Key={"user_id": user_id})
    except Exception as exc:
        logger.error({"event": "delete_user_failed", "user_id": user_id, "error": str(exc)})

    # Delete all sessions.
    try:
        sessions = storage.list_sessions(user_id, limit=1000)
        for s in sessions:
            storage._sessions().delete_item(
                Key={"user_id": user_id, "session_id": s.session_id}
            )
    except Exception as exc:
        logger.error({"event": "delete_sessions_failed", "user_id": user_id, "error": str(exc)})

    # Delete all assessments.
    try:
        resp = storage._assessments().query(
            KeyConditionExpression="user_id = :uid",
            ExpressionAttributeValues={":uid": user_id},
            ProjectionExpression="user_id, probe_set_id",
        )
        for item in resp.get("Items", []):
            storage._assessments().delete_item(
                Key={"user_id": user_id, "probe_set_id": item["probe_set_id"]}
            )
    except Exception as exc:
        logger.error(
            {"event": "delete_assessments_failed", "user_id": user_id, "error": str(exc)}
        )

    logger.info({"event": "profile_deleted", "user_id": user_id})


@router.get("/{user_id}/export")
async def export_profile(user_id: str, auth_user_id: UserId) -> Response:
    """
    Export the full learner profile as a downloadable JSON file.
    Includes technique stats, mastery map, and session metadata.
    """
    _assert_own_profile(user_id, auth_user_id)
    storage = get_storage()
    profile = storage.get_or_create_user(user_id)
    sessions = storage.list_sessions(user_id, limit=100)

    export = {
        "user_id": profile.user_id,
        "created_at": profile.created_at.isoformat(),
        "modality_pref": profile.modality_pref,
        "technique_stats": {
            tid: {
                "shown_count": s.shown_count,
                "accepted_count": s.accepted_count,
                "success_count": s.success_count,
                "reward_sum": s.reward_sum,
            }
            for tid, s in profile.technique_stats.items()
        },
        "mastery_by_topic": {
            topic: {
                "p_mastery": m.p_mastery,
                "last_probe_at": m.last_probe_at.isoformat() if m.last_probe_at else None,
                "next_probe_at": m.next_probe_at.isoformat() if m.next_probe_at else None,
            }
            for topic, m in profile.mastery_by_topic.items()
        },
        "sessions": [
            {
                "session_id": s.session_id,
                "started_at": s.started_at.isoformat(),
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                "topic_label": s.topic_label,
                "total_events": s.total_event_count,
                "microassess_count": len(s.microassess_ids),
            }
            for s in sessions
        ],
    }

    return Response(
        content=json.dumps(export, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="prosocratic-profile-{user_id[:8]}.json"'
        },
    )
