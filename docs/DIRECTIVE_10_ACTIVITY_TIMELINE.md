# Directive 10: Activity Timeline — useActivityTimeline Hook and ActivityTimeline Component

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** This SDK provides React hooks and headless components for browser-based voice calling and messaging. Directives 01–09 built the full hook layer (voice, SMS, real-time messaging, power dialer) and the headless component layer (CallBar, Dialer, AudioDeviceSelector, IncomingCallBanner, PowerDialerPanel, ConversationThread, ConversationList). All hooks access the OEX backend via `ApiClient` (in `src/services/api-client.ts`), obtained from `OEXCommsInternalContext` exposed by `OEXCommsProvider`.

This directive adds a **cross-channel activity timeline** — a new `useActivityTimeline` hook and a headless `ActivityTimeline` component. The hook calls `GET /api/activity/timeline` on the OEX backend (built in backend Directive 30) and returns a chronological feed of events across all communication channels: voice calls, SMS messages, emails, LinkedIn messages, direct mail, campaign events, and AI drafts. The component renders this feed as a headless, styleable list with channel-aware data attributes.

The timeline is scoped by entity — a consuming app passes `leadId`, `companyId`, or `campaignId` to see all interactions for that entity. This lets a consuming app drop `<ActivityTimeline leadId="..." />` on a lead detail page and get the full interaction history across every channel.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, project structure, key principles. **Critical:** hooks are the primary interface, components are optional. "Never Expose Twilio" (irrelevant for timeline, but the pattern of provider-agnostic types applies). Hooks never throw — they return `error` state. API calls go through `ApiClient`.

### Existing patterns to follow (study extensively)
- `src/hooks/useMessaging.ts` — **critically important.** This is the closest pattern to what `useActivityTimeline` needs: REST API call via `apiClientRef`, list state, loading/error state, pagination params, `refreshMessages()` with cached params. Study: how it accesses `apiClientRef` from `OEXCommsInternalContext`, how it builds query params from typed filter objects, how it manages `lastFetchParamsRef` for refresh.
- `src/components/ConversationList.tsx` — **critically important.** The closest component pattern: list of items, internal context for subcomponents, `forwardRef`, `data-*` attributes, `Object.assign` compound pattern, render props on items.
- `src/services/api-client.ts` — The HTTP client. Study `get<T>(path, params?)` — the timeline hook calls this with query string params. Params are `Record<string, string>`.

### Types to reference
- `src/types/index.ts` — `OEXError` interface (code, message, recoverable). All new types must follow this pattern.
- `src/types/messaging.ts` — Study `OEXMessageListParams` for how filter param types are defined (optional fields, typed values).

---

## Existing code to read before starting

Study these files to learn the SDK's conventions. Match them exactly.

### Package foundation
- `CLAUDE.md` — conventions, architecture, project structure
- `package.json` — dependencies, peer deps, build scripts
- `tsconfig.json` — TypeScript configuration, strict mode settings
- `src/index.ts` — public exports (only what's in this file is part of the public API)

### Hooks (study for patterns)
- `src/hooks/useMessaging.ts` — **critically important.** Study the complete hook: context access, state management, query param construction, fetch/refresh/error pattern. `useActivityTimeline` follows this pattern almost exactly.
- `src/hooks/useConversation.ts` — Study the auto-fetch on mount pattern (fetches when `phoneNumber` changes via `useEffect`). Timeline should similarly auto-fetch on mount and when filter props change.

### Components (study for patterns)
- `src/components/ConversationList.tsx` — **critically important.** Study the compound component pattern: internal context, `forwardRef`, `Object.assign`, `ListItem` subcomponent, `data-*` attributes, render props, default content, error/loading states.
- `src/components/ConversationThread.tsx` — Study the `load-more` button pattern and how `data-state` is computed from `isLoading`/`error`.

### Internal context access
- `src/providers/OEXCommsProvider.tsx` — Study `OEXCommsInternalContext` export. The timeline hook imports and uses this context for `apiClientRef` access. The hook must be used within `<OEXCommsProvider>`.

---

## Design overview

### Backend API contract

`GET /api/activity/timeline` returns:

```json
{
  "entries": [
    {
      "id": "uuid",
      "source_table": "voice_sessions",
      "timestamp": "2026-03-17T14:30:00Z",
      "channel": "voice",
      "event_type": "call_completed",
      "direction": "outbound",
      "summary": "Call to +15551234567 (45s)",
      "lead_id": "uuid-or-null",
      "campaign_id": "uuid-or-null",
      "company_id": "uuid-or-null",
      "metadata": {}
    }
  ],
  "total_fetched": 50,
  "limit": 50,
  "offset": 0
}
```

Query parameters (all optional):
- `lead_id` — filter by lead UUID
- `company_id` — filter by company UUID
- `campaign_id` — filter by campaign UUID
- `channel` — comma-separated list of channels (e.g., `"voice,sms"`)
- `direction` — `"inbound"` or `"outbound"`
- `after` — ISO 8601 timestamp, return entries after this time
- `before` — ISO 8601 timestamp, return entries before this time
- `limit` — page size (default 50)
- `offset` — pagination offset (default 0)

### Channel values

The `channel` field is a string union:
- `voice` — phone calls (from `voice_sessions`)
- `sms` — text messages (from `sms_messages`)
- `email` — emails (from `email_messages`)
- `linkedin` — LinkedIn messages (from `linkedin_messages`)
- `direct_mail` — physical mail (from `direct_mail_sends`)
- `ai` — AI-generated drafts (from `ai_drafts`)

### Event type values

The `event_type` field varies by channel. Common values include:
- Voice: `call_completed`, `call_missed`, `call_failed`, `voicemail_left`
- SMS: `sms_sent`, `sms_received`, `sms_failed`
- Email: `email_sent`, `email_received`, `email_opened`, `email_clicked`, `email_bounced`
- LinkedIn: `linkedin_sent`, `linkedin_received`, `linkedin_connection_request`
- Direct mail: `mail_sent`, `mail_delivered`, `mail_returned`
- AI: `draft_created`, `draft_approved`, `draft_sent`

The SDK should not enumerate all possible event types — treat `event_type` as a `string` since the backend may add new types without SDK changes.

### Hook architecture

`useActivityTimeline` follows the `useMessaging` pattern:

1. Access `apiClientRef` from `OEXCommsInternalContext`
2. Accept filter params (lead_id, channel, date range, etc.)
3. Call `GET /api/activity/timeline` with query params
4. Return entries, loading state, error state, pagination helpers
5. Support `loadMore()` that appends results (offset-based pagination)
6. Support `refresh()` that re-fetches with the same params

### Component architecture

```
ActivityTimeline (calls useActivityTimeline → provides context)
  ├── ActivityTimeline.Entry (single timeline event)
  ├── ActivityTimeline.Filters (channel toggles, date range — optional)
  └── ActivityTimeline.LoadMore (pagination trigger)
```

The component accepts entity filter props directly (`leadId`, `companyId`, `campaignId`) and passes them through to the hook.

---

## Build 1: Types

**File:** `src/types/timeline.ts` (new)

### `OEXTimelineChannel`

```typescript
export type OEXTimelineChannel = 'voice' | 'sms' | 'email' | 'linkedin' | 'direct_mail' | 'ai'
```

### `OEXTimelineDirection`

```typescript
export type OEXTimelineDirection = 'inbound' | 'outbound'
```

### `OEXTimelineEntry`

```typescript
export interface OEXTimelineEntry {
  /** Unique entry ID */
  id: string
  /** Source database table */
  sourceTable: string
  /** Event timestamp (ISO 8601) */
  timestamp: string
  /** Communication channel */
  channel: OEXTimelineChannel
  /** Event type (channel-specific, e.g., 'call_completed', 'sms_sent') */
  eventType: string
  /** Direction of the communication */
  direction: OEXTimelineDirection | null
  /** Human-readable event summary */
  summary: string
  /** Associated lead ID */
  leadId: string | null
  /** Associated campaign ID */
  campaignId: string | null
  /** Associated company ID */
  companyId: string | null
  /** Channel-specific metadata */
  metadata: Record<string, unknown>
}
```

### `OEXTimelineParams`

```typescript
export interface OEXTimelineParams {
  /** Filter by lead ID */
  leadId?: string
  /** Filter by company ID */
  companyId?: string
  /** Filter by campaign ID */
  campaignId?: string
  /** Filter by channels (array, sent as comma-separated) */
  channels?: OEXTimelineChannel[]
  /** Filter by direction */
  direction?: OEXTimelineDirection
  /** Return entries after this ISO 8601 timestamp */
  after?: string
  /** Return entries before this ISO 8601 timestamp */
  before?: string
  /** Page size (default 50) */
  limit?: number
  /** Pagination offset (default 0) */
  offset?: number
}
```

### `TimelineApiResponse` (internal — not exported from `src/index.ts`)

```typescript
export interface TimelineApiResponse {
  entries: Array<{
    id: string
    source_table: string
    timestamp: string
    channel: string
    event_type: string
    direction: string | null
    summary: string
    lead_id: string | null
    campaign_id: string | null
    company_id: string | null
    metadata: Record<string, unknown>
  }>
  total_fetched: number
  limit: number
  offset: number
}
```

### Mapping function (internal — not exported from `src/index.ts`)

```typescript
export function mapTimelineEntry(raw: TimelineApiResponse['entries'][number]): OEXTimelineEntry {
  return {
    id: raw.id,
    sourceTable: raw.source_table,
    timestamp: raw.timestamp,
    channel: raw.channel as OEXTimelineChannel,
    eventType: raw.event_type,
    direction: (raw.direction as OEXTimelineDirection) ?? null,
    summary: raw.summary,
    leadId: raw.lead_id,
    campaignId: raw.campaign_id,
    companyId: raw.company_id,
    metadata: raw.metadata,
  }
}
```

---

## Build 2: Types barrel update

**File:** `src/types/index.ts` (modify)

Add at the end of the existing exports:

```typescript
export * from './timeline'
```

Note: `TimelineApiResponse` and `mapTimelineEntry` will be exported from the barrel but they are **not** re-exported from `src/index.ts` (the package entry point). Only `OEXTimelineEntry`, `OEXTimelineChannel`, `OEXTimelineDirection`, and `OEXTimelineParams` are public.

---

## Build 3: useActivityTimeline hook

**File:** `src/hooks/useActivityTimeline.ts` (new)

### Hook signature and return type

```typescript
export interface UseActivityTimelineReturn {
  /** Timeline entries (chronological, newest first) */
  entries: OEXTimelineEntry[]
  /** Fetch entries with optional filter params (replaces current entries) */
  fetchEntries: (params?: OEXTimelineParams) => Promise<void>
  /** Re-fetch with the last used params */
  refreshEntries: () => Promise<void>
  /** Load the next page of entries (appends to existing entries) */
  loadMore: () => Promise<void>
  /** Whether there are more entries to load */
  hasMore: boolean
  /** Whether a fetch or load-more operation is in progress */
  isLoading: boolean
  /** Current error, or null */
  error: OEXError | null
}

export function useActivityTimeline(initialParams?: OEXTimelineParams): UseActivityTimelineReturn
```

### Implementation

1. Get `apiClientRef` from `OEXCommsInternalContext`. Throw if null (outside provider).
2. State: `entries` (OEXTimelineEntry[]), `isLoading`, `error`, `hasMore` (boolean).
3. Refs: `lastFetchParamsRef` (stores last params for refresh), `currentOffsetRef` (tracks offset for pagination).
4. `fetchEntries(params?)`:
   a. Store params in `lastFetchParamsRef`.
   b. Build query params `Record<string, string>`:
      - `lead_id` from `params.leadId`
      - `company_id` from `params.companyId`
      - `campaign_id` from `params.campaignId`
      - `channel` from `params.channels?.join(',')` — comma-separated
      - `direction` from `params.direction`
      - `after` from `params.after`
      - `before` from `params.before`
      - `limit` from `String(params.limit)` (only if defined)
      - `offset` from `String(params.offset ?? 0)`
   c. Only include non-undefined values in the query params object.
   d. Call `apiClientRef.current.get<TimelineApiResponse>('/api/activity/timeline', queryParams)`.
   e. Map `response.entries` through `mapTimelineEntry`.
   f. Set `entries` to the mapped result (replaces, does not append).
   g. Set `hasMore` to `response.total_fetched === (params?.limit ?? 50)` (if we got a full page, there might be more).
   h. Set `currentOffsetRef.current` to `(params?.offset ?? 0) + response.total_fetched`.
   i. On error, set error state.
5. `refreshEntries()`: calls `fetchEntries(lastFetchParamsRef.current)`.
6. `loadMore()`:
   a. If `!hasMore` or `isLoading`, return.
   b. Build params from `lastFetchParamsRef.current` with `offset = currentOffsetRef.current`.
   c. Call the API with those params.
   d. **Append** new entries to existing entries (don't replace).
   e. Update `currentOffsetRef.current` and `hasMore`.
7. Auto-fetch on mount: use a `useEffect` that calls `fetchEntries(initialParams)` when the component mounts (and when `initialParams` changes — compare by serialized value to avoid infinite loops). Use `JSON.stringify(initialParams)` as the effect dependency.

---

## Build 4: ActivityTimeline component

**File:** `src/components/ActivityTimeline.tsx` (new)

### Internal context

Create `ActivityTimelineContext` (not exported) holding the full `UseActivityTimelineReturn` plus `onEntryClick` callback.

### ActivityTimeline (root)

Props:
```typescript
export interface ActivityTimelineProps {
  /** Filter by lead — passed through to the hook */
  leadId?: string
  /** Filter by company — passed through to the hook */
  companyId?: string
  /** Filter by campaign — passed through to the hook */
  campaignId?: string
  /** Initial channel filters */
  channels?: OEXTimelineChannel[]
  /** Initial direction filter */
  direction?: OEXTimelineDirection
  /** Page size */
  limit?: number
  /** Called when an entry is clicked */
  onEntryClick?: (entry: OEXTimelineEntry) => void
  /** Additional className for the root element */
  className?: string
  children?: React.ReactNode
}
```

Implementation:
- Uses `forwardRef<HTMLDivElement, ActivityTimelineProps>`.
- Constructs `OEXTimelineParams` from props: `{ leadId, companyId, campaignId, channels, direction, limit }`.
- Calls `useActivityTimeline(params)`.
- Provides state + `onEntryClick` via `ActivityTimelineContext.Provider`.
- Root `<div>` attributes:
  - `data-state={isLoading && entries.length === 0 ? 'loading' : error ? 'error' : 'ready'}`
  - `role="feed"`
  - `aria-label="Activity timeline"`
  - `aria-busy={isLoading}`
- Default children (when none provided): `<ActivityTimeline.Entry>` for each entry, followed by `<ActivityTimeline.LoadMore />`.
- Error state: if `error` is set and no entries, render `<div role="alert">{error.message}</div>`.
- Loading state: if `isLoading` and no entries, render `<div data-state="loading" aria-busy="true">Loading...</div>`.

### ActivityTimeline.Entry

Props:
```typescript
export interface ActivityTimelineEntryProps {
  /** The timeline entry to render */
  entry: OEXTimelineEntry
  className?: string
  children?: (entry: OEXTimelineEntry) => React.ReactNode
}
```

Implementation:
- Reads `onEntryClick` from `ActivityTimelineContext`.
- Root element: `<div>` with:
  - `data-channel={entry.channel}`
  - `data-event-type={entry.eventType}`
  - `data-direction={entry.direction ?? undefined}` (omit attribute if null)
  - `data-entry-id={entry.id}`
  - `role="article"`
  - `tabIndex={0}`
  - `onClick` → calls `onEntryClick?.(entry)`
  - `onKeyDown` → calls `onEntryClick?.(entry)` on Enter/Space
- Default content (when no `children` render prop):
  - **Channel indicator**: `<span data-part="channel">{entry.channel}</span>` — the styling agent will map this to icons/colors.
  - **Summary**: `<span data-part="summary">{entry.summary}</span>`.
  - **Timestamp**: `<time data-part="timestamp" dateTime={entry.timestamp}>{entry.timestamp}</time>`.
  - **Event type**: `<span data-part="event-type">{entry.eventType}</span>`.
  - **Direction**: if `entry.direction` is not null, `<span data-part="direction">{entry.direction}</span>`.

### ActivityTimeline.Filters

Props:
```typescript
export interface ActivityTimelineFiltersProps {
  className?: string
  children?: React.ReactNode
}
```

Implementation:
- Reads `fetchEntries` from `ActivityTimelineContext`.
- This is a minimal default — the consuming app will typically render its own filter UI via render props or custom children.
- Default content: renders a set of `<button>` elements, one per channel (`voice`, `sms`, `email`, `linkedin`, `direct_mail`, `ai`). Each button:
  - `data-channel={channel}`
  - `aria-pressed` toggles — internal state tracks which channels are active
  - On click, updates the active channel set and calls `fetchEntries({ channels: activeChannels })` (preserving other existing params from context is not feasible here since the Filters subcomponent doesn't know the parent's entity props — so the Filters subcomponent should receive them from context or simply be a visual toggle that the consuming app wires up via render props).

**Simplified approach:** The `Filters` subcomponent manages local state for `activeChannels` and `direction`, and calls `fetchEntries` with those filters plus any `leadId`/`companyId`/`campaignId` that it reads from a `baseParams` value stored in the context. Update the internal context to include `baseParams: OEXTimelineParams` (the params the root component was constructed with, minus offset).

Updated context type:
```typescript
interface ActivityTimelineContextValue extends UseActivityTimelineReturn {
  onEntryClick?: (entry: OEXTimelineEntry) => void
  baseParams: Omit<OEXTimelineParams, 'offset'>
}
```

The root component stores `{ leadId, companyId, campaignId, channels, direction, limit }` as `baseParams`.

The Filters subcomponent reads `baseParams` from context and merges its local channel/direction state with the base params when calling `fetchEntries`.

Default Filters content:
- Channel toggle buttons (one per channel). Each: `data-channel={channel}`, `data-active={String(isActive)}`, `aria-pressed={isActive}`.
- Render as a `<div>` with `role="group"`, `aria-label="Channel filters"`.

### ActivityTimeline.LoadMore

Props:
```typescript
export interface ActivityTimelineLoadMoreProps {
  className?: string
  children?: React.ReactNode
}
```

Implementation:
- Reads `loadMore`, `hasMore`, `isLoading` from `ActivityTimelineContext`.
- If `!hasMore`, render `null`.
- Default: `<button>` with `data-action="load-more"`, `aria-label="Load more entries"`, `disabled={isLoading}`. Text: "Load more".

---

## Build 5: Index exports

**File:** `src/index.ts` (modify)

Add the following exports. Append as a new section after the messaging components exports:

```typescript
// Timeline types
export type {
  OEXTimelineChannel,
  OEXTimelineDirection,
  OEXTimelineEntry,
  OEXTimelineParams,
} from './types'

// Timeline hook
export { useActivityTimeline } from './hooks/useActivityTimeline'

// Timeline component
export { ActivityTimeline } from './components/ActivityTimeline'
export type {
  ActivityTimelineProps,
  ActivityTimelineEntryProps,
  ActivityTimelineFiltersProps,
  ActivityTimelineLoadMoreProps,
} from './components/ActivityTimeline'
```

Do NOT export `TimelineApiResponse` or `mapTimelineEntry` — these are internal.

Do NOT remove any existing exports. Append this new section.

---

## Build 6: Tests

**Files:**
- `tests/hooks/useActivityTimeline.test.ts` (new)
- `tests/components/ActivityTimeline.test.tsx` (new)

### Mocking strategy

For `useActivityTimeline` tests: mock `OEXCommsInternalContext` to provide a mock `apiClientRef` with a mocked `get()` method. Use `renderHook` with a wrapper that provides the context.

For `ActivityTimeline` component tests: mock the hook at the module level:

```typescript
vi.mock('../../src/hooks/useActivityTimeline', () => ({ useActivityTimeline: vi.fn() }))
```

### `tests/hooks/useActivityTimeline.test.ts` — Hook tests (10 tests)

1. Throws when used outside OEXCommsProvider
2. fetchEntries calls GET /api/activity/timeline with correct path
3. fetchEntries sends leadId as lead_id query param
4. fetchEntries sends channels as comma-separated channel param
5. fetchEntries maps snake_case response to camelCase OEXTimelineEntry
6. loadMore appends entries instead of replacing
7. loadMore increments offset correctly
8. hasMore is false when fewer entries returned than limit
9. refreshEntries re-fetches with the last used params
10. API error sets error state with code and message

### `tests/components/ActivityTimeline.test.tsx` — Component tests (8 tests)

1. Renders with role="feed" and data-state="ready" when entries exist
2. Renders loading state when isLoading is true and no entries
3. Each entry has data-channel, data-event-type attributes
4. Entry has data-direction when direction is not null
5. Entry onClick fires onEntryClick with the entry
6. LoadMore button renders when hasMore is true
7. LoadMore button is hidden when hasMore is false
8. Entry renders summary, timestamp, and channel in default content

Total: **18 tests** (new). Combined with 198 existing = **216 total**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/types/timeline.ts`
- `src/hooks/useActivityTimeline.ts`
- `src/components/ActivityTimeline.tsx`
- `tests/hooks/useActivityTimeline.test.ts`
- `tests/components/ActivityTimeline.test.tsx`

Files to modify:
- `src/types/index.ts` — add `export * from './timeline'`
- `src/index.ts` — add timeline type, hook, and component exports

Files that must NOT be modified:
- `src/hooks/useMessaging.ts` (read-only reference)
- `src/hooks/useConversation.ts` (read-only reference)
- `src/components/ConversationList.tsx` (read-only reference)
- `src/components/ConversationThread.tsx` (read-only reference)
- `src/services/` (entire directory)
- `src/providers/` (entire directory)
- `src/utils/` (entire directory)
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add useActivityTimeline hook and ActivityTimeline headless component (directive 10)`

---

## Build order

1. **Build 1**: Types → `src/types/timeline.ts`
2. **Build 2**: Types barrel → `src/types/index.ts`
3. **Build 3**: Hook → `src/hooks/useActivityTimeline.ts`
4. **Build 4**: Component → `src/components/ActivityTimeline.tsx`
5. **Build 5**: Index exports → `src/index.ts`
6. **Build 6**: Tests → all test files

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `src/types/timeline.ts` defines `OEXTimelineChannel`, `OEXTimelineDirection`, `OEXTimelineEntry`, `OEXTimelineParams`, `TimelineApiResponse`, and `mapTimelineEntry`.
(c) Confirm `OEXTimelineEntry` maps snake_case backend fields to camelCase (`source_table` → `sourceTable`, `event_type` → `eventType`, `lead_id` → `leadId`, etc.).
(d) Confirm `useActivityTimeline` accesses `apiClientRef` from `OEXCommsInternalContext` and calls `GET /api/activity/timeline`.
(e) Confirm `fetchEntries` replaces entries and `loadMore` appends entries.
(f) Confirm `loadMore` increments offset and `hasMore` is correctly derived from response size vs limit.
(g) Confirm `refreshEntries` re-fetches with cached params from `lastFetchParamsRef`.
(h) Confirm auto-fetch on mount via `useEffect` with serialized `initialParams`.
(i) Confirm `ActivityTimeline` component uses `forwardRef`, `data-state`, `role="feed"`, `aria-busy`.
(j) Confirm `ActivityTimeline.Entry` renders `data-channel`, `data-event-type`, `data-direction`, `data-entry-id` and supports `onEntryClick`.
(k) Confirm `ActivityTimeline.LoadMore` renders `null` when `hasMore` is false.
(l) Confirm `ActivityTimeline.Filters` renders channel toggle buttons with `data-channel` and `aria-pressed`.
(m) Confirm `src/index.ts` exports the 4 public types, the hook, and the component with all prop types. Confirm `TimelineApiResponse` and `mapTimelineEntry` are NOT exported from `src/index.ts`.
(n) Confirm `pnpm build` succeeds.
(o) Confirm `pnpm test` passes with 216 tests (198 existing + 18 new).
(p) Confirm no files outside ALLOWED_FILES were modified.
(q) Confirm `src/services/`, `src/providers/`, `src/utils/`, `CLAUDE.md`, `docs/`, and `api-reference-docs-new/` were NOT modified.
