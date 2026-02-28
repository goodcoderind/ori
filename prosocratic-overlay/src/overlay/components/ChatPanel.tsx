/**
 * ChatPanel — Main overlay panel
 *
 * Translucent glassmorphism like Cluely. backdrop-blur + semi-transparent bg.
 * Scrollable content area so technique cards never get cut off.
 * 320px wide. Confetti layer fires on correct quiz answers.
 * ContentBar at top lets user specify what they're studying.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'
import { useBehavioralSensors } from '../hooks/useBehavioralSensors'
import NudgeCard from './NudgeCard'
import TransparencyCard from './TransparencyCard'
import InputBar from './InputBar'
import MessageList from './MessageList'
import TechniqueRenderer from './techniques/TechniqueRenderer'
import ConfettiBurst from './ConfettiBurst'

const BLUE = '#60a5fa'

// ─── Content topic bar ───────────────────────────────────────
function ContentBar() {
  const { studyTopic, setStudyTopic, currentTopic } = useOverlayStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayTopic = studyTopic || currentTopic

  const commit = () => {
    if (draft.trim()) setStudyTopic(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid rgba(96,165,250,0.3)`,
          borderRadius: '10px', padding: '7px 10px',
        }}>
          <span style={{ fontSize: '11px' }}>📚</span>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            onKeyUp={e => e.stopPropagation()}
            placeholder="e.g. IB Biology HL — DNA Replication"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'rgba(255,255,255,0.85)', fontSize: '11.5px', fontFamily: 'inherit',
              caretColor: BLUE,
            }}
          />
          <motion.button
            whileHover={{ color: 'rgba(255,255,255,0.7)' }}
            onClick={commit}
            style={{
              background: 'transparent', border: 'none', color: BLUE,
              fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: '0 2px',
            }}
          >Set</motion.button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <motion.button
        whileHover={{ borderColor: 'rgba(96,165,250,0.25)', color: 'rgba(255,255,255,0.55)' }}
        onClick={() => { setDraft(studyTopic || ''); setEditing(true) }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px', padding: '6px 10px',
          color: displayTopic ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)',
          fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
          width: '100%', textAlign: 'left',
          transition: 'border-color 0.2s, color 0.2s',
        }}
      >
        <span style={{ fontSize: '11px' }}>📚</span>
        <span style={{
          flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: displayTopic ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)',
        }}>
          {displayTopic || 'What are you studying?'}
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>tap to set</span>
      </motion.button>
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────
export default function ChatPanel() {
  const { activeNudge, transparencyData, messages, activeTechnique, showConfetti } = useOverlayStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Start behavioral sensors (keystrokes, idle, page detection)
  useBehavioralSensors()

  const hasContent = messages.length > 0 || activeNudge || activeTechnique

  // Auto-scroll to bottom whenever technique changes or messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeTechnique?.phase, activeTechnique?.type, messages.length])

  return (
    <div
      style={{
        width: '320px',
        maxHeight: hasContent ? '580px' : '300px',
        background: 'rgba(10, 10, 10, 0.75)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 0 0 0.5px rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
        transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',   // for confetti absolute positioning
      }}
    >
      {/* Confetti layer — fires on correct quiz answers */}
      <ConfettiBurst active={showConfetti} />

      {/* Study topic picker */}
      <ContentBar />

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '8px 12px 0' }} />

      {/* Scrollable content area — minHeight:0 is CRITICAL for flex+overflow:auto to work */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,            // ← fixes flexbox overflow scroll bug
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          scrollbarWidth: 'none',  // hide scrollbar on Firefox
        }}
      >
        {/* Nudge Card */}
        {activeNudge && !activeTechnique && <NudgeCard nudge={activeNudge} />}

        {/* Messages */}
        <MessageList />

        {/* Active Technique — renders inline, expanding smoothly */}
        <TechniqueRenderer />

        {/* Transparency */}
        {transparencyData && !activeTechnique && <TransparencyCard data={transparencyData} />}

        {/* Bottom padding so last element isn't flush against InputBar */}
        <div style={{ height: '8px', flexShrink: 0 }} />
      </div>

      {/* Input — always at bottom */}
      <InputBar />
    </div>
  )
}
