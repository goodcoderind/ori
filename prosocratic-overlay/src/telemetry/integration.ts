/**
 * Telemetry Integration Example
 *
 * Shows how a content script wires up the telemetry engine
 * and posts snapshots to the background service worker (or directly to backend).
 *
 * This file is NOT auto-imported. Copy the pattern into your content script
 * or overlay App component.
 */

import { startTelemetry, startEmitter, stopTelemetry, sanitizeUrl } from './telemetry'
import type { TelemetrySnapshot } from './types'

/**
 * Call once when the content script / overlay mounts.
 */
export function initTelemetry(): () => void {
  // Start collecting events
  startTelemetry(Date.now(), {
    debugMode: false,   // set to true for console output in dev
  })

  // Emit a snapshot every 30s
  const stopEmitter = startEmitter((snapshot: TelemetrySnapshot) => {
    // Option A: Post to background service worker via chrome.runtime.sendMessage
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'TELEMETRY_WINDOW',
        payload: {
          ...snapshot,
          url: sanitizeUrl(window.location.href),
          title: document.title,
          timestamp: Date.now(),
        },
      })
    }

    // All telemetry is routed through the background service worker (Option A above).
    // The service worker forwards snapshots to POST /v1/session/update.
  })

  // Return cleanup function
  return () => {
    stopEmitter()
    stopTelemetry()
  }
}
