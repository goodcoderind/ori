"""
ProSocratic Policy Engine — the ML-ish decision core.

Takes a snapshot of the student's behavioural state and user profile and
produces three things:

  1. ori_state      — what Ori avatar should display
  2. suggestion     — one intervention (or NONE), with title + CTA + payload
  3. transparency   — 2–4 human-readable signals + rationale for the suggestion

Design goals:
  - Pure Python, no I/O, no async → deterministic, instantly testable.
  - Stateless: all context passed as arguments.
  - Every output is explainable: no decision is made without a signal list.

Composite scoring formula (used for TECHNIQUE selection):
    score = 0.4 × state_fit
          + 0.3 × success_rate
          + 0.2 × context_fit
          − 0.1 × fatigue_penalty

Where:
    state_fit      — cluster affinity of the technique for the current StateLabel,
                     scaled by classifier confidence.
    success_rate   — learner's historical success rate for that technique.
    context_fit    — deterministic contextual bonus (session length, mastery, modality).
    fatigue_penalty — positive value subtracted to penalise high-energy techniques
                     when the student is tired.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models import (
    FeatureSummary,
    MasteryItem,
    OriState,
    StateLabel,
    SuggestionType,
    TechniqueStatsEntry,
)
from app.services.technique_scorer import TECHNIQUE_MAP

# ── Decision thresholds ────────────────────────────────────────────────────────

# Confidence: below MILD → stay silent; above STRONG → activate suggestion.
_MILD_CONFIDENCE: float = 0.45
_STRONG_CONFIDENCE: float = 0.65
# Confusion must exceed this to trigger a TECHNIQUE suggestion.
_CONFUSION_MIN_CONFIDENCE: float = 0.50

# Session duration
_LONG_SESSION_MIN: float = 45.0   # suggest BREAK at 45 min
_SHORT_SESSION_MIN: float = 5.0   # too early for recall / interleaving

# Feature signal thresholds
_HIGH_FATIGUE: float = 0.65       # above this: exclude high-energy techniques + FATIGUE state
_MILD_FATIGUE: float = 0.35       # above this: apply fatigue_penalty in scoring
_LONG_IDLE_S: float = 180.0       # 3 min idle → strong boredom / break signal
_HIGH_REVISIT: float = 2.0        # revisiting same section ≥ 2 times → confusion signal

# Sleep gate
_SLEEP_THRESHOLD: int = 3         # ignore_count ≥ this → set asleep_flag and go quiet

# Mastery threshold for post-insight MICRO_ASSESS
_MASTERY_LOCK_IN: float = 0.70    # below this → offer recall to "lock in" insight

# ── Eligible technique lists per state ────────────────────────────────────────
# Ordered: roughly best-a-priori first (tiebreaker when scores are equal).

_STATE_TECHNIQUES: dict[StateLabel, list[str]] = {
    StateLabel.CONFUSION: [
        "feynman", "chunking", "modality_switching", "elaborative_interrogation",
    ],
    StateLabel.FRUSTRATION: [
        "error_analysis", "feynman", "modality_switching",
    ],
    StateLabel.BOREDOM: [
        "elaborative_interrogation", "analogy_generation", "active_recall", "interleaving",
    ],
    StateLabel.MIND_WANDER: [
        "active_recall", "pomodoro", "modality_switching",
    ],
    StateLabel.OVERLOAD: [
        "chunking", "modality_switching", "pomodoro",
    ],
    StateLabel.FLOW:    [],
    StateLabel.INSIGHT: [],  # handled separately → MICRO_ASSESS, not TECHNIQUE
}

# ── Human-readable strings ─────────────────────────────────────────────────────

_STATE_DESCRIPTIONS: dict[StateLabel, str] = {
    StateLabel.CONFUSION:   "You appear to be stuck on this material",
    StateLabel.FRUSTRATION: "Signs of frustration detected",
    StateLabel.BOREDOM:     "Your engagement has dropped",
    StateLabel.MIND_WANDER: "Your attention has drifted from the material",
    StateLabel.OVERLOAD:    "Signs of cognitive overload detected",
    StateLabel.INSIGHT:     "You seem to have had a breakthrough moment",
    StateLabel.FLOW:        "You're focused and in flow",
}

_TECHNIQUE_CTA: dict[str, str] = {
    "feynman":                  "Explain it from scratch",
    "modality_switching":       "Try a diagram or visual",
    "elaborative_interrogation":"Ask why — dig one level deeper",
    "pomodoro":                 "Step away for 5 minutes",
    "active_recall":            "Close the page and test yourself",
    "analogy_generation":       "Find an analogy",
    "error_analysis":           "Find where your reasoning went wrong",
    "chunking":                 "Break it into smaller pieces",
    "interleaving":             "Briefly switch to a related topic",
}


# ── Input / Output dataclasses ─────────────────────────────────────────────────


@dataclass
class SessionContext:
    session_minutes: float
    ignore_count: int
    asleep_flag: bool


@dataclass
class UserContext:
    technique_stats: dict[str, TechniqueStatsEntry] = field(default_factory=dict)
    mastery_by_topic: dict[str, MasteryItem] = field(default_factory=dict)
    modality_pref: str | None = None


@dataclass
class Suggestion:
    type: SuggestionType
    technique_id: str | None = None
    title: str = ""
    cta: str = ""
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class TransparencyCard:
    why_detected: str
    signals: list[str]      # 2–4 human-readable trigger signals
    why_this: str
    user_success_rate: float | None = None


@dataclass
class PolicyOutput:
    ori_state: OriState
    suggestion: Suggestion
    transparency_card: TransparencyCard
    should_sleep: bool = False   # True → caller must set asleep_flag=True in DB


# ── Singleton no-op suggestion ─────────────────────────────────────────────────

_NO_SUGGESTION = Suggestion(type=SuggestionType.NONE, title="", cta="")
_BREAK_SUGGESTION = Suggestion(
    type=SuggestionType.BREAK,
    title="Take a break",
    cta="Step away for 5 minutes",
    payload={"duration_minutes": 5},
)
_MICRO_ASSESS_SUGGESTION = Suggestion(
    type=SuggestionType.MICRO_ASSESS,
    title="Quick recall check",
    cta="Test what you just learned",
    payload={"probe_type": "recall"},
)


# ── Internal scoring helpers ───────────────────────────────────────────────────


def _state_fit(technique_id: str, state_label: StateLabel, confidence: float) -> float:
    """Cluster affinity scaled by classifier confidence."""
    tech = TECHNIQUE_MAP.get(technique_id)
    if tech is None:
        return 0.0
    affinity = tech.cluster_affinities.get(state_label.value, 0.0)
    return affinity * max(confidence, 0.25)


def _success_rate(technique_id: str, technique_stats: dict[str, TechniqueStatsEntry]) -> float:
    """Historical success rate for the learner. Zero if no history."""
    stats = technique_stats.get(technique_id)
    return stats.success_rate if stats else 0.0


def _context_fit(
    technique_id: str,
    state_label: StateLabel,
    confidence: float,
    feature_summary: FeatureSummary,
    session_minutes: float,
    mastery_level: float,
    modality_pref: str | None,
) -> float:
    """
    Deterministic contextual bonus.  Returns a float in [0.0, 1.0].
    0.5 is the neutral baseline; above 0.5 means "extra appropriate right now".
    """
    dwell = feature_summary.modality_dwell_s or 0.0

    if technique_id == "pomodoro":
        if session_minutes > _LONG_SESSION_MIN:
            return 1.0
        if session_minutes > 25.0:
            return 0.7
        return 0.5

    if technique_id == "modality_switching":
        if modality_pref == "visual":
            return 0.85
        if dwell > 300.0:   # 5+ min on text
            return 0.80
        return 0.55

    if technique_id == "feynman":
        # High confidence in confusion → Feynman is a strong fit
        return 0.85 if confidence > 0.75 else 0.55

    if technique_id == "chunking":
        # New material benefits most from chunking
        return 0.80 if mastery_level < 0.2 else 0.50

    if technique_id == "active_recall":
        if session_minutes < _SHORT_SESSION_MIN:
            return 0.2   # not enough material accumulated yet
        return 0.70 if session_minutes > 20.0 else 0.50

    if technique_id == "interleaving":
        if session_minutes < _SHORT_SESSION_MIN:
            return 0.2
        return 0.70 if mastery_level > 0.5 else 0.50

    if technique_id == "elaborative_interrogation":
        return 0.80 if state_label is StateLabel.BOREDOM else 0.55

    if technique_id == "error_analysis":
        return 0.85 if state_label is StateLabel.FRUSTRATION and confidence > 0.6 else 0.45

    if technique_id == "analogy_generation":
        return 0.60   # broadly useful

    return 0.50  # neutral baseline


def _fatigue_penalty(technique_id: str, fatigue: float) -> float:
    """
    Positive penalty for techniques that are not suitable under fatigue.
    Subtracted with weight 0.1 in the composite formula.
    Returns 0.0 if the technique is allowed under fatigue.
    """
    tech = TECHNIQUE_MAP.get(technique_id)
    if tech is None or tech.allowed_under_fatigue:
        return 0.0
    # Scale with fatigue; only meaningful above _MILD_FATIGUE.
    return min(max(fatigue - _MILD_FATIGUE, 0.0) / (1.0 - _MILD_FATIGUE), 1.0)


def _score_technique(
    technique_id: str,
    state_label: StateLabel,
    confidence: float,
    feature_summary: FeatureSummary,
    session_minutes: float,
    mastery_level: float,
    technique_stats: dict[str, TechniqueStatsEntry],
    modality_pref: str | None,
) -> float:
    """
    Composite score:
        0.4 × state_fit  +  0.3 × success_rate  +  0.2 × context_fit
        − 0.1 × fatigue_penalty
    """
    fatigue = feature_summary.fatigue_score or 0.0
    tech = TECHNIQUE_MAP.get(technique_id)
    if tech is None:
        return 0.0

    # Hard-exclude high-energy techniques when fatigue is very high.
    if fatigue > _HIGH_FATIGUE and not tech.allowed_under_fatigue:
        return -1.0   # excluded from selection

    sf = _state_fit(technique_id, state_label, confidence)
    sr = _success_rate(technique_id, technique_stats)
    cf = _context_fit(
        technique_id, state_label, confidence,
        feature_summary, session_minutes, mastery_level, modality_pref,
    )
    fp = _fatigue_penalty(technique_id, fatigue)

    return round(0.4 * sf + 0.3 * sr + 0.2 * cf - 0.1 * fp, 6)


def _pick_best_technique(
    state_label: StateLabel,
    confidence: float,
    feature_summary: FeatureSummary,
    session_minutes: float,
    mastery_level: float,
    user_context: UserContext,
) -> str | None:
    """
    Score all techniques eligible for the current state and return the winner's ID.
    Returns None if the eligible list is empty or all techniques score ≤ 0.
    """
    candidates = _STATE_TECHNIQUES.get(state_label, [])
    if not candidates:
        return None

    best_id: str | None = None
    best_score: float = -999.0

    for tid in candidates:
        score = _score_technique(
            technique_id=tid,
            state_label=state_label,
            confidence=confidence,
            feature_summary=feature_summary,
            session_minutes=session_minutes,
            mastery_level=mastery_level,
            technique_stats=user_context.technique_stats,
            modality_pref=user_context.modality_pref,
        )
        if score > best_score:
            best_score = score
            best_id = tid

    return best_id if best_score > 0.0 else None


# ── Suggestion type decision ───────────────────────────────────────────────────


def _decide_suggestion_type(
    state_label: StateLabel,
    confidence: float,
    session_minutes: float,
    idle_gap_s: float,
    fatigue: float,
    mastery_level: float,
) -> SuggestionType:
    """
    Map state + context to the category of intervention (or NONE).
    """
    if state_label is StateLabel.FLOW:
        return SuggestionType.NONE

    if state_label is StateLabel.INSIGHT:
        # Offer a recall check to lock in the insight, unless mastery is already solid.
        return SuggestionType.MICRO_ASSESS if mastery_level < _MASTERY_LOCK_IN else SuggestionType.NONE

    # Overload always gets a break (cognitive relief takes priority).
    if state_label is StateLabel.OVERLOAD:
        return SuggestionType.BREAK

    # High fatigue overrides any other decision → break.
    if fatigue > _HIGH_FATIGUE:
        return SuggestionType.BREAK

    if state_label is StateLabel.BOREDOM:
        # Long session or extended idle → break; otherwise re-engage with a technique.
        if session_minutes > _LONG_SESSION_MIN or idle_gap_s > _LONG_IDLE_S:
            return SuggestionType.BREAK
        return SuggestionType.TECHNIQUE

    if state_label in {StateLabel.CONFUSION, StateLabel.FRUSTRATION}:
        # Only suggest if classifier is confident enough.
        return SuggestionType.TECHNIQUE if confidence >= _CONFUSION_MIN_CONFIDENCE else SuggestionType.NONE

    if state_label is StateLabel.MIND_WANDER:
        # Strong signal → gentle recall; weak signal → just notice.
        return SuggestionType.MICRO_ASSESS if confidence >= _STRONG_CONFIDENCE else SuggestionType.NONE

    return SuggestionType.NONE


# ── Ori state determination ────────────────────────────────────────────────────


def _determine_ori_state(
    state_label: StateLabel,
    confidence: float,
    fatigue: float,
    suggestion_type: SuggestionType,
) -> OriState:
    if state_label is StateLabel.FLOW:
        return OriState.IDLE

    if state_label is StateLabel.INSIGHT:
        return OriState.INSIGHT

    if state_label is StateLabel.FRUSTRATION:
        return OriState.FRUSTRATED

    if state_label is StateLabel.OVERLOAD or fatigue > _HIGH_FATIGUE:
        return OriState.FATIGUE

    if suggestion_type is not SuggestionType.NONE:
        return OriState.HAS_SOMETHING

    # Drifting but not confident enough / nothing to suggest yet.
    return OriState.NOTICING


# ── Signal extraction for transparency ────────────────────────────────────────


def _collect_signals(
    state_label: StateLabel,
    confidence: float,
    feature_summary: FeatureSummary,
    session_minutes: float,
) -> list[str]:
    """
    Return 2–4 human-readable signals ordered by diagnostic strength.
    The first entry is always the classifier state; subsequent entries pull
    from the most significant feature readings.
    """
    sigs: list[str] = [f"{state_label.value} (confidence {confidence:.0%})"]

    # Feature signals — add only if the value is noteworthy.
    candidates: list[tuple[float, str]] = []

    cc = feature_summary.confusion_confidence
    if cc is not None and cc > 0.5:
        candidates.append((cc, f"Confusion signal {cc:.0%}"))

    idle = feature_summary.idle_gap_s or 0.0
    if idle > 60.0:
        candidates.append((idle / _LONG_IDLE_S, f"Idle for {idle:.0f} s"))

    revisit = feature_summary.section_revisit_count or 0.0
    if revisit >= _HIGH_REVISIT:
        candidates.append((revisit / 5.0, f"Re-read same section {revisit:.0f}×"))

    fatigue = feature_summary.fatigue_score or 0.0
    if fatigue > _MILD_FATIGUE:
        candidates.append((fatigue, f"Fatigue score {fatigue:.0%}"))

    abandon = feature_summary.abandonment_rate or 0.0
    if abandon > 0.4:
        candidates.append((abandon, f"Abandonment rate {abandon:.0%}"))

    rushing = feature_summary.rushing_score or 0.0
    if rushing > 0.5:
        candidates.append((rushing, f"Rushing score {rushing:.0%}"))

    if session_minutes > _LONG_SESSION_MIN:
        candidates.append((
            session_minutes / 60.0,
            f"Studying for {session_minutes:.0f} min without a break",
        ))

    # Sort by diagnostic weight (highest first), take up to 3 to stay within 4 total.
    candidates.sort(key=lambda x: x[0], reverse=True)
    sigs.extend(c[1] for c in candidates[:3])

    # Guarantee at least 2 signals — session duration is always contextually relevant.
    if len(sigs) < 2:
        sigs.append(f"Session duration: {session_minutes:.0f} min")

    return sigs


def _why_detected(
    state_label: StateLabel,
    confidence: float,
    feature_summary: FeatureSummary,
    session_minutes: float,
) -> str:
    base = _STATE_DESCRIPTIONS.get(state_label, f"State: {state_label.value}")
    parts = [base]

    idle = feature_summary.idle_gap_s or 0.0
    revisit = feature_summary.section_revisit_count or 0.0

    if idle > _LONG_IDLE_S:
        parts.append(f"idle for {idle:.0f} s")
    elif revisit >= _HIGH_REVISIT:
        parts.append(f"re-read same section {revisit:.0f} times")
    elif session_minutes > _LONG_SESSION_MIN:
        parts.append(f"studied for {session_minutes:.0f} min without a break")

    return " — ".join(parts)


def _why_this(suggestion: Suggestion, success_rate: float | None) -> str:
    stype = suggestion.type

    if stype is SuggestionType.NONE:
        return "No intervention needed right now."

    if stype is SuggestionType.BREAK:
        return (
            "Rest consolidates memory. Stepping away for a few minutes "
            "will improve retention and reduce cognitive load."
        )

    if stype is SuggestionType.MICRO_ASSESS:
        return (
            "Testing yourself immediately after an insight "
            "significantly improves long-term retention (retrieval practice effect)."
        )

    if stype is SuggestionType.TECHNIQUE and suggestion.technique_id:
        tech = TECHNIQUE_MAP.get(suggestion.technique_id)
        name = tech.name if tech else suggestion.technique_id
        if success_rate is not None and success_rate > 0.0:
            return (
                f"{name} has the highest composite score for your current state "
                f"and has worked for you {success_rate:.0%} of the time."
            )
        return (
            f"{name} has the highest composite score for your current state. "
            "No personal history yet — this is a good time to try it."
        )

    return "Chosen to best match your current learning state."


# ── Suggestion builder ─────────────────────────────────────────────────────────


def _build_technique_suggestion(
    technique_id: str,
    technique_stats: dict[str, TechniqueStatsEntry],
) -> Suggestion:
    tech = TECHNIQUE_MAP.get(technique_id)
    if tech is None:
        return _NO_SUGGESTION
    return Suggestion(
        type=SuggestionType.TECHNIQUE,
        technique_id=technique_id,
        title=tech.name,
        cta=_TECHNIQUE_CTA.get(technique_id, "Try it"),
        payload={
            "description": tech.description,
            "time_estimate_minutes": tech.time_estimate_minutes,
        },
    )


# ── Main entry point ───────────────────────────────────────────────────────────


def evaluate(
    state_label: StateLabel,
    confidence: float,
    feature_summary: FeatureSummary,
    session_context: SessionContext,
    user_context: UserContext,
    topic_label: str | None = None,
) -> PolicyOutput:
    """
    Evaluate the current student state and produce an Ori response.

    Args:
        state_label:     Classifier output from the extension.
        confidence:      Classifier confidence (0–1).
        feature_summary: Allowlisted numeric behavioural features.
        session_context: Session duration, ignore count, asleep flag.
        user_context:    Technique history, mastery map, modality preference.
        topic_label:     Current study topic (used for mastery lookup).

    Returns:
        PolicyOutput with ori_state, suggestion, transparency_card, and
        should_sleep flag (True → caller must persist asleep_flag=True).
    """
    # ── 1. Sleep gate ────────────────────────────────────────────────────────
    already_asleep = session_context.asleep_flag
    hit_sleep_threshold = session_context.ignore_count >= _SLEEP_THRESHOLD
    should_sleep = hit_sleep_threshold and not already_asleep

    if already_asleep or hit_sleep_threshold:
        idle_card = TransparencyCard(
            why_detected="Ori is sleeping for the rest of this session.",
            signals=["ignore_count ≥ 3" if hit_sleep_threshold else "asleep_flag = True"],
            why_this="You've indicated you don't want suggestions right now.",
        )
        return PolicyOutput(
            ori_state=OriState.IDLE,
            suggestion=_NO_SUGGESTION,
            transparency_card=idle_card,
            should_sleep=should_sleep,
        )

    # ── 2. Derived values ────────────────────────────────────────────────────
    fatigue = feature_summary.fatigue_score or 0.0
    idle_gap_s = feature_summary.idle_gap_s or 0.0

    mastery_level: float = 0.0
    if topic_label and topic_label in user_context.mastery_by_topic:
        mastery_level = user_context.mastery_by_topic[topic_label].p_mastery

    # ── 3. Suggestion type ───────────────────────────────────────────────────
    suggestion_type = _decide_suggestion_type(
        state_label=state_label,
        confidence=confidence,
        session_minutes=session_context.session_minutes,
        idle_gap_s=idle_gap_s,
        fatigue=fatigue,
        mastery_level=mastery_level,
    )

    # ── 4. Technique selection ───────────────────────────────────────────────
    best_technique_id: str | None = None
    if suggestion_type is SuggestionType.TECHNIQUE:
        best_technique_id = _pick_best_technique(
            state_label=state_label,
            confidence=confidence,
            feature_summary=feature_summary,
            session_minutes=session_context.session_minutes,
            mastery_level=mastery_level,
            user_context=user_context,
        )
        if best_technique_id is None:
            suggestion_type = SuggestionType.NONE  # no viable technique

    # ── 5. Build suggestion ──────────────────────────────────────────────────
    if suggestion_type is SuggestionType.TECHNIQUE and best_technique_id:
        suggestion = _build_technique_suggestion(best_technique_id, user_context.technique_stats)
    elif suggestion_type is SuggestionType.BREAK:
        suggestion = _BREAK_SUGGESTION
    elif suggestion_type is SuggestionType.MICRO_ASSESS:
        suggestion = _MICRO_ASSESS_SUGGESTION
    else:
        suggestion = _NO_SUGGESTION

    # ── 6. Ori state ─────────────────────────────────────────────────────────
    ori_state = _determine_ori_state(state_label, confidence, fatigue, suggestion_type)

    # ── 7. Transparency card ─────────────────────────────────────────────────
    user_sr: float | None = None
    if best_technique_id:
        stats = user_context.technique_stats.get(best_technique_id)
        user_sr = stats.success_rate if stats else None

    signals = _collect_signals(state_label, confidence, feature_summary, session_context.session_minutes)
    transparency = TransparencyCard(
        why_detected=_why_detected(state_label, confidence, feature_summary, session_context.session_minutes),
        signals=signals,
        why_this=_why_this(suggestion, user_sr),
        user_success_rate=user_sr,
    )

    return PolicyOutput(
        ori_state=ori_state,
        suggestion=suggestion,
        transparency_card=transparency,
        should_sleep=False,
    )
