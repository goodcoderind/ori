"""
Question answering endpoints.

POST /v1/questions/answer    — direct answer + Socratic follow-up
POST /v1/questions/unasked   — suggest the next adjacent concept to explore

PRIVACY:
Both endpoints accept page_context (ephemeral page excerpt). This field is:
  - Used ONLY in the MiniMax prompt construction inside QuestionEngine.
  - NEVER stored in DynamoDB, NEVER persisted anywhere.
  - Stripped from all log output by PrivacyFilter in core/logging.py.

To enforce this at the schema level, page_context appears only in the request
body (validated at boundary) and is never placed in any response or storage model.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_user_id
from app.services.minimax_client import MiniMaxError
from app.services.question_engine import get_question_engine

router = APIRouter(prefix="/v1/questions", tags=["questions"])
logger = logging.getLogger("prosocratic.routes.questions")

UserId = Annotated[str, Depends(require_user_id)]


# ── Request / Response schemas ─────────────────────────────────────────────────


class AnswerRequest(BaseModel):
    # PRIVACY: page_context is ephemeral — never stored or logged.
    page_context: str = Field(
        max_length=2000,
        description="Ephemeral excerpt of the student's current page. Never persisted.",
    )
    question: str = Field(max_length=1000)
    topic_label: str | None = Field(default=None, max_length=256)
    session_id: str | None = None


class FollowUp(BaseModel):
    question: str
    type: str  # "socratic" | "elaborative"


class AnswerResponse(BaseModel):
    direct_answer: str
    follow_up: FollowUp


class UnaskedRequest(BaseModel):
    accepted_concept: str = Field(max_length=256)
    topic_label: str | None = Field(default=None, max_length=256)


class UnaskedResponse(BaseModel):
    concept: str
    probe: str
    entry_point: str


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.post("/answer", response_model=AnswerResponse)
async def answer_question(
    body: AnswerRequest,
    user_id: UserId,
) -> AnswerResponse:
    """
    Generate a direct answer to the student's question plus a Socratic follow-up.

    page_context is used only inside the MiniMax prompt and is discarded immediately.
    It does not appear in logs or responses.
    """
    engine = get_question_engine()
    try:
        result = await engine.answer_question(
            page_context=body.page_context,
            question=body.question,
            topic_label=body.topic_label,
        )
    except MiniMaxError as exc:
        logger.warning({"event": "minimax_error", "status_code": exc.status_code})
        raise HTTPException(
            status_code=502,
            detail="LLM service unavailable — please retry.",
        )

    return AnswerResponse(
        direct_answer=result.direct_answer,
        follow_up=FollowUp(
            question=result.follow_up_question,
            type=result.follow_up_type,
        ),
    )


@router.post("/unasked", response_model=UnaskedResponse)
async def suggest_unasked(
    body: UnaskedRequest,
    user_id: UserId,
) -> UnaskedResponse:
    """
    Given a concept the student just understood, suggest the highest-value
    adjacent concept they should explore next.
    """
    engine = get_question_engine()
    try:
        result = await engine.suggest_unasked(
            accepted_concept=body.accepted_concept,
            topic_label=body.topic_label,
        )
    except MiniMaxError as exc:
        logger.warning({"event": "minimax_error", "status_code": exc.status_code})
        raise HTTPException(status_code=502, detail="LLM service unavailable — please retry.")

    return UnaskedResponse(
        concept=result.concept,
        probe=result.probe,
        entry_point=result.entry_point,
    )
