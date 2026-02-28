/**
 * Ori Overlay — Root Component
 *
 * TOP-RIGHT positioning. Compact by default, expands dynamically.
 * Glassmorphism. TriggerButton manages its own collapse state.
 */

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useOverlayStore } from './store/overlayStore'
import ChatPanel from './components/ChatPanel'
import TriggerButton from './components/TriggerButton'
import OriMascot from './components/OriMascot'
import { useOriState } from './hooks/useOriState'

const SPRING = { type: 'spring', stiffness: 500, damping: 35, mass: 0.6 } as const

export default function App() {
  const { isPanelOpen } = useOverlayStore()

  useOriState()

  useEffect(() => {
    const interval = setInterval(() => {
      useOverlayStore.getState().syncSessionToStorage()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
    {/* Panda mascot — bottom-right, independent of panel layout */}
    <OriMascot />

    {/* layout-animated outer container so the header row reflow doesn't clip */}
    <motion.div
      layout
      transition={SPRING}
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 2147483647,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {/* Trigger — always visible. Manages Home / Timer / Ori / Minus internally. */}
      <div style={{ pointerEvents: 'all' }}>
        <TriggerButton />
      </div>

      {/* Chat panel — expands below the header row */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: -10, scale: 0.97, height: 0 }}
            animate={{ opacity: 1, y: 0, scale: 1, height: 'auto' }}
            exit={{ opacity: 0, y: -10, scale: 0.97, height: 0 }}
            transition={SPRING}
            style={{ pointerEvents: 'all', overflow: 'visible' }}
          >
            <ChatPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </>
  )
}
