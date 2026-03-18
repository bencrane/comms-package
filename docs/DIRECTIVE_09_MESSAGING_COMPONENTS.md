# Directive 09: Messaging Components — ConversationThread, ConversationList

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** This SDK provides React hooks for browser-based voice calling and messaging. Directive 07 built real-time messaging hooks: `useRealtimeConversation` (messages, participants, typing, send, load-more, read receipts within a single conversation) and `useConversationList` (list of conversations with unread counts, last message preview, real-time updates). These hooks depend on `OEXConversationsProvider` in `src/providers/OEXConversationsProvider.tsx`, which manages the Twilio Conversations Client lifecycle.

This directive adds **headless messaging component primitives** — unstyled, behavior-only React components that consume the messaging hooks internally and expose clean prop interfaces. No CSS, no visual design, no layout assumptions. Consuming apps style them via `className` props and `data-*` attribute selectors. Every component uses `forwardRef`, ARIA attributes, and composable subcomponents.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, project structure, key principles. **Critical:** components are the top layer, depend on hooks, are optional. "Never Expose Twilio" applies to component props — no Twilio types in any prop interface. Components go in `src/components/`.

### Hooks to consume (study return types carefully)
- `src/hooks/useRealtimeConversation.ts` — **critically important.** Returns `messages` (OEXRealtimeMessage[]), `participants` (OEXRealtimeParticipant[]), `sendMessage(body)`, `sendMedia(file, contentType, filename?)`, `sendTyping()`, `participantsTyping` (OEXRealtimeParticipant[]), `setAllMessagesRead()`, `lastReadMessageIndex`, `unreadCount`, `conversation` (OEXRealtimeConversation | null), `isLoading`, `loadMoreMessages()`, `hasMoreMessages`, `error`. Takes `conversationSid: string` as argument.
- `src/hooks/useConversationList.ts` — Returns `conversations` (OEXRealtimeConversation[]), `isLoading`, `refresh()`, `error`.

### Types to reference (study exact field names)
- `src/types/conversations.ts` — `OEXRealtimeConversation` (sid, uniqueName, friendlyName, attributes, createdAt, updatedAt, lastMessageText, lastMessageAt, unreadCount, lastReadMessageIndex), `OEXRealtimeMessage` (sid, index, body, author, createdAt, updatedAt, attributes, mediaSids, participantSid, type), `OEXRealtimeParticipant` (sid, identity, type, lastReadMessageIndex, lastReadTimestamp, attributes).

---

## Existing code to read before starting

Study these files to learn the SDK's conventions. Match them exactly.

### Package foundation
- `CLAUDE.md` — conventions, architecture, project structure
- `package.json` — dependencies, peer deps, build scripts
- `tsconfig.json` — TypeScript configuration, strict mode settings
- `src/index.ts` — public exports (only what's in this file is part of the public API)

### Hooks (study return types — components consume these)
- `src/hooks/useRealtimeConversation.ts` — **critically important.** Study the full `UseRealtimeConversationReturn` interface. Note: takes `conversationSid` as argument. Messages are ordered oldest-first. `loadMoreMessages()` prepends older messages. `participantsTyping` excludes the current user. `sendTyping()` signals the current user is typing.
- `src/hooks/useConversationList.ts` — Study `UseConversationListReturn`. Note: `conversations` array updates in real-time via client-level events.

### Types (study exact field names for props)
- `src/types/conversations.ts` — all conversation types.
- `src/types/index.ts` — barrel export.

---

## Design overview

### Headless component conventions

Every component in this directive follows these rules (identical to the voice components directive):

1. **`forwardRef`** on the root element. The ref is forwarded to the outermost `<div>` (or semantic element).
2. **`className` prop** on the root element and on every significant sub-element.
3. **`data-*` attributes** for state-based styling:
   - `data-state` — component state (loading, ready, error)
   - `data-unread` — `"true"` when there are unread messages
   - `data-typing` — `"true"` when someone is typing
   - `data-direction` — `"inbound"` or `"outbound"` on messages (by comparing author to current identity)
   - `data-type` — `"text"` or `"media"` on messages
4. **ARIA attributes** — `role`, `aria-label`, `aria-live` where appropriate.
5. **No CSS** — no inline styles, no layout assumptions. Zero visual opinions.
6. **Composable subcomponents** via compound component pattern.
7. **`children` or render props** where the consuming app might want full control.

### Compound component pattern

Same pattern as voice components: subcomponents share state via an internal context (not exported). The parent calls the hook(s) and provides state through this context.

### ConversationThread architecture

```
ConversationThread (calls useRealtimeConversation → provides context)
  ├── ConversationThread.MessageList (renders messages array, scroll container)
  ├── ConversationThread.Message (renders a single message)
  ├── ConversationThread.ComposeInput (text input + send)
  └── ConversationThread.TypingIndicator (shows who is typing)
```

The thread renders messages oldest-first (matching the hook's order). The "load more" trigger sits at the top of the message list — when activated, `loadMoreMessages()` prepends older messages.

### ConversationList architecture

```
ConversationList (calls useConversationList → provides context)
  └── ConversationList.Item (renders a single conversation row)
```

The list renders conversations and fires `onSelect(conversationSid)` when one is clicked.

### Message direction detection

The component needs to know if a message is "mine" (outbound) or "theirs" (inbound) for the `data-direction` attribute. The `OEXRealtimeMessage.author` field contains the identity string. The `OEXConversationsContextValue.identity` contains the current user's identity. The ConversationThread must get the current identity from `OEXConversationsProvider` context to compare.

However, to avoid importing the conversations context directly in the component (which would break the "components consume hooks, not contexts" pattern), the component should accept an `identity` prop. The parent or the `useRealtimeConversation` hook doesn't return identity directly, but the `conversation.attributes` or the `participants` list can be used. **Simplest approach**: accept an `identity` prop on ConversationThread, which the consuming app passes from its auth state. If not provided, all messages render without direction data attribute.

Actually, looking more carefully: the `OEXConversationsContextValue` has an `identity` field. But there's no hook that just returns the identity. The consuming app likely knows its own identity. Accept it as a prop.

---

## Build 1: ConversationThread component

**File:** `src/components/ConversationThread.tsx` (new)

### Internal context

Create a `ConversationThreadContext` (not exported) that holds the full return value of `useRealtimeConversation()`, plus the `identity` prop.

### ConversationThread (root)

Props:
```typescript
export interface ConversationThreadProps {
  /** The conversation SID to display */
  conversationSid: string
  /** Current user's identity — used to determine message direction (mine vs theirs) */
  identity?: string
  /** Number of messages to initially load (passed to hook — default 30 per hook) */
  /** Called when the user sends a message */
  onSendMessage?: (body: string) => void
  /** Additional className for the root element */
  className?: string
  children?: React.ReactNode
}
```

Implementation:
- Uses `forwardRef<HTMLDivElement, ConversationThreadProps>`.
- Calls `useRealtimeConversation(conversationSid)`.
- Provides all state via `ConversationThreadContext.Provider`, including `identity`.
- Root `<div>` attributes:
  - `data-state={isLoading ? 'loading' : error ? 'error' : 'ready'}`
  - `data-typing={String(participantsTyping.length > 0)}`
  - `data-unread={String((unreadCount ?? 0) > 0)}`
  - `role="region"`
  - `aria-label="Conversation"`
- Default children (when none provided): `<ConversationThread.MessageList />`, `<ConversationThread.TypingIndicator />`, `<ConversationThread.ComposeInput />`.
- Error state: if `error` is set and `isLoading` is false, render a `<div>` with `role="alert"` containing `error.message`.

### ConversationThread.MessageList

Props:
```typescript
export interface ConversationThreadMessageListProps {
  className?: string
  /** Render prop for each message — overrides ConversationThread.Message */
  renderMessage?: (message: OEXRealtimeMessage, isOwn: boolean) => React.ReactNode
  children?: React.ReactNode
}
```

Implementation:
- Reads `messages`, `hasMoreMessages`, `loadMoreMessages`, `isLoading`, `identity` from context.
- Root element: `<div>` with `role="log"`, `aria-label="Messages"`, `aria-live="polite"`.
- **Load more trigger**: if `hasMoreMessages` is true, render a `<button>` at the top with `data-action="load-more"`, `aria-label="Load older messages"`. On click, calls `loadMoreMessages()`.
- Renders each message using `renderMessage` prop if provided, otherwise renders `<ConversationThread.Message>` for each message.
- Messages are rendered in order (oldest first — the hook already returns them in this order).

### ConversationThread.Message

Props:
```typescript
export interface ConversationThreadMessageProps {
  /** The message to render */
  message: OEXRealtimeMessage
  /** Whether this message is from the current user */
  isOwn?: boolean
  className?: string
  children?: React.ReactNode
}
```

Implementation:
- Root `<div>` attributes:
  - `data-direction={isOwn ? 'outbound' : 'inbound'}`
  - `data-type={message.type}`
  - `data-message-sid={message.sid}`
  - `role="listitem"`
- Default content (when no `children` provided):
  - **Author**: `<span>` with `data-part="author"`. Shows `message.author`.
  - **Body**: `<span>` with `data-part="body"`. Shows `message.body`. If `message.type === 'media'` and body is null, show a placeholder like "Media attachment".
  - **Timestamp**: `<time>` element with `dateTime={message.createdAt?.toISOString()}`, `data-part="timestamp"`. Displays the time (the component renders the raw ISO string — consuming apps format it however they want).
  - **Read receipt indicator**: `<span>` with `data-part="read-receipt"`. This is derived from comparing the message's `index` with participants' `lastReadMessageIndex`. To keep the Message subcomponent simple, expose a `data-read` attribute: the parent (`MessageList`) computes this by checking if any non-self participant has `lastReadMessageIndex >= message.index`. Pass it as a prop:

Actually, this gets complex. Simplify: the Message subcomponent just renders the message data. The read receipt is a `data-read` attribute on the message element. The `ConversationThread.MessageList` (or the root context) precomputes a `lastReadByOthers` value: the maximum `lastReadMessageIndex` across all non-self participants. Then on each message div: `data-read={String(message.index <= lastReadByOthers)}`. This requires the participants list from context.

Revised approach — handle in MessageList:
- From context, get `participants` and `identity`.
- Compute `lastReadByOthers = Math.max(...participants.filter(p => p.identity !== identity).map(p => p.lastReadMessageIndex ?? -1))`.
- Pass `isRead={message.index <= lastReadByOthers}` to each Message.
- Add `data-read={String(isRead)}` on the Message root element.

Update Message props:
```typescript
export interface ConversationThreadMessageProps {
  message: OEXRealtimeMessage
  isOwn?: boolean
  isRead?: boolean
  className?: string
  children?: React.ReactNode
}
```

### ConversationThread.ComposeInput

Props:
```typescript
export interface ConversationThreadComposeInputProps {
  className?: string
  /** className for the text input */
  inputClassName?: string
  /** className for the send button */
  sendButtonClassName?: string
  /** Placeholder text for the input */
  placeholder?: string
  children?: React.ReactNode
}
```

Implementation:
- Reads `sendMessage`, `sendTyping` from context.
- Internal state: `draft` (string).
- `<form>` element with `onSubmit` that calls `sendMessage(draft)`, then clears the draft. Prevent default form submission.
- `<input type="text">` (or `<textarea>`) with:
  - `value={draft}`
  - `onChange` that updates draft and calls `sendTyping()` (throttled — the hook's `sendTyping` is already throttled by the Twilio SDK to 5s intervals, so the component can call it on every keystroke without concern).
  - `aria-label={placeholder ?? "Type a message"}`
  - `data-part="compose-input"`
- `<button type="submit">`: `aria-label="Send message"`, `data-part="send-button"`. Disabled when `draft.trim()` is empty.
- If custom `children` provided, render those instead.

### ConversationThread.TypingIndicator

Props:
```typescript
export interface ConversationThreadTypingIndicatorProps {
  className?: string
  children?: (participants: OEXRealtimeParticipant[]) => React.ReactNode
}
```

Implementation:
- Reads `participantsTyping` from context.
- **Renders nothing** (returns `null`) when `participantsTyping.length === 0`.
- Root `<div>`: `aria-live="polite"`, `role="status"`, `data-typing="true"`.
- If `children` is a render function, call it with `participantsTyping`.
- Default content: `"{identity} is typing..."` for one participant, `"{id1} and {id2} are typing..."` for two, `"{count} people are typing..."` for three or more.

---

## Build 2: ConversationList component

**File:** `src/components/ConversationList.tsx` (new)

### Internal context

Create a `ConversationListContext` (not exported) that holds `conversations`, `isLoading`, `error`, and `onSelect`.

### ConversationList (root)

Props:
```typescript
export interface ConversationListProps {
  /** Called when a conversation is selected */
  onSelect?: (conversationSid: string) => void
  /** The currently selected conversation SID (for active state) */
  selectedSid?: string
  /** Additional className for the root element */
  className?: string
  children?: React.ReactNode
}
```

Implementation:
- Uses `forwardRef<HTMLDivElement, ConversationListProps>`.
- Calls `useConversationList()`.
- Provides state via `ConversationListContext.Provider`, including `onSelect` and `selectedSid`.
- Root `<div>` attributes:
  - `data-state={isLoading ? 'loading' : error ? 'error' : 'ready'}`
  - `role="listbox"`
  - `aria-label="Conversations"`
- Default children: maps `conversations` array to `<ConversationList.Item>` elements. Sorts by `lastMessageAt` descending (most recent first) — if `lastMessageAt` is null, sort to the end.
- Error state: if `error` is set, render a `<div>` with `role="alert"` containing `error.message`.
- Loading state: if `isLoading` and `conversations.length === 0`, render a `<div>` with `data-state="loading"` and `aria-busy="true"`.

### ConversationList.Item

Props:
```typescript
export interface ConversationListItemProps {
  /** The conversation to render */
  conversation: OEXRealtimeConversation
  className?: string
  children?: (conversation: OEXRealtimeConversation) => React.ReactNode
}
```

Implementation:
- Reads `onSelect` and `selectedSid` from `ConversationListContext`.
- Root element: `<div>` with:
  - `role="option"`
  - `aria-selected={conversation.sid === selectedSid}`
  - `data-active={String(conversation.sid === selectedSid)}`
  - `data-unread={String((conversation.unreadCount ?? 0) > 0)}`
  - `data-conversation-sid={conversation.sid}`
  - `tabIndex={0}`
  - `onClick` → calls `onSelect?.(conversation.sid)`
  - `onKeyDown` → calls `onSelect?.(conversation.sid)` on Enter/Space
- Default content (when no `children` render prop):
  - **Name**: `<span>` with `data-part="name"`. Shows `conversation.friendlyName ?? conversation.uniqueName ?? conversation.sid`.
  - **Last message preview**: `<span>` with `data-part="preview"`. Shows `conversation.lastMessageText` (truncated display is left to CSS — the component renders the full text).
  - **Last activity timestamp**: `<time>` with `data-part="timestamp"`, `dateTime={conversation.lastMessageAt?.toISOString() ?? ''}`. Renders the ISO string — consuming apps format via CSS or override via render prop.
  - **Unread badge**: `<span>` with `data-part="unread-badge"`. Only rendered when `conversation.unreadCount != null && conversation.unreadCount > 0`. Contains the count. `aria-label="{count} unread messages"`.

---

## Build 3: Index exports

**File:** `src/index.ts` (modify)

Add the following exports. Append as a new section after the existing conversation hook exports:

```typescript
// Messaging components
export { ConversationThread } from './components/ConversationThread'
export type {
  ConversationThreadProps,
  ConversationThreadMessageListProps,
  ConversationThreadMessageProps,
  ConversationThreadComposeInputProps,
  ConversationThreadTypingIndicatorProps,
} from './components/ConversationThread'

export { ConversationList } from './components/ConversationList'
export type {
  ConversationListProps,
  ConversationListItemProps,
} from './components/ConversationList'
```

Do NOT remove any existing exports. Append this new section.

---

## Build 4: Tests

**Files:**
- `tests/components/ConversationThread.test.tsx` (new)
- `tests/components/ConversationList.test.tsx` (new)

### Mocking strategy

Mock the hooks at the module level:

```typescript
vi.mock('../../src/hooks/useRealtimeConversation', () => ({ useRealtimeConversation: vi.fn() }))
vi.mock('../../src/hooks/useConversationList', () => ({ useConversationList: vi.fn() }))
```

Each test configures the mocked hook to return specific state. No need for providers — hooks are fully mocked.

Use `render` from React Testing Library. Use `screen.getByRole`, `screen.getByText`, `screen.getByLabelText`, `fireEvent`.

### `tests/components/ConversationThread.test.tsx` — ConversationThread tests (10 tests)

1. Renders with `data-state="loading"` when isLoading is true
2. Renders with `data-state="ready"` and messages when loaded
3. Each message renders author, body, and timestamp
4. Messages from current user (matching identity prop) have `data-direction="outbound"`
5. Messages from others have `data-direction="inbound"`
6. ComposeInput sends message on form submit and clears the input
7. ComposeInput send button is disabled when input is empty
8. TypingIndicator renders when participantsTyping is non-empty
9. TypingIndicator renders nothing when participantsTyping is empty
10. Load more button renders when hasMoreMessages is true and calls loadMoreMessages on click

### `tests/components/ConversationList.test.tsx` — ConversationList tests (7 tests)

1. Renders with role="listbox"
2. Renders conversation items with name, preview, and timestamp
3. onSelect fires with conversation SID when item is clicked
4. Selected item has `aria-selected="true"` and `data-active="true"`
5. Unread badge renders with count when unreadCount > 0
6. Unread badge does not render when unreadCount is 0 or null
7. Renders loading state when isLoading is true and no conversations

Total: **17 tests** (new). Combined with 149 existing = **166 total**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/components/ConversationThread.tsx`
- `src/components/ConversationList.tsx`
- `tests/components/ConversationThread.test.tsx`
- `tests/components/ConversationList.test.tsx`

Files to modify:
- `src/index.ts` — add component and component prop type exports

Files that must NOT be modified:
- `src/hooks/` (entire directory — components consume hooks, they do not modify them)
- `src/providers/` (entire directory)
- `src/services/` (entire directory)
- `src/types/` (entire directory)
- `src/utils/` (entire directory)
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add headless messaging components — ConversationThread, ConversationList (directive 09)`

---

## Build order

1. **Build 1**: ConversationThread → `src/components/ConversationThread.tsx`
2. **Build 2**: ConversationList → `src/components/ConversationList.tsx`
3. **Build 3**: Index exports → `src/index.ts`
4. **Build 4**: Tests → all test files

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm both component files use `forwardRef` on the root element.
(c) Confirm both components accept `className` on the root element and on significant sub-elements.
(d) Confirm both components use `data-*` attributes for state-based styling — no CSS, no inline styles, no layout assumptions.
(e) Confirm appropriate ARIA attributes (`role`, `aria-label`, `aria-live`, `aria-selected`, `aria-busy`).
(f) Confirm ConversationThread.MessageList renders messages oldest-first with a load-more button at the top when `hasMoreMessages` is true.
(g) Confirm ConversationThread.Message renders author, body, timestamp, and `data-direction` / `data-read` / `data-type` attributes.
(h) Confirm ConversationThread.ComposeInput sends message on submit, clears input, and calls `sendTyping()` on keystroke.
(i) Confirm ConversationThread.TypingIndicator renders `null` when nobody is typing and shows participant identities when active.
(j) Confirm ConversationList renders conversations and fires `onSelect(conversationSid)` on click.
(k) Confirm ConversationList.Item shows name, last message preview, timestamp, and unread badge with count.
(l) Confirm no Twilio types appear in any component prop interface or public export.
(m) Confirm `src/index.ts` exports both components and all prop type interfaces.
(n) Confirm `pnpm build` succeeds.
(o) Confirm `pnpm test` passes with 166 tests (149 existing + 17 new).
(p) Confirm no files outside ALLOWED_FILES were modified.
(q) Confirm `src/hooks/`, `src/providers/`, `src/services/`, `src/types/`, `src/utils/`, `CLAUDE.md`, `docs/`, and `api-reference-docs-new/` were NOT modified.
