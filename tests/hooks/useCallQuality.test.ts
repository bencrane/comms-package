import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, useState, type ReactNode } from 'react'
import { useCallQuality } from '../../src/hooks/useCallQuality'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue, OEXCallState } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'

vi.spyOn(console, 'error').mockImplementation(() => {})

function createMockContext(overrides?: Partial<OEXCommsContextValue>): OEXCommsContextValue {
  return {
    deviceState: 'registered',
    deviceReady: true,
    identity: 'test-user',
    callState: 'idle',
    callInfo: null,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendDigits: vi.fn(),
    mute: vi.fn(),
    toggleMute: vi.fn(),
    acceptIncoming: vi.fn(),
    rejectIncoming: vi.fn(),
    ...overrides,
  }
}

function createMockCall() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(handler)
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler)
      }
    }),
    _emit: (event: string, ...args: unknown[]) => {
      listeners[event]?.forEach((h) => h(...args))
    },
  }
}

function createMockInternalContext(
  overrides?: Partial<OEXCommsInternalContextValue>,
): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: null },
    callRef: { current: null },
    apiClientRef: { current: null },
    tokenManagerRef: { current: null },
    dispatch: vi.fn(),
    lastCallSidRef: { current: null },
    ...overrides,
  }
}

function createWrapper(
  context: OEXCommsContextValue,
  internal: OEXCommsInternalContextValue,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      OEXCommsInternalContext.Provider,
      { value: internal },
      createElement(OEXCommsContext.Provider, { value: context }, children),
    )
  }
}

describe('useCallQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null metrics when no call is active', () => {
    const context = createMockContext({ callState: 'idle' })
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useCallQuality(), {
      wrapper: createWrapper(context, internal),
    })

    expect(result.current.metrics).toBeNull()
    expect(result.current.warnings).toEqual([])
  })

  it('returns metrics from sample event when call is open', () => {
    const mockCall = createMockCall()
    const context = createMockContext({ callState: 'open' })
    const internal = createMockInternalContext({
      callRef: { current: mockCall as unknown as import('@twilio/voice-sdk').Call },
    })
    const { result } = renderHook(() => useCallQuality(), {
      wrapper: createWrapper(context, internal),
    })

    act(() => {
      mockCall._emit('sample', {
        mos: 4.3,
        rtt: 50,
        jitter: 5,
        packetsLostFraction: 0.01,
        audioInputLevel: 1000,
        audioOutputLevel: 2000,
        codecName: 'opus',
        timestamp: 1234567890,
      })
    })

    expect(result.current.metrics).toEqual({
      mos: 4.3,
      rtt: 50,
      jitter: 5,
      packetLoss: 0.01,
      qualityLevel: 'excellent',
      audioInputLevel: 1000,
      audioOutputLevel: 2000,
      codec: 'opus',
      timestamp: 1234567890,
    })
  })

  it('maps MOS to correct quality level', () => {
    const mockCall = createMockCall()
    const context = createMockContext({ callState: 'open' })
    const internal = createMockInternalContext({
      callRef: { current: mockCall as unknown as import('@twilio/voice-sdk').Call },
    })
    const { result } = renderHook(() => useCallQuality(), {
      wrapper: createWrapper(context, internal),
    })

    const baseSample = {
      rtt: 50,
      jitter: 5,
      packetsLostFraction: 0.01,
      audioInputLevel: 1000,
      audioOutputLevel: 2000,
      codecName: 'opus',
      timestamp: 1234567890,
    }

    // Test excellent (>= 4.2)
    act(() => { mockCall._emit('sample', { ...baseSample, mos: 4.5 }) })
    expect(result.current.metrics!.qualityLevel).toBe('excellent')

    // Test great (>= 4.0)
    act(() => { mockCall._emit('sample', { ...baseSample, mos: 4.1 }) })
    expect(result.current.metrics!.qualityLevel).toBe('great')

    // Test good (>= 3.6)
    act(() => { mockCall._emit('sample', { ...baseSample, mos: 3.8 }) })
    expect(result.current.metrics!.qualityLevel).toBe('good')

    // Test fair (>= 3.1)
    act(() => { mockCall._emit('sample', { ...baseSample, mos: 3.2 }) })
    expect(result.current.metrics!.qualityLevel).toBe('fair')

    // Test degraded (< 3.1)
    act(() => { mockCall._emit('sample', { ...baseSample, mos: 2.5 }) })
    expect(result.current.metrics!.qualityLevel).toBe('degraded')
  })

  it('adds warnings from warning event', () => {
    const mockCall = createMockCall()
    const context = createMockContext({ callState: 'open' })
    const internal = createMockInternalContext({
      callRef: { current: mockCall as unknown as import('@twilio/voice-sdk').Call },
    })
    const { result } = renderHook(() => useCallQuality(), {
      wrapper: createWrapper(context, internal),
    })

    act(() => {
      mockCall._emit('warning', 'high-rtt', { value: 500 })
    })

    expect(result.current.warnings).toEqual([{ name: 'high-rtt', value: 500 }])
  })

  it('removes warnings from warningCleared event', () => {
    const mockCall = createMockCall()
    const context = createMockContext({ callState: 'open' })
    const internal = createMockInternalContext({
      callRef: { current: mockCall as unknown as import('@twilio/voice-sdk').Call },
    })
    const { result } = renderHook(() => useCallQuality(), {
      wrapper: createWrapper(context, internal),
    })

    act(() => {
      mockCall._emit('warning', 'high-rtt', { value: 500 })
      mockCall._emit('warning', 'high-jitter', { value: 100 })
    })

    expect(result.current.warnings).toHaveLength(2)

    act(() => {
      mockCall._emit('warning-cleared', 'high-rtt')
    })

    expect(result.current.warnings).toEqual([{ name: 'high-jitter', value: 100 }])
  })

  it('resets metrics to null when call ends', () => {
    const mockCall = createMockCall()

    // Use a mutable ref to allow changing callState during test
    let callState: OEXCallState = 'open'
    let callRefCurrent: unknown = mockCall

    const { result, rerender } = renderHook(() => useCallQuality(), {
      wrapper: ({ children }: { children: ReactNode }) => {
        const ctx = createMockContext({ callState })
        const internal = createMockInternalContext({
          callRef: { current: callRefCurrent as import('@twilio/voice-sdk').Call | null },
        })
        return createElement(
          OEXCommsInternalContext.Provider,
          { value: internal },
          createElement(OEXCommsContext.Provider, { value: ctx }, children),
        )
      },
    })

    // Emit a sample while call is open
    act(() => {
      mockCall._emit('sample', {
        mos: 4.3,
        rtt: 50,
        jitter: 5,
        packetsLostFraction: 0.01,
        audioInputLevel: 1000,
        audioOutputLevel: 2000,
        codecName: 'opus',
        timestamp: 1234567890,
      })
    })

    expect(result.current.metrics).not.toBeNull()

    // Simulate call ending
    callState = 'idle'
    callRefCurrent = null
    rerender()

    expect(result.current.metrics).toBeNull()
    expect(result.current.warnings).toEqual([])
  })
})
