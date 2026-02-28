import type { LearnerState } from '../types/states';

// Sophisticated color palette - calm intelligence
export const stateColors: Record<LearnerState, string> = {
  FLOW: '#9C7CFF',        // Primary accent - flow state
  INSIGHT: '#6EE7F9',     // Highlight - insights
  CONFUSION: '#BFA8FF',   // Secondary accent - confusion
  MIND_WANDER: '#9C7CFF', // Primary accent - mind wander
  FRUSTRATION: '#BFA8FF', // Secondary accent - frustration
  OVERLOAD: '#EF4444',    // Red - overload (keep for urgency)
  BOREDOM: 'rgba(248, 250, 252, 0.3)', // Muted - boredom
};
