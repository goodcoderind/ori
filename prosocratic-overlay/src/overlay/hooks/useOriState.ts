/**
 * useOriState — Listens for Ori state changes from background script
 *
 * The background service worker processes behavioral signals through
 * the backend ML pipeline and sends back:
 *   - Ori state changes (sleep -> noticing -> awake -> sparkle)
 *   - Classified cognitive states
 *   - Nudge data when threshold is crossed
 *
 * This hook bridges the Chrome messaging API to the Zustand store.
 */

import { useEffect } from 'react'
import { useOverlayStore } from '../store/overlayStore'
import type { ChromeMessage, Nudge, TransparencyData, TechniqueType } from '../../shared/types'

export function useOriState() {
  useEffect(() => {
    function handleMessage(message: ChromeMessage) {
      const store = useOverlayStore.getState()

      // Ignore all backend messages unless session is active
      if (!store.sessionActive) return

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

          const nudge: Nudge = {
            id: rawNudge.id,
            message: rawNudge.message,
            technique: rawNudge.technique,
            timestamp: rawNudge.timestamp,
            options: (rawNudge.options as unknown as string[]).map((label: string) => ({
              label,
              action: () => {
                const techniqueType = rawNudge.technique as TechniqueType
                store.dismissNudge()
                store.startTechnique(
                  techniqueType,
                  `Let's try ${rawNudge.technique}. I'll guide you through it step by step.`
                )
              },
            })),
            onDismiss: () => store.dismissNudge(),
          }

          const transparencyData: TransparencyData = transparency

          store.surfaceNudge(nudge, transparencyData)
          break
        }
      }
    }

    try {
      chrome.runtime.onMessage.addListener(handleMessage)
      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage)
      }
    } catch {
      return
    }
  }, [])
}
