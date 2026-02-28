/**
 * NudgeCard — Clean suggestion card (Cluely style)
 *
 * Black/white palette. Lightbulb icon, suggestion text,
 * blue "Click to see how to use it here" link, "personalized" tag.
 */

import { motion } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'
import type { Nudge } from '../../shared/types'

interface NudgeCardProps {
  nudge: Nudge
}

export default function NudgeCard({ nudge }: NudgeCardProps) {
  const { acceptNudge, dismissNudge } = useOverlayStore()

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        margin: '10px 12px 4px',
        padding: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
      }}
    >
      {/* Top row: lightbulb + text */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>
          💡
        </span>
        <div style={{ flex: 1 }}>
          <p style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.8)',
            lineHeight: 1.5,
            margin: 0,
            fontWeight: 400,
          }}>
            {nudge.message}
          </p>

          {/* Blue action link */}
          <motion.button
            onClick={() => acceptNudge(0)}
            whileHover={{ opacity: 0.8 }}
            whileTap={{ scale: 0.98 }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#60a5fa',
              fontSize: '12.5px',
              cursor: 'pointer',
              padding: '4px 0 0',
              fontFamily: 'inherit',
              fontWeight: 500,
              textAlign: 'left',
            }}
          >
            Click to see how to use it here →
          </motion.button>
        </div>
      </div>

      {/* Bottom row: personalized tag + dismiss */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{
          fontSize: '10.5px',
          color: 'rgba(255,255,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span style={{ fontSize: '11px' }}>👆</span> personalized
        </span>

        <motion.button
          onClick={dismissNudge}
          whileHover={{ color: 'rgba(255,255,255,0.4)' }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.15)',
            fontSize: '11px',
            cursor: 'pointer',
            padding: '2px 0',
            fontFamily: 'inherit',
          }}
        >
          Dismiss
        </motion.button>
      </div>
    </motion.div>
  )
}
