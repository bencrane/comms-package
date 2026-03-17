import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useConversationList } from '../../src/hooks/useConversationList'
import {
  OEXConversationsContext,
  OEXConversationsInternalContext,
} from '../../src/providers/OEXConversationsProvider'
import type { OEXConversationsContextValue } from '../../src/types'
import type { OEXConversationsInternalContextValue } from '../../src/providers/OEXConversationsProvider'

vi.spyOn(console, 'error').mockImplementation(() => {})

// --- Mock data ---

const mockClientEvents: Record<string, ((...args: unknown[]) => void)[]> = {}

const mockConversations = [
  {
    sid: 'CH001',
    uniqueName: 'conv-1',
    friendlyName: 'Conversation 1',
    attributes: {},
    dateCreated: new Date('2026-03-17T09:00:00Z'),
    dateUpdated: new Date('2026-03-17T10:00:00Z'),
    lastReadMessageIndex: 2,
    getUnreadMessagesCount: vi.fn().mockResolvedValue(1),
    getMessages: vi.fn().mockResolvedValue({
      items: [
        {
          body: 'Last message in conv 1',
          dateCreated: new Date('2026-03-17T10:00:00Z'),
        },
      ],
    }),
  },
  {
    sid: 'CH002',
    uniqueName: 'conv-2',
    friendlyName: 'Conversation 2',
    attributes: {},
    dateCreated: new Date('2026-03-17T08:00:00Z'),
    dateUpdated: new Date('2026-03-17T11:00:00Z'),
    lastReadMessageIndex: 5,
    getUnreadMessagesCount: vi.fn().mockResolvedValue(0),
    getMessages: vi.fn().mockResolvedValue({
      items: [
        {
          body: 'Last message in conv 2',
          dateCreated: new Date('2026-03-17T11:00:00Z'),
        },
      ],
    }),
  },
]

const mockGetSubscribedConversations = vi.fn().mockResolvedValue({
  items: mockConversations,
  hasNextPage: false,
  nextPage: vi.fn(),
})

const mockRemoveAllListeners = vi.fn()

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
        getSubscribedConversations: mockGetSubscribedConversations,
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (!mockClientEvents[event]) mockClientEvents[event] = []
          mockClientEvents[event].push(handler)
        }),
        removeAllListeners: mockRemoveAllListeners,
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

describe('useConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockClientEvents).forEach((key) => {
      mockClientEvents[key] = []
    })
    mockGetSubscribedConversations.mockResolvedValue({
      items: mockConversations,
      hasNextPage: false,
      nextPage: vi.fn(),
    })
    mockConversations[0].getUnreadMessagesCount.mockResolvedValue(1)
    mockConversations[1].getUnreadMessagesCount.mockResolvedValue(0)
  })

  it('fetches subscribed conversations when client is initialized', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(2)
    })

    expect(mockGetSubscribedConversations).toHaveBeenCalled()
  })

  it('maps conversations to OEXRealtimeConversation with unread counts', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(2)
    })

    expect(result.current.conversations[0].sid).toBe('CH001')
    expect(result.current.conversations[0].friendlyName).toBe('Conversation 1')
    expect(result.current.conversations[0].unreadCount).toBe(1)
    expect(result.current.conversations[0].lastMessageText).toBe('Last message in conv 1')
    expect(result.current.conversations[1].sid).toBe('CH002')
    expect(result.current.conversations[1].unreadCount).toBe(0)
  })

  it('adds conversation on conversationAdded event', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(2)
    })

    const newConversation = {
      sid: 'CH003',
      uniqueName: 'conv-3',
      friendlyName: 'Conversation 3',
      attributes: {},
      dateCreated: new Date('2026-03-17T12:00:00Z'),
      dateUpdated: new Date('2026-03-17T12:00:00Z'),
      lastReadMessageIndex: 0,
      getUnreadMessagesCount: vi.fn().mockResolvedValue(2),
      getMessages: vi.fn().mockResolvedValue({
        items: [
          {
            body: 'New conv message',
            dateCreated: new Date('2026-03-17T12:00:00Z'),
          },
        ],
      }),
    }

    await act(async () => {
      for (const handler of mockClientEvents['conversationAdded'] ?? []) {
        await handler(newConversation)
      }
    })

    expect(result.current.conversations.length).toBe(3)
    expect(result.current.conversations[2].sid).toBe('CH003')
    expect(result.current.conversations[2].unreadCount).toBe(2)
  })

  it('removes conversation on conversationRemoved event', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(2)
    })

    act(() => {
      mockClientEvents['conversationRemoved']?.forEach((handler) =>
        handler({ sid: 'CH001' }),
      )
    })

    expect(result.current.conversations.length).toBe(1)
    expect(result.current.conversations[0].sid).toBe('CH002')
  })

  it('updates conversation on conversationUpdated event', async () => {
    const publicCtx = createMockPublicContext()
    const internalCtx = createMockInternalContext()

    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(publicCtx, internalCtx),
    })

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(2)
    })

    const updatedConversation = {
      ...mockConversations[0],
      friendlyName: 'Updated Name',
      getUnreadMessagesCount: vi.fn().mockResolvedValue(5),
      getMessages: vi.fn().mockResolvedValue({
        items: [
          {
            body: 'Updated last message',
            dateCreated: new Date('2026-03-17T13:00:00Z'),
          },
        ],
      }),
    }

    await act(async () => {
      for (const handler of mockClientEvents['conversationUpdated'] ?? []) {
        await handler({ conversation: updatedConversation })
      }
    })

    const updated = result.current.conversations.find((c) => c.sid === 'CH001')
    expect(updated?.friendlyName).toBe('Updated Name')
    expect(updated?.unreadCount).toBe(5)
    expect(updated?.lastMessageText).toBe('Updated last message')
  })
})
