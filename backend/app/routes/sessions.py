"""
Session ingestion endpoints — primary API surface for the Chrome extension.

POST /v1/session/start   Open a session, receive session_id.
POST /v1/session/update  Ingest one behavioural state snapshot; runs the policy
                         engine synchronously and returns Ori's response.
POST /v1/session/end     Mark the session as completed.

/v1/session/update is the hot path.  Every ~30 s the extension sends the latest
classifier output and receives:
  - ori_state        — what Ori avatar should display
  - suggestion       — one intervention (or NONE)
  - transparency_card— why this was triggered and why this suggestion
  - session_flags    — current ignore_count and asleep_flag

Rate limiting (per user_id, per endpoint, in-memory):
  start / end: 10 requests / minute
  update:     120 requests / minute  (one every 500 ms)
  Not distributed — effective within a single Lambda warm container.
  429 responses include a Retry-After header.

Logging:
  Only metadata is logged from /v1/session/update (session_id, state_label,
  confidence, policy output).  feature_summary values are NOT logged.
  The PrivacyFilter in core/logging.py provides a secondary safety net.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_user_id
from app.models import FeatureSummary, SessionEvent, StateLabel
from app.services.policy_engine import SessionContext, UserContext, evaluate
from app.storage import get_storage

router = APIRouter(tags=["sessions"])
logger = logging.getLogger("prosocratic.routes.sessions")

UserId = Annotated[str, Depends(require_user_id)]


# ── In-memory rate limiter ─────────────────────────────────────────────────────


class _RateLimiter:
    """
    Sliding-window in-memory rate limiter keyed by an arbitrary string.

    Thread/coroutine safety: the FastAPI event loop is single-threaded, so
    plain dict mutations are safe without locks.

    Limitations: state is per-process.  Across Lambda cold starts or multiple
    containers, each instance has its own independent counter.  Acceptable for
    an MVP; replace with Redis or a DynamoDB counter for multi-instance deployments.
    """

    def __init__(self, max_calls: int, window_seconds: float = 60.0) -> None:
        self._max = max_calls
        self._window = window_seconds
        # Public so tests can reset between runs without restarting the process.
        self._history: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> tuple[bool, int]:
        """
        Record a call attempt for *key*.

        Returns:
            (True, 0)                    — allowed
            (False, retry_after_seconds) — rate-limited
        """
        now = time.monotonic()
        bucket = self._history[key]

        # Evict timestamps that have fallen outside the sliding window.
        while bucket and now - bucket[0] >= self._window:
            bucket.popleft()

        if len(bucket) >= self._max:
            # Calculate how many seconds until the oldest entry expires.
            retry_after = max(1, int(self._window - (now - bucket[0])) + 1)
            return False, retry_after

        bucket.append(now)
        return True, 0


# Module-level limiter singletons.
_rl_start = _RateLimiter(max_calls=10)
_rl_update = _RateLimiter(max_calls=120)
_rl_end = _RateLimiter(max_calls=10)


def _enforce(limiter: _RateLimiter, user_id: str) -> None:
    """Raise HTTP 429 with Retry-After if the user has exceeded their rate limit."""
    allowed, retry_after = limiter.check(user_id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Retry after {retry_after} s.",
            headers={"Retry-After": str(retry_after)},
        )


# ── Request / Response schemas ─────────────────────────────────────────────────


class StartRequest(BaseModel):
    url: str = Field(max_length=2048)
    title: str = Field(max_length=512)
    topic_label: str | None = Field(default=None, max_length=256)


class StartResponse(BaseModel):
    session_id: str


# ── /v1/session/update ─────────────────────────────────────────────────────────

class UpdateRequest(BaseModel):
    session_id: str
    state_label: StateLabel
    confidence: float = Field(ge=0.0, le=1.0)
    # FeatureSummary has extra="forbid" — unknown keys are rejected with 422.
    # Raw telemetry fields (keypress content, HTML, screenshots) are structurally
    # excluded because they are not in the allowlist.
    feature_summary: FeatureSummary
    url: str = Field(max_length=2048)
    title: str = Field(max_length=512)


class SuggestionBody(BaseModel):
    type: str
    technique_id: str | None = None
    title: str = ""
    cta: str = ""
    payload: dict[str, Any] = {}


class TransparencyBody(BaseModel):
    why_detected: str
    signals: list[str]
    why_this: str
    user_success_rate: float | None = None


class SessionFlagsBody(BaseModel):
    ignore_count: int
    asleep_flag: bool


class UpdateResponse(BaseModel):
    ori_state: str
    suggestion: SuggestionBody
    transparency_card: TransparencyBody
    session_flags: SessionFlagsBody


# ── /v1/session/end ────────────────────────────────────────────────────────────


class EndRequest(BaseModel):
    session_id: str


class EndResponse(BaseModel):
    ok: bool


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.post(
    "/v1/session/start",
    response_model=StartResponse,
    status_code=201,
    summary="Open a study session",
)
async def session_start(body: StartRequest, user_id: UserId) -> StartResponse:
    """Create a new session record and return its ID."""
    _enforce(_rl_start, user_id)

    storage = get_storage()
    record = storage.create_session(
        user_id=user_id,
        url=body.url,
        title=body.title,
        topic_label=body.topic_label,
    )

    logger.info({"event": "session_started", "session_id": record.session_id})
    return StartResponse(session_id=record.session_id)


@router.post(
    "/v1/session/update",
    response_model=UpdateResponse,
    summary="Ingest behavioural state and receive Ori's policy decision",
    description=(
        "Hot path — called every ~30 s by the extension. "
        "Stores the behavioural event, runs the policy engine, "
        "and returns ori_state + suggestion + transparency card. "
        "Feature values are NOT logged."
    ),
)
async def session_update(body: UpdateRequest, user_id: UserId) -> UpdateResponse:
    _enforce(_rl_update, user_id)

    storage = get_storage()

    # ── 1. Load session for metadata ───────────────────────────────────────────
    session = storage.get_session(user_id, body.session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session {body.session_id!r} not found for this user.",
        )

    # ── 2. Load user profile for technique history + mastery ───────────────────
    profile = storage.get_or_create_user(user_id)

    # ── 3. Run policy engine (pure Python, ~0 ms) ──────────────────────────────
    session_minutes = (datetime.now(UTC) - session.started_at).total_seconds() / 60

    policy_out = evaluate(
        state_label=body.state_label,
        confidence=body.confidence,
        feature_summary=body.feature_summary,
        session_context=SessionContext(
            session_minutes=session_minutes,
            ignore_count=session.ignore_count,
            asleep_flag=session.asleep_flag,
        ),
        user_context=UserContext(
            technique_stats=profile.technique_stats,
            mastery_by_topic=profile.mastery_by_topic,
            modality_pref=profile.modality_pref,
        ),
        topic_label=session.topic_label,
    )

    # ── 4. Persist event with the Ori state the engine decided ─────────────────
    event = SessionEvent(
        state_label=body.state_label,
        confidence=body.confidence,
        url=body.url,
        title=body.title,
        feature_summary=body.feature_summary,
        ori_state=policy_out.ori_state,
        suggestion_type=policy_out.suggestion.type,
        suggestion_id=policy_out.suggestion.technique_id,
    )
    storage.append_session_event(user_id, body.session_id, event)

    # ── 5. Apply sleep flag if policy engine crossed the threshold ─────────────
    if policy_out.should_sleep:
        storage.set_session_flags(user_id, body.session_id, session.ignore_count, True)
        session.asleep_flag = True  # reflect in this response

    # ── 6. Log metadata only — feature values not logged per spec ─────────────
    logger.info(
        {
            "event": "session_updated",
            "session_id": body.session_id,
            "state_label": body.state_label.value,
            "confidence": body.confidence,
            "ori_state": policy_out.ori_state.value,
            "suggestion_type": policy_out.suggestion.type.value,
            "should_sleep": policy_out.should_sleep,
            # feature_summary values intentionally omitted
        }
    )

    return UpdateResponse(
        ori_state=policy_out.ori_state.value,
        suggestion=SuggestionBody(
            type=policy_out.suggestion.type.value,
            technique_id=policy_out.suggestion.technique_id,
            title=policy_out.suggestion.title,
            cta=policy_out.suggestion.cta,
            payload=policy_out.suggestion.payload,
        ),
        transparency_card=TransparencyBody(
            why_detected=policy_out.transparency_card.why_detected,
            signals=policy_out.transparency_card.signals,
            why_this=policy_out.transparency_card.why_this,
            user_success_rate=policy_out.transparency_card.user_success_rate,
        ),
        session_flags=SessionFlagsBody(
            ignore_count=session.ignore_count,
            asleep_flag=session.asleep_flag,
        ),
    )


@router.post(
    "/v1/session/end",
    response_model=EndResponse,
    summary="Close a study session",
)
async def session_end(body: EndRequest, user_id: UserId) -> EndResponse:
    """Mark the session as ended (sets ended_at to now)."""
    _enforce(_rl_end, user_id)

    storage = get_storage()
    storage.end_session(user_id, body.session_id)

    logger.info({"event": "session_ended", "session_id": body.session_id})
    return EndResponse(ok=True)
