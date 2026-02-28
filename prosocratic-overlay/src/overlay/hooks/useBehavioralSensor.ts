/**
 * useBehavioralSensor — Behavioral Telemetry Hook
 *
 * From Workflow Doc Section 01 (SENSE):
 * "A lightweight JS layer captures what you do, never what you write.
 *  Signals collected every 500ms: keystroke rhythm, backspace bursts,
 *  scroll velocity, section revisit count, idle gaps, and modality dwell time."
 *
 * PRIVACY FRAMEWORK:
 * - Only metadata (timing, velocity, patterns) — NEVER content
 * - No student text captured. No camera. No microphone.
 * - Signals are ephemeral per session
 *
 * This runs in the content script context and sends signals
 * to the background service worker via chrome.runtime.sendMessage
 */

import { useEffect, useRef } from 'react'
import type { BehavioralSignal } from '../../shared/types'

const POLL_INTERVAL = 500 // ms — per the spec

export function useBehavioralSensor() {
  const metricsRef = useRef({
    lastScrollY: 0,
    lastScrollTime: 0,
    scrollDirection: 'down' as 'up' | 'down',
    scrollBacktrackCount: 0,
    lastKeystrokeTime: 0,
    keystrokeIntervals: [] as number[],
    backspaceCount: 0,
    keystrokeCount: 0,
    lastActivityTime: Date.now(),
    sectionVisitCounts: new Map<number, number>(),  // scroll position → visit count
    sessionStartTime: Date.now(),
    clickCount: 0,
    lastClickTime: 0,
  })

  useEffect(() => {
    const m = metricsRef.current

    // ─── Scroll Tracking ────────────────────────────────
    function handleScroll() {
      const now = Date.now()
      const currentY = window.scrollY
      const prevY = m.lastScrollY
      const deltaTime = now - m.lastScrollTime

      if (deltaTime > 0) {
        const velocity = Math.abs(currentY - prevY) / deltaTime

        // Detect scroll direction change (backtracking signal)
        const newDirection = currentY > prevY ? 'down' : 'up'
        if (newDirection !== m.scrollDirection && deltaTime < 3000) {
          m.scrollBacktrackCount++
        }
        m.scrollDirection = newDirection

        // Track section revisits
        const section = Math.floor(currentY / 500) // 500px sections
        m.sectionVisitCounts.set(section, (m.sectionVisitCounts.get(section) || 0) + 1)

        // Send scroll velocity signal
        sendSignal({
          type: 'scroll_velocity',
          value: velocity,
          confidence: Math.min(velocity / 2, 1),
          timestamp: now,
          metadata: { direction: newDirection, backtrackCount: m.scrollBacktrackCount },
        })
      }

      m.lastScrollY = currentY
      m.lastScrollTime = now
      m.lastActivityTime = now
    }

    // ─── Keystroke Tracking (rhythm only, never content) ──
    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now()
      const interval = now - m.lastKeystrokeTime

      // Track rhythm (intervals between keystrokes)
      if (m.lastKeystrokeTime > 0 && interval < 5000) {
        m.keystrokeIntervals.push(interval)
        // Keep last 20 intervals
        if (m.keystrokeIntervals.length > 20) {
          m.keystrokeIntervals.shift()
        }
      }

      // Track backspace bursts (confusion signal)
      if (e.key === 'Backspace') {
        m.backspaceCount++
      }

      m.keystrokeCount++
      m.lastKeystrokeTime = now
      m.lastActivityTime = now
    }

    // ─── Click Tracking ──────────────────────────────────
    function handleClick() {
      m.clickCount++
      m.lastClickTime = Date.now()
      m.lastActivityTime = Date.now()
    }

    // ─── Visibility Change (modality dwell) ──────────────
    function handleVisibilityChange() {
      if (document.hidden) {
        sendSignal({
          type: 'modality_dwell',
          value: Date.now() - m.sessionStartTime,
          confidence: 1,
          timestamp: Date.now(),
          metadata: { event: 'tab_hidden' },
        })
      }
    }

    // ─── Periodic Signal Emission ─────────────────────────
    const pollInterval = setInterval(() => {
      const now = Date.now()
      const idleDuration = now - m.lastActivityTime

      // Idle detection
      if (idleDuration > 10000) { // 10 seconds of no activity
        sendSignal({
          type: 'idle_period',
          value: idleDuration,
          confidence: Math.min(idleDuration / 60000, 1), // caps at 1 min
          timestamp: now,
        })
      }

      // Keystroke rhythm analysis
      if (m.keystrokeIntervals.length >= 5) {
        const avgInterval = m.keystrokeIntervals.reduce((a, b) => a + b, 0) / m.keystrokeIntervals.length
        const variance = m.keystrokeIntervals.reduce((sum, v) => sum + Math.pow(v - avgInterval, 2), 0) / m.keystrokeIntervals.length

        sendSignal({
          type: 'keystroke_rhythm',
          value: avgInterval,
          confidence: Math.min(m.keystrokeIntervals.length / 20, 1),
          timestamp: now,
          metadata: {
            avgInterval,
            variance,
            backspaceBursts: m.backspaceCount,
            totalKeystrokes: m.keystrokeCount,
          },
        })
      }

      // Click density
      const sessionDuration = (now - m.sessionStartTime) / 1000
      if (sessionDuration > 0) {
        sendSignal({
          type: 'click_density',
          value: m.clickCount / sessionDuration,
          confidence: Math.min(sessionDuration / 60, 1),
          timestamp: now,
        })
      }

      // Section revisit detection (confusion signal)
      const revisitedSections = Array.from(m.sectionVisitCounts.values()).filter(v => v > 2)
      if (revisitedSections.length > 0) {
        sendSignal({
          type: 'section_revisit',
          value: revisitedSections.length,
          confidence: Math.min(revisitedSections.length / 3, 1),
          timestamp: now,
          metadata: { maxRevisits: Math.max(...revisitedSections) },
        })
      }

      // Scroll backtrack signal
      if (m.scrollBacktrackCount > 0) {
        sendSignal({
          type: 'scroll_backtrack',
          value: m.scrollBacktrackCount,
          confidence: Math.min(m.scrollBacktrackCount / 5, 1),
          timestamp: now,
        })
      }

      // Reset periodic counters
      m.backspaceCount = 0

    }, POLL_INTERVAL)

    // ─── Attach Listeners ─────────────────────────────────
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('keydown', handleKeyDown, { passive: true })
    window.addEventListener('click', handleClick, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(pollInterval)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('click', handleClick)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])
}

// ─── Send Signal to Background ────────────────────────────────
function sendSignal(signal: BehavioralSignal) {
  try {
    chrome.runtime.sendMessage({
      type: 'BEHAVIORAL_SIGNAL',
      payload: signal,
    })
  } catch {
    // Extension context not available (e.g., dev mode)
  }
}
