"""
Question answering and Socratic follow-up engine.

Two responsibilities:
1. answer_question()  — given an ephemeral page_context snippet and a student
   question, call MiniMax to produce a direct answer + a Socratic follow-up.
2. suggest_unasked()  — given an accepted concept, identify the highest-value
   adjacent concept not yet covered and return a probe question for it.

PRIVACY:
- page_context is accepted as a parameter for prompt construction ONLY.
- It is NEVER passed to the storage layer, logged, or persisted anywhere.
- The PrivacyFilter in core/logging.py provides a secondary safety net.
"""

from __future__ import annotations

import json
import logging
import re

from app.services.minimax_client import MiniMaxClient, get_minimax_client

logger = logging.getLogger("prosocratic.question_engine")

# ── System prompts ─────────────────────────────────────────────────────────────

_ANSWER_SYSTEM = """\
You are a Socratic tutor helping a student understand a topic.
Given a snippet of the page the student is currently reading and their question,
do two things:

1. Give a clear, direct answer to the question (2-4 sentences max).
2. Generate one Socratic follow-up question that pushes the student one level deeper.
   - If the student asked "what is X", the follow-up should ask "why does X work?" or
     "what would happen if X were different?"
   - Never ask the student to look something up. Ask them to reason.

Respond ONLY with valid JSON in this exact shape:
{
  "direct_answer": "<string>",
  "follow_up": {
    "question": "<string>",
    "type": "socratic"
  }
}
"""

_UNASKED_SYSTEM = """\
You are a learning-gap analyst. Given a concept the student just demonstrated
understanding of, identify the single most important adjacent concept they should
explore next but probably have not yet covered.

Rules:
- Choose a concept that is prerequisite-adjacent or consequence-adjacent.
- Do NOT choose a concept they obviously already know if they understood the given one.
- Frame the probe as a single open question (not a yes/no).

Respond ONLY with valid JSON in this exact shape:
{
  "concept": "<concept name, 1-5 words>",
  "probe": "<open question that leads the student to discover this concept>",
  "entry_point": "<a 1-sentence hook that makes the student curious about this concept>"
}
"""

_PROBE_SYSTEM = """\
You are an expert at designing retrieval-practice questions.
Given a topic label and a rubric describing the key points, generate:
1. A recall probe: tests whether the student can reproduce the core idea from memory.
2. A transfer probe: tests whether the student can apply the concept to a new situation.

Both questions must be answerable in 2-4 sentences. Avoid yes/no questions.

Respond ONLY with valid JSON in this exact shape:
{
  "recall_probe": "<question>",
  "transfer_probe": "<question>"
}
"""


# ── Output types ───────────────────────────────────────────────────────────────


class AnswerResult:
    __slots__ = ("direct_answer", "follow_up_question", "follow_up_type")

    def __init__(self, direct_answer: str, follow_up_question: str, follow_up_type: str) -> None:
        self.direct_answer = direct_answer
        self.follow_up_question = follow_up_question
        self.follow_up_type = follow_up_type


class UnaskedResult:
    __slots__ = ("concept", "probe", "entry_point")

    def __init__(self, concept: str, probe: str, entry_point: str) -> None:
        self.concept = concept
        self.probe = probe
        self.entry_point = entry_point


class ProbeResult:
    __slots__ = ("recall_probe", "transfer_probe")

    def __init__(self, recall_probe: str, transfer_probe: str) -> None:
        self.recall_probe = recall_probe
        self.transfer_probe = transfer_probe


# ── Engine ─────────────────────────────────────────────────────────────────────


class QuestionEngine:
    def __init__(self, client: MiniMaxClient | None = None) -> None:
        self._client = client or get_minimax_client()

    async def answer_question(
        self,
        page_context: str,
        question: str,
        topic_label: str | None = None,
    ) -> AnswerResult:
        """
        Generate a direct answer + Socratic follow-up for the student's question.

        PRIVACY: page_context is used ONLY inside the MiniMax prompt here.
        It is not stored, not logged, and not returned to any caller.
        """
        # Truncate page context to protect prompt budget and avoid storing intent.
        safe_context = page_context[:1800] if page_context else ""

        user_msg = (
            f"Page excerpt (study context):\n{safe_context}\n\n"
            f"Student question: {question}"
        )
        if topic_label:
            user_msg = f"Topic: {topic_label}\n\n{user_msg}"

        raw = await self._client.chat(
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=_ANSWER_SYSTEM,
            temperature=0.4,
            max_tokens=1200,  # reasoning model: ~300 CoT + ~900 answer
        )

        try:
            # MiniMax M2.5 is a reasoning model that may wrap output in
            # <think>...</think> tags and ```json fences. Strip both.
            cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
            cleaned = re.sub(r"```json\s*", "", cleaned)
            cleaned = re.sub(r"```\s*$", "", cleaned).strip()
            data = json.loads(cleaned)
            return AnswerResult(
                direct_answer=data["direct_answer"],
                follow_up_question=data["follow_up"]["question"],
                follow_up_type=data["follow_up"].get("type", "socratic"),
            )
        except (json.JSONDecodeError, KeyError):
            # Graceful degradation: return raw text as answer with no follow-up.
            logger.warning({"event": "answer_parse_failed", "raw_length": len(raw)})
            return AnswerResult(
                direct_answer=raw,
                follow_up_question="Can you explain that concept back to me in your own words?",
                follow_up_type="socratic",
            )

    async def suggest_unasked(
        self,
        accepted_concept: str,
        topic_label: str | None = None,
    ) -> UnaskedResult:
        """
        Given a concept the student just accepted/understood, suggest the most
        valuable adjacent concept they probably haven't covered yet.
        """
        user_msg = f"Concept the student just understood: {accepted_concept}"
        if topic_label:
            user_msg = f"Topic area: {topic_label}\n\n{user_msg}"

        raw = await self._client.chat(
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=_UNASKED_SYSTEM,
            temperature=0.5,
            max_tokens=900,  # reasoning model: ~300 CoT + ~600 output
        )

        try:
            data = json.loads(raw)
            return UnaskedResult(
                concept=data["concept"],
                probe=data["probe"],
                entry_point=data.get("entry_point", ""),
            )
        except (json.JSONDecodeError, KeyError):
            logger.warning({"event": "unasked_parse_failed", "raw_length": len(raw)})
            return UnaskedResult(
                concept="related concept",
                probe=f"What other ideas are closely connected to {accepted_concept}?",
                entry_point="",
            )

    async def generate_probes(
        self,
        topic_label: str,
        key_points: list[str],
        difficulty_tag: str = "intermediate",
    ) -> ProbeResult:
        """
        Generate recall and transfer probe questions for a topic.
        Used by the assessment route when creating a ProbeSet.
        """
        user_msg = (
            f"Topic: {topic_label}\n"
            f"Difficulty: {difficulty_tag}\n"
            f"Key points to assess:\n"
            + "\n".join(f"- {kp}" for kp in key_points[:5])
        )

        raw = await self._client.chat(
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=_PROBE_SYSTEM,
            temperature=0.3,
            max_tokens=1200,  # reasoning model: ~400 CoT + ~800 output
        )

        try:
            data = json.loads(raw)
            return ProbeResult(
                recall_probe=data["recall_probe"],
                transfer_probe=data["transfer_probe"],
            )
        except (json.JSONDecodeError, KeyError):
            logger.warning({"event": "probe_parse_failed", "raw_length": len(raw)})
            return ProbeResult(
                recall_probe=f"In your own words, explain the main idea of {topic_label}.",
                transfer_probe=f"Give an example of {topic_label} in a context not mentioned in your notes.",
            )


def get_question_engine() -> QuestionEngine:
    return QuestionEngine()
