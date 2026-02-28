/**
 * PomodoroCard — Timer with break selection
 * Glassmorphism card. Blue accents on progress bar and active elements.
 * Every prompt has "Try it" / "No thanks".
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

export default function PomodoroCard() {
  const { activeTechnique, startPomodoro, tickPomodoro, endTechnique } = useOverlayStore()
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeTechnique?.phase === 'pomodoro_running') {
      intervalRef.current = window.setInterval(tickPomodoro, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [activeTechnique?.phase, tickPomodoro])

  if (!activeTechnique || activeTechnique.type !== 'pomodoro') return null
  const phase = activeTechnique.phase

  if (phase === 'pomodoro_prompt') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px' }}>⏱</span>
          <span style={{ fontSize: '12px', color: BLUE, fontWeight: 600, letterSpacing: '0.02em' }}>
            Pomodoro Timer
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: '0 0 12px' }}>
          Take a focused break. How long?
        </p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[5, 10, 15, 25].map(min => (
            <Pill key={min} label={`${min} min`} onClick={() => startPomodoro(min)} />
          ))}
        </div>
        <Dismiss onClick={() => endTechnique()} />
      </motion.div>
    )
  }

  if (phase === 'pomodoro_running') {
    const remaining = activeTechnique.timeRemaining || 0
    const total = activeTechnique.breakDuration || 1
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    const progress = 1 - (remaining / total)

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px' }}>⏱</span>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Break in progress
          </span>
        </div>
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <motion.span key={remaining} initial={{ opacity: 0.5, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            style={{ fontSize: '34px', fontWeight: 300, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </motion.span>
        </div>
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginBottom: '10px' }}>
          <motion.div animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.3 }}
            style={{ height: '100%', background: BLUE, borderRadius: '2px' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <motion.button whileHover={{ color: 'rgba(255,255,255,0.5)' }} onClick={endTechnique}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px' }}>
            End early
          </motion.button>
        </div>
      </motion.div>
    )
  }

  if (phase === 'pomodoro_break_done') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: '0 0 12px' }}>
          Break's over! Ready to continue?
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <TryIt label="Yes" onClick={endTechnique} />
          <Pill label="Snooze 5 min" onClick={() => startPomodoro(5)} />
        </div>
      </motion.div>
    )
  }

  return null
}

function TryIt({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button whileHover={{ backgroundColor: 'rgba(96,165,250,0.2)' }} whileTap={{ scale: 0.96 }} onClick={onClick}
      style={{
        background: 'rgba(96,165,250,0.1)', border: `1px solid rgba(96,165,250,0.25)`,
        borderRadius: '10px', padding: '7px 16px', color: BLUE,
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
      }}>{label}</motion.button>
  )
}

function Pill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }} whileTap={{ scale: 0.96 }} onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', padding: '7px 14px', color: 'rgba(255,255,255,0.7)',
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
      }}>{label}</motion.button>
  )
}

function Dismiss({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
      <motion.button whileHover={{ color: 'rgba(255,255,255,0.4)' }} onClick={onClick}
        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.18)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}>
        No thanks
      </motion.button>
    </div>
  )
}
