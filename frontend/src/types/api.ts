import { LearnerState, SuggestionType, OriState } from './states';

// ── Dashboard Summary ─────────────────────────────────────────────
export interface TechniqueSuccessRate {
  technique_id: string;
  shown_count: number;
  acceptance_rate: number;
  success_rate: number;
}

export interface MasteryEntry {
  p_mastery: number;
  last_probe_at: string | null;
  next_probe_at: string | null;
}

export interface UpcomingReview {
  topic_label: string;
  p_mastery: number;
  next_probe_at: string; // ISO-8601
  overdue: boolean;
}

export interface FocusHeatmap {
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
}

export interface DashboardSummary {
  user_id: string;
  focus_state_distribution: Partial<Record<LearnerState, number>>;
  focus_heatmap: FocusHeatmap;
  technique_success_rates: TechniqueSuccessRate[]; // ARRAY, not object
  mastery_by_topic: Record<string, MasteryEntry>;
  upcoming_reviews: UpcomingReview[];
}

// ── Session List ──────────────────────────────────────────────────
export interface SessionListItem {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number; // NOTE: seconds, not minutes
  topic_label: string;
  n_nudges: number;
  avg_confidence: number | null;
  avg_microassess_score: number | null;
}

// ── Session Detail ────────────────────────────────────────────────
export interface EventTimelineItem {
  ts: string;
  state_label: LearnerState;
  confidence: number;
  ori_state: OriState;
  suggestion_type: SuggestionType;
  suggestion_id: string | null;
}

export interface ProbeAttempt {
  ts: string;
  probe_type: 'recall' | 'transfer';
  score_0_1: number;
  error_type: 'correct' | 'missing_core_idea' | 'misapplied_rule' | 'vague' | 'misconception' | 'other';
}

export interface AssessmentEntry {
  probe_set_id: string;
  topic_label: string;
  recall_probe: string;
  transfer_probe: string;
  attempts: ProbeAttempt[];
}

export interface RolledUpSummary {
  total_events: number;
  by_state: Partial<Record<LearnerState, number>>;
  suggestions_shown: number;
}

export interface SessionDetail {
  session_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  topic_label: string;
  n_nudges: number;
  avg_confidence: number | null;
  avg_microassess_score: number | null;
  event_timeline: EventTimelineItem[];
  assessments: AssessmentEntry[];
  rolled_up_summary: RolledUpSummary;
}

// ── Profile ───────────────────────────────────────────────────────
export interface UserProfile {
  modality_pref?: string;
}
