"""
Tests for app/models.py and app/storage/dynamo.py.

Three test groups:
  1. FeatureSummary — allowlist enforcement (pure model, no DB)
  2. SessionRecord  — bounded events list and rollup behaviour (pure model, no DB)
  3. DynamoStorage  — persistence operations against a mocked boto3 resource

The mock strategy for group 3:
  - Inject MagicMock as the boto3 resource into DynamoStorage(resource=...).
  - All Table(...) calls return a single configurable mock table.
  - Tests assert on the exact data written via put_item / update_item.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, call, patch

import pytest

from app.models import (
    AttemptMeta,
    ErrorType,
    FeatureSummary,
    FEATURE_ALLOWLIST,
    MasteryItem,
    OriState,
    ProbeSet,
    Rubric,
    SessionEvent,
    SessionRecord,
    StateLabel,
    SuggestionType,
    TechniqueStatsEntry,
    UserProfile,
    MAX_EVENTS,
    EVENTS_TRIM_TO,
)
from app.storage.dynamo import DynamoStorage, _from_decimal, _to_decimal, _model_to_item


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_resource() -> MagicMock:
    """A mock boto3 DynamoDB resource where Table(...) always returns one mock table."""
    resource = MagicMock()
    table = MagicMock()
    resource.Table.return_value = table
    # Default get_item returns nothing (item not found).
    table.get_item.return_value = {}
    table.put_item.return_value = {}
    table.update_item.return_value = {}
    table.query.return_value = {"Items": []}
    return resource


@pytest.fixture
def storage(mock_resource: MagicMock) -> DynamoStorage:
    return DynamoStorage(resource=mock_resource)


@pytest.fixture
def mock_table(mock_resource: MagicMock) -> MagicMock:
    """Convenience alias: the Table mock returned by mock_resource.Table(...)."""
    return mock_resource.Table.return_value


def _make_event(
    state: StateLabel = StateLabel.FLOW,
    confidence: float = 0.9,
) -> SessionEvent:
    return SessionEvent(
        state_label=state,
        confidence=confidence,
        url="https://example.com/study",
        title="Study Page",
        feature_summary=FeatureSummary(keystroke_speed=1.5, fatigue_score=0.2),
        ori_state=OriState.IDLE,
        suggestion_type=SuggestionType.NONE,
    )


def _make_user_item(user_id: str = "u-123") -> dict:
    """A raw DynamoDB item (Decimals used for numbers) representing a stored user."""
    return {
        "user_id": user_id,
        "created_at": "2024-01-15T10:00:00+00:00",
        "technique_stats": {},
        "mastery_by_topic": {},
    }


# ══════════════════════════════════════════════════════════════════════════════
# Group 1: FeatureSummary allowlist enforcement
# ══════════════════════════════════════════════════════════════════════════════


class TestFeatureSummaryAllowlist:
    def test_known_keys_accepted(self):
        fs = FeatureSummary(keystroke_speed=1.2, scroll_velocity=3.4)
        assert fs.keystroke_speed == pytest.approx(1.2)
        assert fs.scroll_velocity == pytest.approx(3.4)

    def test_unknown_key_raises_validation_error(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            FeatureSummary(unknown_key=99.9)

    def test_from_partial_rejects_unknown_keys(self):
        with pytest.raises(ValueError, match="Unknown feature key"):
            FeatureSummary.from_partial({"page_html": "some content"})

    def test_from_partial_rejects_multiple_unknown_keys(self):
        with pytest.raises(ValueError, match="Unknown feature key"):
            FeatureSummary.from_partial({"answer_text": "foo", "raw_html": "bar"})

    def test_from_partial_accepts_valid_subset(self):
        data = {"keystroke_speed": 2.1, "idle_gap_s": 5.0}
        fs = FeatureSummary.from_partial(data)
        assert fs.keystroke_speed == pytest.approx(2.1)
        assert fs.idle_gap_s == pytest.approx(5.0)
        assert fs.scroll_velocity is None  # unspecified → None

    def test_to_nonempty_dict_excludes_none(self):
        fs = FeatureSummary(keystroke_speed=1.0, scroll_velocity=None)
        d = fs.to_nonempty_dict()
        assert "keystroke_speed" in d
        assert "scroll_velocity" not in d

    def test_to_nonempty_dict_empty_when_all_none(self):
        fs = FeatureSummary()
        assert fs.to_nonempty_dict() == {}

    def test_allowlist_covers_all_model_fields(self):
        """FEATURE_ALLOWLIST must exactly match the field names in FeatureSummary."""
        model_fields = set(FeatureSummary.model_fields.keys())
        assert model_fields == FEATURE_ALLOWLIST

    def test_bounded_probability_fields(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            FeatureSummary(confusion_confidence=1.5)  # > 1.0

        with pytest.raises(ValidationError):
            FeatureSummary(fatigue_score=-0.1)  # < 0.0

    def test_non_numeric_value_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            FeatureSummary(keystroke_speed="fast")  # type: ignore[arg-type]


# ══════════════════════════════════════════════════════════════════════════════
# Group 2: SessionRecord bounded events + rollup
# ══════════════════════════════════════════════════════════════════════════════


class TestSessionEventCapping:
    def test_events_below_cap_are_stored_verbatim(self):
        session = SessionRecord(user_id="u1", session_id="s1")
        for _ in range(MAX_EVENTS):
            session.append_event(_make_event())

        assert len(session.events) == MAX_EVENTS
        assert session.rolled_up_summary.total_events == 0

    def test_exceeding_cap_triggers_rollup(self):
        session = SessionRecord(user_id="u1", session_id="s1")
        n = MAX_EVENTS + 1
        for _ in range(n):
            session.append_event(_make_event())

        # After rollup, the live list has exactly EVENTS_TRIM_TO items.
        assert len(session.events) == EVENTS_TRIM_TO
        rolled = session.rolled_up_summary.total_events
        # Total accounted for: live events + rolled events = n
        assert len(session.events) + rolled == n

    def test_total_event_count_property_is_always_accurate(self):
        session = SessionRecord(user_id="u1", session_id="s1")
        n = MAX_EVENTS + 50
        for _ in range(n):
            session.append_event(_make_event())

        assert session.total_event_count == n

    def test_rollup_accumulates_state_counts(self):
        """Rolled-up events should be reflected in rolled_up_summary.by_state."""
        session = SessionRecord(user_id="u1", session_id="s1")
        confusion_count = MAX_EVENTS + 1  # all CONFUSION events, triggers rollup

        for _ in range(confusion_count):
            session.append_event(_make_event(state=StateLabel.CONFUSION))

        # All rolled-up events should be CONFUSION.
        by_state = session.rolled_up_summary.by_state
        rolled = session.rolled_up_summary.total_events
        assert rolled > 0
        assert by_state.get("CONFUSION", 0) == rolled

    def test_rollup_counts_suggestions_shown(self):
        """suggestions_shown increments when suggestion_type != NONE is rolled up."""
        session = SessionRecord(user_id="u1", session_id="s1")

        for _ in range(MAX_EVENTS + 1):
            ev = _make_event()
            # Every event has a suggestion so all rolled events should count.
            ev.suggestion_type = SuggestionType.TECHNIQUE
            session.append_event(ev)

        assert session.rolled_up_summary.suggestions_shown > 0

    def test_multiple_rollups_stack_correctly(self):
        """Adding enough events to trigger two rollup cycles."""
        session = SessionRecord(user_id="u1", session_id="s1")
        n = MAX_EVENTS * 2 + 5

        for _ in range(n):
            session.append_event(_make_event())

        assert session.total_event_count == n
        assert len(session.events) <= EVENTS_TRIM_TO

    def test_empty_session_has_zero_counts(self):
        session = SessionRecord(user_id="u1", session_id="s1")
        assert session.total_event_count == 0
        assert session.rolled_up_summary.total_events == 0


# ══════════════════════════════════════════════════════════════════════════════
# Group 3: DynamoStorage persistence (mocked resource)
# ══════════════════════════════════════════════════════════════════════════════


class TestGetOrCreateUser:
    def test_returns_existing_user(self, storage, mock_table):
        user_id = "existing-user"
        mock_table.get_item.return_value = {"Item": _make_user_item(user_id)}

        profile = storage.get_or_create_user(user_id)

        assert profile.user_id == user_id
        mock_table.put_item.assert_not_called()

    def test_creates_new_user_when_not_found(self, storage, mock_table):
        mock_table.get_item.return_value = {}  # not found

        profile = storage.get_or_create_user("new-user")

        assert profile.user_id == "new-user"
        assert mock_table.put_item.called
        stored = mock_table.put_item.call_args.kwargs["Item"]
        assert stored["user_id"] == "new-user"

    def test_new_user_has_empty_stats(self, storage, mock_table):
        mock_table.get_item.return_value = {}

        profile = storage.get_or_create_user("new-user")

        assert profile.technique_stats == {}
        assert profile.mastery_by_topic == {}
        assert profile.modality_pref is None


class TestCreateSession:
    def test_returns_session_with_generated_id(self, storage, mock_table):
        session = storage.create_session("u1", url="https://x.com", title="Page")

        assert session.user_id == "u1"
        assert session.session_id  # non-empty UUID string
        assert session.started_at is not None

    def test_session_is_persisted(self, storage, mock_table):
        storage.create_session("u1", url="https://x.com", title="Page")

        assert mock_table.put_item.called
        item = mock_table.put_item.call_args.kwargs["Item"]
        assert item["user_id"] == "u1"
        assert "expires_at" in item  # TTL must be set

    def test_session_ttl_is_in_future(self, storage, mock_table):
        storage.create_session("u1", url="https://x.com", title="Page")

        item = mock_table.put_item.call_args.kwargs["Item"]
        now_ts = int(datetime.now(UTC).timestamp())
        assert item["expires_at"] > now_ts

    def test_topic_label_stored_when_provided(self, storage, mock_table):
        storage.create_session("u1", url="https://x.com", title="P", topic_label="Biology")

        item = mock_table.put_item.call_args.kwargs["Item"]
        assert item.get("topic_label") == "Biology"


class TestAppendSessionEvent:
    def _stored_session_item(self, session: SessionRecord) -> dict:
        """Serialise a SessionRecord to a DynamoDB item (as the storage layer does)."""
        raw = json.loads(session.model_dump_json(exclude_none=True))
        from app.storage.dynamo import _to_decimal

        return _to_decimal(raw)

    def test_event_appended_to_session(self, storage, mock_table):
        session = SessionRecord(user_id="u1", session_id="s1")
        mock_table.get_item.return_value = {
            "Item": self._stored_session_item(session)
        }

        event = _make_event(state=StateLabel.CONFUSION)
        returned = storage.append_session_event("u1", "s1", event)

        assert len(returned.events) == 1
        assert returned.events[0].state_label == StateLabel.CONFUSION

    def test_raises_when_session_not_found(self, storage, mock_table):
        mock_table.get_item.return_value = {}

        with pytest.raises(ValueError, match="not found"):
            storage.append_session_event("u1", "s1", _make_event())

    def test_rollup_survives_round_trip(self, storage, mock_table):
        """Rollup triggered in memory should be persisted correctly."""
        session = SessionRecord(user_id="u1", session_id="s1")
        for _ in range(MAX_EVENTS):
            session.append_event(_make_event())

        mock_table.get_item.return_value = {
            "Item": self._stored_session_item(session)
        }

        # Adding one more event should trigger rollup.
        storage.append_session_event("u1", "s1", _make_event())

        item = mock_table.put_item.call_args.kwargs["Item"]
        # events list is now EVENTS_TRIM_TO items.
        assert len(item["events"]) == EVENTS_TRIM_TO
        rolled = item["rolled_up_summary"]["total_events"]
        assert rolled == MAX_EVENTS + 1 - EVENTS_TRIM_TO


class TestUpdateMastery:
    def test_mastery_persisted_with_correct_value(self, storage, mock_table):
        mock_table.get_item.return_value = {"Item": _make_user_item("u1")}

        mastery = MasteryItem(p_mastery=0.75)
        storage.update_mastery("u1", "biology/photosynthesis", mastery)

        stored = mock_table.put_item.call_args.kwargs["Item"]
        topic_data = stored["mastery_by_topic"]["biology/photosynthesis"]
        assert float(topic_data["p_mastery"]) == pytest.approx(0.75)

    def test_mastery_overwrites_existing(self, storage, mock_table):
        existing = _make_user_item("u1")
        existing["mastery_by_topic"] = {
            "biology/photosynthesis": {"p_mastery": Decimal("0.3")}
        }
        mock_table.get_item.return_value = {"Item": existing}

        storage.update_mastery(
            "u1", "biology/photosynthesis", MasteryItem(p_mastery=0.85)
        )

        stored = mock_table.put_item.call_args.kwargs["Item"]
        updated = stored["mastery_by_topic"]["biology/photosynthesis"]
        assert float(updated["p_mastery"]) == pytest.approx(0.85)

    def test_mastery_with_timestamps_stored(self, storage, mock_table):
        mock_table.get_item.return_value = {"Item": _make_user_item("u1")}

        now = datetime.now(UTC)
        next_probe = now + timedelta(days=3)
        mastery = MasteryItem(p_mastery=0.6, last_probe_at=now, next_probe_at=next_probe)
        storage.update_mastery("u1", "physics/optics", mastery)

        stored = mock_table.put_item.call_args.kwargs["Item"]
        topic_data = stored["mastery_by_topic"]["physics/optics"]
        # Datetimes are stored as ISO strings.
        assert "last_probe_at" in topic_data
        assert "next_probe_at" in topic_data


class TestUpdateTechniqueStats:
    def test_creates_new_entry_for_unknown_technique(self, storage, mock_table):
        mock_table.get_item.return_value = {"Item": _make_user_item("u1")}

        storage.update_technique_stats("u1", "feynman", shown_delta=1)

        stored = mock_table.put_item.call_args.kwargs["Item"]
        assert "feynman" in stored["technique_stats"]
        assert stored["technique_stats"]["feynman"]["shown_count"] == 1

    def test_increments_existing_entry(self, storage, mock_table):
        existing = _make_user_item("u1")
        existing["technique_stats"] = {
            "feynman": {
                "shown_count": Decimal("3"),
                "accepted_count": Decimal("2"),
                "success_count": Decimal("1"),
                "reward_sum": Decimal("0.5"),
            }
        }
        mock_table.get_item.return_value = {"Item": existing}

        storage.update_technique_stats(
            "u1", "feynman", shown_delta=1, accepted_delta=1, success_delta=1, reward_delta=0.25
        )

        stored = mock_table.put_item.call_args.kwargs["Item"]
        stats = stored["technique_stats"]["feynman"]
        assert stats["shown_count"] == 4
        assert stats["accepted_count"] == 3
        assert stats["success_count"] == 2
        assert float(stats["reward_sum"]) == pytest.approx(0.75)


class TestSaveProbeSet:
    def test_probe_set_persisted(self, storage, mock_table):
        ps = ProbeSet(
            user_id="u1",
            session_id="s1",
            topic_label="Biology",
            recall_probe="What is ATP?",
            transfer_probe="Why do mitochondria need ATP?",
            rubric=Rubric(
                key_points=["ATP is the energy currency"],
                difficulty_tag="introductory",
            ),
        )
        storage.save_probe_set(ps)

        assert mock_table.put_item.called
        item = mock_table.put_item.call_args.kwargs["Item"]
        assert item["user_id"] == "u1"
        assert item["topic_label"] == "Biology"
        assert "expires_at" in item

    def test_probe_set_has_no_answer_text_field(self):
        """ProbeSet must structurally forbid answer_text."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            ProbeSet(
                user_id="u1",
                session_id="s1",
                topic_label="Bio",
                recall_probe="Q?",
                transfer_probe="Q2?",
                rubric=Rubric(key_points=["kp"], difficulty_tag="easy"),
                answer_text="student answer here",  # must be rejected
            )

    def test_probe_set_has_no_page_context_field(self):
        """ProbeSet must structurally forbid page_context."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            ProbeSet(
                user_id="u1",
                session_id="s1",
                topic_label="Bio",
                recall_probe="Q?",
                transfer_probe="Q2?",
                rubric=Rubric(key_points=["kp"], difficulty_tag="easy"),
                page_context="<html>...</html>",  # must be rejected
            )


class TestAppendProbeAttemptMeta:
    def test_atomic_append_called(self, storage, mock_table):
        attempt = AttemptMeta(
            probe_type="recall",
            score_0_1=0.8,
            error_type=ErrorType.CORRECT,
        )
        storage.append_probe_attempt_meta("u1", "ps1", attempt)

        assert mock_table.update_item.called
        kw = mock_table.update_item.call_args.kwargs
        assert kw["Key"] == {"user_id": "u1", "probe_set_id": "ps1"}
        assert "list_append" in kw["UpdateExpression"]

    def test_attempt_score_serialised_as_decimal(self, storage, mock_table):
        attempt = AttemptMeta(
            probe_type="transfer",
            score_0_1=0.65,
            error_type=ErrorType.VAGUE,
        )
        storage.append_probe_attempt_meta("u1", "ps1", attempt)

        kw = mock_table.update_item.call_args.kwargs
        new_attempt = kw["ExpressionAttributeValues"][":new_attempt"][0]
        # score_0_1 should be a Decimal in the payload.
        assert isinstance(new_attempt["score_0_1"], Decimal)
        assert float(new_attempt["score_0_1"]) == pytest.approx(0.65)


class TestDecimalHelpers:
    def test_float_to_decimal(self):
        result = _to_decimal({"score": 0.75, "count": 3})
        assert isinstance(result["score"], Decimal)
        assert result["count"] == 3  # int unchanged

    def test_decimal_to_float(self):
        result = _from_decimal({"score": Decimal("0.75"), "count": Decimal("3")})
        assert result["score"] == pytest.approx(0.75)
        assert result["count"] == 3  # whole-number Decimal → int

    def test_nested_conversion(self):
        nested = _to_decimal({"outer": {"inner": 1.23}})
        assert isinstance(nested["outer"]["inner"], Decimal)

    def test_list_conversion(self):
        result = _to_decimal([1.1, 2.2, {"x": 3.3}])
        assert all(isinstance(v, (Decimal, dict)) for v in result)


class TestDashboardSummary:
    def test_returns_expected_keys(self, storage, mock_table):
        mock_table.get_item.return_value = {"Item": _make_user_item("u1")}
        mock_table.query.return_value = {"Items": []}

        summary = storage.dashboard_summary("u1")

        assert "user_id" in summary
        assert "modality_pref" in summary
        assert "top_techniques" in summary
        assert "mastery_by_topic" in summary
        assert "recent_sessions" in summary

    def test_top_techniques_sorted_by_success_rate(self, storage, mock_table):
        existing = _make_user_item("u1")
        existing["technique_stats"] = {
            "feynman": {
                "shown_count": Decimal("10"),
                "accepted_count": Decimal("8"),
                "success_count": Decimal("6"),
                "reward_sum": Decimal("3.0"),
            },
            "pomodoro": {
                "shown_count": Decimal("10"),
                "accepted_count": Decimal("5"),
                "success_count": Decimal("5"),
                "reward_sum": Decimal("2.5"),
            },
        }
        mock_table.get_item.return_value = {"Item": existing}
        mock_table.query.return_value = {"Items": []}

        summary = storage.dashboard_summary("u1")

        top = summary["top_techniques"]
        assert len(top) == 2
        # pomodoro: success_rate = 5/5 = 1.0 > feynman: 6/8 = 0.75
        assert top[0]["technique_id"] == "pomodoro"
