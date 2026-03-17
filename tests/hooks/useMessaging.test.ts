import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useMessaging } from '../../src/hooks/useMessaging'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'
import type { SendSmsResponse, SmsMessageResponse } from '../../src/types'

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

const mockSmsResponse: SmsMessageResponse = {
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
}

const mockSendResponse: SendSmsResponse = {
  message_sid: 'SM123',
  status: 'queued',
  direction: 'outbound',
  from_number: '+15551234567',
  to: '+15559876543',
}

describe('useMessaging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockResolvedValue(mockSendResponse)
    mockGet.mockResolvedValue(mockSmsResponse)
  })

  it('sendMessage calls POST /api/sms with correct request body', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.sendMessage('+15559876543', 'Hello')
    })

    expect(mockPost).toHaveBeenCalledWith('/api/sms', {
      to: '+15559876543',
      body: 'Hello',
      from_number: null,
      messaging_service_sid: null,
      media_url: null,
      company_campaign_id: null,
      company_campaign_lead_id: null,
    })
  })

  it('sendMessage maps to, body, and options to snake_case request fields', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.sendMessage('+15559876543', 'Hello', {
        fromNumber: '+15551234567',
        messagingServiceSid: 'MG123',
        mediaUrls: ['https://example.com/image.jpg'],
        campaignId: 'camp-1',
        campaignLeadId: 'lead-1',
      })
    })

    expect(mockPost).toHaveBeenCalledWith('/api/sms', {
      to: '+15559876543',
      body: 'Hello',
      from_number: '+15551234567',
      messaging_service_sid: 'MG123',
      media_url: ['https://example.com/image.jpg'],
      company_campaign_id: 'camp-1',
      company_campaign_lead_id: 'lead-1',
    })
  })

  it('sendMessage returns mapped OEXMessage on success', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    let message: unknown
    await act(async () => {
      message = await result.current.sendMessage('+15559876543', 'Hello')
    })

    expect(message).toEqual({
      id: 'uuid-1',
      messageSid: 'SM123',
      direction: 'outbound',
      from: '+15551234567',
      to: '+15559876543',
      body: 'Hello',
      status: 'queued',
      errorCode: null,
      errorMessage: null,
      segments: 1,
      mediaCount: 0,
      mediaUrls: null,
      sentAt: '2026-03-17T00:00:00Z',
      createdAt: '2026-03-17T00:00:00Z',
      updatedAt: '2026-03-17T00:00:00Z',
    })
  })

  it('sendMessage sets error on API failure', async () => {
    const apiError = { code: 400, message: 'Bad request', recoverable: false }
    mockPost.mockRejectedValue(apiError)

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    let message: unknown
    await act(async () => {
      message = await result.current.sendMessage('+15559876543', 'Hello')
    })

    expect(message).toBeNull()
    expect(result.current.error).toEqual(apiError)
  })

  it('fetchMessages calls GET /api/sms with query params', async () => {
    mockGet.mockResolvedValue([mockSmsResponse])

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchMessages({
        direction: 'outbound',
        status: 'delivered',
        limit: 25,
        offset: 10,
      })
    })

    expect(mockGet).toHaveBeenCalledWith('/api/sms', {
      direction: 'outbound',
      status: 'delivered',
      limit: '25',
      offset: '10',
    })
  })

  it('fetchMessages maps response array to OEXMessage[]', async () => {
    mockGet.mockResolvedValue([mockSmsResponse])

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchMessages()
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].messageSid).toBe('SM123')
    expect(result.current.messages[0].from).toBe('+15551234567')
    expect(result.current.messages[0].to).toBe('+15559876543')
  })

  it('refreshMessages re-fetches with last used params', async () => {
    mockGet.mockResolvedValue([mockSmsResponse])

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchMessages({ direction: 'inbound', limit: 10 })
    })

    mockGet.mockClear()

    await act(async () => {
      await result.current.refreshMessages()
    })

    expect(mockGet).toHaveBeenCalledWith('/api/sms', {
      direction: 'inbound',
      limit: '10',
    })
  })

  it('isSending is true during send, false after', async () => {
    let resolvePost: (value: unknown) => void
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useMessaging(), {
      wrapper: createWrapper(context, internal),
    })

    let promise: Promise<unknown>
    act(() => {
      promise = result.current.sendMessage('+15559876543', 'Hello')
    })

    expect(result.current.isSending).toBe(true)

    await act(async () => {
      resolvePost!(mockSendResponse)
      await promise!
    })

    expect(result.current.isSending).toBe(false)
  })
})
