/**
 * StatusPill — Small floating indicator
 *
 * Shows below the Ori avatar when the panel is closed but Ori has
 * a one-line status to share. From the User Journey doc:
 * "Why I'm about to say something — click to see."
 *
 * This is the transparency strip that appears when the system has
 * detected something worth surfacing.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'

export default function StatusPill() {
  const { oriState, hasNudge, isPanelOpen, activeNudge } = useOverlayStore()

  // Only show when: panel is closed, there's something to say, Ori is noticing
  const shouldShow = !isPanelOpen && hasNudge && oriState !== 'sleep'

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{
            background: 'rgba(12, 12, 14, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            padding: '6px 12px',
            maxWidth: '220px',
          }}
        >
          <p style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.35)',
            margin: 0,
            lineHeight: 1.4,
          }}>
            {activeNudge?.technique
              ? `Might help: ${activeNudge.technique}`
              : 'Ori notices something — click to see'
            }
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
