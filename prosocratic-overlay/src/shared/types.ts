// ─── Ori States ───────────────────────────────────────────────
// Maps directly to the User Journey Doc Section 7: Ori Behavioural Spec
export type OriState = 'sleep' | 'noticing' | 'awake' | 'sparkle' | 'fatigue' | 'frustrated'

// ─── Messages ─────────────────────────────────────────────────
export interface Message {
  id: string
  role: 'user' | 'ori'
  content: string
  timestamp: number
  // If ori's message is a Socratic follow-up question
  isSocratic?: boolean
}

// ─── Nudge System ─────────────────────────────────────────────
// A nudge is what Ori surfaces when the ML pipeline selects a technique.
// The student always has the option to dismiss — consent is the architecture.
export interface NudgeOption {
  label: string
  action: () => void
}

export interface Nudge {
  id: string
  message: string                    // Ori's observation, e.g. "You've been on this section for 4 minutes..."
  options: NudgeOption[]             // e.g. "Try it", "Show me a diagram instead"
  onDismiss: () => void              // "Not right now" — always available
  technique: string                  // e.g. "Feynman Technique", "Active Recall"
  timestamp: number
}

// ─── Transparency Layer ───────────────────────────────────────
// Every nudge must show WHY Ori woke up — core product principle.
export interface TransparencyData {
  signal: string                     // e.g. "Scroll-back pattern detected (same section, twice)"
  state: string                      // e.g. "Confusion — 0.91 confidence"
  gap: string                        // e.g. "Understanding of Krebs cycle mechanism"
  technique: string                  // e.g. "Feynman Technique"
  successRate?: string               // e.g. "72% success with this technique previously"
}

// ─── Behavioral Signals ───────────────────────────────────────
// These are the raw signals from the content script sensor (Section 05 of Workflow doc)
// ONLY metadata — never content. Never what the student writes.
export interface BehavioralSignal {
  type: 'keystroke_rhythm' | 'scroll_velocity' | 'section_revisit' | 'idle_period' |
        'modality_dwell' | 'click_density' | 'session_architecture' | 'scroll_backtrack'
  value: number
  confidence: number
  timestamp: number
  metadata?: Record<string, unknown>
}

// ─── Classified Cognitive State ───────────────────────────────
// Output from the ML pipeline's composite scoring
export type CognitiveState = 'flow' | 'confusion' | 'fatigue' | 'surface' | 'insight' | 'rushing'

export interface ClassifiedState {
  state: CognitiveState
  confidence: number
  signals: BehavioralSignal[]
  suggestedTechnique?: string
}

// ─── Learner Profile (stored in IndexedDB via Dexie) ──────────
export interface LearnerProfile {
  id: string
  domain: string                     // e.g. "Biology / Cellular Respiration"
  archetype: 'procedural' | 'exploratory' | 'hybrid'
  archetypeModifiers: string[]       // e.g. ["visual-hybrid"]
  techniqueHistory: TechniqueRecord[]
  totalSessions: number
  createdAt: number
  updatedAt: number
}

export interface TechniqueRecord {
  technique: string
  usedAt: number
  engaged: boolean                   // did the student opt in?
  confusionResolved: boolean         // did confusion signal drop after?
  domain: string
}

// ─── Chrome Message Types ─────────────────────────────────────
// Messages between content script <-> background <-> overlay
export type ChromeMessage =
  | { type: 'BEHAVIORAL_SIGNAL'; payload: BehavioralSignal }
  | { type: 'STATE_CLASSIFIED'; payload: ClassifiedState }
  | { type: 'NUDGE_READY'; payload: { nudge: Nudge; transparency: TransparencyData } }
  | { type: 'ORI_STATE_CHANGE'; payload: { state: OriState } }
  | { type: 'CHAT_REQUEST'; payload: { message: string; sessionId: string } }
  | { type: 'CHAT_RESPONSE'; payload: { response: string; isSocratic: boolean } }
  | { type: 'PAGE_CONTEXT'; payload: { topic: string; url: string; textLength: number } }
  | { type: 'SESSION_SYNC'; payload: SessionData }

// ─── Session Data (for dashboard sync via chrome.storage) ─────
export interface SessionData {
  sessionId: string
  startedAt: number
  duration: number
  domain: string
  oriState: OriState
  nudgesShown: number
  nudgesAccepted: number
  techniquesUsed: string[]
  insightsCaptured: number
  cognitiveStates: { state: CognitiveState; at: number }[]
}

// ─── Technique Types ─────────────────────────────────────────
export type TechniqueType = 'pomodoro' | 'active_recall' | 'feynman' | 'strategic_rest' | 'quiz'

export type TechniquePhase =
  // Pomodoro phases
  | 'pomodoro_prompt' | 'pomodoro_running' | 'pomodoro_break_done'
  // Active Recall phases
  | 'recall_prompt' | 'recall_cover' | 'recall_quiz'
  // Feynman phases
  | 'feynman_prompt' | 'feynman_writing' | 'feynman_done'
  // Strategic Rest
  | 'rest_prompt' | 'rest_running' | 'rest_done'
  // Quiz
  | 'quiz_prompt' | 'quiz_active' | 'quiz_results'

export interface TechniqueState {
  type: TechniqueType
  phase: TechniquePhase
  // Pomodoro-specific
  breakDuration?: number          // seconds
  timeRemaining?: number          // seconds
  // Quiz-specific
  quizCards?: QuizCard[]
  currentCardIndex?: number
  correctCount?: number
  // Feynman-specific
  feynmanText?: string
  feynmanTopic?: string
  // Active Recall
  recallTopic?: string
}

export interface QuizCard {
  id: string
  question: string
  answer: string           // explanation shown after answering
  options: string[]        // 4 MCQ choices
  correctIndex: number     // which option index (0-3) is correct
  userAnswer?: 'correct' | 'incorrect' | null
}

// ─── Demo Preset Content ────────────────────────────────────
export interface DemoSequenceStep {
  delay: number                  // ms after previous step
  technique: TechniqueType
  message: string               // What Ori says when surfacing
  data?: Record<string, unknown>
}

// ─── Backend API Types ────────────────────────────────────────
export interface ChatRequest {
  message: string
  sessionId: string
  pageContext?: {
    topic: string
    url: string
  }
  learnerProfile?: {
    archetype: string
    domain: string
  }
}

export interface ChatResponse {
  response: string
  isSocratic: boolean
  suggestedNudge?: {
    message: string
    technique: string
    options: string[]
  }
  transparencyData?: TransparencyData
  oriStateUpdate?: OriState
}

export interface SignalRequest {
  signals: BehavioralSignal[]
  sessionId: string
  pageContext: {
    topic: string
    url: string
  }
}

export interface SignalResponse {
  classifiedState: ClassifiedState
  nudge?: {
    message: string
    technique: string
    options: string[]
    transparency: TransparencyData
  }
  oriState: OriState
}
