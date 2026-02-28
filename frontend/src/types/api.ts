/**
 * Re-export API types from the shared module.
 * Kept as a thin wrapper so existing component imports continue to resolve.
 */
export type {
  TechniqueSuccessRate,
  MasteryEntry,
  UpcomingReview,
  FocusHeatmap,
  DashboardSummary,
  SessionListItem,
  EventTimelineItem,
  ProbeAttempt,
  AssessmentEntry,
  RolledUpSummary,
  SessionDetail,
  UserProfile,
} from '@shared/apiTypes';
