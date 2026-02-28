/**
 * ActiveRecallCard — Cover notes / quiz prompt
 * Blue accents. "Try it" / "No thanks" on every prompt.
 */

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

export default function ActiveRecallCard() {
  const { activeTechnique, setTechniquePhase, endTechnique, addOriMessage } = useOverlayStore()

  if (!activeTechnique || activeTechnique.type !== 'active_recall') return null
  const phase = activeTechnique.phase
  const topic = activeTechnique.recallTopic || 'what you just studied'

  if (phase === 'recall_prompt') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px' }}>🎯</span>
          <span style={{ fontSize: '12px', color: BLUE, fontWeight: 600, letterSpacing: '0.02em' }}>
            Active Recall
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: '0 0 4px' }}>
          Try without looking! Test yourself on <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{topic}</span>.
        </p>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', margin: '0 0 12px' }}>
          Active retrieval is 3x more effective than re-reading.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <TryIt label="Cover notes" onClick={() => {
            setTechniquePhase('recall_cover')
            addOriMessage("Notes covered. Now recall the key concepts from memory.")
          }} />
          <TryIt label="Quiz me" onClick={() => {
            useOverlayStore.getState().endTechnique()
            setTimeout(() => {
              useOverlayStore.getState().startTechnique('quiz', "Let's test what you remember with a quick quiz.")
            }, 500)
          }} />
        </div>
        <Dismiss onClick={() => endTechnique()} />
      </motion.div>
    )
  }

  if (phase === 'recall_cover') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px' }}>🎯</span>
          <span style={{ fontSize: '10px', color: BLUE, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Recall mode active
          </span>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '12px', marginBottom: '10px',
        }}>
          <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>
            What are the key concepts you just studied? Try to recall them from memory.
          </p>
        </div>
        <p style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.2)', margin: '0 0 10px' }}>
          Say it out loud or write it down before uncovering.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <TryIt label="I recalled it" onClick={() => {
            addOriMessage("Great job! Recalling from memory strengthens the neural pathways.")
            endTechnique()
          }} />
          <Pill label="Uncover" onClick={() => {
            addOriMessage("No worries — review the material and we'll try again later.")
            endTechnique()
          }} />
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
        background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
        borderRadius: '10px', padding: '7px 14px', color: BLUE,
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
      }}>{label}</motion.button>
  )
}

function Pill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }} whileTap={{ scale: 0.96 }} onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', padding: '7px 14px', color: 'rgba(255,255,255,0.5)',
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
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
