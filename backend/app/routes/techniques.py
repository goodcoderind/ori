"""
Technique selection endpoint.

POST /v1/techniques/select — score all 9 techniques against current state,
                             return the winner with transparency card + alternatives.

No LLM call is made here — scoring is pure Python (see services/technique_scorer.py).
The storage layer is called to fetch the learner's technique history for the
success_rate component.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.security import require_user_id
from app.models import FeatureSummary, StateLabel
from app.services.technique_scorer import ScoredTechnique, select_technique
from app.storage import get_storage

router = APIRouter(prefix="/v1/techniques", tags=["techniques"])
logger = logging.getLogger("prosocratic.routes.techniques")

UserId = Annotated[str, Depends(require_user_id)]


# ── Request / Response schemas ─────────────────────────────────────────────────


class SelectRequest(BaseModel):
    state_label: StateLabel
    confidence: float = Field(ge=0.0, le=1.0)
    feature_summary: FeatureSummary
    session_id: str | None = None
    topic_label: str | None = Field(default=None, max_length=256)


class TransparencyCard(BaseModel):
    trigger_signals: list[str]
    why_chosen: str
    historical_success_rate: float
    time_estimate_minutes: int
    score_breakdown: dict[str, float]


class TechniqueResult(BaseModel):
    technique_id: str
    technique_name: str
    description: str
    score: float
    transparency: TransparencyCard


class SelectResponse(BaseModel):
    selected: TechniqueResult
    alternatives: list[TechniqueResult]


# ── Helpers ────────────────────────────────────────────────────────────────────


def _to_result(st: ScoredTechnique) -> TechniqueResult:
    why = (
        f"Your current state ({st.technique.cluster_affinities}) "
        f"aligns well with the {st.technique.name}. "
        f"Cluster affinity: {st.cosine_sim:.0%}, "
        f"your personal success rate: {st.success_rate:.0%}."
    )
    return TechniqueResult(
        technique_id=st.technique.id,
        technique_name=st.technique.name,
        description=st.technique.description,
        score=st.score,
        transparency=TransparencyCard(
            trigger_signals=st.trigger_signals,
            why_chosen=why,
            historical_success_rate=st.success_rate,
            time_estimate_minutes=st.technique.time_estimate_minutes,
            score_breakdown={
                "cosine_sim": st.cosine_sim,
                "success_rate": st.success_rate,
                "context_fit": st.context_fit,
                "fatigue_adj": st.fatigue_adj,
            },
        ),
    )


# ── Route ──────────────────────────────────────────────────────────────────────


@router.post("/select", response_model=SelectResponse)
async def select(
    body: SelectRequest,
    user_id: UserId,
) -> SelectResponse:
    """
    Score all 9 study techniques against the current behavioural state and
    return the top pick with a full transparency card, plus up to 2 alternatives.

    No LLM call is made — scoring is deterministic and instant.
    """
    storage = get_storage()
    profile = storage.get_or_create_user(user_id)

    ranked = select_technique(
        state_label=body.state_label,
        confidence=body.confidence,
        feature_summary=body.feature_summary,
        technique_history=profile.technique_stats,
    )

    logger.info(
        {
            "event": "technique_selected",
            "user_id": user_id,
            "state_label": body.state_label.value,
            "top_technique": ranked[0].technique.id if ranked else None,
        }
    )

    selected = _to_result(ranked[0])
    alternatives = [_to_result(st) for st in ranked[1:3]]  # top 2 alternatives

    return SelectResponse(selected=selected, alternatives=alternatives)
