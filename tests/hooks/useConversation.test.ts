import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useConversation } from '../../src/hooks/useConversation'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'
import type { SmsMessageResponse, SendSmsResponse } from '../../src/types'

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

const mockPost = vi.fn()
const mockGet = vi.fn()

function createMockInternalContext(
  overrides?: Partial<OEXCommsInternalContextValue>,
): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: null },
    callRef: { current: null },
    apiClientRef: {
      current: { post: mockPost, get: mockGet } as unknown as import('../../src/services/api-client').ApiClient,
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

const targetNumber = '+15559876543'

const mockMessages: SmsMessageResponse[] = [
  {
    id: 'uuid-1',
    message_sid: 'SM001',
    direction: 'outbound',
    from_number: '+15551234567',
    to_number: targetNumber,
    body: 'Hello',
    status: 'delivered',
    error_code: null,
    error_message: null,
    num_segments: 1,
    num_media: 0,
    media_urls: null,
    date_sent: '2026-03-17T10:00:00Z',
    created_at: '2026-03-17T10:00:00Z',
    updated_at: '2026-03-17T10:00:00Z',
  },
  {
    id: 'uuid-2',
    message_sid: 'SM002',
    direction: 'inbound',
    from_number: targetNumber,
    to_number: '+15551234567',
    body: 'Hi there',
    status: 'received',
    error_code: null,
    error_message: null,
    num_segments: 1,
    num_media: 0,
    media_urls: null,
    date_sent: '2026-03-17T11:00:00Z',
    created_at: '2026-03-17T11:00:00Z',
    updated_at: '2026-03-17T11:00:00Z',
  },
  {
    id: 'uuid-3',
    message_sid: 'SM003',
    direction: 'outbound',
    from_number: '+15551234567',
    to_number: '+15550000000',
    body: 'Wrong thread',
    status: 'delivered',
    error_code: null,
    error_message: null,
    num_segments: 1,
    num_media: 0,
    media_urls: null,
    date_sent: '2026-03-17T09:00:00Z',
    created_at: '2026-03-17T09:00:00Z',
    updated_at: '2026-03-17T09:00:00Z',
  },
]

const mockSendResponse: SendSmsResponse = {
  message_sid: 'SM004',
  status: 'queued',
  direction: 'outbound',
  from_number: '+15551234567',
  to: targetNumber,
}

const mockFullMessage: SmsMessageResponse = {
  id: 'uuid-4',
  message_sid: 'SM004',
  direction: 'outbound',
  from_number: '+15551234567',
  to_number: targetNumber,
  body: 'New message',
  status: 'queued',
  error_code: null,
  error_message: null,
  num_segments: 1,
  num_media: 0,
  media_urls: null,
  date_sent: '2026-03-17T12:00:00Z',
  created_at: '2026-03-17T12:00:00Z',
  updated_at: '2026-03-17T12:00:00Z',
}

describe('useConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation((path: string) => {
      if (path.startsWith('/api/sms/SM004')) return Promise.resolve(mockFullMessage)
      return Promise.resolve(mockMessages)
    })
    mockPost.mockResolvedValue(mockSendResponse)
  })

  it('fetches messages on mount and filters by phone number', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useConversation(targetNumber), {
      wrapper: createWrapper(context, internal),
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0)
    })

    expect(mockGet).toHaveBeenCalledWith('/api/sms', { limit: '200' })
  })

  it('returns only messages matching the conversation phone number', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useConversation(targetNumber), {
      wrapper: createWrapper(context, internal),
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0)
    })

    // Should include SM001 (to: targetNumber) and SM002 (from: targetNumber), exclude SM003
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.every((m) => m.from === targetNumber || m.to === targetNumber)).toBe(true)
  })

  it('messages are sorted chronologically (oldest first)', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useConversation(targetNumber), {
      wrapper: createWrapper(context, internal),
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0)
    })

    const times = result.current.messages.map((m) => new Date(m.createdAt).getTime())
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1])
    }
  })

  it('send() calls POST /api/sms with to set to the conversation phone number', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useConversation(targetNumber), {
      wrapper: createWrapper(context, internal),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.send('New message')
    })

    expect(mockPost).toHaveBeenCalledWith('/api/sms', {
      to: targetNumber,
      body: 'New message',
      media_url: null,
      company_campaign_id: null,
      company_campaign_lead_id: null,
    })
  })

  it('send() appends the new message to the thread', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useConversation(targetNumber), {
      wrapper: createWrapper(context, internal),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const initialCount = result.current.messages.length

    await act(async () => {
      await result.current.send('New message')
    })

    expect(result.current.messages.length).toBe(initialCount + 1)
    expect(result.current.messages[result.current.messages.length - 1].messageSid).toBe('SM004')
  })

  it('refresh() re-fetches and re-filters the thread', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useConversation(targetNumber), {
      wrapper: createWrapper(context, internal),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockGet.mockClear()

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockGet).toHaveBeenCalledWith('/api/sms', { limit: '200' })
    expect(result.current.messages).toHaveLength(2)
  })

  it('resets messages when phoneNumber prop changes', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()

    const { result, rerender } = renderHook(
      ({ phone }) => useConversation(phone),
      {
        wrapper: createWrapper(context, internal),
        initialProps: { phone: targetNumber },
      },
    )

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0)
    })

    expect(result.current.messages).toHaveLength(2)

    rerender({ phone: '+15550000000' })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should only have SM003 which matches +15550000000
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].messageSid).toBe('SM003')
    expect(result.current.phoneNumber).toBe('+15550000000')
  })
})
