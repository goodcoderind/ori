"""
Dashboard aggregation service.

Reads stored aggregates from DynamoDB and computes derived metrics.
No LLM calls are made here — all computation is pure Python over in-memory
model objects loaded from storage.

Loading strategy:
  summary        — 1 profile read + 1 session query + ≤10 full session reads
  sessions_list  — 1 session query (no events) + probe-set reads per session
  session_detail — 1 full session read + N probe-set reads

Pure-Python aggregation functions are defined at module level so they can be
unit-tested independently of any storage layer.

Heatmap time buckets use UTC timestamps (the client adjusts for locale).
  morning   06:00–11:59 UTC
  afternoon 12:00–16:59 UTC
  evening   17:00–21:59 UTC
  night     22:00–05:59 UTC
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from functools import lru_cache

from app.models import (
    MasteryItem,
    ProbeSet,
    SessionRecord,
    SuggestionType,
    UserProfile,
)
from app.storage import get_storage
from app.storage.dynamo import DynamoStorage, _from_decimal, _strip_meta

logger = logging.getLogger("prosocratic.dashboard")

# ── Pure aggregation helpers (all independently testable) ──────────────────────


def compute_focus_distribution(sessions: list[SessionRecord]) -> dict[str, float]:
    """
    Normalized distribution of StateLabel values across all events in *sessions*.

    Counts both live events and rolled-up events (from rolled_up_summary.by_state).
    Returns an empty dict {} when there are no events at all.
    """
    counts: dict[str, int] = {}
    total = 0

    for session in sessions:
        # Live events (bounded list ≤ MAX_EVENTS)
        for event in session.events:
            key = event.state_label.value
            counts[key] = counts.get(key, 0) + 1
            total += 1
        # Rolled-up events
        for key, count in (session.rolled_up_summary.by_state or {}).items():
            counts[key] = counts.get(key, 0) + count
            total += count

    if total == 0:
        return {}

    return {key: round(count / total, 4) for key, count in sorted(counts.items())}


def _heatmap_bucket(ts: datetime) -> str:
    """Classify a UTC datetime into a named time-of-day bucket."""
    h = ts.hour
    if 6 <= h < 12:
        return "morning"
    if 12 <= h < 17:
        return "afternoon"
    if 17 <= h < 22:
        return "evening"
    return "night"


def compute_focus_heatmap(sessions: list[SessionRecord]) -> dict[str, float]:
    """
    Normalized distribution of study activity across four time-of-day buckets.

    Counts every live event.  Returns fractions summing to 1.0 (or {} if no events).
    """
    buckets: dict[str, int] = {"morning": 0, "afternoon": 0, "evening": 0, "night": 0}
    total = 0

    for session in sessions:
        for event in session.events:
            bucket = _heatmap_bucket(event.ts)
            buckets[bucket] += 1
            total += 1

    if total == 0:
        return {b: 0.0 for b in buckets}

    return {b: round(count / total, 4) for b, count in buckets.items()}


def compute_technique_success_rates(profile: UserProfile) -> list[dict]:
    """
    All techniques with at least one recorded attempt, sorted by success_rate descending.
    """
    rows = [
        {
            "technique_id": tid,
            "shown_count": s.shown_count,
            "accepted_count": s.accepted_count,
            "success_count": s.success_count,
            "acceptance_rate": round(s.acceptance_rate, 4),
            "success_rate": round(s.success_rate, 4),
        }
        for tid, s in profile.technique_stats.items()
        if s.shown_count > 0
    ]
    return sorted(rows, key=lambda r: r["success_rate"], reverse=True)


def compute_mastery_map(profile: UserProfile) -> dict[str, dict]:
    """
    Mastery snapshot for each topic, including p_mastery and next_probe_at.
    """
    return {
        topic: {
            "p_mastery": round(item.p_mastery, 4),
            "last_probe_at": item.last_probe_at.isoformat() if item.last_probe_at else None,
            "next_probe_at": item.next_probe_at.isoformat() if item.next_probe_at else None,
        }
        for topic, item in profile.mastery_by_topic.items()
    }


def compute_upcoming_reviews(profile: UserProfile) -> list[dict]:
    """
    Topics with a scheduled next_probe_at, sorted ascending (most urgent first).
    Includes overdue items (next_probe_at in the past) at the top.
    """
    now = datetime.now(UTC)
    upcoming = [
        {
            "topic_label": topic,
            "p_mastery": round(item.p_mastery, 4),
            "next_probe_at": item.next_probe_at.isoformat(),
            "overdue": item.next_probe_at <= now,
        }
        for topic, item in profile.mastery_by_topic.items()
        if item.next_probe_at is not None
    ]
    return sorted(upcoming, key=lambda r: r["next_probe_at"])


def compute_n_nudges(session: SessionRecord) -> int:
    """
    Total suggestion events: live events where suggestion_type != NONE
    plus the rolled-up suggestions_shown counter.
    """
    live = sum(
        1 for e in session.events if e.suggestion_type is not SuggestionType.NONE
    )
    return live + (session.rolled_up_summary.suggestions_shown or 0)


def compute_avg_confidence(session: SessionRecord) -> float | None:
    """Mean classifier confidence across live events.  None if no live events."""
    vals = [e.confidence for e in session.events]
    return round(sum(vals) / len(vals), 4) if vals else None


def compute_avg_microassess_score(probe_sets: list[ProbeSet]) -> float | None:
    """Mean attempt score across all probe sets.  None if no attempts recorded."""
    scores = [a.score_0_1 for ps in probe_sets for a in ps.attempts_meta]
    return round(sum(scores) / len(scores), 4) if scores else None


def compute_duration_seconds(session: SessionRecord) -> int | None:
    """Elapsed seconds between session start and end.  None if session still open."""
    if session.ended_at is None:
        return None
    return max(0, int((session.ended_at - session.started_at).total_seconds()))


def compute_session_row(session: SessionRecord, probe_sets: list[ProbeSet]) -> dict:
    """
    Produce the sessions-list row for one session.
    Callers should pass the full session (with events) for accurate n_nudges and
    avg_confidence; a metadata-only record still produces a valid (partial) row.
    """
    return {
        "session_id": session.session_id,
        "started_at": session.started_at.isoformat(),
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "duration_seconds": compute_duration_seconds(session),
        "topic_label": session.topic_label,
        "n_nudges": compute_n_nudges(session),
        "avg_confidence": compute_avg_confidence(session),
        "avg_microassess_score": compute_avg_microassess_score(probe_sets),
    }


def compute_event_timeline(session: SessionRecord) -> list[dict]:
    """
    Extract the event timeline from a full session record.
    Includes only fields needed for the dashboard — no raw feature values.
    """
    return [
        {
            "ts": event.ts.isoformat(),
            "state_label": event.state_label.value,
            "confidence": round(event.confidence, 4),
            "ori_state": event.ori_state.value,
            "suggestion_type": event.suggestion_type.value,
            "suggestion_id": event.suggestion_id,
        }
        for event in session.events
    ]


# ── Service ────────────────────────────────────────────────────────────────────


class DashboardService:
    """
    Computes dashboard views from DynamoDB stored aggregates.

    Inject a mock storage in tests:
        svc = DashboardService(storage=mock_storage)
    """

    def __init__(self, storage: DynamoStorage | None = None) -> None:
        self._storage = storage or get_storage()

    # ── Private loaders ────────────────────────────────────────────────────────

    def _load_probe_sets(self, user_id: str, probe_set_ids: list[str]) -> list[ProbeSet]:
        """Load each probe set from TABLE_ASSESSMENTS by its ID."""
        results: list[ProbeSet] = []
        for ps_id in probe_set_ids:
            response = self._storage._assessments().get_item(
                Key={"user_id": user_id, "probe_set_id": ps_id}
            )
            item = response.get("Item")
            if item:
                results.append(ProbeSet.model_validate(_from_decimal(_strip_meta(item))))
        return results

    def _load_full_sessions(
        self, user_id: str, meta_sessions: list[SessionRecord], limit: int
    ) -> list[SessionRecord]:
        """Load full session records (with events) for a subset of meta sessions."""
        full: list[SessionRecord] = []
        for meta in meta_sessions[:limit]:
            session = self._storage.get_session(user_id, meta.session_id)
            if session:
                full.append(session)
        return full

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_summary(self, user_id: str) -> dict:
        """
        Aggregated dashboard summary for the user.

        DynamoDB ops: 1 profile read + 1 sessions query + ≤ 10 full session reads.
        """
        profile = self._storage.get_or_create_user(user_id)
        meta_sessions = self._storage.list_sessions(user_id, limit=20)

        # Load full sessions (with events) for heatmap and distribution.
        full_sessions = self._load_full_sessions(user_id, meta_sessions, limit=10)

        return {
            "user_id": user_id,
            "focus_state_distribution": compute_focus_distribution(full_sessions),
            "focus_heatmap": compute_focus_heatmap(full_sessions),
            "technique_success_rates": compute_technique_success_rates(profile),
            "mastery_by_topic": compute_mastery_map(profile),
            "upcoming_reviews": compute_upcoming_reviews(profile),
        }

    def get_sessions_list(self, user_id: str, limit: int = 20) -> list[dict]:
        """
        Per-session summary rows for the sessions list view.

        Loads probe sets (for avg_microassess_score) but NOT full event lists
        for each session, keeping DynamoDB reads bounded.  n_nudges includes
        only events captured in rolled_up_summary; live events require a session
        detail call.

        DynamoDB ops: 1 query + (N × M probe-set reads) where M = len(microassess_ids).
        """
        meta_sessions = self._storage.list_sessions(user_id, limit=limit)
        rows: list[dict] = []

        for meta in meta_sessions:
            probe_sets = self._load_probe_sets(user_id, meta.microassess_ids)
            rows.append(compute_session_row(meta, probe_sets))

        return rows

    def get_session_detail(
        self, user_id: str, session_id: str
    ) -> dict | None:
        """
        Full session detail: event timeline + micro-assessment attempts.

        Returns None if the session is not found.

        DynamoDB ops: 1 full session read + N probe-set reads.
        """
        session = self._storage.get_session(user_id, session_id)
        if session is None:
            return None

        probe_sets = self._load_probe_sets(user_id, session.microassess_ids)

        assessment_groups = [
            {
                "probe_set_id": ps.probe_set_id,
                "topic_label": ps.topic_label,
                "recall_probe": ps.recall_probe,
                "transfer_probe": ps.transfer_probe,
                "attempts": [
                    {
                        "ts": a.ts.isoformat(),
                        "probe_type": a.probe_type,
                        "score_0_1": round(a.score_0_1, 4),
                        "error_type": a.error_type.value,
                    }
                    for a in ps.attempts_meta
                ],
            }
            for ps in probe_sets
        ]

        return {
            "session_id": session.session_id,
            "user_id": session.user_id,
            "started_at": session.started_at.isoformat(),
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            "duration_seconds": compute_duration_seconds(session),
            "topic_label": session.topic_label,
            "n_nudges": compute_n_nudges(session),
            "avg_confidence": compute_avg_confidence(session),
            "avg_microassess_score": compute_avg_microassess_score(probe_sets),
            "event_timeline": compute_event_timeline(session),
            "assessments": assessment_groups,
            "rolled_up_summary": {
                "total_events": session.rolled_up_summary.total_events,
                "by_state": dict(session.rolled_up_summary.by_state or {}),
                "suggestions_shown": session.rolled_up_summary.suggestions_shown,
            },
        }


def get_dashboard_service() -> DashboardService:
    """Factory — call inside route handlers (allows patching in tests)."""
    return DashboardService()
