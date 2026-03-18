import React, { createContext, forwardRef, useContext } from 'react'
import { useConversationList } from '../hooks/useConversationList'
import type { OEXRealtimeConversation } from '../types'

// --- Internal context (not exported) ---

interface ConversationListContextValue {
  conversations: OEXRealtimeConversation[]
  isLoading: boolean
  error: { code: number; message: string; recoverable: boolean } | null
  onSelect?: (conversationSid: string) => void
  selectedSid?: string
}

const ConversationListContext = createContext<ConversationListContextValue | null>(null)

function useListContext(): ConversationListContextValue {
  const ctx = useContext(ConversationListContext)
  if (!ctx) throw new Error('ConversationList subcomponents must be used within <ConversationList>')
  return ctx
}

// --- Subcomponents ---

export interface ConversationListItemProps {
  conversation: OEXRealtimeConversation
  className?: string
  children?: (conversation: OEXRealtimeConversation) => React.ReactNode
}

const ListItem = forwardRef<HTMLDivElement, ConversationListItemProps>(
  ({ conversation, className, children }, ref) => {
    const { onSelect, selectedSid } = useListContext()
    const isSelected = conversation.sid === selectedSid

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect?.(conversation.sid)
      }
    }

    return (
      <div
        ref={ref}
        className={className}
        role="option"
        aria-selected={isSelected}
        data-active={String(isSelected)}
        data-unread={String((conversation.unreadCount ?? 0) > 0)}
        data-conversation-sid={conversation.sid}
        tabIndex={0}
        onClick={() => onSelect?.(conversation.sid)}
        onKeyDown={handleKeyDown}
      >
        {typeof children === 'function' ? children(conversation) : (
          <>
            <span data-part="name">
              {conversation.friendlyName ?? conversation.uniqueName ?? conversation.sid}
            </span>
            <span data-part="preview">{conversation.lastMessageText}</span>
            <time
              data-part="timestamp"
              dateTime={conversation.lastMessageAt?.toISOString() ?? ''}
            >
              {conversation.lastMessageAt?.toISOString() ?? ''}
            </time>
            {conversation.unreadCount != null && conversation.unreadCount > 0 && (
              <span
                data-part="unread-badge"
                aria-label={`${conversation.unreadCount} unread messages`}
              >
                {conversation.unreadCount}
              </span>
            )}
          </>
        )}
      </div>
    )
  },
)
ListItem.displayName = 'ConversationList.Item'

// --- ConversationList root ---

export interface ConversationListProps {
  onSelect?: (conversationSid: string) => void
  selectedSid?: string
  className?: string
  children?: React.ReactNode
}

const ConversationListRoot = forwardRef<HTMLDivElement, ConversationListProps>(
  ({ onSelect, selectedSid, className, children }, ref) => {
    const { conversations, isLoading, error } = useConversationList()

    const ctxValue: ConversationListContextValue = {
      conversations,
      isLoading,
      error,
      onSelect,
      selectedSid,
    }

    const dataState = isLoading ? 'loading' : error ? 'error' : 'ready'

    const sorted = [...conversations].sort((a, b) => {
      if (a.lastMessageAt == null && b.lastMessageAt == null) return 0
      if (a.lastMessageAt == null) return 1
      if (b.lastMessageAt == null) return -1
      return b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    })

    return (
      <ConversationListContext.Provider value={ctxValue}>
        <div
          ref={ref}
          className={className}
          data-state={dataState}
          role="listbox"
          aria-label="Conversations"
        >
          {error && (
            <div role="alert">{error.message}</div>
          )}
          {isLoading && conversations.length === 0 && (
            <div data-state="loading" aria-busy="true">Loading...</div>
          )}
          {children ?? sorted.map((conv) => (
            <ListItem key={conv.sid} conversation={conv} />
          ))}
        </div>
      </ConversationListContext.Provider>
    )
  },
)
ConversationListRoot.displayName = 'ConversationList'

export const ConversationList = Object.assign(ConversationListRoot, {
  Item: ListItem,
})
