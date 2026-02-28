/**
 * PanelHeader — Status indicator + close button
 *
 * Shows Ori's current state as a colored dot + text.
 * Minimal, informational, never distracting.
 */

import { motion } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'
import type { OriState } from '../../shared/types'

const statusConfig: Record<OriState, { text: string; color: string; glow: boolean }> = {
  sleep:      { text: 'Listening...',             color: '#6B7280', glow: false },
  noticing:   { text: 'Noticing something...',    color: '#F59E0B', glow: false },
  awake:      { text: 'Has something for you',    color: '#10B981', glow: true },
  sparkle:    { text: 'Insight detected',         color: '#F59E0B', glow: true },
  fatigue:    { text: 'Checking in...',           color: '#8B5CF6', glow: false },
  frustrated: { text: 'Switching modes',          color: '#EF4444', glow: false },
}

export default function PanelHeader() {
  const { oriState, closePanel } = useOverlayStore()
  const config = statusConfig[oriState]

  return (
    <div
      style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Left: status dot + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <motion.div
          animate={{
            background: config.color,
            boxShadow: config.glow
              ? `0 0 8px ${config.color}80`
              : 'none',
          }}
          transition={{ duration: 0.4 }}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            flexShrink: 0,
          }}
        />
        <motion.span
          key={config.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.02em',
            fontWeight: 500,
          }}
        >
          {config.text}
        </motion.span>
      </div>

      {/* Right: close button */}
      <CloseButton onClick={closePanel} />
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
      whileTap={{ scale: 0.9 }}
      style={{
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.3)',
        cursor: 'pointer',
        padding: '4px 6px',
        borderRadius: '6px',
        fontSize: '16px',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'inherit',
        transition: 'color 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
      aria-label="Close panel"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </motion.button>
  )
}
