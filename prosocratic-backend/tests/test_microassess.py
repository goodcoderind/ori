"""
Tests for micro-assessment lifecycle.

Three sections:
  A. Pure maths (update_mastery_p, next_probe_delay_minutes) — no I/O.
  B. Service unit tests (MicroAssessService) — injected mock MiniMax + storage.
  C. Route integration tests (TestClient) — mock get_microassess_service().

Required cases (spec):
  - generate returns schema-valid probes
  - submit updates mastery upward for high score
  - submit schedules earlier for low mastery

All MiniMax calls are mocked; no real network activity.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import (
    AttemptMeta,
    ErrorType,
    MasteryItem,
    ProbeSet,
    Rubric,
)
from app.services.microassess_service import (
    ALPHA,
    GenerateResult,
    MicroAssessService,
    SubmitResult,
    next_probe_delay_minutes,
    update_mastery_p,
)

# ── Shared helpers ─────────────────────────────────────────────────────────────

_VALID_HEADERS = {"X-User-Id": "550e8400-e29b-41d4-a716-446655440000"}
_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
_GENERATE_EP = "/v1/microassess/generate"
_SUBMIT_EP = "/v1/microassess/submit"
_LONG_SNIPPET = "Adenosine triphosphate (ATP) is the energy currency of the cell. " * 5


def _generate_body(**overrides) -> dict:
    base = {
        "session_id": "sess-001",
        "topic_label": "Biology/ATP",
        "page_context": {
            "headings": ["ATP Structure", "Energy Release"],
            "cleaned_text_snippet": _LONG_SNIPPET,
        },
        "difficulty": "med",
    }
    base.update(overrides)
    return base


def _submit_body(**overrides) -> dict:
    base = {
        "probe_set_id": "ps-abc123",
        "probe_type": "recall",
        "answer_text": "ATP stores energy in phosphate bonds and releases it when hydrolysed.",
    }
    base.update(overrides)
    return base


def _good_generate_result() -> GenerateResult:
    return GenerateResult(
        probe_set_id="ps-abc123",
        recall_probe="What is the primary function of ATP in a cell?",
        transfer_probe="A cell doubles its workload — how does ATP production respond?",
        key_points=["ATP stores energy in phosphate bonds", "Hydrolysis releases energy"],
        common_mistakes=["Confusing ATP with glucose"],
        difficulty_tag="med",
    )


def _good_submit_result(p_new: float = 0.65) -> SubmitResult:
    return SubmitResult(
        score_0_1=0.8,
        error_type="vague",
        feedback="Good — now name the specific bond that breaks.",
        next_probe_time=datetime(2024, 3, 16, 14, 0, tzinfo=UTC),
        p_mastery_new=p_new,
    )


def _mock_service(
    generate: GenerateResult | None = None,
    submit: SubmitResult | None = None,
    submit_exc: Exception | None = None,
    generate_exc: Exception | None = None,
) -> MagicMock:
    svc = MagicMock()
    if generate_exc:
        svc.generate = AsyncMock(side_effect=generate_exc)
    else:
        svc.generate = AsyncMock(return_value=generate or _good_generate_result())
    if submit_exc:
        svc.submit = AsyncMock(side_effect=submit_exc)
    else:
        svc.submit = AsyncMock(return_value=submit or _good_submit_result())
    return svc


def _mock_minimax(response_dict: dict) -> MagicMock:
    client = MagicMock()
    client.minimax_chat_json = AsyncMock(return_value=response_dict)
    return client


def _stored_probe_set(topic: str = "Biology/ATP") -> dict:
    """A DynamoDB item representing a stored ProbeSet (Decimals as numbers)."""
    return {
        "user_id": _USER_ID,
        "probe_set_id": "ps-abc123",
        "session_id": "sess-001",
        "created_at": "2024-03-15T14:00:00+00:00",
        "topic_label": topic,
        "recall_probe": "What is ATP?",
        "transfer_probe": "Apply ATP to a new context.",
        "rubric": {
            "key_points": ["stores energy"],
            "common_mistakes": ["confusing with glucose"],
            "difficulty_tag": "med",
        },
        "attempts_meta": [],
    }


# ══════════════════════════════════════════════════════════════════════════════
# A. Pure maths — update_mastery_p and next_probe_delay_minutes
# ══════════════════════════════════════════════════════════════════════════════


class TestUpdateMasteryP:

    def test_perfect_score_increases_mastery(self):
        p_new = update_mastery_p(p_old=0.3, score=1.0, probe_type="recall")
        assert p_new > 0.3

    def test_zero_score_decreases_mastery(self):
        p_new = update_mastery_p(p_old=0.5, score=0.0, probe_type="recall")
        assert p_new < 0.5

    def test_formula_recall_weight_1(self):
        # recall weight = 1.0
        # p_new = 0.3 + 0.6*(1.0-0.3)*1.0 = 0.3+0.42 = 0.72
        p_new = update_mastery_p(p_old=0.3, score=1.0, probe_type="recall")
        assert abs(p_new - 0.72) < 0.001

    def test_formula_transfer_weight_1_5(self):
        # transfer weight = 1.5
        # p_new = 0.3 + 0.6*(1.0-0.3)*1.5 = 0.3+0.63 = 0.93
        p_new = update_mastery_p(p_old=0.3, score=1.0, probe_type="transfer")
        assert abs(p_new - 0.93) < 0.001

    def test_transfer_produces_bigger_jump_than_recall(self):
        p_recall = update_mastery_p(p_old=0.3, score=0.8, probe_type="recall")
        p_transfer = update_mastery_p(p_old=0.3, score=0.8, probe_type="transfer")
        assert p_transfer > p_recall

    def test_clamped_at_max_0_95(self):
        # p=0.9, score=1.0: p_new = 0.9+0.6*0.1*1.0 = 0.96 → clamped to 0.95
        p_new = update_mastery_p(p_old=0.9, score=1.0, probe_type="recall")
        assert p_new == pytest.approx(0.95)

    def test_clamped_at_min_0_05(self):
        # p=0.1, score=0.0: p_new = 0.1+0.6*(0.0-0.1)*1.0 = 0.04 → clamped to 0.05
        p_new = update_mastery_p(p_old=0.1, score=0.0, probe_type="recall")
        assert p_new == pytest.approx(0.05)

    def test_score_equal_to_p_no_change(self):
        """If score == p, update is zero regardless of weight."""
        p = 0.6
        p_new = update_mastery_p(p_old=p, score=p, probe_type="transfer")
        assert p_new == pytest.approx(p, abs=0.001)

    def test_unknown_probe_type_defaults_to_recall_weight(self):
        p_recall = update_mastery_p(p_old=0.4, score=0.8, probe_type="recall")
        p_unknown = update_mastery_p(p_old=0.4, score=0.8, probe_type="unknown")
        assert p_recall == pytest.approx(p_unknown)


class TestNextProbeDelayMinutes:

    def test_low_mastery_returns_short_interval(self):
        delay = next_probe_delay_minutes(0.2)
        assert delay == 20  # 15-30 min range

    def test_just_below_low_threshold(self):
        delay = next_probe_delay_minutes(0.39)
        assert delay == 20

    def test_medium_mastery_returns_one_day(self):
        delay = next_probe_delay_minutes(0.55)
        assert delay == 24 * 60

    def test_at_low_threshold_goes_to_medium(self):
        """p=0.40 is on the medium boundary → 1 day."""
        delay = next_probe_delay_minutes(0.40)
        assert delay == 24 * 60

    def test_high_mastery_returns_multi_day(self):
        delay = next_probe_delay_minutes(0.80)
        assert delay > 24 * 60  # more than 1 day

    def test_highest_mastery_approaches_7_days(self):
        delay = next_probe_delay_minutes(0.95)
        assert delay == pytest.approx(7 * 24 * 60, abs=1)

    def test_at_high_threshold_returns_3_days(self):
        """p=0.70 → 3 days (lower bound of high-mastery range)."""
        delay = next_probe_delay_minutes(0.70)
        assert delay == pytest.approx(3 * 24 * 60, abs=1)

    def test_delay_monotonically_non_decreasing(self):
        """Higher mastery should never produce a shorter interval."""
        ps = [0.1, 0.35, 0.4, 0.5, 0.69, 0.7, 0.8, 0.9, 0.95]
        delays = [next_probe_delay_minutes(p) for p in ps]
        for i in range(len(delays) - 1):
            assert delays[i] <= delays[i + 1], f"delay not monotone at p={ps[i]}"

    def test_low_mastery_schedules_sooner_than_high(self):
        """Required test case from spec."""
        low = next_probe_delay_minutes(0.2)
        high = next_probe_delay_minutes(0.8)
        assert low < high


# ══════════════════════════════════════════════════════════════════════════════
# B. Service unit tests
# ══════════════════════════════════════════════════════════════════════════════


def _build_service(
    minimax_response: dict | None = None,
    scorer_return: tuple | None = None,
    probe_set_item: dict | None = None,
    p_mastery_old: float = 0.3,
) -> MicroAssessService:
    """
    Build a MicroAssessService with fully mocked dependencies.
    """
    # MiniMax client mock
    client = MagicMock()
    client.minimax_chat_json = AsyncMock(
        return_value=minimax_response
        or {
            "recall_probe": "What is ATP?",
            "transfer_probe": "How does ATP apply here?",
            "key_points": ["energy currency", "phosphate bond"],
            "common_mistakes": ["confusing with ADP"],
        }
    )

    # AssessmentScorer mock
    scorer = MagicMock()
    default_attempt = AttemptMeta(
        probe_type="recall",
        score_0_1=0.8,
        error_type=ErrorType.VAGUE,
    )
    scorer.score_answer = AsyncMock(
        return_value=scorer_return or (default_attempt, "Good, but be more specific.")
    )

    # DynamoStorage mock
    storage = MagicMock()

    # _assessments().get_item() returns a probe set item
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": probe_set_item or _stored_probe_set()
    }
    mock_table.put_item.return_value = {}
    mock_table.update_item.return_value = {}
    storage._assessments.return_value = mock_table

    # get_or_create_user returns a profile with current mastery
    from app.models import UserProfile
    profile = UserProfile(user_id=_USER_ID)
    if p_mastery_old > 0:
        profile.mastery_by_topic["Biology/ATP"] = MasteryItem(p_mastery=p_mastery_old)
    storage.get_or_create_user.return_value = profile
    storage.update_mastery.return_value = profile
    storage.append_probe_attempt_meta.return_value = None
    storage.save_probe_set.return_value = MagicMock(probe_set_id="ps-new")

    return MicroAssessService(client=client, scorer=scorer, storage=storage)


class TestServiceGenerate:

    async def test_generate_returns_probe_set_id(self):
        svc = _build_service()
        result = await svc.generate(
            user_id=_USER_ID,
            session_id="sess-001",
            topic_label="Biology/ATP",
            headings=["ATP"],
            cleaned_text_snippet=_LONG_SNIPPET,
            difficulty="med",
        )
        assert result.probe_set_id  # non-empty

    async def test_generate_returns_recall_and_transfer(self):
        """Required test: generate returns schema-valid probes."""
        svc = _build_service()
        result = await svc.generate(
            user_id=_USER_ID,
            session_id="s",
            topic_label="Biology/ATP",
            headings=["ATP Structure"],
            cleaned_text_snippet=_LONG_SNIPPET,
            difficulty="easy",
        )
        assert result.recall_probe
        assert result.transfer_probe
        assert isinstance(result.key_points, list)
        assert len(result.key_points) >= 1
        assert isinstance(result.common_mistakes, list)

    async def test_generate_persists_probe_set(self):
        svc = _build_service()
        await svc.generate(
            user_id=_USER_ID,
            session_id="s",
            topic_label="Bio",
            headings=[],
            cleaned_text_snippet=_LONG_SNIPPET,
            difficulty="hard",
        )
        assert svc._storage.save_probe_set.called

    async def test_generate_difficulty_tag_matches_request(self):
        svc = _build_service()
        result = await svc.generate(
            user_id=_USER_ID,
            session_id="s",
            topic_label="Bio",
            headings=[],
            cleaned_text_snippet=_LONG_SNIPPET,
            difficulty="hard",
        )
        assert result.difficulty_tag == "hard"

    async def test_generate_key_points_capped_at_5(self):
        svc = _build_service(
            minimax_response={
                "recall_probe": "Q?",
                "transfer_probe": "T?",
                "key_points": ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
                "common_mistakes": ["m1"],
            }
        )
        result = await svc.generate(
            user_id=_USER_ID,
            session_id="s",
            topic_label="Bio",
            headings=["H"],
            cleaned_text_snippet=_LONG_SNIPPET,
            difficulty="med",
        )
        assert len(result.key_points) <= 5

    async def test_generate_page_context_not_in_logs(self, caplog):
        import logging
        SECRET = "SUPER_SECRET_PAGE_CONTENT_xyz987"
        svc = _build_service()
        with caplog.at_level(logging.DEBUG, logger="prosocratic.microassess"):
            await svc.generate(
                user_id=_USER_ID,
                session_id="s",
                topic_label="Bio",
                headings=["Secret Heading"],
                cleaned_text_snippet=SECRET,
                difficulty="easy",
            )
        assert SECRET not in caplog.text

    async def test_generate_minimax_error_propagates(self):
        from app.services.minimax_client import MiniMaxError
        client = MagicMock()
        client.minimax_chat_json = AsyncMock(side_effect=MiniMaxError("fail", 503))
        svc = MicroAssessService(client=client, storage=MagicMock())
        svc._storage.save_probe_set = MagicMock()
        with pytest.raises(MiniMaxError):
            await svc.generate(
                user_id=_USER_ID, session_id="s", topic_label="Bio",
                headings=[], cleaned_text_snippet=_LONG_SNIPPET, difficulty="med",
            )


class TestServiceSubmit:

    async def test_submit_returns_score(self):
        svc = _build_service()
        result = await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="ATP is the energy currency.",
        )
        assert 0.0 <= result.score_0_1 <= 1.0

    async def test_submit_high_score_increases_mastery(self):
        """Required test: high score → mastery goes up."""
        p_old = 0.3
        high_score_attempt = AttemptMeta(
            probe_type="recall", score_0_1=1.0, error_type=ErrorType.CORRECT
        )
        svc = _build_service(
            scorer_return=(high_score_attempt, "Perfect!"),
            p_mastery_old=p_old,
        )
        result = await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="Perfect answer text.",
        )
        assert result.p_mastery_new > p_old

    async def test_submit_low_score_lowers_mastery(self):
        p_old = 0.5
        low_score_attempt = AttemptMeta(
            probe_type="recall", score_0_1=0.0, error_type=ErrorType.MISCONCEPTION
        )
        svc = _build_service(
            scorer_return=(low_score_attempt, "Misconception detected."),
            p_mastery_old=p_old,
        )
        result = await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="Wrong answer.",
        )
        assert result.p_mastery_new < p_old

    async def test_submit_low_mastery_schedules_sooner(self):
        """Required test: low p_mastery → next_probe_time is soon (< 1 hour)."""
        low_score_attempt = AttemptMeta(
            probe_type="recall", score_0_1=0.0, error_type=ErrorType.MISCONCEPTION
        )
        # p_old=0.1, score=0.0 → p_new ≈ 0.05 → delay = 20 min
        svc = _build_service(
            scorer_return=(low_score_attempt, "Try again."),
            p_mastery_old=0.1,
        )
        before = datetime.now(UTC)
        result = await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="Wrong.",
        )
        # next_probe_time should be at most 35 minutes from now (low mastery → 20 min)
        delta = result.next_probe_time - before
        assert delta < timedelta(minutes=35)

    async def test_submit_high_mastery_schedules_later(self):
        """High p_mastery → next probe is days away."""
        high_score_attempt = AttemptMeta(
            probe_type="recall", score_0_1=1.0, error_type=ErrorType.CORRECT
        )
        # p_old=0.85, score=1.0 → p_new ≈ 0.94 → delay ≈ ~6.8 days
        svc = _build_service(
            scorer_return=(high_score_attempt, "Excellent!"),
            p_mastery_old=0.85,
        )
        before = datetime.now(UTC)
        result = await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="Perfect.",
        )
        delta = result.next_probe_time - before
        assert delta > timedelta(days=2)

    async def test_submit_returns_next_probe_time_iso(self):
        svc = _build_service()
        result = await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="ATP answer.",
        )
        assert isinstance(result.next_probe_time, datetime)
        assert result.next_probe_time.tzinfo is not None  # timezone-aware

    async def test_submit_persists_attempt_meta(self):
        svc = _build_service()
        await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="ATP answer.",
        )
        assert svc._storage.append_probe_attempt_meta.called

    async def test_submit_attempt_meta_has_no_answer_text_field(self):
        """Required: AttemptMeta must not contain answer_text."""
        captured_meta = None

        def capture(user_id, probe_set_id, meta):
            nonlocal captured_meta
            captured_meta = meta

        svc = _build_service()
        svc._storage.append_probe_attempt_meta.side_effect = capture
        await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="SECRET ANSWER TEXT XYZ",
        )
        assert captured_meta is not None
        # AttemptMeta schema has no answer_text field
        assert not hasattr(captured_meta, "answer_text")
        meta_dict = captured_meta.model_dump()
        assert "answer_text" not in meta_dict
        assert "SECRET ANSWER TEXT XYZ" not in str(meta_dict)

    async def test_submit_answer_text_not_in_logs(self, caplog):
        import logging
        SECRET = "MY_PRIVATE_ANSWER_uvwxyz"
        svc = _build_service()
        with caplog.at_level(logging.DEBUG, logger="prosocratic.microassess"):
            await svc.submit(
                user_id=_USER_ID,
                probe_set_id="ps-abc123",
                probe_type="recall",
                answer_text=SECRET,
            )
        assert SECRET not in caplog.text

    async def test_submit_updates_mastery_in_storage(self):
        svc = _build_service()
        await svc.submit(
            user_id=_USER_ID,
            probe_set_id="ps-abc123",
            probe_type="recall",
            answer_text="Answer.",
        )
        assert svc._storage.update_mastery.called
        call_args = svc._storage.update_mastery.call_args
        updated_item = call_args.args[2] if call_args.args else call_args.kwargs.get("mastery_item")
        assert isinstance(updated_item, MasteryItem)
        assert updated_item.next_probe_at is not None
        assert updated_item.last_probe_at is not None

    async def test_submit_probe_not_found_raises_value_error(self):
        svc = _build_service()
        svc._storage._assessments.return_value.get_item.return_value = {}
        with pytest.raises(ValueError, match="not found"):
            await svc.submit(
                user_id=_USER_ID,
                probe_set_id="nonexistent",
                probe_type="recall",
                answer_text="Answer.",
            )

    async def test_transfer_probe_updates_mastery_more_than_recall(self):
        """transfer weight=1.5 > recall weight=1.0 → bigger mastery jump."""
        p_old = 0.4
        score = 0.8

        # Recall attempt
        recall_attempt = AttemptMeta(probe_type="recall", score_0_1=score, error_type=ErrorType.VAGUE)
        svc_recall = _build_service(
            scorer_return=(recall_attempt, "ok"), p_mastery_old=p_old
        )
        r_recall = await svc_recall.submit(_USER_ID, "ps-abc123", "recall", "a")

        # Transfer attempt (same score, higher weight)
        transfer_attempt = AttemptMeta(probe_type="transfer", score_0_1=score, error_type=ErrorType.VAGUE)
        svc_transfer = _build_service(
            scorer_return=(transfer_attempt, "ok"), p_mastery_old=p_old
        )
        r_transfer = await svc_transfer.submit(_USER_ID, "ps-abc123", "transfer", "a")

        assert r_transfer.p_mastery_new > r_recall.p_mastery_new


# ══════════════════════════════════════════════════════════════════════════════
# C. Route integration tests (TestClient)
# ══════════════════════════════════════════════════════════════════════════════


class TestGenerateRoute:

    def test_returns_201(self, client):
        with patch("app.routes.microassess.get_microassess_service", return_value=_mock_service()):
            r = client.post(_GENERATE_EP, json=_generate_body(), headers=_VALID_HEADERS)
        assert r.status_code == 201

    def test_response_shape(self, client):
        with patch("app.routes.microassess.get_microassess_service", return_value=_mock_service()):
            data = client.post(_GENERATE_EP, json=_generate_body(), headers=_VALID_HEADERS).json()
        assert "probe_set_id" in data
        assert "recall_probe" in data
        assert "transfer_probe" in data
        assert "rubric" in data
        rubric = data["rubric"]
        assert "key_points" in rubric
        assert "common_mistakes" in rubric
        assert "difficulty_tag" in rubric

    def test_snippet_over_2500_returns_422(self, client):
        body = _generate_body()
        body["page_context"]["cleaned_text_snippet"] = "x" * 2501
        r = client.post(_GENERATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_snippet_exactly_2500_accepted(self, client):
        body = _generate_body()
        body["page_context"]["cleaned_text_snippet"] = "x" * 2500
        with patch("app.routes.microassess.get_microassess_service", return_value=_mock_service()):
            r = client.post(_GENERATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 201

    def test_invalid_difficulty_returns_422(self, client):
        body = _generate_body()
        body["difficulty"] = "extreme"
        r = client.post(_GENERATE_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_missing_auth_returns_4xx(self, client):
        r = client.post(_GENERATE_EP, json=_generate_body())
        assert r.status_code in {401, 422}

    def test_minimax_error_returns_502(self, client):
        from app.services.minimax_client import MiniMaxError
        with patch(
            "app.routes.microassess.get_microassess_service",
            return_value=_mock_service(generate_exc=MiniMaxError("fail", 503)),
        ):
            r = client.post(_GENERATE_EP, json=_generate_body(), headers=_VALID_HEADERS)
        assert r.status_code == 502

    def test_response_uses_error_envelope_on_422(self, client):
        body = _generate_body()
        body["difficulty"] = "impossible"
        r = client.post(_GENERATE_EP, json=body, headers=_VALID_HEADERS)
        err = r.json()
        assert "error" in err
        assert "code" in err["error"]
        assert "request_id" in err["error"]


class TestSubmitRoute:

    def test_returns_200(self, client):
        with patch("app.routes.microassess.get_microassess_service", return_value=_mock_service()):
            r = client.post(_SUBMIT_EP, json=_submit_body(), headers=_VALID_HEADERS)
        assert r.status_code == 200

    def test_response_shape(self, client):
        with patch("app.routes.microassess.get_microassess_service", return_value=_mock_service()):
            data = client.post(_SUBMIT_EP, json=_submit_body(), headers=_VALID_HEADERS).json()
        assert "score_0_1" in data
        assert "error_type" in data
        assert "feedback" in data
        assert "next_probe_time" in data

    def test_next_probe_time_is_iso8601(self, client):
        with patch("app.routes.microassess.get_microassess_service", return_value=_mock_service()):
            data = client.post(_SUBMIT_EP, json=_submit_body(), headers=_VALID_HEADERS).json()
        # Should parse as ISO datetime without error
        from datetime import datetime
        dt = datetime.fromisoformat(data["next_probe_time"])
        assert dt.tzinfo is not None

    def test_probe_not_found_returns_404(self, client):
        with patch(
            "app.routes.microassess.get_microassess_service",
            return_value=_mock_service(submit_exc=ValueError("ProbeSet not found")),
        ):
            r = client.post(_SUBMIT_EP, json=_submit_body(), headers=_VALID_HEADERS)
        assert r.status_code == 404

    def test_invalid_probe_type_returns_422(self, client):
        body = _submit_body()
        body["probe_type"] = "essay"
        r = client.post(_SUBMIT_EP, json=body, headers=_VALID_HEADERS)
        assert r.status_code == 422

    def test_missing_auth_returns_4xx(self, client):
        r = client.post(_SUBMIT_EP, json=_submit_body())
        assert r.status_code in {401, 422}

    def test_minimax_error_returns_502(self, client):
        from app.services.minimax_client import MiniMaxError
        with patch(
            "app.routes.microassess.get_microassess_service",
            return_value=_mock_service(submit_exc=MiniMaxError("fail", 408)),
        ):
            r = client.post(_SUBMIT_EP, json=_submit_body(), headers=_VALID_HEADERS)
        assert r.status_code == 502

    def test_response_does_not_echo_answer_text(self, client):
        """answer_text must never appear in the response."""
        SECRET = "MY_PRIVATE_STUDENT_ANSWER_abc"
        body = _submit_body()
        body["answer_text"] = SECRET
        with patch("app.routes.microassess.get_microassess_service", return_value=_mock_service()):
            data = client.post(_SUBMIT_EP, json=body, headers=_VALID_HEADERS).json()
        assert SECRET not in str(data)
