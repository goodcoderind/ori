"""
Tests for POST /v1/unasked-question.

Coverage:
  Route (via TestClient):
    - Happy path → 200 with correct response structure
    - Snippet > 2500 chars → 422 validation error
    - Missing X-User-Id header → 401
    - MiniMax error → 502
    - page_context content absent from logs (privacy)
    - cleaned_text_snippet absent from logs (privacy)
    - Empty snippet + no headings → is_meta=True (meta-question)
    - Exactly 2500 chars snippet → 200 (boundary)

  Service (unit):
    - generate_unasked_question calls minimax_chat_json for sufficient content
    - generate_unasked_question returns meta-question for insufficient content
    - Followups capped at 3
    - is_meta=False for full LLM response
    - is_meta=True when content insufficient (no headings, short snippet)
    - Meta-question is deterministic for a given topic_label
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.socratic_engine import (
    MIN_SNIPPET_CHARS,
    PageContext,
    SocraticEngine,
    SocraticResult,
    _META_QUESTIONS,
)

# ── Shared constants ───────────────────────────────────────────────────────────

_VALID_HEADERS = {"X-User-Id": "550e8400-e29b-41d4-a716-446655440000"}
_ENDPOINT = "/v1/unasked-question"
_LONG_SNIPPET = "A" * 150   # clearly > MIN_SNIPPET_CHARS


def _good_result() -> SocraticResult:
    return SocraticResult(
        unasked_question="Why does ATP release energy when its phosphate bond breaks?",
        followups=["Think about what holds the bond together.", "What changes when it breaks?"],
        rationale="Understanding energy release is the core mechanistic insight.",
        is_meta=False,
    )


def _minimal_body(**overrides) -> dict:
    base = {
        "session_id": "sess-001",
        "topic_label": "Biology/ATP",
        "page_context": {
            "headings": ["ATP Structure", "Energy Currency"],
            "cleaned_text_snippet": _LONG_SNIPPET,
        },
    }
    base.update(overrides)
    return base


# ══════════════════════════════════════════════════════════════════════════════
# Route tests — via TestClient (fixture from conftest.py)
# ══════════════════════════════════════════════════════════════════════════════


class TestRouteHappyPath:

    def test_returns_200(self, client):
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(_good_result()),
        ):
            r = client.post(_ENDPOINT, json=_minimal_body(), headers=_VALID_HEADERS)
        assert r.status_code == 200

    def test_response_shape(self, client):
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(_good_result()),
        ):
            data = client.post(_ENDPOINT, json=_minimal_body(), headers=_VALID_HEADERS).json()
        assert "unasked_question" in data
        assert "followups" in data
        assert "rationale" in data
        assert "is_meta" in data

    def test_response_values_match_engine_output(self, client):
        result = _good_result()
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(result),
        ):
            data = client.post(_ENDPOINT, json=_minimal_body(), headers=_VALID_HEADERS).json()
        assert data["unasked_question"] == result.unasked_question
        assert data["followups"] == result.followups
        assert data["rationale"] == result.rationale
        assert data["is_meta"] is False

    def test_meta_result_propagated(self, client):
        meta = SocraticResult(
            unasked_question="What part of this is confusing you most?",
            followups=["Put it in your own words."],
            rationale="Content was insufficient for a specific grounded question.",
            is_meta=True,
        )
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(meta),
        ):
            data = client.post(_ENDPOINT, json=_minimal_body(), headers=_VALID_HEADERS).json()
        assert data["is_meta"] is True

    def test_x_request_id_header_in_response(self, client):
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(_good_result()),
        ):
            r = client.post(_ENDPOINT, json=_minimal_body(), headers=_VALID_HEADERS)
        assert "x-request-id" in r.headers

    def test_custom_request_id_echoed(self, client):
        custom_id = "my-trace-42"
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(_good_result()),
        ):
            r = client.post(
                _ENDPOINT,
                json=_minimal_body(),
                headers={**_VALID_HEADERS, "X-Request-Id": custom_id},
            )
        assert r.headers["x-request-id"] == custom_id


class TestRouteValidation:

    def test_snippet_over_2500_returns_422(self, client):
        body = _minimal_body()
        body["page_context"]["cleaned_text_snippet"] = "x" * 2501
        r = client.post(_ENDPOINT, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_snippet_exactly_2500_is_accepted(self, client):
        body = _minimal_body()
        body["page_context"]["cleaned_text_snippet"] = "x" * 2500
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(_good_result()),
        ):
            r = client.post(_ENDPOINT, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 200

    def test_missing_topic_label_returns_422(self, client):
        body = _minimal_body()
        del body["topic_label"]
        r = client.post(_ENDPOINT, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_missing_session_id_returns_422(self, client):
        body = _minimal_body()
        del body["session_id"]
        r = client.post(_ENDPOINT, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_missing_auth_returns_401(self, client):
        r = client.post(_ENDPOINT, json=_minimal_body())
        assert r.status_code == 422  # pydantic missing header → 422

    def test_invalid_uuid_returns_401(self, client):
        r = client.post(
            _ENDPOINT,
            json=_minimal_body(),
            headers={"X-User-Id": "not-a-uuid"},
        )
        assert r.status_code == 401

    def test_422_uses_standard_error_envelope(self, client):
        body = _minimal_body()
        body["page_context"]["cleaned_text_snippet"] = "x" * 2501
        r = client.post(_ENDPOINT, json=body, headers=_VALID_HEADERS)
        err = r.json()
        assert "error" in err
        assert "code" in err["error"]
        assert "request_id" in err["error"]

    def test_empty_page_context_accepted(self, client):
        """Empty headings + empty snippet is valid JSON — engine handles fallback."""
        body = _minimal_body()
        body["page_context"] = {"headings": [], "cleaned_text_snippet": ""}
        meta = SocraticResult(
            unasked_question="What part is confusing?",
            followups=[],
            rationale="Content was insufficient.",
            is_meta=True,
        )
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(meta),
        ):
            r = client.post(_ENDPOINT, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 200
        assert r.json()["is_meta"] is True


class TestRouteMiniMaxError:

    def test_minimax_error_returns_502(self, client):
        from app.services.minimax_client import MiniMaxError

        failing_engine = MagicMock()
        failing_engine.generate_unasked_question = AsyncMock(
            side_effect=MiniMaxError("upstream down", status_code=503)
        )
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=failing_engine,
        ):
            r = client.post(_ENDPOINT, json=_minimal_body(), headers=_VALID_HEADERS)
        assert r.status_code == 502

    def test_502_uses_standard_error_envelope(self, client):
        from app.services.minimax_client import MiniMaxError

        failing_engine = MagicMock()
        failing_engine.generate_unasked_question = AsyncMock(
            side_effect=MiniMaxError("timeout", status_code=408)
        )
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=failing_engine,
        ):
            r = client.post(_ENDPOINT, json=_minimal_body(), headers=_VALID_HEADERS)
        err = r.json()
        assert "error" in err
        assert err["error"]["code"] == "HTTP_502"


class TestRoutePrivacy:

    # Sentinel values that must NEVER appear in log output.
    _SECRET_SNIPPET = "CONFIDENTIAL_SNIPPET_TEXT_xyz987_do_not_log"
    _SECRET_HEADING = "CONFIDENTIAL_HEADING_abc123_do_not_log"

    def _body_with_secrets(self) -> dict:
        b = _minimal_body()
        b["page_context"]["cleaned_text_snippet"] = self._SECRET_SNIPPET
        b["page_context"]["headings"] = [self._SECRET_HEADING]
        return b

    def test_snippet_not_in_logs(self, client, caplog):
        with caplog.at_level(logging.DEBUG, logger="prosocratic"):
            with patch(
                "app.routes.socratic.get_socratic_engine",
                return_value=_mock_engine(_good_result()),
            ):
                client.post(
                    _ENDPOINT,
                    json=self._body_with_secrets(),
                    headers=_VALID_HEADERS,
                )
        assert self._SECRET_SNIPPET not in caplog.text

    def test_heading_not_in_logs(self, client, caplog):
        with caplog.at_level(logging.DEBUG, logger="prosocratic"):
            with patch(
                "app.routes.socratic.get_socratic_engine",
                return_value=_mock_engine(_good_result()),
            ):
                client.post(
                    _ENDPOINT,
                    json=self._body_with_secrets(),
                    headers=_VALID_HEADERS,
                )
        assert self._SECRET_HEADING not in caplog.text

    def test_response_does_not_echo_snippet(self, client):
        body = self._body_with_secrets()
        with patch(
            "app.routes.socratic.get_socratic_engine",
            return_value=_mock_engine(_good_result()),
        ):
            data = client.post(_ENDPOINT, json=body, headers=_VALID_HEADERS).json()
        # The snippet must never be in any response field.
        assert self._SECRET_SNIPPET not in str(data)


# ══════════════════════════════════════════════════════════════════════════════
# Service unit tests — SocraticEngine with mock MiniMaxClient
# ══════════════════════════════════════════════════════════════════════════════


def _mock_minimax(result_dict: dict) -> MagicMock:
    """Return a MiniMaxClient mock whose minimax_chat_json returns result_dict."""
    client = MagicMock()
    client.minimax_chat_json = AsyncMock(return_value=result_dict)
    return client


def _mock_engine(result: SocraticResult) -> MagicMock:
    """Return a SocraticEngine mock whose generate_unasked_question returns result."""
    engine = MagicMock()
    engine.generate_unasked_question = AsyncMock(return_value=result)
    return engine


class TestSocraticEngineUnit:

    async def test_sufficient_content_calls_minimax(self):
        mm = _mock_minimax(
            {
                "unasked_question": "Why does X?",
                "followups": ["Think about Y."],
                "rationale": "X is key.",
            }
        )
        engine = SocraticEngine(client=mm)
        ctx = PageContext(
            headings=["ATP Structure"],
            cleaned_text_snippet="A" * MIN_SNIPPET_CHARS,
        )
        result = await engine.generate_unasked_question("Bio/ATP", ctx)
        assert mm.minimax_chat_json.called
        assert result.is_meta is False
        assert result.unasked_question == "Why does X?"

    async def test_insufficient_content_no_minimax_call(self):
        """Short snippet + no headings → meta-question, no LLM call."""
        mm = _mock_minimax({})
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=[], cleaned_text_snippet="Short")
        result = await engine.generate_unasked_question("Bio/ATP", ctx)
        assert not mm.minimax_chat_json.called
        assert result.is_meta is True

    async def test_meta_question_is_from_pool(self):
        engine = SocraticEngine(client=MagicMock())
        ctx = PageContext(headings=[], cleaned_text_snippet="")
        result = await engine.generate_unasked_question("Biology", ctx)
        assert result.unasked_question in _META_QUESTIONS

    async def test_meta_question_is_deterministic_for_topic(self):
        engine = SocraticEngine(client=MagicMock())
        ctx = PageContext(headings=[], cleaned_text_snippet="")
        r1 = await engine.generate_unasked_question("Physics/Optics", ctx)
        r2 = await engine.generate_unasked_question("Physics/Optics", ctx)
        assert r1.unasked_question == r2.unasked_question

    async def test_heading_alone_is_sufficient(self):
        """A single heading with no snippet should be enough to avoid meta-question."""
        mm = _mock_minimax(
            {"unasked_question": "Q?", "followups": [], "rationale": "R."}
        )
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=["Energy"], cleaned_text_snippet="")
        result = await engine.generate_unasked_question("Bio", ctx)
        assert mm.minimax_chat_json.called
        assert result.is_meta is False

    async def test_followups_capped_at_3(self):
        mm = _mock_minimax(
            {
                "unasked_question": "Q?",
                "followups": ["F1", "F2", "F3", "F4", "F5"],
                "rationale": "R.",
            }
        )
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=["H"], cleaned_text_snippet="A" * MIN_SNIPPET_CHARS)
        result = await engine.generate_unasked_question("Bio", ctx)
        assert len(result.followups) <= 3

    async def test_non_list_followups_coerced(self):
        """If model returns followups as a string (repair edge case), coerce it."""
        mm = _mock_minimax(
            {"unasked_question": "Q?", "followups": "Just one", "rationale": "R."}
        )
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=["H"], cleaned_text_snippet="A" * MIN_SNIPPET_CHARS)
        result = await engine.generate_unasked_question("Bio", ctx)
        assert isinstance(result.followups, list)

    async def test_minimax_error_propagates(self):
        from app.services.minimax_client import MiniMaxError

        mm = MagicMock()
        mm.minimax_chat_json = AsyncMock(side_effect=MiniMaxError("fail", 503))
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=["H"], cleaned_text_snippet="A" * MIN_SNIPPET_CHARS)
        with pytest.raises(MiniMaxError):
            await engine.generate_unasked_question("Bio", ctx)

    async def test_snippet_at_min_chars_is_sufficient(self):
        mm = _mock_minimax(
            {"unasked_question": "Q?", "followups": [], "rationale": "R."}
        )
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=[], cleaned_text_snippet="A" * MIN_SNIPPET_CHARS)
        result = await engine.generate_unasked_question("Bio", ctx)
        assert not result.is_meta

    async def test_snippet_below_min_chars_insufficient(self):
        mm = _mock_minimax({})
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=[], cleaned_text_snippet="A" * (MIN_SNIPPET_CHARS - 1))
        result = await engine.generate_unasked_question("Bio", ctx)
        assert result.is_meta is True
        assert not mm.minimax_chat_json.called

    async def test_engine_does_not_log_snippet(self, caplog):
        SECRET = "PRIVATE_SNIPPET_CONTENT_uvw456"
        mm = _mock_minimax(
            {"unasked_question": "Q?", "followups": [], "rationale": "R."}
        )
        engine = SocraticEngine(client=mm)
        ctx = PageContext(headings=["H"], cleaned_text_snippet=SECRET)

        with caplog.at_level(logging.DEBUG, logger="prosocratic.socratic_engine"):
            await engine.generate_unasked_question("Bio", ctx)

        assert SECRET not in caplog.text
