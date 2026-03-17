import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { usePreflight } from '../../src/hooks/usePreflight'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'

vi.spyOn(console, 'error').mockImplementation(() => {})

// Mock PreflightTest
const mockPreflightListeners: Record<string, Array<(...args: unknown[]) => void>> = {}
const mockPreflightStop = vi.fn()

vi.mock('@twilio/voice-sdk', () => {
  return {
    PreflightTest: vi.fn().mockImplementation(() => {
      // Clear listeners for new instance
      Object.keys(mockPreflightListeners).forEach((k) => delete mockPreflightListeners[k])
      return {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (!mockPreflightListeners[event]) mockPreflightListeners[event] = []
          mockPreflightListeners[event].push(handler)
        }),
        stop: mockPreflightStop,
      }
    }),
  }
})

function emitPreflightEvent(event: string, ...args: unknown[]) {
  mockPreflightListeners[event]?.forEach((h) => h(...args))
}

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

const mockFetchToken = vi.fn().mockResolvedValue({ token: 'preflight-token', identity: 'test-user', ttl_seconds: 3600 })

function createMockInternalContext(
  overrides?: Partial<OEXCommsInternalContextValue>,
): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: null },
    callRef: { current: null },
    apiClientRef: { current: null },
    tokenManagerRef: { current: { fetchToken: mockFetchToken } as unknown as import('../../src/services/token-manager').TokenManager },
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

describe('usePreflight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockPreflightListeners).forEach((k) => delete mockPreflightListeners[k])
    mockFetchToken.mockResolvedValue({ token: 'preflight-token', identity: 'test-user', ttl_seconds: 3600 })
  })

  it('initial status is idle', () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => usePreflight(), {
      wrapper: createWrapper(context, internal),
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.report).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('run() fetches token and creates PreflightTest', async () => {
    const { PreflightTest } = await import('@twilio/voice-sdk')
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => usePreflight(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.run()
    })

    expect(mockFetchToken).toHaveBeenCalled()
    expect(PreflightTest).toHaveBeenCalledWith('preflight-token', { fakeMicInput: true })
    expect(result.current.status).toBe('connecting')
  })

  it('status updates to connecting then connected', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => usePreflight(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.run()
    })

    expect(result.current.status).toBe('connecting')

    act(() => {
      emitPreflightEvent('connected')
    })

    expect(result.current.status).toBe('connected')
  })

  it('completed event produces OEXPreflightReport with mapped quality level', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => usePreflight(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.run()
    })

    act(() => {
      emitPreflightEvent('completed', {
        callQuality: 'Great',
        callSid: 'CA-preflight-123',
        selectedEdge: 'ashburn',
        edge: 'ashburn',
        networkTiming: {
          signaling: { start: 100, duration: 50, end: 150 },
          ice: { start: 150, duration: 30, end: 180 },
        },
        stats: {
          mos: { average: 4.1 },
          rtt: { average: 45 },
          jitter: { average: 3 },
        },
        warnings: [{ name: 'high-rtt' }],
      })
    })

    expect(result.current.status).toBe('completed')
    expect(result.current.report).toEqual({
      qualityLevel: 'great',
      averageMos: 4.1,
      averageRtt: 45,
      averageJitter: 3,
      networkTiming: {
        signaling: { start: 100, duration: 50, end: 150 },
        ice: { start: 150, duration: 30, end: 180 },
        dtls: undefined,
        peerConnection: undefined,
      },
      edge: 'ashburn',
      warnings: ['high-rtt'],
      callSid: 'CA-preflight-123',
    })
  })

  it('failed event sets error and status to failed', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => usePreflight(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.run()
    })

    act(() => {
      emitPreflightEvent('failed', { code: 31003, message: 'Connection failed' })
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toBe('Access forbidden')
  })

  it('stop() calls preflightTest.stop()', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => usePreflight(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.run()
    })

    act(() => {
      result.current.stop()
    })

    expect(mockPreflightStop).toHaveBeenCalled()
  })
})
