/**
 * Shared API Configuration
 *
 * Single source of truth for backend connection settings.
 * Both the Chrome extension overlay and the dashboard frontend import this module.
 *
 * Environment variable names:
 *   - Overlay (Vite):  VITE_BACKEND_URL
 *   - Frontend (Vite): VITE_API_BASE_URL
 *
 * Both fall back to http://localhost:8000 when unset.
 */

/** Default backend base URL (no trailing slash). */
export const DEFAULT_API_BASE_URL = 'http://localhost:8000'

/** Header carrying the anonymous user UUID. */
export const USER_ID_HEADER = 'X-User-Id'

// ─── Endpoint Paths ──────────────────────────────────────────────
// Every backend route in one place. No string literals scattered across files.

export const API = {
  // Session lifecycle
  SESSION_START:  '/v1/session/start',
  SESSION_UPDATE: '/v1/session/update',
  SESSION_END:    '/v1/session/end',

  // Questions
  QUESTIONS_ANSWER:  '/v1/questions/answer',
  QUESTIONS_UNASKED: '/v1/questions/unasked',

  // Unasked Socratic question (standalone)
  UNASKED_QUESTION: '/v1/unasked-question',

  // Assessments
  ASSESSMENTS_PROBE_SETS: '/v1/assessments/probe-sets',
  ASSESSMENTS_SCORE:      '/v1/assessments/score',

  // Micro-assessments
  MICROASSESS_GENERATE: '/v1/microassess/generate',
  MICROASSESS_SUBMIT:   '/v1/microassess/submit',

  // Technique selection
  TECHNIQUES_SELECT: '/v1/techniques/select',

  // Profiles
  PROFILE:        (userId: string) => `/v1/profiles/${userId}`,
  PROFILE_EXPORT: (userId: string) => `/v1/profiles/${userId}/export`,

  // Dashboard (read-only)
  DASHBOARD_SUMMARY: '/v1/dashboard/summary',
  DASHBOARD_SESSIONS: '/v1/dashboard/sessions',
  DASHBOARD_SESSION:  (sessionId: string) => `/v1/dashboard/session/${sessionId}`,

  // Health
  HEALTH: '/health',
} as const
