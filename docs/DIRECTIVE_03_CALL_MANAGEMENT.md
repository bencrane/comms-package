# Directive 03: Call Management — Audio Devices, Quality, Preflight, Disposition, Hold

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** Directive 01 built the project foundation — API client, token manager, event bus, types, and utilities. Directive 02 built the voice core — `OEXCommsProvider` (creates ApiClient, TokenManager, and Twilio Device; manages call lifecycle via reducer), `useVoice` (call actions: connect, disconnect, mute, sendDigits, accept/reject incoming), and `useDevice` (Device registration state). This directive adds the remaining hooks that complete the voice calling experience: audio device selection, real-time call quality monitoring, preflight connectivity testing, post-call disposition capture, and mid-call hold/unhold via the backend. After this directive, the SDK covers the full calling lifecycle from pre-call connectivity test through active call quality monitoring to post-call disposition.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### Twilio Voice JS SDK docs (study extensively)
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/03-audio-helper-class.md` — AudioHelper class: `availableInputDevices` (Map), `availableOutputDevices` (Map), `speakerDevices` (OutputDeviceCollection), `ringtoneDevices` (OutputDeviceCollection), `isOutputSelectionSupported` (boolean), `setInputDevice(deviceId)`, `unsetInputDevice()`. Accessed via `device.audio`.
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/04-preflight-test-class.md` — PreflightTest class: constructor `new PreflightTest(token, options?)`, events (`connected`, `completed`, `failed`, `sample`, `warning`), `PreflightTest.Status` enum (Connecting/Connected/Completed/Failed), `PreflightTest.Report` (callQuality, networkTiming, stats, warnings), `PreflightTest.CallQuality` enum, MOS thresholds.
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/05-output-device-collection-class.md` — OutputDeviceCollection: `get()`, `set(deviceIdOrIds)`, `test(soundUrl?)`. Browser support: Chrome 49+, Edge 79+, Opera 36+. Not supported: Firefox, Safari.
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/06-interfaces.md` — `RTCSample` interface (mos, rtt, jitter, packetsLostFraction, audioInputLevel, audioOutputLevel, codecName, timestamp), `RTCWarning`, `NetworkTiming`, `TimeMeasurement`.

### OEX backend API contract (read disposition and action endpoints)
- `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md` — `POST /api/voice/sessions/{call_sid}/disposition` (request: `{ disposition, notes? }`, response: `{ call_sid, business_disposition, updated_at }`). `POST /api/voice/sessions/{call_sid}/action` (request: `{ action }` where action is `hold` or `unhold`, response varies). Study the exact request/response shapes and validation rules.

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, project structure, key principles. **Critical:** "Never Expose Twilio" — RTCSample fields map to an SDK-defined interface. AudioHelper/OutputDeviceCollection are never exposed. "Hooks Never Throw" — errors returned as state.

### Existing code (study — understand before modifying)
- `src/providers/OEXCommsProvider.tsx` — **critically important.** Study the full provider implementation: the reducer (CommsState, CommsAction, commsReducer), the initialization effect, how Device/TokenManager/Call are stored in refs, how events are wired, how the context value is assembled. This directive adds an internal context to this provider.
- `src/hooks/useVoice.ts` — study the hook pattern: imports context, null check with developer error, returns fields from context.
- `src/hooks/useDevice.ts` — same pattern, derives `isBusy` and `deviceReady` from context.
- `src/types/voice.ts` — study `OEXCallInfo`, `OEXCommsContextValue`, and other voice types.
- `src/types/api.ts` — study `DispositionRequest`, `DispositionResponse`, `CallActionRequest`. These are the exact types for the API calls.
- `src/services/api-client.ts` — study the `ApiClient` class methods (`post<T>(path, body)`). Disposition and hold actions call this directly.

---

## Design overview

### Architecture decision: internal context for refs

The new hooks need access to internal objects (Device, Call, ApiClient, TokenManager) that are currently stored in refs inside `OEXCommsProvider`. These must not be on the public `OEXCommsContextValue` type — they are internal implementation details.

**Solution:** Add a second, internal-only React context (`OEXCommsInternalContext`) inside the provider. It exposes the refs and the dispatch function. The new hooks consume from both contexts:
- `OEXCommsContext` (public) — for state (callState, callInfo, deviceState, error)
- `OEXCommsInternalContext` (internal, not exported from `src/index.ts`) — for refs (deviceRef, callRef, apiClientRef, tokenManagerRef, dispatch)

The internal context value shape:

```typescript
interface OEXCommsInternalContextValue {
  deviceRef: React.RefObject<Device | null>
  callRef: React.RefObject<Call | null>
  apiClientRef: React.RefObject<ApiClient | null>
  tokenManagerRef: React.RefObject<TokenManager | null>
  dispatch: React.Dispatch<CommsAction>
  lastCallSidRef: React.RefObject<string | null>
}
```

The provider renders both context providers (internal wraps public, or vice versa — order doesn't matter since they are independent). The internal context is **never exported** from `src/index.ts`.

`lastCallSidRef` tracks the call SID from the most recently ended call. It is set in the `CALL_ENDED` reducer action path (or more precisely, captured before the call ref is cleared in the disconnect/cancel/reject event handlers). This is needed for disposition — which is submitted after the call ends.

### useAudioDevices

Reads `device.audio` from the Device ref. Returns available input and output devices as arrays of a SDK-defined `OEXAudioDevice` type (wrapping `MediaDeviceInfo`), current selections, and methods to change them. Manages its own state via `useState` — it polls `device.audio.availableInputDevices` and `device.audio.availableOutputDevices` on mount and whenever `deviceChange` events fire on `navigator.mediaDevices`.

### useCallQuality

Subscribes to the `sample`, `warning`, and `warningCleared` events on the active Call via the call ref. When the call is not active (callState is `idle`), returns null metrics. When a call becomes active, subscribes; when it ends, unsubscribes. Manages its own state via `useState`. Maps `RTCSample` fields to the SDK-defined `OEXCallQualityMetrics` interface. Computes `qualityLevel` from MOS thresholds.

### usePreflight

Completely independent of the main Device. Gets a token from the TokenManager ref, creates a standalone `new PreflightTest(token, options)`, subscribes to its events, and surfaces status/report/error. The hook manages its own lifecycle — calling `run()` starts the test, the test fires events that update hook state.

### Disposition and hold

These are separate hooks (`useDisposition` and `useCallActions`) rather than extensions to `useVoice`, because:
1. They have their own loading/error state (async API calls)
2. They don't need to be in every component that uses `useVoice`
3. Separation follows the "every feature is a hook" principle from CLAUDE.md

`useDisposition` reads `lastCallSidRef` from internal context and `apiClientRef`. Returns `setDisposition(disposition, notes?)` and loading/error/success state.

`useCallActions` reads `callRef` and `apiClientRef` from internal context. Returns `hold()`, `unhold()`, `isOnHold`, and loading/error state.

---

## Build 1: New types

**File:** `src/types/voice.ts` (modify)

Add these types to the existing file. Do not remove or change existing types.

### `OEXAudioDevice`

```typescript
export interface OEXAudioDevice {
  deviceId: string
  label: string
  groupId: string
}
```

### `OEXCallQualityLevel`

```typescript
export type OEXCallQualityLevel = 'excellent' | 'great' | 'good' | 'fair' | 'degraded'
```

### `OEXCallQualityMetrics`

```typescript
export interface OEXCallQualityMetrics {
  /** Mean Opinion Score (1.0–4.5, null if unavailable) */
  mos: number | null
  /** Round-trip time in milliseconds */
  rtt: number
  /** Packet jitter */
  jitter: number
  /** Packet loss fraction (0.0–1.0) */
  packetLoss: number
  /** Overall quality level derived from MOS */
  qualityLevel: OEXCallQualityLevel | null
  /** Audio input level (0–32767) */
  audioInputLevel: number
  /** Audio output level (0–32767) */
  audioOutputLevel: number
  /** Codec in use */
  codec: string
  /** Timestamp of the sample */
  timestamp: number
}
```

### `OEXQualityWarning`

```typescript
export type OEXQualityWarningName = 'high-rtt' | 'high-jitter' | 'high-packet-loss' | 'low-mos' | 'constant-audio-input-level' | 'constant-audio-output-level'

export interface OEXQualityWarning {
  name: OEXQualityWarningName
  value?: number
}
```

### `OEXPreflightStatus`

```typescript
export type OEXPreflightStatus = 'idle' | 'connecting' | 'connected' | 'completed' | 'failed'
```

### `OEXPreflightNetworkTiming`

```typescript
export interface OEXPreflightNetworkTiming {
  signaling?: { start: number; duration?: number; end?: number }
  ice?: { start: number; duration?: number; end?: number }
  dtls?: { start: number; duration?: number; end?: number }
  peerConnection?: { start: number; duration?: number; end?: number }
}
```

### `OEXPreflightReport`

```typescript
export interface OEXPreflightReport {
  /** Overall call quality assessment */
  qualityLevel: OEXCallQualityLevel
  /** Average MOS score */
  averageMos: number | null
  /** Average RTT in ms */
  averageRtt: number | null
  /** Average jitter */
  averageJitter: number | null
  /** Network timing breakdown */
  networkTiming: OEXPreflightNetworkTiming
  /** Edge location used */
  edge: string
  /** Warnings raised during test */
  warnings: string[]
  /** Test call SID */
  callSid: string
}
```

---

## Build 2: Provider modifications — internal context and lastCallSid tracking

**File:** `src/providers/OEXCommsProvider.tsx` (modify)

### Add internal context

Create a second context inside the provider file:

```typescript
export const OEXCommsInternalContext = createContext<OEXCommsInternalContextValue | null>(null)
```

Define the internal context value interface (not exported from `src/index.ts`):

```typescript
interface OEXCommsInternalContextValue {
  deviceRef: React.RefObject<Device | null>
  callRef: React.RefObject<Call | null>
  apiClientRef: React.RefObject<ApiClient | null>
  tokenManagerRef: React.RefObject<TokenManager | null>
  dispatch: React.Dispatch<CommsAction>
  lastCallSidRef: React.RefObject<string | null>
}
```

### Add apiClientRef and lastCallSidRef

Add a new ref for the ApiClient (currently it's a local variable inside the effect — promote it to a ref so hooks can access it):

```typescript
const apiClientRef = useRef<ApiClient | null>(null)
const lastCallSidRef = useRef<string | null>(null)
```

In the initialization effect, after creating the ApiClient, store it in the ref:
```typescript
apiClientRef.current = apiClient
```

In the cleanup, clear it:
```typescript
apiClientRef.current = null
```

### Track lastCallSid

In the call event handlers for `disconnect`, `cancel`, and `reject` — before clearing `callRef.current`, capture the call SID:

```typescript
call.on('disconnect', () => {
  if (callRef.current) {
    lastCallSidRef.current = callRef.current.parameters?.CallSid ?? null
  }
  callRef.current = null
  dispatch({ type: 'CALL_ENDED' })
})
```

Apply the same pattern to `cancel` and `reject` handlers.

Also capture callSid on the `accept` event, since for outbound calls the CallSid may only be available after connection:

```typescript
call.on('accept', () => {
  const callSid = call.parameters?.CallSid ?? null
  dispatch({
    type: 'CALL_STATE_CHANGED',
    callState: 'open',
    callInfo: { ...state is not available here — see implementation note },
  })
})
```

**Implementation note:** The `accept` event handler is inside `wireCallEvents` which doesn't have access to the current callInfo from state. The simplest approach: dispatch `CALL_SID_SET` as a new action that updates callInfo.callSid. Add this action to the reducer:

```typescript
| { type: 'CALL_SID_SET'; callSid: string }
```

Reducer case:
```typescript
case 'CALL_SID_SET':
  if (!state.callInfo) return state
  return { ...state, callInfo: { ...state.callInfo, callSid: action.callSid } }
```

Then in the `accept` handler:
```typescript
call.on('accept', () => {
  dispatch({ type: 'CALL_STATE_CHANGED', callState: 'open', callInfo: null })
  const callSid = call.parameters?.CallSid ?? null
  if (callSid) {
    dispatch({ type: 'CALL_SID_SET', callSid })
  }
})
```

### Assemble internal context value

Memoize the internal context value and wrap the render:

```typescript
const internalContextValue = useMemo<OEXCommsInternalContextValue>(
  () => ({
    deviceRef,
    callRef,
    apiClientRef,
    tokenManagerRef,
    dispatch,
    lastCallSidRef,
  }),
  [], // refs and dispatch are stable
)
```

Render with nested providers:

```tsx
return (
  <OEXCommsInternalContext.Provider value={internalContextValue}>
    <OEXCommsContext.Provider value={contextValue}>
      {children}
    </OEXCommsContext.Provider>
  </OEXCommsInternalContext.Provider>
)
```

### Export the CommsAction type

The `CommsAction` type must be accessible from the internal context (for `dispatch`). It is already defined in the provider file. Since the hooks import from the provider file directly (not from `src/index.ts`), this works without public export changes. But you may need to export the `CommsAction` type from the provider file (not from `src/index.ts`).

---

## Build 3: useAudioDevices hook

**File:** `src/hooks/useAudioDevices.ts` (new)

### Hook signature and return type

```typescript
export interface UseAudioDevicesReturn {
  /** Available microphone devices */
  inputDevices: OEXAudioDevice[]
  /** Available speaker devices */
  outputDevices: OEXAudioDevice[]
  /** Currently selected input device ID, or null */
  selectedInputDeviceId: string | null
  /** Whether the browser supports output device selection */
  isOutputSelectionSupported: boolean
  /** Select a microphone by device ID */
  setInputDevice: (deviceId: string) => Promise<void>
  /** Select a speaker by device ID */
  setOutputDevice: (deviceId: string) => Promise<void>
  /** Play a test tone through the current speaker */
  testSpeaker: () => Promise<void>
  /** Current error, or null */
  error: OEXError | null
}

export function useAudioDevices(): UseAudioDevicesReturn
```

### Implementation

1. Get the Device ref from `OEXCommsInternalContext`.
2. Manage local state: `inputDevices`, `outputDevices`, `selectedInputDeviceId`, `error`.
3. On mount (and when the Device becomes available), read `device.audio.availableInputDevices` and `device.audio.availableOutputDevices`. Map each `MediaDeviceInfo` to `OEXAudioDevice`:
   ```typescript
   { deviceId: info.deviceId, label: info.label || `Device ${info.deviceId.slice(0, 8)}`, groupId: info.groupId }
   ```
4. Listen for device changes: `navigator.mediaDevices.addEventListener('devicechange', refresh)`. Clean up on unmount.
5. Read `device.audio.inputDevice?.deviceId` for `selectedInputDeviceId`.
6. Read `device.audio.isOutputSelectionSupported` for the browser capability flag.
7. `setInputDevice(deviceId)` calls `device.audio.setInputDevice(deviceId)` in a try/catch. On error, set error state.
8. `setOutputDevice(deviceId)` calls `device.audio.speakerDevices.set(deviceId)` in a try/catch. Must check `isOutputSelectionSupported` first — if not supported, set error and return.
9. `testSpeaker()` calls `device.audio.speakerDevices.test()` in a try/catch.

---

## Build 4: useCallQuality hook

**File:** `src/hooks/useCallQuality.ts` (new)

### Hook signature and return type

```typescript
export interface UseCallQualityReturn {
  /** Current call quality metrics, or null if no active call */
  metrics: OEXCallQualityMetrics | null
  /** Active quality warnings */
  warnings: OEXQualityWarning[]
}

export function useCallQuality(): UseCallQualityReturn
```

### Implementation

1. Get the Call ref from `OEXCommsInternalContext` and `callState` from `OEXCommsContext`.
2. Manage local state: `metrics` (OEXCallQualityMetrics | null), `warnings` (OEXQualityWarning[]).
3. Use a `useEffect` keyed on `callState`. When `callState` is `'open'` and `callRef.current` exists:
   - Subscribe to `sample` event on the Call. On each sample, map RTCSample to OEXCallQualityMetrics:
     ```typescript
     {
       mos: sample.mos,
       rtt: sample.rtt,
       jitter: sample.jitter,
       packetLoss: sample.packetsLostFraction,
       qualityLevel: mosToQualityLevel(sample.mos),
       audioInputLevel: sample.audioInputLevel,
       audioOutputLevel: sample.audioOutputLevel,
       codec: sample.codecName,
       timestamp: sample.timestamp,
     }
     ```
   - Subscribe to `warning` event. Add the warning to the warnings array.
   - Subscribe to `warningCleared` event. Remove the warning from the array by name.
4. When `callState` is not `'open'`, set metrics to null and warnings to empty array.
5. Clean up subscriptions when callState changes or on unmount.

### MOS to quality level mapping

```typescript
function mosToQualityLevel(mos: number | null): OEXCallQualityLevel | null {
  if (mos === null) return null
  if (mos >= 4.2) return 'excellent'
  if (mos >= 4.0) return 'great'
  if (mos >= 3.6) return 'good'
  if (mos >= 3.1) return 'fair'
  return 'degraded'
}
```

This function should be defined in the hook file (internal, not exported).

---

## Build 5: usePreflight hook

**File:** `src/hooks/usePreflight.ts` (new)

### Hook signature and return type

```typescript
export interface UsePreflightReturn {
  /** Current test status */
  status: OEXPreflightStatus
  /** Test report (available after completion) */
  report: OEXPreflightReport | null
  /** Current error, or null */
  error: OEXError | null
  /** Start the preflight test */
  run: () => Promise<void>
  /** Stop a running test */
  stop: () => void
}

export function usePreflight(): UsePreflightReturn
```

### Implementation

1. Get the TokenManager ref from `OEXCommsInternalContext`.
2. Manage local state: `status` (initially `'idle'`), `report`, `error`.
3. Store the active PreflightTest instance in a ref.
4. `run()`:
   a. If a test is already running, return.
   b. Fetch a token from `tokenManagerRef.current.fetchToken()`. On failure, set error and return.
   c. Set status to `'connecting'`.
   d. Create `new PreflightTest(token, { fakeMicInput: true })` — use `fakeMicInput: true` so the test doesn't require microphone permission.
   e. Subscribe to events:
      - `connected` → set status to `'connected'`
      - `completed` → map the Twilio Report to `OEXPreflightReport`, set report, set status to `'completed'`
      - `failed` → set error, set status to `'failed'`
      - `sample` → optionally update a latest-sample state for real-time progress (design decision for the executor — not strictly required but nice to have)
   f. Store the test instance in the ref.
5. `stop()`: call `preflightTestRef.current?.stop()` if a test is running.
6. On unmount, stop any running test.

### Mapping Twilio Report to OEXPreflightReport

```typescript
{
  qualityLevel: mapCallQuality(report.callQuality), // Twilio's CallQuality enum → OEXCallQualityLevel
  averageMos: report.stats?.mos?.average ?? null,
  averageRtt: report.stats?.rtt?.average ?? null,
  averageJitter: report.stats?.jitter?.average ?? null,
  networkTiming: {
    signaling: report.networkTiming?.signaling ?? undefined,
    ice: report.networkTiming?.ice ?? undefined,
    dtls: report.networkTiming?.dtls ?? undefined,
    peerConnection: report.networkTiming?.peerConnection ?? undefined,
  },
  edge: report.selectedEdge ?? report.edge ?? '',
  warnings: report.warnings?.map((w: { name?: string }) => w.name ?? 'unknown') ?? [],
  callSid: report.callSid ?? '',
}
```

The `mapCallQuality` function maps Twilio's `PreflightTest.CallQuality` enum values to `OEXCallQualityLevel`:
- `'Excellent'` → `'excellent'`
- `'Great'` → `'great'`
- `'Good'` → `'good'`
- `'Fair'` → `'fair'`
- `'Degraded'` → `'degraded'`

Import `PreflightTest` from `@twilio/voice-sdk` for the constructor. This is an internal import — the PreflightTest type is never exposed publicly.

---

## Build 6: useDisposition hook

**File:** `src/hooks/useDisposition.ts` (new)

### Hook signature and return type

```typescript
export interface UseDispositionReturn {
  /** Submit a disposition for the last completed call */
  setDisposition: (disposition: Disposition, notes?: string) => Promise<void>
  /** The call SID of the last completed call (for which disposition can be set) */
  lastCallSid: string | null
  /** Whether a disposition submission is in progress */
  isSubmitting: boolean
  /** Whether disposition was successfully submitted */
  isSubmitted: boolean
  /** Current error, or null */
  error: OEXError | null
  /** Reset the submission state (for starting a new call cycle) */
  reset: () => void
}

export function useDisposition(): UseDispositionReturn
```

### Implementation

1. Get `apiClientRef` and `lastCallSidRef` from `OEXCommsInternalContext`.
2. Get `callState` from `OEXCommsContext`.
3. Manage local state: `isSubmitting`, `isSubmitted`, `error`.
4. Expose `lastCallSid` from `lastCallSidRef.current`.
5. `setDisposition(disposition, notes?)`:
   a. Validate `disposition` against `DISPOSITION_VALUES`. If invalid, set error and return.
   b. Check that `lastCallSidRef.current` is not null. If null, set error ("No call SID available for disposition") and return.
   c. Set `isSubmitting` to true, clear error.
   d. Call `apiClientRef.current.post<DispositionResponse>(\`/api/voice/sessions/${callSid}/disposition\`, { disposition, notes })`.
   e. On success: set `isSubmitted` to true, `isSubmitting` to false.
   f. On failure: set error from the thrown `OEXError`, set `isSubmitting` to false.
6. `reset()`: clear `isSubmitted`, `isSubmitting`, `error`.
7. When `callState` changes away from `'idle'` (new call starts), auto-reset the disposition state.

---

## Build 7: useCallActions hook

**File:** `src/hooks/useCallActions.ts` (new)

### Hook signature and return type

```typescript
export interface UseCallActionsReturn {
  /** Put the active call on hold via the backend */
  hold: () => Promise<void>
  /** Take the active call off hold via the backend */
  unhold: () => Promise<void>
  /** Whether the call is currently on hold */
  isOnHold: boolean
  /** Whether a hold/unhold action is in progress */
  isLoading: boolean
  /** Current error, or null */
  error: OEXError | null
}

export function useCallActions(): UseCallActionsReturn
```

### Implementation

1. Get `apiClientRef` and `callRef` from `OEXCommsInternalContext`.
2. Get `callState` and `callInfo` from `OEXCommsContext`.
3. Manage local state: `isOnHold`, `isLoading`, `error`.
4. `hold()`:
   a. Check `callState` is `'open'` and `callInfo?.callSid` is not null. If not, set error and return.
   b. Set `isLoading` to true, clear error.
   c. Call `apiClientRef.current.post(\`/api/voice/sessions/${callSid}/action\`, { action: 'hold' })`.
   d. On success: set `isOnHold` to true, `isLoading` to false.
   e. On failure: set error, `isLoading` to false.
5. `unhold()`:
   a. Same guards as hold.
   b. Call with `{ action: 'unhold' }`.
   c. On success: set `isOnHold` to false, `isLoading` to false.
6. Reset `isOnHold` to false when callState changes to `'idle'` (call ended).

---

## Build 8: Index exports

**File:** `src/index.ts` (modify)

Add all new public exports. The final `src/index.ts` should include everything from Directive 02 plus:

```typescript
// New types from this directive
export type {
  OEXAudioDevice,
  OEXCallQualityLevel,
  OEXCallQualityMetrics,
  OEXQualityWarningName,
  OEXQualityWarning,
  OEXPreflightStatus,
  OEXPreflightNetworkTiming,
  OEXPreflightReport,
} from './types'

// New hooks
export { useAudioDevices } from './hooks/useAudioDevices'
export { useCallQuality } from './hooks/useCallQuality'
export { usePreflight } from './hooks/usePreflight'
export { useDisposition } from './hooks/useDisposition'
export { useCallActions } from './hooks/useCallActions'
```

Append these to the existing exports. Do NOT remove any existing exports.

**Do NOT export** `OEXCommsInternalContext` or `OEXCommsInternalContextValue` — these are internal.

---

## Build 9: Tests

**Files:**
- `tests/hooks/useAudioDevices.test.ts` (new)
- `tests/hooks/useCallQuality.test.ts` (new)
- `tests/hooks/usePreflight.test.ts` (new)
- `tests/hooks/useDisposition.test.ts` (new)
- `tests/hooks/useCallActions.test.ts` (new)

### Mocking strategy

Reuse the `@twilio/voice-sdk` mock from the Directive 02 tests. Extend it:
- Mock `Device.audio` with `availableInputDevices`, `availableOutputDevices`, `speakerDevices` (with `set`, `test`, `get`), `isOutputSelectionSupported`, `setInputDevice`, `inputDevice`.
- Mock `PreflightTest` constructor and events.
- Mock `navigator.mediaDevices.addEventListener` for device change events.

Mock `src/services/api-client.ts` for disposition/action API calls.

For all hooks, render with a wrapper that provides both `OEXCommsContext` and `OEXCommsInternalContext`.

### `tests/hooks/useAudioDevices.test.ts` — Audio devices tests (7 tests)

1. Returns available input devices from device.audio.availableInputDevices
2. Returns available output devices from device.audio.availableOutputDevices
3. setInputDevice calls device.audio.setInputDevice with the device ID
4. setOutputDevice calls device.audio.speakerDevices.set with the device ID
5. setOutputDevice returns error when output selection is not supported
6. testSpeaker calls device.audio.speakerDevices.test
7. Throws error when used outside OEXCommsProvider

### `tests/hooks/useCallQuality.test.ts` — Call quality tests (6 tests)

1. Returns null metrics when no call is active
2. Returns metrics from sample event when call is open
3. Maps MOS to correct quality level (test multiple thresholds)
4. Adds warnings from warning event
5. Removes warnings from warningCleared event
6. Resets metrics to null when call ends

### `tests/hooks/usePreflight.test.ts` — Preflight tests (6 tests)

1. Initial status is 'idle'
2. run() fetches token and creates PreflightTest
3. Status updates to 'connecting' then 'connected'
4. Completed event produces OEXPreflightReport with mapped quality level
5. Failed event sets error and status to 'failed'
6. stop() calls preflightTest.stop()

### `tests/hooks/useDisposition.test.ts` — Disposition tests (6 tests)

1. lastCallSid reflects the last completed call's SID
2. setDisposition calls POST /api/voice/sessions/{sid}/disposition with correct body
3. setDisposition rejects invalid disposition values
4. setDisposition sets error when no call SID available
5. isSubmitting is true during API call, false after
6. reset() clears submission state

### `tests/hooks/useCallActions.test.ts` — Call actions tests (5 tests)

1. hold() calls POST /api/voice/sessions/{sid}/action with { action: 'hold' }
2. unhold() calls POST /api/voice/sessions/{sid}/action with { action: 'unhold' }
3. hold() sets isOnHold to true on success
4. hold() sets error on API failure
5. isOnHold resets to false when call ends

Total: **30 tests** (new). Combined with 50 existing = **80 total**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/hooks/useAudioDevices.ts`
- `src/hooks/useCallQuality.ts`
- `src/hooks/usePreflight.ts`
- `src/hooks/useDisposition.ts`
- `src/hooks/useCallActions.ts`
- `tests/hooks/useAudioDevices.test.ts`
- `tests/hooks/useCallQuality.test.ts`
- `tests/hooks/usePreflight.test.ts`
- `tests/hooks/useDisposition.test.ts`
- `tests/hooks/useCallActions.test.ts`

Files to modify:
- `src/types/voice.ts` — add new type definitions (OEXAudioDevice, OEXCallQualityMetrics, OEXPreflightReport, etc.)
- `src/providers/OEXCommsProvider.tsx` — add internal context, apiClientRef, lastCallSidRef, CALL_SID_SET action, nested providers
- `src/index.ts` — add new type and hook exports

Files that must NOT be modified:
- `src/services/api-client.ts`
- `src/services/token-manager.ts`
- `src/services/event-bus.ts`
- `src/types/api.ts`
- `src/types/events.ts`
- `src/types/index.ts`
- `src/utils/errors.ts`
- `src/utils/constants.ts`
- `src/hooks/useVoice.ts`
- `src/hooks/useDevice.ts`
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add audio devices, call quality, preflight, disposition, and hold hooks (directive 03)`

---

## Build order

1. **Build 1**: Types → `src/types/voice.ts`
2. **Build 2**: Provider modifications → `src/providers/OEXCommsProvider.tsx`
3. **Build 3**: useAudioDevices → `src/hooks/useAudioDevices.ts`
4. **Build 4**: useCallQuality → `src/hooks/useCallQuality.ts`
5. **Build 5**: usePreflight → `src/hooks/usePreflight.ts`
6. **Build 6**: useDisposition → `src/hooks/useDisposition.ts`
7. **Build 7**: useCallActions → `src/hooks/useCallActions.ts`
8. **Build 8**: Index exports → `src/index.ts`
9. **Build 9**: Tests → all test files

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `src/types/voice.ts` defines all new types (`OEXAudioDevice`, `OEXCallQualityLevel`, `OEXCallQualityMetrics`, `OEXQualityWarning`, `OEXPreflightStatus`, `OEXPreflightReport`, etc.) without any Twilio type references.
(c) Confirm `OEXCommsProvider` now exposes an `OEXCommsInternalContext` with deviceRef, callRef, apiClientRef, tokenManagerRef, dispatch, and lastCallSidRef.
(d) Confirm `OEXCommsInternalContext` is NOT exported from `src/index.ts`.
(e) Confirm `lastCallSidRef` captures the call SID before `callRef` is cleared in disconnect/cancel/reject handlers.
(f) Confirm `useAudioDevices` reads from `device.audio`, maps `MediaDeviceInfo` to `OEXAudioDevice`, checks `isOutputSelectionSupported`, and provides `setInputDevice`, `setOutputDevice`, `testSpeaker`.
(g) Confirm `useCallQuality` subscribes to `sample`/`warning`/`warningCleared` on the active Call and maps RTCSample to `OEXCallQualityMetrics` with MOS-based quality levels.
(h) Confirm `usePreflight` creates a standalone `PreflightTest` (independent of main Device), uses `fakeMicInput: true`, and maps the Twilio Report to `OEXPreflightReport`.
(i) Confirm `useDisposition` validates against `DISPOSITION_VALUES`, calls `POST /api/voice/sessions/{call_sid}/disposition`, and tracks submission state.
(j) Confirm `useCallActions` calls `POST /api/voice/sessions/{call_sid}/action` with `hold`/`unhold` and tracks `isOnHold` state.
(k) Confirm `src/index.ts` exports all 5 new hooks and all new types. Confirm no Twilio types are exported.
(l) Confirm `pnpm build` succeeds.
(m) Confirm `pnpm test` passes with 80 tests (50 existing + 30 new).
(n) Confirm no files outside ALLOWED_FILES were modified.
(o) Confirm `src/services/`, `src/utils/`, `src/types/api.ts`, `src/types/events.ts`, `src/types/index.ts`, `src/hooks/useVoice.ts`, `src/hooks/useDevice.ts`, `CLAUDE.md`, `docs/`, and `api-reference-docs-new/` were NOT modified.
