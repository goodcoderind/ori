/**
 * QuizPanel — MCQ flashcard quiz (NotebookLM-style)
 *
 * Flow per card:
 *   • Show question + 4 options
 *   • Correct → green flash + confetti + encouraging line + auto-advance 1.5s
 *   • Wrong   → red shake on chosen + green highlight on correct + explanation + "Try again"
 *               Try again resets options (can re-attempt, recorded as 'incorrect')
 *
 * Results screen: score + emoji + personalized next-technique suggestion.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../../store/overlayStore'

const GLASS = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '14px',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
} as const

const BLUE = '#60a5fa'

const CORRECT_PHRASES = [
  '✓ Exactly right!', '✓ Nailed it!', '✓ Correct!',
  '✓ That\'s the one!', '✓ Spot on!',
]

const OPTION_LABELS = ['A', 'B', 'C', 'D']

// ─── Sub-components ──────────────────────────────────────────

function TryIt({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ backgroundColor: 'rgba(96,165,250,0.2)' }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        background: 'rgba(96,165,250,0.1)',
        border: '1px solid rgba(96,165,250,0.25)',
        borderRadius: '10px', padding: '7px 16px', color: BLUE,
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
      }}
    >{label}</motion.button>
  )
}

function NoThanks({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ color: 'rgba(255,255,255,0.4)' }}
      onClick={onClick}
      style={{
        background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px', padding: '7px 14px', color: 'rgba(255,255,255,0.25)',
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >No thanks</motion.button>
  )
}

// ─── MCQ Card View ───────────────────────────────────────────

interface QuizCardViewProps {
  card: {
    id: string
    question: string
    answer: string
    options: string[]
    correctIndex: number
    userAnswer?: 'correct' | 'incorrect' | null
  }
  cardNumber: number
  total: number
  dots: { id: string; userAnswer?: 'correct' | 'incorrect' | null }[]
  onCorrect: () => void
  onWrong: () => void
  onNext: () => void
}

function QuizCardView({ card, cardNumber, total, dots, onCorrect, onWrong, onNext }: QuizCardViewProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [phase, setPhase] = useState<'choosing' | 'correct' | 'wrong'>('choosing')
  const [shakeIdx, setShakeIdx] = useState<number | null>(null)

  // Reset state when card changes
  useEffect(() => {
    setSelectedIdx(null)
    setPhase('choosing')
    setShakeIdx(null)
  }, [card.id])

  const handleOption = (idx: number) => {
    if (phase !== 'choosing') return
    setSelectedIdx(idx)

    if (idx === card.correctIndex) {
      setPhase('correct')
      onCorrect()
      // Auto-advance after 1.8s
      setTimeout(onNext, 1800)
    } else {
      setPhase('wrong')
      setShakeIdx(idx)
      setTimeout(() => setShakeIdx(null), 500)
      onWrong()
    }
  }

  const handleTryAgain = () => {
    setSelectedIdx(null)
    setPhase('choosing')
    setShakeIdx(null)
  }

  const phraseIdx = (card.id.charCodeAt(1) || 0) % CORRECT_PHRASES.length

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {/* Header: card count + progress dots */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0' }}>
        <span style={{ fontSize: '10px', color: BLUE, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Card {cardNumber} of {total}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {dots.map((d, i) => (
            <div key={d.id} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: d.userAnswer === 'correct'
                ? 'rgba(134,239,172,0.8)'
                : d.userAnswer === 'incorrect'
                  ? 'rgba(252,165,165,0.7)'
                  : i === cardNumber - 1 ? BLUE : 'rgba(255,255,255,0.1)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* Question */}
      <div style={{ padding: '10px 14px 8px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px', padding: '12px',
        }}>
          <p style={{ fontSize: '10px', color: BLUE, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Question</p>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, margin: 0 }}>{card.question}</p>
        </div>
      </div>

      {/* Options */}
      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {card.options.map((option, idx) => {
          const isSelected = selectedIdx === idx
          const isCorrect = idx === card.correctIndex

          let bg = 'rgba(255,255,255,0.04)'
          let border = '1px solid rgba(255,255,255,0.08)'
          let color = 'rgba(255,255,255,0.7)'
          let labelBg = 'rgba(255,255,255,0.06)'
          let labelColor = 'rgba(255,255,255,0.3)'

          if (phase === 'correct' && isCorrect) {
            bg = 'rgba(134,239,172,0.12)'
            border = '1px solid rgba(134,239,172,0.4)'
            color = 'rgba(134,239,172,0.95)'
            labelBg = 'rgba(134,239,172,0.2)'
            labelColor = 'rgba(134,239,172,0.9)'
          } else if (phase === 'wrong') {
            if (isSelected) {
              bg = 'rgba(252,165,165,0.1)'
              border = '1px solid rgba(252,165,165,0.35)'
              color = 'rgba(252,165,165,0.8)'
              labelBg = 'rgba(252,165,165,0.15)'
              labelColor = 'rgba(252,165,165,0.8)'
            } else if (isCorrect) {
              bg = 'rgba(134,239,172,0.08)'
              border = '1px solid rgba(134,239,172,0.3)'
              color = 'rgba(134,239,172,0.85)'
              labelBg = 'rgba(134,239,172,0.15)'
              labelColor = 'rgba(134,239,172,0.8)'
            }
          }

          return (
            <motion.button
              key={idx}
              animate={shakeIdx === idx ? { x: [-4, 4, -3, 3, -2, 2, 0] } : { x: 0 }}
              transition={{ duration: 0.45 }}
              whileHover={phase === 'choosing' ? { backgroundColor: 'rgba(96,165,250,0.06)', borderColor: 'rgba(96,165,250,0.2)' } : {}}
              whileTap={phase === 'choosing' ? { scale: 0.98 } : {}}
              onClick={() => handleOption(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: bg, border, borderRadius: '10px', padding: '9px 12px',
                cursor: phase === 'choosing' ? 'pointer' : 'default',
                fontFamily: 'inherit', textAlign: 'left', width: '100%',
                transition: 'background 0.25s, border 0.25s',
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: '6px',
                background: labelBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700, color: labelColor,
                flexShrink: 0, transition: 'background 0.25s',
              }}>{OPTION_LABELS[idx]}</span>
              <span style={{ fontSize: '12.5px', color, lineHeight: 1.4, transition: 'color 0.25s' }}>{option}</span>
            </motion.button>
          )
        })}
      </div>

      {/* Feedback area */}
      <AnimatePresence>
        {phase === 'correct' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ padding: '10px 14px 14px' }}
          >
            <p style={{ fontSize: '12px', color: 'rgba(134,239,172,0.9)', margin: '0 0 4px', fontWeight: 600 }}>
              {CORRECT_PHRASES[phraseIdx]}
            </p>
            <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.5 }}>{card.answer}</p>
          </motion.div>
        )}

        {phase === 'wrong' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ padding: '10px 14px 14px' }}
          >
            <p style={{ fontSize: '11.5px', color: 'rgba(252,165,165,0.7)', margin: '0 0 6px' }}>
              Not quite — the correct answer is highlighted above.
            </p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '0 0 10px', lineHeight: 1.5 }}>{card.answer}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <motion.button
                whileHover={{ backgroundColor: 'rgba(96,165,250,0.15)' }}
                whileTap={{ scale: 0.96 }}
                onClick={handleTryAgain}
                style={{
                  background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)',
                  borderRadius: '10px', padding: '7px 14px', color: BLUE,
                  fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                }}
              >↩ Try again</motion.button>
              <motion.button
                whileHover={{ color: 'rgba(255,255,255,0.5)' }}
                onClick={onNext}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', padding: '7px 14px', color: 'rgba(255,255,255,0.28)',
                  fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Skip →</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main QuizPanel ───────────────────────────────────────────

export default function QuizPanel() {
  const {
    activeTechnique, setTechniquePhase, answerQuizCard,
    nextQuizCard, endTechnique, advanceDemo, addOriMessage,
    triggerConfetti,
  } = useOverlayStore()

  if (!activeTechnique || activeTechnique.type !== 'quiz') return null

  const phase = activeTechnique.phase
  const cards = activeTechnique.quizCards || []
  const currentIdx = activeTechnique.currentCardIndex || 0
  const correctCount = activeTechnique.correctCount || 0

  // ─── Prompt ────────────────────────────────────────────────
  if (phase === 'quiz_prompt') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px' }}>📝</span>
          <span style={{ fontSize: '12px', color: BLUE, fontWeight: 600, letterSpacing: '0.02em' }}>Quick Quiz</span>
          <span style={{
            fontSize: '10px', color: 'rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.06)', borderRadius: '6px',
            padding: '2px 6px', marginLeft: 'auto',
          }}>{cards.length} MCQ cards</span>
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: '0 0 12px' }}>
          Multiple choice — pick the right answer. Instant feedback on each one.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <TryIt label="Start quiz" onClick={() => setTechniquePhase('quiz_active')} />
          <NoThanks onClick={() => { endTechnique(); advanceDemo() }} />
        </div>
      </motion.div>
    )
  }

  // ─── Active ─────────────────────────────────────────────────
  if (phase === 'quiz_active' && cards.length > 0) {
    const card = cards[currentIdx]
    if (!card) return null

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        style={{ ...GLASS, margin: '8px 12px', paddingBottom: '4px' }}
      >
        <AnimatePresence mode="wait">
          <QuizCardView
            key={card.id}
            card={card}
            cardNumber={currentIdx + 1}
            total={cards.length}
            dots={cards}
            onCorrect={() => {
              answerQuizCard(card.id, 'correct')
              triggerConfetti()
            }}
            onWrong={() => answerQuizCard(card.id, 'incorrect')}
            onNext={nextQuizCard}
          />
        </AnimatePresence>
      </motion.div>
    )
  }

  // ─── Results ─────────────────────────────────────────────────
  if (phase === 'quiz_results') {
    const total = cards.length
    const score = Math.round((correctCount / total) * 100)
    const emoji = score === 100 ? '🎉' : score >= 75 ? '⭐' : score >= 50 ? '👍' : '💪'

    const suggestion = score >= 75
      ? 'Next session, try Spaced Repetition — revisit this in 24h for maximum retention.'
      : 'Active Recall worked for you here. Try Feynman next — explain the tricky ones simply.'

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ ...GLASS, margin: '8px 12px', padding: '18px', textAlign: 'center' }}
      >
        <span style={{ fontSize: '32px' }}>{emoji}</span>
        <p style={{ fontSize: '20px', color: 'rgba(255,255,255,0.9)', fontWeight: 300, margin: '8px 0 2px' }}>
          {correctCount}/{total} correct
        </p>
        <p style={{ fontSize: '11px', color: BLUE, margin: '0 0 12px', fontWeight: 600 }}>
          {score}% accuracy
        </p>

        {/* Dot result row */}
        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginBottom: '14px' }}>
          {cards.map(c => (
            <div key={c.id} style={{
              width: 9, height: 9, borderRadius: '50%',
              background: c.userAnswer === 'correct' ? 'rgba(134,239,172,0.8)' : 'rgba(252,165,165,0.7)',
            }} />
          ))}
        </div>

        {/* Personalized suggestion */}
        <p style={{
          fontSize: '11.5px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6,
          margin: '0 0 14px', textAlign: 'left',
          background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {suggestion}
        </p>

        <TryIt label="Done ✓" onClick={() => {
          addOriMessage(`Quiz complete — ${correctCount}/${total}. ${score >= 75 ? 'Excellent retention!' : 'Keep practicing — retrieval gets easier each time.'}`)
          endTechnique()
        }} />
      </motion.div>
    )
  }

  return null
}
