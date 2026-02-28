import { create } from 'zustand'
import type {
  OriState,
  Message,
  Nudge,
  TransparencyData,
  SessionData,
  CognitiveState,
  ChatResponse,
  SignalResponse,
  TechniqueState,
  TechniqueType,
  TechniquePhase,
  QuizCard,
} from '../../shared/types'
import type { TelemetrySnapshot, StateLabel } from '../../telemetry/types'
import {
  DEMO_SEQUENCE,
  IB_BIO_QUIZ_CARDS,
  FEYNMAN_PRESET_TOPIC,
  RECALL_PRESET_TOPIC,
} from '../demo/presetSequence'

// ─── Configuration ────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001/api'

// ─── Helpers ──────────────────────────────────────────────────
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getSessionId(): string {
  const key = 'prosocratic_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = generateId()
    sessionStorage.setItem(key, id)
  }
  return id
}

// ─── Store Interface ──────────────────────────────────────────
interface OverlayStore {
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

  // Demo Sequencer
  demoIndex: number
  demoStarted: boolean
  demoTimers: number[]

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

  // Behavioral sensors (local tracking, no backend needed)
  keystrokeCount: number
  lastActivityAt: number
  behavioralTimerStarted: boolean

  // Telemetry-derived state
  currentStateLabel: StateLabel
  currentStateConfidence: number
  lastTelemetryAt: number
  telemetryTriggerCooldown: number    // ms until next technique trigger allowed

  // Mascot expression
  mascotExpression: 'normal' | 'sleep' | 'sparkle' | 'confused'

  // ─── Actions ──────────────────────────────────────────────
  // Mascot
  setMascotExpression: (expr: 'normal' | 'sleep' | 'sparkle' | 'confused') => void
  wakeMascot: () => void
  // Panel
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void

  // Ori
  setOriState: (state: OriState) => void

  // Nudge
  surfaceNudge: (nudge: Nudge, transparency: TransparencyData) => void
  dismissNudge: () => void
  acceptNudge: (optionIndex: number) => void

  // Technique
  startTechnique: (type: TechniqueType, message?: string) => void
  setTechniquePhase: (phase: TechniquePhase) => void
  updateTechnique: (updates: Partial<TechniqueState>) => void
  endTechnique: () => void

  // Pomodoro-specific
  startPomodoro: (breakMinutes: number) => void
  tickPomodoro: () => void

  // Quiz-specific
  answerQuizCard: (cardId: string, answer: 'correct' | 'incorrect') => void
  nextQuizCard: () => void

  // Feynman-specific
  updateFeynmanText: (text: string) => void
  saveFeynman: () => void

  // Demo
  startDemoSequence: () => void
  advanceDemo: () => void
  stopDemoSequence: () => void

  // Chat
  sendMessage: (content: string) => Promise<void>
  addOriMessage: (content: string, isSocratic?: boolean) => void

  // Behavioral
  handleSignalResponse: (response: SignalResponse) => void
  setPageContext: (topic: string, url: string) => void
  recordKeystroke: () => void
  startBehavioralTimer: () => void

  // Study topic
  setStudyTopic: (topic: string) => void

  // Confetti
  triggerConfetti: () => void

  // Telemetry
  handleTelemetrySnapshot: (snapshot: TelemetrySnapshot) => void

  // Session
  syncSessionToStorage: () => void
  resetSession: () => void
}

// ─── Store ────────────────────────────────────────────────────
export const useOverlayStore = create<OverlayStore>((set, get) => ({
  // Initial State
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
  demoIndex: 0,
  demoStarted: false,
  demoTimers: [],
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
      // Return to sleep after 60s of no state changes
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
    const { isPanelOpen, demoStarted, startDemoSequence } = get()
    const newOpen = !isPanelOpen
    set({ isPanelOpen: newOpen })

    // Start demo on first open
    if (newOpen && !demoStarted) {
      startDemoSequence()
    }
  },

  openPanel: () => {
    const { demoStarted, startDemoSequence } = get()
    set({ isPanelOpen: true })
    if (!demoStarted) startDemoSequence()
  },

  closePanel: () => set({ isPanelOpen: false }),

  // ─── Ori Actions ──────────────────────────────────────────
  setOriState: (oriState) => set({ oriState }),

  // ─── Nudge Actions ────────────────────────────────────────
  surfaceNudge: (nudge, transparency) => {
    const { nudgeDismissCount } = get()
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
    const newCount = nudgeDismissCount + 1

    set({
      hasNudge: false,
      oriState: 'sleep',
      activeNudge: null,
      nudgeDismissCount: newCount,
    })

    setTimeout(() => {
      set({ transparencyData: null })
    }, 5000)

    // Advance demo on dismiss too
    get().advanceDemo()
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

    setTimeout(() => {
      set({ oriState: 'awake' })
    }, 3000)

    get().syncSessionToStorage()
  },

  // ─── Technique Actions ────────────────────────────────────
  startTechnique: (type, message) => {
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

    // Pre-populate technique-specific data
    if (type === 'quiz') {
      technique.quizCards = IB_BIO_QUIZ_CARDS.map(c => ({ ...c, userAnswer: null }))
      technique.currentCardIndex = 0
      technique.correctCount = 0
    }
    if (type === 'feynman') {
      technique.feynmanText = ''
      technique.feynmanTopic = FEYNMAN_PRESET_TOPIC
    }
    if (type === 'active_recall') {
      technique.recallTopic = RECALL_PRESET_TOPIC
    }

    // Add Ori message if provided
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
      activeTechnique: s.activeTechnique
        ? { ...s.activeTechnique, phase }
        : null,
    }))
  },

  updateTechnique: (updates) => {
    set(s => ({
      activeTechnique: s.activeTechnique
        ? { ...s.activeTechnique, ...updates }
        : null,
    }))
  },

  endTechnique: () => {
    const { activeTechnique, techniqueHistory, demoIndex } = get()
    if (activeTechnique) {
      set({
        activeTechnique: null,
        techniqueHistory: [
          ...techniqueHistory,
          { type: activeTechnique.type, accepted: true, at: Date.now() },
        ],
      })

      // After last demo step (strategic_rest = index 4), show encouraging wrap-up
      if (demoIndex >= 4) {
        const history = [...techniqueHistory, { type: activeTechnique.type, accepted: true, at: Date.now() }]
        const techniqueNames = history.map(h => h.type)
        const wrapMsg = getWrapUpMessage(techniqueNames, activeTechnique)
        setTimeout(() => {
          get().addOriMessage(wrapMsg)
        }, 1200)
      }
    } else {
      set({ activeTechnique: null })
    }

    // Mascot goes back to sleep after technique ends
    setTimeout(() => {
      const s = get()
      if (!s.activeTechnique) {
        set({ mascotExpression: 'sleep' as const })
      }
    }, 5000)

    // Advance demo after technique ends
    setTimeout(() => get().advanceDemo(), 2000)
  },

  // ─── Pomodoro ─────────────────────────────────────────────
  startPomodoro: (breakMinutes) => {
    set(s => ({
      activeTechnique: s.activeTechnique
        ? {
            ...s.activeTechnique,
            phase: 'pomodoro_running' as TechniquePhase,
            breakDuration: breakMinutes * 60,
            timeRemaining: breakMinutes * 60,
          }
        : null,
    }))
  },

  tickPomodoro: () => {
    const { activeTechnique } = get()
    if (!activeTechnique || activeTechnique.phase !== 'pomodoro_running') return

    const remaining = (activeTechnique.timeRemaining || 0) - 1
    if (remaining <= 0) {
      set(s => ({
        activeTechnique: s.activeTechnique
          ? { ...s.activeTechnique, phase: 'pomodoro_break_done' as TechniquePhase, timeRemaining: 0 }
          : null,
      }))
      // Add completion message
      const msg: Message = {
        id: generateId(),
        role: 'ori',
        content: "Break's over! Ready to continue? Your brain just consolidated what you learned.",
        timestamp: Date.now(),
      }
      set(s => ({ messages: [...s.messages, msg] }))
    } else {
      set(s => ({
        activeTechnique: s.activeTechnique
          ? { ...s.activeTechnique, timeRemaining: remaining }
          : null,
      }))
    }
  },

  // ─── Quiz ─────────────────────────────────────────────────
  answerQuizCard: (cardId, answer) => {
    const { activeTechnique } = get()
    if (!activeTechnique?.quizCards) return

    const cards = activeTechnique.quizCards.map(c =>
      c.id === cardId ? { ...c, userAnswer: answer } : c
    )
    const correctCount = cards.filter(c => c.userAnswer === 'correct').length

    const newExpr = answer === 'correct' ? 'sparkle' as const : 'confused' as const
    set(s => ({
      activeTechnique: s.activeTechnique
        ? { ...s.activeTechnique, quizCards: cards, correctCount }
        : null,
      mascotExpression: newExpr,
    }))

    // Revert mascot to normal after 3s
    setTimeout(() => {
      const s = get()
      if (s.mascotExpression === newExpr) {
        set({ mascotExpression: 'normal' as const })
      }
    }, 3000)
  },

  nextQuizCard: () => {
    const { activeTechnique } = get()
    if (!activeTechnique?.quizCards) return

    const nextIdx = (activeTechnique.currentCardIndex || 0) + 1
    if (nextIdx >= activeTechnique.quizCards.length) {
      // All done → results
      set(s => ({
        activeTechnique: s.activeTechnique
          ? { ...s.activeTechnique, phase: 'quiz_results' as TechniquePhase }
          : null,
      }))
    } else {
      set(s => ({
        activeTechnique: s.activeTechnique
          ? { ...s.activeTechnique, currentCardIndex: nextIdx }
          : null,
      }))
    }
  },

  // ─── Feynman ──────────────────────────────────────────────
  updateFeynmanText: (text) => {
    set(s => ({
      activeTechnique: s.activeTechnique
        ? { ...s.activeTechnique, feynmanText: text }
        : null,
    }))
  },

  saveFeynman: () => {
    const { activeTechnique } = get()
    if (!activeTechnique?.feynmanText) return

    const msg: Message = {
      id: generateId(),
      role: 'ori',
      content: "Nice explanation! You've captured the core concept. Saved to your notes.",
      timestamp: Date.now(),
    }
    set(s => ({
      messages: [...s.messages, msg],
      activeTechnique: { ...s.activeTechnique!, phase: 'feynman_done' as TechniquePhase },
      insightsCaptured: s.insightsCaptured + 1,
    }))

    setTimeout(() => get().endTechnique(), 2000)
  },

  // ─── Demo Sequencer ───────────────────────────────────────
  startDemoSequence: () => {
    const timers: number[] = []
    const { demoStarted } = get()
    if (demoStarted) return

    set({ demoStarted: true, demoIndex: 0 })

    // Schedule first technique
    const firstStep = DEMO_SEQUENCE[0]
    if (firstStep) {
      const t = window.setTimeout(() => {
        const state = get()
        // Only fire if no technique is active
        if (!state.activeTechnique) {
          state.startTechnique(firstStep.technique, firstStep.message)
        }
      }, firstStep.delay)
      timers.push(t)
    }

    set({ demoTimers: timers })
  },

  advanceDemo: () => {
    const { demoIndex, demoTimers } = get()
    const nextIndex = demoIndex + 1

    if (nextIndex >= DEMO_SEQUENCE.length) {
      set({ demoIndex: nextIndex })
      return
    }

    set({ demoIndex: nextIndex })

    // Schedule next technique after a short delay
    const nextStep = DEMO_SEQUENCE[nextIndex]
    const t = window.setTimeout(() => {
      const state = get()
      if (!state.activeTechnique) {
        state.startTechnique(nextStep.technique, nextStep.message)
      }
    }, 8000) // 8s between demo steps for smooth pacing

    set({ demoTimers: [...demoTimers, t] })
  },

  stopDemoSequence: () => {
    const { demoTimers } = get()
    demoTimers.forEach(t => clearTimeout(t))
    set({ demoTimers: [], demoStarted: false })
  },

  // ─── Chat Actions ─────────────────────────────────────────
  sendMessage: async (content) => {
    const { currentTopic, currentUrl } = get()

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    set(s => ({ messages: [...s.messages, userMsg], isTyping: true }))

    try {
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          sessionId: getSessionId(),
          pageContext: { topic: currentTopic, url: currentUrl },
        }),
      })

      if (!response.ok) throw new Error('Backend unavailable')

      const data: ChatResponse = await response.json()

      const oriMsg: Message = {
        id: generateId(),
        role: 'ori',
        content: data.response,
        timestamp: Date.now(),
        isSocratic: data.isSocratic,
      }
      set(s => ({
        messages: [...s.messages, oriMsg],
        isTyping: false,
        oriState: data.oriStateUpdate || s.oriState,
      }))

      if (data.suggestedNudge && data.transparencyData) {
        const nudge: Nudge = {
          id: generateId(),
          message: data.suggestedNudge.message,
          technique: data.suggestedNudge.technique,
          options: data.suggestedNudge.options.map(label => ({
            label,
            action: () => {
              get().addOriMessage(`Great choice. Let's try the ${data.suggestedNudge!.technique} together.`)
            },
          })),
          onDismiss: () => get().dismissNudge(),
          timestamp: Date.now(),
        }
        get().surfaceNudge(nudge, data.transparencyData)
      }
    } catch {
      const fallbackMsg: Message = {
        id: generateId(),
        role: 'ori',
        content: getFallbackResponse(content),
        timestamp: Date.now(),
        isSocratic: true,
      }
      set(s => ({ messages: [...s.messages, fallbackMsg], isTyping: false }))
    }
  },

  addOriMessage: (content, isSocratic = false) => {
    const msg: Message = {
      id: generateId(),
      role: 'ori',
      content,
      timestamp: Date.now(),
      isSocratic,
    }
    set(s => ({ messages: [...s.messages, msg] }))
  },

  // ─── Behavioral Signal Handling ───────────────────────────
  handleSignalResponse: (response) => {
    const { classifiedState, nudge: nudgeData, oriState: newOriState } = response

    // Map backend cognitive state → mascot expression
    const stateMascotMap: Record<string, 'normal' | 'sleep' | 'sparkle' | 'confused'> = {
      focused: 'sleep',       // FLOW / focused = panda sleeps happily
      distracted: 'confused', // confused / struggling
      frustrated: 'confused',
      curious: 'sparkle',     // insight / eureka
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
  // Reacts to computed cognitive states. After demo sequence, this
  // drives technique suggestions based on REAL behavioral signals.
  handleTelemetrySnapshot: (snapshot) => {
    const { state_label, confidence, feature_summary } = snapshot
    const { demoStarted, demoIndex, activeTechnique, studyTopic, telemetryTriggerCooldown } = get()

    // Map cognitive state to mascot expression
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

    // Only trigger techniques after demo is done and no technique is active
    if (!demoStarted || demoIndex < 5 || activeTechnique) return
    // Respect cooldown (don't spam techniques)
    if (Date.now() < telemetryTriggerCooldown) return

    const topic = studyTopic || 'what you\'re studying'
    const sessionMin = Math.round((feature_summary.session_duration_s ?? 0) / 60)
    const idleSec = Math.round(feature_summary.idle_gap_s ?? 0)
    const ks = Math.round(feature_summary.keystroke_speed ?? 0)
    const revisits = feature_summary.section_revisit_count ?? 0
    const confC = feature_summary.confusion_confidence ?? 0
    const fatS = feature_summary.fatigue_score ?? 0

    let triggered = false

    switch (state_label) {
      case 'CONFUSION':
        if (confidence > 0.5) {
          const msg = revisits >= 3
            ? `You've gone back to this section ${revisits} times. Try explaining ${topic} in your own words — the Feynman technique finds exactly where the gap is.`
            : `Your reading pattern suggests something isn't clicking. Want to test what you know with a quick quiz?`
          get().startTechnique(revisits >= 3 ? 'feynman' : 'quiz', msg)
          triggered = true
        }
        break

      case 'FRUSTRATION':
        if (confidence > 0.5) {
          get().startTechnique('strategic_rest',
            `High backspace rate and section revisits detected — you're pushing hard. A 5-minute break now will actually help you solve this faster.`
          )
          triggered = true
        }
        break

      case 'OVERLOAD':
        if (confidence > 0.5 && fatS > 0.5) {
          get().startTechnique('pomodoro',
            `You've been at ${topic} for ${sessionMin} minutes and your focus signals are declining. Time for a proper Pomodoro break?`
          )
          triggered = true
        }
        break

      case 'BOREDOM':
        if (confidence > 0.45) {
          get().startTechnique('active_recall',
            `Activity has flattened out — your brain might need a challenge. Quick recall test on ${topic}?`
          )
          triggered = true
        }
        break

      case 'MIND_WANDER':
        if (confidence > 0.45 && idleSec > 20) {
          get().startTechnique('strategic_rest',
            `You've been idle for ${idleSec} seconds. Sometimes the best thing is to step away properly — a timed break keeps you honest.`
          )
          triggered = true
        }
        break

      case 'INSIGHT':
        // Don't interrupt insight! Just encourage.
        get().addOriMessage(
          `🎯 Nice — your focus pattern just shifted in a positive way. Whatever you just figured out, keep going.`
        )
        triggered = true
        break

      case 'FLOW':
        // Don't interrupt flow. But if session is very long, gently suggest break.
        if (sessionMin > 50 && fatS > 0.4) {
          get().startTechnique('pomodoro',
            `${sessionMin} minutes of focused work — impressive. But even flow states benefit from breaks. Quick Pomodoro?`
          )
          triggered = true
        }
        break
    }

    if (triggered) {
      // 3-minute cooldown before next technique trigger
      set({ telemetryTriggerCooldown: Date.now() + 180_000 })
    }
  },

  // ─── Behavioral Sensors ───────────────────────────────────
  recordKeystroke: () => {
    const { demoStarted, demoIndex, activeTechnique, startTechnique, keystrokeCount } = get()
    const newCount = keystrokeCount + 1
    set({ keystrokeCount: newCount, lastActivityAt: Date.now() })

    // Only fire behavioral triggers after the demo sequence is done
    if (!demoStarted || demoIndex < 5 || activeTechnique) return

    // Every 400 keystrokes → suggest Feynman or Active Recall
    if (newCount % 400 === 0) {
      const { studyTopic } = get()
      const topic = studyTopic || 'what you\'re studying'
      const which = newCount % 800 === 0 ? 'feynman' : 'active_recall'
      const msg = which === 'feynman'
        ? `You've typed a lot — you're clearly thinking. Try explaining ${topic} simply to lock it in?`
        : `You've been writing for a while. Test what's sticking — quick recall check?`
      startTechnique(which as TechniqueType, msg)
    }
  },

  startBehavioralTimer: () => {
    const { behavioralTimerStarted } = get()
    if (behavioralTimerStarted) return
    set({ behavioralTimerStarted: true })

    // Check idle / session length every 60s
    const timer = window.setInterval(() => {
      const state = get()
      if (!state.demoStarted || state.demoIndex < 5 || state.activeTechnique) return

      const idleMs = Date.now() - state.lastActivityAt
      const sessionMs = Date.now() - state.sessionStartedAt

      // 5+ min idle → Strategic Rest
      if (idleMs > 5 * 60 * 1000) {
        const topic = state.studyTopic || 'your study session'
        state.startTechnique('strategic_rest', `You've been idle for a while. A proper break after ${topic} helps memory consolidation.`)
        set({ lastActivityAt: Date.now() }) // reset idle
        return
      }

      // Every 25 min → Pomodoro
      if (sessionMs > 0 && sessionMs % (25 * 60 * 1000) < 65000) {
        const topic = state.studyTopic || 'this'
        state.startTechnique('pomodoro', `You've been studying ${topic} for 25 minutes. Time for a focused Pomodoro break?`)
      }
    }, 60000)

    // Store timer ref (not in state to avoid re-renders)
    ;(window as Window & { __prosoTimer?: number }).__prosoTimer = timer
  },

  // ─── Session Sync ────────────────────────────────────────
  syncSessionToStorage: () => {
    const state = get()
    const sessionData: SessionData = {
      sessionId: getSessionId(),
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

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ prosocratic_session: sessionData })
    }
  },

  resetSession: () => {
    get().stopDemoSequence()
    set({
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
      demoIndex: 0,
      demoStarted: false,
      demoTimers: [],
    })
  },
}))

// ─── Wrap-Up Message ─────────────────────────────────────────
function getWrapUpMessage(techniques: TechniqueType[], lastTechnique: TechniqueState): string {
  const hasQuiz = techniques.includes('quiz')
  const hasFeynman = techniques.includes('feynman')
  const hasRecall = techniques.includes('active_recall')

  // Quiz performance-aware message
  if (hasQuiz && lastTechnique.type === 'quiz') {
    const correct = lastTechnique.correctCount || 0
    const total = lastTechnique.quizCards?.length || 4
    const score = Math.round((correct / total) * 100)

    if (score === 100) {
      return "🎯 Perfect score on the quiz — and you worked through Feynman and Active Recall too. That's a complete learning loop. Next session, try spacing this topic out by 24h before reviewing again — that's where long-term memory forms."
    }
    if (score >= 75) {
      return `✨ Great session. You engaged with every technique and scored ${correct}/${total} on the quiz. The ones you missed are actually your most valuable data — they show exactly where to focus next time.`
    }
    return `💪 ${correct}/${total} on the quiz, but you showed up and did the whole session — that matters more than a perfect score right now. Active Recall seemed to suit you well — try leading with that next time.`
  }

  if (hasFeynman) {
    return "🧠 The Feynman technique really shone for you today — when you had to write it simply, you found the gaps yourself. That's the whole point. Next time, try explaining it to someone (or voice-record it) for an even stronger effect."
  }

  if (hasRecall) {
    return "⚡ You responded really quickly during Active Recall — that's a sign the material is starting to stick. Spacing out your next recall session (try tomorrow) will lock it into long-term memory."
  }

  return "✅ Good session. You moved through multiple techniques which is exactly what research shows works — interleaving learning modes. Come back in 24h for maximum retention."
}

// ─── Fallback Responses ─────────────────────────────────────
function getFallbackResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('what is') || lower.includes('define') || lower.includes('explain')) {
    return "That's a good starting point. But here's what I'm curious about — why does it matter? What breaks if this concept didn't exist?"
  }
  if (lower.includes('help') || lower.includes('stuck') || lower.includes('confused')) {
    return "I can see you're working through something. Instead of giving you the answer, let me ask — what's the last thing that made sense to you? Let's build from there."
  }
  if (lower.includes('why')) {
    return "Now that's the right question. Before I answer, try this: explain what you think the reason is, even if you're not sure. The gaps in your explanation are exactly where we need to look."
  }
  if (lower.includes('dna') || lower.includes('replication') || lower.includes('enzyme')) {
    return "DNA replication is fascinating — it's the foundation of all life. What part specifically are you working through? The enzymes, the mechanism, or the semi-conservative nature?"
  }
  return "Interesting. Tell me more about what you're thinking — sometimes saying it out loud is where the understanding starts."
}
