import { LearnerState, SuggestionType } from './states';

export interface DashboardSummary {
  focus_state_distribution: Partial<Record<LearnerState, number>>;
  focus_heatmap: {
    morning: number;
    afternoon: number;
    night: number;
  };
  technique_success_rates: Record<string, number>;
  mastery_by_topic: Record<string, number>;
  upcoming_reviews: Array<{
    topic: string;
    due_at: string;
  }>;
}

export interface SessionListItem {
  session_id: string;
  url: string;
  title: string;
  topic_label: string;
  started_at: string;
  duration_minutes: number;
  dominant_state: LearnerState;
}

export interface SessionDetail {
  session_id: string;
  topic_label: string;
  url: string;
  title: string;
  started_at: string;
  duration_minutes: number;
  state_timeline: Array<{
    timestamp: string;
    state: LearnerState;
    confidence: number;
  }>;
  suggestions_triggered: Array<{
    type: SuggestionType;
    technique_id: string;
    accepted: boolean;
    outcome: 'success' | 'failure' | 'unknown';
  }>;
  insight_moments: number;
}

