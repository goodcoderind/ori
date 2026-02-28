/**
 * useOriState — Listens for Ori state changes from background script
 *
 * The background service worker processes behavioral signals through
 * Harmanjot's ML pipeline and sends back:
 *   - Ori state changes (sleep → noticing → awake → sparkle)
 *   - Classified cognitive states
 *   - Nudge data when threshold is crossed
 *
 * This hook bridges the Chrome messaging API to the Zustand store.
 */

import { useEffect } from 'react'
import { useOverlayStore } from '../store/overlayStore'
import type { ChromeMessage, Nudge, TransparencyData } from '../../shared/types'

export function useOriState() {
  useEffect(() => {
    function handleMessage(message: ChromeMessage) {
      const store = useOverlayStore.getState()

      switch (message.type) {
        case 'ORI_STATE_CHANGE':
          store.setOriState(message.payload.state)
          break

        case 'STATE_CLASSIFIED':
          store.handleSignalResponse({
            classifiedState: message.payload,
            oriState: message.payload.suggestedTechnique ? 'noticing' : store.oriState,
          })
          break

        case 'NUDGE_READY': {
          const { nudge: rawNudge, transparency } = message.payload

          // Reconstruct the nudge with proper action functions
          const nudge: Nudge = {
            id: rawNudge.id,
            message: rawNudge.message,
            technique: rawNudge.technique,
            timestamp: rawNudge.timestamp,
            options: (rawNudge.options as unknown as string[]).map((label: string) => ({
              label,
              action: () => {
                store.addOriMessage(
                  `Let's try ${rawNudge.technique}. I'll guide you through it step by step.`
                )
              },
            })),
            onDismiss: () => store.dismissNudge(),
          }

          const transparencyData: TransparencyData = transparency

          store.surfaceNudge(nudge, transparencyData)

          // Also open the panel if it's closed so the student sees it
          if (!store.isPanelOpen) {
            // Don't auto-open — just let Ori signal availability
            // The student clicks when ready (consent is the architecture)
          }
          break
        }
      }
    }

    // Listen for messages from background script
    try {
      chrome.runtime.onMessage.addListener(handleMessage)
      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage)
      }
    } catch {
      // Not in extension context (dev mode)
      return
    }
  }, [])

  // ─── Demo Mode ────────────────────────────────────────────
  // For development without the backend: auto-trigger a demo nudge
  // after 15 seconds of usage. Remove this when backend is connected.
  useEffect(() => {
    const isDev = !isExtensionContext()
    if (!isDev) return

    const demoTimer = setTimeout(() => {
      const store = useOverlayStore.getState()

      // Only trigger if no nudge is active
      if (store.hasNudge) return

      // Simulate Ori noticing something
      store.setOriState('noticing')

      setTimeout(() => {
        const nudge: Nudge = {
          id: 'demo-nudge-1',
          message: "You've been reading this section for a while, and I noticed you scrolled back twice. The backtracking pattern usually means something isn't clicking — not that you're not trying.",
          technique: 'Feynman Technique',
          options: [
            {
              label: 'Try it — explain it back to me',
              action: () => {
                store.addOriMessage(
                  "Great. In your own words, explain what you just read. Don't worry about being precise — the gaps in your explanation are exactly where we need to look.",
                  true
                )
              },
            },
            {
              label: 'Show me a diagram instead',
              action: () => {
                store.addOriMessage(
                  "Good call. Sometimes switching modalities unlocks what text can't. Let me find a visual way to show this.",
                  false
                )
              },
            },
            {
              label: 'Just explain it to me',
              action: () => {
                store.addOriMessage(
                  "I'll give you the explanation — but after, can I ask you one question about it? It'll take 30 seconds and it's the part that makes it stick.",
                  true
                )
              },
            },
          ],
          onDismiss: () => store.dismissNudge(),
          timestamp: Date.now(),
        }

        const transparency: TransparencyData = {
          signal: 'Scroll-back pattern (same section, twice) + idle period 2 min 10 sec',
          state: 'Confusion — 0.91 confidence',
          gap: 'Understanding of the current section\'s core mechanism',
          technique: 'Feynman Technique',
          successRate: 'First time trying this technique',
        }

        store.surfaceNudge(nudge, transparency)
      }, 2000)
    }, 15000)

    return () => clearTimeout(demoTimer)
  }, [])
}

function isExtensionContext(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id
  } catch {
    return false
  }
}
