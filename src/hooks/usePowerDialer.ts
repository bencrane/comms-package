import { useReducer, useEffect, useCallback, useMemo, useRef } from 'react'
import { useVoice } from './useVoice'
import { useDisposition } from './useDisposition'
import { createOEXError } from '../utils/errors'
import type {
  OEXDialerLead,
  OEXDialerSessionState,
  OEXDialerLeadState,
  OEXDialerLeadResult,
  OEXDialerSessionStats,
  OEXDialerOptions,
  OEXCallState,
  OEXCallInfo,
} from '../types'
import type { OEXError, Disposition } from '../types'

// --- Return type ---

export interface UsePowerDialerReturn {
  start: () => void
  pause: () => void
  resume: () => void
  skip: () => void
  endSession: () => void

  sessionState: OEXDialerSessionState
  currentLead: OEXDialerLead | null
  queuePosition: number
  stats: OEXDialerSessionStats
  results: OEXDialerLeadResult[]
  currentLeadState: OEXDialerLeadState | null

  callState: OEXCallState
  callInfo: OEXCallInfo | null
  deviceReady: boolean
  disconnect: () => void
  sendDigits: (digits: string) => void
  mute: (shouldMute: boolean) => void
  toggleMute: () => void

  setDisposition: (disposition: Disposition, notes?: string) => Promise<void>
  isDispositionSubmitting: boolean
  isDispositionSubmitted: boolean
  lastCallSid: string | null

  error: OEXError | null
}

// --- Reducer ---

interface DialerState {
  sessionState: OEXDialerSessionState
  queuePosition: number
  currentLeadState: OEXDialerLeadState | null
  results: OEXDialerLeadResult[]
  sessionStartedAt: number | null
  error: OEXError | null
}

type DialerAction =
  | { type: 'START_SESSION' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'DIALING'; leadId: string }
  | { type: 'ON_CALL'; callSid?: string }
  | { type: 'CALL_ENDED' }
  | { type: 'DISPOSITION_CAPTURED'; disposition?: Disposition; callSid?: string }
  | { type: 'ADVANCE' }
  | { type: 'SKIP'; leadId: string }
  | { type: 'END_SESSION' }
  | { type: 'SESSION_COMPLETED' }
  | { type: 'ERROR'; error: OEXError }

const initialState: DialerState = {
  sessionState: 'idle',
  queuePosition: 0,
  currentLeadState: null,
  results: [],
  sessionStartedAt: null,
  error: null,
}

function dialerReducer(state: DialerState, action: DialerAction): DialerState {
  switch (action.type) {
    case 'START_SESSION':
      return {
        ...state,
        sessionState: 'active',
        queuePosition: 0,
        currentLeadState: null,
        results: [],
        sessionStartedAt: Date.now(),
        error: null,
      }

    case 'PAUSE':
      return { ...state, sessionState: 'paused' }

    case 'RESUME':
      return { ...state, sessionState: 'active' }

    case 'DIALING': {
      const result: OEXDialerLeadResult = {
        leadId: action.leadId,
        state: 'dialing',
        callStartedAt: Date.now(),
      }
      return {
        ...state,
        currentLeadState: 'dialing',
        results: [...state.results, result],
        error: null,
      }
    }

    case 'ON_CALL': {
      const results = [...state.results]
      const lastIdx = results.length - 1
      if (lastIdx >= 0) {
        results[lastIdx] = { ...results[lastIdx], state: 'on_call', callSid: action.callSid }
      }
      return { ...state, currentLeadState: 'on_call', results }
    }

    case 'CALL_ENDED': {
      const results = [...state.results]
      const lastIdx = results.length - 1
      if (lastIdx >= 0) {
        results[lastIdx] = { ...results[lastIdx], state: 'awaiting_disposition', callEndedAt: Date.now() }
      }
      return { ...state, currentLeadState: 'awaiting_disposition', results }
    }

    case 'DISPOSITION_CAPTURED': {
      const results = [...state.results]
      const lastIdx = results.length - 1
      if (lastIdx >= 0) {
        results[lastIdx] = {
          ...results[lastIdx],
          state: 'completed',
          disposition: action.disposition,
          callSid: action.callSid ?? results[lastIdx].callSid,
        }
      }
      return { ...state, currentLeadState: 'completed', results }
    }

    case 'ADVANCE': {
      const nextPos = state.queuePosition + 1
      return {
        ...state,
        queuePosition: nextPos,
        currentLeadState: null,
      }
    }

    case 'SKIP': {
      const results = [...state.results]
      // Check if the current lead already has a result entry (was dialing/on_call)
      const existingIdx = results.findIndex(r => r.leadId === action.leadId && r.state !== 'skipped')
      if (existingIdx >= 0) {
        results[existingIdx] = { ...results[existingIdx], state: 'skipped' }
      } else {
        results.push({ leadId: action.leadId, state: 'skipped' })
      }
      const nextPos = state.queuePosition + 1
      return {
        ...state,
        queuePosition: nextPos,
        currentLeadState: null,
        results,
      }
    }

    case 'END_SESSION':
      return { ...state, sessionState: 'idle', currentLeadState: null }

    case 'SESSION_COMPLETED':
      return { ...state, sessionState: 'completed', currentLeadState: null }

    case 'ERROR':
      return { ...state, error: action.error }

    default:
      return state
  }
}

// --- Hook ---

export function usePowerDialer(
  leads: OEXDialerLead[],
  options?: OEXDialerOptions,
): UsePowerDialerReturn {
  const voice = useVoice()
  const disposition = useDisposition()
  const [state, dispatch] = useReducer(dialerReducer, initialState)

  const lastDispositionRef = useRef<Disposition | undefined>(undefined)
  const sessionStateRef = useRef(state.sessionState)
  sessionStateRef.current = state.sessionState

  // Derive current lead
  const currentLead =
    state.sessionState !== 'idle' && state.queuePosition < leads.length
      ? leads[state.queuePosition]
      : null

  // --- Effect 1: Auto-dial on session start and advance ---
  useEffect(() => {
    if (
      state.sessionState === 'active' &&
      state.currentLeadState === null &&
      voice.deviceReady &&
      currentLead
    ) {
      voice.connect(currentLead.phoneNumber)
      dispatch({ type: 'DIALING', leadId: currentLead.id })
    }
  }, [state.sessionState, state.currentLeadState, voice.deviceReady, currentLead])

  // --- Effect 2: Track call state transitions ---
  useEffect(() => {
    if (
      state.currentLeadState === 'dialing' &&
      (voice.callState === 'open' || voice.callState === 'ringing')
    ) {
      dispatch({ type: 'ON_CALL', callSid: voice.callInfo?.callSid ?? undefined })
    }
    if (state.currentLeadState === 'on_call' && voice.callState === 'idle') {
      dispatch({ type: 'CALL_ENDED' })
    }
  }, [voice.callState, state.currentLeadState, voice.callInfo])

  // --- Effect 3a: Capture disposition when submitted ---
  useEffect(() => {
    if (state.currentLeadState !== 'awaiting_disposition' || !disposition.isSubmitted) return

    dispatch({
      type: 'DISPOSITION_CAPTURED',
      disposition: lastDispositionRef.current,
      callSid: disposition.lastCallSid ?? undefined,
    })
  }, [state.currentLeadState, disposition.isSubmitted])

  // --- Effect 3b: Auto-advance after disposition captured ---
  useEffect(() => {
    if (state.currentLeadState !== 'completed') return
    if (state.sessionState !== 'active') return

    const timer = setTimeout(() => {
      if (sessionStateRef.current === 'active') {
        dispatch({ type: 'ADVANCE' })
        disposition.reset()
      }
    }, options?.advanceDelayMs ?? 1500)

    return () => clearTimeout(timer)
  }, [state.currentLeadState, state.sessionState])

  // --- Effect 4: Detect session completion ---
  useEffect(() => {
    if (state.sessionState === 'active' && state.queuePosition >= leads.length && state.currentLeadState === null) {
      dispatch({ type: 'SESSION_COMPLETED' })
    }
  }, [state.sessionState, state.queuePosition, leads.length, state.currentLeadState])

  // --- Effect 5: Surface voice errors ---
  useEffect(() => {
    if (voice.error && state.sessionState !== 'idle') {
      dispatch({ type: 'ERROR', error: voice.error })
    }
  }, [voice.error, state.sessionState])

  // --- Session control ---

  const start = useCallback(() => {
    if (state.sessionState !== 'idle') return
    if (leads.length === 0) {
      dispatch({ type: 'START_SESSION' })
      dispatch({ type: 'SESSION_COMPLETED' })
      return
    }
    dispatch({ type: 'START_SESSION' })
  }, [state.sessionState, leads.length])

  const pause = useCallback(() => {
    if (state.sessionState !== 'active') return
    dispatch({ type: 'PAUSE' })
  }, [state.sessionState])

  const resume = useCallback(() => {
    if (state.sessionState !== 'paused') return
    dispatch({ type: 'RESUME' })
  }, [state.sessionState])

  const skip = useCallback(() => {
    if (state.sessionState === 'idle' || state.sessionState === 'completed') return
    if (!currentLead) return

    // If on an active call, disconnect first
    if (
      state.currentLeadState === 'on_call' ||
      state.currentLeadState === 'dialing'
    ) {
      voice.disconnect()
    }

    dispatch({ type: 'SKIP', leadId: currentLead.id })
    disposition.reset()
  }, [state.sessionState, state.currentLeadState, currentLead, voice.disconnect, disposition.reset])

  const endSession = useCallback(() => {
    if (state.sessionState === 'idle') return

    // Disconnect any active call
    if (
      state.currentLeadState === 'on_call' ||
      state.currentLeadState === 'dialing'
    ) {
      voice.disconnect()
    }

    dispatch({ type: 'END_SESSION' })
    disposition.reset()
  }, [state.sessionState, state.currentLeadState, voice.disconnect, disposition.reset])

  // --- Wrapped setDisposition ---

  const setDispositionWrapped = useCallback(
    async (disp: Disposition, notes?: string) => {
      lastDispositionRef.current = disp
      await disposition.setDisposition(disp, notes)
    },
    [disposition.setDisposition],
  )

  // --- Computed stats ---

  const stats = useMemo<OEXDialerSessionStats>(() => {
    const completed = state.results.filter(r => r.state === 'completed').length
    const skipped = state.results.filter(r => r.state === 'skipped').length
    const outcomes: Partial<Record<Disposition, number>> = {}
    for (const result of state.results) {
      if (result.disposition) {
        outcomes[result.disposition] = (outcomes[result.disposition] ?? 0) + 1
      }
    }
    return {
      totalLeads: leads.length,
      callsCompleted: completed,
      callsSkipped: skipped,
      callsRemaining: leads.length - state.queuePosition,
      outcomes,
      sessionStartedAt: state.sessionStartedAt,
      sessionDurationMs: state.sessionStartedAt ? Date.now() - state.sessionStartedAt : 0,
    }
  }, [state.results, state.queuePosition, state.sessionStartedAt, leads.length])

  // --- Aggregate error ---

  const error = state.error ?? voice.error ?? disposition.error ?? null

  return {
    // Session control
    start,
    pause,
    resume,
    skip,
    endSession,

    // Session state
    sessionState: state.sessionState,
    currentLead,
    queuePosition: state.queuePosition,
    stats,
    results: state.results,
    currentLeadState: state.currentLeadState,

    // Passthrough from useVoice
    callState: voice.callState,
    callInfo: voice.callInfo,
    deviceReady: voice.deviceReady,
    disconnect: voice.disconnect,
    sendDigits: voice.sendDigits,
    mute: voice.mute,
    toggleMute: voice.toggleMute,

    // Passthrough from useDisposition (wrapped)
    setDisposition: setDispositionWrapped,
    isDispositionSubmitting: disposition.isSubmitting,
    isDispositionSubmitted: disposition.isSubmitted,
    lastCallSid: disposition.lastCallSid,

    // Error
    error,
  }
}
