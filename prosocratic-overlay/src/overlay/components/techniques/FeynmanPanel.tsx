/**
 * FeynmanPanel — "Explain it simply" notepad
 * Compact layout so Done/Cancel buttons are ALWAYS visible.
 * Blue accents on "Try it" and "Done" buttons.
 */

import { useRef, useEffect } from 'react'
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

export default function FeynmanPanel() {
  const { activeTechnique, setTechniquePhase, updateFeynmanText, saveFeynman, endTechnique, advanceDemo } = useOverlayStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (activeTechnique?.phase === 'feynman_writing' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [activeTechnique?.phase])

  if (!activeTechnique || activeTechnique.type !== 'feynman') return null
  const phase = activeTechnique.phase
  const topic = activeTechnique.feynmanTopic || 'this concept'

  // ─── Prompt ────────────────────────────────────────────
  if (phase === 'feynman_prompt') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px' }}>🧠</span>
          <span style={{ fontSize: '12px', color: BLUE, fontWeight: 600, letterSpacing: '0.02em' }}>
            Feynman Technique
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: '0 0 12px' }}>
          Explain <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{topic}</span> like you're teaching a 10-year-old.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <TryIt label="Try it" onClick={() => setTechniquePhase('feynman_writing')} />
          <Dismiss onClick={() => { endTechnique(); advanceDemo() }} inline />
        </div>
      </motion.div>
    )
  }

  // ─── Writing ───────────────────────────────────────────
  if (phase === 'feynman_writing') {
    const text = activeTechnique.feynmanText || ''
    const canSave = text.trim().length >= 3

    const handleDone = () => {
      if (canSave) saveFeynman()
    }
    const handleCancel = () => {
      endTechnique()
      advanceDemo()
    }

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '12px', pointerEvents: 'all' as const }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '13px' }}>🧠</span>
          <span style={{ fontSize: '10px', color: BLUE, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Explain it simply
          </span>
        </div>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: '0 0 6px', lineHeight: 1.4 }}>
          Write as if explaining to a curious 10-year-old.
        </p>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => updateFeynmanText(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
          onKeyUp={e => e.stopPropagation()}
          onKeyPress={e => e.stopPropagation()}
          placeholder="Start typing your explanation..."
          style={{
            width: '100%', minHeight: '80px', maxHeight: '120px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '10px',
            color: 'rgba(255,255,255,0.85)', fontSize: '13px',
            fontFamily: 'inherit', lineHeight: 1.5,
            resize: 'none', outline: 'none', caretColor: BLUE,
            boxSizing: 'border-box',
            pointerEvents: 'all' as const,
          }}
        />
        {/* Always-visible action row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>
            {text.length > 0 ? `${text.split(/\s+/).filter(Boolean).length} words` : ''}
          </span>
          <div style={{ display: 'flex', gap: '6px', pointerEvents: 'all' as const }}>
            <button
              onClick={handleCancel}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', padding: '6px 12px', color: 'rgba(255,255,255,0.3)',
                fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                pointerEvents: 'all' as const,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              style={{
                background: canSave ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                border: canSave ? '1px solid rgba(96,165,250,0.35)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px', padding: '6px 14px',
                color: canSave ? BLUE : 'rgba(255,255,255,0.15)',
                fontSize: '11px', cursor: canSave ? 'pointer' : 'default',
                fontFamily: 'inherit', fontWeight: 600,
                pointerEvents: 'all' as const,
                transition: 'all 0.2s ease',
              }}
            >
              {canSave ? '✓ Done' : 'Done'}
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  if (phase === 'feynman_done') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '10px', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: BLUE, margin: 0, fontWeight: 500 }}>✓ Explanation saved</p>
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

function Dismiss({ onClick, inline = false }: { onClick: () => void; inline?: boolean }) {
  if (inline) {
    return (
      <motion.button whileHover={{ color: 'rgba(255,255,255,0.4)' }} onClick={onClick}
        style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '7px 14px', color: 'rgba(255,255,255,0.25)',
          fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
        }}>No thanks</motion.button>
    )
  }
  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
      <motion.button whileHover={{ color: 'rgba(255,255,255,0.4)' }} onClick={onClick}
        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.18)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}>
        No thanks
      </motion.button>
    </div>
  )
}
