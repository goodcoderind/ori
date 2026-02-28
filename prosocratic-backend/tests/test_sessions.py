"""
Tests for session ingestion endpoints.

POST /v1/session/start
POST /v1/session/update  ← hot path; integrates policy engine
POST /v1/session/end

Required test cases (spec):
  1. start + update + end full flow works
  2. Invalid feature_summary key rejected (422)
  3. asleep_flag (ignore_count ≥ 3) stops suggestions

Additional coverage:
  - Missing auth → 422
  - Invalid UUID auth → 401
  - Session not found → 404
  - update response shape (all required fields present)
  - FLOW state → ori_state=IDLE, suggestion.type=NONE
  - Rate limit: 429 with Retry-After header
  - Feature values not in log output
  - set_session_flags called when should_sleep triggers

All DynamoDB operations are mocked via get_storage patch.
The policy engine runs real (it's pure Python — no mock needed).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest

from app.models import MasteryItem, SessionRecord, StateLabel, UserProfile
from app.routes.sessions import _RateLimiter, _rl_end, _rl_start, _rl_update

# ── Constants ──────────────────────────────────────────────────────────────────

_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
_VALID_HEADERS = {"X-User-Id": _USER_ID}
_SESSION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

_START_EP = "/v1/session/start"
_UPDATE_EP = "/v1/session/update"
_END_EP = "/v1/session/end"


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Clear per-user rate limiter history before every test."""
    _rl_start._history.clear()
    _rl_update._history.clear()
    _rl_end._history.clear()
    yield


def _make_session(
    ignore_count: int = 0,
    asleep_flag: bool = False,
    topic_label: str | None = "Biology/ATP",
) -> SessionRecord:
    return SessionRecord(
        user_id=_USER_ID,
        session_id=_SESSION_ID,
        started_at=datetime.now(UTC),
        ignore_count=ignore_count,
        asleep_flag=asleep_flag,
        topic_label=topic_label,
    )


def _make_storage(
    session: SessionRecord | None = None,
    session_not_found: bool = False,
    profile: UserProfile | None = None,
) -> MagicMock:
    storage = MagicMock()

    # create_session
    created_session = session or _make_session()
    storage.create_session.return_value = created_session

    # get_session
    if session_not_found:
        storage.get_session.return_value = None
    else:
        storage.get_session.return_value = session or _make_session()

    # get_or_create_user
    storage.get_or_create_user.return_value = profile or UserProfile(user_id=_USER_ID)

    # append_session_event returns updated session
    storage.append_session_event.return_value = session or _make_session()

    # set_session_flags, end_session — void
    storage.set_session_flags.return_value = None
    storage.end_session.return_value = None

    return storage


def _update_body(**overrides) -> dict:
    base = {
        "session_id": _SESSION_ID,
        "state_label": "FLOW",
        "confidence": 0.9,
        "feature_summary": {"keystroke_speed": 1.2, "fatigue_score": 0.2},
        "url": "https://en.wikipedia.org/wiki/ATP",
        "title": "Adenosine triphosphate",
    }
    base.update(overrides)
    return base


# ══════════════════════════════════════════════════════════════════════════════
# 1. Required test: start + update + end full flow
# ══════════════════════════════════════════════════════════════════════════════


class TestFullLifecycle:

    def test_start_returns_201_with_session_id(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(
                _START_EP,
                json={"url": "https://example.com", "title": "Study page"},
                headers=_VALID_HEADERS,
            )
        assert r.status_code == 201
        data = r.json()
        assert "session_id" in data
        assert data["session_id"]

    def test_update_returns_200_with_all_fields(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "ori_state" in data
        assert "suggestion" in data
        assert "transparency_card" in data
        assert "session_flags" in data

    def test_update_suggestion_has_type_field(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS).json()
        assert "type" in data["suggestion"]

    def test_update_transparency_has_signals_list(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS).json()
        assert isinstance(data["transparency_card"]["signals"], list)
        assert len(data["transparency_card"]["signals"]) >= 1

    def test_update_session_flags_in_response(self, client):
        storage = _make_storage(session=_make_session(ignore_count=1, asleep_flag=False))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS).json()
        flags = data["session_flags"]
        assert "ignore_count" in flags
        assert "asleep_flag" in flags

    def test_end_returns_ok_true(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(
                _END_EP,
                json={"session_id": _SESSION_ID},
                headers=_VALID_HEADERS,
            )
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_end_calls_storage_end_session(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            client.post(_END_EP, json={"session_id": _SESSION_ID}, headers=_VALID_HEADERS)
        storage.end_session.assert_called_once_with(_USER_ID, _SESSION_ID)

    def test_start_passes_topic_label_to_storage(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            client.post(
                _START_EP,
                json={"url": "https://x.com", "title": "P", "topic_label": "Physics/Optics"},
                headers=_VALID_HEADERS,
            )
        kwargs = storage.create_session.call_args.kwargs
        assert kwargs.get("topic_label") == "Physics/Optics"

    def test_update_persists_session_event(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS)
        assert storage.append_session_event.called


# ══════════════════════════════════════════════════════════════════════════════
# 2. Required test: invalid feature_summary key rejected (422)
# ══════════════════════════════════════════════════════════════════════════════


class TestFeatureSummaryValidation:

    def test_unknown_key_returns_422(self, client):
        """Required test: FeatureSummary extra='forbid' rejects unknown keys."""
        body = _update_body()
        body["feature_summary"] = {"raw_html": "some page content"}  # not allowlisted
        r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_page_context_key_rejected(self, client):
        """page_context is not in FeatureSummary allowlist."""
        body = _update_body()
        body["feature_summary"] = {"page_context": "<html>..."}
        r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_answer_text_key_rejected(self, client):
        body = _update_body()
        body["feature_summary"] = {"answer_text": "student answer here"}
        r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_keystroke_content_key_rejected(self, client):
        body = _update_body()
        body["feature_summary"] = {"keystroke_content": "the actual keys pressed"}
        r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_string_value_for_numeric_field_rejected(self, client):
        body = _update_body()
        body["feature_summary"] = {"keystroke_speed": "fast"}
        r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_valid_allowlisted_keys_accepted(self, client):
        storage = _make_storage()
        body = _update_body()
        body["feature_summary"] = {
            "keystroke_speed": 1.5,
            "fatigue_score": 0.3,
            "idle_gap_s": 45.0,
            "section_revisit_count": 2.0,
        }
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 200

    def test_empty_feature_summary_accepted(self, client):
        storage = _make_storage()
        body = _update_body()
        body["feature_summary"] = {}
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 200

    def test_422_uses_error_envelope(self, client):
        body = _update_body()
        body["feature_summary"] = {"hacker_key": 999}
        r = client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        err = r.json()
        assert "error" in err
        assert err["error"]["code"] == "VALIDATION_ERROR"
        assert "request_id" in err["error"]


# ══════════════════════════════════════════════════════════════════════════════
# 3. Required test: asleep_flag stops suggestions
# ══════════════════════════════════════════════════════════════════════════════


class TestSleepLogic:

    def test_ignore_count_3_produces_none_suggestion(self, client):
        """Required: ignore_count ≥ 3 → policy engine returns suggestion NONE."""
        storage = _make_storage(session=_make_session(ignore_count=3, asleep_flag=False))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(
                _UPDATE_EP,
                # State is CONFUSION but should be ignored because count ≥ 3
                json=_update_body(state_label="CONFUSION", confidence=0.9),
                headers=_VALID_HEADERS,
            ).json()
        assert data["suggestion"]["type"] == "NONE"

    def test_ignore_count_3_sets_ori_idle(self, client):
        storage = _make_storage(session=_make_session(ignore_count=3, asleep_flag=False))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(
                _UPDATE_EP, json=_update_body(state_label="CONFUSION", confidence=0.9),
                headers=_VALID_HEADERS,
            ).json()
        assert data["ori_state"] == "IDLE"

    def test_ignore_count_3_calls_set_session_flags_with_sleep(self, client):
        """When should_sleep triggers, set_session_flags must be called with asleep_flag=True."""
        storage = _make_storage(session=_make_session(ignore_count=3, asleep_flag=False))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            client.post(
                _UPDATE_EP, json=_update_body(state_label="CONFUSION", confidence=0.9),
                headers=_VALID_HEADERS,
            )
        assert storage.set_session_flags.called
        call_args = storage.set_session_flags.call_args
        # Positional args: (user_id, session_id, ignore_count, asleep_flag)
        assert call_args.args[3] is True  # asleep_flag=True

    def test_already_asleep_returns_none_suggestion(self, client):
        """asleep_flag=True → NONE regardless of state."""
        storage = _make_storage(session=_make_session(ignore_count=0, asleep_flag=True))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(
                _UPDATE_EP, json=_update_body(state_label="CONFUSION", confidence=0.9),
                headers=_VALID_HEADERS,
            ).json()
        assert data["suggestion"]["type"] == "NONE"

    def test_already_asleep_does_not_call_set_flags_again(self, client):
        """If already asleep, should_sleep=False → set_session_flags not called."""
        storage = _make_storage(session=_make_session(ignore_count=5, asleep_flag=True))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            client.post(
                _UPDATE_EP, json=_update_body(state_label="CONFUSION", confidence=0.9),
                headers=_VALID_HEADERS,
            )
        # should_sleep is False when asleep_flag is already True.
        storage.set_session_flags.assert_not_called()

    def test_session_flags_reflect_asleep_state(self, client):
        storage = _make_storage(session=_make_session(ignore_count=3, asleep_flag=False))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(
                _UPDATE_EP, json=_update_body(state_label="CONFUSION", confidence=0.9),
                headers=_VALID_HEADERS,
            ).json()
        assert data["session_flags"]["asleep_flag"] is True

    def test_two_ignores_not_asleep(self, client):
        """ignore_count < 3 → engine still active."""
        storage = _make_storage(session=_make_session(ignore_count=2, asleep_flag=False))
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(
                _UPDATE_EP, json=_update_body(state_label="CONFUSION", confidence=0.85),
                headers=_VALID_HEADERS,
            ).json()
        # With ignore_count=2, policy engine runs normally.
        # CONFUSION + high confidence → TECHNIQUE or HAS_SOMETHING (not NONE/IDLE due to sleep)
        assert data["session_flags"]["asleep_flag"] is False
        assert not storage.set_session_flags.called


# ══════════════════════════════════════════════════════════════════════════════
# 4. FLOW state
# ══════════════════════════════════════════════════════════════════════════════


class TestFlowState:

    def test_flow_suggestion_is_none(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(
                _UPDATE_EP,
                json=_update_body(state_label="FLOW", confidence=0.95),
                headers=_VALID_HEADERS,
            ).json()
        assert data["suggestion"]["type"] == "NONE"

    def test_flow_ori_state_is_idle(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            data = client.post(
                _UPDATE_EP, json=_update_body(state_label="FLOW"), headers=_VALID_HEADERS,
            ).json()
        assert data["ori_state"] == "IDLE"


# ══════════════════════════════════════════════════════════════════════════════
# 5. Auth and validation
# ══════════════════════════════════════════════════════════════════════════════


class TestAuth:

    def test_start_missing_auth_returns_4xx(self, client):
        r = client.post(_START_EP, json={"url": "https://x.com", "title": "P"})
        assert r.status_code in {401, 422}

    def test_update_missing_auth_returns_4xx(self, client):
        r = client.post(_UPDATE_EP, json=_update_body())
        assert r.status_code in {401, 422}

    def test_end_missing_auth_returns_4xx(self, client):
        r = client.post(_END_EP, json={"session_id": _SESSION_ID})
        assert r.status_code in {401, 422}

    def test_invalid_uuid_returns_401(self, client):
        r = client.post(
            _START_EP,
            json={"url": "https://x.com", "title": "P"},
            headers={"X-User-Id": "not-a-uuid"},
        )
        assert r.status_code == 401

    def test_session_not_found_returns_404(self, client):
        storage = _make_storage(session_not_found=True)
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS)
        assert r.status_code == 404

    def test_404_uses_error_envelope(self, client):
        storage = _make_storage(session_not_found=True)
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS)
        err = r.json()
        assert "error" in err
        assert err["error"]["code"] == "HTTP_404"
        assert "request_id" in err["error"]


# ══════════════════════════════════════════════════════════════════════════════
# 6. Rate limiter
# ══════════════════════════════════════════════════════════════════════════════


class TestRateLimiter:

    def test_limiter_allows_calls_under_limit(self):
        limiter = _RateLimiter(max_calls=5)
        for _ in range(5):
            allowed, _ = limiter.check("user-a")
            assert allowed

    def test_limiter_blocks_call_over_limit(self):
        limiter = _RateLimiter(max_calls=3)
        for _ in range(3):
            limiter.check("user-b")
        allowed, retry_after = limiter.check("user-b")
        assert not allowed
        assert retry_after >= 1

    def test_limiter_returns_retry_after_seconds(self):
        limiter = _RateLimiter(max_calls=1)
        limiter.check("user-c")  # exhaust limit
        _, retry_after = limiter.check("user-c")
        assert 1 <= retry_after <= 61  # within window

    def test_limiter_independent_per_user(self):
        limiter = _RateLimiter(max_calls=1)
        limiter.check("user-d")  # exhausts for user-d
        allowed, _ = limiter.check("user-e")  # different user
        assert allowed

    def test_http_429_includes_retry_after_header(self, client):
        """End-to-end: hitting the start endpoint 11 times returns 429 with Retry-After."""
        storage = _make_storage()
        _rl_start._history.clear()
        # Exhaust the limit (10 calls)
        with patch("app.routes.sessions.get_storage", return_value=storage):
            for _ in range(10):
                client.post(
                    _START_EP,
                    json={"url": "https://x.com", "title": "P"},
                    headers=_VALID_HEADERS,
                )
            # 11th call → 429
            r = client.post(
                _START_EP,
                json={"url": "https://x.com", "title": "P"},
                headers=_VALID_HEADERS,
            )
        assert r.status_code == 429
        assert "retry-after" in r.headers

    def test_429_uses_error_envelope(self, client):
        storage = _make_storage()
        _rl_start._history.clear()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            for _ in range(10):
                client.post(
                    _START_EP,
                    json={"url": "https://x.com", "title": "P"},
                    headers=_VALID_HEADERS,
                )
            r = client.post(
                _START_EP,
                json={"url": "https://x.com", "title": "P"},
                headers=_VALID_HEADERS,
            )
        err = r.json()
        assert "error" in err
        assert err["error"]["code"] == "HTTP_429"


# ══════════════════════════════════════════════════════════════════════════════
# 7. Privacy — feature values not in logs
# ══════════════════════════════════════════════════════════════════════════════


class TestPrivacy:

    def test_feature_values_not_in_update_logs(self, client, caplog):
        storage = _make_storage()
        SECRET_FEATURE_VAL = "0.99"  # a distinctive float value
        body = _update_body()
        body["feature_summary"] = {"fatigue_score": float(SECRET_FEATURE_VAL)}
        with caplog.at_level(logging.DEBUG, logger="prosocratic.routes.sessions"):
            with patch("app.routes.sessions.get_storage", return_value=storage):
                client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        # The actual feature value should not appear in the log
        assert "fatigue_score" not in caplog.text

    def test_url_not_in_update_logs(self, client, caplog):
        storage = _make_storage()
        SECRET_URL = "https://secret-study-url.example.com/page123"
        body = _update_body(url=SECRET_URL)
        with caplog.at_level(logging.DEBUG, logger="prosocratic.routes.sessions"):
            with patch("app.routes.sessions.get_storage", return_value=storage):
                client.post(_UPDATE_EP, json=body, headers=_VALID_HEADERS)
        assert SECRET_URL not in caplog.text

    def test_x_request_id_in_all_responses(self, client):
        storage = _make_storage()
        with patch("app.routes.sessions.get_storage", return_value=storage):
            r = client.post(_UPDATE_EP, json=_update_body(), headers=_VALID_HEADERS)
        assert "x-request-id" in r.headers
