# Directive 07: Real-Time Messaging via Twilio Conversations SDK

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** Directives 01–06 built the full voice calling surface and REST-based SMS messaging. Directive 06 added `useMessaging` (send/list SMS via REST), `useMessageStatus` (poll delivery status), and `useConversation` (thread view filtered by phone number). Those hooks operate through the OEX backend REST API — they send an HTTP request and get a response. There is no real-time push. This directive adds a real-time messaging layer using `@twilio/conversations` — a WebSocket-based SDK that provides instant message delivery, typing indicators, read receipts, and participant presence. The REST hooks from Directive 06 remain unchanged — this builds alongside them for apps that need real-time messaging.

The Conversations SDK is a separate Twilio product from Voice. It uses its own client (`Client` from `@twilio/conversations`), its own token grant (`ChatGrant`, not `VoiceGrant`), and its own WebSocket connection. This means a **separate token endpoint** is required on the OEX backend, and a **separate provider** is needed in the SDK to manage the Conversations Client lifecycle.

**Backend prerequisite:** The OEX backend currently has `GET /api/voice/token` which returns a token with `VoiceGrant`. Conversations requires a token with `ChatGrant` scoped to a Chat Service SID. The backend must implement a new endpoint: `GET /api/conversations/token` returning `{ token: string, identity: string, ttl_seconds: number }` (same shape as the voice token response). **This backend work must be completed before this directive's hooks can function in production.** The hooks are designed and tested against mocks — they will work as soon as the backend endpoint exists.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### Twilio Conversations SDK docs (study extensively)
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/01-getting-started/01-sdk-overview.md` — Client initialization: `new Client(token)`, `stateChanged` event (`"initialized"` / `"failed"`), token events (`tokenAboutToExpire` / `tokenExpired`), connection states (connecting/connected/disconnecting/disconnected/denied), `client.shutdown()`.
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/01-getting-started/02-event-handling.md` — Event-driven architecture. Events on Client, Conversation, Participant, Message. Best practice: listen at Client level.
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/01-getting-started/03-working-with-conversations.md` — `client.getSubscribedConversations()`, `conversation.getMessages(pageSize, anchor, direction)`, `conversation.getParticipants()`, `conversation.join()`, `conversation.leave()`, `conversation.add(identity)`.
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/01-getting-started/04-sending-messages-and-media.md` — `conversation.sendMessage('text')`, `conversation.prepareMessage().setBody().addMedia().build().send()`.
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/02-more-sdk-resources/05-typing-indicator.md` — `conversation.typing()` (throttled to 5s), `typingStarted`/`typingEnded` events on Conversation.
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/01-getting-started/06-read-horizon-and-read-status-overview.md` — `conversation.setAllMessagesRead()`, `conversation.advanceLastReadMessageIndex(index)`, `conversation.getUnreadMessagesCount()`, `participant.lastReadMessageIndex`.
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/02-more-sdk-resources/06-best-practices-using-the-conversations-sdk.md` — **Critical:** No shutdown/create cycle on network drops (SDK auto-reconnects). Only shutdown on logout. Subscribe to `conversationAdded` BEFORE `getSubscribedConversations()`. Messages NOT fetched on load — call `getMessages()` explicitly.
- `docs/SDK_REFERENCE_ASSESSMENT.md` — Cross-SDK comparison table and Conversations integration points section at the bottom.

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, key principles. **Critical:** "Never Expose Twilio" — all Twilio Conversations types map to SDK-defined types. "Hooks Never Throw" — errors as state. "Token Refresh Is Invisible."

### Existing code (study before building)
- `src/providers/OEXCommsProvider.tsx` — **critically important.** Study the Voice Device initialization pattern: token fetch → create Device → wire events → register → wire token refresh. The Conversations provider follows the same pattern with a different SDK.
- `src/services/api-client.ts` — study `get<T>()` for the token fetch call.
- `src/services/token-manager.ts` — study the auto-refresh pattern. Conversations needs its own token manager instance (different endpoint).
- `src/types/voice.ts` — study how Voice types are SDK-defined wrappers over Twilio types. Messaging types follow the same pattern.
- `src/hooks/useConversation.ts` — the existing REST-based conversation hook. The new `useRealtimeConversation` complements it.
- `src/index.ts` — current exports. New provider, hooks, and types are appended.

---

## Design overview

### Why a separate provider

The Conversations SDK is an entirely separate product from Voice. It has its own:
- **Client object** (`Client` from `@twilio/conversations`) vs Voice's `Device`
- **Token grant** (`ChatGrant`) vs Voice's `VoiceGrant`
- **Connection state model** (connecting/connected/disconnecting/disconnected/denied) vs Voice's Device.State
- **Lifecycle** (`shutdown()` vs `destroy()`)

Putting both in `OEXCommsProvider` would bloat a provider that's already 460+ lines and force Conversations initialization on every app that only needs voice. Instead, `OEXConversationsProvider` is a separate, optional provider that:
- Can wrap inside or alongside `OEXCommsProvider`
- Is lazy — only initializes when mounted
- Shares the same `apiBaseUrl` and `authToken` props pattern
- Has its own internal context for the Conversations Client ref

### Provider nesting in the consuming app

```tsx
<OEXCommsProvider apiBaseUrl={url} authToken={jwt}>
  <OEXConversationsProvider apiBaseUrl={url} authToken={jwt}>
    <App />
  </OEXConversationsProvider>
</OEXCommsProvider>
```

Or if the app only needs messaging:
```tsx
<OEXConversationsProvider apiBaseUrl={url} authToken={jwt}>
  <App />
</OEXConversationsProvider>
```

### Token endpoint

The provider calls `GET /api/conversations/token` via a new `ApiClient` instance (same pattern as the voice provider). The response shape matches `VoiceTokenResponse`: `{ token, identity, ttl_seconds }`. Reuse the same type — it's the same structure.

If the consuming app needs a custom token URL (e.g., the backend hasn't added `/api/conversations/token` yet), the provider accepts an optional `tokenUrl` prop (default: `/api/conversations/token`).

### Conversations Client lifecycle

1. Provider mounts → creates ApiClient → fetches token from `tokenUrl`
2. Creates `new Client(token)` from `@twilio/conversations`
3. Subscribes to `stateChanged` → waits for `"initialized"`
4. Subscribes to `connectionStateChanged` → tracks connection state
5. Subscribes to `tokenAboutToExpire` → fetches new token → `client.updateToken()`
6. Subscribes to `tokenExpired` → fetches new token → `client.updateToken()` (fallback)
7. Subscribes to `conversationAdded` / `conversationRemoved` / `conversationUpdated` → tracks conversation list
8. On unmount → `client.shutdown()`

### Type mapping

| Twilio Type | SDK Type | Notes |
|-------------|----------|-------|
| Client state (`"initialized"`) | `OEXConversationsClientState` | String union |
| Client connection state | `OEXConversationsConnectionState` | String union |
| Conversation | `OEXRealtimeConversation` | Metadata + unread count |
| Message | `OEXRealtimeMessage` | camelCase, media URLs resolved |
| Participant | `OEXRealtimeParticipant` | identity + typing state |

---

## Build 1: Add `@twilio/conversations` dependency

**Action:** Add `@twilio/conversations` as a regular dependency (not peer dep — same as `@twilio/voice-sdk`).

Run:
```bash
pnpm add @twilio/conversations
```

This updates `package.json` and `pnpm-lock.yaml`.

---

## Build 2: Messaging types

**File:** `src/types/conversations.ts` (new)

### `OEXConversationsClientState`

```typescript
export type OEXConversationsClientState = 'uninitialized' | 'initializing' | 'initialized' | 'failed'
```

### `OEXConversationsConnectionState`

```typescript
export type OEXConversationsConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'denied'
```

### `OEXRealtimeConversation`

```typescript
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
```

### `OEXRealtimeMessage`

```typescript
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
```

### `OEXRealtimeParticipant`

```typescript
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
```

### `OEXConversationsProviderConfig`

```typescript
export interface OEXConversationsProviderConfig {
  /** Base URL of the OEX backend API */
  apiBaseUrl: string
  /** JWT auth token for the OEX backend */
  authToken: string
  /** Token endpoint path (default: '/api/conversations/token') */
  tokenUrl?: string
}
```

### `OEXConversationsContextValue`

```typescript
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
```

### Re-export from types barrel

**File:** `src/types/index.ts` (modify)

Add:
```typescript
export * from './conversations'
```

---

## Build 3: OEXConversationsProvider

**File:** `src/providers/OEXConversationsProvider.tsx` (new)

### Internal context

Create an internal context (same pattern as `OEXCommsInternalContext`):

```typescript
interface OEXConversationsInternalContextValue {
  clientRef: React.RefObject<Client | null>
  apiClientRef: React.RefObject<ApiClient | null>
}

export const OEXConversationsContext = createContext<OEXConversationsContextValue | null>(null)
export const OEXConversationsInternalContext = createContext<OEXConversationsInternalContextValue | null>(null)
```

`OEXConversationsContext` is the public context (hooks read state from it). `OEXConversationsInternalContext` is internal (hooks read `clientRef` from it).

### Provider component

```typescript
interface OEXConversationsProviderProps {
  apiBaseUrl: string
  authToken: string
  tokenUrl?: string
  children: ReactNode
}

export function OEXConversationsProvider({
  apiBaseUrl,
  authToken,
  tokenUrl = '/api/conversations/token',
  children,
}: OEXConversationsProviderProps)
```

### State management

Use `useReducer` with state:

```typescript
interface ConversationsState {
  clientState: OEXConversationsClientState
  connectionState: OEXConversationsConnectionState
  identity: string | null
  error: OEXError | null
}
```

Actions:
```typescript
type ConversationsAction =
  | { type: 'CLIENT_STATE_CHANGED'; state: OEXConversationsClientState }
  | { type: 'CONNECTION_STATE_CHANGED'; state: OEXConversationsConnectionState }
  | { type: 'IDENTITY_SET'; identity: string }
  | { type: 'ERROR'; error: OEXError }
  | { type: 'CLEAR_ERROR' }
```

### Initialization effect

Keyed on `[apiBaseUrl, authToken, tokenUrl]`:

1. Create `ApiClient` with `{ apiBaseUrl, authToken }`. Store in `apiClientRef`.
2. Fetch token: `apiClient.get<VoiceTokenResponse>(tokenUrl)` — reuse `VoiceTokenResponse` type since the shape is identical.
3. Create `new Client(token)` from `@twilio/conversations`. Store in `clientRef`.
4. Wire events:
   - `client.on('stateChanged', (state) => ...)`:
     - `"initialized"` → dispatch `CLIENT_STATE_CHANGED` with `'initialized'`, dispatch `IDENTITY_SET` with identity from token response.
     - `"failed"` → dispatch `CLIENT_STATE_CHANGED` with `'failed'`, dispatch `ERROR`.
   - `client.on('connectionStateChanged', (state) => ...)` → dispatch `CONNECTION_STATE_CHANGED` mapping the Twilio state string to `OEXConversationsConnectionState`.
   - `client.on('tokenAboutToExpire', async () => ...)`:
     - Fetch new token via `apiClient.get<VoiceTokenResponse>(tokenUrl)`.
     - Call `client.updateToken(newToken)`.
     - On failure: dispatch `ERROR`.
   - `client.on('tokenExpired', async () => ...)`:
     - Same as `tokenAboutToExpire` — fetch and update. If update fails, the client enters `"denied"` state.
5. Cleanup: `client.shutdown()`, clear refs.

### Context assembly

```typescript
const contextValue = useMemo<OEXConversationsContextValue>(() => ({
  clientState: state.clientState,
  connectionState: state.connectionState,
  isReady: state.clientState === 'initialized' && state.connectionState === 'connected',
  identity: state.identity,
  error: state.error,
}), [state])
```

Render with nested providers (internal wraps public).

---

## Build 4: useRealtimeConversation hook

**File:** `src/hooks/useRealtimeConversation.ts` (new)

### Hook signature

```typescript
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

export function useRealtimeConversation(conversationSid: string): UseRealtimeConversationReturn
```

### Implementation

1. Get `clientRef` from `OEXConversationsInternalContext` and `clientState` from `OEXConversationsContext`.
2. Store the Twilio `Conversation` object in a ref.
3. Store the paginator for message loading in a ref (for `loadMoreMessages`).

#### Conversation fetch effect

When `clientState` is `'initialized'` and `conversationSid` is provided:

1. Fetch the conversation: `clientRef.current.getConversationBySid(conversationSid)`.
2. Store in ref. Map to `OEXRealtimeConversation` for the public `conversation` field.
3. Fetch initial messages: `conversation.getMessages(30)`. Map each to `OEXRealtimeMessage`. Store paginator ref for `loadMoreMessages`.
4. Fetch participants: `conversation.getParticipants()`. Map each to `OEXRealtimeParticipant`.
5. Get unread count: `conversation.getUnreadMessagesCount()`.
6. Get last read index: `conversation.lastReadMessageIndex`.

#### Event subscriptions

Subscribe to the Conversation events:

- `messageAdded` → append to messages array, map to `OEXRealtimeMessage`
- `messageUpdated` → update the message in the array
- `messageRemoved` → remove from the array
- `participantJoined` → add to participants array
- `participantLeft` → remove from participants array
- `participantUpdated` → update in participants array (includes read horizon changes)
- `typingStarted` → add participant to `participantsTyping` (filter out self by identity)
- `typingEnded` → remove participant from `participantsTyping`
- `updated` → update `conversation` metadata

Clean up all subscriptions when `conversationSid` changes or on unmount.

#### Mapping functions (internal to this file)

```typescript
function mapMessage(msg: TwilioMessage): OEXRealtimeMessage {
  return {
    sid: msg.sid,
    index: msg.index,
    body: msg.body,
    author: msg.author,
    createdAt: msg.dateCreated,
    updatedAt: msg.dateUpdated,
    attributes: (msg.attributes as Record<string, unknown>) ?? {},
    mediaSids: msg.attachedMedia?.map(m => m.sid) ?? [],
    participantSid: msg.participantSid,
    type: msg.type === 'media' ? 'media' : 'text',
  }
}

function mapParticipant(p: TwilioParticipant): OEXRealtimeParticipant {
  return {
    sid: p.sid,
    identity: p.identity,
    type: mapParticipantType(p.type),
    lastReadMessageIndex: p.lastReadMessageIndex,
    lastReadTimestamp: p.lastReadTimestamp,
    attributes: (p.attributes as Record<string, unknown>) ?? {},
  }
}
```

These use Twilio types internally (imported from `@twilio/conversations`) but are NOT exported.

#### `sendMessage(body)`

```typescript
await conversationRef.current.sendMessage(body)
```

Wrapped in try/catch. On error, set error state.

#### `sendMedia(file, contentType, filename?)`

```typescript
const builder = conversationRef.current.prepareMessage()
builder.addMedia({ contentType, filename: filename ?? 'attachment', media: file })
await builder.build().send()
```

#### `sendTyping()`

```typescript
conversationRef.current.typing()
```

Twilio SDK throttles this to once per 5 seconds internally.

#### `setAllMessagesRead()`

```typescript
await conversationRef.current.setAllMessagesRead()
```

Update `lastReadMessageIndex` and `unreadCount` after.

#### `loadMoreMessages()`

Use the stored paginator:
```typescript
if (paginatorRef.current?.hasPrevPage) {
  const prevPage = await paginatorRef.current.prevPage()
  paginatorRef.current = prevPage
  const olderMessages = prevPage.items.map(mapMessage)
  setMessages(prev => [...olderMessages, ...prev])
}
```

`hasMoreMessages` derives from `paginatorRef.current?.hasPrevPage ?? false`.

---

## Build 5: useConversationList hook

**File:** `src/hooks/useConversationList.ts` (new)

### Hook signature

```typescript
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

export function useConversationList(): UseConversationListReturn
```

### Implementation

1. Get `clientRef` from `OEXConversationsInternalContext` and `clientState` from `OEXConversationsContext`.
2. Manage state: `conversations`, `isLoading`, `error`.

#### Fetch effect

When `clientState` is `'initialized'`:

1. **Important (from best practices):** Subscribe to `conversationAdded` on the Client BEFORE calling `getSubscribedConversations()` to avoid missing items.
2. Call `clientRef.current.getSubscribedConversations()`.
3. Paginate through all pages to build the full list.
4. For each conversation, get `getUnreadMessagesCount()` and `lastMessage` to populate the `OEXRealtimeConversation` fields.

#### Client-level event subscriptions

Subscribe on the Client (not individual conversations — per best practices):

- `conversationAdded` → add to list, fetch its unread count
- `conversationRemoved` → remove from list
- `conversationUpdated` → update in list (re-map metadata, last message, etc.)

#### Mapping function

```typescript
async function mapConversation(conv: TwilioConversation): Promise<OEXRealtimeConversation> {
  const unreadCount = await conv.getUnreadMessagesCount()
  const lastMessage = await conv.getMessages(1) // get latest
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
```

**Note:** `getUnreadMessagesCount()` and `getMessages(1)` are async per-conversation calls. For the initial load, batch these. For event-driven updates, update only the affected conversation.

---

## Build 6: Index exports

**File:** `src/index.ts` (modify)

Append to the existing exports:

```typescript
// Conversations types
export type {
  OEXConversationsClientState,
  OEXConversationsConnectionState,
  OEXRealtimeConversation,
  OEXRealtimeMessage,
  OEXRealtimeParticipant,
  OEXConversationsProviderConfig,
  OEXConversationsContextValue,
} from './types'

// Conversations provider
export { OEXConversationsProvider } from './providers/OEXConversationsProvider'

// Conversations hooks
export { useRealtimeConversation } from './hooks/useRealtimeConversation'
export { useConversationList } from './hooks/useConversationList'
```

Do NOT export `OEXConversationsInternalContext` — it is internal.

---

## Build 7: Tests

**Files:**
- `tests/providers/OEXConversationsProvider.test.tsx` (new)
- `tests/hooks/useRealtimeConversation.test.ts` (new)
- `tests/hooks/useConversationList.test.ts` (new)

### Mocking strategy

Mock `@twilio/conversations` at the module level:

```typescript
vi.mock('@twilio/conversations', () => {
  return {
    Client: vi.fn(),
  }
})
```

The mock Client constructor returns an EventEmitter-like object with `on`, `shutdown`, `getConversationBySid`, `getSubscribedConversations`, and `updateToken` methods.

Mock `src/services/api-client.ts` for token fetching.

### `tests/providers/OEXConversationsProvider.test.tsx` — Provider tests (7 tests)

1. Fetches token from `/api/conversations/token` on mount
2. Creates Conversations Client with the fetched token
3. Dispatches `clientState: 'initialized'` when stateChanged fires with "initialized"
4. Dispatches `clientState: 'failed'` when stateChanged fires with "failed"
5. Handles `tokenAboutToExpire` by fetching new token and calling client.updateToken
6. Calls `client.shutdown()` on unmount
7. Accepts custom `tokenUrl` prop

### `tests/hooks/useRealtimeConversation.test.ts` — Realtime conversation tests (8 tests)

1. Fetches conversation by SID when client is initialized
2. Loads initial messages and maps to OEXRealtimeMessage
3. Appends new message on `messageAdded` event
4. `sendMessage` calls `conversation.sendMessage`
5. `sendTyping` calls `conversation.typing()`
6. Tracks `participantsTyping` from typingStarted/typingEnded events
7. `setAllMessagesRead` calls `conversation.setAllMessagesRead()`
8. `loadMoreMessages` fetches previous page from paginator

### `tests/hooks/useConversationList.test.ts` — Conversation list tests (5 tests)

1. Fetches subscribed conversations when client is initialized
2. Maps conversations to OEXRealtimeConversation with unread counts
3. Adds conversation on `conversationAdded` event
4. Removes conversation on `conversationRemoved` event
5. Updates conversation on `conversationUpdated` event

Total: **20 new tests**. Combined with 129 existing = **149 total**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/types/conversations.ts`
- `src/providers/OEXConversationsProvider.tsx`
- `src/hooks/useRealtimeConversation.ts`
- `src/hooks/useConversationList.ts`
- `tests/providers/OEXConversationsProvider.test.tsx`
- `tests/hooks/useRealtimeConversation.test.ts`
- `tests/hooks/useConversationList.test.ts`

Files to modify:
- `package.json` — add `@twilio/conversations` dependency
- `pnpm-lock.yaml` — updated by pnpm install
- `src/types/index.ts` — add `export * from './conversations'`
- `src/index.ts` — add new provider, hook, and type exports

Files that must NOT be modified:
- `src/providers/OEXCommsProvider.tsx`
- `src/hooks/useVoice.ts`
- `src/hooks/useDevice.ts`
- `src/hooks/useDisposition.ts`
- `src/hooks/useCallActions.ts`
- `src/hooks/useAudioDevices.ts`
- `src/hooks/useCallQuality.ts`
- `src/hooks/usePreflight.ts`
- `src/hooks/usePowerDialer.ts`
- `src/hooks/useMessaging.ts`
- `src/hooks/useMessageStatus.ts`
- `src/hooks/useConversation.ts`
- `src/services/` (entire directory)
- `src/types/api.ts`
- `src/types/events.ts`
- `src/types/voice.ts`
- `src/types/messaging.ts`
- `src/utils/` (entire directory)
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add real-time messaging with OEXConversationsProvider, useRealtimeConversation, useConversationList (directive 07)`

---

## Build order

1. **Build 1**: Add dependency → `pnpm add @twilio/conversations`
2. **Build 2**: Types → `src/types/conversations.ts`, `src/types/index.ts`
3. **Build 3**: Provider → `src/providers/OEXConversationsProvider.tsx`
4. **Build 4**: useRealtimeConversation → `src/hooks/useRealtimeConversation.ts`
5. **Build 5**: useConversationList → `src/hooks/useConversationList.ts`
6. **Build 6**: Index exports → `src/index.ts`
7. **Build 7**: Tests → all test files

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `@twilio/conversations` is in `package.json` as a regular dependency (not peer dep).
(c) Confirm `src/types/conversations.ts` defines `OEXConversationsClientState`, `OEXConversationsConnectionState`, `OEXRealtimeConversation`, `OEXRealtimeMessage`, `OEXRealtimeParticipant`, `OEXConversationsProviderConfig`, `OEXConversationsContextValue` — all without Twilio type imports.
(d) Confirm `OEXConversationsProvider` creates a Conversations Client on mount, wires `stateChanged`/`connectionStateChanged`/`tokenAboutToExpire`/`tokenExpired`, and calls `client.shutdown()` on unmount.
(e) Confirm the provider fetches from `tokenUrl` prop (default `/api/conversations/token`) and handles token refresh via `client.updateToken()`.
(f) Confirm `OEXConversationsInternalContext` is NOT exported from `src/index.ts`.
(g) Confirm `useRealtimeConversation` fetches a conversation by SID, loads messages, subscribes to `messageAdded`/`messageUpdated`/`messageRemoved`/`typingStarted`/`typingEnded`/`participantJoined`/`participantLeft`/`participantUpdated`, and maps all Twilio types to SDK types.
(h) Confirm `useConversationList` subscribes to `conversationAdded` BEFORE calling `getSubscribedConversations()` (per Twilio best practices).
(i) Confirm no Twilio Conversations types are exported from `src/index.ts`.
(j) Confirm `src/index.ts` exports the provider, 2 new hooks, and all new types.
(k) Confirm `pnpm build` succeeds.
(l) Confirm `pnpm test` passes with 149 tests (129 existing + 20 new).
(m) Confirm no files outside ALLOWED_FILES were modified.
(n) Confirm protected files were NOT modified.
