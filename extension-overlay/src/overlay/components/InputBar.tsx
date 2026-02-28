/**
 * InputBar — Cluely-style input with light blue send button
 *
 * Rounded pill input. Placeholder: "Ask about learning faster"
 * Light blue (#60a5fa) circular send button — the only color accent.
 * Faint circle placeholder when no text.
 */

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'

export default function InputBar() {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const { sendMessage, isTyping } = useOverlayStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isTyping) return
    sendMessage(trimmed)
    setValue('')
    inputRef.current?.focus()
  }, [value, isTyping, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    e.stopPropagation()
  }, [handleSubmit])

  const hasText = value.trim().length > 0

  return (
    <div style={{
      padding: '8px 12px 12px',
    }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255,255,255,0.04)',
          border: focused
            ? '1px solid rgba(255,255,255,0.12)'
            : '1px solid rgba(255,255,255,0.06)',
          borderRadius: '24px',
          padding: '6px 6px 6px 14px',
          transition: 'border-color 0.2s',
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          onKeyUp={e => e.stopPropagation()}
          placeholder={isTyping ? 'Thinking...' : 'Ask about learning faster'}
          disabled={isTyping}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'rgba(255,255,255,0.85)',
            fontSize: '13px',
            fontFamily: 'inherit',
            caretColor: '#60a5fa',
            letterSpacing: '-0.005em',
          }}
        />

        {/* Send button — always visible, changes opacity based on text */}
        <motion.button
          onClick={handleSubmit}
          whileHover={hasText ? { scale: 1.05 } : {}}
          whileTap={hasText ? { scale: 0.92 } : {}}
          animate={{
            backgroundColor: hasText ? '#60a5fa' : 'rgba(255,255,255,0.06)',
          }}
          transition={{ duration: 0.15 }}
          style={{
            border: 'none',
            borderRadius: '50%',
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: hasText ? 'pointer' : 'default',
            flexShrink: 0,
            padding: 0,
          }}
          aria-label="Send message"
          disabled={!hasText || isTyping}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 11V3M7 3L3.5 6.5M7 3L10.5 6.5"
              stroke={hasText ? '#fff' : 'rgba(255,255,255,0.2)'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.button>
      </div>
    </div>
  )
}
