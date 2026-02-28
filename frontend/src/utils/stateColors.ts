import type { LearnerState } from '../types/states';

// Professional color palette matching the new theme
export const stateColors: Record<LearnerState, string> = {
  FLOW: '#6366F1',        // Indigo - flow state
  INSIGHT: '#14B8A6',     // Teal - insights
  CONFUSION: '#8B5CF6',   // Purple - confusion
  MIND_WANDER: '#3B82F6', // Blue - mind wander
  FRUSTRATION: '#F59E0B', // Amber - frustration
  OVERLOAD: '#EF4444',    // Red - overload
  BOREDOM: '#64748B',     // Slate - boredom
};
