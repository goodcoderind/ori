"""
ProSocratic domain models.

PRIVACY INVARIANTS (enforced structurally):
- No `page_context` or `answer_text` field exists on any model.
- FeatureSummary is allowlisted + numeric-only; extra keys are rejected.
- ProbeSet stores only rubric metadata and derived scores — never raw answers.
- SessionEvent stores only behavioural state labels and feature metadata.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Enums ──────────────────────────────────────────────────────────────────────


class StateLabel(str, Enum):
    FLOW = "FLOW"
    MIND_WANDER = "MIND_WANDER"
    CONFUSION = "CONFUSION"
    FRUSTRATION = "FRUSTRATION"
    OVERLOAD = "OVERLOAD"
    BOREDOM = "BOREDOM"
    INSIGHT = "INSIGHT"


class OriState(str, Enum):
    IDLE = "IDLE"
    NOTICING = "NOTICING"
    HAS_SOMETHING = "HAS_SOMETHING"
    INSIGHT = "INSIGHT"
    FATIGUE = "FATIGUE"
    FRUSTRATED = "FRUSTRATED"


class SuggestionType(str, Enum):
    NONE = "NONE"
    MICRO_ASSESS = "MICRO_ASSESS"
    TECHNIQUE = "TECHNIQUE"
    BREAK = "BREAK"
    UNASKED_QUESTION = "UNASKED_QUESTION"


class ErrorType(str, Enum):
    CORRECT = "correct"
    MISSING_CORE_IDEA = "missing_core_idea"
    MISAPPLIED_RULE = "misapplied_rule"
    VAGUE = "vague"
    MISCONCEPTION = "misconception"
    OTHER = "other"


# ── Feature Summary ────────────────────────────────────────────────────────────
# Allowlisted keys only. All values are floats. extra="forbid" rejects unknown keys.
# None means "not recorded in this window" — excluded when serialised for storage.

FEATURE_ALLOWLIST: frozenset[str] = frozenset(
    {
        "keystroke_speed",
        "pause_count",
        "backspace_burst_count",
        "scroll_velocity",
        "section_revisit_count",
        "idle_gap_s",
        "modality_dwell_s",
        "click_density",
        "session_duration_s",
        "confusion_confidence",
        "fatigue_score",
        "rushing_score",
        "typing_acceleration",
        "forward_nav_rate",
        "peak_focus_windows",
        "abandonment_rate",
    }
)


class FeatureSummary(BaseModel):
    """
    Strictly-typed allowlist of behavioural feature values.
    All values are numeric (float). Unknown keys are rejected by extra="forbid".
    None means the feature was not observed in this window.
    """

    model_config = ConfigDict(extra="forbid")

    keystroke_speed: float | None = None
    pause_count: float | None = None
    backspace_burst_count: float | None = None
    scroll_velocity: float | None = None
    section_revisit_count: float | None = None
    idle_gap_s: float | None = None
    modality_dwell_s: float | None = None
    click_density: float | None = None
    session_duration_s: float | None = None
    confusion_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    fatigue_score: float | None = Field(default=None, ge=0.0, le=1.0)
    rushing_score: float | None = Field(default=None, ge=0.0, le=1.0)
    typing_acceleration: float | None = None
    forward_nav_rate: float | None = None
    peak_focus_windows: float | None = None
    abandonment_rate: float | None = Field(default=None, ge=0.0, le=1.0)

    def to_nonempty_dict(self) -> dict[str, float]:
        """Return only fields that have a recorded value (skip None)."""
        return {k: v for k, v in self.model_dump().items() if v is not None}

    @classmethod
    def from_partial(cls, data: dict[str, float]) -> "FeatureSummary":
        """
        Construct from a sparse dict.  Unknown keys raise ValidationError.
        Use this at the API boundary to reject unlisted keys early.
        """
        unknown = set(data) - FEATURE_ALLOWLIST
        if unknown:
            raise ValueError(
                f"Unknown feature key(s) not in allowlist: {sorted(unknown)}"
            )
        return cls(**data)


# ── Technique Stats ────────────────────────────────────────────────────────────


class TechniqueStatsEntry(BaseModel):
    shown_count: int = 0
    accepted_count: int = 0
    success_count: int = 0
    reward_sum: float = 0.0

    @property
    def acceptance_rate(self) -> float:
        return self.accepted_count / self.shown_count if self.shown_count > 0 else 0.0

    @property
    def success_rate(self) -> float:
        return self.success_count / self.accepted_count if self.accepted_count > 0 else 0.0


# ── Mastery ────────────────────────────────────────────────────────────────────


class MasteryItem(BaseModel):
    p_mastery: float = Field(default=0.0, ge=0.0, le=1.0)
    last_probe_at: datetime | None = None
    next_probe_at: datetime | None = None


# ── User Profile ───────────────────────────────────────────────────────────────


class UserProfile(BaseModel):
    """
    Stored in TABLE_USERS.  PK = user_id.

    No PII. user_id is a client-generated UUID that never maps to a real identity
    unless the user explicitly links their account via Cognito (optional cloud sync).
    """

    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    modality_pref: str | None = None
    technique_stats: dict[str, TechniqueStatsEntry] = Field(default_factory=dict)
    mastery_by_topic: dict[str, MasteryItem] = Field(default_factory=dict)


# ── Session Event ──────────────────────────────────────────────────────────────


class SessionEvent(BaseModel):
    """
    A single recorded state transition during a study session.

    PRIVACY:
    - url/title capture the study context but NOT the page body text.
    - feature_summary contains only numeric behavioural metadata.
    - No keystroke content, no page HTML, no student notes.
    """

    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))
    state_label: StateLabel
    confidence: float = Field(ge=0.0, le=1.0)
    url: str = Field(max_length=2048)
    title: str = Field(max_length=512)
    feature_summary: FeatureSummary
    ori_state: OriState
    suggestion_type: SuggestionType = SuggestionType.NONE
    suggestion_id: str | None = None  # references a technique or probe_set_id


# ── Rollup Summary ─────────────────────────────────────────────────────────────


class RolledUpSummary(BaseModel):
    """
    Aggregated counts for session events that were trimmed from the bounded list.
    Kept alongside the live events list so we don't lose history beyond MAX_EVENTS.
    """

    total_events: int = 0
    by_state: dict[str, int] = Field(default_factory=dict)
    suggestions_shown: int = 0


# ── Session Record ─────────────────────────────────────────────────────────────

MAX_EVENTS: int = 200
EVENTS_TRIM_TO: int = 150  # events kept in the live list after a rollup


class SessionRecord(BaseModel):
    """
    Stored in TABLE_SESSIONS.  PK = user_id, SK = session_id.
    expires_at (TTL) is set by the storage layer.
    """

    user_id: str
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    ended_at: datetime | None = None
    topic_label: str | None = None
    ignore_count: int = 0
    asleep_flag: bool = False
    events: list[SessionEvent] = Field(default_factory=list)
    microassess_ids: list[str] = Field(default_factory=list)
    rolled_up_summary: RolledUpSummary = Field(default_factory=RolledUpSummary)

    def append_event(self, event: SessionEvent) -> None:
        """
        Append a session event, rolling up old events into summary counters
        if the live list would exceed MAX_EVENTS.  This keeps DynamoDB item
        size predictable while preserving aggregate statistics.
        """
        self.events.append(event)
        if len(self.events) > MAX_EVENTS:
            self._rollup()

    def _rollup(self) -> None:
        """
        Roll the oldest (len - EVENTS_TRIM_TO) events into rolled_up_summary.
        After rollup, the live list contains exactly EVENTS_TRIM_TO entries.
        """
        split = len(self.events) - EVENTS_TRIM_TO
        to_roll = self.events[:split]
        self.events = self.events[split:]

        for ev in to_roll:
            self.rolled_up_summary.total_events += 1
            key = ev.state_label.value
            self.rolled_up_summary.by_state[key] = (
                self.rolled_up_summary.by_state.get(key, 0) + 1
            )
            if ev.suggestion_type is not SuggestionType.NONE:
                self.rolled_up_summary.suggestions_shown += 1

    @property
    def total_event_count(self) -> int:
        """Live events + events that were rolled up."""
        return len(self.events) + self.rolled_up_summary.total_events


# ── Rubric ─────────────────────────────────────────────────────────────────────


class Rubric(BaseModel):
    key_points: list[str] = Field(min_length=1)  # at least one key point required
    common_mistakes: list[str] = Field(default_factory=list)
    difficulty_tag: str  # e.g. "introductory", "intermediate", "advanced"


# ── Attempt Meta ───────────────────────────────────────────────────────────────


class AttemptMeta(BaseModel):
    """
    Derived assessment result.  PRIVACY: answer_text is NEVER stored here.
    Only the numeric score and classified error type are persisted.
    """

    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))
    probe_type: Literal["recall", "transfer"]
    score_0_1: float = Field(ge=0.0, le=1.0)
    error_type: ErrorType


# ── Probe Set ──────────────────────────────────────────────────────────────────


class ProbeSet(BaseModel):
    """
    Stored in TABLE_ASSESSMENTS.  PK = user_id, SK = probe_set_id.
    expires_at (TTL) is set by the storage layer.

    PRIVACY:
    - recall_probe and transfer_probe are the QUESTION texts generated by MiniMax.
    - The student's answer is NEVER stored here — only the derived AttemptMeta.
    - rubric contains model-generated rubric information, not student content.
    """

    model_config = ConfigDict(extra="forbid")  # reject page_context / answer_text

    user_id: str
    probe_set_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    topic_label: str
    recall_probe: str
    transfer_probe: str
    rubric: Rubric
    attempts_meta: list[AttemptMeta] = Field(default_factory=list)

    @field_validator("recall_probe", "transfer_probe")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Probe question must not be empty")
        return v
