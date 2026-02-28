/**
 * useBehavioralSensors — Wires the telemetry engine into the overlay.
 *
 * On mount:
 *   1. Starts the telemetry engine (keystrokes, scroll, clicks, visibility, nav).
 *   2. Starts the 30s emitter.
 *   3. Each snapshot is fed to the store's handleTelemetrySnapshot,
 *      which triggers techniques based on the computed cognitive state.
 *   4. Also detects page topic from <title> for personalisation.
 *
 * On unmount: cleans up all listeners and timers.
 *
 * Privacy: Only numeric aggregates flow through. No content captured.
 */

import { useEffect, useRef } from 'react'
import { useOverlayStore } from '../store/overlayStore'
import { startTelemetry, startEmitter, stopTelemetry } from '../../telemetry/telemetry'

export function useBehavioralSensors() {
  const handleSnapshot = useOverlayStore(s => s.handleTelemetrySnapshot)
  const setPageContext = useOverlayStore(s => s.setPageContext)
  const startBehavioralTimer = useOverlayStore(s => s.startBehavioralTimer)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Detect page topic from <title>
    const title = document.title || ''
    const url = window.location.href
    const topic = title.length > 3 && !['new tab', 'untitled'].includes(title.toLowerCase())
      ? title.replace(/\s*[-|–]\s*\w.*$/, '').trim()
      : url
    setPageContext(topic, url)

    // Start the telemetry engine (attaches all DOM listeners)
    startTelemetry(Date.now(), {
      debugMode: false, // set true for dev console output
    })

    // Start the legacy behavioral timer (for backwards compat during demo)
    startBehavioralTimer()

    // Start 30s emitter — each snapshot feeds the store's cognitive state handler
    const stopEmit = startEmitter((snapshot) => {
      handleSnapshot(snapshot)

      // Also post to background worker if chrome.runtime is available
      // Include mascotExpression so the backend can track emotional state
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const { mascotExpression, currentStateLabel, currentStateConfidence } = useOverlayStore.getState()
          chrome.runtime.sendMessage({
            type: 'TELEMETRY_WINDOW',
            payload: {
              ...snapshot,
              url: window.location.hostname + new URL(window.location.href).pathname,
              title: document.title,
              timestamp: Date.now(),
              mascotExpression,
              currentStateLabel,
              currentStateConfidence,
            },
          })
        } catch {
          // Extension context may be invalid (page unloaded, etc.)
        }
      }
    }, 30_000)

    return () => {
      stopEmit()
      stopTelemetry()
    }
  }, [handleSnapshot, setPageContext, startBehavioralTimer])
}
