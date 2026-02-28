/**
 * ProSocratic Background Service Worker
 *
 * Central message router between:
 *   Content Script (behavioral sensor) -> Background -> Backend API
 *   Backend API -> Background -> Content Script (overlay store)
 *
 * Handles:
 *   - Session lifecycle (start on page load, end on tab close/navigate)
 *   - Telemetry forwarding (30s snapshots -> POST /v1/session/update)
 *   - Chat forwarding (user messages -> POST /v1/questions/answer)
 *   - Micro-assessment generation and submission
 *   - chrome.storage sync for dashboard
 */

import type {
  ChromeMessage,
  SessionData,
  TechniqueType,
} from '../shared/types'
import type { TelemetrySnapshot } from '../telemetry/types'
import { API, DEFAULT_API_BASE_URL, USER_ID_HEADER } from '@shared/apiConfig'
import type {
  SessionUpdateResponse,
  MicroassessGenerateResponse,
  MicroassessSubmitResponse,
  UnaskedQuestionResponse,
} from '@shared/apiTypes'

// ─── Configuration ────────────────────────────────────────────
const BACKEND_URL = (import.meta.env?.VITE_BACKEND_URL as string) || DEFAULT_API_BASE_URL
const USER_ID_KEY = 'prosocratic_user_id'

// ─── State ────────────────────────────────────────────────────
let currentSessionId: string | null = null
let currentPageContext = { topic: '', url: '', title: '' }

// ─── User ID ──────────────────────────────────────────────────
let _userId: string | null = null

async function getUserId(): Promise<string> {
  if (_userId) return _userId

  try {
    const result = await chrome.storage.local.get(USER_ID_KEY)
    if (result[USER_ID_KEY]) {
      _userId = result[USER_ID_KEY]
      return _userId!
    }
  } catch { /* noop */ }

  const newId = crypto.randomUUID()
  _userId = newId
  await chrome.storage.local.set({ [USER_ID_KEY]: newId })
  return newId
}

// ─── Backend Fetch Helpers ────────────────────────────────────

async function backendPost<T>(path: string, body: unknown): Promise<T> {
  const userId = await getUserId()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [USER_ID_HEADER]: userId,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ─── Session Lifecycle ────────────────────────────────────────

async function startBackendSession(url: string, title: string, topicLabel?: string): Promise<string> {
  try {
    const data = await backendPost<{ session_id: string }>(API.SESSION_START, {
      url,
      title,
      ...(topicLabel ? { topic_label: topicLabel } : {}),
    })
    console.log('[ProSocratic] Session started:', data.session_id)
    return data.session_id
  } catch (err) {
    console.warn('[ProSocratic] Failed to start session:', err)
    return ''
  }
}

async function endBackendSession(sessionId: string): Promise<void> {
  if (!sessionId) return
  try {
    await backendPost<{ ok: boolean }>(API.SESSION_END, {
      session_id: sessionId,
    })
    console.log('[ProSocratic] Session ended:', sessionId)
  } catch (err) {
    console.warn('[ProSocratic] Failed to end session:', err)
  }
}

// ─── Telemetry -> Backend ──────────────────────────────────────

async function sendTelemetryUpdate(
  snapshot: TelemetrySnapshot & { url: string; title: string },
  tabId?: number,
): Promise<void> {
  if (!currentSessionId) return

  try {
    const response = await backendPost<SessionUpdateResponse>(API.SESSION_UPDATE, {
      session_id: currentSessionId,
      state_label: snapshot.state_label,
      confidence: snapshot.confidence,
      feature_summary: snapshot.feature_summary,
      url: snapshot.url,
      title: snapshot.title,
    })

    // Forward the policy engine result to the content script
    if (tabId) {
      // Send ori state
      chrome.tabs.sendMessage(tabId, {
        type: 'ORI_STATE_CHANGE',
        payload: { state: mapOriState(response.ori_state) },
      }).catch(() => {})

      // Send state classification
      chrome.tabs.sendMessage(tabId, {
        type: 'STATE_CLASSIFIED',
        payload: {
          state: snapshot.state_label.toLowerCase(),
          confidence: snapshot.confidence,
          signals: [],
          suggestedTechnique: response.suggestion.technique_id || undefined,
        },
      }).catch(() => {})

      // If backend suggests a technique, surface as nudge
      if (response.suggestion.type === 'TECHNIQUE' && response.suggestion.technique_id) {
        chrome.tabs.sendMessage(tabId, {
          type: 'NUDGE_READY',
          payload: {
            nudge: {
              id: `nudge-${Date.now()}`,
              message: response.suggestion.title || 'Try this technique',
              technique: mapTechniqueId(response.suggestion.technique_id),
              options: [response.suggestion.cta || 'Try it'],
              timestamp: Date.now(),
            },
            transparency: {
              signal: response.transparency_card.why_detected,
              state: `${snapshot.state_label} — ${Math.round(snapshot.confidence * 100)}% confidence`,
              gap: response.transparency_card.why_this,
              technique: response.suggestion.technique_id,
              successRate: response.transparency_card.user_success_rate != null
                ? `${Math.round(response.transparency_card.user_success_rate * 100)}% success rate`
                : undefined,
            },
          },
        }).catch(() => {})
      }

      // If backend suggests a micro-assessment, forward to content script
      if (response.suggestion.type === 'MICRO_ASSESS') {
        chrome.tabs.sendMessage(tabId, {
          type: 'MICROASSESS_SUGGESTED',
          payload: {
            suggestion: response.suggestion,
            transparency: response.transparency_card,
          },
        }).catch(() => {})
      }

      // Handle sleep flag
      if (response.session_flags.asleep_flag) {
        chrome.tabs.sendMessage(tabId, {
          type: 'ORI_STATE_CHANGE',
          payload: { state: 'sleep' },
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('[ProSocratic] Session update failed:', err)
  }
}

// ─── Chat -> Backend ───────────────────────────────────────────

async function handleChatRequest(message: string): Promise<{
  response: string
  isSocratic: boolean
}> {
  if (!currentSessionId) {
    return {
      response: 'Session is still starting. Please try again in a moment.',
      isSocratic: false,
    }
  }

  try {
    const data = await backendPost<{
      direct_answer: string
      follow_up: { question: string; type: string }
    }>(API.QUESTIONS_ANSWER, {
      question: message,
      page_context: currentPageContext.title.slice(0, 2000),
      topic_label: currentPageContext.topic || 'General',
      session_id: currentSessionId,
    })

    const response = data.follow_up?.question
      ? `${data.direct_answer}\n\n${data.follow_up.question}`
      : data.direct_answer

    return {
      response,
      isSocratic: !!data.follow_up?.question,
    }
  } catch (err) {
    console.warn('[ProSocratic] Chat request failed:', err)
    return {
      response: 'Unable to reach the backend. Please check your connection and try again.',
      isSocratic: false,
    }
  }
}

// ─── Message Listener ─────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ChromeMessage & { type: string; payload?: unknown }, sender, sendResponse) => {
    handleMessage(message, sender.tab?.id).then(sendResponse).catch(console.error)
    return true // Keep message channel open for async response
  }
)

async function handleMessage(
  message: ChromeMessage & { type: string; payload?: unknown },
  tabId?: number,
): Promise<unknown> {
  switch (message.type) {
    // ─── Page context from content script ───
    case 'PAGE_CONTEXT': {
      const ctx = message.payload as { topic: string; url: string; textLength?: number }
      currentPageContext = {
        topic: ctx.topic,
        url: ctx.url,
        title: ctx.topic,
      }

      // End previous session if one exists
      if (currentSessionId) {
        await endBackendSession(currentSessionId)
      }

      // Start a new backend session for this page
      currentSessionId = await startBackendSession(
        ctx.url,
        ctx.topic,
        ctx.topic || undefined,
      )

      return { received: true, sessionId: currentSessionId }
    }

    // ─── Telemetry window from content script sensor ───
    case 'TELEMETRY_WINDOW': {
      const snapshot = message.payload as unknown as TelemetrySnapshot & {
        url: string
        title: string
      }
      await sendTelemetryUpdate(snapshot, tabId)
      return { received: true }
    }

    // ─── Legacy behavioral signal (deprecated, no-op) ───
    case 'BEHAVIORAL_SIGNAL':
      return { received: true }

    // ─── Chat request from overlay store ───
    case 'CHAT_REQUEST': {
      const chatPayload = message.payload as { message: string; sessionId?: string }
      return await handleChatRequest(chatPayload.message)
    }

    // ─── Micro-assessment generation ───
    case 'MICROASSESS_GENERATE': {
      if (!currentSessionId) return { error: 'No active session' }
      const maPayload = message.payload as {
        topic_label: string
        page_context: { headings: string[]; cleaned_text_snippet: string }
        difficulty?: 'easy' | 'med' | 'hard'
      }
      try {
        const maResult = await backendPost<MicroassessGenerateResponse>(API.MICROASSESS_GENERATE, {
          session_id: currentSessionId,
          topic_label: maPayload.topic_label,
          page_context: {
            headings: maPayload.page_context.headings,
            cleaned_text_snippet: maPayload.page_context.cleaned_text_snippet.slice(0, 2500),
          },
          difficulty: maPayload.difficulty || 'med',
        })
        return maResult
      } catch (err) {
        console.warn('[ProSocratic] Micro-assess generate failed:', err)
        return { error: 'Failed to generate micro-assessment' }
      }
    }

    // ─── Micro-assessment submission ───
    case 'MICROASSESS_SUBMIT': {
      const msPayload = message.payload as {
        probe_set_id: string
        probe_type: 'recall' | 'transfer'
        answer_text: string
      }
      try {
        const scoreResult = await backendPost<MicroassessSubmitResponse>(API.MICROASSESS_SUBMIT, {
          probe_set_id: msPayload.probe_set_id,
          probe_type: msPayload.probe_type,
          answer_text: msPayload.answer_text.slice(0, 3000),
        })
        return scoreResult
      } catch (err) {
        console.warn('[ProSocratic] Micro-assess submit failed:', err)
        return { error: 'Failed to submit micro-assessment' }
      }
    }

    // ─── Unasked Socratic question ───
    case 'UNASKED_QUESTION': {
      if (!currentSessionId) return { error: 'No active session' }
      const uqPayload = message.payload as {
        topic_label: string
        page_context: { headings: string[]; cleaned_text_snippet: string }
      }
      try {
        const uqResult = await backendPost<UnaskedQuestionResponse>(API.UNASKED_QUESTION, {
          session_id: currentSessionId,
          topic_label: uqPayload.topic_label,
          page_context: {
            headings: uqPayload.page_context.headings,
            cleaned_text_snippet: uqPayload.page_context.cleaned_text_snippet.slice(0, 2500),
          },
        })
        return uqResult
      } catch (err) {
        console.warn('[ProSocratic] Unasked question generation failed:', err)
        return { error: 'Failed to generate unasked question' }
      }
    }

    // ─── Session sync (write to chrome.storage for dashboard) ───
    case 'SESSION_SYNC':
      await syncToDashboard(message.payload as SessionData)
      return { synced: true }

    default:
      return { error: 'Unknown message type' }
  }
}

// ─── Tab Lifecycle ──────────────────────────────────────────────

chrome.tabs.onRemoved.addListener(async () => {
  if (currentSessionId) {
    await endBackendSession(currentSessionId)
    currentSessionId = null
  }
})

chrome.tabs.onActivated.addListener(async () => {
  if (currentSessionId) {
    await endBackendSession(currentSessionId)
    currentSessionId = null
  }
})

// ─── Dashboard Sync ───────────────────────────────────────────
async function syncToDashboard(sessionData: SessionData) {
  try {
    const result = await chrome.storage.local.get('prosocratic_sessions')
    const sessions: SessionData[] = result.prosocratic_sessions || []

    const existingIndex = sessions.findIndex(s => s.sessionId === sessionData.sessionId)
    if (existingIndex >= 0) {
      sessions[existingIndex] = sessionData
    } else {
      sessions.push(sessionData)
    }

    const trimmed = sessions.slice(-50)

    await chrome.storage.local.set({
      prosocratic_sessions: trimmed,
      prosocratic_current_session: sessionData,
    })
  } catch (err) {
    console.warn('[ProSocratic] Dashboard sync failed:', err)
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function mapOriState(backendState: string): string {
  const map: Record<string, string> = {
    'IDLE': 'sleep',
    'NOTICING': 'noticing',
    'HAS_SOMETHING': 'awake',
    'INSIGHT': 'sparkle',
    'FATIGUE': 'fatigue',
    'FRUSTRATED': 'frustrated',
  }
  return map[backendState] || 'sleep'
}

function mapTechniqueId(techniqueId: string): TechniqueType {
  const map: Record<string, TechniqueType> = {
    'feynman': 'feynman',
    'active_recall': 'active_recall',
    'pomodoro': 'pomodoro',
    'strategic_rest': 'strategic_rest',
    'elaborative_interrogation': 'feynman',
    'spaced_retrieval': 'active_recall',
    'interleaving': 'quiz',
    'error_analysis': 'active_recall',
    'modality_switching': 'strategic_rest',
    'metacognitive_monitoring': 'active_recall',
  }
  return map[techniqueId] || 'active_recall'
}

// ─── Extension Lifecycle ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[ProSocratic] Extension installed')
  await getUserId()
})
