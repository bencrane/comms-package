import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useCallActions } from '../../src/hooks/useCallActions'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue, OEXCallState } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'

vi.spyOn(console, 'error').mockImplementation(() => {})

function createMockContext(overrides?: Partial<OEXCommsContextValue>): OEXCommsContextValue {
  return {
    deviceState: 'registered',
    deviceReady: true,
    identity: 'test-user',
    callState: 'open',
    callInfo: {
      direction: 'outbound',
      from: 'test-user',
      to: '+15551234567',
      isMuted: false,
      callSid: 'CA456',
    },
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

const mockPost = vi.fn().mockResolvedValue({ status: 'ok' })

function createMockInternalContext(
  overrides?: Partial<OEXCommsInternalContextValue>,
): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: null },
    callRef: { current: null },
    apiClientRef: { current: { post: mockPost } as unknown as import('../../src/services/api-client').ApiClient },
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

describe('useCallActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockResolvedValue({ status: 'ok' })
  })

  it('hold() calls POST /api/voice/sessions/{sid}/action with { action: hold }', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useCallActions(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.hold()
    })

    expect(mockPost).toHaveBeenCalledWith(
      '/api/voice/sessions/CA456/action',
      { action: 'hold' },
    )
  })

  it('unhold() calls POST /api/voice/sessions/{sid}/action with { action: unhold }', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useCallActions(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.unhold()
    })

    expect(mockPost).toHaveBeenCalledWith(
      '/api/voice/sessions/CA456/action',
      { action: 'unhold' },
    )
  })

  it('hold() sets isOnHold to true on success', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useCallActions(), {
      wrapper: createWrapper(context, internal),
    })

    expect(result.current.isOnHold).toBe(false)

    await act(async () => {
      await result.current.hold()
    })

    expect(result.current.isOnHold).toBe(true)
  })

  it('hold() sets error on API failure', async () => {
    mockPost.mockRejectedValueOnce({ code: 500, message: 'Server error', recoverable: false })

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useCallActions(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.hold()
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toBe('Server error')
    expect(result.current.isOnHold).toBe(false)
  })

  it('isOnHold resets to false when call ends', async () => {
    let callState: OEXCallState = 'open'

    const { result, rerender } = renderHook(() => useCallActions(), {
      wrapper: ({ children }: { children: ReactNode }) => {
        const ctx = createMockContext({ callState })
        const internal = createMockInternalContext()
        return createElement(
          OEXCommsInternalContext.Provider,
          { value: internal },
          createElement(OEXCommsContext.Provider, { value: ctx }, children),
        )
      },
    })

    await act(async () => {
      await result.current.hold()
    })

    expect(result.current.isOnHold).toBe(true)

    // Simulate call ending
    callState = 'idle'
    rerender()

    expect(result.current.isOnHold).toBe(false)
  })
})
