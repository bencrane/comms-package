import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useRealtimeConversation } from '../../src/hooks/useRealtimeConversation'
import {
  OEXConversationsContext,
  OEXConversationsInternalContext,
} from '../../src/providers/OEXConversationsProvider'
import type { OEXConversationsContextValue } from '../../src/types'
import type { OEXConversationsInternalContextValue } from '../../src/providers/OEXConversationsProvider'

vi.spyOn(console, 'error').mockImplementation(() => {})

// --- Mock Conversation ---

const mockConversationEvents: Record<string, ((...args: unknown[]) => void)[]> = {}

const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const mockTyping = vi.fn()
const mockSetAllMessagesRead = vi.fn().mockResolvedValue(5)
const mockPrepareMessage = vi.fn()
const mockGetUnreadMessagesCount = vi.fn().mockResolvedValue(3)
const mockRemoveAllListeners = vi.fn()

const mockMessages = [
  {
    sid: 'MSG001',
    index: 0,
    body: 'Hello',
    author: 'user-1',
    dateCreated: new Date('2026-03-17T10:00:00Z'),
    dateUpdated: new Date('2026-03-17T10:00:00Z'),
    attributes: {},
    attachedMedia: null,
    participantSid: 'PA001',
    type: 'text',
  },
  {
    sid: 'MSG002',
    index: 1,
    body: 'World',
    author: 'user-2',
    dateCreated: new Date('2026-03-17T11:00:00Z'),
    dateUpdated: new Date('2026-03-17T11:00:00Z'),
    attributes: {},
    attachedMedia: [{ sid: 'ME001' }],
    participantSid: 'PA002',
    type: 'media',
  },
]

const mockParticipants = [
  {
    sid: 'PA001',
    identity: 'test-user',
    type: 'chat',
    lastReadMessageIndex: 1,
    lastReadTimestamp: new Date(),
    attributes: {},
  },
  {
    sid: 'PA002',
    identity: 'other-user',
    type: 'sms',
    lastReadMessageIndex: 0,
    lastReadTimestamp: new Date(),
    attributes: {},
  },
]

const mockPrevPageItems = [
  {
    sid: 'MSG000',
    index: -1,
    body: 'Old message',
    author: 'user-1',
    dateCreated: new Date('2026-03-16T10:00:00Z'),
    dateUpdated: new Date('2026-03-16T10:00:00Z'),
    attributes: {},
    attachedMedia: null,
    participantSid: 'PA001',
    type: 'text',
  },
]

const mockPaginator = {
  items: mockMessages,
  hasPrevPage: true,
  prevPage: vi.fn().mockResolvedValue({
    items: mockPrevPageItems,
    hasPrevPage: false,
    prevPage: vi.fn(),
  }),
}

const mockConversation = {
  sid: 'CH001',
  uniqueName: 'test-conv',
  friendlyName: 'Test Conversation',
  attributes: {},
  dateCreated: new Date('2026-03-17T09:00:00Z'),
  dateUpdated: new Date('2026-03-17T11:00:00Z'),
  lastReadMessageIndex: 1,
  sendMessage: mockSendMessage,
  typing: mockTyping,
  setAllMessagesRead: mockSetAllMessagesRead,
  prepareMessage: mockPrepareMessage,
  getMessages: vi.fn().mockResolvedValue(mockPaginator),
  getParticipants: vi.fn().mockResolvedValue(mockParticipants),
  getUnreadMessagesCount: mockGetUnreadMessagesCount,
  removeAllListeners: mockRemoveAllListeners,
  on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (!mockConversationEvents[event]) mockConversationEvents[event] = []
    mockConversationEvents[event].push(handler)
  }),
}

const mockGetConversationBySid = vi.fn().mockResolvedValue(mockConversation)

function createMockPublicContext(
  overrides?: Partial<OEXConversationsContextValue>,
): OEXConversationsContextValue {
  return {
    clientState: 'initialized',
    connectionState: 'connected',
    isReady: true,
    identity: 'test-user',
    error: null,
    ...overrides,
  }
}

function createMockInternalContext(): OEXConversationsInternalContextValue {
  return {
    clientRef: {
      current: {
        getConversationBySid: mockGetConversationBySid,
      } as unknown as import('@twilio/conversations').Client,
    },
    apiClientRef: { current: null },
  }
}

function createWrapper(
  publicCtx: OEXConversationsContextValue,
  internalCtx: OEXConversationsInternalContextValue,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      OEXConversationsInternalContext.Provider,
      { value: internalCtx },
      createElement(OEXConversationsContext.Provider, { value: publicCtx }, children),
    )
  }
}

describe('useRealtimeConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear event listeners
    Object.keys(mockConversationEvents).forEach((key) => {
      mockConversationEvents[key] = []
    })
    mockConversation.getMessages.mockResolvedValue(mockPaginator)
    mockConversation.getParticipants.mockResolvedValue(mockParticipants)
    mockGetUnreadMessagesCount.mockResolvedValue(3)
    mockGetConversationBySid.mockResolvedValue(mockConversation)
    mockPaginator.prevPage.mockResolvedValue({
      items: mockPrevPageItems,
      hasPrevPage: false,
      prevPage: vi.fn(),
    })
  })

  it('fetches conversation by SID when client is initialized', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(mockGetConversationBySid).toHaveBeenCalledWith('CH001')
    })
  })

  it('loads initial messages and maps to OEXRealtimeMessage', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2)
    })

    expect(result.current.messages[0].sid).toBe('MSG001')
    expect(result.current.messages[0].body).toBe('Hello')
    expect(result.current.messages[0].type).toBe('text')
    expect(result.current.messages[1].sid).toBe('MSG002')
    expect(result.current.messages[1].type).toBe('media')
    expect(result.current.messages[1].mediaSids).toEqual(['ME001'])
  })

  it('appends new message on messageAdded event', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2)
    })

    const newMessage = {
      sid: 'MSG003',
      index: 2,
      body: 'New message',
      author: 'user-1',
      dateCreated: new Date('2026-03-17T12:00:00Z'),
      dateUpdated: new Date('2026-03-17T12:00:00Z'),
      attributes: {},
      attachedMedia: null,
      participantSid: 'PA001',
      type: 'text',
    }

    act(() => {
      mockConversationEvents['messageAdded']?.forEach((handler) => handler(newMessage))
    })

    expect(result.current.messages.length).toBe(3)
    expect(result.current.messages[2].sid).toBe('MSG003')
    expect(result.current.messages[2].body).toBe('New message')
  })

  it('sendMessage calls conversation.sendMessage', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.sendMessage('Test message')
    })

    expect(mockSendMessage).toHaveBeenCalledWith('Test message')
  })

  it('sendTyping calls conversation.typing()', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.sendTyping()
    })

    expect(mockTyping).toHaveBeenCalled()
  })

  it('tracks participantsTyping from typingStarted/typingEnded events', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // typingStarted from another user
    act(() => {
      mockConversationEvents['typingStarted']?.forEach((handler) =>
        handler(mockParticipants[1]),
      )
    })

    expect(result.current.participantsTyping.length).toBe(1)
    expect(result.current.participantsTyping[0].identity).toBe('other-user')

    // typingEnded
    act(() => {
      mockConversationEvents['typingEnded']?.forEach((handler) =>
        handler(mockParticipants[1]),
      )
    })

    expect(result.current.participantsTyping.length).toBe(0)
  })

  it('setAllMessagesRead calls conversation.setAllMessagesRead()', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.setAllMessagesRead()
    })

    expect(mockSetAllMessagesRead).toHaveBeenCalled()
    expect(result.current.unreadCount).toBe(0)
  })

  it('loadMoreMessages fetches previous page from paginator', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useRealtimeConversation('CH001'), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2)
    })

    expect(result.current.hasMoreMessages).toBe(true)

    await act(async () => {
      await result.current.loadMoreMessages()
    })

    expect(result.current.messages.length).toBe(3)
    expect(result.current.messages[0].sid).toBe('MSG000')
    expect(result.current.messages[0].body).toBe('Old message')
    expect(result.current.hasMoreMessages).toBe(false)
  })
})
