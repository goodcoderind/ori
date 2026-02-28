/**
 * Re-export state enums from the shared module.
 * Kept as a thin wrapper so existing component imports continue to resolve.
 */
export type { LearnerState, SuggestionType } from '@shared/apiTypes';

// The shared module uses BackendOriState; re-export under the local alias.
export type { BackendOriState as OriState } from '@shared/apiTypes';
