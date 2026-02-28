/**
 * Demo Preset Sequence — IB Biology HL
 *
 * Strict linear sequence: Pomodoro → Feynman → Active Recall → Quiz → Rest
 * Each step fires after the previous one completes (Try it or No thanks).
 * Delays are between steps, not from panel open.
 */

import type { QuizCard, DemoSequenceStep } from '../../shared/types'

export const IB_BIO_QUIZ_CARDS: QuizCard[] = [
  {
    id: 'q1',
    question: 'What enzyme unwinds the DNA double helix during replication?',
    options: ['DNA Polymerase III', 'Helicase', 'RNA Primase', 'DNA Ligase'],
    correctIndex: 1,
    answer: 'Helicase breaks hydrogen bonds between base pairs, unwinding the two strands and creating the replication fork.',
    userAnswer: null,
  },
  {
    id: 'q2',
    question: 'Why is DNA replication called "semi-conservative"?',
    options: [
      'Half the DNA is destroyed during replication',
      'Only half the genome is copied each cycle',
      'Each new molecule keeps one original strand and one new strand',
      'Two identical copies are made, then one is discarded',
    ],
    correctIndex: 2,
    answer: 'Each daughter molecule retains one original (template) strand — so the "old" information is conserved in both copies.',
    userAnswer: null,
  },
  {
    id: 'q3',
    question: 'What does RNA primase do in DNA replication?',
    options: [
      'It seals Okazaki fragments together',
      'It proofreads newly added nucleotides',
      'It synthesizes an RNA primer to start replication',
      'It removes the original template strand',
    ],
    correctIndex: 2,
    answer: 'Primase lays down a short RNA primer providing the free 3\' –OH that DNA Polymerase III needs to begin adding nucleotides.',
    userAnswer: null,
  },
  {
    id: 'q4',
    question: 'Which strand is synthesized in Okazaki fragments?',
    options: ['The leading strand', 'Both strands equally', 'The lagging strand', 'The template strand'],
    correctIndex: 2,
    answer: 'The lagging strand runs antiparallel to the fork direction, so it\'s built in short 5\'→3\' bursts called Okazaki fragments, later joined by DNA Ligase.',
    userAnswer: null,
  },
]

// Strict linear order. advanceDemo() is called after each technique ends or is dismissed.
// The delay here is how long to wait BETWEEN steps (after the previous one completes).
export const DEMO_SEQUENCE: DemoSequenceStep[] = [
  {
    delay: 3000,
    technique: 'pomodoro',
    message: "I noticed your keystroke rhythm slowing — you've been reading about DNA replication for 20+ minutes without a break. A focused Pomodoro can reset your attention.",
  },
  {
    delay: 3000,
    technique: 'feynman',
    message: "You scrolled back to semi-conservative replication twice (section revisit detected). That usually means something isn't clicking yet. Try explaining it simply — the Feynman technique finds the gap.",
  },
  {
    delay: 3000,
    technique: 'active_recall',
    message: "Your reading speed picked up but your pause patterns suggest surface-level processing. Active retrieval is 3× more effective — want to test what's actually sticking?",
  },
  {
    delay: 3000,
    technique: 'quiz',
    message: "Based on your session: you've spent time on enzymes, strand direction, and replication mechanics. Here's a 4-question MCQ to check your retention.",
  },
  {
    delay: 3000,
    technique: 'strategic_rest',
    message: "Your idle gaps are increasing and focus windows are declining — classic fatigue signal after a dense session. A proper timed break now helps memory consolidation.",
  },
]

export const FEYNMAN_PRESET_TOPIC = 'Semi-conservative DNA Replication'
export const RECALL_PRESET_TOPIC = 'DNA Replication — Enzymes & Steps'
