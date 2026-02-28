/**
 * OriMascot — Reactive panda mascot, flush bottom-right corner.
 *
 * Expression transitions: instant opacity crossfade (no bounce/scale).
 * Bounce: ONLY when clicking to wake from sleep.
 * Images: 600×600 Lanczos PNG, displayed at 200px (sharp on 3x retina).
 */

import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { useOverlayStore } from '../store/overlayStore'
import { MASCOT_IMAGES } from './mascotImages'

const MASCOT_SIZE = 200

export default function OriMascot() {
  const mascotExpression = useOverlayStore(s => s.mascotExpression)
  const wakeMascot = useOverlayStore(s => s.wakeMascot)
  const bounceControls = useAnimation()

  const isSleeping = mascotExpression === 'sleep'

  const handleClick = async () => {
    if (isSleeping) {
      // Bounce animation only on wake-from-sleep
      await bounceControls.start({
        scale: [1, 1.18, 0.92, 1.08, 0.97, 1],
        transition: { duration: 0.55, ease: 'easeInOut' },
      })
      wakeMascot()
    }
  }

  return (
    <motion.div
      animate={bounceControls}
      onClick={handleClick}
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        zIndex: 2147483646,
        width: MASCOT_SIZE,
        height: MASCOT_SIZE,
        cursor: isSleeping ? 'pointer' : 'default',
        pointerEvents: 'all',
        userSelect: 'none',
        // Initial entrance only
      }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      // @ts-ignore — framer-motion transition on initial entrance
      transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.4 }}
    >
      {/* Expression images — instant opacity swap, no scale/bounce */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={mascotExpression}
          src={MASCOT_IMAGES[mascotExpression]}
          alt=""
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: 'linear' }}
          style={{
            width: MASCOT_SIZE,
            height: MASCOT_SIZE,
            objectFit: 'contain',
            display: 'block',
            pointerEvents: 'none',
            imageRendering: 'auto',
          }}
        />
      </AnimatePresence>
    </motion.div>
  )
}
