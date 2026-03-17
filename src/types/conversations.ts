import type { OEXError } from './index'

// --- Client State ---

export type OEXConversationsClientState = 'uninitialized' | 'initializing' | 'initialized' | 'failed'

// --- Connection State ---

export type OEXConversationsConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'denied'

// --- Realtime Conversation ---

export interface OEXRealtimeConversation {
  /** Conversation SID */
  sid: string
  /** Unique name (if set) */
  uniqueName: string | null
  /** Friendly name (if set) */
  friendlyName: string | null
  /** Custom attributes (JSON) */
  attributes: Record<string, unknown>
  /** When the conversation was created */
  createdAt: Date | null
  /** When the conversation was last updated */
  updatedAt: Date | null
  /** Last message preview text */
  lastMessageText: string | null
  /** Last message timestamp */
  lastMessageAt: Date | null
  /** Number of unread messages (null if read horizon not set) */
  unreadCount: number | null
  /** Current user's last read message index */
  lastReadMessageIndex: number | null
}

// --- Realtime Message ---

export interface OEXRealtimeMessage {
  /** Message SID */
  sid: string
  /** Sequential message index */
  index: number
  /** Message body text */
  body: string | null
  /** Author identity */
  author: string | null
  /** When the message was created */
  createdAt: Date | null
  /** When the message was last updated */
  updatedAt: Date | null
  /** Custom attributes */
  attributes: Record<string, unknown>
  /** Media attachment SIDs */
  mediaSids: string[]
  /** Participant SID of the author */
  participantSid: string | null
  /** Message type */
  type: 'text' | 'media'
}

// --- Realtime Participant ---

export interface OEXRealtimeParticipant {
  /** Participant SID */
  sid: string
  /** User identity (for chat participants) */
  identity: string | null
  /** Participant type */
  type: 'chat' | 'sms' | 'whatsapp' | 'other'
  /** Last read message index */
  lastReadMessageIndex: number | null
  /** Last read timestamp */
  lastReadTimestamp: Date | null
  /** Custom attributes */
  attributes: Record<string, unknown>
}

// --- Provider Config ---

export interface OEXConversationsProviderConfig {
  /** Base URL of the OEX backend API */
  apiBaseUrl: string
  /** JWT auth token for the OEX backend */
  authToken: string
  /** Token endpoint path (default: '/api/conversations/token') */
  tokenUrl?: string
}

// --- Context Value ---

export interface OEXConversationsContextValue {
  /** Client initialization state */
  clientState: OEXConversationsClientState
  /** WebSocket connection state */
  connectionState: OEXConversationsConnectionState
  /** Whether the client is initialized and connected */
  isReady: boolean
  /** Current user identity */
  identity: string | null
  /** Current error */
  error: OEXError | null
}
