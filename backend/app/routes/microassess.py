"""
Micro-assessment endpoints.

POST /v1/microassess/generate  — generate probes + rubric from page context
POST /v1/microassess/submit    — score an answer and update mastery

PRIVACY:
  - page_context.cleaned_text_snippet is validated ≤ 2500 chars and passed to the
    MicroAssessService which uses it ONLY inside the MiniMax prompt.
    It is never stored, never returned, never logged.
  - answer_text is passed to the scorer inside MicroAssessService and is never
    stored, never returned, never logged.
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_user_id
from app.services.microassess_service import GenerateResult, MicroAssessService, SubmitResult, get_microassess_service
from app.services.minimax_client import MiniMaxError

router = APIRouter(prefix="/v1/microassess", tags=["assessments"])
logger = logging.getLogger("prosocratic.routes.microassess")

UserId = Annotated[str, Depends(require_user_id)]

# ── Request / Response schemas ─────────────────────────────────────────────────


class PageContextBody(BaseModel):
    headings: list[str] = Field(default_factory=list, max_length=20)
    cleaned_text_snippet: str = Field(
        default="",
        max_length=2500,
        description="Ephemeral page excerpt. Never stored or logged. Max 2500 chars.",
    )


class GenerateRequest(BaseModel):
    session_id: str
    topic_label: str = Field(max_length=256)
    page_context: PageContextBody
    difficulty: Literal["easy", "med", "hard"] = "med"


class RubricBody(BaseModel):
    key_points: list[str]
    common_mistakes: list[str]
    difficulty_tag: str


class GenerateResponse(BaseModel):
    probe_set_id: str
    recall_probe: str
    transfer_probe: str
    rubric: RubricBody


class SubmitRequest(BaseModel):
    probe_set_id: str
    probe_type: Literal["recall", "transfer"]
    answer_text: str = Field(
        max_length=3000,
        description="Student's answer. Ephemeral — never stored or logged.",
    )


class SubmitResponse(BaseModel):
    score_0_1: float
    error_type: str
    feedback: str
    next_probe_time: str   # ISO 8601 datetime string


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.post(
    "/generate",
    response_model=GenerateResponse,
    status_code=201,
    summary="Generate micro-assessment probes",
    description=(
        "Generate a recall probe, transfer probe, and rubric grounded in the "
        "student's current page content. `page_context` is ephemeral — used only "
        "inside the LLM prompt and never stored or logged."
    ),
)
async def generate(body: GenerateRequest, user_id: UserId) -> GenerateResponse:
    service: MicroAssessService = get_microassess_service()

    logger.debug(
        {
            "event": "microassess_generate_route",
            "session_id": body.session_id,
            "topic_label": body.topic_label,
            "difficulty": body.difficulty,
            "heading_count": len(body.page_context.headings),
            "snippet_len": len(body.page_context.cleaned_text_snippet),
            # content NOT logged
        }
    )

    try:
        result: GenerateResult = await service.generate(
            user_id=user_id,
            session_id=body.session_id,
            topic_label=body.topic_label,
            headings=body.page_context.headings,
            cleaned_text_snippet=body.page_context.cleaned_text_snippet,
            difficulty=body.difficulty,
        )
    except MiniMaxError as exc:
        logger.warning({"event": "microassess_generate_lm_error", "status_code": exc.status_code})
        raise HTTPException(status_code=502, detail="LLM service unavailable — please retry.")

    return GenerateResponse(
        probe_set_id=result.probe_set_id,
        recall_probe=result.recall_probe,
        transfer_probe=result.transfer_probe,
        rubric=RubricBody(
            key_points=result.key_points,
            common_mistakes=result.common_mistakes,
            difficulty_tag=result.difficulty_tag,
        ),
    )


@router.post(
    "/submit",
    response_model=SubmitResponse,
    summary="Submit and score an answer",
    description=(
        "Score the student's free-text answer against the stored rubric. "
        "`answer_text` is ephemeral — used only inside the LLM scoring prompt "
        "and is never stored. Only the derived score and error type are persisted."
    ),
)
async def submit(body: SubmitRequest, user_id: UserId) -> SubmitResponse:
    service: MicroAssessService = get_microassess_service()

    logger.debug(
        {
            "event": "microassess_submit_route",
            "probe_set_id": body.probe_set_id,
            "probe_type": body.probe_type,
            # answer_text NOT logged
        }
    )

    try:
        result: SubmitResult = await service.submit(
            user_id=user_id,
            probe_set_id=body.probe_set_id,
            probe_type=body.probe_type,
            answer_text=body.answer_text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except MiniMaxError as exc:
        logger.warning({"event": "microassess_submit_lm_error", "status_code": exc.status_code})
        raise HTTPException(status_code=502, detail="LLM service unavailable — please retry.")

    return SubmitResponse(
        score_0_1=result.score_0_1,
        error_type=result.error_type,
        feedback=result.feedback,
        next_probe_time=result.next_probe_time.isoformat(),
    )
