import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { UseVoiceReturn } from '../../src/hooks/useVoice'
import type { UseDispositionReturn } from '../../src/hooks/useDisposition'
import type { OEXDialerLead } from '../../src/types'

// Mock useVoice and useDisposition at the module level
const mockVoice: UseVoiceReturn = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  sendDigits: vi.fn(),
  mute: vi.fn(),
  toggleMute: vi.fn(),
  acceptIncoming: vi.fn(),
  rejectIncoming: vi.fn(),
  callInfo: null,
  callState: 'idle',
  deviceReady: true,
  error: null,
}

const mockDisposition: UseDispositionReturn = {
  setDisposition: vi.fn().mockResolvedValue(undefined),
  lastCallSid: null,
  isSubmitting: false,
  isSubmitted: false,
  error: null,
  reset: vi.fn(),
}

vi.mock('../../src/hooks/useVoice', () => ({
  useVoice: vi.fn(() => mockVoice),
}))

vi.mock('../../src/hooks/useDisposition', () => ({
  useDisposition: vi.fn(() => mockDisposition),
}))

// Import after mocks are set up
import { usePowerDialer } from '../../src/hooks/usePowerDialer'
import { useVoice } from '../../src/hooks/useVoice'
import { useDisposition } from '../../src/hooks/useDisposition'

const testLeads: OEXDialerLead[] = [
  { id: 'lead-1', phoneNumber: '+15551001001', name: 'Alice' },
  { id: 'lead-2', phoneNumber: '+15551001002', name: 'Bob' },
  { id: 'lead-3', phoneNumber: '+15551001003', name: 'Charlie' },
]

function resetMockVoice(overrides?: Partial<UseVoiceReturn>) {
  Object.assign(mockVoice, {
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendDigits: vi.fn(),
    mute: vi.fn(),
    toggleMute: vi.fn(),
    acceptIncoming: vi.fn(),
    rejectIncoming: vi.fn(),
    callInfo: null,
    callState: 'idle',
    deviceReady: true,
    error: null,
    ...overrides,
  })
}

function resetMockDisposition(overrides?: Partial<UseDispositionReturn>) {
  Object.assign(mockDisposition, {
    setDisposition: vi.fn().mockResolvedValue(undefined),
    lastCallSid: null,
    isSubmitting: false,
    isSubmitted: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  })
}

describe('usePowerDialer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetMockVoice()
    resetMockDisposition()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initial state is idle', () => {
    const { result } = renderHook(() => usePowerDialer(testLeads))

    expect(result.current.sessionState).toBe('idle')
    expect(result.current.currentLead).toBeNull()
    expect(result.current.queuePosition).toBe(0)
    expect(result.current.stats.totalLeads).toBe(3)
    expect(result.current.currentLeadState).toBeNull()
  })

  it('start() begins session and calls first lead', () => {
    const { result } = renderHook(() => usePowerDialer(testLeads))

    act(() => {
      result.current.start()
    })

    expect(result.current.sessionState).toBe('active')
    expect(result.current.currentLead).toEqual(testLeads[0])
    expect(mockVoice.connect).toHaveBeenCalledWith('+15551001001')
    expect(result.current.currentLeadState).toBe('dialing')
  })

  it('call state transitions update currentLeadState', () => {
    const { result, rerender } = renderHook(() => usePowerDialer(testLeads))

    // Start session
    act(() => {
      result.current.start()
    })
    expect(result.current.currentLeadState).toBe('dialing')

    // Simulate ringing
    mockVoice.callState = 'ringing'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()

    expect(result.current.currentLeadState).toBe('on_call')

    // Simulate call ends
    mockVoice.callState = 'idle'
    mockVoice.callInfo = null
    rerender()

    expect(result.current.currentLeadState).toBe('awaiting_disposition')
  })

  it('blocks advancement until disposition is submitted', () => {
    const { result, rerender } = renderHook(() => usePowerDialer(testLeads))

    // Start → dial → on_call → call_ended
    act(() => { result.current.start() })
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()
    mockVoice.callState = 'idle'
    mockVoice.callInfo = null
    rerender()

    expect(result.current.currentLeadState).toBe('awaiting_disposition')
    expect(result.current.queuePosition).toBe(0)

    // Disposition NOT submitted — advance timer, nothing should change
    act(() => { vi.advanceTimersByTime(3000) })

    expect(result.current.queuePosition).toBe(0)
    expect(result.current.currentLeadState).toBe('awaiting_disposition')
  })

  it('auto-advances after disposition + delay', async () => {
    const advanceDelayMs = 500
    const { result, rerender } = renderHook(() => usePowerDialer(testLeads, { advanceDelayMs }))

    // Start → dial → on_call → call_ended
    act(() => { result.current.start() })
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()
    mockVoice.callState = 'idle'
    mockVoice.callInfo = null
    rerender()

    expect(result.current.currentLeadState).toBe('awaiting_disposition')

    // Submit disposition
    await act(async () => {
      await result.current.setDisposition('qualified', 'Good lead')
    })

    // Simulate isSubmitted becoming true
    mockDisposition.isSubmitted = true
    mockDisposition.lastCallSid = 'CA001'
    rerender()

    expect(result.current.currentLeadState).toBe('completed')

    // Advance timer
    act(() => { vi.advanceTimersByTime(advanceDelayMs) })

    // Should have advanced to lead 2
    expect(result.current.queuePosition).toBe(1)
    expect(mockVoice.connect).toHaveBeenCalledWith('+15551001002')
  })

  it('pause() stops auto-advancing but does not disconnect', async () => {
    const { result, rerender } = renderHook(() => usePowerDialer(testLeads, { advanceDelayMs: 500 }))

    // Start → dial → on_call → call_ended
    act(() => { result.current.start() })
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()
    mockVoice.callState = 'idle'
    mockVoice.callInfo = null
    rerender()

    // Pause
    act(() => { result.current.pause() })
    expect(result.current.sessionState).toBe('paused')

    // Submit disposition while paused
    await act(async () => {
      await result.current.setDisposition('no_answer')
    })
    mockDisposition.isSubmitted = true
    mockDisposition.lastCallSid = 'CA001'
    rerender()

    // Disposition captured but should NOT advance
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.queuePosition).toBe(0)

    // disconnect should NOT have been called by pause
    expect(mockVoice.disconnect).not.toHaveBeenCalled()
  })

  it('skip() moves to next lead without calling', () => {
    const { result } = renderHook(() => usePowerDialer(testLeads))

    act(() => { result.current.start() })

    // Skip first lead (which is currently dialing)
    act(() => { result.current.skip() })

    expect(result.current.queuePosition).toBe(1)
    expect(result.current.results[0]?.state).toBe('skipped')
    // connect should be called for lead 2
    expect(mockVoice.connect).toHaveBeenCalledWith('+15551001002')
  })

  it('skip() during active call disconnects first', () => {
    const { result, rerender } = renderHook(() => usePowerDialer(testLeads))

    act(() => { result.current.start() })
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()

    expect(result.current.currentLeadState).toBe('on_call')

    act(() => { result.current.skip() })

    expect(mockVoice.disconnect).toHaveBeenCalled()
    expect(result.current.queuePosition).toBe(1)
  })

  it('endSession() terminates session and disconnects active call', () => {
    const { result, rerender } = renderHook(() => usePowerDialer(testLeads))

    act(() => { result.current.start() })
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()

    act(() => { result.current.endSession() })

    expect(result.current.sessionState).toBe('idle')
    expect(mockVoice.disconnect).toHaveBeenCalled()
  })

  it('session completes when queue exhausted', async () => {
    const singleLead: OEXDialerLead[] = [{ id: 'lead-1', phoneNumber: '+15551001001' }]
    const { result, rerender } = renderHook(() => usePowerDialer(singleLead, { advanceDelayMs: 100 }))

    // Start → dial → on_call → call_ended → disposition → advance
    act(() => { result.current.start() })
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()
    mockVoice.callState = 'idle'
    mockVoice.callInfo = null
    rerender()

    await act(async () => {
      await result.current.setDisposition('meeting_booked')
    })
    mockDisposition.isSubmitted = true
    mockDisposition.lastCallSid = 'CA001'
    rerender()

    act(() => { vi.advanceTimersByTime(100) })

    expect(result.current.sessionState).toBe('completed')
  })

  it('stats track outcomes correctly', async () => {
    const twoLeads: OEXDialerLead[] = [
      { id: 'lead-1', phoneNumber: '+15551001001' },
      { id: 'lead-2', phoneNumber: '+15551001002' },
    ]
    const { result, rerender } = renderHook(() => usePowerDialer(twoLeads, { advanceDelayMs: 100 }))

    // Lead 1: qualified
    act(() => { result.current.start() })
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001001', isMuted: false, callSid: 'CA001' }
    rerender()
    mockVoice.callState = 'idle'
    mockVoice.callInfo = null
    rerender()

    await act(async () => { await result.current.setDisposition('qualified') })
    mockDisposition.isSubmitted = true
    mockDisposition.lastCallSid = 'CA001'
    rerender()

    act(() => { vi.advanceTimersByTime(100) })

    // Reset disposition mock for lead 2
    mockDisposition.isSubmitted = false
    mockDisposition.lastCallSid = null
    rerender()

    // Lead 2: no_answer
    mockVoice.callState = 'open'
    mockVoice.callInfo = { direction: 'outbound', from: 'client:test', to: '+15551001002', isMuted: false, callSid: 'CA002' }
    rerender()
    mockVoice.callState = 'idle'
    mockVoice.callInfo = null
    rerender()

    await act(async () => { await result.current.setDisposition('no_answer') })
    mockDisposition.isSubmitted = true
    mockDisposition.lastCallSid = 'CA002'
    rerender()

    expect(result.current.stats.callsCompleted).toBe(2)
    expect(result.current.stats.outcomes).toEqual({ qualified: 1, no_answer: 1 })
  })

  it('start() with empty leads array completes immediately', () => {
    const { result } = renderHook(() => usePowerDialer([]))

    act(() => { result.current.start() })

    expect(result.current.sessionState).toBe('completed')
    expect(mockVoice.connect).not.toHaveBeenCalled()
  })
})
