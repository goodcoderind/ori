"""
Micro-assessment lifecycle service.

Responsibilities:
  1. generate() — call MiniMax to produce recall + transfer probes and a grounded
                  rubric from ephemeral page context, then persist the ProbeSet.
  2. submit()   — score a student answer with MiniMax, persist only the derived
                  AttemptMeta (score + error_type + timestamp), apply a Bayesian
                  mastery update, and compute the next scheduled probe time.

PRIVACY INVARIANTS:
  - page_context (headings + cleaned_text_snippet) is used ONLY inside the
    MiniMax prompt string in generate().  It is never stored, never logged,
    never returned to the caller.
  - answer_text is used ONLY inside the MiniMax prompt in submit().  It is
    never stored, never logged, never included in any response.
  - Logging in this module emits only metadata (topic lengths, difficulty,
    score, p_mastery deltas).  No content values are logged.

Bayesian mastery update formula:
  p_new = clamp(p + α × (score − p) × weight, 0.05, 0.95)

  α      = ALPHA  (learning rate, default 0.6)
  weight = 1.5 for transfer probes, 1.0 for recall probes
  clamp  = keep within [0.05, 0.95] to avoid certainty traps

Scheduling policy (minutes until next probe):
  p < 0.40             →  20 min   (needs immediate reinforcement)
  0.40 ≤ p < 0.70      →  1 day    (spaced repetition baseline)
  p ≥ 0.70             →  3–7 days (linearly interpolated)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.models import AttemptMeta, ErrorType, MasteryItem, ProbeSet, Rubric
from app.services.assessment_scorer import AssessmentScorer
from app.services.minimax_client import MiniMaxClient, SchemaHint, get_minimax_client
from app.storage import get_storage
from app.storage.dynamo import DynamoStorage, _from_decimal, _strip_meta

logger = logging.getLogger("prosocratic.microassess")

# ── Tunable constants ──────────────────────────────────────────────────────────

ALPHA: float = 0.6              # mastery update learning rate
_WEIGHTS: dict[str, float] = {"recall": 1.0, "transfer": 1.5}
_P_LOW: float = 0.40            # below this: short re-probe interval
_P_HIGH: float = 0.70           # above this: multi-day interval
_DELAY_SHORT_MIN: int = 20      # minutes for p < _P_LOW
_P_CLAMP_LOW: float = 0.05
_P_CLAMP_HIGH: float = 0.95

# ── MiniMax schema ─────────────────────────────────────────────────────────────

_GENERATE_SCHEMA: SchemaHint = {
    "recall_probe": str,
    "transfer_probe": str,
    "key_points": list,
    "common_mistakes": list,
}

_GENERATE_SYSTEM = """\
You are an expert micro-assessment designer for adaptive learning systems.
Given a student's current study page, generate a paired micro-assessment grounded
in the provided content.

Components to produce:
  recall_probe   — Tests direct memory of the core idea (closed-book style).
                   Must be answerable in 2–5 sentences. No yes/no questions.
  transfer_probe — Tests application of the concept in a novel context.
                   Must require inference beyond what is stated on the page.
  key_points     — 2–4 essential things the ideal answer must include.
  common_mistakes— 1–3 typical errors students make on THIS specific topic.

Difficulty guide:
  easy  — single-step recall; direct application; no inferential leap.
  med   — multi-step reasoning; connect two or more concepts.
  hard  — synthesis, edge cases, or counterexample reasoning.

Anchor every probe in the provided headings and content snippet.
Do NOT invent topics absent from the material.

Respond ONLY with valid JSON:
{
  "recall_probe":    "<question>",
  "transfer_probe":  "<question>",
  "key_points":      ["<point>", ...],
  "common_mistakes": ["<mistake>", ...]
}
"""


def _build_generate_prompt(
    topic_label: str,
    difficulty: str,
    headings: list[str],
    snippet: str,
) -> str:
    heading_block = (
        "\n".join(f"  • {h}" for h in headings) if headings else "  (none)"
    )
    return (
        f"Topic: {topic_label}\n"
        f"Difficulty: {difficulty}\n\n"
        f"Page headings:\n{heading_block}\n\n"
        f"Content excerpt:\n{snippet or '(empty)'}\n\n"
        "Generate the micro-assessment."
    )


# ── Pure maths helpers (exported for unit tests) ───────────────────────────────


def update_mastery_p(p_old: float, score: float, probe_type: str) -> float:
    """
    Bayesian-style mastery update.

    Args:
        p_old:      Current mastery estimate [0.05, 0.95].
        score:      MiniMax-derived score in [0.0, 1.0].
        probe_type: "recall" (weight 1.0) or "transfer" (weight 1.5).

    Returns:
        Updated mastery clamped to [P_CLAMP_LOW, P_CLAMP_HIGH].
    """
    weight = _WEIGHTS.get(probe_type, 1.0)
    p_new = p_old + ALPHA * (score - p_old) * weight
    return round(max(_P_CLAMP_LOW, min(_P_CLAMP_HIGH, p_new)), 6)


def next_probe_delay_minutes(p: float) -> int:
    """
    Spaced-repetition scheduling policy.

    Returns the number of minutes until the next probe attempt.
    """
    if p < _P_LOW:
        return _DELAY_SHORT_MIN
    if p < _P_HIGH:
        return 24 * 60  # 1 day
    # Linearly interpolate between 3 days (p=0.70) and 7 days (p=0.95).
    frac = min((p - _P_HIGH) / (_P_CLAMP_HIGH - _P_HIGH), 1.0)
    days = 3.0 + frac * 4.0
    return round(days * 24 * 60)


# ── Result types ───────────────────────────────────────────────────────────────


@dataclass
class GenerateResult:
    probe_set_id: str
    recall_probe: str
    transfer_probe: str
    key_points: list[str]
    common_mistakes: list[str]
    difficulty_tag: str


@dataclass
class SubmitResult:
    score_0_1: float
    error_type: str
    feedback: str
    next_probe_time: datetime
    p_mastery_new: float


# ── Service ────────────────────────────────────────────────────────────────────


class MicroAssessService:
    """
    Orchestrator for the micro-assessment lifecycle.

    All three dependencies are injectable for testing:
        service = MicroAssessService(
            client=mock_minimax,
            scorer=mock_scorer,
            storage=mock_storage,
        )
    """

    def __init__(
        self,
        client: MiniMaxClient | None = None,
        scorer: AssessmentScorer | None = None,
        storage: DynamoStorage | None = None,
    ) -> None:
        self._client = client or get_minimax_client()
        self._scorer = scorer or AssessmentScorer(client=self._client)
        self._storage = storage or get_storage()

    # ── Private helpers ────────────────────────────────────────────────────────

    def _load_probe_set(self, user_id: str, probe_set_id: str) -> ProbeSet | None:
        response = self._storage._assessments().get_item(
            Key={"user_id": user_id, "probe_set_id": probe_set_id}
        )
        item = response.get("Item")
        if not item:
            return None
        return ProbeSet.model_validate(_from_decimal(_strip_meta(item)))

    # ── Public API ─────────────────────────────────────────────────────────────

    async def generate(
        self,
        user_id: str,
        session_id: str,
        topic_label: str,
        headings: list[str],
        cleaned_text_snippet: str,   # EPHEMERAL — used in prompt only, never logged
        difficulty: str,
    ) -> GenerateResult:
        """
        Generate a paired micro-assessment grounded in the student's page context.

        PRIVACY: headings and cleaned_text_snippet are used inside the MiniMax
        prompt string only.  They are not stored, not logged, not returned.
        """
        user_prompt = _build_generate_prompt(
            topic_label=topic_label,
            difficulty=difficulty,
            headings=headings,
            snippet=cleaned_text_snippet,
        )

        logger.debug(
            {
                "event": "microassess_generate_request",
                "topic_label": topic_label,
                "difficulty": difficulty,
                "heading_count": len(headings),
                "snippet_len": len(cleaned_text_snippet),
                # content NOT logged
            }
        )

        data = await self._client.minimax_chat_json(
            system_prompt=_GENERATE_SYSTEM,
            user_prompt=user_prompt,
            schema_hint=_GENERATE_SCHEMA,
            temperature=0.3,
            max_tokens=2048,  # reasoning model needs headroom: ~300-400 for CoT + ~600 JSON output
        )

        # Extract and coerce list fields in case the model returned strings.
        key_points: list[str] = [str(p) for p in (data.get("key_points") or [])][:5]
        common_mistakes: list[str] = [str(m) for m in (data.get("common_mistakes") or [])][:4]

        if not key_points:
            key_points = [f"Core concept of {topic_label}"]

        rubric = Rubric(
            key_points=key_points,
            common_mistakes=common_mistakes,
            difficulty_tag=difficulty,
        )
        probe_set = ProbeSet(
            user_id=user_id,
            session_id=session_id,
            topic_label=topic_label,
            recall_probe=data["recall_probe"],
            transfer_probe=data["transfer_probe"],
            rubric=rubric,
        )
        self._storage.save_probe_set(probe_set)

        logger.info(
            {
                "event": "microassess_generated",
                "probe_set_id": probe_set.probe_set_id,
                "topic_label": topic_label,
                "difficulty": difficulty,
            }
        )

        return GenerateResult(
            probe_set_id=probe_set.probe_set_id,
            recall_probe=probe_set.recall_probe,
            transfer_probe=probe_set.transfer_probe,
            key_points=key_points,
            common_mistakes=common_mistakes,
            difficulty_tag=difficulty,
        )

    async def submit(
        self,
        user_id: str,
        probe_set_id: str,
        probe_type: str,
        answer_text: str,            # EPHEMERAL — passed to scorer only, never stored/logged
    ) -> SubmitResult:
        """
        Score the student's answer, persist AttemptMeta, and update mastery.

        PRIVACY: answer_text is forwarded to AssessmentScorer which uses it inside
        the MiniMax prompt only.  It is not stored in AttemptMeta or any log record.
        """
        # ── Load ProbeSet ──────────────────────────────────────────────────────
        probe_set = self._load_probe_set(user_id, probe_set_id)
        if probe_set is None:
            raise ValueError(f"ProbeSet {probe_set_id!r} not found for user {user_id!r}")

        # ── Score (answer_text is ephemeral inside scorer) ─────────────────────
        attempt_meta, feedback = await self._scorer.score_answer(
            probe_set=probe_set,
            probe_type=probe_type,
            answer_text=answer_text,
        )

        # ── Persist derived metadata only (no raw answer) ──────────────────────
        self._storage.append_probe_attempt_meta(user_id, probe_set_id, attempt_meta)

        # ── Bayesian mastery update ────────────────────────────────────────────
        profile = self._storage.get_or_create_user(user_id)
        topic_label = probe_set.topic_label
        existing = profile.mastery_by_topic.get(topic_label)
        p_old = existing.p_mastery if existing else 0.0

        p_new = update_mastery_p(p_old, attempt_meta.score_0_1, probe_type)

        now = datetime.now(UTC)
        delay_min = next_probe_delay_minutes(p_new)
        next_probe_at = now + timedelta(minutes=delay_min)

        updated_mastery = MasteryItem(
            p_mastery=p_new,
            last_probe_at=now,
            next_probe_at=next_probe_at,
        )
        self._storage.update_mastery(user_id, topic_label, updated_mastery)

        logger.info(
            {
                "event": "microassess_submitted",
                "probe_set_id": probe_set_id,
                "probe_type": probe_type,
                "score_0_1": attempt_meta.score_0_1,
                "p_mastery_old": round(p_old, 4),
                "p_mastery_new": round(p_new, 4),
                "next_probe_delay_min": delay_min,
                # answer_text NOT logged
            }
        )

        return SubmitResult(
            score_0_1=attempt_meta.score_0_1,
            error_type=attempt_meta.error_type.value,
            feedback=feedback,
            next_probe_time=next_probe_at,
            p_mastery_new=p_new,
        )


def get_microassess_service() -> MicroAssessService:
    """Factory — call inside route handlers (allows patching in tests)."""
    return MicroAssessService()
