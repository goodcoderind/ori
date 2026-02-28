/**
 * Telemetry Types — Privacy-safe behavioral measurement
 *
 * All types are numeric aggregates only. No content, no key values,
 * no DOM text, no full URLs. Only metadata that feeds the backend
 * cognitive state classifier.
 */

// ─── State Labels ────────────────────────────────────────────
export type StateLabel =
  | 'FLOW'
  | 'MIND_WANDER'
  | 'CONFUSION'
  | 'FRUSTRATION'
  | 'OVERLOAD'
  | 'BOREDOM'
  | 'INSIGHT'

// ─── Feature Summary ─────────────────────────────────────────
// ONLY these keys are allowed. All numeric, all optional.
export interface FeatureSummary {
  keystroke_speed?: number          // keys per minute
  pause_count?: number              // pauses > 2s
  backspace_burst_count?: number    // bursts of ≥3 backspaces in 2s
  scroll_velocity?: number          // avg |deltaY| per second
  section_revisit_count?: number    // returns to previously-seen scroll bins
  idle_gap_s?: number               // longest idle period (seconds)
  modality_dwell_s?: number         // seconds in dominant modality
  click_density?: number            // clicks per minute
  session_duration_s?: number       // seconds since session start
  confusion_confidence?: number     // 0..1
  fatigue_score?: number            // 0..1
  rushing_score?: number            // 0..1
  typing_acceleration?: number      // delta keystroke_speed vs last window
  forward_nav_rate?: number         // forward-navigations per minute
  peak_focus_windows?: number       // 30s windows classified FLOW in last 10m
  abandonment_rate?: number         // fraction of last 10m with doc hidden/blurred
}

// ─── Window Summary (stored in ring buffer) ──────────────────
export interface WindowSummary {
  timestamp: number
  features: FeatureSummary
  stateLabel: StateLabel
  confidence: number
}

// ─── Telemetry Snapshot ──────────────────────────────────────
export interface TelemetrySnapshot {
  feature_summary: FeatureSummary
  state_label: StateLabel
  confidence: number
}

// ─── Session Update Payload (for backend) ────────────────────
export interface SessionUpdatePayload {
  session_id: string
  url: string               // sanitized: hostname + path only
  title: string             // page title (safe — no user-generated content)
  timestamp: number
  window_duration_s: number
  feature_summary: FeatureSummary
  state_label: StateLabel
  confidence: number
}

// ─── Modality Buckets ────────────────────────────────────────
export type ModalityBucket = 'READING' | 'WRITING' | 'NAV' | 'IDLE'

// ─── Internal Event Types (never exported to backend) ────────
export interface KeyEvent {
  ts: number
  isBackspace: boolean
}

export interface ScrollEvent {
  ts: number
  deltaY: number
}

// ─── Tunable Constants ───────────────────────────────────────
export interface TelemetryConfig {
  windowMs: number                // default 30000 (30s)
  ringBufferSize: number          // default 20 (10 min of 30s windows)
  pauseThresholdMs: number        // default 2000
  backspaceBurstWindow: number    // default 2000
  backspaceBurstMin: number       // default 3
  idleThresholdMs: number         // default 5000
  sectionBins: number             // default 10
  insightBiasMs: number           // default 120000 (2 min)
  debugMode: boolean              // default false
}
