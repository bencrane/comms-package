# Directive 05: Power Dialer Hook

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** Directives 01–03 built the full voice hook surface: `useVoice` (connect/disconnect/mute), `useDisposition` (post-call outcome capture), `useDevice`, `useAudioDevices`, `useCallQuality`, `usePreflight`, `useCallActions`. Directive 04 may or may not be complete — it adds an error catalog to `src/utils/errors.ts` and `createTwilioOEXError`. **Check whether `createTwilioOEXError` exists in `src/utils/errors.ts` before importing it.** If it does not exist, use `createOEXError` for all error creation. This directive adds a `usePowerDialer` hook that wraps `useVoice` and `useDisposition` with lead queue management and auto-advance logic. This is the core workflow hook for outbound calling campaigns — an agent loads a list of leads, starts a session, and the dialer auto-advances through the queue after each call + disposition. Pure state management — no components, no design.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, key principles, hook conventions. **Critical:** "Hooks Never Throw" — errors returned as state. Hooks return plain objects. No external state management. All state is in-memory React state via `useReducer` or `useState`.

### Existing code (study — understand before building)
- `src/hooks/useVoice.ts` — **critically important.** The hook this wraps. Returns `connect(to)`, `disconnect()`, `callState`, `callInfo`, `deviceReady`, `error`, and mute/DTMF/incoming methods. Study the `UseVoiceReturn` interface.
- `src/hooks/useDisposition.ts` — **critically important.** The other hook this wraps. Returns `setDisposition(disposition, notes?)`, `lastCallSid`, `isSubmitting`, `isSubmitted`, `error`, `reset()`. Study the `UseDispositionReturn` interface and the auto-reset behavior when `callState` changes away from `'idle'`.
- `src/types/voice.ts` — all voice types. Study `OEXCallState` (idle/connecting/ringing/open/reconnecting/pending/closed) and `OEXCallInfo`.
- `src/types/api.ts` — study `Disposition` type and `DISPOSITION_VALUES` const array.
- `src/index.ts` — current public exports. The new hook and types must be added here.

---

## Design overview

### How the power dialer works

The power dialer is a state machine that wraps two existing hooks (`useVoice` and `useDisposition`) with queue management:

```
Session States:
  idle → active → paused → active → completed
                     ↓
                   ended (manual)

Per-Lead Cycle (within active state):
  dialing → on_call → awaiting_disposition → [auto-advance or paused]
```

1. The consuming app provides an array of `OEXDialerLead` objects and calls `start()`.
2. The dialer calls `connect(lead.phoneNumber)` for the first lead.
3. When the call ends (`callState` returns to `'idle'`), the dialer enters `awaiting_disposition` — it will not advance until `useDisposition.isSubmitted` becomes `true`.
4. Once disposition is captured, the dialer waits a configurable delay (default 1500ms), then auto-advances to the next lead and calls `connect()`.
5. If the queue is exhausted, the session state becomes `'completed'`.
6. The user can `pause()` at any time — the dialer stops auto-advancing but the current call continues. `resume()` re-enters the auto-advance flow.
7. `skip()` moves to the next lead without calling (useful for "already contacted" leads).
8. `endSession()` terminates the session immediately.

### What the hook does NOT do

- Does not manage the disposition UI — the consuming app renders its own disposition form and calls `setDisposition()` from `useDisposition`.
- Does not fetch leads from the backend — leads are passed in as props.
- Does not persist session state — all in-memory.
- Does not handle incoming calls during a session — the consuming app manages this separately.

---

## Build 1: Types

**File:** `src/types/voice.ts` (modify)

Add these types to the existing file. Do not remove or change existing types.

### `OEXDialerLead`

```typescript
export interface OEXDialerLead {
  /** Unique identifier for the lead */
  id: string
  /** Phone number to dial */
  phoneNumber: string
  /** Display name (optional) */
  name?: string
  /** App-specific metadata — the dialer passes this through without interpreting it */
  metadata?: Record<string, unknown>
}
```

### `OEXDialerSessionState`

```typescript
export type OEXDialerSessionState = 'idle' | 'active' | 'paused' | 'completed'
```

### `OEXDialerLeadState`

The per-lead state within an active session:

```typescript
export type OEXDialerLeadState =
  | 'waiting'              // In queue, not yet reached
  | 'dialing'              // connect() has been called
  | 'on_call'              // Call is active (open/ringing/reconnecting)
  | 'awaiting_disposition'  // Call ended, waiting for disposition
  | 'completed'            // Disposition captured
  | 'skipped'              // Skipped by the agent
```

### `OEXDialerLeadResult`

```typescript
export interface OEXDialerLeadResult {
  leadId: string
  state: OEXDialerLeadState
  disposition?: Disposition
  callSid?: string
  /** Timestamp when the call started (ms since epoch) */
  callStartedAt?: number
  /** Timestamp when the call ended (ms since epoch) */
  callEndedAt?: number
}
```

### `OEXDialerSessionStats`

```typescript
export interface OEXDialerSessionStats {
  /** Total leads in the queue */
  totalLeads: number
  /** Number of calls completed (disposition captured) */
  callsCompleted: number
  /** Number of leads skipped */
  callsSkipped: number
  /** Number of leads remaining (not yet dialed or skipped) */
  callsRemaining: number
  /** Disposition breakdown — count per disposition value */
  outcomes: Partial<Record<Disposition, number>>
  /** Session start timestamp (ms since epoch), or null if not started */
  sessionStartedAt: number | null
  /** Session duration in milliseconds (updates while active) */
  sessionDurationMs: number
}
```

### `OEXDialerOptions`

```typescript
export interface OEXDialerOptions {
  /** Delay in ms before auto-advancing to the next lead (default: 1500) */
  advanceDelayMs?: number
}
```

---

## Build 2: usePowerDialer hook

**File:** `src/hooks/usePowerDialer.ts` (new)

### Hook signature

```typescript
export interface UsePowerDialerReturn {
  // --- Session control ---
  /** Start the dialer session — begins calling the first lead */
  start: () => void
  /** Pause auto-advancing (current call continues) */
  pause: () => void
  /** Resume auto-advancing from the current position */
  resume: () => void
  /** Skip the current lead and move to the next without calling */
  skip: () => void
  /** End the session immediately */
  endSession: () => void

  // --- Session state ---
  /** Current session state */
  sessionState: OEXDialerSessionState
  /** Current lead being called or awaiting disposition, or null */
  currentLead: OEXDialerLead | null
  /** Current queue position (0-indexed) */
  queuePosition: number
  /** Session statistics */
  stats: OEXDialerSessionStats
  /** Results for each lead processed so far */
  results: OEXDialerLeadResult[]
  /** Per-lead state for the current lead */
  currentLeadState: OEXDialerLeadState | null

  // --- Passthrough from useVoice ---
  /** Current call state (from useVoice) */
  callState: OEXCallState
  /** Current call info (from useVoice) */
  callInfo: OEXCallInfo | null
  /** Whether the device is ready (from useVoice) */
  deviceReady: boolean
  /** Disconnect the current call (from useVoice) */
  disconnect: () => void
  /** Send DTMF digits (from useVoice) */
  sendDigits: (digits: string) => void
  /** Mute control (from useVoice) */
  mute: (shouldMute: boolean) => void
  /** Toggle mute (from useVoice) */
  toggleMute: () => void

  // --- Passthrough from useDisposition ---
  /** Submit disposition for the current call (from useDisposition) */
  setDisposition: (disposition: Disposition, notes?: string) => Promise<void>
  /** Whether disposition is being submitted (from useDisposition) */
  isDispositionSubmitting: boolean
  /** Whether disposition was submitted (from useDisposition) */
  isDispositionSubmitted: boolean
  /** The call SID for the last call (from useDisposition) */
  lastCallSid: string | null

  // --- Error ---
  /** Current error from the dialer, voice, or disposition */
  error: OEXError | null
}

export function usePowerDialer(
  leads: OEXDialerLead[],
  options?: OEXDialerOptions,
): UsePowerDialerReturn
```

### Implementation

Use `useReducer` for the dialer's own state. Call `useVoice()` and `useDisposition()` internally — do not duplicate their logic.

#### Internal state (managed by reducer)

```typescript
interface DialerState {
  sessionState: OEXDialerSessionState
  queuePosition: number
  currentLeadState: OEXDialerLeadState | null
  results: OEXDialerLeadResult[]
  sessionStartedAt: number | null
  error: OEXError | null
}
```

#### Reducer actions

```typescript
type DialerAction =
  | { type: 'START_SESSION' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'DIALING'; leadId: string }
  | { type: 'ON_CALL'; callSid?: string }
  | { type: 'CALL_ENDED' }
  | { type: 'DISPOSITION_CAPTURED'; disposition: Disposition; callSid?: string }
  | { type: 'ADVANCE' }
  | { type: 'SKIP'; leadId: string }
  | { type: 'END_SESSION' }
  | { type: 'SESSION_COMPLETED' }
  | { type: 'ERROR'; error: OEXError }
```

#### Core effects

**Effect 1: Auto-dial on session start and advance.**
When `sessionState` is `'active'` and `currentLeadState` is `null` (just advanced or just started), and the device is ready, call `voice.connect(currentLead.phoneNumber)` and dispatch `DIALING`.

```typescript
useEffect(() => {
  if (
    state.sessionState === 'active' &&
    state.currentLeadState === null &&
    voice.deviceReady &&
    currentLead
  ) {
    voice.connect(currentLead.phoneNumber)
    dispatch({ type: 'DIALING', leadId: currentLead.id })
  }
}, [state.sessionState, state.currentLeadState, voice.deviceReady, currentLead])
```

**Effect 2: Track call state transitions.**
Watch `voice.callState` to update the lead state:
- When `callState` changes to `'open'` or `'ringing'` and `currentLeadState` is `'dialing'`: dispatch `ON_CALL` with the callSid from `voice.callInfo`.
- When `callState` changes to `'idle'` and `currentLeadState` is `'on_call'`: dispatch `CALL_ENDED` (transitions lead to `awaiting_disposition`).

```typescript
useEffect(() => {
  if (state.currentLeadState === 'dialing' && (voice.callState === 'open' || voice.callState === 'ringing')) {
    dispatch({ type: 'ON_CALL', callSid: voice.callInfo?.callSid ?? undefined })
  }
  if (state.currentLeadState === 'on_call' && voice.callState === 'idle') {
    dispatch({ type: 'CALL_ENDED' })
  }
}, [voice.callState, state.currentLeadState, voice.callInfo])
```

**Effect 3: Auto-advance after disposition.**
Watch `disposition.isSubmitted`. When it becomes `true` and `currentLeadState` is `'awaiting_disposition'`:
1. Dispatch `DISPOSITION_CAPTURED` (records the outcome).
2. After the configured delay (`advanceDelayMs`, default 1500), dispatch `ADVANCE` to move to the next lead — but only if `sessionState` is still `'active'` (not paused or ended).

Use `setTimeout` for the delay. Clear the timeout on unmount or if the session is paused/ended before it fires.

```typescript
useEffect(() => {
  if (state.currentLeadState !== 'awaiting_disposition' || !disposition.isSubmitted) return
  if (state.sessionState !== 'active') return

  // Record the disposition in results
  // (need to read the disposition value — since useDisposition doesn't expose it,
  //  the consuming app will have called setDisposition with it.
  //  The dialer doesn't need to know the value for advancement logic.
  //  But for stats tracking, we need it — see Implementation Note below.)

  dispatch({ type: 'DISPOSITION_CAPTURED', callSid: disposition.lastCallSid ?? undefined })

  const timer = setTimeout(() => {
    if (/* still active */) {
      dispatch({ type: 'ADVANCE' })
      disposition.reset()
    }
  }, options?.advanceDelayMs ?? 1500)

  return () => clearTimeout(timer)
}, [state.currentLeadState, disposition.isSubmitted, state.sessionState])
```

**Implementation note on disposition tracking:** `useDisposition` does not expose which disposition value was submitted — it only tracks `isSubmitted`. To record the disposition value in `OEXDialerLeadResult.disposition` and in the outcomes stats, the `usePowerDialer` hook should wrap `disposition.setDisposition` with its own version that captures the value before passing it through:

```typescript
const setDispositionWrapped = useCallback(
  async (disp: Disposition, notes?: string) => {
    await disposition.setDisposition(disp, notes)
    // After successful submission, the isSubmitted effect (Effect 3) will fire.
    // Store the disposition value in a ref so Effect 3 can read it.
    lastDispositionRef.current = disp
  },
  [disposition.setDisposition],
)
```

Then in the `DISPOSITION_CAPTURED` action, include the disposition:
```typescript
dispatch({
  type: 'DISPOSITION_CAPTURED',
  disposition: lastDispositionRef.current!,
  callSid: disposition.lastCallSid ?? undefined,
})
```

**Effect 4: Detect session completion.**
When `queuePosition >= leads.length` and `sessionState` is `'active'`, dispatch `SESSION_COMPLETED`.

#### Reducer logic

- `START_SESSION`: set `sessionState` to `'active'`, `queuePosition` to `0`, `currentLeadState` to `null`, `results` to `[]`, `sessionStartedAt` to `Date.now()`.
- `PAUSE`: set `sessionState` to `'paused'`. Do NOT change `currentLeadState` — the current call continues.
- `RESUME`: set `sessionState` to `'active'`. If `currentLeadState` is `null` (no active call), the auto-dial effect will fire.
- `DIALING`: set `currentLeadState` to `'dialing'`. Add a result entry for the lead with `state: 'dialing'` and `callStartedAt: Date.now()`.
- `ON_CALL`: set `currentLeadState` to `'on_call'`. Update the result entry with `state: 'on_call'` and `callSid`.
- `CALL_ENDED`: set `currentLeadState` to `'awaiting_disposition'`. Update the result entry with `state: 'awaiting_disposition'` and `callEndedAt: Date.now()`.
- `DISPOSITION_CAPTURED`: set `currentLeadState` to `'completed'`. Update the result entry with `state: 'completed'` and `disposition`.
- `ADVANCE`: increment `queuePosition`, set `currentLeadState` to `null`. If `queuePosition >= leads.length`, set `sessionState` to `'completed'` instead.
- `SKIP`: set result entry state to `'skipped'`, increment `queuePosition`, set `currentLeadState` to `null`. If `queuePosition >= leads.length`, set `sessionState` to `'completed'`.
- `END_SESSION`: set `sessionState` to `'idle'`, reset `currentLeadState` to `null`.
- `SESSION_COMPLETED`: set `sessionState` to `'completed'`.
- `ERROR`: set `error`.

#### Computed stats

Derive `OEXDialerSessionStats` from the reducer state on every render (or via `useMemo`):

```typescript
const stats = useMemo<OEXDialerSessionStats>(() => {
  const completed = state.results.filter(r => r.state === 'completed').length
  const skipped = state.results.filter(r => r.state === 'skipped').length
  const outcomes: Partial<Record<Disposition, number>> = {}
  for (const result of state.results) {
    if (result.disposition) {
      outcomes[result.disposition] = (outcomes[result.disposition] ?? 0) + 1
    }
  }
  return {
    totalLeads: leads.length,
    callsCompleted: completed,
    callsSkipped: skipped,
    callsRemaining: leads.length - state.queuePosition,
    outcomes,
    sessionStartedAt: state.sessionStartedAt,
    sessionDurationMs: state.sessionStartedAt ? Date.now() - state.sessionStartedAt : 0,
  }
}, [state.results, state.queuePosition, state.sessionStartedAt, leads.length])
```

Note: `sessionDurationMs` will only update on re-renders. If the consuming app needs a live timer, it should use its own interval. The dialer does not run a timer for this — it would cause unnecessary re-renders.

#### Current lead derivation

```typescript
const currentLead = state.sessionState !== 'idle' && state.queuePosition < leads.length
  ? leads[state.queuePosition]
  : null
```

#### Edge cases

- `start()` when `sessionState` is not `'idle'`: no-op.
- `start()` with empty leads array: dispatch `SESSION_COMPLETED` immediately.
- `pause()` when not `'active'`: no-op.
- `resume()` when not `'paused'`: no-op.
- `skip()` when `sessionState` is `'idle'` or `'completed'`: no-op.
- `skip()` during an active call: disconnect the call first, then skip (do NOT await disposition).
- `endSession()` during an active call: disconnect the call first.
- `voice.error` during dialing: the dialer should surface this via its `error` field but NOT auto-advance. The agent decides what to do (skip, retry, end session).
- `leads` array changes after session starts: the hook should use the leads array passed at the time of the current render. If the array reference changes, do NOT reset the session — continue from the current position. The consuming app is responsible for not mutating leads mid-session.

---

## Build 3: Index exports

**File:** `src/index.ts` (modify)

Append to the existing exports:

```typescript
// Power Dialer types
export type {
  OEXDialerLead,
  OEXDialerSessionState,
  OEXDialerLeadState,
  OEXDialerLeadResult,
  OEXDialerSessionStats,
  OEXDialerOptions,
} from './types'

// Power Dialer hook
export { usePowerDialer } from './hooks/usePowerDialer'
```

Do NOT remove any existing exports.

---

## Build 4: Tests

**File:** `tests/hooks/usePowerDialer.test.ts` (new)

### Mocking strategy

Mock `useVoice` and `useDisposition` — do NOT mock the Twilio SDK directly. The power dialer hook is a composition of existing hooks. Control the mocked hooks' return values to simulate call state transitions and disposition submission.

Create a test wrapper that provides `OEXCommsContext` and `OEXCommsInternalContext` (required by the underlying hooks). Alternatively, mock the hooks at the module level:

```typescript
vi.mock('../hooks/useVoice', () => ({ useVoice: vi.fn() }))
vi.mock('../hooks/useDisposition', () => ({ useDisposition: vi.fn() }))
```

Then control the mocked return values per test.

### Test cases (12 tests)

1. **Initial state is idle** — sessionState is 'idle', currentLead is null, queuePosition is 0, stats.totalLeads matches leads.length.
2. **start() begins session** — sessionState becomes 'active', currentLead is leads[0], connect() is called with leads[0].phoneNumber.
3. **Call state transitions update currentLeadState** — simulate callState going from 'idle' → 'connecting' → 'ringing' → 'open' → 'idle'. Verify currentLeadState goes dialing → on_call → awaiting_disposition.
4. **Blocks advancement until disposition is submitted** — when currentLeadState is 'awaiting_disposition' and isSubmitted is false, the dialer does not advance. queuePosition stays the same.
5. **Auto-advances after disposition + delay** — when isSubmitted becomes true, after advanceDelayMs, queuePosition increments and connect() is called on the next lead.
6. **pause() stops auto-advancing** — after pause(), disposition is captured but dialer does not advance to next lead. resume() re-enables advancement.
7. **skip() moves to next lead without calling** — skip() increments queuePosition without calling connect(). Result entry has state 'skipped'.
8. **skip() during active call disconnects first** — when currentLeadState is 'on_call', skip() calls disconnect() before advancing.
9. **endSession() terminates session** — sessionState becomes 'idle', current call is disconnected.
10. **Session completes when queue exhausted** — after all leads are processed, sessionState becomes 'completed'.
11. **Stats track outcomes correctly** — after several calls with different dispositions, stats.outcomes has correct counts.
12. **start() with empty leads array completes immediately** — sessionState goes directly to 'completed'.

Total: **12 new tests**. Combined with existing = **92 total** (or **107 total** if Directive 04 is also complete with its 15 tests).

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/hooks/usePowerDialer.ts`
- `tests/hooks/usePowerDialer.test.ts`

Files to modify:
- `src/types/voice.ts` — add `OEXDialerLead`, `OEXDialerSessionState`, `OEXDialerLeadState`, `OEXDialerLeadResult`, `OEXDialerSessionStats`, `OEXDialerOptions`
- `src/index.ts` — add new type and hook exports

Files that must NOT be modified:
- `src/providers/OEXCommsProvider.tsx`
- `src/hooks/useVoice.ts`
- `src/hooks/useDevice.ts`
- `src/hooks/useDisposition.ts`
- `src/hooks/useCallActions.ts`
- `src/hooks/useAudioDevices.ts`
- `src/hooks/useCallQuality.ts`
- `src/hooks/usePreflight.ts`
- `src/services/` (entire directory)
- `src/types/api.ts`
- `src/types/events.ts`
- `src/types/index.ts`
- `src/utils/` (entire directory)
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add usePowerDialer hook with lead queue management and auto-advance (directive 05)`

---

## Build order

1. **Build 1**: Types → `src/types/voice.ts`
2. **Build 2**: usePowerDialer hook → `src/hooks/usePowerDialer.ts`
3. **Build 3**: Index exports → `src/index.ts`
4. **Build 4**: Tests → `tests/hooks/usePowerDialer.test.ts`

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `src/types/voice.ts` defines `OEXDialerLead`, `OEXDialerSessionState`, `OEXDialerLeadState`, `OEXDialerLeadResult`, `OEXDialerSessionStats`, `OEXDialerOptions` without any Twilio type references.
(c) Confirm `usePowerDialer` calls `useVoice()` and `useDisposition()` internally — does not duplicate their logic.
(d) Confirm auto-advance fires only after `isSubmitted` is `true` AND after the configurable delay.
(e) Confirm advancement is blocked when disposition is not yet submitted.
(f) Confirm `pause()` stops auto-advancement but does not disconnect the current call.
(g) Confirm `skip()` during an active call disconnects first.
(h) Confirm `endSession()` disconnects any active call and resets to idle.
(i) Confirm session completes (state = 'completed') when queue is exhausted.
(j) Confirm `stats.outcomes` correctly counts dispositions per type.
(k) Confirm `start()` with empty leads array results in immediate completion.
(l) Confirm `src/index.ts` exports `usePowerDialer` and all new types.
(m) Confirm `pnpm build` succeeds.
(n) Confirm `pnpm test` passes with all tests (12 new + all existing).
(o) Confirm no files outside ALLOWED_FILES were modified.
(p) Confirm protected files were NOT modified.
