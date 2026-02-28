"""
MiniMax API client — production-grade async wrapper.

Design:
  - One shared httpx.AsyncClient per process (connection pooling, keep-alive).
  - Exponential backoff + jitter on 429 / 5xx (max MAX_RETRIES attempts).
  - extract_first_json_object()  — robust JSON extraction from messy LLM output.
  - minimax_chat_json()          — enforces JSON-only output, validates against a
                                   schema hint, and auto-repairs once on failure.
  - .chat()                      — plain string response; kept for existing callers
                                   in question_engine and assessment_scorer.

Logging rules (enforced in this file):
  - NEVER log system_prompt, user_prompt, or response content.
  - DO log: request_id (from context var), model, message_count, status_code,
            response_length, latency_ms, retry attempt number.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from functools import lru_cache
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger("prosocratic.minimax")

# ── Constants ──────────────────────────────────────────────────────────────────

MINIMAX_ENDPOINT = "https://api.minimax.io/v1/text/chatcompletion_v2"
DEFAULT_MODEL = "MiniMax-M2.5-highspeed"

MAX_RETRIES = 3
# Status codes that warrant a retry.
_RETRYABLE = frozenset({429, 500, 502, 503, 504})

# ── Shared HTTP client (connection pooling) ────────────────────────────────────

_SHARED_HTTP_CLIENT: httpx.AsyncClient | None = None

# MiniMax-M2.5 is a reasoning model whose chain-of-thought can take 15–25 s.
# Enforce a minimum read timeout so the env value doesn't cause spurious
# timeouts when the model is thinking; operators can raise it but not lower
# it below this floor.
_MIN_READ_TIMEOUT_S: float = 90.0


def _get_shared_client() -> httpx.AsyncClient:
    """
    Return the process-wide httpx.AsyncClient, creating it if needed.

    The client is intentionally NOT closed between requests so that the
    underlying TCP connection pool (keep-alive) is reused across calls.
    Lambda warm invocations therefore skip the TCP handshake on subsequent
    requests to the same upstream.
    """
    global _SHARED_HTTP_CLIENT
    if _SHARED_HTTP_CLIENT is None or _SHARED_HTTP_CLIENT.is_closed:
        settings = get_settings()
        read_timeout = max(float(settings.minimax_timeout_seconds), _MIN_READ_TIMEOUT_S)
        _SHARED_HTTP_CLIENT = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=5.0,
                read=read_timeout,
                write=10.0,
                pool=5.0,
            ),
            limits=httpx.Limits(
                max_keepalive_connections=5,
                max_connections=10,
                keepalive_expiry=30.0,
            ),
        )
    return _SHARED_HTTP_CLIENT


# ── Exception ──────────────────────────────────────────────────────────────────


class MiniMaxError(Exception):
    """Raised when the MiniMax API returns an error or an unexpected response."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# ── JSON extraction ────────────────────────────────────────────────────────────


def _strip_markdown_fence(text: str) -> str:
    """Remove a single ```json ... ``` or ``` ... ``` wrapper if present."""
    match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?\s*```", text)
    return match.group(1).strip() if match else text


def _find_balanced_json_object(text: str) -> str:
    """
    Find the first complete { ... } block in *text* using a character-level
    state machine that honours JSON string escaping.

    Returns the raw substring (not yet parsed).
    Raises ValueError if no complete object is found.
    """
    start = -1
    depth = 0
    in_string = False
    escaped = False

    for i, ch in enumerate(text):
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_string:
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue

        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                return text[start : i + 1]

    raise ValueError("No complete JSON object found in text")


def extract_first_json_object(text: str) -> dict:
    """
    Extract and parse the first complete JSON object from *text*.

    Handles:
      - Clean JSON strings
      - Responses wrapped in ```json ... ``` or ``` ... ``` fences
      - Preamble / trailing prose around the JSON
      - Nested objects (stops at the outermost closing brace)
      - Strings containing braces or escaped quotes

    Raises:
      ValueError  — no valid JSON object found
      json.JSONDecodeError — object found but not valid JSON
    """
    # 1. Strip markdown fences first.
    candidate = _strip_markdown_fence(text).strip()

    # 2. If the stripped text starts with {, try direct parse.
    if candidate.startswith("{"):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass  # fall through to balanced-bracket search

    # 3. Balanced-bracket search on the original text (fence may have hidden content).
    raw_obj = _find_balanced_json_object(text)
    return json.loads(raw_obj)


# ── Schema validation ──────────────────────────────────────────────────────────

# Maps field names to a single type or a tuple of accepted types.
SchemaHint = dict[str, type | tuple[type, ...]]


def _validate_schema(data: dict, schema: SchemaHint) -> list[str]:
    """
    Validate that *data* contains all required fields with the expected types.

    Returns a list of human-readable error strings (empty list = valid).
    """
    errors: list[str] = []
    for field, expected in schema.items():
        if field not in data:
            errors.append(f"Missing required field {field!r}")
            continue
        if not isinstance(data[field], expected):
            got = type(data[field]).__name__
            if isinstance(expected, tuple):
                want = " | ".join(t.__name__ for t in expected)
            else:
                want = expected.__name__
            errors.append(f"Field {field!r}: expected {want}, got {got}")
    return errors


# ── System prompt suffix for JSON enforcement ──────────────────────────────────

_JSON_ENFORCEMENT = (
    "\n\nCRITICAL: Your response MUST be a single valid JSON object. "
    "Do NOT include markdown code fences, explanation text, or anything outside the JSON. "
    "Start your response with { and end with }."
)

_REPAIR_PREFIX = (
    "Your previous response was not valid JSON or did not satisfy the required schema.\n"
    "Errors:\n{errors}\n\n"
    "Return ONLY the corrected JSON object — no markdown, no explanation.\n"
    "Previous (broken) response for reference:\n{broken}\n"
)


# ── Core HTTP call with retry ──────────────────────────────────────────────────


async def _post_with_retry(
    http_client: httpx.AsyncClient,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> tuple[str, int, float]:
    """
    POST *payload* to MINIMAX_ENDPOINT with exponential backoff on retryable errors.

    Returns: (response_text, status_code, latency_seconds)
    Raises:  MiniMaxError after MAX_RETRIES exhausted.

    Logging: status_code, latency, retry attempt — never prompt content.
    """
    last_error: MiniMaxError | None = None

    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            # Exponential backoff with ±0.5 s jitter; cap at 16 s.
            wait = min(2**attempt, 16) + random.uniform(-0.5, 0.5)
            logger.info(
                {
                    "event": "minimax_retry",
                    "attempt": attempt,
                    "wait_s": round(wait, 2),
                    "last_status": last_error.status_code if last_error else None,
                }
            )
            await asyncio.sleep(wait)

        t0 = time.perf_counter()
        try:
            response = await http_client.post(
                MINIMAX_ENDPOINT,
                json=payload,
                headers=headers,
            )
            latency = time.perf_counter() - t0
        except httpx.TimeoutException as exc:
            last_error = MiniMaxError("Request timed out", status_code=408)
            logger.warning({"event": "minimax_timeout", "attempt": attempt})
            continue
        except httpx.ConnectError as exc:
            last_error = MiniMaxError(f"Connection failed: {exc}", status_code=503)
            logger.warning({"event": "minimax_connect_error", "attempt": attempt})
            continue

        status = response.status_code
        logger.info(
            {
                "event": "minimax_http",
                "status_code": status,
                "latency_ms": round(latency * 1000, 1),
                "attempt": attempt,
            }
        )

        if status in _RETRYABLE:
            # Honour Retry-After if the server sends one.
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                try:
                    await asyncio.sleep(float(retry_after))
                    continue  # skip the built-in backoff this iteration
                except ValueError:
                    pass
            last_error = MiniMaxError(
                f"Retryable status {status}: {response.text[:120]}",
                status_code=status,
            )
            continue

        if not (200 <= status < 300):
            raise MiniMaxError(
                f"API error {status}: {response.text[:200]}",
                status_code=status,
            )

        return response.text, status, latency

    raise last_error or MiniMaxError("All retries exhausted with no response")


# ── MiniMaxClient ──────────────────────────────────────────────────────────────


class MiniMaxClient:
    """
    Async MiniMax API client.

    Inject *http_client* in tests to avoid real network calls:
        client = MiniMaxClient(http_client=mock_async_client)
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        self._api_key = api_key or settings.minimax_api_key
        self._model = model or settings.minimax_model or DEFAULT_MODEL
        self._default_temperature = settings.minimax_temperature
        self._default_max_tokens = settings.minimax_max_tokens
        self._injected_client = http_client  # None → use module-level shared client

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _http(self) -> httpx.AsyncClient:
        return self._injected_client or _get_shared_client()

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(
        self,
        messages: list[dict[str, str]],
        temperature: float | None,
        max_tokens: int | None,
    ) -> dict[str, Any]:
        return {
            "model": self._model,
            "messages": messages,
            "temperature": temperature
            if temperature is not None
            else self._default_temperature,
            "max_tokens": max_tokens
            if max_tokens is not None
            else self._default_max_tokens,
        }

    def _extract_content(self, response_text: str) -> str:
        """Parse the API response and return the assistant message content."""
        try:
            data = json.loads(response_text)
            return data["choices"][0]["message"]["content"]
        except (json.JSONDecodeError, KeyError, IndexError) as exc:
            raise MiniMaxError(
                f"Unexpected response shape — could not extract content"
            ) from exc

    # ── Public API ─────────────────────────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        system_prompt: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """
        Send a chat completion request and return the assistant's reply as a string.

        Existing callers in question_engine and assessment_scorer use this method.
        The system_prompt is prepended as a system message if provided.

        Logging: message_count, status_code, latency_ms — never prompt text.
        """
        all_messages: list[dict[str, str]] = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        payload = self._build_payload(all_messages, temperature, max_tokens)

        logger.debug(
            {
                "event": "minimax_chat_request",
                "model": self._model,
                "message_count": len(all_messages),
                # prompt content deliberately omitted
            }
        )

        raw, status, latency = await _post_with_retry(self._http(), self._headers, payload)
        content = self._extract_content(raw)

        logger.debug(
            {
                "event": "minimax_chat_response",
                "status_code": status,
                "response_length": len(content),
                "latency_ms": round(latency * 1000, 1),
            }
        )
        return content

    async def minimax_chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema_hint: SchemaHint | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict:
        """
        Call MiniMax and return a parsed JSON dict.

        Behaviour:
          1. Appends a strict JSON-only instruction to system_prompt.
          2. Calls the API and extracts the first JSON object from the response.
          3. Validates the dict against schema_hint (if provided).
          4. On parse or validation failure, makes ONE repair call with the errors
             and the broken response included in the prompt.
          5. Raises MiniMaxError if the repair also fails.

        Logging: never logs system_prompt, user_prompt, or response content.
        """
        enforced_system = system_prompt + _JSON_ENFORCEMENT
        messages = [
            {"role": "system", "content": enforced_system},
            {"role": "user", "content": user_prompt},
        ]
        payload = self._build_payload(messages, temperature, max_tokens)

        logger.debug(
            {
                "event": "minimax_json_request",
                "model": self._model,
                "has_schema": schema_hint is not None,
            }
        )

        raw, status, latency = await _post_with_retry(self._http(), self._headers, payload)
        content = self._extract_content(raw)

        logger.debug(
            {
                "event": "minimax_json_response",
                "status_code": status,
                "response_length": len(content),
                "latency_ms": round(latency * 1000, 1),
            }
        )

        # ── Attempt 1: parse + validate ────────────────────────────────────────
        parse_errors: list[str] = []
        data: dict | None = None

        try:
            data = extract_first_json_object(content)
        except (ValueError, json.JSONDecodeError) as exc:
            parse_errors.append(f"JSON parse error: {exc}")

        if data is not None and schema_hint:
            schema_errors = _validate_schema(data, schema_hint)
            if schema_errors:
                parse_errors.extend(schema_errors)
                data = None  # treat as invalid; trigger repair

        if data is not None:
            return data

        # ── Attempt 2: repair ──────────────────────────────────────────────────
        logger.info(
            {
                "event": "minimax_json_repair",
                "error_count": len(parse_errors),
                # errors are schema/parse errors, not prompt content; safe to log
                "errors": parse_errors,
            }
        )

        repair_content = _REPAIR_PREFIX.format(
            errors="\n".join(f"  - {e}" for e in parse_errors),
            broken=content[:400],  # truncated so we don't balloon the prompt
        )
        repair_messages = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": repair_content},
        ]
        repair_payload = self._build_payload(repair_messages, temperature, max_tokens)

        raw2, _, _ = await _post_with_retry(self._http(), self._headers, repair_payload)
        content2 = self._extract_content(raw2)

        try:
            data = extract_first_json_object(content2)
        except (ValueError, json.JSONDecodeError) as exc:
            raise MiniMaxError(
                f"JSON extraction failed after repair attempt: {exc}"
            ) from exc

        if schema_hint:
            final_errors = _validate_schema(data, schema_hint)
            if final_errors:
                raise MiniMaxError(
                    f"Repaired response still fails schema: {'; '.join(final_errors)}"
                )

        return data


# ── Singleton ──────────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_minimax_client() -> MiniMaxClient:
    """Return the process-wide MiniMaxClient singleton."""
    return MiniMaxClient()
