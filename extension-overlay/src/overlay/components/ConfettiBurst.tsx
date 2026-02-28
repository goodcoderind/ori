/**
 * ConfettiBurst — Mini confetti celebration for correct quiz answers.
 * Renders absolutely over the chat content area.
 * Uses framer-motion particle animation, no external lib needed.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#4ade80']
const PARTICLE_COUNT = 32

interface Particle {
  id: number
  color: string
  size: number
  startX: number    // % from left
  startY: number    // % from top
  dx: number        // % offset to travel
  dy: number        // % offset to travel (negative = upward)
  rotate: number
  duration: number
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * 360
    const rad = (angle * Math.PI) / 180
    const speed = 18 + Math.random() * 22
    return {
      id: i,
      color: COLORS[i % COLORS.length],
      size: 5 + Math.random() * 5,
      startX: 48 + (Math.random() - 0.5) * 8,
      startY: 50,
      dx: Math.cos(rad) * speed,
      dy: Math.sin(rad) * speed - 15,   // bias upward
      rotate: angle * 4,
      duration: 0.7 + Math.random() * 0.5,
    }
  })
}

export default function ConfettiBurst({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([])
  const [visible, setVisible] = useState(false)
  const prevActive = useRef(false)

  useEffect(() => {
    // Only fire on rising edge (false → true)
    if (active && !prevActive.current) {
      setParticles(makeParticles())
      setVisible(true)
      const t = setTimeout(() => {
        setVisible(false)
        setTimeout(() => setParticles([]), 600)
      }, 1200)
      prevActive.current = true
      return () => clearTimeout(t)
    }
    if (!active) {
      prevActive.current = false
    }
  }, [active])

  if (!particles.length) return null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        borderRadius: '16px',
        zIndex: 50,
      }}
    >
      <AnimatePresence>
        {visible && particles.map(p => (
          <motion.div
            key={p.id}
            initial={{
              left: `${p.startX}%`,
              top: `${p.startY}%`,
              opacity: 1,
              scale: 1,
              rotate: 0,
            }}
            animate={{
              left: `${p.startX + p.dx}%`,
              top: `${p.startY + p.dy}%`,
              opacity: 0,
              scale: 0.2,
              rotate: p.rotate,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: p.duration, ease: [0.2, 0, 0.8, 1] }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.size > 8 ? '50%' : '2px',
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
