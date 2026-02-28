/**
 * TransparencyCard — "Why this suggestion?"
 *
 * Minimal expandable section. Black/white only.
 * Shows what Ori detected and why it chose this technique.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TransparencyData } from '../../shared/types'

interface TransparencyCardProps {
  data: TransparencyData
}

export default function TransparencyCard({ data }: TransparencyCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      margin: '0 12px 6px',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '7px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.25)',
          fontWeight: 400,
        }}>
          Why this suggestion?
        </span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 4L5 6.5L7.5 4" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '6px 8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
              <TransparencyRow label="Signal" value={data.signal} />
              <TransparencyRow label="State" value={data.state} />
              <TransparencyRow label="Gap" value={data.gap} />
              <TransparencyRow label="Technique" value={data.technique} />
              {data.successRate && (
                <TransparencyRow label="Success rate" value={data.successRate} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TransparencyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      <span style={{
        fontSize: '11px',
        color: 'rgba(255,255,255,0.2)',
        fontWeight: 400,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '11px',
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'right',
        lineHeight: 1.4,
      }}>
        {value}
      </span>
    </div>
  )
}
