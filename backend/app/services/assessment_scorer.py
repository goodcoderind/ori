"""
Assessment scoring — score a student's free-text answer against a ProbeSet rubric.

PRIVACY GUARANTEE:
- answer_text is accepted as a local parameter for prompt construction ONLY.
- It is NEVER passed to the storage layer, returned in any stored object,
  or attached to any log record.
- Only the derived (score_0_1, error_type, feedback) are returned to the caller.
- The caller (assessment route) stores only AttemptMeta, which contains no answer_text.
"""

from __future__ import annotations

import json
import logging

from app.models import AttemptMeta, ErrorType, ProbeSet
from app.services.minimax_client import MiniMaxClient, get_minimax_client

logger = logging.getLogger("prosocratic.assessment_scorer")

_SCORE_SYSTEM = """\
You are an expert educational assessor. You will receive:
- A probe question (either recall or transfer type)
- The rubric: key points the answer should cover and common mistakes to watch for
- The student's answer

Score the answer and classify the error type.

Scoring guide:
  1.0  — Complete, accurate, no gaps
  0.8  — Mostly correct, minor omission
  0.6  — Key idea present but vague or partially correct
  0.4  — Touches the topic but misses the core idea
  0.2  — Significant misconception or irrelevant
  0.0  — No meaningful engagement

Error types:
  correct           — answer is substantially correct
  missing_core_idea — answer is relevant but omits the central point
  misapplied_rule   — student applies a correct principle to the wrong context
  vague             — answer is too general to assess accurately
  misconception     — factually wrong or based on a flawed mental model
  other             — doesn't fit the above

Respond ONLY with valid JSON in this exact shape:
{
  "score_0_1": <float 0.0-1.0>,
  "error_type": "<one of the error types above>",
  "feedback": "<one sentence of constructive feedback; do not repeat the answer>"
}
"""


class AssessmentScorer:
    def __init__(self, client: MiniMaxClient | None = None) -> None:
        self._client = client or get_minimax_client()

    async def score_answer(
        self,
        probe_set: ProbeSet,
        probe_type: str,
        answer_text: str,
    ) -> tuple[AttemptMeta, str]:
        """
        Score answer_text against the probe_set rubric.

        PRIVACY: answer_text is used inside the MiniMax prompt and then discarded.
        It is not included in the returned AttemptMeta.

        Args:
            probe_set:   The ProbeSet containing the question and rubric.
            probe_type:  "recall" or "transfer".
            answer_text: The student's raw answer (ephemeral).

        Returns:
            (AttemptMeta, feedback_string)
            AttemptMeta contains only score_0_1 + error_type — no raw text.
        """
        question = (
            probe_set.recall_probe if probe_type == "recall" else probe_set.transfer_probe
        )
        rubric = probe_set.rubric

        user_msg = (
            f"Probe type: {probe_type}\n"
            f"Question: {question}\n\n"
            f"Rubric key points:\n"
            + "\n".join(f"- {kp}" for kp in rubric.key_points)
            + "\n\nCommon mistakes to watch for:\n"
            + "\n".join(f"- {m}" for m in rubric.common_mistakes)
            + f"\n\nDifficulty: {rubric.difficulty_tag}"
            + f"\n\nStudent answer:\n{answer_text[:1200]}"  # cap answer length
        )

        raw = await self._client.chat(
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=_SCORE_SYSTEM,
            temperature=0.2,  # low temperature for consistent scoring
            max_tokens=1000,  # reasoning model: ~300 CoT + ~700 JSON score output
        )

        score_0_1 = 0.4  # safe default
        error_type = ErrorType.OTHER
        feedback = "Keep working through it — you're on the right track."

        try:
            data = json.loads(raw)
            score_0_1 = max(0.0, min(1.0, float(data["score_0_1"])))
            error_type = ErrorType(data["error_type"])
            feedback = data.get("feedback", feedback)
        except (json.JSONDecodeError, KeyError, ValueError):
            logger.warning({"event": "score_parse_failed", "raw_length": len(raw)})

        attempt = AttemptMeta(
            probe_type=probe_type,  # type: ignore[arg-type]
            score_0_1=score_0_1,
            error_type=error_type,
        )
        # answer_text is intentionally NOT included in attempt or any log call.
        return attempt, feedback


def get_assessment_scorer() -> AssessmentScorer:
    return AssessmentScorer()
