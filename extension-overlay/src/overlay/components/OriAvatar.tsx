/**
 * Ori Avatar — The Heart of the UI
 *
 * This is the floating pill that is always visible. It's Ori's physical presence.
 * Design principles from the User Journey doc:
 * - "It should never feel like it's performing"
 * - "Silence is intentional — it makes the moments when Ori wakes up feel meaningful"
 *
 * States (from Section 7: Ori Behavioural Specification):
 *   sleep     → Eyes closed, slow breathing → "I'm here, nothing to surface right now"
 *   noticing  → One eye slightly open → "Something may be worth flagging soon"
 *   awake     → Both eyes open, lean forward → "I have something when you're ready"
 *   sparkle   → Burst animation → "That was a real understanding moment"
 *   fatigue   → Soft yawn → "Your focus is dropping. Break?"
 *   frustrated → Ears flatten → "Switching to direct explanation mode"
 *
 * We use SVG-based animations here instead of Lottie for zero-dependency simplicity.
 * Swap these for your Lottie files when the avatar art is ready.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'

export default function OriAvatar() {
  const { oriState, isPanelOpen, togglePanel, hasNudge } = useOverlayStore()

  return (
    <motion.button
      onClick={togglePanel}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={isPanelOpen ? 'Close ProSocratic' : 'Open ProSocratic'}
      style={{
        background: 'rgba(15, 15, 15, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '100px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset',
        color: 'white',
        fontSize: '13px',
        fontWeight: 500,
        letterSpacing: '-0.01em',
        fontFamily: "'Inter', system-ui, sans-serif",
        outline: 'none',
        transition: 'border-color 0.3s ease',
        borderColor: hasNudge ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.08)',
      }}
    >
      {/* ─── Avatar Circle (placeholder for Lottie) ─── */}
      <div style={{ width: 36, height: 36, position: 'relative' }}>
        <OriIcon state={oriState} />

        {/* Breathing glow ring when awake */}
        <AnimatePresence>
          {(oriState === 'awake' || oriState === 'sparkle') && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              style={{
                position: 'absolute',
                inset: '-3px',
                borderRadius: '50%',
                border: '1.5px solid rgba(245, 158, 11, 0.3)',
                animation: 'pulse-amber 2s ease-in-out infinite',
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ─── Status Text ─── only shows when Ori has something & panel is closed */}
      <AnimatePresence>
        {hasNudge && !isPanelOpen && (
          <motion.span
            initial={{ opacity: 0, width: 0, marginRight: 0 }}
            animate={{ opacity: 1, width: 'auto', marginRight: 4 }}
            exit={{ opacity: 0, width: 0, marginRight: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '12.5px',
              fontWeight: 400,
            }}
          >
            Ori notices something
          </motion.span>
        )}
      </AnimatePresence>

      {/* ─── Amber Notification Dot ─── */}
      <AnimatePresence>
        {hasNudge && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#F59E0B',
              boxShadow: '0 0 8px rgba(245, 158, 11, 0.6)',
              flexShrink: 0,
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  )
}

// ─── SVG Avatar States ────────────────────────────────────────
// These are placeholders — replace with Lottie animations when art is ready.
// Each state maps to a distinct visual per Section 7 of the User Journey doc.
function OriIcon({ state }: { state: string }) {
  const baseStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.4s ease',
  }

  switch (state) {
    case 'sleep':
      return (
        <motion.div
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            ...baseStyle,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {/* Closed eyes — peaceful */}
            <path d="M5 10 Q7.5 11 10 10" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M10 10 Q12.5 11 15 10" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            {/* Soft breathing indicator */}
            <circle cx="10" cy="14" r="0.8" fill="rgba(255,255,255,0.15)" />
          </svg>
        </motion.div>
      )

    case 'noticing':
      return (
        <motion.div
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            ...baseStyle,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #1e2a4a 100%)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {/* One eye open, one squinting */}
            <circle cx="7" cy="9" r="1.5" fill="rgba(245, 158, 11, 0.5)" />
            <circle cx="7" cy="9" r="0.6" fill="rgba(245, 158, 11, 0.9)" />
            <path d="M11 9 Q13 10 15 9" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </motion.div>
      )

    case 'awake':
      return (
        <motion.div
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            ...baseStyle,
            background: 'linear-gradient(135deg, #1a2332 0%, #1e3a5f 100%)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {/* Both eyes open, warm amber */}
            <circle cx="7" cy="9" r="1.8" fill="rgba(245, 158, 11, 0.4)" />
            <circle cx="7" cy="9" r="0.8" fill="rgba(245, 158, 11, 1)" />
            <circle cx="13" cy="9" r="1.8" fill="rgba(245, 158, 11, 0.4)" />
            <circle cx="13" cy="9" r="0.8" fill="rgba(245, 158, 11, 1)" />
            {/* Subtle smile */}
            <path d="M7.5 13 Q10 14.5 12.5 13" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeLinecap="round" fill="none" />
          </svg>
        </motion.div>
      )

    case 'sparkle':
      return (
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 3, -3, 0],
          }}
          transition={{ duration: 0.8, repeat: 2, ease: 'easeInOut' }}
          style={{
            ...baseStyle,
            background: 'linear-gradient(135deg, #2a1f0a 0%, #3d2e0a 100%)',
            boxShadow: '0 0 16px rgba(245, 158, 11, 0.3)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {/* Wide happy eyes */}
            <circle cx="7" cy="9" r="2" fill="rgba(245, 158, 11, 0.6)" />
            <circle cx="7" cy="8.5" r="1" fill="#F59E0B" />
            <circle cx="13" cy="9" r="2" fill="rgba(245, 158, 11, 0.6)" />
            <circle cx="13" cy="8.5" r="1" fill="#F59E0B" />
            {/* Sparkle particles */}
            <circle cx="3" cy="5" r="0.5" fill="rgba(245, 158, 11, 0.7)" />
            <circle cx="17" cy="4" r="0.4" fill="rgba(245, 158, 11, 0.5)" />
            <circle cx="16" cy="14" r="0.3" fill="rgba(245, 158, 11, 0.6)" />
            <circle cx="4" cy="15" r="0.4" fill="rgba(245, 158, 11, 0.4)" />
          </svg>
        </motion.div>
      )

    case 'fatigue':
      return (
        <motion.div
          animate={{ y: [0, 1, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            ...baseStyle,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #1a1a2e 100%)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {/* Droopy eyes */}
            <path d="M4.5 9 Q7 10.5 9.5 9" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M10.5 9 Q13 10.5 15.5 9" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            {/* Yawn mouth */}
            <ellipse cx="10" cy="14" rx="2" ry="1.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          </svg>
        </motion.div>
      )

    default: // frustrated
      return (
        <motion.div
          style={{
            ...baseStyle,
            background: 'linear-gradient(135deg, #2a1a1a 0%, #1a1a2e 100%)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {/* Concerned eyes */}
            <circle cx="7" cy="9" r="1.5" fill="rgba(255,255,255,0.2)" />
            <circle cx="7" cy="9" r="0.7" fill="rgba(255,255,255,0.5)" />
            <circle cx="13" cy="9" r="1.5" fill="rgba(255,255,255,0.2)" />
            <circle cx="13" cy="9" r="0.7" fill="rgba(255,255,255,0.5)" />
            {/* Flat mouth */}
            <line x1="8" y1="13.5" x2="12" y2="13.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </motion.div>
      )
  }
}
