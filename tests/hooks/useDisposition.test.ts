import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useDisposition } from '../../src/hooks/useDisposition'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'
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

const mockPost = vi.fn().mockResolvedValue({
  call_sid: 'CA123',
  business_disposition: 'qualified',
  updated_at: '2026-03-17T00:00:00Z',
})

function createMockInternalContext(
  overrides?: Partial<OEXCommsInternalContextValue>,
): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: null },
    callRef: { current: null },
    apiClientRef: { current: { post: mockPost } as unknown as import('../../src/services/api-client').ApiClient },
    tokenManagerRef: { current: null },
    dispatch: vi.fn(),
    lastCallSidRef: { current: 'CA123' },
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

describe('useDisposition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockResolvedValue({
      call_sid: 'CA123',
      business_disposition: 'qualified',
      updated_at: '2026-03-17T00:00:00Z',
    })
  })

  it('lastCallSid reflects the last completed call SID', () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useDisposition(), {
      wrapper: createWrapper(context, internal),
    })

    expect(result.current.lastCallSid).toBe('CA123')
  })

  it('setDisposition calls POST /api/voice/sessions/{sid}/disposition with correct body', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useDisposition(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.setDisposition('qualified', 'Great lead')
    })

    expect(mockPost).toHaveBeenCalledWith(
      '/api/voice/sessions/CA123/disposition',
      { disposition: 'qualified', notes: 'Great lead' },
    )
    expect(result.current.isSubmitted).toBe(true)
  })

  it('setDisposition rejects invalid disposition values', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useDisposition(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.setDisposition('invalid_value' as never)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toContain('Invalid disposition')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('setDisposition sets error when no call SID available', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext({
      lastCallSidRef: { current: null },
    })
    const { result } = renderHook(() => useDisposition(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.setDisposition('qualified')
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toContain('No call SID')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('isSubmitting is true during API call, false after', async () => {
    let resolvePost: (value: unknown) => void
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useDisposition(), {
      wrapper: createWrapper(context, internal),
    })

    let promise: Promise<void>
    act(() => {
      promise = result.current.setDisposition('qualified')
    })

    expect(result.current.isSubmitting).toBe(true)

    await act(async () => {
      resolvePost!({ call_sid: 'CA123', business_disposition: 'qualified', updated_at: '2026-03-17T00:00:00Z' })
      await promise!
    })

    expect(result.current.isSubmitting).toBe(false)
  })

  it('reset() clears submission state', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useDisposition(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.setDisposition('qualified')
    })

    expect(result.current.isSubmitted).toBe(true)

    act(() => {
      result.current.reset()
    })

    expect(result.current.isSubmitted).toBe(false)
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
