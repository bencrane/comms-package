import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useMessageStatus } from '../../src/hooks/useMessageStatus'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'
import type { SmsMessageResponse } from '../../src/types'

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

const mockGet = vi.fn()

function createMockInternalContext(
  overrides?: Partial<OEXCommsInternalContextValue>,
): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: null },
    callRef: { current: null },
    apiClientRef: {
      current: { get: mockGet } as unknown as import('../../src/services/api-client').ApiClient,
    },
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

function createMockSmsResponse(overrides?: Partial<SmsMessageResponse>): SmsMessageResponse {
  return {
    id: 'uuid-1',
    message_sid: 'SM123',
    direction: 'outbound',
    from_number: '+15551234567',
    to_number: '+15559876543',
    body: 'Hello',
    status: 'queued',
    error_code: null,
    error_message: null,
    num_segments: 1,
    num_media: 0,
    media_urls: null,
    date_sent: '2026-03-17T00:00:00Z',
    created_at: '2026-03-17T00:00:00Z',
    updated_at: '2026-03-17T00:00:00Z',
    ...overrides,
  }
}

describe('useMessageStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null message and status when messageSid is null', () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessageStatus(null), {
      wrapper: createWrapper(context, internal),
    })

    expect(result.current.message).toBeNull()
    expect(result.current.status).toBeNull()
    expect(result.current.isTerminal).toBe(false)
    expect(result.current.isPolling).toBe(false)
  })

  it('refresh() fetches message and maps to OEXMessage', async () => {
    mockGet.mockResolvedValue(createMockSmsResponse({ status: 'sent' }))

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessageStatus('SM123'), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockGet).toHaveBeenCalledWith('/api/sms/SM123')
    expect(result.current.message).not.toBeNull()
    expect(result.current.message!.messageSid).toBe('SM123')
    expect(result.current.status).toBe('sent')
  })

  it('startPolling() fetches immediately and at intervals', async () => {
    mockGet.mockResolvedValue(createMockSmsResponse({ status: 'sending' }))

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessageStatus('SM123', { intervalMs: 1000 }), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      result.current.startPolling()
    })

    // Immediate fetch on start
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockGet).toHaveBeenCalledTimes(1)

    // Interval fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(mockGet).toHaveBeenCalledTimes(2)

    // Another interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(mockGet).toHaveBeenCalledTimes(3)
  })

  it('polling stops when status reaches terminal state (delivered)', async () => {
    mockGet.mockResolvedValue(createMockSmsResponse({ status: 'delivered' }))

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessageStatus('SM123', { intervalMs: 1000 }), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      result.current.startPolling()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.status).toBe('delivered')
    expect(result.current.isTerminal).toBe(true)
    expect(result.current.isPolling).toBe(false)
  })

  it('polling stops when status reaches terminal state (failed)', async () => {
    mockGet.mockResolvedValue(createMockSmsResponse({ status: 'failed', error_code: 30001, error_message: 'Queue overflow' }))

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessageStatus('SM123', { intervalMs: 1000 }), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      result.current.startPolling()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.isTerminal).toBe(true)
    expect(result.current.isPolling).toBe(false)
  })

  it('stopPolling() clears the interval', async () => {
    mockGet.mockResolvedValue(createMockSmsResponse({ status: 'sending' }))

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessageStatus('SM123', { intervalMs: 1000 }), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      result.current.startPolling()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockGet).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.stopPolling()
    })

    // Advance time — no more fetches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('status resets when messageSid changes', async () => {
    mockGet.mockResolvedValue(createMockSmsResponse({ status: 'sent' }))

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result, rerender } = renderHook(
      ({ sid }) => useMessageStatus(sid),
      {
        wrapper: createWrapper(context, internal),
        initialProps: { sid: 'SM123' as string | null },
      },
    )

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.status).toBe('sent')

    rerender({ sid: 'SM456' })

    expect(result.current.message).toBeNull()
    expect(result.current.status).toBeNull()
  })
})
