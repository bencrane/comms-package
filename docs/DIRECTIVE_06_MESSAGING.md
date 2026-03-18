# Directive 06: SMS Messaging Hooks

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** Directives 01–05 built the full voice calling surface: provider, calling hooks, audio devices, quality monitoring, preflight, disposition, hold, error catalog, and power dialer. This directive adds SMS messaging capabilities — the other half of the SDK's comms surface. Unlike voice (which uses the Twilio Voice JS SDK via WebRTC), messaging is entirely REST-based: all SMS operations go through the OEX backend endpoints via the existing `ApiClient`. No Twilio SDK is involved for messaging. The backend handles Twilio REST API calls, number provisioning, and webhook delivery. The SDK's job is to provide clean hooks for sending messages, tracking delivery status, listing message history, and viewing conversation threads.

Directive 01 built the API client (`src/services/api-client.ts`) and defined the SMS types in `src/types/api.ts`: `SendSmsRequest`, `SendSmsResponse`, `SmsMessageResponse`. Directive 02 built the `OEXCommsProvider` which creates the `ApiClient` and exposes it via `OEXCommsInternalContext`. Directive 03 added the internal context pattern that hooks use to access `apiClientRef`. This directive builds on all of that.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### OEX backend API contract (study SMS endpoints in full)
- `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md` — Three SMS endpoints:
  - `POST /api/sms` — Send SMS/MMS. Request: `{ to, body?, from_number?, messaging_service_sid?, media_url?, company_campaign_id?, company_campaign_lead_id? }`. Response: `SendSmsResponse { message_sid, status, direction, from_number, to }`. Validation: body or media_url required; max 10 media URLs; from_number and messaging_service_sid mutually exclusive.
  - `GET /api/sms/{message_sid}` — Get message status. Response: `SmsMessageResponse` (full message details with status, error_code, error_message, media_urls, segments, timestamps).
  - `GET /api/sms` — List messages with pagination. Query params: `direction`, `status`, `limit` (1–200, default 50), `offset` (default 0). Response: `SmsMessageResponse[]`.

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, key principles, hook conventions. **Critical:** "Hooks Never Throw" — errors returned as state. No Twilio types exposed (though for SMS there are none — it's all REST). API client handles retries on 429/503.

### Existing code (study — understand before building)
- `src/types/api.ts` — **critically important.** Already defines `SendSmsRequest`, `SendSmsResponse`, `SmsMessageResponse`. Study the exact field names and types. The messaging hooks use these directly for API calls but return SDK-defined types to consumers.
- `src/services/api-client.ts` — study `get<T>(path, params?)` and `post<T>(path, body?)` methods. All SMS hooks call these.
- `src/providers/OEXCommsProvider.tsx` — study `OEXCommsInternalContext` which exposes `apiClientRef`. The messaging hooks consume this context.
- `src/hooks/useDisposition.ts` — study the pattern: gets `apiClientRef` from internal context, manages loading/error/success state, calls `apiClientRef.current.post(...)`. The messaging hooks follow the same pattern.
- `src/hooks/useCallQuality.ts` — study how it subscribes/unsubscribes based on state changes. `useMessageStatus` follows a similar pattern for polling lifecycle.
- `src/index.ts` — current public exports. New hooks and types are appended here.

---

## Design overview

### SMS status lifecycle

Twilio message statuses flow through these values:

```
Outbound: queued → sending → sent → delivered
                                  → failed
                                  → undelivered
Inbound:  received
```

Terminal statuses (polling should stop): `delivered`, `failed`, `undelivered`, `received`.

### Three hooks, layered

```
useMessaging         — send + list messages (primary interface)
useMessageStatus     — poll single message delivery status
useConversation      — filtered thread view + scoped send for a phone number
```

`useMessaging` is the base — it provides `sendMessage()` and `messages` (list). `useMessageStatus` is standalone — it tracks one message's delivery. `useConversation` composes with `useMessaging` conceptually but manages its own API calls — it does not call `useMessaging` internally (to avoid coupling and double-fetching).

### SDK-defined types vs API types

The API types (`SendSmsRequest`, `SendSmsResponse`, `SmsMessageResponse`) use snake_case field names matching the backend. The SDK-defined types (`OEXMessage`, `OEXMessageDirection`, `OEXMessageStatus`) use camelCase and present a cleaner interface. Internal mapping functions convert between them. The consuming app never sees snake_case — only SDK types.

---

## Build 1: Messaging types

**File:** `src/types/messaging.ts` (new)

### `OEXMessageDirection`

```typescript
export type OEXMessageDirection = 'inbound' | 'outbound'
```

### `OEXMessageStatus`

```typescript
export type OEXMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered'
  | 'received'
```

### Terminal status constant

```typescript
export const TERMINAL_MESSAGE_STATUSES: readonly OEXMessageStatus[] = [
  'delivered',
  'failed',
  'undelivered',
  'received',
] as const
```

### `OEXMessage`

The SDK's public message type. Maps from `SmsMessageResponse`:

```typescript
export interface OEXMessage {
  /** Internal UUID */
  id: string
  /** Twilio Message SID */
  messageSid: string
  /** Message direction */
  direction: OEXMessageDirection
  /** Sender phone number */
  from: string
  /** Recipient phone number */
  to: string
  /** Message body text */
  body: string | null
  /** Delivery status */
  status: OEXMessageStatus
  /** Twilio error code if failed */
  errorCode: number | null
  /** Twilio error message if failed */
  errorMessage: string | null
  /** Number of SMS segments */
  segments: number | null
  /** Number of media attachments */
  mediaCount: number | null
  /** URLs of attached media (MMS) */
  mediaUrls: string[] | null
  /** When the message was sent */
  sentAt: string | null
  /** When the record was created */
  createdAt: string
  /** When the record was last updated */
  updatedAt: string
}
```

### `OEXSendMessageOptions`

```typescript
export interface OEXSendMessageOptions {
  /** Sender phone number (E.164). Mutually exclusive with messagingServiceSid. */
  fromNumber?: string
  /** Messaging Service SID for sender pool routing. Mutually exclusive with fromNumber. */
  messagingServiceSid?: string
  /** Media URLs to attach (MMS). Max 10. */
  mediaUrls?: string[]
  /** Associated campaign ID */
  campaignId?: string
  /** Associated campaign lead ID */
  campaignLeadId?: string
}
```

### `OEXMessageListParams`

```typescript
export interface OEXMessageListParams {
  /** Filter by direction */
  direction?: OEXMessageDirection
  /** Filter by status */
  status?: OEXMessageStatus
  /** Page size (1–200, default 50) */
  limit?: number
  /** Pagination offset (default 0) */
  offset?: number
}
```

### `OEXMessageStatusPollOptions`

```typescript
export interface OEXMessageStatusPollOptions {
  /** Polling interval in ms (default: 3000) */
  intervalMs?: number
  /** Stop polling after this many ms (default: 300000 = 5 min) */
  timeoutMs?: number
}
```

### Mapping function (internal, not exported from index)

```typescript
export function mapSmsResponseToOEXMessage(raw: SmsMessageResponse): OEXMessage {
  return {
    id: raw.id,
    messageSid: raw.message_sid,
    direction: raw.direction as OEXMessageDirection,
    from: raw.from_number,
    to: raw.to_number,
    body: raw.body,
    status: raw.status as OEXMessageStatus,
    errorCode: raw.error_code,
    errorMessage: raw.error_message,
    segments: raw.num_segments,
    mediaCount: raw.num_media,
    mediaUrls: raw.media_urls,
    sentAt: raw.date_sent,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}
```

### Re-export from types barrel

**File:** `src/types/index.ts` (modify)

Add:
```typescript
export * from './messaging'
```

---

## Build 2: useMessaging hook

**File:** `src/hooks/useMessaging.ts` (new)

### Hook signature and return type

```typescript
export interface UseMessagingReturn {
  /** Send an SMS/MMS message */
  sendMessage: (to: string, body: string, options?: OEXSendMessageOptions) => Promise<OEXMessage | null>
  /** Recent messages (from last fetchMessages/refreshMessages call) */
  messages: OEXMessage[]
  /** Fetch messages with optional filters and pagination */
  fetchMessages: (params?: OEXMessageListParams) => Promise<void>
  /** Re-fetch messages with the last used params */
  refreshMessages: () => Promise<void>
  /** Whether a send or fetch operation is in progress */
  isLoading: boolean
  /** Whether a send is in progress specifically */
  isSending: boolean
  /** Current error, or null */
  error: OEXError | null
}

export function useMessaging(): UseMessagingReturn
```

### Implementation

1. Get `apiClientRef` from `OEXCommsInternalContext`. Null-check with developer error message.
2. Manage local state: `messages` (OEXMessage[]), `isLoading`, `isSending`, `error`.
3. Store `lastFetchParams` in a ref for `refreshMessages`.

#### `sendMessage(to, body, options?)`

1. Set `isSending` to true, clear error.
2. Build the `SendSmsRequest` body:
   ```typescript
   {
     to,
     body,
     from_number: options?.fromNumber ?? null,
     messaging_service_sid: options?.messagingServiceSid ?? null,
     media_url: options?.mediaUrls ?? null,
     company_campaign_id: options?.campaignId ?? null,
     company_campaign_lead_id: options?.campaignLeadId ?? null,
   }
   ```
3. Call `apiClientRef.current.post<SendSmsResponse>('/api/sms', requestBody)`.
4. On success: fetch the full message details via `apiClientRef.current.get<SmsMessageResponse>(\`/api/sms/${response.message_sid}\`)`, map to `OEXMessage`, set `isSending` to false, return the `OEXMessage`.
5. On failure: set error from the thrown `OEXError`, set `isSending` to false, return null.

**Design note:** The `POST /api/sms` response returns a minimal `SendSmsResponse` (no body, no timestamps). To give the consumer a complete `OEXMessage`, we immediately fetch the full record via `GET /api/sms/{message_sid}`. If that fetch fails, we construct a partial `OEXMessage` from the `SendSmsResponse` with null fields for what we don't have.

#### `fetchMessages(params?)`

1. Set `isLoading` to true, clear error. Store params in `lastFetchParams` ref.
2. Build query params from `OEXMessageListParams`:
   ```typescript
   const queryParams: Record<string, string> = {}
   if (params?.direction) queryParams.direction = params.direction
   if (params?.status) queryParams.status = params.status
   if (params?.limit !== undefined) queryParams.limit = String(params.limit)
   if (params?.offset !== undefined) queryParams.offset = String(params.offset)
   ```
3. Call `apiClientRef.current.get<SmsMessageResponse[]>('/api/sms', queryParams)`.
4. Map each response to `OEXMessage` using `mapSmsResponseToOEXMessage`.
5. Set `messages`, `isLoading` to false.
6. On failure: set error, `isLoading` to false.

#### `refreshMessages()`

Calls `fetchMessages(lastFetchParams.current)`. If no prior fetch has been made, calls `fetchMessages()` with no params.

---

## Build 3: useMessageStatus hook

**File:** `src/hooks/useMessageStatus.ts` (new)

### Hook signature and return type

```typescript
export interface UseMessageStatusReturn {
  /** Current message details, or null if not yet fetched */
  message: OEXMessage | null
  /** Current delivery status */
  status: OEXMessageStatus | null
  /** Whether the message has reached a terminal status */
  isTerminal: boolean
  /** Whether polling is active */
  isPolling: boolean
  /** Current error, or null */
  error: OEXError | null
  /** Manually refresh the status (one-off fetch, independent of polling) */
  refresh: () => Promise<void>
  /** Start polling */
  startPolling: () => void
  /** Stop polling */
  stopPolling: () => void
}

export function useMessageStatus(
  messageSid: string | null,
  options?: OEXMessageStatusPollOptions,
): UseMessageStatusReturn
```

### Implementation

1. Get `apiClientRef` from `OEXCommsInternalContext`.
2. Manage local state: `message`, `status`, `isPolling`, `error`.
3. Derive `isTerminal` from `TERMINAL_MESSAGE_STATUSES.includes(status)`.

#### Fetch logic

`fetchStatus()` (internal):
1. If `messageSid` is null, return.
2. Call `apiClientRef.current.get<SmsMessageResponse>(\`/api/sms/${messageSid}\`)`.
3. Map to `OEXMessage`, update `message` and `status`.
4. If status is terminal, call `stopPolling()`.
5. On failure: set error.

#### Polling

- `startPolling()`: set `isPolling` to true.
- `stopPolling()`: set `isPolling` to false.
- Use a `useEffect` keyed on `isPolling`, `messageSid`, and the interval:
  ```typescript
  useEffect(() => {
    if (!isPolling || !messageSid) return

    // Fetch immediately on start
    fetchStatus()

    const interval = setInterval(() => {
      fetchStatus()
    }, options?.intervalMs ?? 3000)

    // Timeout: stop polling after timeoutMs
    const timeout = setTimeout(() => {
      stopPolling()
    }, options?.timeoutMs ?? 300000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [isPolling, messageSid])
  ```

- When `messageSid` changes, reset state (message to null, status to null, stop polling).
- On unmount, stop polling.

#### `refresh()`

One-off fetch (does not affect polling state). Calls `fetchStatus()`.

---

## Build 4: useConversation hook

**File:** `src/hooks/useConversation.ts` (new)

### Hook signature and return type

```typescript
export interface UseConversationReturn {
  /** Messages in this conversation thread, sorted chronologically (oldest first) */
  messages: OEXMessage[]
  /** Send a message to this conversation's phone number */
  send: (body: string, options?: Omit<OEXSendMessageOptions, 'fromNumber' | 'messagingServiceSid'>) => Promise<OEXMessage | null>
  /** Refresh the conversation thread */
  refresh: () => Promise<void>
  /** Whether messages are being loaded */
  isLoading: boolean
  /** Whether a send is in progress */
  isSending: boolean
  /** Current error, or null */
  error: OEXError | null
  /** The phone number this conversation is with */
  phoneNumber: string
}

export function useConversation(phoneNumber: string): UseConversationReturn
```

### Implementation

1. Get `apiClientRef` from `OEXCommsInternalContext`.
2. Manage local state: `messages`, `isLoading`, `isSending`, `error`.

#### Fetching the thread

`fetchThread()` (internal):
1. Fetch all messages from the API: `apiClientRef.current.get<SmsMessageResponse[]>('/api/sms', { limit: '200' })`.
2. Map each to `OEXMessage`.
3. Filter to messages where `from === phoneNumber` or `to === phoneNumber`.
4. Sort chronologically by `createdAt` (oldest first).
5. Set `messages`.

**Design note:** The OEX backend `GET /api/sms` endpoint does not support filtering by phone number — only by direction and status. So the conversation hook fetches all messages and filters client-side. This is acceptable for now (the endpoint caps at 200 results). A future backend enhancement could add phone number filtering. If the consuming app needs to page through more than 200 messages, it can call `fetchMessages` from `useMessaging` directly with offset pagination.

#### `refresh()`

Calls `fetchThread()`.

#### `send(body, options?)`

1. Set `isSending` to true, clear error.
2. Build request body:
   ```typescript
   {
     to: phoneNumber,
     body,
     media_url: options?.mediaUrls ?? null,
     company_campaign_id: options?.campaignId ?? null,
     company_campaign_lead_id: options?.campaignLeadId ?? null,
   }
   ```
   Note: `from_number` and `messaging_service_sid` are omitted — the backend uses the org default.
3. Call `apiClientRef.current.post<SendSmsResponse>('/api/sms', requestBody)`.
4. On success: fetch the full message via `GET /api/sms/${response.message_sid}`, map to `OEXMessage`, prepend/append to `messages` (append, since it's chronological), set `isSending` to false, return the `OEXMessage`.
5. On failure: set error, `isSending` to false, return null.

#### Auto-fetch on mount

Use a `useEffect` keyed on `phoneNumber` to call `fetchThread()` on mount and when the phone number changes. Reset messages when phone number changes.

---

## Build 5: Index exports

**File:** `src/index.ts` (modify)

Append to the existing exports:

```typescript
// Messaging types
export type {
  OEXMessageDirection,
  OEXMessageStatus,
  OEXMessage,
  OEXSendMessageOptions,
  OEXMessageListParams,
  OEXMessageStatusPollOptions,
} from './types'

export { TERMINAL_MESSAGE_STATUSES } from './types'

// Messaging hooks
export { useMessaging } from './hooks/useMessaging'
export { useMessageStatus } from './hooks/useMessageStatus'
export { useConversation } from './hooks/useConversation'
```

Do NOT remove any existing exports. Do NOT export `mapSmsResponseToOEXMessage` — it is internal.

---

## Build 6: Tests

**Files:**
- `tests/hooks/useMessaging.test.ts` (new)
- `tests/hooks/useMessageStatus.test.ts` (new)
- `tests/hooks/useConversation.test.ts` (new)

### Mocking strategy

Mock `apiClientRef.current` (the ApiClient instance). Provide a test wrapper that supplies both `OEXCommsContext` and `OEXCommsInternalContext` with a mocked `apiClientRef`.

For `useMessageStatus` polling tests, use `vi.useFakeTimers()`.

### `tests/hooks/useMessaging.test.ts` — useMessaging tests (8 tests)

1. `sendMessage` calls `POST /api/sms` with correct request body
2. `sendMessage` maps `to`, `body`, and options to snake_case request fields
3. `sendMessage` returns mapped `OEXMessage` on success
4. `sendMessage` sets error on API failure
5. `fetchMessages` calls `GET /api/sms` with query params
6. `fetchMessages` maps response array to `OEXMessage[]`
7. `refreshMessages` re-fetches with last used params
8. `isSending` is true during send, false after

### `tests/hooks/useMessageStatus.test.ts` — useMessageStatus tests (7 tests)

1. Returns null message and status when messageSid is null
2. `refresh()` fetches message and maps to OEXMessage
3. `startPolling()` fetches immediately and at intervals
4. Polling stops when status reaches terminal state (delivered)
5. Polling stops when status reaches terminal state (failed)
6. `stopPolling()` clears the interval
7. Status resets when messageSid changes

### `tests/hooks/useConversation.test.ts` — useConversation tests (7 tests)

1. Fetches messages on mount and filters by phone number
2. Returns only messages matching the conversation phone number
3. Messages are sorted chronologically (oldest first)
4. `send()` calls `POST /api/sms` with `to` set to the conversation phone number
5. `send()` appends the new message to the thread
6. `refresh()` re-fetches and re-filters the thread
7. Resets messages when phoneNumber prop changes

Total: **22 new tests**. Combined with 107 existing = **129 total**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/types/messaging.ts`
- `src/hooks/useMessaging.ts`
- `src/hooks/useMessageStatus.ts`
- `src/hooks/useConversation.ts`
- `tests/hooks/useMessaging.test.ts`
- `tests/hooks/useMessageStatus.test.ts`
- `tests/hooks/useConversation.test.ts`

Files to modify:
- `src/types/index.ts` — add `export * from './messaging'`
- `src/index.ts` — add new type and hook exports

Files that must NOT be modified:
- `src/providers/OEXCommsProvider.tsx`
- `src/services/api-client.ts`
- `src/services/token-manager.ts`
- `src/services/event-bus.ts`
- `src/types/api.ts`
- `src/types/events.ts`
- `src/types/voice.ts`
- `src/utils/errors.ts`
- `src/utils/constants.ts`
- `src/hooks/useVoice.ts`
- `src/hooks/useDevice.ts`
- `src/hooks/useDisposition.ts`
- `src/hooks/useCallActions.ts`
- `src/hooks/useAudioDevices.ts`
- `src/hooks/useCallQuality.ts`
- `src/hooks/usePreflight.ts`
- `src/hooks/usePowerDialer.ts`
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add SMS messaging hooks — useMessaging, useMessageStatus, useConversation (directive 06)`

---

## Build order

1. **Build 1**: Types → `src/types/messaging.ts`, `src/types/index.ts`
2. **Build 2**: useMessaging → `src/hooks/useMessaging.ts`
3. **Build 3**: useMessageStatus → `src/hooks/useMessageStatus.ts`
4. **Build 4**: useConversation → `src/hooks/useConversation.ts`
5. **Build 5**: Index exports → `src/index.ts`
6. **Build 6**: Tests → all test files

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `src/types/messaging.ts` defines `OEXMessageDirection`, `OEXMessageStatus`, `TERMINAL_MESSAGE_STATUSES`, `OEXMessage`, `OEXSendMessageOptions`, `OEXMessageListParams`, `OEXMessageStatusPollOptions`, and `mapSmsResponseToOEXMessage`.
(c) Confirm `OEXMessage` uses camelCase field names (not snake_case) and maps from `SmsMessageResponse`.
(d) Confirm `useMessaging` calls `POST /api/sms` for sends and `GET /api/sms` for listing, with correct request/query shapes.
(e) Confirm `sendMessage` fetches the full message record after send (GET by message_sid) to return a complete `OEXMessage`.
(f) Confirm `useMessageStatus` polls at configurable intervals, stops on terminal status, and stops on timeout.
(g) Confirm `useConversation` filters messages by phone number and sorts chronologically.
(h) Confirm `useConversation.send()` scopes the `to` field to the conversation phone number.
(i) Confirm `mapSmsResponseToOEXMessage` is NOT exported from `src/index.ts`.
(j) Confirm `src/index.ts` exports all 3 new hooks, all new types, and `TERMINAL_MESSAGE_STATUSES`.
(k) Confirm `pnpm build` succeeds.
(l) Confirm `pnpm test` passes with 129 tests (107 existing + 22 new).
(m) Confirm no files outside ALLOWED_FILES were modified.
(n) Confirm protected files were NOT modified.
