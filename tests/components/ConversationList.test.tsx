import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ConversationList } from '../../src/components/ConversationList'
import { useConversationList } from '../../src/hooks/useConversationList'
import type { OEXRealtimeConversation } from '../../src/types'

vi.mock('../../src/hooks/useConversationList', () => ({
  useConversationList: vi.fn(),
}))

const mockUseConversationList = useConversationList as ReturnType<typeof vi.fn>

function makeConversation(overrides: Partial<OEXRealtimeConversation> = {}): OEXRealtimeConversation {
  return {
    sid: 'CH001',
    uniqueName: null,
    friendlyName: 'Test Conversation',
    attributes: {},
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: null,
    lastMessageText: 'Last message',
    lastMessageAt: new Date('2026-01-01T12:00:00Z'),
    unreadCount: 0,
    lastReadMessageIndex: null,
    ...overrides,
  }
}

function setupMock(overrides: Partial<ReturnType<typeof useConversationList>> = {}) {
  const defaults = {
    conversations: [] as OEXRealtimeConversation[],
    isLoading: false,
    refresh: vi.fn(),
    error: null,
  }
  mockUseConversationList.mockReturnValue({ ...defaults, ...overrides })
  return { ...defaults, ...overrides }
}

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with role="listbox"', () => {
    setupMock()
    render(<ConversationList />)
    expect(screen.getByRole('listbox')).toBeDefined()
  })

  it('renders conversation items with name, preview, and timestamp', () => {
    const conv = makeConversation({
      friendlyName: 'Sales Chat',
      lastMessageText: 'Hello there',
      lastMessageAt: new Date('2026-01-01T12:00:00Z'),
    })
    setupMock({ conversations: [conv] })
    render(<ConversationList />)
    expect(screen.getByText('Sales Chat')).toBeDefined()
    expect(screen.getByText('Hello there')).toBeDefined()
    expect(screen.getByText('2026-01-01T12:00:00.000Z')).toBeDefined()
  })

  it('onSelect fires with conversation SID when item is clicked', () => {
    const conv = makeConversation({ sid: 'CH123' })
    setupMock({ conversations: [conv] })
    const onSelect = vi.fn()
    render(<ConversationList onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('option'))
    expect(onSelect).toHaveBeenCalledWith('CH123')
  })

  it('selected item has aria-selected="true" and data-active="true"', () => {
    const conv = makeConversation({ sid: 'CH123' })
    setupMock({ conversations: [conv] })
    render(<ConversationList selectedSid="CH123" />)
    const item = screen.getByRole('option')
    expect(item.getAttribute('aria-selected')).toBe('true')
    expect(item.getAttribute('data-active')).toBe('true')
  })

  it('unread badge renders with count when unreadCount > 0', () => {
    const conv = makeConversation({ unreadCount: 5 })
    setupMock({ conversations: [conv] })
    render(<ConversationList />)
    const badge = screen.getByLabelText('5 unread messages')
    expect(badge.textContent).toBe('5')
  })

  it('unread badge does not render when unreadCount is 0 or null', () => {
    const conv1 = makeConversation({ sid: 'CH001', unreadCount: 0 })
    const conv2 = makeConversation({ sid: 'CH002', unreadCount: null })
    setupMock({ conversations: [conv1, conv2] })
    render(<ConversationList />)
    expect(screen.queryByLabelText(/unread messages/)).toBeNull()
  })

  it('renders loading state when isLoading is true and no conversations', () => {
    setupMock({ isLoading: true, conversations: [] })
    const { container } = render(<ConversationList />)
    const loadingDiv = container.querySelector('[aria-busy="true"]')
    expect(loadingDiv).not.toBeNull()
  })
})
