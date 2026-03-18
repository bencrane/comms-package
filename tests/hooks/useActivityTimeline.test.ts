import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useActivityTimeline } from '../../src/hooks/useActivityTimeline'
import { OEXCommsContext, OEXCommsInternalContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'
import type { OEXCommsInternalContextValue } from '../../src/providers/OEXCommsProvider'
import type { TimelineApiResponse } from '../../src/types'

vi.spyOn(console, 'error').mockImplementation(() => {})

function createMockContext(): OEXCommsContextValue {
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
  }
}

const mockGet = vi.fn()

function createMockInternalContext(): OEXCommsInternalContextValue {
  return {
    deviceRef: { current: null },
    callRef: { current: null },
    apiClientRef: {
      current: { get: mockGet } as unknown as import('../../src/services/api-client').ApiClient,
    },
    tokenManagerRef: { current: null },
    dispatch: vi.fn(),
    lastCallSidRef: { current: null },
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

const mockApiEntry = {
  id: 'entry-1',
  source_table: 'voice_sessions',
  timestamp: '2026-03-17T14:30:00Z',
  channel: 'voice',
  event_type: 'call_completed',
  direction: 'outbound',
  summary: 'Call to +15551234567 (45s)',
  lead_id: 'lead-1',
  campaign_id: 'camp-1',
  company_id: 'comp-1',
  metadata: { duration: 45 },
}

function makeApiResponse(
  entries: TimelineApiResponse['entries'] = [mockApiEntry],
  overrides: Partial<Omit<TimelineApiResponse, 'entries'>> = {},
): TimelineApiResponse {
  return {
    entries,
    total_fetched: entries.length,
    limit: overrides.limit ?? 50,
    offset: overrides.offset ?? 0,
    ...overrides,
  }
}

describe('useActivityTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue(makeApiResponse())
  })

  it('throws when used outside OEXCommsProvider', () => {
    expect(() => {
      renderHook(() => useActivityTimeline())
    }).toThrow('useActivityTimeline must be used within an OEXCommsProvider')
  })

  it('fetchEntries calls GET /api/activity/timeline with correct path', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    // Auto-fetch on mount
    await act(async () => {})

    expect(mockGet).toHaveBeenCalledWith('/api/activity/timeline', expect.any(Object))
  })

  it('fetchEntries sends leadId as lead_id query param', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchEntries({ leadId: 'lead-123' })
    })

    expect(mockGet).toHaveBeenCalledWith('/api/activity/timeline', expect.objectContaining({
      lead_id: 'lead-123',
    }))
  })

  it('fetchEntries sends channels as comma-separated channel param', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchEntries({ channels: ['voice', 'sms', 'email'] })
    })

    expect(mockGet).toHaveBeenCalledWith('/api/activity/timeline', expect.objectContaining({
      channel: 'voice,sms,email',
    }))
  })

  it('fetchEntries maps snake_case response to camelCase OEXTimelineEntry', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchEntries()
    })

    expect(result.current.entries).toHaveLength(1)
    const entry = result.current.entries[0]
    expect(entry.id).toBe('entry-1')
    expect(entry.sourceTable).toBe('voice_sessions')
    expect(entry.eventType).toBe('call_completed')
    expect(entry.leadId).toBe('lead-1')
    expect(entry.campaignId).toBe('camp-1')
    expect(entry.companyId).toBe('comp-1')
  })

  it('loadMore appends entries instead of replacing', async () => {
    const firstResponse = makeApiResponse(
      [mockApiEntry],
      { total_fetched: 50, limit: 50 },
    )
    const secondEntry = { ...mockApiEntry, id: 'entry-2', summary: 'Second call' }
    const secondResponse = makeApiResponse([secondEntry], { total_fetched: 1, limit: 50, offset: 50 })

    // First call is auto-fetch on mount, second is fetchEntries, third is loadMore
    mockGet
      .mockResolvedValueOnce(makeApiResponse()) // auto-fetch
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse)

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    // Wait for auto-fetch to complete
    await act(async () => {})

    await act(async () => {
      await result.current.fetchEntries({ limit: 50 })
    })

    expect(result.current.entries).toHaveLength(1)
    expect(result.current.hasMore).toBe(true)

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0].id).toBe('entry-1')
    expect(result.current.entries[1].id).toBe('entry-2')
  })

  it('loadMore increments offset correctly', async () => {
    const firstResponse = makeApiResponse(
      [mockApiEntry],
      { total_fetched: 50, limit: 50 },
    )
    const secondResponse = makeApiResponse([], { total_fetched: 0, limit: 50, offset: 50 })

    // Auto-fetch on mount, then fetchEntries, then loadMore
    mockGet
      .mockResolvedValueOnce(makeApiResponse()) // auto-fetch
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse)

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    // Wait for auto-fetch
    await act(async () => {})

    await act(async () => {
      await result.current.fetchEntries({ limit: 50 })
    })

    mockGet.mockClear()
    mockGet.mockResolvedValueOnce(secondResponse)

    await act(async () => {
      await result.current.loadMore()
    })

    expect(mockGet).toHaveBeenCalledWith('/api/activity/timeline', expect.objectContaining({
      offset: '50',
    }))
  })

  it('hasMore is false when fewer entries returned than limit', async () => {
    const response = makeApiResponse([mockApiEntry], { total_fetched: 1, limit: 50 })
    mockGet.mockResolvedValue(response)

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchEntries()
    })

    expect(result.current.hasMore).toBe(false)
  })

  it('refreshEntries re-fetches with the last used params', async () => {
    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchEntries({ leadId: 'lead-99', direction: 'inbound' })
    })

    mockGet.mockClear()
    mockGet.mockResolvedValue(makeApiResponse())

    await act(async () => {
      await result.current.refreshEntries()
    })

    expect(mockGet).toHaveBeenCalledWith('/api/activity/timeline', expect.objectContaining({
      lead_id: 'lead-99',
      direction: 'inbound',
    }))
  })

  it('API error sets error state with code and message', async () => {
    const apiError = { code: 500, message: 'Internal server error', recoverable: true }
    mockGet.mockRejectedValue(apiError)

    const context = createMockContext()
    const internal = createMockInternalContext()
    const { result } = renderHook(() => useActivityTimeline(), {
      wrapper: createWrapper(context, internal),
    })

    await act(async () => {
      await result.current.fetchEntries()
    })

    expect(result.current.error).toEqual(apiError)
  })
})
