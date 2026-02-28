/**
 * ChatPanel — Main overlay panel
 *
 * Translucent glassmorphism like Cluely. backdrop-blur + semi-transparent bg.
 * Scrollable content area so technique cards never get cut off.
 * 320px wide. Confetti layer fires on correct quiz answers.
 * ContentBar at top lets user specify what they're studying.
 *
 * Session-gated: Shows a "Start Studying" screen until the user
 * explicitly begins a session. No telemetry or nudges until then.
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
            placeholder="e.g. IB Biology HL, Calculus II"
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

// ─── Session Start Screen ───────────────────────────────────
function SessionStartScreen() {
  const { beginSession } = useOverlayStore()
  const [starting, setStarting] = useState(false)

  const handleStart = async () => {
    setStarting(true)
    await beginSession()
    // sessionActive will flip to true, causing re-render
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      gap: '16px',
      minHeight: '160px',
    }}>
      <p style={{
        fontSize: '13px',
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        lineHeight: 1.5,
        margin: 0,
      }}>
        Ori will observe your study patterns and suggest techniques when it detects a real signal.
      </p>
      <motion.button
        onClick={handleStart}
        disabled={starting}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        style={{
          background: BLUE,
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          padding: '10px 24px',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: starting ? 'wait' : 'pointer',
          opacity: starting ? 0.6 : 1,
          boxShadow: '0 2px 12px rgba(96,165,250,0.35)',
          transition: 'opacity 0.2s',
        }}
      >
        {starting ? 'Starting...' : 'Start Studying'}
      </motion.button>
      <p style={{
        fontSize: '10px',
        color: 'rgba(255,255,255,0.2)',
        textAlign: 'center',
        margin: 0,
      }}>
        No data is collected until you start.
      </p>
    </div>
  )
}

// ─── Active Session Controls ─────────────────────────────────
function SessionControls() {
  const { stopSession } = useOverlayStore()

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      padding: '4px 12px 0',
    }}>
      <motion.button
        onClick={stopSession}
        whileHover={{ color: 'rgba(255,255,255,0.5)' }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.18)',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: '2px 4px',
        }}
      >
        End session
      </motion.button>
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────
export default function ChatPanel() {
  const {
    sessionActive, activeNudge, transparencyData,
    messages, activeTechnique, showConfetti,
  } = useOverlayStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Wire up behavioral sensors — gated behind sessionActive internally
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
        maxHeight: sessionActive && hasContent ? '580px' : '300px',
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
        position: 'relative',
      }}
    >
      {/* Confetti layer — fires on correct quiz answers */}
      <ConfettiBurst active={showConfetti} />

      {!sessionActive ? (
        /* ── Pre-session: show start screen ── */
        <SessionStartScreen />
      ) : (
        /* ── Active session: full UI ── */
        <>
          {/* Study topic picker */}
          <ContentBar />

          {/* Session controls (end session) */}
          <SessionControls />

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 12px 0' }} />

          {/* Scrollable content area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              scrollbarWidth: 'none',
            }}
          >
            {/* Nudge Card — only from real backend responses */}
            {activeNudge && !activeTechnique && <NudgeCard nudge={activeNudge} />}

            {/* Messages */}
            <MessageList />

            {/* Active Technique — renders inline */}
            <TechniqueRenderer />

            {/* Transparency */}
            {transparencyData && !activeTechnique && <TransparencyCard data={transparencyData} />}

            {/* Bottom padding */}
            <div style={{ height: '8px', flexShrink: 0 }} />
          </div>

          {/* Input — always at bottom */}
          <InputBar />
        </>
      )}
    </div>
  )
}
