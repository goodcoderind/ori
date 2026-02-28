import { create } from 'zustand'
import type {
  OriState,
  Message,
  Nudge,
  TransparencyData,
  SessionData,
  CognitiveState,
  SignalResponse,
  TechniqueState,
  TechniqueType,
  TechniquePhase,
} from '../../shared/types'
import type { TelemetrySnapshot, StateLabel } from '../../telemetry/types'

// ─── Helpers ──────────────────────────────────────────────────
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Send a message to the background service worker. */
async function sendToBackground(type: string, payload: unknown): Promise<unknown> {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      return await chrome.runtime.sendMessage({ type, payload })
    } catch {
      return null
    }
  }
  return null
}

// ─── Store Interface ──────────────────────────────────────────
interface OverlayStore {
  // Session gate — nothing runs until the user explicitly starts
  sessionActive: boolean

  // Panel State
  isPanelOpen: boolean
  isMinimized: boolean

  // Ori State
  oriState: OriState
  hasNudge: boolean
  nudgeDismissCount: number

  // Chat
  messages: Message[]
  isTyping: boolean

  // Nudge System
  activeNudge: Nudge | null
  transparencyData: TransparencyData | null

  // Technique System
  activeTechnique: TechniqueState | null
  techniqueHistory: { type: TechniqueType; accepted: boolean; at: number }[]

  // Session Tracking
  sessionStartedAt: number
  techniquesUsed: string[]
  insightsCaptured: number
  cognitiveStates: { state: CognitiveState; at: number }[]

  // Page Context
  currentTopic: string
  currentUrl: string

  // Study topic (user-specified)
  studyTopic: string

  // Confetti celebration
  showConfetti: boolean

  // Behavioral sensors (local tracking)
  keystrokeCount: number
  lastActivityAt: number
  behavioralTimerStarted: boolean

  // Telemetry-derived state
  currentStateLabel: StateLabel
  currentStateConfidence: number
  lastTelemetryAt: number
  telemetryTriggerCooldown: number

  // Mascot expression
  mascotExpression: 'normal' | 'sleep' | 'sparkle' | 'confused'

  // ─── Actions ──────────────────────────────────────────────
  setMascotExpression: (expr: 'normal' | 'sleep' | 'sparkle' | 'confused') => void
  wakeMascot: () => void
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void
  setOriState: (state: OriState) => void
  surfaceNudge: (nudge: Nudge, transparency: TransparencyData) => void
  dismissNudge: () => void
  acceptNudge: (optionIndex: number) => void
  startTechnique: (type: TechniqueType, message?: string) => void
  setTechniquePhase: (phase: TechniquePhase) => void
  updateTechnique: (updates: Partial<TechniqueState>) => void
  endTechnique: () => void
  startPomodoro: (breakMinutes: number) => void
  tickPomodoro: () => void
  answerQuizCard: (cardId: string, answer: 'correct' | 'incorrect') => void
  nextQuizCard: () => void
  updateFeynmanText: (text: string) => void
  saveFeynman: () => void
  sendMessage: (content: string) => Promise<void>
  addOriMessage: (content: string, isSocratic?: boolean) => void
  handleSignalResponse: (response: SignalResponse) => void
  setPageContext: (topic: string, url: string) => void
  recordKeystroke: () => void
  startBehavioralTimer: () => void
  setStudyTopic: (topic: string) => void
  triggerConfetti: () => void
  handleTelemetrySnapshot: (snapshot: TelemetrySnapshot) => void
  syncSessionToStorage: () => void
  resetSession: () => void

  // Session lifecycle — user must explicitly start/stop
  beginSession: () => Promise<void>
  stopSession: () => Promise<void>
}

// ─── Store ────────────────────────────────────────────────────
export const useOverlayStore = create<OverlayStore>((set, get) => ({
  // Initial State — session is NOT active until user clicks "Start Studying"
  sessionActive: false,
  isPanelOpen: false,
  isMinimized: false,
  oriState: 'sleep',
  hasNudge: false,
  nudgeDismissCount: 0,
  messages: [],
  isTyping: false,
  activeNudge: null,
  transparencyData: null,
  activeTechnique: null,
  techniqueHistory: [],
  sessionStartedAt: Date.now(),
  techniquesUsed: [],
  insightsCaptured: 0,
  cognitiveStates: [],
  currentTopic: '',
  currentUrl: '',
  studyTopic: '',
  showConfetti: false,
  keystrokeCount: 0,
  lastActivityAt: Date.now(),
  behavioralTimerStarted: false,
  currentStateLabel: 'FLOW' as StateLabel,
  currentStateConfidence: 0,
  lastTelemetryAt: 0,
  telemetryTriggerCooldown: 0,
  mascotExpression: 'sleep' as const,

  // ─── Mascot Actions ─────────────────────────────────────────
  setMascotExpression: (expr) => set({ mascotExpression: expr }),

  wakeMascot: () => {
    const { mascotExpression, isPanelOpen, togglePanel } = get()
    if (mascotExpression === 'sleep') {
      set({ mascotExpression: 'normal' })
      if (!isPanelOpen) togglePanel()
      setTimeout(() => {
        const s = get()
        if (s.mascotExpression === 'normal' && !s.activeTechnique) {
          set({ mascotExpression: 'sleep' })
        }
      }, 60_000)
    }
  },

  // ─── Panel Actions ────────────────────────────────────────
  togglePanel: () => {
    const { isPanelOpen } = get()
    set({ isPanelOpen: !isPanelOpen })
  },

  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),

  // ─── Ori Actions ──────────────────────────────────────────
  setOriState: (oriState) => set({ oriState }),

  // ─── Nudge Actions ────────────────────────────────────────
  surfaceNudge: (nudge, transparency) => {
    const { nudgeDismissCount, sessionActive } = get()
    if (!sessionActive) return
    if (nudgeDismissCount >= 3) return

    set({
      hasNudge: true,
      oriState: 'awake',
      activeNudge: nudge,
      transparencyData: transparency,
    })
  },

  dismissNudge: () => {
    const { nudgeDismissCount } = get()
    set({
      hasNudge: false,
      oriState: 'sleep',
      activeNudge: null,
      nudgeDismissCount: nudgeDismissCount + 1,
    })
    setTimeout(() => set({ transparencyData: null }), 5000)
  },

  acceptNudge: (optionIndex) => {
    const { activeNudge, techniquesUsed } = get()
    if (!activeNudge) return

    activeNudge.options[optionIndex]?.action()

    const newTechniques = [...techniquesUsed]
    if (!newTechniques.includes(activeNudge.technique)) {
      newTechniques.push(activeNudge.technique)
    }

    set({
      hasNudge: false,
      oriState: 'sparkle',
      activeNudge: null,
      techniquesUsed: newTechniques,
    })

    setTimeout(() => set({ oriState: 'awake' }), 3000)
    get().syncSessionToStorage()
  },

  // ─── Technique Actions ────────────────────────────────────
  startTechnique: (type, message) => {
    const { studyTopic, currentTopic } = get()
    const topic = studyTopic || currentTopic || 'this concept'
    const phaseMap: Record<TechniqueType, TechniquePhase> = {
      pomodoro: 'pomodoro_prompt',
      active_recall: 'recall_prompt',
      feynman: 'feynman_prompt',
      strategic_rest: 'rest_prompt',
      quiz: 'quiz_prompt',
    }

    const technique: TechniqueState = {
      type,
      phase: phaseMap[type],
    }

    if (type === 'quiz') {
      technique.quizCards = []
      technique.currentCardIndex = 0
      technique.correctCount = 0
    }
    if (type === 'feynman') {
      technique.feynmanText = ''
      technique.feynmanTopic = topic
    }
    if (type === 'active_recall') {
      technique.recallTopic = topic
    }

    if (message) {
      const msg: Message = {
        id: generateId(),
        role: 'ori',
        content: message,
        timestamp: Date.now(),
      }
      set(s => ({
        messages: [...s.messages, msg],
        activeTechnique: technique,
        oriState: 'awake',
        hasNudge: false,
        activeNudge: null,
        mascotExpression: 'normal' as const,
      }))
    } else {
      set({ activeTechnique: technique, oriState: 'awake', mascotExpression: 'normal' as const })
    }
  },

  setTechniquePhase: (phase) => {
    set(s => ({
      activeTechnique: s.activeTechnique ? { ...s.activeTechnique, phase } : null,
    }))
  },

  updateTechnique: (updates) => {
    set(s => ({
      activeTechnique: s.activeTechnique ? { ...s.activeTechnique, ...updates } : null,
    }))
  },

  endTechnique: () => {
    const { activeTechnique, techniqueHistory } = get()
    if (activeTechnique) {
      set({
        activeTechnique: null,
        techniqueHistory: [
          ...techniqueHistory,
          { type: activeTechnique.type, accepted: true, at: Date.now() },
        ],
      })
    } else {
      set({ activeTechnique: null })
    }
    setTimeout(() => {
      const s = get()
      if (!s.activeTechnique) set({ mascotExpression: 'sleep' as const })
    }, 5000)
  },

  // ─── Pomodoro ─────────────────────────────────────────────
  startPomodoro: (breakMinutes) => {
    set(s => ({
      activeTechnique: s.activeTechnique
        ? { ...s.activeTechnique, phase: 'pomodoro_running' as TechniquePhase, breakDuration: breakMinutes * 60, timeRemaining: breakMinutes * 60 }
        : null,
    }))
  },

  tickPomodoro: () => {
    const { activeTechnique } = get()
    if (!activeTechnique || activeTechnique.phase !== 'pomodoro_running') return

    const remaining = (activeTechnique.timeRemaining || 0) - 1
    if (remaining <= 0) {
      set(s => ({
        activeTechnique: s.activeTechnique ? { ...s.activeTechnique, phase: 'pomodoro_break_done' as TechniquePhase, timeRemaining: 0 } : null,
      }))
      const msg: Message = { id: generateId(), role: 'ori', content: "Break's over! Ready to continue? Your brain just consolidated what you learned.", timestamp: Date.now() }
      set(s => ({ messages: [...s.messages, msg] }))
    } else {
      set(s => ({
        activeTechnique: s.activeTechnique ? { ...s.activeTechnique, timeRemaining: remaining } : null,
      }))
    }
  },

  // ─── Quiz ─────────────────────────────────────────────────
  answerQuizCard: (cardId, answer) => {
    const { activeTechnique } = get()
    if (!activeTechnique?.quizCards) return

    const cards = activeTechnique.quizCards.map(c => c.id === cardId ? { ...c, userAnswer: answer } : c)
    const correctCount = cards.filter(c => c.userAnswer === 'correct').length
    const newExpr = answer === 'correct' ? 'sparkle' as const : 'confused' as const
    set(s => ({
      activeTechnique: s.activeTechnique ? { ...s.activeTechnique, quizCards: cards, correctCount } : null,
      mascotExpression: newExpr,
    }))
    setTimeout(() => {
      const s = get()
      if (s.mascotExpression === newExpr) set({ mascotExpression: 'normal' as const })
    }, 3000)
  },

  nextQuizCard: () => {
    const { activeTechnique } = get()
    if (!activeTechnique?.quizCards) return

    const nextIdx = (activeTechnique.currentCardIndex || 0) + 1
    if (nextIdx >= activeTechnique.quizCards.length) {
      set(s => ({
        activeTechnique: s.activeTechnique ? { ...s.activeTechnique, phase: 'quiz_results' as TechniquePhase } : null,
      }))
    } else {
      set(s => ({
        activeTechnique: s.activeTechnique ? { ...s.activeTechnique, currentCardIndex: nextIdx } : null,
      }))
    }
  },

  // ─── Feynman ──────────────────────────────────────────────
  updateFeynmanText: (text) => {
    set(s => ({
      activeTechnique: s.activeTechnique ? { ...s.activeTechnique, feynmanText: text } : null,
    }))
  },

  saveFeynman: () => {
    const { activeTechnique } = get()
    if (!activeTechnique?.feynmanText) return

    const msg: Message = { id: generateId(), role: 'ori', content: "Nice explanation! You've captured the core concept. Saved to your notes.", timestamp: Date.now() }
    set(s => ({
      messages: [...s.messages, msg],
      activeTechnique: { ...s.activeTechnique!, phase: 'feynman_done' as TechniquePhase },
      insightsCaptured: s.insightsCaptured + 1,
    }))
    setTimeout(() => get().endTechnique(), 2000)
  },

  // ─── Chat Actions ─────────────────────────────────────────
  sendMessage: async (content) => {
    if (!get().sessionActive) return

    const userMsg: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() }
    set(s => ({ messages: [...s.messages, userMsg], isTyping: true }))

    try {
      const response = await sendToBackground('CHAT_REQUEST', { message: content }) as {
        response?: string
        isSocratic?: boolean
      } | null

      if (response?.response) {
        const oriMsg: Message = {
          id: generateId(),
          role: 'ori',
          content: response.response,
          timestamp: Date.now(),
          isSocratic: response.isSocratic,
        }
        set(s => ({ messages: [...s.messages, oriMsg], isTyping: false }))
      } else {
        throw new Error('No response')
      }
    } catch {
      const fallbackMsg: Message = {
        id: generateId(),
        role: 'ori',
        content: "I'm having trouble connecting to the backend. Try again in a moment.",
        timestamp: Date.now(),
        isSocratic: false,
      }
      set(s => ({ messages: [...s.messages, fallbackMsg], isTyping: false }))
    }
  },

  addOriMessage: (content, isSocratic = false) => {
    const msg: Message = { id: generateId(), role: 'ori', content, timestamp: Date.now(), isSocratic }
    set(s => ({ messages: [...s.messages, msg] }))
  },

  // ─── Behavioral Signal Handling ───────────────────────────
  handleSignalResponse: (response) => {
    if (!get().sessionActive) return

    const { classifiedState, nudge: nudgeData, oriState: newOriState } = response

    const stateMascotMap: Record<string, 'normal' | 'sleep' | 'sparkle' | 'confused'> = {
      focused: 'sleep',
      distracted: 'confused',
      frustrated: 'confused',
      curious: 'sparkle',
      idle: 'sleep',
    }
    const mascotFromBackend = stateMascotMap[classifiedState.state] ?? 'normal'

    set(s => ({
      cognitiveStates: [...s.cognitiveStates, { state: classifiedState.state, at: Date.now() }],
      oriState: newOriState,
      mascotExpression: mascotFromBackend,
    }))

    if (nudgeData) {
      const nudge: Nudge = {
        id: generateId(),
        message: nudgeData.message,
        technique: nudgeData.technique,
        options: nudgeData.options.map(label => ({
          label,
          action: () => {
            get().addOriMessage(`Let's try ${nudgeData.technique}. Here's how it works...`)
          },
        })),
        onDismiss: () => get().dismissNudge(),
        timestamp: Date.now(),
      }
      get().surfaceNudge(nudge, nudgeData.transparency)
    }
  },

  setPageContext: (topic, url) => set({ currentTopic: topic, currentUrl: url }),
  setStudyTopic: (topic) => set({ studyTopic: topic }),

  triggerConfetti: () => {
    set({ showConfetti: true })
    setTimeout(() => set({ showConfetti: false }), 1800)
  },

  // ─── Telemetry Snapshot Handler ─────────────────────────────
  // Updates local mascot expression and state labels.
  // Technique suggestions come exclusively from the backend policy engine
  // via NUDGE_READY messages (routed through useOriState hook).
  handleTelemetrySnapshot: (snapshot) => {
    // Only process telemetry when a session is active
    if (!get().sessionActive) return

    const { state_label, confidence } = snapshot

    const mascotMap: Record<string, 'normal' | 'sleep' | 'sparkle' | 'confused'> = {
      FLOW: 'sleep',
      INSIGHT: 'sparkle',
      CONFUSION: 'confused',
      FRUSTRATION: 'confused',
      OVERLOAD: 'confused',
      BOREDOM: 'sleep',
      MIND_WANDER: 'sleep',
    }
    const newMascot = confidence > 0.4 ? (mascotMap[state_label] ?? 'normal') : get().mascotExpression

    set({
      currentStateLabel: state_label,
      currentStateConfidence: confidence,
      lastTelemetryAt: Date.now(),
      mascotExpression: newMascot,
    })
  },

  // ─── Behavioral Sensors ───────────────────────────────────
  recordKeystroke: () => {
    set(s => ({ keystrokeCount: s.keystrokeCount + 1, lastActivityAt: Date.now() }))
  },

  startBehavioralTimer: () => {
    const { behavioralTimerStarted } = get()
    if (behavioralTimerStarted) return
    set({ behavioralTimerStarted: true })
    // Activity tracking only — technique suggestions come from backend
  },

  // ─── Session Sync ────────────────────────────────────────
  syncSessionToStorage: () => {
    if (!get().sessionActive) return

    const state = get()
    const sessionData: SessionData = {
      sessionId: generateId(),
      startedAt: state.sessionStartedAt,
      duration: Date.now() - state.sessionStartedAt,
      domain: state.currentTopic,
      oriState: state.oriState,
      nudgesShown: state.cognitiveStates.length,
      nudgesAccepted: state.techniquesUsed.length,
      techniquesUsed: state.techniquesUsed,
      insightsCaptured: state.insightsCaptured,
      cognitiveStates: state.cognitiveStates,
    }
    sendToBackground('SESSION_SYNC', sessionData)
  },

  resetSession: () => {
    set({
      sessionActive: false,
      messages: [],
      activeNudge: null,
      transparencyData: null,
      hasNudge: false,
      oriState: 'sleep',
      nudgeDismissCount: 0,
      sessionStartedAt: Date.now(),
      techniquesUsed: [],
      insightsCaptured: 0,
      cognitiveStates: [],
      isTyping: false,
      activeTechnique: null,
      techniqueHistory: [],
      behavioralTimerStarted: false,
      currentStateLabel: 'FLOW' as StateLabel,
      currentStateConfidence: 0,
      lastTelemetryAt: 0,
      mascotExpression: 'sleep' as const,
    })
  },

  // ─── Explicit Session Start / Stop ─────────────────────────
  beginSession: async () => {
    const url = window.location.href
    const title = document.title || url

    // Send PAGE_CONTEXT to background → starts backend session
    await sendToBackground('PAGE_CONTEXT', {
      topic: title.slice(0, 500),
      url,
      textLength: 0,
    })

    set({
      sessionActive: true,
      sessionStartedAt: Date.now(),
      oriState: 'noticing',
      mascotExpression: 'normal' as const,
      currentUrl: url,
      currentTopic: title,
    })
  },

  stopSession: async () => {
    // The background service worker will end the backend session
    // when it receives the next PAGE_CONTEXT or tab close.
    // We also explicitly signal it.
    await sendToBackground('SESSION_SYNC', {
      sessionId: `${Date.now()}`,
      startedAt: get().sessionStartedAt,
      duration: Date.now() - get().sessionStartedAt,
      domain: get().currentTopic,
      oriState: get().oriState,
      nudgesShown: get().cognitiveStates.length,
      nudgesAccepted: get().techniquesUsed.length,
      techniquesUsed: get().techniquesUsed,
      insightsCaptured: get().insightsCaptured,
      cognitiveStates: get().cognitiveStates,
    })

    set({
      sessionActive: false,
      oriState: 'sleep',
      mascotExpression: 'sleep' as const,
      hasNudge: false,
      activeNudge: null,
      transparencyData: null,
      activeTechnique: null,
      behavioralTimerStarted: false,
    })
  },
}))
