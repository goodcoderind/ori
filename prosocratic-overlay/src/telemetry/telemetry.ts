/**
 * Telemetry Engine — Privacy-safe behavioral measurement
 *
 * Computes 16 allowlisted numeric features every 30s from raw input events.
 * Derives confusion_confidence, fatigue_score, rushing_score (0..1).
 * Classifies cognitive state: FLOW | MIND_WANDER | CONFUSION | FRUSTRATION | OVERLOAD | BOREDOM | INSIGHT.
 *
 * PRIVACY:
 *   - Never captures typed content, clipboard, DOM text, or full URLs.
 *   - Stores only rolling aggregates in memory. No persistence by default.
 *   - Only emits numeric aggregates + state_label + confidence.
 */

import type {
  StateLabel,
  FeatureSummary,
  WindowSummary,
  TelemetrySnapshot,
  SessionUpdatePayload,
  ModalityBucket,
  KeyEvent,
  ScrollEvent,
  TelemetryConfig,
} from './types'

// ─── Default Config ──────────────────────────────────────────
const DEFAULT_CONFIG: TelemetryConfig = {
  windowMs: 30_000,
  ringBufferSize: 20,          // 20 × 30s = 10 minutes
  pauseThresholdMs: 2_000,
  backspaceBurstWindow: 2_000,
  backspaceBurstMin: 3,
  idleThresholdMs: 5_000,
  sectionBins: 10,
  insightBiasMs: 120_000,      // 2 min
  debugMode: false,
}

// ─── Internal State ──────────────────────────────────────────
let config: TelemetryConfig = { ...DEFAULT_CONFIG }
let sessionStartTs = 0
let running = false

// Event buffers (pruned each window)
let keyEvents: KeyEvent[] = []
let scrollEvents: ScrollEvent[] = []
let clickTimestamps: number[] = []

// Idle tracking
let lastEventTs = 0
let maxIdleGapMs = 0

// Visibility / abandonment tracking
let docHiddenSince: number | null = null
let hiddenMs = 0        // accumulated in current window
let totalHiddenMs = 0   // accumulated across all windows in ring buffer scope

// Navigation tracking
let lastHistoryLength = 0
let forwardNavCount = 0

// Section revisit tracking (scroll position bins)
let seenBins = new Set<number>()
let currentBin = -1
let revisitCount = 0

// Modality tracking
let modalityStart = 0
let currentModality: ModalityBucket = 'IDLE'
let modalityAccum: Record<ModalityBucket, number> = { READING: 0, WRITING: 0, NAV: 0, IDLE: 0 }

// Insight bias flag
let insightBiasUntil = 0

// Rolling windows
let prevWindowFeatures: FeatureSummary | null = null
let ringBuffer: WindowSummary[] = []

// Emitter
let emitterTimer: number | null = null

// Listeners (for cleanup)
let boundListeners: { el: EventTarget; type: string; fn: EventListener }[] = []

// ─── Helpers ─────────────────────────────────────────────────
function now(): number { return Date.now() }

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)) }

function pruneToWindow<T extends { ts: number }>(arr: T[], cutoff: number): T[] {
  const idx = arr.findIndex(e => e.ts >= cutoff)
  return idx < 0 ? [] : arr.slice(idx)
}

function pruneTimestamps(arr: number[], cutoff: number): number[] {
  const idx = arr.findIndex(t => t >= cutoff)
  return idx < 0 ? [] : arr.slice(idx)
}

function getScrollBin(scrollY: number): number {
  const pageH = Math.max(document.documentElement.scrollHeight, 1)
  return Math.min(config.sectionBins - 1, Math.floor((scrollY / pageH) * config.sectionBins))
}

// ─── Event Handlers (privacy-safe) ──────────────────────────

function onKeydown(e: Event): void {
  const ke = e as KeyboardEvent
  // Ignore modifier-only keys
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(ke.key)) return
  const ts = now()
  lastEventTs = ts
  keyEvents.push({ ts, isBackspace: ke.key === 'Backspace' })
  updateModality('WRITING')
}

function onScroll(): void {
  const ts = now()
  lastEventTs = ts
  const deltaY = window.scrollY  // absolute position; velocity computed from diffs
  scrollEvents.push({ ts, deltaY })

  // Section revisit tracking
  const bin = getScrollBin(window.scrollY)
  if (bin !== currentBin) {
    if (seenBins.has(bin)) revisitCount++
    seenBins.add(bin)
    currentBin = bin
  }

  if (keyEvents.length === 0 || (ts - keyEvents[keyEvents.length - 1].ts) > 1500) {
    updateModality('READING')
  }
}

function onClick(): void {
  const ts = now()
  lastEventTs = ts
  clickTimestamps.push(ts)
  updateModality('NAV')
}

function onVisibilityChange(): void {
  const ts = now()
  if (document.hidden) {
    docHiddenSince = ts
  } else {
    if (docHiddenSince !== null) {
      const elapsed = ts - docHiddenSince
      hiddenMs += elapsed
      totalHiddenMs += elapsed
      docHiddenSince = null
    }
    lastEventTs = ts
  }
}

function onPopstate(): void {
  const ts = now()
  lastEventTs = ts
  const newLen = history.length
  if (newLen > lastHistoryLength) {
    forwardNavCount++
  }
  lastHistoryLength = newLen
  updateModality('NAV')
}

function updateModality(newModality: ModalityBucket): void {
  const ts = now()
  const elapsed = ts - modalityStart
  if (currentModality && elapsed > 0) {
    modalityAccum[currentModality] += elapsed
  }
  currentModality = newModality
  modalityStart = ts
}

// ─── Metric Computation ─────────────────────────────────────

function computeFeatures(): FeatureSummary {
  const ts = now()
  const windowStart = ts - config.windowMs

  // Prune event buffers to current window
  keyEvents = pruneToWindow(keyEvents, windowStart)
  scrollEvents = pruneToWindow(scrollEvents, windowStart)
  clickTimestamps = pruneTimestamps(clickTimestamps, windowStart)

  const windowSec = config.windowMs / 1000

  // ── keystroke_speed (keys/min) ──
  const keystroke_speed = keyEvents.length > 0
    ? (keyEvents.length / windowSec) * 60
    : 0

  // ── pause_count (typing pauses > 2s) ──
  let pause_count = 0
  for (let i = 1; i < keyEvents.length; i++) {
    if (keyEvents[i].ts - keyEvents[i - 1].ts > config.pauseThresholdMs) {
      pause_count++
    }
  }

  // ── backspace_burst_count ──
  let backspace_burst_count = 0
  const bsEvents = keyEvents.filter(e => e.isBackspace)
  if (bsEvents.length >= config.backspaceBurstMin) {
    let burstStart = 0
    for (let i = 0; i < bsEvents.length; i++) {
      if (i === 0 || bsEvents[i].ts - bsEvents[i - 1].ts > config.backspaceBurstWindow) {
        burstStart = i
      }
      const burstLen = i - burstStart + 1
      if (burstLen === config.backspaceBurstMin) {
        // Only count once per burst
        if (bsEvents[i].ts - bsEvents[burstStart].ts <= config.backspaceBurstWindow) {
          backspace_burst_count++
        }
      }
    }
  }

  // ── scroll_velocity (avg |delta| per second) ──
  let scroll_velocity = 0
  if (scrollEvents.length > 1) {
    let totalDelta = 0
    for (let i = 1; i < scrollEvents.length; i++) {
      totalDelta += Math.abs(scrollEvents[i].deltaY - scrollEvents[i - 1].deltaY)
    }
    const timeSpan = (scrollEvents[scrollEvents.length - 1].ts - scrollEvents[0].ts) / 1000
    scroll_velocity = timeSpan > 0 ? totalDelta / timeSpan : 0
  }

  // ── click_density (clicks/min) ──
  const click_density = clickTimestamps.length > 0
    ? (clickTimestamps.length / windowSec) * 60
    : 0

  // ── idle_gap_s ──
  let idle_gap_s = 0
  if (lastEventTs > 0) {
    const idleSince = ts - lastEventTs
    idle_gap_s = Math.max(maxIdleGapMs, idleSince) / 1000
  }

  // ── modality_dwell_s ──
  // Flush current modality accumulation
  const elapsed = ts - modalityStart
  if (currentModality && elapsed > 0) {
    modalityAccum[currentModality] += elapsed
    modalityStart = ts
  }
  // Find dominant modality
  let dominantModality: ModalityBucket = 'IDLE'
  let maxMs = 0
  for (const [m, ms] of Object.entries(modalityAccum) as [ModalityBucket, number][]) {
    if (ms > maxMs) { maxMs = ms; dominantModality = m }
  }
  const modality_dwell_s = maxMs / 1000

  // ── session_duration_s ──
  const session_duration_s = (ts - sessionStartTs) / 1000

  // ── forward_nav_rate (per min) ──
  const forward_nav_rate = (forwardNavCount / windowSec) * 60

  // ── section_revisit_count ──
  const section_revisit_count = revisitCount

  // ── typing_acceleration ──
  const typing_acceleration = prevWindowFeatures?.keystroke_speed !== undefined
    ? keystroke_speed - prevWindowFeatures.keystroke_speed
    : 0

  // ── abandonment_rate (from ring buffer) ──
  const totalRingMs = ringBuffer.length * config.windowMs + config.windowMs // include current
  const abandonmentMs = totalHiddenMs + hiddenMs
  const abandonment_rate = totalRingMs > 0 ? clamp01(abandonmentMs / totalRingMs) : 0

  // ── peak_focus_windows (count of FLOW windows in ring buffer) ──
  const peak_focus_windows = ringBuffer.filter(w => w.stateLabel === 'FLOW').length

  // ── Derived scores (0..1) ──
  const confusion_confidence = clamp01(
    (section_revisit_count / 8) * 0.35 +
    (backspace_burst_count / 5) * 0.25 +
    (pause_count / 6) * 0.2 +
    (1 - clamp01(forward_nav_rate / 3)) * 0.2
  )

  const fatigue_score = clamp01(
    clamp01(session_duration_s / 3600) * 0.3 +
    clamp01(idle_gap_s / 30) * 0.25 +
    (keystroke_speed > 0 ? clamp01(1 - keystroke_speed / 80) : 0.5) * 0.2 +
    abandonment_rate * 0.25
  )

  const rushing_score = clamp01(
    clamp01(scroll_velocity / 5000) * 0.3 +
    clamp01(forward_nav_rate / 5) * 0.3 +
    (1 - clamp01(pause_count / 4)) * 0.2 +
    (1 - clamp01(section_revisit_count / 3)) * 0.2
  )

  return {
    keystroke_speed: Math.round(keystroke_speed * 10) / 10,
    pause_count,
    backspace_burst_count,
    scroll_velocity: Math.round(scroll_velocity * 10) / 10,
    section_revisit_count,
    idle_gap_s: Math.round(idle_gap_s * 10) / 10,
    modality_dwell_s: Math.round(modality_dwell_s * 10) / 10,
    click_density: Math.round(click_density * 10) / 10,
    session_duration_s: Math.round(session_duration_s),
    confusion_confidence: Math.round(confusion_confidence * 1000) / 1000,
    fatigue_score: Math.round(fatigue_score * 1000) / 1000,
    rushing_score: Math.round(rushing_score * 1000) / 1000,
    typing_acceleration: Math.round(typing_acceleration * 10) / 10,
    forward_nav_rate: Math.round(forward_nav_rate * 10) / 10,
    peak_focus_windows,
    abandonment_rate: Math.round(abandonment_rate * 1000) / 1000,
  }
}

// ─── State Label Classifier ─────────────────────────────────

function classifyState(f: FeatureSummary): { stateLabel: StateLabel; confidence: number } {
  const cc = f.confusion_confidence ?? 0
  const fs = f.fatigue_score ?? 0
  const rs = f.rushing_score ?? 0
  const idle = f.idle_gap_s ?? 0
  const ks = f.keystroke_speed ?? 0
  const sv = f.scroll_velocity ?? 0
  const cd = f.click_density ?? 0
  const bbc = f.backspace_burst_count ?? 0
  const pc = f.pause_count ?? 0
  const ab = f.abandonment_rate ?? 0
  const src = f.section_revisit_count ?? 0
  const ta = f.typing_acceleration ?? 0

  // ── INSIGHT: confusion dropping + activity increasing (or micro-assess flag) ──
  if (now() < insightBiasUntil) {
    return { stateLabel: 'INSIGHT', confidence: 0.75 }
  }
  // Detect natural insight: confusion was high recently, now dropping, with increased activity
  if (prevWindowFeatures) {
    const prevCC = prevWindowFeatures.confusion_confidence ?? 0
    const ccDrop = prevCC - cc
    if (ccDrop > 0.15 && (ta > 5 || sv > 200)) {
      return { stateLabel: 'INSIGHT', confidence: clamp01(0.5 + ccDrop) }
    }
  }

  // ── FRUSTRATION: confusion + thrashing ──
  if (cc > 0.55 && bbc >= 2 && pc >= 3 && cd > 8) {
    return { stateLabel: 'FRUSTRATION', confidence: clamp01(cc * 0.5 + 0.4) }
  }

  // ── CONFUSION: high confusion + revisits ──
  if (cc > 0.45 && src >= 2) {
    return { stateLabel: 'CONFUSION', confidence: clamp01(cc) }
  }

  // ── OVERLOAD: fatigue + confusion or high abandonment ──
  if (fs > 0.55 && (cc > 0.35 || ab > 0.4)) {
    return { stateLabel: 'OVERLOAD', confidence: clamp01(fs * 0.5 + cc * 0.3 + 0.2) }
  }

  // ── MIND_WANDER: high idle or rising abandonment, low productive signals ──
  if ((idle > 15 || ab > 0.35) && ks < 15 && sv < 200) {
    const conf = clamp01(Math.max(idle / 30, ab) * 0.7 + 0.2)
    return { stateLabel: 'MIND_WANDER', confidence: conf }
  }

  // ── BOREDOM: flatline — low everything, medium idle, low confusion ──
  if (ks < 10 && sv < 100 && cd < 3 && idle > 5 && idle < 25 && cc < 0.2) {
    return { stateLabel: 'BOREDOM', confidence: clamp01(0.4 + (1 - ks / 10) * 0.3) }
  }

  // ── FLOW: steady activity, low distraction, low confusion/fatigue/rushing ──
  const hasActivity = ks > 15 || sv > 150
  if (hasActivity && cc < 0.3 && fs < 0.4 && rs < 0.4 && ab < 0.15 && idle < 10) {
    return { stateLabel: 'FLOW', confidence: clamp01(0.5 + (1 - cc) * 0.25 + (1 - fs) * 0.25) }
  }

  // Default: moderate FLOW (some activity but not strongly classified)
  if (hasActivity) {
    return { stateLabel: 'FLOW', confidence: 0.4 }
  }

  return { stateLabel: 'MIND_WANDER', confidence: 0.35 }
}

// ─── Window Lifecycle ────────────────────────────────────────

function finalizeWindow(): TelemetrySnapshot {
  const features = computeFeatures()
  const { stateLabel, confidence } = classifyState(features)

  // Push to ring buffer
  const summary: WindowSummary = {
    timestamp: now(),
    features,
    stateLabel,
    confidence,
  }
  ringBuffer.push(summary)
  if (ringBuffer.length > config.ringBufferSize) {
    const removed = ringBuffer.shift()!
    // Subtract removed window's hidden time from total
    const removedAb = removed.features.abandonment_rate ?? 0
    totalHiddenMs = Math.max(0, totalHiddenMs - removedAb * config.windowMs)
  }

  // Save current as previous for next window
  prevWindowFeatures = { ...features }

  // Reset per-window counters
  resetWindowCounters()

  if (config.debugMode) {
    console.log('[ProSocratic Telemetry]', stateLabel, confidence.toFixed(2), features)
  }

  return { feature_summary: features, state_label: stateLabel, confidence }
}

function resetWindowCounters(): void {
  maxIdleGapMs = 0
  hiddenMs = 0
  forwardNavCount = 0
  revisitCount = 0
  modalityAccum = { READING: 0, WRITING: 0, NAV: 0, IDLE: 0 }
  modalityStart = now()
  // Keep seenBins for section revisit tracking (reset every 10 min via ring buffer overflow)
}

// ─── Public API ──────────────────────────────────────────────

export function startTelemetry(startTs?: number, userConfig?: Partial<TelemetryConfig>): void {
  if (running) return
  running = true
  sessionStartTs = startTs ?? now()
  lastEventTs = now()
  modalityStart = now()
  lastHistoryLength = history.length

  if (userConfig) {
    config = { ...DEFAULT_CONFIG, ...userConfig }
  }

  // Attach listeners (content script context)
  const add = (el: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
    el.addEventListener(type, fn, opts)
    boundListeners.push({ el, type, fn })
  }

  add(document, 'keydown', onKeydown as EventListener, { passive: true })
  add(document, 'scroll', onScroll as EventListener, { passive: true })
  add(document, 'click', onClick as EventListener, { passive: true })
  add(document, 'visibilitychange', onVisibilityChange as EventListener)
  add(window, 'popstate', onPopstate as EventListener)

  // Track idle gaps via periodic check (every 2s)
  const idleChecker = setInterval(() => {
    if (!running) { clearInterval(idleChecker); return }
    if (lastEventTs > 0) {
      const gap = now() - lastEventTs
      if (gap > maxIdleGapMs) maxIdleGapMs = gap
    }
    // Update modality to IDLE if no events for 5s
    if (now() - lastEventTs > config.idleThresholdMs && currentModality !== 'IDLE') {
      updateModality('IDLE')
    }
  }, 2000)
}

export function stopTelemetry(): void {
  running = false
  // Remove all listeners
  for (const { el, type, fn } of boundListeners) {
    el.removeEventListener(type, fn)
  }
  boundListeners = []

  if (emitterTimer !== null) {
    clearInterval(emitterTimer)
    emitterTimer = null
  }
}

export function getCurrentWindowFeatures(): TelemetrySnapshot {
  const features = computeFeatures()
  const { stateLabel, confidence } = classifyState(features)
  return { feature_summary: features, state_label: stateLabel, confidence }
}

export function markMicroAssessSuccess(): void {
  insightBiasUntil = now() + config.insightBiasMs
}

export function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname + u.pathname
  } catch {
    return 'unknown'
  }
}

export function buildSessionUpdatePayload(
  session_id: string,
  url: string,
  title: string
): SessionUpdatePayload {
  const snapshot = finalizeWindow()
  return {
    session_id,
    url: sanitizeUrl(url),
    title,
    timestamp: now(),
    window_duration_s: config.windowMs / 1000,
    ...snapshot,
  }
}

/**
 * Start emitting telemetry snapshots at a fixed interval.
 * Calls `callback` with the finalized window snapshot every `intervalMs`.
 */
export function startEmitter(
  callback: (snapshot: TelemetrySnapshot) => void,
  intervalMs: number = 30_000
): () => void {
  if (emitterTimer !== null) clearInterval(emitterTimer)

  emitterTimer = window.setInterval(() => {
    if (!running) return
    const snapshot = finalizeWindow()
    callback(snapshot)
  }, intervalMs) as unknown as number

  // Return stop function
  return () => {
    if (emitterTimer !== null) {
      clearInterval(emitterTimer)
      emitterTimer = null
    }
  }
}

/**
 * Get the full ring buffer of recent window summaries (last 10 min).
 */
export function getRecentHistory(): WindowSummary[] {
  return [...ringBuffer]
}

/**
 * Self-check: prints computed features to console when DEBUG flag is true.
 * NEVER prints sensitive data. Only numeric aggregates.
 */
export function selfCheck(): void {
  if (!config.debugMode) return
  const snap = getCurrentWindowFeatures()
  console.table(snap.feature_summary)
  console.log('State:', snap.state_label, '| Confidence:', snap.confidence.toFixed(3))
}
