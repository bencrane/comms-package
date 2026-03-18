import React, { createContext, forwardRef, useContext, useState } from 'react'
import { useRealtimeConversation } from '../hooks/useRealtimeConversation'
import type { UseRealtimeConversationReturn } from '../hooks/useRealtimeConversation'
import type { OEXRealtimeMessage, OEXRealtimeParticipant } from '../types'

// --- Internal context (not exported) ---

interface ConversationThreadContextValue extends UseRealtimeConversationReturn {
  identity?: string
}

const ConversationThreadContext = createContext<ConversationThreadContextValue | null>(null)

function useThreadContext(): ConversationThreadContextValue {
  const ctx = useContext(ConversationThreadContext)
  if (!ctx) throw new Error('ConversationThread subcomponents must be used within <ConversationThread>')
  return ctx
}

// --- Subcomponents ---

export interface ConversationThreadMessageProps {
  message: OEXRealtimeMessage
  isOwn?: boolean
  isRead?: boolean
  className?: string
  children?: React.ReactNode
}

const ThreadMessage = forwardRef<HTMLDivElement, ConversationThreadMessageProps>(
  ({ message, isOwn, isRead, className, children }, ref) => {
    return (
      <div
        ref={ref}
        className={className}
        data-direction={isOwn ? 'outbound' : 'inbound'}
        data-type={message.type}
        data-message-sid={message.sid}
        data-read={String(isRead ?? false)}
        role="listitem"
      >
        {children ?? (
          <>
            <span data-part="author">{message.author}</span>
            <span data-part="body">
              {message.body ?? (message.type === 'media' ? 'Media attachment' : '')}
            </span>
            <time
              data-part="timestamp"
              dateTime={message.createdAt?.toISOString()}
            >
              {message.createdAt?.toISOString() ?? ''}
            </time>
          </>
        )}
      </div>
    )
  },
)
ThreadMessage.displayName = 'ConversationThread.Message'

export interface ConversationThreadMessageListProps {
  className?: string
  renderMessage?: (message: OEXRealtimeMessage, isOwn: boolean) => React.ReactNode
  children?: React.ReactNode
}

const ThreadMessageList = forwardRef<HTMLDivElement, ConversationThreadMessageListProps>(
  ({ className, renderMessage, children }, ref) => {
    const { messages, hasMoreMessages, loadMoreMessages, participants, identity } = useThreadContext()

    const otherParticipants = participants.filter((p) => p.identity !== identity)
    const lastReadByOthers = otherParticipants.length > 0
      ? Math.max(...otherParticipants.map((p) => p.lastReadMessageIndex ?? -1))
      : -1

    return (
      <div ref={ref} className={className} role="log" aria-label="Messages" aria-live="polite">
        {hasMoreMessages && (
          <button
            data-action="load-more"
            aria-label="Load older messages"
            onClick={() => loadMoreMessages()}
          >
            Load more
          </button>
        )}
        {children ?? messages.map((msg) => {
          const isOwn = identity != null && msg.author === identity
          const isRead = msg.index <= lastReadByOthers

          if (renderMessage) {
            return <React.Fragment key={msg.sid}>{renderMessage(msg, isOwn)}</React.Fragment>
          }

          return (
            <ThreadMessage
              key={msg.sid}
              message={msg}
              isOwn={isOwn}
              isRead={isRead}
            />
          )
        })}
      </div>
    )
  },
)
ThreadMessageList.displayName = 'ConversationThread.MessageList'

export interface ConversationThreadComposeInputProps {
  className?: string
  inputClassName?: string
  sendButtonClassName?: string
  placeholder?: string
  children?: React.ReactNode
}

const ThreadComposeInput = forwardRef<HTMLFormElement, ConversationThreadComposeInputProps>(
  ({ className, inputClassName, sendButtonClassName, placeholder, children }, ref) => {
    const { sendMessage, sendTyping } = useThreadContext()
    const [draft, setDraft] = useState('')

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = draft.trim()
      if (!trimmed) return
      sendMessage(trimmed)
      setDraft('')
    }

    if (children) {
      return <form ref={ref} className={className} onSubmit={handleSubmit}>{children}</form>
    }

    return (
      <form ref={ref} className={className} onSubmit={handleSubmit}>
        <input
          type="text"
          className={inputClassName}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            sendTyping()
          }}
          aria-label={placeholder ?? 'Type a message'}
          placeholder={placeholder}
          data-part="compose-input"
        />
        <button
          type="submit"
          className={sendButtonClassName}
          aria-label="Send message"
          data-part="send-button"
          disabled={draft.trim().length === 0}
        >
          Send
        </button>
      </form>
    )
  },
)
ThreadComposeInput.displayName = 'ConversationThread.ComposeInput'

export interface ConversationThreadTypingIndicatorProps {
  className?: string
  children?: (participants: OEXRealtimeParticipant[]) => React.ReactNode
}

const ThreadTypingIndicator = forwardRef<HTMLDivElement, ConversationThreadTypingIndicatorProps>(
  ({ className, children }, ref) => {
    const { participantsTyping } = useThreadContext()

    if (participantsTyping.length === 0) return null

    let defaultContent: string
    if (participantsTyping.length === 1) {
      defaultContent = `${participantsTyping[0].identity} is typing...`
    } else if (participantsTyping.length === 2) {
      defaultContent = `${participantsTyping[0].identity} and ${participantsTyping[1].identity} are typing...`
    } else {
      defaultContent = `${participantsTyping.length} people are typing...`
    }

    return (
      <div ref={ref} className={className} aria-live="polite" role="status" data-typing="true">
        {typeof children === 'function' ? children(participantsTyping) : defaultContent}
      </div>
    )
  },
)
ThreadTypingIndicator.displayName = 'ConversationThread.TypingIndicator'

// --- ConversationThread root ---

export interface ConversationThreadProps {
  conversationSid: string
  identity?: string
  onSendMessage?: (body: string) => void
  className?: string
  children?: React.ReactNode
}

const ConversationThreadRoot = forwardRef<HTMLDivElement, ConversationThreadProps>(
  ({ conversationSid, identity, className, children }, ref) => {
    const hookReturn = useRealtimeConversation(conversationSid)
    const { isLoading, error, participantsTyping, unreadCount } = hookReturn

    const ctxValue: ConversationThreadContextValue = {
      ...hookReturn,
      identity,
    }

    const dataState = isLoading ? 'loading' : error ? 'error' : 'ready'

    return (
      <ConversationThreadContext.Provider value={ctxValue}>
        <div
          ref={ref}
          className={className}
          data-state={dataState}
          data-typing={String(participantsTyping.length > 0)}
          data-unread={String((unreadCount ?? 0) > 0)}
          role="region"
          aria-label="Conversation"
        >
          {error && !isLoading && (
            <div role="alert">{error.message}</div>
          )}
          {children ?? (
            <>
              <ThreadMessageList />
              <ThreadTypingIndicator />
              <ThreadComposeInput />
            </>
          )}
        </div>
      </ConversationThreadContext.Provider>
    )
  },
)
ConversationThreadRoot.displayName = 'ConversationThread'

export const ConversationThread = Object.assign(ConversationThreadRoot, {
  MessageList: ThreadMessageList,
  Message: ThreadMessage,
  ComposeInput: ThreadComposeInput,
  TypingIndicator: ThreadTypingIndicator,
})
