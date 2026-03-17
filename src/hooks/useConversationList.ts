import { useContext, useState, useEffect, useCallback } from 'react'
import type { Conversation } from '@twilio/conversations'
import {
  OEXConversationsContext,
  OEXConversationsInternalContext,
} from '../providers/OEXConversationsProvider'
import type { OEXRealtimeConversation, OEXError } from '../types'

// --- Mapping ---

async function mapConversation(conv: Conversation): Promise<OEXRealtimeConversation> {
  const unreadCount = await conv.getUnreadMessagesCount()
  const lastMessage = await conv.getMessages(1)
  const latest = lastMessage.items[0]
  return {
    sid: conv.sid,
    uniqueName: conv.uniqueName,
    friendlyName: conv.friendlyName,
    attributes: (conv.attributes as Record<string, unknown>) ?? {},
    createdAt: conv.dateCreated,
    updatedAt: conv.dateUpdated,
    lastMessageText: latest?.body ?? null,
    lastMessageAt: latest?.dateCreated ?? null,
    unreadCount,
    lastReadMessageIndex: conv.lastReadMessageIndex,
  }
}

// --- Hook ---

export interface UseConversationListReturn {
  /** List of conversations the user participates in */
  conversations: OEXRealtimeConversation[]
  /** Whether the list is loading */
  isLoading: boolean
  /** Refresh the conversation list */
  refresh: () => Promise<void>
  /** Current error */
  error: OEXError | null
}

export function useConversationList(): UseConversationListReturn {
  const publicCtx = useContext(OEXConversationsContext)
  const internalCtx = useContext(OEXConversationsInternalContext)

  if (publicCtx === null || internalCtx === null) {
    throw new Error('useConversationList must be used within an OEXConversationsProvider')
  }

  const { clientRef } = internalCtx
  const { clientState } = publicCtx

  const [conversations, setConversations] = useState<OEXRealtimeConversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)

  const fetchList = useCallback(async () => {
    if (!clientRef.current || clientState !== 'initialized') return

    setIsLoading(true)
    setError(null)

    try {
      const client = clientRef.current

      // Subscribe to conversationAdded BEFORE calling getSubscribedConversations (per Twilio best practices)
      client.on('conversationAdded', async (conv: Conversation) => {
        try {
          const mapped = await mapConversation(conv)
          setConversations((prev) => [...prev, mapped])
        } catch {
          // Ignore mapping errors for individual conversations
        }
      })

      client.on('conversationRemoved', (conv: Conversation) => {
        setConversations((prev) => prev.filter((c) => c.sid !== conv.sid))
      })

      client.on('conversationUpdated', async ({ conversation: conv }: { conversation: Conversation }) => {
        try {
          const mapped = await mapConversation(conv)
          setConversations((prev) => prev.map((c) => (c.sid === mapped.sid ? mapped : c)))
        } catch {
          // Ignore mapping errors for individual conversations
        }
      })

      // Fetch all subscribed conversations
      let paginator = await client.getSubscribedConversations()
      const allConversations: Conversation[] = [...paginator.items]

      while (paginator.hasNextPage) {
        paginator = await paginator.nextPage()
        allConversations.push(...paginator.items)
      }

      // Map all conversations
      const mapped = await Promise.all(allConversations.map(mapConversation))
      setConversations(mapped)
    } catch (err) {
      const e = err as { code?: number; message?: string }
      setError({
        code: e.code ?? 0,
        message: e.message ?? 'Failed to load conversations',
        recoverable: true,
      })
    } finally {
      setIsLoading(false)
    }
  }, [clientRef, clientState])

  useEffect(() => {
    if (clientState !== 'initialized') return

    fetchList()

    return () => {
      clientRef.current?.removeAllListeners('conversationAdded')
      clientRef.current?.removeAllListeners('conversationRemoved')
      clientRef.current?.removeAllListeners('conversationUpdated')
    }
  }, [clientState, fetchList, clientRef])

  const refresh = useCallback(async () => {
    // Remove existing listeners before re-adding in fetchList
    clientRef.current?.removeAllListeners('conversationAdded')
    clientRef.current?.removeAllListeners('conversationRemoved')
    clientRef.current?.removeAllListeners('conversationUpdated')
    await fetchList()
  }, [fetchList, clientRef])

  return {
    conversations,
    isLoading,
    refresh,
    error,
  }
}
