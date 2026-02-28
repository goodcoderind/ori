"""
Socratic Engine — generates the "unasked question" for the student's current page.

PRIVACY INVARIANTS (enforced in this module):
  - page_context (headings + cleaned_text_snippet) is used ONLY inside the
    MiniMax prompt string.  It is NEVER attached to any log record, NEVER
    returned to the caller inside the result object, and NEVER passed to the
    storage layer.
  - Log calls in this module emit only metadata (topic length, snippet length,
    result type).  No content from the page or the model's raw output is logged.

Content-sufficiency gate:
  If headings are absent AND the snippet is fewer than MIN_SNIPPET_CHARS
  characters, MiniMax is NOT called.  A deterministic meta-question is returned
  instead ("What part of this is confusing you?").  This avoids wasting LLM
  tokens on empty or near-empty inputs and gives the student a useful prompt
  regardless.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.services.minimax_client import MiniMaxClient, MiniMaxError, SchemaHint, get_minimax_client

logger = logging.getLogger("prosocratic.socratic_engine")

# ── Constants ──────────────────────────────────────────────────────────────────

# Snippet must be at least this long (or headings must be present) for us to
# attempt a grounded Socratic question instead of a generic meta-question.
MIN_SNIPPET_CHARS: int = 50

# Schema the MiniMax response must conform to.
_SCHEMA: SchemaHint = {
    "unasked_question": str,
    "followups": list,
    "rationale": str,
}

# Pool of meta-questions returned when content is insufficient.
# Indexed deterministically so the service stays testable with fixed inputs.
_META_QUESTIONS: list[str] = [
    "What part of this material is confusing you most right now?",
    "Which concept in this section feels least clear to you?",
    "What would you need to understand first to make sense of this topic?",
]

_META_FOLLOWUPS: list[str] = [
    "Try putting the confusing idea into your own words.",
    "What do you already know that might be connected to this?",
]

# ── Prompts ────────────────────────────────────────────────────────────────────

_SYSTEM = """\
You are a Socratic learning companion. Your job is to surface the single most
important question a student should be asking about their current study material
— a question they haven't thought to ask yet.

Rules:
1. Ground the question in the specific headings and content snippet provided.
   Do NOT invent topics that aren't in the material.
2. Target underlying mechanisms, causes, or implications — not simple recall.
3. Provide 1–3 short follow-up prompts (each ≤ 15 words) that scaffold the
   student toward reasoning through the answer themselves.
4. The "rationale" must explain in one sentence WHY this is the key question.
5. If the provided content is too short, vague, or lacks educational substance,
   return a meta-question that asks the student what they're finding confusing
   or what they want to understand. Set rationale to "Content was insufficient
   for a specific question."

Respond ONLY with valid JSON in exactly this shape:
{
  "unasked_question": "<the key question the student should be asking>",
  "followups": ["<scaffold prompt 1>", "<scaffold prompt 2>"],
  "rationale": "<one sentence explaining why this question matters>"
}
"""


def _build_user_prompt(
    topic_label: str,
    headings: list[str],
    cleaned_text_snippet: str,
) -> str:
    heading_block = (
        "\n".join(f"  • {h}" for h in headings)
        if headings
        else "  (none provided)"
    )
    # snippet is already validated ≤ 2500 chars at the API boundary
    return (
        f"Topic: {topic_label}\n\n"
        f"Headings on this page:\n{heading_block}\n\n"
        f"Content excerpt the student is currently reading:\n"
        f"{cleaned_text_snippet or '(empty)'}\n\n"
        "What is the most important question this student should be asking "
        "but isn't?"
    )


# ── Data types ─────────────────────────────────────────────────────────────────


@dataclass
class PageContext:
    headings: list[str]
    cleaned_text_snippet: str   # already validated ≤ 2500 chars at API boundary


@dataclass
class SocraticResult:
    unasked_question: str
    followups: list[str]
    rationale: str
    is_meta: bool = False       # True when content was insufficient → meta-question used


# ── Engine ─────────────────────────────────────────────────────────────────────


class SocraticEngine:
    """
    Generates Socratic "unasked questions" grounded in the student's current page.

    Inject a mock MiniMaxClient in tests to avoid real network calls:
        engine = SocraticEngine(client=mock_minimax_client)
    """

    def __init__(self, client: MiniMaxClient | None = None) -> None:
        self._client = client or get_minimax_client()

    def _is_sufficient(self, ctx: PageContext) -> bool:
        """
        Content is sufficient if there is at least one heading OR the snippet
        contains at least MIN_SNIPPET_CHARS non-whitespace characters.
        """
        return bool(ctx.headings) or len(ctx.cleaned_text_snippet.strip()) >= MIN_SNIPPET_CHARS

    def _meta_question(self, topic_label: str) -> SocraticResult:
        """
        Return a deterministic meta-question for the given topic.
        Determinism is important for test predictability.
        """
        idx = hash(topic_label) % len(_META_QUESTIONS)
        return SocraticResult(
            unasked_question=_META_QUESTIONS[idx],
            followups=_META_FOLLOWUPS,
            rationale="Content was insufficient for a specific grounded question.",
            is_meta=True,
        )

    async def generate_unasked_question(
        self,
        topic_label: str,
        page_context: PageContext,
    ) -> SocraticResult:
        """
        Generate the unasked question for the student's current page context.

        PRIVACY: page_context is used only inside the MiniMax prompt.
        This method does NOT log any content from page_context or the model reply.
        Only metadata (topic_label, snippet_len, is_meta) is logged.

        Raises:
            MiniMaxError: if the LLM call fails after all retries.
        """
        # ── Sufficiency gate ───────────────────────────────────────────────────
        if not self._is_sufficient(page_context):
            logger.info(
                {
                    "event": "socratic_meta_fallback",
                    "topic_label": topic_label,
                    "reason": "insufficient_content",
                }
            )
            return self._meta_question(topic_label)

        # ── Build prompt (content stays inside the string, never logged) ───────
        user_prompt = _build_user_prompt(
            topic_label=topic_label,
            headings=page_context.headings,
            cleaned_text_snippet=page_context.cleaned_text_snippet,
        )

        logger.debug(
            {
                "event": "socratic_llm_request",
                "topic_label": topic_label,
                "heading_count": len(page_context.headings),
                "snippet_len": len(page_context.cleaned_text_snippet),
                # content itself is NOT logged
            }
        )

        # ── LLM call ───────────────────────────────────────────────────────────
        data = await self._client.minimax_chat_json(
            system_prompt=_SYSTEM,
            user_prompt=user_prompt,
            schema_hint=_SCHEMA,
            temperature=0.5,
            max_tokens=1500,  # reasoning model: ~400 CoT + ~1100 question/followup output
        )

        # ── Build result (no raw content in log) ───────────────────────────────
        followups = data.get("followups", [])
        if not isinstance(followups, list):
            followups = [str(followups)]

        result = SocraticResult(
            unasked_question=data["unasked_question"],
            followups=[str(f) for f in followups[:3]],     # cap at 3
            rationale=data.get("rationale", ""),
            is_meta=False,
        )

        logger.debug(
            {
                "event": "socratic_llm_response",
                "topic_label": topic_label,
                "followup_count": len(result.followups),
                "is_meta": result.is_meta,
                # question text is NOT logged
            }
        )

        return result


def get_socratic_engine() -> SocraticEngine:
    """Factory — call inside route handlers (allows patching in tests)."""
    return SocraticEngine()
