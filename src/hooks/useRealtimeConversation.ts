import { useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Conversation, Message, Participant, Paginator } from '@twilio/conversations'
import {
  OEXConversationsContext,
  OEXConversationsInternalContext,
} from '../providers/OEXConversationsProvider'
import type {
  OEXRealtimeConversation,
  OEXRealtimeMessage,
  OEXRealtimeParticipant,
  OEXError,
} from '../types'

// --- Mapping functions ---

function mapMessage(msg: Message): OEXRealtimeMessage {
  return {
    sid: msg.sid,
    index: msg.index,
    body: msg.body,
    author: msg.author,
    createdAt: msg.dateCreated,
    updatedAt: msg.dateUpdated,
    attributes: (msg.attributes as Record<string, unknown>) ?? {},
    mediaSids: msg.attachedMedia?.map((m) => m.sid) ?? [],
    participantSid: msg.participantSid,
    type: msg.type === 'media' ? 'media' : 'text',
  }
}

function mapParticipantType(type: string): OEXRealtimeParticipant['type'] {
  switch (type) {
    case 'chat':
      return 'chat'
    case 'sms':
      return 'sms'
    case 'whatsapp':
      return 'whatsapp'
    default:
      return 'other'
  }
}

function mapParticipant(p: Participant): OEXRealtimeParticipant {
  return {
    sid: p.sid,
    identity: p.identity,
    type: mapParticipantType(p.type),
    lastReadMessageIndex: p.lastReadMessageIndex,
    lastReadTimestamp: p.lastReadTimestamp,
    attributes: (p.attributes as Record<string, unknown>) ?? {},
  }
}

function mapConversationMeta(
  conv: Conversation,
  unreadCount: number | null,
): OEXRealtimeConversation {
  return {
    sid: conv.sid,
    uniqueName: conv.uniqueName,
    friendlyName: conv.friendlyName,
    attributes: (conv.attributes as Record<string, unknown>) ?? {},
    createdAt: conv.dateCreated,
    updatedAt: conv.dateUpdated,
    lastMessageText: null,
    lastMessageAt: null,
    unreadCount,
    lastReadMessageIndex: conv.lastReadMessageIndex,
  }
}

// --- Hook ---

export interface UseRealtimeConversationReturn {
  /** Messages in the conversation (loaded + real-time) */
  messages: OEXRealtimeMessage[]
  /** Participants in the conversation */
  participants: OEXRealtimeParticipant[]
  /** Send a text message */
  sendMessage: (body: string) => Promise<void>
  /** Send a media message */
  sendMedia: (file: File | Blob, contentType: string, filename?: string) => Promise<void>
  /** Signal that the current user is typing */
  sendTyping: () => void
  /** Participants currently typing (excluding self) */
  participantsTyping: OEXRealtimeParticipant[]
  /** Mark all messages as read */
  setAllMessagesRead: () => Promise<void>
  /** Current user's last read message index */
  lastReadMessageIndex: number | null
  /** Number of unread messages */
  unreadCount: number | null
  /** Conversation metadata */
  conversation: OEXRealtimeConversation | null
  /** Whether messages are being loaded */
  isLoading: boolean
  /** Load more (older) messages */
  loadMoreMessages: () => Promise<void>
  /** Whether there are more messages to load */
  hasMoreMessages: boolean
  /** Current error */
  error: OEXError | null
}

export function useRealtimeConversation(conversationSid: string): UseRealtimeConversationReturn {
  const publicCtx = useContext(OEXConversationsContext)
  const internalCtx = useContext(OEXConversationsInternalContext)

  if (publicCtx === null || internalCtx === null) {
    throw new Error('useRealtimeConversation must be used within an OEXConversationsProvider')
  }

  const { clientRef } = internalCtx
  const { clientState, identity } = publicCtx

  const conversationRef = useRef<Conversation | null>(null)
  const paginatorRef = useRef<Paginator<Message> | null>(null)

  const [messages, setMessages] = useState<OEXRealtimeMessage[]>([])
  const [participants, setParticipants] = useState<OEXRealtimeParticipant[]>([])
  const [participantsTyping, setParticipantsTyping] = useState<OEXRealtimeParticipant[]>([])
  const [conversation, setConversation] = useState<OEXRealtimeConversation | null>(null)
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState<number | null>(null)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)

  // Conversation fetch & event wiring effect
  useEffect(() => {
    if (clientState !== 'initialized' || !conversationSid || !clientRef.current) return

    let cancelled = false
    const conv = { current: null as Conversation | null }

    async function load() {
      setIsLoading(true)
      setError(null)
      setMessages([])
      setParticipants([])
      setParticipantsTyping([])
      setConversation(null)

      try {
        const conversation = await clientRef.current!.getConversationBySid(conversationSid)
        if (cancelled) return

        conv.current = conversation
        conversationRef.current = conversation

        // Fetch unread count
        const unread = await conversation.getUnreadMessagesCount()
        if (cancelled) return
        setUnreadCount(unread)
        setLastReadMessageIndex(conversation.lastReadMessageIndex)

        // Map conversation metadata
        setConversation(mapConversationMeta(conversation, unread))

        // Fetch initial messages
        const paginator = await conversation.getMessages(30)
        if (cancelled) return
        paginatorRef.current = paginator
        setMessages(paginator.items.map(mapMessage))
        setHasMoreMessages(paginator.hasPrevPage)

        // Fetch participants
        const parts = await conversation.getParticipants()
        if (cancelled) return
        setParticipants(parts.map(mapParticipant))

        // --- Wire events ---

        conversation.on('messageAdded', (msg: Message) => {
          setMessages((prev) => [...prev, mapMessage(msg)])
        })

        conversation.on('messageUpdated', ({ message }: { message: Message }) => {
          setMessages((prev) =>
            prev.map((m) => (m.sid === message.sid ? mapMessage(message) : m)),
          )
        })

        conversation.on('messageRemoved', (msg: Message) => {
          setMessages((prev) => prev.filter((m) => m.sid !== msg.sid))
        })

        conversation.on('participantJoined', (p: Participant) => {
          setParticipants((prev) => [...prev, mapParticipant(p)])
        })

        conversation.on('participantLeft', (p: Participant) => {
          setParticipants((prev) => prev.filter((part) => part.sid !== p.sid))
        })

        conversation.on('participantUpdated', ({ participant }: { participant: Participant }) => {
          setParticipants((prev) =>
            prev.map((part) => (part.sid === participant.sid ? mapParticipant(participant) : part)),
          )
        })

        conversation.on('typingStarted', (p: Participant) => {
          if (p.identity !== identity) {
            setParticipantsTyping((prev) => {
              if (prev.some((tp) => tp.sid === p.sid)) return prev
              return [...prev, mapParticipant(p)]
            })
          }
        })

        conversation.on('typingEnded', (p: Participant) => {
          setParticipantsTyping((prev) => prev.filter((tp) => tp.sid !== p.sid))
        })

        conversation.on('updated', ({ conversation: updatedConv }: { conversation: Conversation }) => {
          setConversation((prev) =>
            prev ? mapConversationMeta(updatedConv, prev.unreadCount) : prev,
          )
        })
      } catch (err) {
        if (cancelled) return
        const e = err as { code?: number; message?: string }
        setError({
          code: e.code ?? 0,
          message: e.message ?? 'Failed to load conversation',
          recoverable: true,
        })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
      if (conv.current) {
        conv.current.removeAllListeners()
      }
      conversationRef.current = null
      paginatorRef.current = null
    }
  }, [clientState, conversationSid, clientRef, identity])

  // --- Actions ---

  const sendMessage = useCallback(
    async (body: string) => {
      if (!conversationRef.current) {
        setError({ code: 0, message: 'Conversation not loaded', recoverable: false })
        return
      }
      try {
        await conversationRef.current.sendMessage(body)
      } catch (err) {
        const e = err as { code?: number; message?: string }
        setError({
          code: e.code ?? 0,
          message: e.message ?? 'Failed to send message',
          recoverable: true,
        })
      }
    },
    [],
  )

  const sendMedia = useCallback(
    async (file: File | Blob, contentType: string, filename?: string) => {
      if (!conversationRef.current) {
        setError({ code: 0, message: 'Conversation not loaded', recoverable: false })
        return
      }
      try {
        const builder = conversationRef.current.prepareMessage()
        builder.addMedia({ contentType, filename: filename ?? 'attachment', media: file })
        await builder.build().send()
      } catch (err) {
        const e = err as { code?: number; message?: string }
        setError({
          code: e.code ?? 0,
          message: e.message ?? 'Failed to send media',
          recoverable: true,
        })
      }
    },
    [],
  )

  const sendTyping = useCallback(() => {
    try {
      conversationRef.current?.typing()
    } catch {
      // Ignore typing errors
    }
  }, [])

  const setAllMessagesRead = useCallback(async () => {
    if (!conversationRef.current) return
    try {
      const newIndex = await conversationRef.current.setAllMessagesRead()
      setLastReadMessageIndex(newIndex)
      setUnreadCount(0)
    } catch (err) {
      const e = err as { code?: number; message?: string }
      setError({
        code: e.code ?? 0,
        message: e.message ?? 'Failed to mark messages as read',
        recoverable: true,
      })
    }
  }, [])

  const loadMoreMessages = useCallback(async () => {
    if (!paginatorRef.current?.hasPrevPage) return
    try {
      const prevPage = await paginatorRef.current.prevPage()
      paginatorRef.current = prevPage
      const olderMessages = prevPage.items.map(mapMessage)
      setMessages((prev) => [...olderMessages, ...prev])
      setHasMoreMessages(prevPage.hasPrevPage)
    } catch (err) {
      const e = err as { code?: number; message?: string }
      setError({
        code: e.code ?? 0,
        message: e.message ?? 'Failed to load more messages',
        recoverable: true,
      })
    }
  }, [])

  return {
    messages,
    participants,
    sendMessage,
    sendMedia,
    sendTyping,
    participantsTyping,
    setAllMessagesRead,
    lastReadMessageIndex,
    unreadCount,
    conversation,
    isLoading,
    loadMoreMessages,
    hasMoreMessages,
    error,
  }
}
