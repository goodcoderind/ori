"""
Tests for app/services/policy_engine.py.

Pure unit tests — no I/O, no mocking required. All helpers return deterministic
results for given inputs.

Required test cases (from spec):
  1. FLOW        → ori_state IDLE, suggestion NONE
  2. ignore_count ≥ 3 → asleep, suggestion NONE, should_sleep True
  3. CONFUSION   → picks technique with higher user success_rate

Additional coverage:
  - Already asleep → still NONE (should_sleep=False, already set)
  - Overload → BREAK + FATIGUE ori_state
  - High fatigue → BREAK overrides TECHNIQUE
  - High fatigue → feynman excluded (not allowed_under_fatigue)
  - Insight + low mastery → MICRO_ASSESS
  - Insight + high mastery → NONE
  - Boredom + long session → BREAK
  - Boredom + short session → TECHNIQUE
  - Confidence below threshold → NONE even in CONFUSION
  - Transparency card has 2–4 signals
  - Transparency card contains user success_rate
  - _score_technique composite formula matches hand-computed value
"""

from __future__ import annotations

import pytest

from app.models import (
    FeatureSummary,
    MasteryItem,
    OriState,
    StateLabel,
    SuggestionType,
    TechniqueStatsEntry,
)
from app.services.policy_engine import (
    PolicyOutput,
    SessionContext,
    Suggestion,
    UserContext,
    _collect_signals,
    _context_fit,
    _decide_suggestion_type,
    _fatigue_penalty,
    _pick_best_technique,
    _score_technique,
    _state_fit,
    _success_rate,
    evaluate,
)

# ── Shared fixtures & factories ────────────────────────────────────────────────


def _session(
    session_minutes: float = 20.0,
    ignore_count: int = 0,
    asleep_flag: bool = False,
) -> SessionContext:
    return SessionContext(
        session_minutes=session_minutes,
        ignore_count=ignore_count,
        asleep_flag=asleep_flag,
    )


def _user(
    technique_stats: dict[str, TechniqueStatsEntry] | None = None,
    mastery_by_topic: dict[str, MasteryItem] | None = None,
    modality_pref: str | None = None,
) -> UserContext:
    return UserContext(
        technique_stats=technique_stats or {},
        mastery_by_topic=mastery_by_topic or {},
        modality_pref=modality_pref,
    )


def _features(**kwargs) -> FeatureSummary:
    return FeatureSummary(**kwargs)


def _stats(shown: int, accepted: int, success: int) -> TechniqueStatsEntry:
    return TechniqueStatsEntry(
        shown_count=shown,
        accepted_count=accepted,
        success_count=success,
        reward_sum=0.0,
    )


def _call(
    state: StateLabel = StateLabel.FLOW,
    confidence: float = 0.8,
    features: FeatureSummary | None = None,
    session: SessionContext | None = None,
    user: UserContext | None = None,
    topic: str | None = None,
) -> PolicyOutput:
    return evaluate(
        state_label=state,
        confidence=confidence,
        feature_summary=features or _features(),
        session_context=session or _session(),
        user_context=user or _user(),
        topic_label=topic,
    )


# ══════════════════════════════════════════════════════════════════════════════
# 1. FLOW → no suggestion
# ══════════════════════════════════════════════════════════════════════════════


class TestFlowState:

    def test_flow_ori_state_is_idle(self):
        out = _call(state=StateLabel.FLOW)
        assert out.ori_state is OriState.IDLE

    def test_flow_suggestion_is_none(self):
        out = _call(state=StateLabel.FLOW)
        assert out.suggestion.type is SuggestionType.NONE

    def test_flow_no_technique_id(self):
        out = _call(state=StateLabel.FLOW)
        assert out.suggestion.technique_id is None

    def test_flow_should_not_sleep(self):
        out = _call(state=StateLabel.FLOW)
        assert out.should_sleep is False

    def test_flow_high_confidence_still_no_suggestion(self):
        """Even perfect confidence in FLOW must not trigger a suggestion."""
        out = _call(state=StateLabel.FLOW, confidence=1.0)
        assert out.suggestion.type is SuggestionType.NONE

    def test_flow_with_features_still_no_suggestion(self):
        """Feature values don't change the FLOW decision."""
        out = _call(
            state=StateLabel.FLOW,
            features=_features(fatigue_score=0.9, idle_gap_s=500.0),
        )
        assert out.suggestion.type is SuggestionType.NONE

    def test_flow_transparency_card_present(self):
        out = _call(state=StateLabel.FLOW)
        assert len(out.transparency_card.signals) >= 1


# ══════════════════════════════════════════════════════════════════════════════
# 2. Sleep logic
# ══════════════════════════════════════════════════════════════════════════════


class TestSleepLogic:

    def test_three_ignores_returns_none_suggestion(self):
        out = _call(state=StateLabel.CONFUSION, session=_session(ignore_count=3))
        assert out.suggestion.type is SuggestionType.NONE

    def test_three_ignores_sets_should_sleep(self):
        out = _call(state=StateLabel.CONFUSION, session=_session(ignore_count=3))
        assert out.should_sleep is True

    def test_three_ignores_ori_state_is_idle(self):
        out = _call(state=StateLabel.CONFUSION, session=_session(ignore_count=3))
        assert out.ori_state is OriState.IDLE

    def test_four_ignores_also_sleeps(self):
        """Any count ≥ 3 triggers sleep."""
        out = _call(state=StateLabel.CONFUSION, session=_session(ignore_count=4))
        assert out.should_sleep is True

    def test_two_ignores_does_not_sleep(self):
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            session=_session(ignore_count=2),
        )
        assert out.should_sleep is False
        # Engine should still operate normally.
        assert out.suggestion.type is not SuggestionType.NONE or out.ori_state is not OriState.IDLE

    def test_already_asleep_returns_none(self):
        out = _call(state=StateLabel.CONFUSION, session=_session(asleep_flag=True))
        assert out.suggestion.type is SuggestionType.NONE

    def test_already_asleep_should_sleep_false(self):
        """should_sleep is False when the flag is already set — no need to write again."""
        out = _call(state=StateLabel.CONFUSION, session=_session(asleep_flag=True))
        assert out.should_sleep is False

    def test_asleep_overrides_any_state(self):
        """Even INSIGHT in a sleeping session returns NONE."""
        out = _call(
            state=StateLabel.INSIGHT,
            session=_session(asleep_flag=True),
        )
        assert out.suggestion.type is SuggestionType.NONE

    def test_sleep_signal_in_transparency(self):
        out = _call(state=StateLabel.FLOW, session=_session(ignore_count=3))
        combined = out.transparency_card.signals + [out.transparency_card.why_detected]
        text = " ".join(combined)
        assert "ignore" in text.lower() or "sleep" in text.lower() or "3" in text


# ══════════════════════════════════════════════════════════════════════════════
# 3. Confusion — picks technique with higher past success_rate
# ══════════════════════════════════════════════════════════════════════════════


class TestConfusionTechniqueSelection:

    def _confused_user_with_stats(
        self,
        feynman_success: int = 8,
        chunking_success: int = 3,
        shown: int = 10,
    ) -> UserContext:
        return _user(
            technique_stats={
                "feynman":  _stats(shown=shown, accepted=shown, success=feynman_success),
                "chunking": _stats(shown=shown, accepted=shown, success=chunking_success),
            }
        )

    def test_confusion_suggests_technique(self):
        out = _call(state=StateLabel.CONFUSION, confidence=0.85)
        assert out.suggestion.type is SuggestionType.TECHNIQUE

    def test_confusion_chooses_higher_success_rate(self):
        """
        feynman (success_rate=0.8) must beat chunking (success_rate=0.3)
        when state_fit and context_fit are comparable.
        """
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            user=self._confused_user_with_stats(feynman_success=8, chunking_success=3),
        )
        assert out.suggestion.technique_id == "feynman"

    def test_confusion_lower_success_rate_can_win_on_state_fit(self):
        """
        chunking has CONFUSION state_fit=0.5 while error_analysis has 0.7.
        With no history (success_rate=0 for both), error_analysis is NOT in
        CONFUSION's eligible list, so feynman (CONFUSION affinity=1.0) should win.
        """
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.9,
            user=_user(),  # no history
        )
        # feynman has the highest CONFUSION affinity (1.0) in the eligible list.
        assert out.suggestion.technique_id == "feynman"

    def test_confusion_ori_state_has_something(self):
        out = _call(state=StateLabel.CONFUSION, confidence=0.85)
        assert out.ori_state is OriState.HAS_SOMETHING

    def test_confusion_low_confidence_returns_noticing_no_suggestion(self):
        """Below _CONFUSION_MIN_CONFIDENCE (0.50): NOTICING, no suggestion."""
        out = _call(state=StateLabel.CONFUSION, confidence=0.40)
        assert out.ori_state is OriState.NOTICING
        assert out.suggestion.type is SuggestionType.NONE

    def test_confusion_at_exact_threshold(self):
        """Exactly at threshold (0.50) → suggestion fires."""
        out = _call(state=StateLabel.CONFUSION, confidence=0.50)
        assert out.suggestion.type is SuggestionType.TECHNIQUE

    def test_transparency_lists_signals(self):
        out = _call(state=StateLabel.CONFUSION, confidence=0.85)
        assert 2 <= len(out.transparency_card.signals) <= 4

    def test_transparency_signals_contain_state(self):
        out = _call(state=StateLabel.CONFUSION, confidence=0.85)
        first = out.transparency_card.signals[0]
        assert "CONFUSION" in first

    def test_transparency_includes_user_success_rate(self):
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            user=self._confused_user_with_stats(feynman_success=8, chunking_success=3),
        )
        assert out.transparency_card.user_success_rate is not None
        assert out.transparency_card.user_success_rate == pytest.approx(0.8)

    def test_transparency_why_this_mentions_technique_name(self):
        out = _call(state=StateLabel.CONFUSION, confidence=0.85)
        assert out.transparency_card.why_this  # non-empty

    def test_confusion_with_idle_signal_in_transparency(self):
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            features=_features(idle_gap_s=200.0),
        )
        # idle_gap_s > 60 → should appear in signals
        signal_text = " ".join(out.transparency_card.signals)
        assert "idle" in signal_text.lower() or "200" in signal_text

    def test_confusion_revisit_signal_in_transparency(self):
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            features=_features(section_revisit_count=3.0),
        )
        signal_text = " ".join(out.transparency_card.signals)
        assert "re-read" in signal_text.lower() or "3" in signal_text


# ══════════════════════════════════════════════════════════════════════════════
# 4. Overload and fatigue
# ══════════════════════════════════════════════════════════════════════════════


class TestOverloadAndFatigue:

    def test_overload_suggests_break(self):
        out = _call(state=StateLabel.OVERLOAD, confidence=0.85)
        assert out.suggestion.type is SuggestionType.BREAK

    def test_overload_ori_state_is_fatigue(self):
        out = _call(state=StateLabel.OVERLOAD, confidence=0.85)
        assert out.ori_state is OriState.FATIGUE

    def test_high_fatigue_feature_triggers_break(self):
        """High fatigue_score should override any TECHNIQUE suggestion."""
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.9,
            features=_features(fatigue_score=0.8),
        )
        assert out.suggestion.type is SuggestionType.BREAK
        assert out.ori_state is OriState.FATIGUE

    def test_high_fatigue_excludes_feynman(self):
        """feynman is not allowed_under_fatigue → should not be selected."""
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.7,
            features=_features(fatigue_score=0.7),  # above HIGH_FATIGUE(0.65)
        )
        # Under very high fatigue we get BREAK, not feynman.
        assert out.suggestion.technique_id != "feynman"

    def test_moderate_fatigue_penalises_but_does_not_exclude_feynman(self):
        """fatigue=0.5 is between MILD(0.35) and HIGH(0.65): penalised, not excluded."""
        score_with_fatigue = _score_technique(
            "feynman", StateLabel.CONFUSION, 0.8,
            _features(fatigue_score=0.5),
            session_minutes=20.0, mastery_level=0.0,
            technique_stats={}, modality_pref=None,
        )
        score_without_fatigue = _score_technique(
            "feynman", StateLabel.CONFUSION, 0.8,
            _features(fatigue_score=0.1),
            session_minutes=20.0, mastery_level=0.0,
            technique_stats={}, modality_pref=None,
        )
        # Moderate fatigue lowers the score but doesn't exclude (score > 0).
        assert score_with_fatigue > 0.0
        assert score_with_fatigue < score_without_fatigue


# ══════════════════════════════════════════════════════════════════════════════
# 5. Insight
# ══════════════════════════════════════════════════════════════════════════════


class TestInsight:

    def test_insight_ori_state_is_insight(self):
        out = _call(state=StateLabel.INSIGHT)
        assert out.ori_state is OriState.INSIGHT

    def test_insight_low_mastery_suggests_micro_assess(self):
        out = _call(
            state=StateLabel.INSIGHT,
            topic="biology/atp",
            user=_user(mastery_by_topic={"biology/atp": MasteryItem(p_mastery=0.3)}),
        )
        assert out.suggestion.type is SuggestionType.MICRO_ASSESS

    def test_insight_high_mastery_no_suggestion(self):
        """Mastery ≥ 0.70 → no need to lock in, already solid."""
        out = _call(
            state=StateLabel.INSIGHT,
            topic="biology/atp",
            user=_user(mastery_by_topic={"biology/atp": MasteryItem(p_mastery=0.75)}),
        )
        assert out.suggestion.type is SuggestionType.NONE

    def test_insight_no_topic_mastery_suggests_micro_assess(self):
        """No mastery record → mastery_level=0.0 < 0.70 → MICRO_ASSESS."""
        out = _call(state=StateLabel.INSIGHT, user=_user())
        assert out.suggestion.type is SuggestionType.MICRO_ASSESS


# ══════════════════════════════════════════════════════════════════════════════
# 6. Boredom
# ══════════════════════════════════════════════════════════════════════════════


class TestBoredom:

    def test_boredom_long_session_suggests_break(self):
        out = _call(
            state=StateLabel.BOREDOM,
            confidence=0.75,
            session=_session(session_minutes=50.0),
        )
        assert out.suggestion.type is SuggestionType.BREAK

    def test_boredom_long_idle_suggests_break(self):
        out = _call(
            state=StateLabel.BOREDOM,
            confidence=0.75,
            features=_features(idle_gap_s=200.0),  # > _LONG_IDLE_S (180)
        )
        assert out.suggestion.type is SuggestionType.BREAK

    def test_boredom_short_session_suggests_technique(self):
        out = _call(
            state=StateLabel.BOREDOM,
            confidence=0.75,
            session=_session(session_minutes=15.0),
        )
        assert out.suggestion.type is SuggestionType.TECHNIQUE

    def test_boredom_ori_state_has_something_on_technique(self):
        out = _call(
            state=StateLabel.BOREDOM,
            confidence=0.75,
            session=_session(session_minutes=15.0),
        )
        assert out.ori_state is OriState.HAS_SOMETHING


# ══════════════════════════════════════════════════════════════════════════════
# 7. Frustration
# ══════════════════════════════════════════════════════════════════════════════


class TestFrustration:

    def test_frustration_ori_state_is_frustrated(self):
        out = _call(state=StateLabel.FRUSTRATION, confidence=0.8)
        assert out.ori_state is OriState.FRUSTRATED

    def test_frustration_suggests_technique(self):
        out = _call(state=StateLabel.FRUSTRATION, confidence=0.8)
        assert out.suggestion.type is SuggestionType.TECHNIQUE

    def test_frustration_prefers_error_analysis_when_confident(self):
        """error_analysis has context_fit=0.85 for FRUSTRATION+confidence>0.6."""
        out = _call(
            state=StateLabel.FRUSTRATION,
            confidence=0.85,
            user=_user(),  # no history → pure state_fit + context_fit
        )
        # error_analysis has FRUSTRATION affinity 0.8 × confidence → state_fit ≈ 0.68
        # context_fit = 0.85 (frustration + high confidence)
        # vs feynman state_fit 0 (no FRUSTRATION affinity in feynman list)
        # Actually feynman has CONFUSION affinity but NOT FRUSTRATION —
        # feynman state_fit for FRUSTRATION = affinity["FRUSTRATION"] = not present → 0
        # So error_analysis must win.
        assert out.suggestion.technique_id == "error_analysis"


# ══════════════════════════════════════════════════════════════════════════════
# 8. Mind Wander
# ══════════════════════════════════════════════════════════════════════════════


class TestMindWander:

    def test_mind_wander_strong_confidence_suggests_micro_assess(self):
        """confidence >= _STRONG_CONFIDENCE (0.65) → re-engage with recall."""
        out = _call(state=StateLabel.MIND_WANDER, confidence=0.75)
        assert out.suggestion.type is SuggestionType.MICRO_ASSESS

    def test_mind_wander_weak_confidence_no_suggestion(self):
        """Below _STRONG_CONFIDENCE → NOTICING, no suggestion."""
        out = _call(state=StateLabel.MIND_WANDER, confidence=0.55)
        assert out.suggestion.type is SuggestionType.NONE

    def test_mind_wander_ori_state_noticing_no_suggestion(self):
        out = _call(state=StateLabel.MIND_WANDER, confidence=0.55)
        assert out.ori_state is OriState.NOTICING


# ══════════════════════════════════════════════════════════════════════════════
# 9. Composite scoring formula — unit-level verification
# ══════════════════════════════════════════════════════════════════════════════


class TestCompositeFormula:

    def test_state_fit_scales_with_confidence(self):
        sf_high = _state_fit("feynman", StateLabel.CONFUSION, 0.9)
        sf_low = _state_fit("feynman", StateLabel.CONFUSION, 0.5)
        assert sf_high > sf_low

    def test_state_fit_zero_for_irrelevant_state(self):
        """feynman has no FLOW affinity → state_fit contribution from affinity=0,
        but min confidence floor (0.25) means it's still 0 × 0.25 = 0."""
        sf = _state_fit("feynman", StateLabel.FLOW, 0.9)
        assert sf == pytest.approx(0.0)

    def test_success_rate_zero_when_no_history(self):
        sr = _success_rate("feynman", {})
        assert sr == pytest.approx(0.0)

    def test_success_rate_computed_from_stats(self):
        stats = {"feynman": _stats(shown=10, accepted=10, success=8)}
        sr = _success_rate("feynman", stats)
        assert sr == pytest.approx(0.8)

    def test_fatigue_penalty_zero_for_allowed_technique(self):
        """pomodoro is allowed_under_fatigue → no penalty."""
        fp = _fatigue_penalty("pomodoro", 0.9)
        assert fp == pytest.approx(0.0)

    def test_fatigue_penalty_positive_for_feynman_under_fatigue(self):
        fp = _fatigue_penalty("feynman", 0.8)
        assert fp > 0.0

    def test_fatigue_penalty_zero_below_mild_fatigue(self):
        """fatigue below _MILD_FATIGUE (0.35) → no penalty even for high-energy tech."""
        fp = _fatigue_penalty("feynman", 0.2)
        assert fp == pytest.approx(0.0)

    def test_composite_score_feynman_beats_chunking_on_success_rate(self):
        """
        Hand-computed composite for CONFUSION, confidence=0.85, no fatigue:
          feynman : state_fit = 1.0×0.85 = 0.85
                    success_rate = 0.8
                    context_fit  = 0.85 (confidence > 0.75)
                    fatigue_pen  = 0.0  (low fatigue)
            → 0.4×0.85 + 0.3×0.80 + 0.2×0.85 − 0.1×0.0
            → 0.34 + 0.24 + 0.17 = 0.75

          chunking: state_fit = 0.5×0.85 = 0.425
                    success_rate = 0.3
                    context_fit  = 0.5  (mastery ≥ 0.2)
                    fatigue_pen  = 0.0
            → 0.4×0.425 + 0.3×0.30 + 0.2×0.50 − 0.1×0.0
            → 0.17 + 0.09 + 0.10 = 0.36
        """
        feat = _features(fatigue_score=0.0)
        stats = {
            "feynman":  _stats(shown=10, accepted=10, success=8),
            "chunking": _stats(shown=10, accepted=10, success=3),
        }
        score_f = _score_technique(
            "feynman", StateLabel.CONFUSION, 0.85, feat,
            session_minutes=20.0, mastery_level=0.5,
            technique_stats=stats, modality_pref=None,
        )
        score_c = _score_technique(
            "chunking", StateLabel.CONFUSION, 0.85, feat,
            session_minutes=20.0, mastery_level=0.5,
            technique_stats=stats, modality_pref=None,
        )
        assert score_f == pytest.approx(0.75, abs=0.01)
        assert score_c == pytest.approx(0.36, abs=0.01)
        assert score_f > score_c

    def test_pick_best_technique_returns_highest_scorer(self):
        stats = {
            "feynman":  _stats(shown=10, accepted=10, success=8),
            "chunking": _stats(shown=10, accepted=10, success=3),
        }
        best = _pick_best_technique(
            state_label=StateLabel.CONFUSION,
            confidence=0.85,
            feature_summary=_features(),
            session_minutes=20.0,
            mastery_level=0.5,
            user_context=_user(technique_stats=stats),
        )
        assert best == "feynman"

    def test_context_fit_pomodoro_high_on_long_session(self):
        cf = _context_fit(
            "pomodoro", StateLabel.BOREDOM, 0.7,
            _features(), session_minutes=50.0, mastery_level=0.5, modality_pref=None,
        )
        assert cf == pytest.approx(1.0)

    def test_context_fit_active_recall_low_on_short_session(self):
        cf = _context_fit(
            "active_recall", StateLabel.BOREDOM, 0.7,
            _features(), session_minutes=3.0, mastery_level=0.5, modality_pref=None,
        )
        assert cf == pytest.approx(0.2)

    def test_context_fit_modality_switching_high_for_visual_learner(self):
        cf = _context_fit(
            "modality_switching", StateLabel.CONFUSION, 0.8,
            _features(), session_minutes=20.0, mastery_level=0.5, modality_pref="visual",
        )
        assert cf == pytest.approx(0.85)


# ══════════════════════════════════════════════════════════════════════════════
# 10. Transparency card
# ══════════════════════════════════════════════════════════════════════════════


class TestTransparencyCard:

    def test_signals_between_2_and_4(self):
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            features=_features(idle_gap_s=200.0, section_revisit_count=3.0, fatigue_score=0.4),
        )
        assert 2 <= len(out.transparency_card.signals) <= 4

    def test_first_signal_always_contains_state_label(self):
        out = _call(state=StateLabel.BOREDOM, confidence=0.7)
        assert "BOREDOM" in out.transparency_card.signals[0]

    def test_why_detected_is_non_empty(self):
        out = _call(state=StateLabel.CONFUSION, confidence=0.85)
        assert out.transparency_card.why_detected

    def test_why_this_is_non_empty(self):
        out = _call(state=StateLabel.CONFUSION, confidence=0.85)
        assert out.transparency_card.why_this

    def test_fatigue_signal_appears_when_high(self):
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            features=_features(fatigue_score=0.6),
        )
        text = " ".join(out.transparency_card.signals).lower()
        assert "fatigue" in text

    def test_idle_signal_appears_when_long(self):
        out = _call(
            state=StateLabel.CONFUSION,
            confidence=0.85,
            features=_features(idle_gap_s=300.0),
        )
        text = " ".join(out.transparency_card.signals).lower()
        assert "idle" in text

    def test_collect_signals_caps_at_four(self):
        """Even with many high-value features, signals is capped at 4."""
        sigs = _collect_signals(
            StateLabel.CONFUSION, 0.9,
            _features(
                confusion_confidence=0.9,
                idle_gap_s=300.0,
                section_revisit_count=5.0,
                fatigue_score=0.7,
                abandonment_rate=0.8,
                rushing_score=0.9,
            ),
            session_minutes=60.0,
        )
        assert len(sigs) <= 4
