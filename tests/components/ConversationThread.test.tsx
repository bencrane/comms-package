import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ConversationThread } from '../../src/components/ConversationThread'
import { useRealtimeConversation } from '../../src/hooks/useRealtimeConversation'
import type { OEXRealtimeMessage, OEXRealtimeParticipant } from '../../src/types'

vi.mock('../../src/hooks/useRealtimeConversation', () => ({
  useRealtimeConversation: vi.fn(),
}))

const mockUseRealtimeConversation = useRealtimeConversation as ReturnType<typeof vi.fn>

function makeMessage(overrides: Partial<OEXRealtimeMessage> = {}): OEXRealtimeMessage {
  return {
    sid: 'MSG001',
    index: 0,
    body: 'Hello',
    author: 'user1',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: null,
    attributes: {},
    mediaSids: [],
    participantSid: 'PA001',
    type: 'text',
    ...overrides,
  }
}

function makeParticipant(overrides: Partial<OEXRealtimeParticipant> = {}): OEXRealtimeParticipant {
  return {
    sid: 'PA001',
    identity: 'user1',
    type: 'chat',
    lastReadMessageIndex: null,
    lastReadTimestamp: null,
    attributes: {},
    ...overrides,
  }
}

function setupMock(overrides: Partial<ReturnType<typeof useRealtimeConversation>> = {}) {
  const defaults = {
    messages: [] as OEXRealtimeMessage[],
    participants: [] as OEXRealtimeParticipant[],
    sendMessage: vi.fn(),
    sendMedia: vi.fn(),
    sendTyping: vi.fn(),
    participantsTyping: [] as OEXRealtimeParticipant[],
    setAllMessagesRead: vi.fn(),
    lastReadMessageIndex: null,
    unreadCount: null,
    conversation: null,
    isLoading: false,
    loadMoreMessages: vi.fn(),
    hasMoreMessages: false,
    error: null,
  }
  mockUseRealtimeConversation.mockReturnValue({ ...defaults, ...overrides })
  return { ...defaults, ...overrides }
}

describe('ConversationThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with data-state="loading" when isLoading is true', () => {
    setupMock({ isLoading: true })
    const { container } = render(<ConversationThread conversationSid="CH001" />)
    expect(container.firstElementChild!.getAttribute('data-state')).toBe('loading')
  })

  it('renders with data-state="ready" and messages when loaded', () => {
    const msg = makeMessage({ sid: 'MSG001', body: 'Hello world' })
    setupMock({ messages: [msg] })
    const { container } = render(<ConversationThread conversationSid="CH001" />)
    expect(container.firstElementChild!.getAttribute('data-state')).toBe('ready')
    expect(screen.getByText('Hello world')).toBeDefined()
  })

  it('each message renders author, body, and timestamp', () => {
    const msg = makeMessage({
      sid: 'MSG001',
      author: 'alice',
      body: 'Hi there',
      createdAt: new Date('2026-01-01T12:00:00Z'),
    })
    setupMock({ messages: [msg] })
    render(<ConversationThread conversationSid="CH001" />)
    expect(screen.getByText('alice')).toBeDefined()
    expect(screen.getByText('Hi there')).toBeDefined()
    expect(screen.getByText('2026-01-01T12:00:00.000Z')).toBeDefined()
  })

  it('messages from current user have data-direction="outbound"', () => {
    const msg = makeMessage({ sid: 'MSG001', author: 'me' })
    setupMock({ messages: [msg] })
    render(<ConversationThread conversationSid="CH001" identity="me" />)
    const el = screen.getByRole('listitem')
    expect(el.getAttribute('data-direction')).toBe('outbound')
  })

  it('messages from others have data-direction="inbound"', () => {
    const msg = makeMessage({ sid: 'MSG001', author: 'other' })
    setupMock({ messages: [msg] })
    render(<ConversationThread conversationSid="CH001" identity="me" />)
    const el = screen.getByRole('listitem')
    expect(el.getAttribute('data-direction')).toBe('inbound')
  })

  it('ComposeInput sends message on form submit and clears the input', () => {
    const mocks = setupMock()
    render(<ConversationThread conversationSid="CH001" />)
    const input = screen.getByLabelText('Type a message') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Test message' } })
    expect(input.value).toBe('Test message')
    fireEvent.submit(input.closest('form')!)
    expect(mocks.sendMessage).toHaveBeenCalledWith('Test message')
    expect(input.value).toBe('')
  })

  it('ComposeInput send button is disabled when input is empty', () => {
    setupMock()
    render(<ConversationThread conversationSid="CH001" />)
    const btn = screen.getByLabelText('Send message')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('TypingIndicator renders when participantsTyping is non-empty', () => {
    const typingParticipant = makeParticipant({ sid: 'PA002', identity: 'bob' })
    setupMock({ participantsTyping: [typingParticipant] })
    render(<ConversationThread conversationSid="CH001" />)
    expect(screen.getByText('bob is typing...')).toBeDefined()
  })

  it('TypingIndicator renders nothing when participantsTyping is empty', () => {
    setupMock({ participantsTyping: [] })
    render(<ConversationThread conversationSid="CH001" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('Load more button renders when hasMoreMessages is true and calls loadMoreMessages on click', () => {
    const mocks = setupMock({ hasMoreMessages: true })
    render(<ConversationThread conversationSid="CH001" />)
    const btn = screen.getByLabelText('Load older messages')
    expect(btn).toBeDefined()
    fireEvent.click(btn)
    expect(mocks.loadMoreMessages).toHaveBeenCalled()
  })
})
