/**
 * StrategicRestCard — Break enforcer
 * Blue progress bar. "Try it" / "I'm fine" on prompt.
 */

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useOverlayStore } from '../../store/overlayStore'

const GLASS = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '14px',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
} as const

const BLUE = '#60a5fa'

export default function StrategicRestCard() {
  const { activeTechnique, setTechniquePhase, updateTechnique, endTechnique, addOriMessage } = useOverlayStore()
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeTechnique?.phase === 'rest_running') {
      intervalRef.current = window.setInterval(() => {
        const s = useOverlayStore.getState()
        const t = s.activeTechnique
        if (!t || t.phase !== 'rest_running') return
        const remaining = (t.timeRemaining || 0) - 1
        if (remaining <= 0) {
          s.updateTechnique({ timeRemaining: 0 })
          s.setTechniquePhase('rest_done')
          s.addOriMessage("Welcome back! Your brain just consolidated what you learned.")
          if (intervalRef.current) clearInterval(intervalRef.current)
        } else {
          s.updateTechnique({ timeRemaining: remaining })
        }
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [activeTechnique?.phase])

  if (!activeTechnique || activeTechnique.type !== 'strategic_rest') return null
  const phase = activeTechnique.phase

  if (phase === 'rest_prompt') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px' }}>😌</span>
          <span style={{ fontSize: '12px', color: BLUE, fontWeight: 600, letterSpacing: '0.02em' }}>
            Strategic Rest
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: '0 0 12px' }}>
          You've been at this for a while. A short break helps consolidation.
        </p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[5, 10].map(min => (
            <TryIt key={min} label={`${min} min break`} onClick={() => {
              updateTechnique({ breakDuration: min * 60, timeRemaining: min * 60 })
              setTechniquePhase('rest_running')
            }} />
          ))}
        </div>
        <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
          <motion.button whileHover={{ color: 'rgba(255,255,255,0.4)' }} onClick={() => {
            addOriMessage("Okay, I'll check back later. Your brain does its best work with breaks though!")
            endTechnique()
          }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.18)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}>
            I'm fine
          </motion.button>
        </div>
      </motion.div>
    )
  }

  if (phase === 'rest_running') {
    const remaining = activeTechnique.timeRemaining || 0
    const total = activeTechnique.breakDuration || 1
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    const progress = 1 - (remaining / total)

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '16px', textAlign: 'center' }}>
        <span style={{ fontSize: '10px', color: BLUE, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Resting
        </span>
        <div style={{ margin: '12px 0' }}>
          <motion.span key={remaining} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }}
            style={{ fontSize: '32px', fontWeight: 300, color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums' }}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </motion.span>
        </div>
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
          <motion.div animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.3 }}
            style={{ height: '100%', background: BLUE, borderRadius: '2px' }} />
        </div>
      </motion.div>
    )
  }

  if (phase === 'rest_done') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: '0 0 12px' }}>
          Ready to continue?
        </p>
        <TryIt label="Yes" onClick={endTechnique} />
      </motion.div>
    )
  }

  return null
}

function TryIt({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button whileHover={{ backgroundColor: 'rgba(96,165,250,0.2)' }} whileTap={{ scale: 0.96 }} onClick={onClick}
      style={{
        background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
        borderRadius: '10px', padding: '7px 16px', color: '#60a5fa',
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
      }}>{label}</motion.button>
  )
}
