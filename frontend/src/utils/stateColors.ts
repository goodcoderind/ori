import type { LearnerState } from '../types/states';

// Poppy Modern AI Palette - Differentiated by state
export const stateColors: Record<LearnerState, string> = {
  FLOW: '#61A5FA',        // Primary blue - flow state
  INSIGHT: '#2DD4BF',     // Teal - insights
  CONFUSION: '#A78BFA',   // Purple - confusion
  MIND_WANDER: '#61A5FA', // Primary blue - mind wander
  FRUSTRATION: '#FBBF24', // Yellow - frustration
  OVERLOAD: '#EF4444',    // Red - overload (keep for urgency)
  BOREDOM: '#64748B',     // Muted gray - boredom
};
