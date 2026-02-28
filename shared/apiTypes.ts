/**
 * Shared API Types
 *
 * Request and response shapes that match the backend exactly.
 * Both overlay and frontend import these — no duplicated type definitions.
 */

// ─── Enums ──────────────────────────────────────────────────────

export type LearnerState =
  | 'FLOW'
  | 'MIND_WANDER'
  | 'CONFUSION'
  | 'FRUSTRATION'
  | 'OVERLOAD'
  | 'BOREDOM'
  | 'INSIGHT'

export type BackendOriState =
  | 'IDLE'
  | 'NOTICING'
  | 'HAS_SOMETHING'
  | 'INSIGHT'
  | 'FATIGUE'
  | 'FRUSTRATED'

export type SuggestionType =
  | 'NONE'
  | 'MICRO_ASSESS'
  | 'TECHNIQUE'
  | 'BREAK'
  | 'UNASKED_QUESTION'

// ─── Feature Summary (16 allowlisted numeric fields) ─────────────

export interface FeatureSummary {
  keystroke_speed?: number
  pause_count?: number
  backspace_burst_count?: number
  scroll_velocity?: number
  section_revisit_count?: number
  idle_gap_s?: number
  modality_dwell_s?: number
  click_density?: number
  session_duration_s?: number
  confusion_confidence?: number
  fatigue_score?: number
  rushing_score?: number
  typing_acceleration?: number
  forward_nav_rate?: number
  peak_focus_windows?: number
  abandonment_rate?: number
}

// ─── Session ────────────────────────────────────────────────────

export interface SessionStartRequest {
  url: string
  title: string
  topic_label?: string
}

export interface SessionStartResponse {
  session_id: string
}

export interface SessionUpdateRequest {
  session_id: string
  state_label: LearnerState
  confidence: number
  feature_summary: FeatureSummary
  url: string
  title: string
}

export interface SuggestionBody {
  type: SuggestionType
  technique_id: string | null
  title: string
  cta: string
  payload: Record<string, unknown>
}

export interface TransparencyBody {
  why_detected: string
  signals: string[]
  why_this: string
  user_success_rate: number | null
}

export interface SessionFlagsBody {
  ignore_count: number
  asleep_flag: boolean
}

export interface SessionUpdateResponse {
  ori_state: BackendOriState
  suggestion: SuggestionBody
  transparency_card: TransparencyBody
  session_flags: SessionFlagsBody
}

export interface SessionEndRequest {
  session_id: string
}

export interface SessionEndResponse {
  ok: boolean
}

// ─── Questions ──────────────────────────────────────────────────

export interface QuestionsAnswerRequest {
  page_context: string          // ≤2000 chars, ephemeral
  question: string
  topic_label?: string
  session_id?: string
}

export interface QuestionsAnswerResponse {
  direct_answer: string
  follow_up: {
    question: string
    type: string
  }
}

export interface QuestionsUnaskedRequest {
  accepted_concept: string
  topic_label?: string
}

export interface QuestionsUnaskedResponse {
  concept: string
  probe: string
  entry_point: string
}

// ─── Unasked Socratic Question ──────────────────────────────────

export interface UnaskedQuestionRequest {
  session_id: string
  topic_label: string
  page_context: {
    headings: string[]
    cleaned_text_snippet: string   // ≤2500 chars, ephemeral
  }
}

export interface UnaskedQuestionResponse {
  unasked_question: string
  followups: string[]
  rationale: string
  is_meta: boolean
}

// ─── Assessments ────────────────────────────────────────────────

export interface ProbeSetsRequest {
  session_id: string
  topic_label: string
  key_points: string[]            // 1-10 items
  common_mistakes?: string[]
  difficulty_tag?: string
}

export interface ProbeSetsResponse {
  probe_set_id: string
  recall_probe: string
  transfer_probe: string
}

export interface AssessmentScoreRequest {
  probe_set_id: string
  probe_type: 'recall' | 'transfer'
  answer_text: string             // ≤2000 chars, ephemeral
}

export interface AssessmentScoreResponse {
  score_0_1: number
  error_type: string
  feedback: string
}

// ─── Micro-Assessments ──────────────────────────────────────────

export interface MicroassessGenerateRequest {
  session_id: string
  topic_label: string
  page_context: {
    headings: string[]
    cleaned_text_snippet: string   // ≤2500 chars, ephemeral
  }
  difficulty: 'easy' | 'med' | 'hard'
}

export interface MicroassessGenerateResponse {
  probe_set_id: string
  recall_probe: string
  transfer_probe: string
  rubric: {
    key_points: string[]
    common_mistakes: string[]
    difficulty_tag: string
  }
}

export interface MicroassessSubmitRequest {
  probe_set_id: string
  probe_type: 'recall' | 'transfer'
  answer_text: string             // ≤3000 chars, ephemeral
}

export interface MicroassessSubmitResponse {
  score_0_1: number
  error_type: string
  feedback: string
  next_probe_time: string         // ISO-8601
}

// ─── Technique Selection ────────────────────────────────────────

export interface TechniqueSelectRequest {
  state_label: LearnerState
  confidence: number
  feature_summary: FeatureSummary
  session_id?: string
  topic_label?: string
}

export interface TechniqueScoreBreakdown {
  state_fit: number
  success_rate: number
  context_fit: number
  fatigue_penalty: number
}

export interface TechniqueResult {
  technique_id: string
  score: number
  score_breakdown: TechniqueScoreBreakdown
  trigger_signals: string[]
  why_chosen: string
  historical_success_rate: number | null
  time_estimate_minutes: number
}

export interface TechniqueSelectResponse {
  selected: TechniqueResult
  alternatives: TechniqueResult[]
}

// ─── Dashboard ──────────────────────────────────────────────────

export interface FocusHeatmap {
  morning: number
  afternoon: number
  evening: number
  night: number
}

export interface TechniqueSuccessRate {
  technique_id: string
  shown_count: number
  acceptance_rate: number
  success_rate: number
}

export interface MasteryEntry {
  p_mastery: number
  last_probe_at: string | null
  next_probe_at: string | null
}

export interface UpcomingReview {
  topic_label: string
  p_mastery: number
  next_probe_at: string
  overdue: boolean
}

export interface DashboardSummary {
  user_id: string
  focus_state_distribution: Partial<Record<LearnerState, number>>
  focus_heatmap: FocusHeatmap
  technique_success_rates: TechniqueSuccessRate[]
  mastery_by_topic: Record<string, MasteryEntry>
  upcoming_reviews: UpcomingReview[]
}

export interface SessionListItem {
  session_id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  topic_label: string
  n_nudges: number
  avg_confidence: number | null
  avg_microassess_score: number | null
}

export interface EventTimelineItem {
  ts: string
  state_label: LearnerState
  confidence: number
  ori_state: BackendOriState
  suggestion_type: SuggestionType
  suggestion_id: string | null
}

export interface ProbeAttempt {
  ts: string
  probe_type: 'recall' | 'transfer'
  score_0_1: number
  error_type: string
}

export interface AssessmentEntry {
  probe_set_id: string
  topic_label: string
  recall_probe: string
  transfer_probe: string
  attempts: ProbeAttempt[]
}

export interface RolledUpSummary {
  total_events: number
  by_state: Partial<Record<LearnerState, number>>
  suggestions_shown: number
}

export interface SessionDetail extends SessionListItem {
  user_id: string
  event_timeline: EventTimelineItem[]
  assessments: AssessmentEntry[]
  rolled_up_summary: RolledUpSummary
}

// ─── Profile ────────────────────────────────────────────────────

export interface UserProfile {
  modality_pref?: string
}

// ─── Error Envelope ─────────────────────────────────────────────

export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
    request_id: string
  }
}
