"""
Tests for dashboard service aggregation and dashboard routes.

Two sections:
  A. Aggregation unit tests — pure Python, no mocking.
     Tests every compute_* helper with hand-crafted model instances.
  B. Route integration tests — TestClient with mocked DashboardService.

Required by spec: tests for aggregation correctness.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import (
    AttemptMeta,
    ErrorType,
    MasteryItem,
    OriState,
    ProbeSet,
    Rubric,
    RolledUpSummary,
    SessionEvent,
    SessionRecord,
    StateLabel,
    SuggestionType,
    TechniqueStatsEntry,
    UserProfile,
)
from app.services.dashboard_service import (
    DashboardService,
    _heatmap_bucket,
    compute_avg_confidence,
    compute_avg_microassess_score,
    compute_duration_seconds,
    compute_event_timeline,
    compute_focus_distribution,
    compute_focus_heatmap,
    compute_mastery_map,
    compute_n_nudges,
    compute_session_row,
    compute_technique_success_rates,
    compute_upcoming_reviews,
)

# ── Constants ──────────────────────────────────────────────────────────────────

_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
_SESSION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
_VALID_HEADERS = {"X-User-Id": _USER_ID}

_SUMMARY_EP = f"/v1/dashboard/summary?user_id={_USER_ID}"
_SESSIONS_EP = f"/v1/dashboard/sessions?user_id={_USER_ID}"
_DETAIL_EP = f"/v1/dashboard/session/{_SESSION_ID}?user_id={_USER_ID}"


# ── Model factories ────────────────────────────────────────────────────────────

def _ts(hour: int, day: int = 1) -> datetime:
    """Build a UTC datetime for a given hour."""
    return datetime(2024, 3, day, hour, 0, 0, tzinfo=UTC)


def _event(
    state: StateLabel = StateLabel.FLOW,
    confidence: float = 0.8,
    suggestion: SuggestionType = SuggestionType.NONE,
    ts: datetime | None = None,
) -> SessionEvent:
    from app.models import FeatureSummary
    return SessionEvent(
        ts=ts or _ts(10),
        state_label=state,
        confidence=confidence,
        url="https://example.com",
        title="Study",
        feature_summary=FeatureSummary(),
        ori_state=OriState.IDLE,
        suggestion_type=suggestion,
    )


def _session(
    events: list[SessionEvent] | None = None,
    rolled_by_state: dict | None = None,
    suggestions_shown: int = 0,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    microassess_ids: list[str] | None = None,
) -> SessionRecord:
    s = SessionRecord(
        user_id=_USER_ID,
        session_id=_SESSION_ID,
        started_at=started_at or _ts(9),
        ended_at=ended_at,
        microassess_ids=microassess_ids or [],
    )
    s.events = events or []
    s.rolled_up_summary = RolledUpSummary(
        total_events=sum((rolled_by_state or {}).values()),
        by_state=rolled_by_state or {},
        suggestions_shown=suggestions_shown,
    )
    return s


def _probe_set(
    ps_id: str = "ps-001",
    scores: list[float] | None = None,
    probe_type: str = "recall",
) -> ProbeSet:
    attempts = [
        AttemptMeta(
            ts=_ts(10),
            probe_type=probe_type,  # type: ignore[arg-type]
            score_0_1=score,
            error_type=ErrorType.CORRECT if score >= 0.8 else ErrorType.VAGUE,
        )
        for score in (scores or [])
    ]
    return ProbeSet(
        user_id=_USER_ID,
        probe_set_id=ps_id,
        session_id=_SESSION_ID,
        topic_label="Biology/ATP",
        recall_probe="What is ATP?",
        transfer_probe="Apply ATP.",
        rubric=Rubric(key_points=["energy currency"], difficulty_tag="med"),
        attempts_meta=attempts,
    )


def _profile(
    technique_stats: dict | None = None,
    mastery: dict | None = None,
) -> UserProfile:
    p = UserProfile(user_id=_USER_ID)
    if technique_stats:
        p.technique_stats = technique_stats
    if mastery:
        p.mastery_by_topic = mastery
    return p


def _stats(shown: int, accepted: int, success: int) -> TechniqueStatsEntry:
    return TechniqueStatsEntry(
        shown_count=shown, accepted_count=accepted,
        success_count=success, reward_sum=0.0,
    )


# ══════════════════════════════════════════════════════════════════════════════
# A. Aggregation unit tests (pure Python)
# ══════════════════════════════════════════════════════════════════════════════


class TestComputeFocusDistribution:

    def test_empty_sessions_returns_empty_dict(self):
        result = compute_focus_distribution([])
        assert result == {}

    def test_single_state_gives_fraction_1(self):
        session = _session(events=[_event(state=StateLabel.FLOW)] * 4)
        result = compute_focus_distribution([session])
        assert result["FLOW"] == pytest.approx(1.0)
        assert sum(result.values()) == pytest.approx(1.0)

    def test_two_states_split_evenly(self):
        session = _session(events=[
            _event(StateLabel.FLOW),
            _event(StateLabel.CONFUSION),
        ])
        result = compute_focus_distribution([session])
        assert result["FLOW"] == pytest.approx(0.5)
        assert result["CONFUSION"] == pytest.approx(0.5)
        assert sum(result.values()) == pytest.approx(1.0)

    def test_sums_to_one_with_mixed_states(self):
        events = [
            _event(StateLabel.FLOW),
            _event(StateLabel.CONFUSION),
            _event(StateLabel.BOREDOM),
            _event(StateLabel.MIND_WANDER),
        ]
        result = compute_focus_distribution([_session(events=events)])
        assert sum(result.values()) == pytest.approx(1.0)

    def test_rolled_up_events_counted(self):
        """rolled_up_summary.by_state contributes to the distribution."""
        session = _session(
            events=[_event(StateLabel.FLOW)],          # 1 live FLOW
            rolled_by_state={"CONFUSION": 3},          # 3 rolled CONFUSION
        )
        result = compute_focus_distribution([session])
        # Total = 4: FLOW=1, CONFUSION=3
        assert result.get("FLOW", 0) == pytest.approx(0.25)
        assert result.get("CONFUSION", 0) == pytest.approx(0.75)
        assert sum(result.values()) == pytest.approx(1.0)

    def test_multiple_sessions_aggregated(self):
        s1 = _session(events=[_event(StateLabel.FLOW)] * 3)
        s2 = _session(events=[_event(StateLabel.CONFUSION)] * 1)
        result = compute_focus_distribution([s1, s2])
        # Total 4 events: FLOW=3, CONFUSION=1
        assert result["FLOW"] == pytest.approx(0.75)
        assert result["CONFUSION"] == pytest.approx(0.25)
        assert sum(result.values()) == pytest.approx(1.0)

    def test_only_rolled_events_no_live(self):
        session = _session(events=[], rolled_by_state={"BOREDOM": 5, "FLOW": 5})
        result = compute_focus_distribution([session])
        assert result.get("BOREDOM", 0) == pytest.approx(0.5)
        assert result.get("FLOW", 0) == pytest.approx(0.5)


class TestHeatmapBucket:

    def test_morning_6am(self):
        assert _heatmap_bucket(_ts(6)) == "morning"

    def test_morning_11am(self):
        assert _heatmap_bucket(_ts(11)) == "morning"

    def test_afternoon_12pm(self):
        assert _heatmap_bucket(_ts(12)) == "afternoon"

    def test_afternoon_4pm(self):
        assert _heatmap_bucket(_ts(16)) == "afternoon"

    def test_evening_5pm(self):
        assert _heatmap_bucket(_ts(17)) == "evening"

    def test_evening_9pm(self):
        assert _heatmap_bucket(_ts(21)) == "evening"

    def test_night_10pm(self):
        assert _heatmap_bucket(_ts(22)) == "night"

    def test_night_midnight(self):
        assert _heatmap_bucket(_ts(0)) == "night"

    def test_night_5am(self):
        assert _heatmap_bucket(_ts(5)) == "night"


class TestComputeFocusHeatmap:

    def test_empty_sessions_returns_zero_buckets(self):
        result = compute_focus_heatmap([])
        assert set(result.keys()) == {"morning", "afternoon", "evening", "night"}
        assert all(v == 0.0 for v in result.values())

    def test_all_morning_events(self):
        session = _session(events=[_event(ts=_ts(9)), _event(ts=_ts(10))])
        result = compute_focus_heatmap([session])
        assert result["morning"] == pytest.approx(1.0)
        assert result["afternoon"] == pytest.approx(0.0)

    def test_heatmap_sums_to_one_when_events_present(self):
        events = [
            _event(ts=_ts(8)),   # morning
            _event(ts=_ts(14)),  # afternoon
            _event(ts=_ts(19)),  # evening
            _event(ts=_ts(23)),  # night
        ]
        result = compute_focus_heatmap([_session(events=events)])
        assert sum(result.values()) == pytest.approx(1.0)
        for bucket in ("morning", "afternoon", "evening", "night"):
            assert result[bucket] == pytest.approx(0.25)

    def test_rolled_events_not_counted_in_heatmap(self):
        """Heatmap is based on live events only (rolled-up lack individual timestamps)."""
        session = _session(
            events=[_event(ts=_ts(9))],   # 1 morning event
            rolled_by_state={"FLOW": 10}, # rolled events have no timestamp → not counted
        )
        result = compute_focus_heatmap([session])
        assert result["morning"] == pytest.approx(1.0)


class TestComputeTechniqueSuccessRates:

    def test_empty_profile_returns_empty_list(self):
        assert compute_technique_success_rates(_profile()) == []

    def test_sorted_by_success_rate_descending(self):
        stats = {
            "feynman": _stats(10, 8, 6),   # success_rate = 6/8 = 0.75
            "chunking": _stats(10, 5, 5),  # success_rate = 5/5 = 1.0
        }
        result = compute_technique_success_rates(_profile(technique_stats=stats))
        assert result[0]["technique_id"] == "chunking"
        assert result[1]["technique_id"] == "feynman"

    def test_techniques_with_zero_shown_excluded(self):
        stats = {
            "feynman": _stats(0, 0, 0),   # never shown
            "pomodoro": _stats(5, 4, 3),
        }
        result = compute_technique_success_rates(_profile(technique_stats=stats))
        ids = [r["technique_id"] for r in result]
        assert "feynman" not in ids
        assert "pomodoro" in ids

    def test_result_contains_required_fields(self):
        stats = {"feynman": _stats(10, 8, 6)}
        row = compute_technique_success_rates(_profile(technique_stats=stats))[0]
        assert "technique_id" in row
        assert "shown_count" in row
        assert "acceptance_rate" in row
        assert "success_rate" in row


class TestComputeUpcomingReviews:

    def test_empty_mastery_returns_empty(self):
        assert compute_upcoming_reviews(_profile()) == []

    def test_topics_without_next_probe_excluded(self):
        mastery = {"bio": MasteryItem(p_mastery=0.5, next_probe_at=None)}
        result = compute_upcoming_reviews(_profile(mastery=mastery))
        assert result == []

    def test_sorted_ascending_by_next_probe_at(self):
        """Most urgent review appears first."""
        now = datetime.now(UTC)
        mastery = {
            "bio": MasteryItem(p_mastery=0.6, next_probe_at=now + timedelta(days=3)),
            "chem": MasteryItem(p_mastery=0.4, next_probe_at=now + timedelta(hours=1)),
        }
        result = compute_upcoming_reviews(_profile(mastery=mastery))
        assert result[0]["topic_label"] == "chem"  # soonest first
        assert result[1]["topic_label"] == "bio"

    def test_overdue_items_flagged(self):
        past = datetime.now(UTC) - timedelta(hours=2)
        mastery = {"bio": MasteryItem(p_mastery=0.3, next_probe_at=past)}
        result = compute_upcoming_reviews(_profile(mastery=mastery))
        assert result[0]["overdue"] is True

    def test_future_items_not_flagged_overdue(self):
        future = datetime.now(UTC) + timedelta(days=2)
        mastery = {"bio": MasteryItem(p_mastery=0.8, next_probe_at=future)}
        result = compute_upcoming_reviews(_profile(mastery=mastery))
        assert result[0]["overdue"] is False

    def test_result_has_required_fields(self):
        future = datetime.now(UTC) + timedelta(days=1)
        mastery = {"bio": MasteryItem(p_mastery=0.6, next_probe_at=future)}
        row = compute_upcoming_reviews(_profile(mastery=mastery))[0]
        assert "topic_label" in row
        assert "p_mastery" in row
        assert "next_probe_at" in row
        assert "overdue" in row


class TestComputeSessionRow:

    def test_duration_seconds_computed(self):
        started = _ts(9)
        ended = _ts(10)  # 1 hour later
        session = _session(started_at=started, ended_at=ended)
        row = compute_session_row(session, [])
        assert row["duration_seconds"] == 3600

    def test_duration_none_for_open_session(self):
        session = _session(started_at=_ts(9), ended_at=None)
        row = compute_session_row(session, [])
        assert row["duration_seconds"] is None

    def test_n_nudges_counts_suggestion_events(self):
        events = [
            _event(suggestion=SuggestionType.TECHNIQUE),
            _event(suggestion=SuggestionType.NONE),
            _event(suggestion=SuggestionType.BREAK),
        ]
        session = _session(events=events)
        row = compute_session_row(session, [])
        assert row["n_nudges"] == 2  # TECHNIQUE + BREAK

    def test_n_nudges_includes_rolled_suggestions(self):
        events = [_event(suggestion=SuggestionType.TECHNIQUE)]
        session = _session(events=events, suggestions_shown=5)
        row = compute_session_row(session, [])
        assert row["n_nudges"] == 6  # 1 live + 5 rolled

    def test_avg_confidence_correct(self):
        events = [_event(confidence=0.6), _event(confidence=0.8), _event(confidence=1.0)]
        session = _session(events=events)
        row = compute_session_row(session, [])
        assert row["avg_confidence"] == pytest.approx(0.8, abs=0.001)

    def test_avg_confidence_none_when_no_events(self):
        session = _session(events=[])
        row = compute_session_row(session, [])
        assert row["avg_confidence"] is None

    def test_avg_microassess_score_correct(self):
        ps = _probe_set(scores=[0.6, 0.8])
        session = _session()
        row = compute_session_row(session, [ps])
        assert row["avg_microassess_score"] == pytest.approx(0.7, abs=0.001)

    def test_avg_microassess_none_when_no_attempts(self):
        row = compute_session_row(_session(), [])
        assert row["avg_microassess_score"] is None

    def test_required_fields_present(self):
        row = compute_session_row(_session(), [])
        for field in ("session_id", "started_at", "duration_seconds", "topic_label",
                      "n_nudges", "avg_confidence", "avg_microassess_score"):
            assert field in row


class TestComputeAvgMicroassessScore:

    def test_single_probe_set_single_attempt(self):
        ps = _probe_set(scores=[0.75])
        result = compute_avg_microassess_score([ps])
        assert result == pytest.approx(0.75)

    def test_multiple_probe_sets_averaged(self):
        ps1 = _probe_set(ps_id="ps1", scores=[1.0])
        ps2 = _probe_set(ps_id="ps2", scores=[0.0])
        result = compute_avg_microassess_score([ps1, ps2])
        assert result == pytest.approx(0.5)

    def test_multiple_attempts_per_probe_set(self):
        ps = _probe_set(scores=[0.4, 0.6, 0.8])
        result = compute_avg_microassess_score([ps])
        assert result == pytest.approx(0.6, abs=0.001)

    def test_empty_probe_sets_returns_none(self):
        assert compute_avg_microassess_score([]) is None

    def test_probe_set_with_no_attempts_returns_none(self):
        ps = _probe_set(scores=[])
        assert compute_avg_microassess_score([ps]) is None


class TestComputeEventTimeline:

    def test_empty_events_returns_empty_list(self):
        assert compute_event_timeline(_session()) == []

    def test_timeline_contains_required_fields(self):
        session = _session(events=[_event()])
        row = compute_event_timeline(session)[0]
        for field in ("ts", "state_label", "confidence", "ori_state", "suggestion_type"):
            assert field in row

    def test_state_label_is_string_value(self):
        session = _session(events=[_event(state=StateLabel.CONFUSION)])
        row = compute_event_timeline(session)[0]
        assert row["state_label"] == "CONFUSION"

    def test_chronological_order_preserved(self):
        events = [
            _event(ts=_ts(9)),
            _event(ts=_ts(10)),
            _event(ts=_ts(11)),
        ]
        session = _session(events=events)
        timeline = compute_event_timeline(session)
        timestamps = [r["ts"] for r in timeline]
        assert timestamps == sorted(timestamps)

    def test_feature_summary_not_in_timeline(self):
        """Raw feature values must not appear in the event timeline."""
        session = _session(events=[_event()])
        row = compute_event_timeline(session)[0]
        assert "feature_summary" not in row


# ══════════════════════════════════════════════════════════════════════════════
# B. Route integration tests (TestClient)
# ══════════════════════════════════════════════════════════════════════════════


def _mock_service(
    summary: dict | None = None,
    sessions: list | None = None,
    detail: dict | None = None,
    detail_none: bool = False,
) -> MagicMock:
    svc = MagicMock()
    svc.get_summary.return_value = summary or {
        "user_id": _USER_ID,
        "focus_state_distribution": {"FLOW": 0.7, "CONFUSION": 0.3},
        "focus_heatmap": {"morning": 1.0, "afternoon": 0.0, "evening": 0.0, "night": 0.0},
        "technique_success_rates": [],
        "mastery_by_topic": {},
        "upcoming_reviews": [],
    }
    svc.get_sessions_list.return_value = sessions or [
        {
            "session_id": _SESSION_ID,
            "started_at": "2024-03-15T09:00:00+00:00",
            "ended_at": "2024-03-15T10:00:00+00:00",
            "duration_seconds": 3600,
            "topic_label": "Biology/ATP",
            "n_nudges": 3,
            "avg_confidence": 0.82,
            "avg_microassess_score": 0.7,
        }
    ]
    if detail_none:
        svc.get_session_detail.return_value = None
    else:
        svc.get_session_detail.return_value = detail or {
            "session_id": _SESSION_ID,
            "user_id": _USER_ID,
            "started_at": "2024-03-15T09:00:00+00:00",
            "ended_at": "2024-03-15T10:00:00+00:00",
            "duration_seconds": 3600,
            "topic_label": "Biology/ATP",
            "n_nudges": 3,
            "avg_confidence": 0.82,
            "avg_microassess_score": 0.7,
            "event_timeline": [
                {
                    "ts": "2024-03-15T09:05:00+00:00",
                    "state_label": "CONFUSION",
                    "confidence": 0.85,
                    "ori_state": "HAS_SOMETHING",
                    "suggestion_type": "TECHNIQUE",
                    "suggestion_id": "feynman",
                }
            ],
            "assessments": [],
            "rolled_up_summary": {"total_events": 0, "by_state": {}, "suggestions_shown": 0},
        }
    return svc


class TestSummaryEndpoint:

    def test_returns_200(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            r = client.get(_SUMMARY_EP, headers=_VALID_HEADERS)
        assert r.status_code == 200

    def test_response_has_required_keys(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            data = client.get(_SUMMARY_EP, headers=_VALID_HEADERS).json()
        for key in ("focus_state_distribution", "focus_heatmap",
                    "technique_success_rates", "mastery_by_topic", "upcoming_reviews"):
            assert key in data

    def test_focus_distribution_is_normalized(self, client):
        """Values in distribution should sum to ~1.0."""
        dist = {"FLOW": 0.7, "CONFUSION": 0.3}
        svc = _mock_service(summary={
            "user_id": _USER_ID,
            "focus_state_distribution": dist,
            "focus_heatmap": {},
            "technique_success_rates": [],
            "mastery_by_topic": {},
            "upcoming_reviews": [],
        })
        with patch("app.routes.dashboard.get_dashboard_service", return_value=svc):
            data = client.get(_SUMMARY_EP, headers=_VALID_HEADERS).json()
        total = sum(data["focus_state_distribution"].values())
        assert total == pytest.approx(1.0)

    def test_missing_auth_returns_4xx(self, client):
        r = client.get(_SUMMARY_EP)
        assert r.status_code in {401, 422}

    def test_user_id_mismatch_returns_403(self, client):
        other_user = "ffffffff-ffff-ffff-ffff-ffffffffffff"
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            r = client.get(
                f"/v1/dashboard/summary?user_id={other_user}",
                headers=_VALID_HEADERS,
            )
        assert r.status_code == 403


class TestSessionsListEndpoint:

    def test_returns_200_list(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            r = client.get(_SESSIONS_EP, headers=_VALID_HEADERS)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_session_row_has_required_fields(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            data = client.get(_SESSIONS_EP, headers=_VALID_HEADERS).json()
        row = data[0]
        for field in ("session_id", "started_at", "duration_seconds",
                      "topic_label", "n_nudges", "avg_confidence", "avg_microassess_score"):
            assert field in row

    def test_limit_query_param_forwarded(self, client):
        svc = _mock_service()
        with patch("app.routes.dashboard.get_dashboard_service", return_value=svc):
            client.get(f"{_SESSIONS_EP}&limit=5", headers=_VALID_HEADERS)
        svc.get_sessions_list.assert_called_once_with(_USER_ID, limit=5)

    def test_user_id_mismatch_returns_403(self, client):
        other = "ffffffff-ffff-ffff-ffff-ffffffffffff"
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            r = client.get(
                f"/v1/dashboard/sessions?user_id={other}",
                headers=_VALID_HEADERS,
            )
        assert r.status_code == 403

    def test_missing_auth_returns_4xx(self, client):
        r = client.get(_SESSIONS_EP)
        assert r.status_code in {401, 422}


class TestSessionDetailEndpoint:

    def test_returns_200(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            r = client.get(_DETAIL_EP, headers=_VALID_HEADERS)
        assert r.status_code == 200

    def test_response_has_event_timeline(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            data = client.get(_DETAIL_EP, headers=_VALID_HEADERS).json()
        assert "event_timeline" in data
        assert isinstance(data["event_timeline"], list)

    def test_response_has_assessments(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            data = client.get(_DETAIL_EP, headers=_VALID_HEADERS).json()
        assert "assessments" in data

    def test_event_timeline_fields(self, client):
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            data = client.get(_DETAIL_EP, headers=_VALID_HEADERS).json()
        event = data["event_timeline"][0]
        for field in ("ts", "state_label", "confidence", "ori_state", "suggestion_type"):
            assert field in event

    def test_not_found_returns_404(self, client):
        with patch(
            "app.routes.dashboard.get_dashboard_service",
            return_value=_mock_service(detail_none=True),
        ):
            r = client.get(_DETAIL_EP, headers=_VALID_HEADERS)
        assert r.status_code == 404

    def test_user_id_mismatch_returns_403(self, client):
        other = "ffffffff-ffff-ffff-ffff-ffffffffffff"
        with patch("app.routes.dashboard.get_dashboard_service", return_value=_mock_service()):
            r = client.get(
                f"/v1/dashboard/session/{_SESSION_ID}?user_id={other}",
                headers=_VALID_HEADERS,
            )
        assert r.status_code == 403

    def test_missing_auth_returns_4xx(self, client):
        r = client.get(_DETAIL_EP)
        assert r.status_code in {401, 422}

    def test_404_uses_error_envelope(self, client):
        with patch(
            "app.routes.dashboard.get_dashboard_service",
            return_value=_mock_service(detail_none=True),
        ):
            r = client.get(_DETAIL_EP, headers=_VALID_HEADERS)
        err = r.json()
        assert "error" in err
        assert err["error"]["code"] == "HTTP_404"
