# Directive 02: Voice Core — Provider, Device Hook, and Voice Hook

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** Directive 01 built the project foundation — `package.json`, TypeScript config, build tooling, and three internal services: `ApiClient` (HTTP client with retry), `TokenManager` (auto-refresh with event emission), and `EventBus` (typed pub/sub). It also created all API contract types in `src/types/api.ts` and event types in `src/types/events.ts`. This directive builds the heart of the SDK: the React context provider that initializes the Twilio Voice Device, and the hooks that expose calling capabilities to consuming apps. After this directive, a consuming app can wrap its tree in `<OEXCommsProvider>`, call `useVoice()` to make and receive calls, and call `useDevice()` to check Device registration state.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### Twilio Voice JS SDK docs (study extensively)
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/01-device-class.md` — Device constructor, `Device.Options`, methods (`register`, `connect`, `disconnectAll`, `updateToken`, `destroy`), all events (`registered`, `registering`, `unregistered`, `incoming`, `tokenWillExpire`, `error`, `destroyed`), `Device.State` enum (4 values: `Unregistered`, `Registering`, `Registered`, `Destroyed`). Extract the full event/state surface.
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/02-call-class.md` — Call methods (`accept`, `reject`, `disconnect`, `mute`, `isMuted`, `sendDigits`, `status`), all events (`accept`, `cancel`, `disconnect`, `error`, `mute`, `reconnected`, `reconnecting`, `ringing`, `sample`, `volume`, `warning`, `warningCleared`), `Call.State` enum (6 values: `Pending`, `Connecting`, `Ringing`, `Open`, `Reconnecting`, `Closed`), `Call.direction` accessor.
- `docs/SDK_REFERENCE_ASSESSMENT.md` — read the "React Wrapper Design Implications" section at the bottom. It covers: Device lifecycle (instantiate once in context, destroy on unmount), token refresh wiring (`tokenWillExpire` → fetch → `updateToken`), call state machine, error centralization, and browser compatibility.

### OEX backend API contract (consult for token endpoint)
- `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md` — the `GET /api/voice/token` endpoint returns `{ token, identity, ttl_seconds }`. The token manager already handles this call; this directive wires the token into the Twilio Device.

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, project structure, key principles, all conventions. **Critical sections:** "Never Expose Twilio" (the SDK's core principle), "Never Crash the Host App" (all Twilio interactions wrapped in try/catch), "Hooks Never Throw" (errors returned as state, not exceptions), "Token Refresh Is Invisible."

---

## Existing code to read before starting

Study these files to learn the SDK's conventions. Match them exactly.

### Package foundation
- `CLAUDE.md` — **critically important.** Conventions, architecture, project structure, key principles.
- `package.json` — dependencies (note `@twilio/voice-sdk` is already a dependency), peer deps, build scripts.
- `tsconfig.json` — TypeScript configuration, strict mode settings.
- `src/index.ts` — current public exports (types and constants only). You will add provider, hook, and new type exports here.

### Internal services (study for patterns — do not modify)
- `src/services/api-client.ts` — **critically important.** Study the `ApiClient` class constructor pattern (`{ apiBaseUrl, authToken }`), method signatures, and error handling. The provider will instantiate this.
- `src/services/token-manager.ts` — **critically important.** Study `TokenManager` constructor (takes `ApiClient`), `fetchToken()`, `startAutoRefresh()`, `onTokenUpdated()`, `onTokenError()`, `destroy()`. The provider will create this and wire its events to the Twilio Device.
- `src/services/event-bus.ts` — study the `EventBus` pattern for internal event coordination.

### Types (study — you will add new files alongside these)
- `src/types/index.ts` — re-exports from `api.ts` and `events.ts`, defines `OEXError`.
- `src/types/api.ts` — all API contract types. Note the `VoiceTokenResponse` shape.
- `src/types/events.ts` — `TokenUpdatedEvent`, `TokenErrorEvent`, `OEXEventMap`.

### Utils (study — do not modify)
- `src/utils/errors.ts` — `createOEXError()` and `isRecoverableHttpStatus()`.
- `src/utils/constants.ts` — SDK constants.

---

## Design overview

### The provider–hook–context chain

```
OEXCommsProvider (React component)
  ├── creates ApiClient
  ├── creates TokenManager
  ├── fetches initial token
  ├── creates Twilio Device(token)
  ├── calls device.register()
  ├── wires tokenWillExpire → tokenManager refresh → device.updateToken()
  ├── wires device events → context state
  ├── wires incoming call events → context state
  └── exposes via React context:
        ├── device instance (internal — not in public type)
        ├── deviceState: OEXDeviceState
        ├── call: active Call instance (internal — not in public type)
        ├── callInfo: OEXCallInfo | null
        ├── callState: OEXCallState
        ├── error: OEXError | null
        └── actions: { connect, disconnect, sendDigits, mute, toggleMute, acceptIncoming, rejectIncoming }

useDevice() → reads deviceState, identity, error from context
useVoice() → reads callInfo, callState, error from context; exposes connect, disconnect, mute, sendDigits, etc.
```

### Key design constraint: Never expose Twilio types

The Twilio `Device` instance and `Call` instance live inside the context but are **never exposed in the public TypeScript types**. The hooks return SDK-defined types (`OEXDeviceState`, `OEXCallState`, `OEXCallInfo`) that map to Twilio's types internally. If Twilio renames `Call.State.Open` to `Call.State.Active` in a future version, only the internal mapping changes — the public API stays stable.

### Call state machine

Outbound calls follow this state flow:

```
idle → connecting → ringing → open → closed → idle
                                ↕
                          reconnecting
```

Inbound calls follow:

```
idle → pending (incoming) → open → closed → idle
                             ↕
                        reconnecting
```

The SDK represents this as `OEXCallState`:

```typescript
type OEXCallState = 'idle' | 'connecting' | 'ringing' | 'open' | 'reconnecting' | 'pending' | 'closed'
```

`idle` is the SDK's own state — it means no call exists. Twilio doesn't have this; it's what the hook returns when there is no active call. `closed` is transient — after the `disconnect` event fires and cleanup completes, the state returns to `idle`.

### Device state machine

```
unregistered → registering → registered
                                ↓
                            destroyed
```

The SDK represents this as `OEXDeviceState`:

```typescript
type OEXDeviceState = 'unregistered' | 'registering' | 'registered' | 'destroyed'
```

These map 1:1 to Twilio's `Device.State` string values, but are defined as an SDK-owned type.

### Initialization sequence (what happens when OEXCommsProvider mounts)

1. Create `ApiClient({ apiBaseUrl, authToken })`
2. Create `TokenManager(apiClient)`
3. Call `tokenManager.fetchToken()` — get `{ token, identity, ttl_seconds }`
4. Create `new Device(token, deviceOptions)` where `deviceOptions` includes `closeProtection: true`, `codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU]`, `enableImprovedSignalingErrorPrecision: true`
5. Subscribe to Device events: `registered`, `registering`, `unregistered`, `error`, `destroyed`, `incoming`, `tokenWillExpire`
6. Call `device.register()` — begins registration (async)
7. Start `tokenManager.startAutoRefresh()` — schedules proactive token refresh
8. Wire `tokenWillExpire` → `tokenManager.fetchToken()` → `device.updateToken(newToken)` — this is the **reactive** refresh path (belt-and-suspenders alongside the proactive auto-refresh)
9. Wire `tokenManager.onTokenUpdated` → `device.updateToken(event.token)` — this is the **proactive** refresh path from the auto-refresh timer

### Cleanup sequence (what happens when OEXCommsProvider unmounts)

1. Call `device.destroy()` — disconnects all calls, releases resources
2. Call `tokenManager.destroy()` — stops auto-refresh, removes listeners
3. Clean up all event subscriptions

### Error handling strategy

All Twilio SDK interactions are wrapped in try/catch. Errors are caught and transformed into `OEXError` via `createOEXError()`. The error is stored in context state and exposed via hooks. Token errors (20xxx codes from Twilio) trigger an automatic refresh attempt before surfacing. Device errors and Call errors are both captured.

---

## Build 1: Voice types

**File:** `src/types/voice.ts` (new)

Define the SDK's own types that abstract over Twilio's types. These are what consumers see — Twilio types stay internal.

### `OEXDeviceState`

```typescript
export type OEXDeviceState = 'unregistered' | 'registering' | 'registered' | 'destroyed'
```

### `OEXCallState`

```typescript
export type OEXCallState = 'idle' | 'connecting' | 'ringing' | 'open' | 'reconnecting' | 'pending' | 'closed'
```

### `OEXCallDirection`

```typescript
export type OEXCallDirection = 'inbound' | 'outbound'
```

### `OEXCallInfo`

The public representation of an active call. Contains only SDK-defined types — no Twilio references.

```typescript
export interface OEXCallInfo {
  /** Call direction */
  direction: OEXCallDirection
  /** Remote phone number or client identity */
  from: string
  /** Called phone number or client identity */
  to: string
  /** Whether the call is currently muted */
  isMuted: boolean
  /** Twilio Call SID (available after connection) */
  callSid: string | null
}
```

### `OEXCommsConfig`

Provider configuration that the consuming app passes.

```typescript
export interface OEXCommsConfig {
  /** Base URL of the OEX backend API */
  apiBaseUrl: string
  /** JWT auth token for the OEX backend */
  authToken: string
}
```

### `OEXCommsContextValue`

The shape of the React context value. This is exported so consuming apps can type `useContext` directly if needed, but the hooks are the preferred interface.

```typescript
export interface OEXCommsContextValue {
  /** Current Device registration state */
  deviceState: OEXDeviceState
  /** Whether the Device is registered and ready to make/receive calls */
  deviceReady: boolean
  /** User identity from the token (populated when registered) */
  identity: string | null
  /** Current call state */
  callState: OEXCallState
  /** Information about the active call, or null if no call */
  callInfo: OEXCallInfo | null
  /** Current error, or null */
  error: OEXError | null
  /** Initiate an outbound call */
  connect: (to: string) => Promise<void>
  /** Disconnect the active call */
  disconnect: () => void
  /** Send DTMF digits */
  sendDigits: (digits: string) => void
  /** Mute or unmute the active call */
  mute: (shouldMute: boolean) => void
  /** Toggle mute on the active call */
  toggleMute: () => void
  /** Accept an incoming call */
  acceptIncoming: () => void
  /** Reject an incoming call */
  rejectIncoming: () => void
}
```

### Update `src/types/index.ts`

Add `export * from './voice'` to the barrel file.

---

## Build 2: OEXCommsProvider

**File:** `src/providers/OEXCommsProvider.tsx` (new)

### Component signature

```tsx
interface OEXCommsProviderProps {
  apiBaseUrl: string
  authToken: string
  children: React.ReactNode
}
```

### Context

Create a React context with `createContext<OEXCommsContextValue | null>(null)`. Export the context as a named export (for the hooks to import). The default value is `null` — hooks will throw a developer-friendly error if used outside the provider.

### State management

Use `useReducer` for the complex state (as specified in CLAUDE.md). Define a state shape and action types:

```typescript
interface CommsState {
  deviceState: OEXDeviceState
  identity: string | null
  callState: OEXCallState
  callInfo: OEXCallInfo | null
  error: OEXError | null
}

type CommsAction =
  | { type: 'DEVICE_STATE_CHANGED'; state: OEXDeviceState }
  | { type: 'IDENTITY_SET'; identity: string }
  | { type: 'CALL_STATE_CHANGED'; callState: OEXCallState; callInfo: OEXCallInfo | null }
  | { type: 'CALL_MUTE_CHANGED'; isMuted: boolean }
  | { type: 'CALL_ENDED' }
  | { type: 'ERROR'; error: OEXError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'INCOMING_CALL'; callInfo: OEXCallInfo }
```

The reducer should be pure. The initial state is:

```typescript
{
  deviceState: 'unregistered',
  identity: null,
  callState: 'idle',
  callInfo: null,
  error: null,
}
```

### Initialization effect

In a `useEffect` keyed on `[apiBaseUrl, authToken]`:

1. Check `Device.isSupported` — if false, dispatch an error and return. Do not attempt initialization.
2. Create `ApiClient({ apiBaseUrl, authToken })`.
3. Create `TokenManager(apiClient)`.
4. Call `tokenManager.fetchToken()` in a try/catch. On failure, dispatch error and return.
5. Create `new Device(token, { closeProtection: true, codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU], enableImprovedSignalingErrorPrecision: true })`.
6. Subscribe to Device events (see below).
7. Call `device.register()` in a try/catch. On failure, dispatch error.
8. Call `tokenManager.startAutoRefresh()`.
9. Subscribe to `tokenManager.onTokenUpdated` → call `device.updateToken(event.token)`.
10. Subscribe to `tokenManager.onTokenError` → dispatch error.

Store `device`, `tokenManager`, and the current `Call` in refs (not state — they are mutable objects, not render-driving values). Only the derived state (deviceState, callState, callInfo, error) lives in the reducer.

### Device event wiring

| Twilio Device Event | Action |
|---|---|
| `registering` | Dispatch `DEVICE_STATE_CHANGED` with `'registering'` |
| `registered` | Dispatch `DEVICE_STATE_CHANGED` with `'registered'`. Set identity from `device.identity`. |
| `unregistered` | Dispatch `DEVICE_STATE_CHANGED` with `'unregistered'` |
| `destroyed` | Dispatch `DEVICE_STATE_CHANGED` with `'destroyed'` |
| `error` | Map `TwilioError` to `OEXError` via `createOEXError(error.code, error.message)`. Dispatch `ERROR`. |
| `tokenWillExpire` | Call `tokenManager.fetchToken()` → `device.updateToken(newToken)`. On failure, dispatch error. Wrap in try/catch. |
| `incoming` | Store the incoming Call in the call ref. Subscribe to its events (same as outbound calls). Extract call info: `direction: 'inbound'`, `from` from `call.parameters.From`, `to` from `call.parameters.To`. Dispatch `INCOMING_CALL`. |

### Call event wiring

When a call is created (via `connect()` or `incoming` event), subscribe to these events on the Call instance:

| Twilio Call Event | Action |
|---|---|
| `ringing` | Dispatch `CALL_STATE_CHANGED` with `callState: 'ringing'` |
| `accept` | Dispatch `CALL_STATE_CHANGED` with `callState: 'open'`. Update `callInfo.callSid` from `call.parameters.CallSid`. |
| `reconnecting` | Dispatch `CALL_STATE_CHANGED` with `callState: 'reconnecting'` |
| `reconnected` | Dispatch `CALL_STATE_CHANGED` with `callState: 'open'` |
| `disconnect` | Dispatch `CALL_ENDED`. Clear the call ref. Call state returns to `idle`. |
| `cancel` | Dispatch `CALL_ENDED` (incoming call cancelled by remote party). Clear the call ref. |
| `reject` | Dispatch `CALL_ENDED`. Clear the call ref. |
| `error` | Map `TwilioError` to `OEXError`. Dispatch `ERROR`. |
| `mute` | Dispatch `CALL_MUTE_CHANGED` with `isMuted` value. |

### Action methods

These are exposed on the context value. They interact with the Twilio Device and Call via refs.

#### `connect(to: string): Promise<void>`

1. If device ref is null or device state is not `'registered'`, dispatch an error and return.
2. If call ref is not null (already on a call), dispatch an error and return.
3. Dispatch `CALL_STATE_CHANGED` with `callState: 'connecting'`, `callInfo: { direction: 'outbound', from: identity, to, isMuted: false, callSid: null }`.
4. Try: `const call = await device.connect({ params: { To: to } })`.
5. Store call in the call ref.
6. Subscribe to all call events (same wiring as above).
7. Catch: dispatch `CALL_ENDED` and `ERROR`.

#### `disconnect(): void`

If call ref exists, call `call.disconnect()`. The `disconnect` event handler will clean up state.

#### `sendDigits(digits: string): void`

If call ref exists and call state is `'open'`, call `call.sendDigits(digits)`. Otherwise, ignore silently.

#### `mute(shouldMute: boolean): void`

If call ref exists, call `call.mute(shouldMute)`.

#### `toggleMute(): void`

If call ref exists, call `call.mute(!call.isMuted())`.

#### `acceptIncoming(): void`

If call ref exists and call state is `'pending'`, call `call.accept()`. The `accept` event handler will update state.

#### `rejectIncoming(): void`

If call ref exists and call state is `'pending'`, call `call.reject()`. The `reject` event handler will clean up state.

### Cleanup

The `useEffect` cleanup function must:
1. Call `device.destroy()` (wrapped in try/catch).
2. Call `tokenManager.destroy()`.
3. All event listeners are removed by `device.destroy()` (Twilio's destroy removes all listeners).

### Memoization

Memoize the context value with `useMemo` keyed on all state values and action methods. The action methods themselves should be stable (use `useCallback` or define them inside the effect and store in a ref) to prevent unnecessary re-renders in consuming components.

### Render

```tsx
return (
  <OEXCommsContext.Provider value={contextValue}>
    {children}
  </OEXCommsContext.Provider>
)
```

---

## Build 3: useDevice hook

**File:** `src/hooks/useDevice.ts` (new)

### Hook signature and return type

```typescript
interface UseDeviceReturn {
  /** Current Device registration state */
  state: OEXDeviceState
  /** Whether the Device is registered and ready */
  deviceReady: boolean
  /** Whether the Device is currently on a call */
  isBusy: boolean
  /** User identity from the token */
  identity: string | null
  /** Current error, or null */
  error: OEXError | null
}

function useDevice(): UseDeviceReturn
```

### Implementation

1. Import the context from `OEXCommsProvider`.
2. Call `useContext(OEXCommsContext)`.
3. If context is null, throw an error: `"useDevice must be used within an OEXCommsProvider"`. This is the one place hooks can throw — it's a developer error, not a runtime error.
4. Derive and return:
   - `state`: from `context.deviceState`
   - `deviceReady`: `context.deviceState === 'registered'`
   - `isBusy`: `context.callState !== 'idle'`
   - `identity`: from `context.identity`
   - `error`: from `context.error`

---

## Build 4: useVoice hook

**File:** `src/hooks/useVoice.ts` (new)

### Hook signature and return type

```typescript
interface UseVoiceReturn {
  /** Initiate an outbound call to the given phone number or client identity */
  connect: (to: string) => Promise<void>
  /** Disconnect the active call */
  disconnect: () => void
  /** Send DTMF digits during an active call */
  sendDigits: (digits: string) => void
  /** Mute or unmute the active call */
  mute: (shouldMute: boolean) => void
  /** Toggle mute on the active call */
  toggleMute: () => void
  /** Accept an incoming call */
  acceptIncoming: () => void
  /** Reject an incoming call */
  rejectIncoming: () => void
  /** Information about the active call, or null if no call */
  callInfo: OEXCallInfo | null
  /** Current call state */
  callState: OEXCallState
  /** Whether the Device is registered and ready to make calls */
  deviceReady: boolean
  /** Current error, or null */
  error: OEXError | null
}

function useVoice(): UseVoiceReturn
```

### Implementation

1. Import the context from `OEXCommsProvider`.
2. Call `useContext(OEXCommsContext)`.
3. If context is null, throw: `"useVoice must be used within an OEXCommsProvider"`.
4. Return all relevant fields from context, mapping action methods directly.

---

## Build 5: Index exports

**File:** `src/index.ts` (modify)

Add the new public exports. The final `src/index.ts` should contain:

```typescript
// Types
export type {
  OEXError,
  VoiceTokenResponse,
  VoiceSessionResponse,
  DispositionRequest,
  DispositionResponse,
  CallActionRequest,
  OutboundCallRequest,
  OutboundCallResponse,
  SendSmsRequest,
  SendSmsResponse,
  SmsMessageResponse,
  Disposition,
  CallAction,
  TokenUpdatedEvent,
  TokenErrorEvent,
  OEXDeviceState,
  OEXCallState,
  OEXCallDirection,
  OEXCallInfo,
  OEXCommsConfig,
  OEXCommsContextValue,
} from './types'

export { DISPOSITION_VALUES, CALL_ACTION_VALUES } from './types'

// Provider
export { OEXCommsProvider } from './providers/OEXCommsProvider'

// Hooks
export { useVoice } from './hooks/useVoice'
export { useDevice } from './hooks/useDevice'
```

**Do NOT export** the `OEXCommsContext` object itself — only the provider component and hooks.

---

## Build 6: Tests

**Files:**
- `tests/providers/OEXCommsProvider.test.tsx` (new)
- `tests/hooks/useDevice.test.ts` (new)
- `tests/hooks/useVoice.test.ts` (new)

### Mocking strategy

Mock `@twilio/voice-sdk` at the module level. The mock must provide:
- `Device` class with: constructor, `register()`, `connect()`, `disconnectAll()`, `updateToken()`, `destroy()`, `on()`, `removeAllListeners()`, static `isSupported` (default `true`), instance properties `state`, `identity`, `isBusy`, `calls`
- `Call` class (or mock instances) with: `accept()`, `reject()`, `disconnect()`, `mute()`, `isMuted()`, `sendDigits()`, `status()`, `on()`, `removeAllListeners()`, `parameters`, `direction`
- `Call.Codec` with `Opus` and `PCMU` values

Mock `src/services/api-client.ts` and `src/services/token-manager.ts` as well. Use `vi.mock()` for module-level mocks.

For rendering hooks, use `renderHook` from `@testing-library/react` with a wrapper component that provides `OEXCommsProvider`.

### `tests/providers/OEXCommsProvider.test.tsx` — Provider tests (12 tests)

1. Creates ApiClient with apiBaseUrl and authToken from props
2. Creates TokenManager with the ApiClient
3. Fetches initial token on mount
4. Creates Twilio Device with the fetched token
5. Calls device.register() after creation
6. Starts token auto-refresh after registration
7. Calls device.updateToken() when tokenManager emits token:updated
8. Dispatches error state when initial token fetch fails
9. Dispatches error state when Device.isSupported is false
10. Calls device.destroy() on unmount
11. Calls tokenManager.destroy() on unmount
12. Handles tokenWillExpire by fetching new token and calling updateToken

### `tests/hooks/useDevice.test.ts` — useDevice tests (5 tests)

1. Returns deviceState from context
2. Returns deviceReady as true when state is 'registered'
3. Returns deviceReady as false when state is not 'registered'
4. Returns identity from context
5. Throws error when used outside OEXCommsProvider

### `tests/hooks/useVoice.test.ts` — useVoice tests (10 tests)

1. Returns callState 'idle' when no call active
2. connect() dispatches 'connecting' state and calls device.connect with To param
3. Returns callState 'open' after call 'accept' event fires
4. disconnect() calls call.disconnect()
5. Returns callState 'idle' after call 'disconnect' event fires
6. mute(true) calls call.mute(true)
7. toggleMute() toggles the current mute state
8. sendDigits() calls call.sendDigits on active call
9. Returns callInfo with direction, from, to, isMuted, callSid for active call
10. Throws error when used outside OEXCommsProvider

Total: **27 tests**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/types/voice.ts`
- `src/providers/OEXCommsProvider.tsx`
- `src/hooks/useDevice.ts`
- `src/hooks/useVoice.ts`
- `tests/providers/OEXCommsProvider.test.tsx`
- `tests/hooks/useDevice.test.ts`
- `tests/hooks/useVoice.test.ts`

Files to modify:
- `src/types/index.ts` — add `export * from './voice'`
- `src/index.ts` — add provider, hook, and new type exports

Files that must NOT be modified:
- `src/services/api-client.ts`
- `src/services/token-manager.ts`
- `src/services/event-bus.ts`
- `src/types/api.ts`
- `src/types/events.ts`
- `src/utils/errors.ts`
- `src/utils/constants.ts`
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add OEXCommsProvider, useVoice, and useDevice with full call lifecycle (directive 02)`

---

## Build order

1. **Build 1**: Voice types → `src/types/voice.ts`, update `src/types/index.ts`
2. **Build 2**: Provider → `src/providers/OEXCommsProvider.tsx`
3. **Build 3**: useDevice hook → `src/hooks/useDevice.ts`
4. **Build 4**: useVoice hook → `src/hooks/useVoice.ts`
5. **Build 5**: Index exports → `src/index.ts`
6. **Build 6**: Tests → all test files

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `src/types/voice.ts` defines `OEXDeviceState`, `OEXCallState`, `OEXCallDirection`, `OEXCallInfo`, `OEXCommsConfig`, and `OEXCommsContextValue` — all without any Twilio type references.
(c) Confirm `OEXCommsProvider` creates `ApiClient`, `TokenManager`, and Twilio `Device` on mount and destroys them on unmount.
(d) Confirm `OEXCommsProvider` wires `tokenWillExpire` to token refresh and `device.updateToken()`.
(e) Confirm `OEXCommsProvider` wires `tokenManager.onTokenUpdated` to `device.updateToken()` for proactive refresh.
(f) Confirm `OEXCommsProvider` handles the `incoming` Device event by storing the call and dispatching `INCOMING_CALL`.
(g) Confirm `useVoice` returns `connect`, `disconnect`, `sendDigits`, `mute`, `toggleMute`, `acceptIncoming`, `rejectIncoming`, `callInfo`, `callState`, `deviceReady`, and `error`.
(h) Confirm `useDevice` returns `state`, `deviceReady`, `isBusy`, `identity`, and `error`.
(i) Confirm all call event subscriptions handle the full state machine: connecting → ringing → open → closed, with reconnecting as an overlay.
(j) Confirm no Twilio types are exported from `src/index.ts`.
(k) Confirm `src/index.ts` exports `OEXCommsProvider`, `useVoice`, `useDevice`, and all new types.
(l) Confirm `pnpm build` succeeds.
(m) Confirm `pnpm test` passes with all tests (23 existing + 27 new = 50 total).
(n) Confirm no files outside ALLOWED_FILES were modified.
(o) Confirm `src/services/`, `src/utils/`, `CLAUDE.md`, `docs/`, and `api-reference-docs-new/` were NOT modified.
