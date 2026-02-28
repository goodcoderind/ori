/**
 * MessageList — Clean Cluely-style chat bubbles
 *
 * User: right-aligned, subtle white bg
 * Ori: left-aligned, no bg, just text
 * Compact spacing. Auto-scroll.
 */

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'
import type { Message } from '../../shared/types'

export default function MessageList() {
  const { messages, isTyping } = useOverlayStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages, isTyping])

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '6px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minHeight: messages.length > 0 ? '80px' : '0px',
        maxHeight: '280px',
      }}
    >
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {isTyping && <TypingIndicator />}
      </AnimatePresence>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '88%',
          padding: isUser ? '8px 12px' : '6px 4px',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          background: isUser ? 'rgba(255,255,255,0.07)' : 'transparent',
        }}
      >
        <p style={{
          fontSize: '13px',
          lineHeight: 1.5,
          color: isUser ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)',
          margin: 0,
          fontWeight: 400,
          wordBreak: 'break-word',
        }}>
          {message.content}
        </p>
      </div>
    </motion.div>
  )
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        gap: '4px',
        padding: '6px 4px',
      }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            y: [0, -3, 0],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.3)',
          }}
        />
      ))}
    </motion.div>
  )
}
