"""
Socratic question endpoint.

POST /v1/unasked-question

Returns the single most important question the student should be asking about
their current study page — the question they haven't thought to ask yet.

PRIVACY:
  - page_context.cleaned_text_snippet is validated to ≤ 2500 chars and then
    passed to the SocraticEngine which uses it ONLY inside the MiniMax prompt.
  - The snippet is never stored, never returned in the response, and never
    attached to any log record (enforced by the PrivacyFilter in core/logging.py
    and by the service's logging discipline).
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_user_id
from app.services.minimax_client import MiniMaxError
from app.services.socratic_engine import PageContext, get_socratic_engine

router = APIRouter(tags=["questions"])
logger = logging.getLogger("prosocratic.routes.socratic")

UserId = Annotated[str, Depends(require_user_id)]


# ── Request / Response schemas ─────────────────────────────────────────────────


class PageContextBody(BaseModel):
    headings: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Heading elements from the current page.",
    )
    cleaned_text_snippet: str = Field(
        default="",
        max_length=2500,
        description=(
            "Clean text excerpt from the page (Readability.js output). "
            "Ephemeral — never stored or logged. Max 2500 characters."
        ),
    )


class UnaskedQuestionRequest(BaseModel):
    session_id: str = Field(description="Active session ID.")
    topic_label: str = Field(max_length=256, description="Current study topic.")
    page_context: PageContextBody


class UnaskedQuestionResponse(BaseModel):
    unasked_question: str
    followups: list[str]
    rationale: str
    is_meta: bool = Field(
        description="True when content was insufficient and a meta-question was returned."
    )


# ── Route ──────────────────────────────────────────────────────────────────────


@router.post(
    "/v1/unasked-question",
    response_model=UnaskedQuestionResponse,
    summary="Generate the unasked Socratic question",
    description=(
        "Given the student's current page context, return the single most important "
        "question they should be asking but haven't thought to ask yet. "
        "`page_context` is ephemeral — it is used only inside the LLM prompt "
        "and is never stored or logged."
    ),
)
async def unasked_question(
    body: UnaskedQuestionRequest,
    user_id: UserId,
) -> UnaskedQuestionResponse:
    """
    Generate a grounded Socratic question from the page's headings and text.

    Returns a meta-question ("What part is confusing you?") when the provided
    content is too short to ground a specific question.
    """
    engine = get_socratic_engine()

    ctx = PageContext(
        headings=body.page_context.headings,
        cleaned_text_snippet=body.page_context.cleaned_text_snippet,
    )

    # Log only non-sensitive metadata — content stays out of logs.
    logger.debug(
        {
            "event": "unasked_question_request",
            "session_id": body.session_id,
            "topic_label": body.topic_label,
            "heading_count": len(ctx.headings),
            "snippet_len": len(ctx.cleaned_text_snippet),
            # page_context content is NOT logged
        }
    )

    try:
        result = await engine.generate_unasked_question(
            topic_label=body.topic_label,
            page_context=ctx,
        )
    except MiniMaxError as exc:
        logger.warning(
            {
                "event": "socratic_minimax_error",
                "session_id": body.session_id,
                "status_code": exc.status_code,
            }
        )
        raise HTTPException(
            status_code=502,
            detail="LLM service unavailable — please retry.",
        )

    return UnaskedQuestionResponse(
        unasked_question=result.unasked_question,
        followups=result.followups,
        rationale=result.rationale,
        is_meta=result.is_meta,
    )
