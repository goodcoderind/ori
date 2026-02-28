"""
Technique selection and composite scoring.

Implements the ProSocratic scoring formula:

    Score = cosine_sim   × 0.4
          + success_rate × 0.3
          + context_fit  × 0.2
          + fatigue_adj  × 0.1

Where:
    cosine_sim   — cluster affinity of the technique for the observed StateLabel
                   (replaces FAISS cosine similarity; FAISS runs in the browser)
    success_rate — learner's historical success rate for this technique
    context_fit  — rule-based contextual signal (session length, fatigue, topic novelty)
    fatigue_adj  — negative weight when fatigue is high and technique is energy-intensive

The module is pure Python (no async, no I/O) so it is trivially testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models import FeatureSummary, StateLabel, TechniqueStatsEntry

# ── Technique registry ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Technique:
    id: str
    name: str
    description: str
    time_estimate_minutes: int
    allowed_under_fatigue: bool
    # StateLabel.value → affinity float (0.0–1.0)
    cluster_affinities: dict[str, float] = field(default_factory=dict)


TECHNIQUES: list[Technique] = [
    Technique(
        id="feynman",
        name="Feynman Technique",
        description=(
            "Explain the concept in your own words as if teaching someone who has never "
            "encountered it. Gaps in your explanation reveal gaps in your understanding."
        ),
        time_estimate_minutes=10,
        allowed_under_fatigue=False,
        cluster_affinities={
            StateLabel.CONFUSION.value: 1.0,
            StateLabel.MIND_WANDER.value: 0.5,
            StateLabel.OVERLOAD.value: 0.3,
            StateLabel.BOREDOM.value: 0.1,
        },
    ),
    Technique(
        id="modality_switching",
        name="Modality Switching",
        description=(
            "Switch to a different representation — a diagram, sketch, or analogy — "
            "to see the concept from a new angle."
        ),
        time_estimate_minutes=5,
        allowed_under_fatigue=True,
        cluster_affinities={
            StateLabel.BOREDOM.value: 0.8,
            StateLabel.MIND_WANDER.value: 0.7,
            StateLabel.CONFUSION.value: 0.4,
            StateLabel.OVERLOAD.value: 0.3,
        },
    ),
    Technique(
        id="elaborative_interrogation",
        name="Elaborative Interrogation",
        description=(
            "Ask 'why' and 'how' about every claim. Push each answer one level deeper "
            "than the material already takes you."
        ),
        time_estimate_minutes=8,
        allowed_under_fatigue=True,
        cluster_affinities={
            StateLabel.BOREDOM.value: 0.9,
            StateLabel.FLOW.value: 0.4,
            StateLabel.CONFUSION.value: 0.3,
            StateLabel.MIND_WANDER.value: 0.3,
        },
    ),
    Technique(
        id="pomodoro",
        name="Pomodoro Break",
        description=(
            "Step away for 5 minutes. Your brain consolidates information during rest, "
            "and fatigue degrades retention significantly."
        ),
        time_estimate_minutes=5,
        allowed_under_fatigue=True,
        # Pomodoro has no strong state-label affinity; its cosine_sim is boosted
        # directly by the fatigue_score in the scoring function below.
        cluster_affinities={
            StateLabel.BOREDOM.value: 0.6,
            StateLabel.MIND_WANDER.value: 0.5,
            StateLabel.FRUSTRATION.value: 0.4,
            StateLabel.OVERLOAD.value: 0.3,
        },
    ),
    Technique(
        id="active_recall",
        name="Active Recall",
        description=(
            "Close the material. From memory, write down everything you know about the topic. "
            "Open only to check gaps."
        ),
        time_estimate_minutes=10,
        allowed_under_fatigue=True,
        cluster_affinities={
            StateLabel.FLOW.value: 0.8,
            StateLabel.BOREDOM.value: 0.6,
            StateLabel.CONFUSION.value: 0.2,
        },
    ),
    Technique(
        id="analogy_generation",
        name="Analogy Generation",
        description=(
            "Create an analogy connecting this concept to something you already understand well. "
            "The stranger the analogy, the more memorable the connection."
        ),
        time_estimate_minutes=7,
        allowed_under_fatigue=True,
        cluster_affinities={
            StateLabel.BOREDOM.value: 0.7,
            StateLabel.MIND_WANDER.value: 0.6,
            StateLabel.CONFUSION.value: 0.5,
            StateLabel.FLOW.value: 0.3,
        },
    ),
    Technique(
        id="error_analysis",
        name="Error Analysis",
        description=(
            "Identify the exact point where your reasoning diverges from the correct path. "
            "Name the misconception, then correct it once."
        ),
        time_estimate_minutes=8,
        allowed_under_fatigue=False,
        cluster_affinities={
            StateLabel.FRUSTRATION.value: 0.8,
            StateLabel.CONFUSION.value: 0.7,
            StateLabel.OVERLOAD.value: 0.3,
        },
    ),
    Technique(
        id="chunking",
        name="Chunking",
        description=(
            "Break the material into the smallest meaningful units. Master one chunk before "
            "moving to the next. Avoid combining more than 3 chunks at once."
        ),
        time_estimate_minutes=10,
        allowed_under_fatigue=False,
        cluster_affinities={
            StateLabel.OVERLOAD.value: 1.0,
            StateLabel.CONFUSION.value: 0.5,
            StateLabel.FRUSTRATION.value: 0.3,
        },
    ),
    Technique(
        id="interleaving",
        name="Interleaving",
        description=(
            "Mix this topic with a related but distinct topic. The switching effort forces "
            "deeper discrimination and strengthens retrieval pathways."
        ),
        time_estimate_minutes=15,
        allowed_under_fatigue=True,
        cluster_affinities={
            StateLabel.FLOW.value: 0.8,
            StateLabel.BOREDOM.value: 0.7,
            StateLabel.MIND_WANDER.value: 0.4,
        },
    ),
]

TECHNIQUE_MAP: dict[str, Technique] = {t.id: t for t in TECHNIQUES}


# ── Scoring output ─────────────────────────────────────────────────────────────


@dataclass
class ScoredTechnique:
    technique: Technique
    score: float
    cosine_sim: float
    success_rate: float
    context_fit: float
    fatigue_adj: float
    trigger_signals: list[str]

    @property
    def transparency(self) -> dict:
        return {
            "technique_id": self.technique.id,
            "technique_name": self.technique.name,
            "description": self.technique.description,
            "time_estimate_minutes": self.technique.time_estimate_minutes,
            "score": self.score,
            "score_breakdown": {
                "cosine_sim": self.cosine_sim,
                "success_rate": self.success_rate,
                "context_fit": self.context_fit,
                "fatigue_adj": self.fatigue_adj,
            },
            "trigger_signals": self.trigger_signals,
            "historical_success_rate": self.success_rate,
        }


# ── Scoring function ───────────────────────────────────────────────────────────


def select_technique(
    state_label: StateLabel,
    confidence: float,
    feature_summary: FeatureSummary,
    technique_history: dict[str, TechniqueStatsEntry],
) -> list[ScoredTechnique]:
    """
    Score all 9 techniques and return them ranked by composite score (highest first).

    Techniques incompatible with the current fatigue level are excluded entirely.
    At least one technique is always returned (pomodoro is always allowed).

    Args:
        state_label:       Classifier state from the extension.
        confidence:        State classifier confidence (0–1).
        feature_summary:   Behavioural feature snapshot.
        technique_history: Dict mapping technique_id → TechniqueStatsEntry.

    Returns:
        Ranked list of ScoredTechnique (best first).
    """
    fatigue = feature_summary.fatigue_score or 0.0
    session_duration_s = feature_summary.session_duration_s or 0.0
    is_long_session = session_duration_s > 2700  # 45 min
    is_short_session = session_duration_s < 120  # < 2 min (first contact)

    trigger_signals: list[str] = []
    if feature_summary.confusion_confidence is not None:
        trigger_signals.append(f"confusion_confidence:{feature_summary.confusion_confidence:.2f}")
    if feature_summary.idle_gap_s is not None:
        trigger_signals.append(f"idle_gap_s:{feature_summary.idle_gap_s:.0f}s")
    if feature_summary.section_revisit_count is not None:
        trigger_signals.append(
            f"section_revisit_count:{feature_summary.section_revisit_count:.0f}"
        )
    if feature_summary.fatigue_score is not None:
        trigger_signals.append(f"fatigue_score:{feature_summary.fatigue_score:.2f}")
    if feature_summary.rushing_score is not None:
        trigger_signals.append(f"rushing_score:{feature_summary.rushing_score:.2f}")

    scored: list[ScoredTechnique] = []

    for tech in TECHNIQUES:
        if fatigue > 0.7 and not tech.allowed_under_fatigue:
            continue  # exclude high-energy techniques when student is fatigued

        # ── cosine_sim ──────────────────────────────────────────────────────────
        affinity = tech.cluster_affinities.get(state_label.value, 0.0)
        # Pomodoro gets a direct fatigue-driven boost since fatigue is a feature,
        # not a StateLabel (StateLabel has no FATIGUE variant).
        if tech.id == "pomodoro" and fatigue > 0.5:
            affinity = max(affinity, fatigue)
        # Confidence scales how strongly we trust the state classification.
        cosine_sim = affinity * max(confidence, 0.25)

        # ── success_rate ────────────────────────────────────────────────────────
        stats = technique_history.get(tech.id)
        success_rate = stats.success_rate if stats else 0.0

        # ── context_fit ─────────────────────────────────────────────────────────
        context_fit = 0.5  # neutral baseline
        if tech.id == "pomodoro" and is_long_session:
            context_fit = 1.0  # strongly appropriate after 45 min
        elif tech.id == "feynman" and confidence > 0.75:
            context_fit = 0.8  # high-confidence confusion → Feynman is a good bet
        elif is_short_session and tech.id in {"active_recall", "interleaving"}:
            context_fit = 0.2  # not enough material accumulated yet
        elif tech.id == "modality_switching" and (
            feature_summary.modality_dwell_s or 0.0
        ) > 300:
            context_fit = 0.9  # student has been on text for 5+ min

        # ── fatigue_adj (negative penalty) ──────────────────────────────────────
        # Allowed-under-fatigue techniques get no penalty.
        # Other techniques already filtered out above when fatigue > 0.7.
        fatigue_adj = 0.0
        if not tech.allowed_under_fatigue and fatigue > 0.3:
            fatigue_adj = -(fatigue * 0.4)

        # ── composite ───────────────────────────────────────────────────────────
        score = (
            cosine_sim * 0.4
            + success_rate * 0.3
            + context_fit * 0.2
            + fatigue_adj * 0.1
        )

        scored.append(
            ScoredTechnique(
                technique=tech,
                score=round(score, 4),
                cosine_sim=round(cosine_sim, 4),
                success_rate=round(success_rate, 4),
                context_fit=round(context_fit, 4),
                fatigue_adj=round(fatigue_adj, 4),
                trigger_signals=trigger_signals,
            )
        )

    # Guarantee at least pomodoro is always available.
    if not scored:
        pomodoro = TECHNIQUE_MAP["pomodoro"]
        scored.append(
            ScoredTechnique(
                technique=pomodoro,
                score=0.5,
                cosine_sim=0.5,
                success_rate=0.0,
                context_fit=0.5,
                fatigue_adj=0.0,
                trigger_signals=trigger_signals,
            )
        )

    return sorted(scored, key=lambda s: s.score, reverse=True)
