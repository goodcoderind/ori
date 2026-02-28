/**
 * useBehavioralSensors — Wires the telemetry engine into the overlay.
 *
 * GATED behind sessionActive:
 *   - Starts telemetry ONLY when the user clicks "Start Studying".
 *   - Stops telemetry when the session ends.
 *   - No data is collected or transmitted until a session is active.
 *
 * On session start:
 *   1. Starts the telemetry engine (keystrokes, scroll, clicks, visibility, nav).
 *   2. Starts the 30s emitter.
 *   3. Each snapshot is fed to the store's handleTelemetrySnapshot,
 *      then forwarded to the background service worker → backend.
 *
 * Privacy: Only numeric aggregates flow through. No content captured.
 */

import { useEffect, useRef } from 'react'
import { useOverlayStore } from '../store/overlayStore'
import { startTelemetry, startEmitter, stopTelemetry } from '../../telemetry/telemetry'

export function useBehavioralSensors() {
  const sessionActive = useOverlayStore(s => s.sessionActive)
  const handleSnapshot = useOverlayStore(s => s.handleTelemetrySnapshot)
  const startBehavioralTimer = useOverlayStore(s => s.startBehavioralTimer)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (sessionActive && !cleanupRef.current) {
      // Session just started — begin telemetry collection
      startTelemetry(Date.now(), {
        debugMode: false,
      })

      startBehavioralTimer()

      // Start 30s emitter — each snapshot feeds the store + background worker
      const stopEmit = startEmitter((snapshot) => {
        // Only forward if session is still active
        if (!useOverlayStore.getState().sessionActive) return

        handleSnapshot(snapshot)

        // Post to background worker → backend
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          try {
            chrome.runtime.sendMessage({
              type: 'TELEMETRY_WINDOW',
              payload: {
                ...snapshot,
                url: window.location.hostname + new URL(window.location.href).pathname,
                title: document.title,
                timestamp: Date.now(),
              },
            })
          } catch {
            // Extension context may be invalid (page unloaded, etc.)
          }
        }
      }, 30_000)

      cleanupRef.current = () => {
        stopEmit()
        stopTelemetry()
      }
    } else if (!sessionActive && cleanupRef.current) {
      // Session ended — stop telemetry
      cleanupRef.current()
      cleanupRef.current = null
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [sessionActive, handleSnapshot, startBehavioralTimer])
}
