/**
 * ProSocratic Background Service Worker
 *
 * Central message router between:
 *   Content Script (behavioral sensor) → Background → Backend API
 *   Backend API → Background → Content Script (overlay store)
 *
 * Also handles:
 *   - Signal batching (collects signals, sends every 5s)
 *   - Page context tracking
 *   - Session lifecycle
 *   - chrome.storage sync for Abhra's dashboard
 */

import type {
  ChromeMessage,
  BehavioralSignal,
  SignalRequest,
  SignalResponse,
  SessionData,
} from '../shared/types'

// ─── Configuration ────────────────────────────────────────────
const BACKEND_URL = 'http://localhost:3001/api'  // Replace with Harmanjot's URL
const SIGNAL_BATCH_INTERVAL = 5000               // Send signals every 5 seconds
const SIGNAL_BATCH_SIZE = 20                     // Max signals per batch

// ─── State ────────────────────────────────────────────────────
let signalBuffer: BehavioralSignal[] = []
let currentPageContext = { topic: '', url: '' }
let sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ─── Message Listener ─────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (message: ChromeMessage, sender, sendResponse) => {
    handleMessage(message, sender.tab?.id).then(sendResponse).catch(console.error)
    return true // Keep message channel open for async response
  }
)

async function handleMessage(message: ChromeMessage, tabId?: number): Promise<unknown> {
  switch (message.type) {
    // ─── Behavioral signal from content script sensor ───
    case 'BEHAVIORAL_SIGNAL':
      signalBuffer.push(message.payload)

      // If buffer is full, flush immediately
      if (signalBuffer.length >= SIGNAL_BATCH_SIZE) {
        await flushSignals(tabId)
      }
      return { received: true }

    // ─── Page context from content script ───
    case 'PAGE_CONTEXT':
      currentPageContext = {
        topic: message.payload.topic,
        url: message.payload.url,
      }
      return { received: true }

    // ─── Chat request (forwarded from overlay store) ───
    case 'CHAT_REQUEST':
      try {
        const response = await fetch(`${BACKEND_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message.payload.message,
            sessionId: message.payload.sessionId,
            pageContext: currentPageContext,
          }),
        })
        return await response.json()
      } catch (err) {
        console.warn('[ProSocratic] Backend unreachable, using fallback')
        return { response: 'I\'m having trouble connecting right now. Try asking again in a moment.', isSocratic: false }
      }

    // ─── Session sync (write to chrome.storage for dashboard) ───
    case 'SESSION_SYNC':
      await syncToDashboard(message.payload)
      return { synced: true }

    default:
      return { error: 'Unknown message type' }
  }
}

// ─── Signal Batching ──────────────────────────────────────────
// Batch signals and send to Harmanjot's orchestrator API
async function flushSignals(tabId?: number) {
  if (signalBuffer.length === 0) return

  const signals = [...signalBuffer]
  signalBuffer = []

  try {
    const request: SignalRequest = {
      signals,
      sessionId,
      pageContext: currentPageContext,
    }

    const response = await fetch(`${BACKEND_URL}/signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (response.ok) {
      const data: SignalResponse = await response.json()

      // Forward state update to the content script / overlay
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'STATE_CLASSIFIED',
          payload: data.classifiedState,
        })

        if (data.nudge) {
          chrome.tabs.sendMessage(tabId, {
            type: 'NUDGE_READY',
            payload: {
              nudge: {
                id: `nudge-${Date.now()}`,
                message: data.nudge.message,
                technique: data.nudge.technique,
                options: data.nudge.options,
                timestamp: Date.now(),
              },
              transparency: data.nudge.transparency,
            },
          })
        }

        // Update Ori state
        chrome.tabs.sendMessage(tabId, {
          type: 'ORI_STATE_CHANGE',
          payload: { state: data.oriState },
        })
      }
    }
  } catch (err) {
    // Backend offline — silently buffer. Don't crash the extension.
    console.warn('[ProSocratic] Signal flush failed, will retry:', err)
  }
}

// Set up periodic signal flushing
setInterval(async () => {
  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await flushSignals(tab.id)
  }
}, SIGNAL_BATCH_INTERVAL)

// ─── Dashboard Sync ───────────────────────────────────────────
// Writes session data to chrome.storage.local for Abhra's dashboard to read
async function syncToDashboard(sessionData: SessionData) {
  try {
    // Get existing sessions
    const result = await chrome.storage.local.get('prosocratic_sessions')
    const sessions: SessionData[] = result.prosocratic_sessions || []

    // Update or add current session
    const existingIndex = sessions.findIndex(s => s.sessionId === sessionData.sessionId)
    if (existingIndex >= 0) {
      sessions[existingIndex] = sessionData
    } else {
      sessions.push(sessionData)
    }

    // Keep last 50 sessions max
    const trimmed = sessions.slice(-50)

    await chrome.storage.local.set({
      prosocratic_sessions: trimmed,
      prosocratic_current_session: sessionData,
    })
  } catch (err) {
    console.warn('[ProSocratic] Dashboard sync failed:', err)
  }
}

// ─── Extension Lifecycle ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[ProSocratic] Extension installed')
})

// Reset session ID when a new tab becomes active
chrome.tabs.onActivated.addListener(() => {
  sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  signalBuffer = []
})
