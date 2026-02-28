/**
 * TechniqueRenderer — Routes active technique to correct component
 *
 * Wraps each technique in AnimatePresence for smooth transitions
 * between different technique types.
 */

import { AnimatePresence } from 'framer-motion'
import { useOverlayStore } from '../../store/overlayStore'
import PomodoroCard from './PomodoroCard'
import FeynmanPanel from './FeynmanPanel'
import ActiveRecallCard from './ActiveRecallCard'
import StrategicRestCard from './StrategicRestCard'
import QuizPanel from './QuizPanel'

export default function TechniqueRenderer() {
  const activeTechnique = useOverlayStore(s => s.activeTechnique)

  if (!activeTechnique) return null

  return (
    <AnimatePresence mode="wait">
      {activeTechnique.type === 'pomodoro' && <PomodoroCard key="pomodoro" />}
      {activeTechnique.type === 'feynman' && <FeynmanPanel key="feynman" />}
      {activeTechnique.type === 'active_recall' && <ActiveRecallCard key="active_recall" />}
      {activeTechnique.type === 'strategic_rest' && <StrategicRestCard key="strategic_rest" />}
      {activeTechnique.type === 'quiz' && <QuizPanel key="quiz" />}
    </AnimatePresence>
  )
}
