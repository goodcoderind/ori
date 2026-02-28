/**
 * TriggerButton — Ori header control bar
 *
 * Layout (expanded):
 *   [🏠 Home]  [⏱ 00:25]  [Ori ●]
 *                                 [−] ← floating badge on Ori pill
 *
 * Layout (collapsed):
 *   [Ori]   ← clicking expands + opens chat
 *
 * All pills use framer-motion `layout` so the row reflows with spring physics.
 * Timer pill only appears when Pomodoro is running and reads live from store.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'

const BLUE = '#60a5fa'

const GLASS_BASE = {
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
  fontFamily: "'Inter', system-ui, sans-serif",
  outline: 'none',
  cursor: 'pointer',
  letterSpacing: '-0.01em',
} as const

const SPRING = { type: 'spring', stiffness: 500, damping: 38, mass: 0.5 } as const

// ─── Icons ───────────────────────────────────────────────────
function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 7L8 2l6 5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V7z"
        stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="none"
      />
      <path
        d="M6 15v-4h4v4"
        stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function OriIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
        <path
          d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
          stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2C4.686 2 2 4.686 2 8c0 1.17.336 2.262.916 3.184L2.1 13.9l2.716-.816A5.97 5.97 0 008 14c3.314 0 6-2.686 6-6s-2.686-6-6-6z"
        stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
      <circle cx="5.5" cy="8" r="0.65" fill="rgba(255,255,255,0.8)" />
      <circle cx="8"   cy="8" r="0.65" fill="rgba(255,255,255,0.8)" />
      <circle cx="10.5" cy="8" r="0.65" fill="rgba(255,255,255,0.8)" />
    </svg>
  )
}

// ─── Main component ──────────────────────────────────────────
export default function TriggerButton() {
  const {
    isPanelOpen, togglePanel, closePanel, hasNudge,
    activeTechnique, endTechnique,
  } = useOverlayStore()

  const [collapsed, setCollapsed] = useState(false)

  // ── Pomodoro live data ──────────────────────────────────────
  const isPomodoro =
    activeTechnique?.type === 'pomodoro' &&
    activeTechnique?.phase === 'pomodoro_running'
  const remaining = activeTechnique?.timeRemaining ?? 0
  const timerStr =
    `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`

  // ── Click handlers ──────────────────────────────────────────
  const handleOri = () => {
    if (collapsed) {
      setCollapsed(false)
      if (!isPanelOpen) togglePanel()
    } else {
      togglePanel()
    }
  }

  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsed(true)
    if (isPanelOpen) closePanel()
  }

  const handleHome = () => {
    if (activeTechnique) endTechnique()
    // ChatPanel's useEffect auto-scrolls to top when technique ends
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    // layout-animated outer row — reflows when pills appear/disappear
    <motion.div
      layout
      transition={SPRING}
      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
    >

      {/* ── Home button — blue circle, icon only ───────────── */}
      <AnimatePresence>
        {!collapsed && (
          <motion.button
            key="home"
            layout
            initial={{ opacity: 0, scale: 0.6, x: 14 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: 14 }}
            transition={SPRING}
            onClick={handleHome}
            whileHover={{ scale: 1.1, backgroundColor: '#4f96e8' }}
            whileTap={{ scale: 0.9 }}
            aria-label="Home"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: BLUE,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none',
              flexShrink: 0,
              padding: 0,
              boxShadow: '0 2px 10px rgba(96,165,250,0.35)',
            }}
          >
            <HomeIcon />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Pomodoro timer pill (live, read-only) ──────────── */}
      <AnimatePresence>
        {!collapsed && isPomodoro && (
          <motion.div
            key="timer"
            layout
            initial={{ opacity: 0, scale: 0.75, x: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.75, x: 10 }}
            transition={SPRING}
            style={{
              ...GLASS_BASE,
              background: 'rgba(10,10,10,0.72)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
              borderRadius: '12px',
              padding: '7px 11px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              pointerEvents: 'none',
              cursor: 'default',
            }}
          >
            {/* Pulsing blue dot */}
            <motion.div
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 5, height: 5, borderRadius: '50%',
                background: BLUE, flexShrink: 0,
              }}
            />
            <motion.span
              key={timerStr}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              style={{
                fontSize: '12px', fontWeight: 600,
                color: 'rgba(255,255,255,0.88)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.04em',
              }}
            >
              {timerStr}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ori pill + minus badge ──────────────────────────── */}
      <div style={{ position: 'relative' }}>

        {/* Ori pill */}
        <motion.button
          layout
          onClick={handleOri}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          style={{
            ...GLASS_BASE,
            background: 'rgba(10, 10, 10, 0.75)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            borderRadius: '12px',
            padding: '7px 13px',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            color: '#fff',
            fontSize: '12.5px',
            fontWeight: 500,
          }}
        >
          <OriIcon open={isPanelOpen && !collapsed} />

          <motion.span layout style={{ whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.85)' }}>
            {isPanelOpen && !collapsed ? 'Close' : 'Ori'}
          </motion.span>

          {/* Blue nudge dot */}
          <AnimatePresence>
            {hasNudge && !(isPanelOpen && !collapsed) && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 28 }}
                style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: BLUE, flexShrink: 0,
                }}
              />
            )}
          </AnimatePresence>
        </motion.button>

        {/* ── Minus badge — top-right corner of Ori pill ── */}
        <AnimatePresence>
          {!collapsed && (
            <motion.button
              key="minus"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30, delay: 0.05 }}
              onClick={handleCollapse}
              whileHover={{ scale: 1.25, backgroundColor: 'rgba(255,255,255,0.22)' }}
              whileTap={{ scale: 0.85 }}
              aria-label="Collapse"
              style={{
                position: 'absolute',
                top: -7,
                right: -7,
                width: 17,
                height: 17,
                borderRadius: '50%',
                background: 'rgba(20,20,20,0.8)',
                border: '1px solid rgba(255,255,255,0.16)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                outline: 'none',
                color: 'rgba(255,255,255,0.55)',
                fontSize: '13px',
                lineHeight: '1',
                fontWeight: 400,
                fontFamily: "'Inter', system-ui, sans-serif",
                padding: 0,
                paddingBottom: '1px',   // optical centering of −
              }}
            >
              −
            </motion.button>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  )
}
