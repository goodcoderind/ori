"""
Tests for app/services/minimax_client.py.

Three groups:
  1. extract_first_json_object — pure unit tests, no I/O.
  2. _validate_schema           — pure unit tests, no I/O.
  3. MiniMaxClient              — async tests with an injected mock httpx client.
     3a. chat()           — retry behaviour, error handling.
     3b. minimax_chat_json() — JSON extraction, schema validation, repair flow.

Mock strategy:
  MiniMaxClient accepts an *http_client* parameter in its constructor.
  Tests inject an AsyncMock that controls status codes and response bodies,
  completely avoiding real network calls and the _get_shared_client() path.
"""

from __future__ import annotations

import json
import logging
from unittest.mock import AsyncMock, MagicMock, call, patch

import httpx
import pytest

from app.services.minimax_client import (
    MAX_RETRIES,
    MiniMaxClient,
    MiniMaxError,
    SchemaHint,
    _validate_schema,
    extract_first_json_object,
)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _api_response(content: str, status: int = 200) -> dict:
    """Produce a minimal MiniMax API response envelope."""
    return {
        "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
        "usage": {"total_tokens": 42},
    }


def _mock_http(responses: list[tuple[int, str]]) -> AsyncMock:
    """
    Build an AsyncMock httpx.AsyncClient whose .post() returns each
    (status_code, body_text) from *responses* in sequence.
    """
    side_effects: list[MagicMock] = []
    for status, body in responses:
        resp = MagicMock()
        resp.status_code = status
        resp.is_success = 200 <= status < 300
        resp.text = body
        resp.headers = {}
        # json() mirrors text (the retry helper uses .text, not .json())
        resp.json = MagicMock(return_value=json.loads(body) if body.startswith("{") else {})
        side_effects.append(resp)

    client = AsyncMock(spec=httpx.AsyncClient)
    client.is_closed = False
    client.post = AsyncMock(side_effect=side_effects)
    return client


def _ok(content: str) -> tuple[int, str]:
    """Shorthand: 200 response wrapping *content* in the API envelope."""
    return 200, json.dumps(_api_response(content))


def _err(status: int, body: str = "server error") -> tuple[int, str]:
    """Shorthand: non-2xx response."""
    return status, body


def _client(responses: list[tuple[int, str]]) -> MiniMaxClient:
    """Construct a MiniMaxClient wired to a mock HTTP layer."""
    return MiniMaxClient(http_client=_mock_http(responses))


# ══════════════════════════════════════════════════════════════════════════════
# 1. extract_first_json_object
# ══════════════════════════════════════════════════════════════════════════════


class TestExtractFirstJsonObject:

    # ── Happy-path extraction ──────────────────────────────────────────────────

    def test_clean_json_parsed(self):
        result = extract_first_json_object('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_in_markdown_json_fence(self):
        text = '```json\n{"a": 1}\n```'
        assert extract_first_json_object(text) == {"a": 1}

    def test_json_in_generic_markdown_fence(self):
        text = "```\n{\"b\": 2}\n```"
        assert extract_first_json_object(text) == {"b": 2}

    def test_json_with_preamble_prose(self):
        text = "Here is the result:\n\n{\"answer\": 42}"
        assert extract_first_json_object(text) == {"answer": 42}

    def test_json_with_trailing_prose(self):
        text = '{"x": "y"} and some more words after.'
        assert extract_first_json_object(text) == {"x": "y"}

    def test_nested_json_object(self):
        text = '{"outer": {"inner": {"deep": true}}}'
        result = extract_first_json_object(text)
        assert result["outer"]["inner"]["deep"] is True

    def test_json_with_array_value(self):
        text = '{"items": [1, 2, 3], "count": 3}'
        result = extract_first_json_object(text)
        assert result["items"] == [1, 2, 3]
        assert result["count"] == 3

    def test_json_with_escaped_quotes_in_string(self):
        text = r'{"msg": "he said \"hello\""}'
        result = extract_first_json_object(text)
        assert 'he said "hello"' in result["msg"]

    def test_json_string_containing_braces(self):
        """Braces inside a string value must not confuse bracket counting."""
        text = '{"template": "start { middle } end"}'
        result = extract_first_json_object(text)
        assert result["template"] == "start { middle } end"

    def test_first_object_returned_when_multiple_present(self):
        """Only the first complete object should be returned."""
        text = '{"first": 1} {"second": 2}'
        result = extract_first_json_object(text)
        assert result == {"first": 1}

    def test_unicode_values_preserved(self):
        text = '{"emoji": "✅", "arabic": "مرحبا"}'
        result = extract_first_json_object(text)
        assert result["emoji"] == "✅"

    def test_multiline_json_parsed(self):
        text = '{\n  "key": "value",\n  "num": 99\n}'
        result = extract_first_json_object(text)
        assert result["num"] == 99

    # ── Failure modes ──────────────────────────────────────────────────────────

    def test_empty_string_raises_value_error(self):
        with pytest.raises((ValueError, json.JSONDecodeError)):
            extract_first_json_object("")

    def test_no_braces_raises_value_error(self):
        with pytest.raises(ValueError, match="No complete JSON object"):
            extract_first_json_object("Just some plain text without any braces.")

    def test_unclosed_brace_raises_value_error(self):
        with pytest.raises(ValueError, match="No complete JSON object"):
            extract_first_json_object('{"key": "value"')

    def test_only_open_brace_raises(self):
        with pytest.raises(ValueError):
            extract_first_json_object("{")

    def test_malformed_json_object_raises_decode_error(self):
        """Balanced braces but invalid JSON content."""
        with pytest.raises(json.JSONDecodeError):
            extract_first_json_object('{"key": value_no_quotes}')


# ══════════════════════════════════════════════════════════════════════════════
# 2. _validate_schema
# ══════════════════════════════════════════════════════════════════════════════


class TestValidateSchema:

    def test_all_fields_correct_returns_empty(self):
        schema: SchemaHint = {"name": str, "score": float}
        errors = _validate_schema({"name": "alice", "score": 0.9}, schema)
        assert errors == []

    def test_missing_field_reported(self):
        schema: SchemaHint = {"required_field": str}
        errors = _validate_schema({}, schema)
        assert any("Missing" in e and "required_field" in e for e in errors)

    def test_wrong_type_reported(self):
        schema: SchemaHint = {"count": int}
        errors = _validate_schema({"count": "three"}, schema)
        assert any("count" in e and "int" in e for e in errors)

    def test_multiple_errors_all_reported(self):
        schema: SchemaHint = {"a": str, "b": int}
        errors = _validate_schema({"a": 1, "b": "two"}, schema)
        assert len(errors) == 2

    def test_tuple_of_types_accepted(self):
        schema: SchemaHint = {"value": (int, float)}
        assert _validate_schema({"value": 3}, schema) == []
        assert _validate_schema({"value": 3.14}, schema) == []

    def test_tuple_of_types_wrong_type_reported(self):
        schema: SchemaHint = {"value": (int, float)}
        errors = _validate_schema({"value": "string"}, schema)
        assert errors  # should report the mismatch

    def test_extra_keys_in_data_are_ignored(self):
        """Schema only enforces required fields; extra keys are OK."""
        schema: SchemaHint = {"required": str}
        errors = _validate_schema({"required": "yes", "extra": 123}, schema)
        assert errors == []

    def test_nested_dict_validated_as_dict_type(self):
        schema: SchemaHint = {"metadata": dict}
        errors = _validate_schema({"metadata": {"nested": True}}, schema)
        assert errors == []

    def test_list_value_validated_as_list_type(self):
        schema: SchemaHint = {"items": list}
        errors = _validate_schema({"items": [1, 2, 3]}, schema)
        assert errors == []

    def test_none_type_not_accepted_for_str_field(self):
        schema: SchemaHint = {"name": str}
        errors = _validate_schema({"name": None}, schema)
        assert errors  # None is not str


# ══════════════════════════════════════════════════════════════════════════════
# 3a. MiniMaxClient.chat() — retry behaviour
# ══════════════════════════════════════════════════════════════════════════════


class TestMiniMaxClientChat:

    async def test_success_on_first_attempt(self):
        c = _client([_ok("Hello, world!")])
        result = await c.chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello, world!"

    async def test_with_system_prompt(self):
        c = _client([_ok("Response")])
        await c.chat(
            [{"role": "user", "content": "Q"}],
            system_prompt="You are helpful.",
        )
        payload = c._http().post.call_args.kwargs["json"]
        msgs = payload["messages"]
        assert msgs[0]["role"] == "system"
        assert msgs[1]["role"] == "user"

    async def test_retries_on_429_then_succeeds(self):
        c = _client([_err(429), _ok("Delayed success")])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await c.chat([{"role": "user", "content": "Q"}])
        assert result == "Delayed success"
        assert c._http().post.call_count == 2

    async def test_retries_on_500_then_succeeds(self):
        c = _client([_err(500), _ok("Recovered")])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await c.chat([{"role": "user", "content": "Q"}])
        assert result == "Recovered"

    async def test_retries_on_502_and_503(self):
        c = _client([_err(502), _err(503), _ok("Finally")])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await c.chat([{"role": "user", "content": "Q"}])
        assert result == "Finally"
        assert c._http().post.call_count == 3

    async def test_raises_after_all_retries_exhausted(self):
        # MAX_RETRIES + 1 attempts all fail.
        c = _client([_err(500)] * (MAX_RETRIES + 1))
        with patch("asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(MiniMaxError) as exc_info:
                await c.chat([{"role": "user", "content": "Q"}])
        assert exc_info.value.status_code in {500, None}

    async def test_raises_immediately_on_non_retryable_4xx(self):
        """400, 401, 403, 404 are not retried."""
        c = _client([_err(401)])
        with pytest.raises(MiniMaxError) as exc_info:
            await c.chat([{"role": "user", "content": "Q"}])
        assert exc_info.value.status_code == 401
        # Only one attempt made.
        assert c._http().post.call_count == 1

    async def test_timeout_triggers_retry(self):
        http = AsyncMock(spec=httpx.AsyncClient)
        http.is_closed = False

        ok_resp = MagicMock()
        ok_resp.status_code = 200
        ok_resp.is_success = True
        ok_resp.text = json.dumps(_api_response("ok after timeout"))
        ok_resp.headers = {}

        http.post = AsyncMock(
            side_effect=[httpx.TimeoutException("timed out"), ok_resp]
        )
        c = MiniMaxClient(http_client=http)

        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await c.chat([{"role": "user", "content": "Q"}])
        assert result == "ok after timeout"
        assert http.post.call_count == 2

    async def test_payload_contains_model_and_temperature(self):
        c = _client([_ok("resp")])
        await c.chat([{"role": "user", "content": "Q"}], temperature=0.7)
        payload = c._http().post.call_args.kwargs["json"]
        assert "model" in payload
        assert payload["temperature"] == 0.7

    async def test_prompt_content_not_logged(self, caplog):
        """Neither system_prompt nor user content must appear in log output."""
        SECRET_SYSTEM = "SUPER_SECRET_SYSTEM_PROMPT_xyz987"
        SECRET_USER = "SUPER_SECRET_USER_INPUT_abc123"
        c = _client([_ok("reply")])

        with caplog.at_level(logging.DEBUG, logger="prosocratic.minimax"):
            await c.chat(
                [{"role": "user", "content": SECRET_USER}],
                system_prompt=SECRET_SYSTEM,
            )

        full_log = caplog.text
        assert SECRET_SYSTEM not in full_log
        assert SECRET_USER not in full_log


# ══════════════════════════════════════════════════════════════════════════════
# 3b. MiniMaxClient.minimax_chat_json() — JSON extraction + repair
# ══════════════════════════════════════════════════════════════════════════════


class TestMiniMaxChatJson:

    async def test_happy_path_clean_json(self):
        payload = {"answer": "ATP", "confidence": 0.9}
        c = _client([_ok(json.dumps(payload))])
        result = await c.minimax_chat_json("sys", "user")
        assert result == payload

    async def test_happy_path_json_in_markdown_fence(self):
        wrapped = "```json\n{\"key\": \"value\"}\n```"
        c = _client([_ok(wrapped)])
        result = await c.minimax_chat_json("sys", "user")
        assert result == {"key": "value"}

    async def test_happy_path_json_with_prose(self):
        body = 'Sure! Here you go:\n{"score": 0.8, "type": "vague"}\nHope that helps.'
        c = _client([_ok(body)])
        result = await c.minimax_chat_json("sys", "user")
        assert result["score"] == pytest.approx(0.8)

    async def test_schema_validation_passes(self):
        payload = {"recall_probe": "What is ATP?", "transfer_probe": "Apply it."}
        c = _client([_ok(json.dumps(payload))])
        result = await c.minimax_chat_json(
            "sys", "user", schema_hint={"recall_probe": str, "transfer_probe": str}
        )
        assert result["recall_probe"] == "What is ATP?"

    async def test_repair_triggered_on_invalid_json(self):
        """First response is not JSON → repair call returns valid JSON."""
        valid = json.dumps({"fixed": True})
        c = _client([
            _ok("I cannot generate JSON right now."),  # broken
            _ok(valid),                                # repair succeeds
        ])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await c.minimax_chat_json("sys", "user")
        assert result == {"fixed": True}
        assert c._http().post.call_count == 2

    async def test_repair_triggered_on_schema_violation(self):
        """First response is valid JSON but missing a required field."""
        first = json.dumps({"only_partial": "data"})
        second = json.dumps({"required_field": "present"})
        c = _client([_ok(first), _ok(second)])
        schema: SchemaHint = {"required_field": str}
        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await c.minimax_chat_json("sys", "user", schema_hint=schema)
        assert result["required_field"] == "present"

    async def test_raises_if_repair_also_returns_non_json(self):
        """Both attempts return non-JSON → MiniMaxError raised."""
        c = _client([
            _ok("not json at all"),
            _ok("also not json"),
        ])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(MiniMaxError, match="JSON extraction failed"):
                await c.minimax_chat_json("sys", "user")

    async def test_raises_if_repair_fails_schema(self):
        """Repair returns valid JSON but still fails schema → MiniMaxError raised."""
        schema: SchemaHint = {"name": str}
        c = _client([
            _ok(json.dumps({"wrong": "key"})),
            _ok(json.dumps({"also_wrong": "key"})),
        ])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(MiniMaxError, match="schema"):
                await c.minimax_chat_json("sys", "user", schema_hint=schema)

    async def test_json_enforcement_appended_to_system_prompt(self):
        """The system message sent to the API must contain the JSON enforcement text."""
        c = _client([_ok('{"x": 1}')])
        await c.minimax_chat_json("My system prompt", "user")
        sent_payload = c._http().post.call_args.kwargs["json"]
        system_msg = next(m for m in sent_payload["messages"] if m["role"] == "system")
        assert "JSON" in system_msg["content"]
        assert "My system prompt" in system_msg["content"]

    async def test_prompt_content_not_logged(self, caplog):
        SECRET = "CONFIDENTIAL_USER_DATA_7g3k9"
        c = _client([_ok('{"ok": true}')])
        with caplog.at_level(logging.DEBUG, logger="prosocratic.minimax"):
            await c.minimax_chat_json("sys", SECRET)
        assert SECRET not in caplog.text

    async def test_repair_log_contains_error_descriptions_not_content(self, caplog):
        """The repair log event should list schema error strings, not prompt content."""
        SECRET_USER = "SECRET_USER_PROMPT_content_xyz"
        c = _client([
            _ok(json.dumps({"wrong_key": 1})),
            _ok(json.dumps({"required": "fixed"})),
        ])
        schema: SchemaHint = {"required": str}
        with caplog.at_level(logging.INFO, logger="prosocratic.minimax"):
            with patch("asyncio.sleep", new_callable=AsyncMock):
                await c.minimax_chat_json("sys", SECRET_USER, schema_hint=schema)
        assert SECRET_USER not in caplog.text
        # The repair event should appear.
        assert "minimax_json_repair" in caplog.text

    async def test_temperature_and_max_tokens_forwarded(self):
        c = _client([_ok('{"done": true}')])
        await c.minimax_chat_json("sys", "user", temperature=0.1, max_tokens=256)
        payload = c._http().post.call_args.kwargs["json"]
        assert payload["temperature"] == pytest.approx(0.1)
        assert payload["max_tokens"] == 256

    async def test_retry_within_json_route_on_500(self):
        """minimax_chat_json also benefits from the underlying retry logic."""
        c = _client([_err(500), _ok('{"after_retry": true}')])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await c.minimax_chat_json("sys", "user")
        assert result == {"after_retry": True}
        assert c._http().post.call_count == 2
