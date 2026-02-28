"""
Assessment endpoints.

POST /v1/assessments/probe-sets           — create a ProbeSet (generate recall+transfer probes)
POST /v1/assessments/score                — score an answer; persist only AttemptMeta

PRIVACY:
- answer_text is accepted in the score request body ONLY.
- It is passed to AssessmentScorer which uses it inside the MiniMax prompt.
- answer_text is NEVER stored, NEVER logged (PrivacyFilter enforces this),
  and NEVER included in any response.
- Only the derived (score_0_1, error_type) are written to DynamoDB via AttemptMeta.
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import require_user_id
from app.models import ProbeSet, Rubric
from app.services.assessment_scorer import get_assessment_scorer
from app.services.minimax_client import MiniMaxError
from app.services.question_engine import get_question_engine
from app.storage import get_storage

router = APIRouter(prefix="/v1/assessments", tags=["assessments"])
logger = logging.getLogger("prosocratic.routes.assessments")

UserId = Annotated[str, Depends(require_user_id)]


# ── Request / Response schemas ─────────────────────────────────────────────────


class CreateProbeSetRequest(BaseModel):
    session_id: str
    topic_label: str = Field(max_length=256)
    key_points: list[str] = Field(min_length=1, max_length=10)
    common_mistakes: list[str] = Field(default_factory=list, max_length=5)
    difficulty_tag: str = Field(default="intermediate", max_length=64)


class CreateProbeSetResponse(BaseModel):
    probe_set_id: str
    recall_probe: str
    transfer_probe: str


class ScoreRequest(BaseModel):
    probe_set_id: str
    probe_type: Literal["recall", "transfer"]
    # PRIVACY: answer_text is ephemeral. Never stored or logged.
    answer_text: str = Field(
        max_length=2000,
        description="Student's free-text answer. Ephemeral — never persisted.",
    )


class ScoreResponse(BaseModel):
    score_0_1: float
    error_type: str
    feedback: str


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.post("/probe-sets", response_model=CreateProbeSetResponse, status_code=201)
async def create_probe_set(
    body: CreateProbeSetRequest,
    user_id: UserId,
) -> CreateProbeSetResponse:
    """
    Generate recall and transfer probe questions for a topic using MiniMax,
    then persist the ProbeSet to TABLE_ASSESSMENTS.

    The raw page content is NOT needed here — only the topic label and rubric
    key points (curated by the extension before sending).
    """
    engine = get_question_engine()
    try:
        probes = await engine.generate_probes(
            topic_label=body.topic_label,
            key_points=body.key_points,
            difficulty_tag=body.difficulty_tag,
        )
    except MiniMaxError as exc:
        logger.warning({"event": "minimax_error_probes", "status_code": exc.status_code})
        raise HTTPException(status_code=502, detail="LLM service unavailable — please retry.")

    rubric = Rubric(
        key_points=body.key_points,
        common_mistakes=body.common_mistakes,
        difficulty_tag=body.difficulty_tag,
    )
    probe_set = ProbeSet(
        user_id=user_id,
        session_id=body.session_id,
        topic_label=body.topic_label,
        recall_probe=probes.recall_probe,
        transfer_probe=probes.transfer_probe,
        rubric=rubric,
    )

    storage = get_storage()
    storage.save_probe_set(probe_set)

    # Also record this probe_set_id on the session.
    try:
        storage._sessions().update_item(
            Key={"user_id": user_id, "session_id": body.session_id},
            UpdateExpression=(
                "SET microassess_ids = list_append("
                "if_not_exists(microassess_ids, :empty), :new_id)"
            ),
            ExpressionAttributeValues={
                ":new_id": [probe_set.probe_set_id],
                ":empty": [],
            },
        )
    except Exception:
        pass  # Non-critical — session link failure doesn't block assessment.

    return CreateProbeSetResponse(
        probe_set_id=probe_set.probe_set_id,
        recall_probe=probe_set.recall_probe,
        transfer_probe=probe_set.transfer_probe,
    )


@router.post("/score", response_model=ScoreResponse)
async def score_answer(
    body: ScoreRequest,
    user_id: UserId,
) -> ScoreResponse:
    """
    Score a student's answer against the stored ProbeSet rubric.

    answer_text is used only inside the MiniMax scoring prompt and is then
    discarded. Only (score_0_1, error_type) are written to DynamoDB.
    """
    storage = get_storage()
    response = storage._assessments().get_item(
        Key={"user_id": user_id, "probe_set_id": body.probe_set_id}
    )
    item = response.get("Item")
    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"ProbeSet {body.probe_set_id!r} not found",
        )

    from app.storage.dynamo import _from_decimal, _strip_meta

    probe_set = ProbeSet.model_validate(_from_decimal(_strip_meta(item)))

    scorer = get_assessment_scorer()
    try:
        attempt_meta, feedback = await scorer.score_answer(
            probe_set=probe_set,
            probe_type=body.probe_type,
            answer_text=body.answer_text,  # ephemeral — scorer does not store it
        )
    except MiniMaxError as exc:
        logger.warning({"event": "minimax_error_score", "status_code": exc.status_code})
        raise HTTPException(status_code=502, detail="LLM service unavailable — please retry.")

    # Persist only the derived metadata — no raw answer text.
    storage.append_probe_attempt_meta(user_id, body.probe_set_id, attempt_meta)

    # Update technique stats if this was prompted by a technique suggestion.
    # (Improvement signal: scoring an assessment after a technique = success proxy.)
    storage.update_technique_stats(
        user_id=user_id,
        technique_id="active_recall",  # assessment itself counts as active recall engagement
        success_delta=1 if attempt_meta.score_0_1 >= 0.6 else 0,
    )

    return ScoreResponse(
        score_0_1=attempt_meta.score_0_1,
        error_type=attempt_meta.error_type.value,
        feedback=feedback,
    )
