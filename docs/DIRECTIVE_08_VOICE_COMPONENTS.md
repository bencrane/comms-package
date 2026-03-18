# Directive 08: Voice Components — CallBar, Dialer, AudioDeviceSelector, IncomingCallBanner, PowerDialerPanel

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** This SDK provides React hooks for browser-based voice calling and messaging. Directives 01–07 built the full hook layer: `useVoice` (call lifecycle), `useDevice` (device registration), `useAudioDevices` (mic/speaker selection), `useCallQuality` (real-time MOS metrics), `usePreflight` (connectivity test), `useDisposition` (post-call outcome), `useCallActions` (hold/unhold), and `usePowerDialer` (lead queue auto-dialing). All hooks live in `src/hooks/`, all types in `src/types/`, the voice provider is `OEXCommsProvider` in `src/providers/OEXCommsProvider.tsx`.

This directive adds **headless component primitives** — unstyled, behavior-only React components that consume the SDK's hooks internally and expose clean prop interfaces. These are Phase 4A: no CSS, no visual design, no layout assumptions. Consuming apps style them via `className` props and `data-*` attribute selectors. Every component uses `forwardRef`, ARIA attributes, and composable subcomponents where appropriate.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, project structure, key principles. **Critical:** components are layer 5 (top of stack), they depend on hooks, they are optional. "Never Expose Twilio" applies to component props too — no Twilio types in any prop interface. Components go in `src/components/`.

### Hooks to consume (study return types carefully)
- `src/hooks/useVoice.ts` — returns `connect(to)`, `disconnect()`, `mute()`, `toggleMute()`, `sendDigits()`, `acceptIncoming()`, `rejectIncoming()`, `callInfo` (OEXCallInfo | null), `callState` (OEXCallState), `deviceReady`, `error`.
- `src/hooks/useDevice.ts` — returns `state` (OEXDeviceState), `deviceReady`, `isBusy`, `identity`, `error`.
- `src/hooks/useAudioDevices.ts` — returns `inputDevices`, `outputDevices`, `selectedInputDeviceId`, `isOutputSelectionSupported`, `setInputDevice()`, `setOutputDevice()`, `testSpeaker()`, `error`.
- `src/hooks/useCallActions.ts` — returns `hold()`, `unhold()`, `isOnHold`, `isLoading`, `error`.
- `src/hooks/usePowerDialer.ts` — returns session control (`start`, `pause`, `resume`, `skip`, `endSession`), session state (`sessionState`, `currentLead`, `queuePosition`, `stats`, `results`, `currentLeadState`), voice passthrough (`callState`, `callInfo`, `deviceReady`, `disconnect`, `sendDigits`, `mute`, `toggleMute`), disposition (`setDisposition`, `isDispositionSubmitting`, `isDispositionSubmitted`, `lastCallSid`), `error`.

### Types to reference (study the exact field names)
- `src/types/voice.ts` — `OEXCallState`, `OEXCallInfo`, `OEXDeviceState`, `OEXAudioDevice`, `OEXDialerLead`, `OEXDialerSessionState`, `OEXDialerLeadState`, `OEXDialerSessionStats`, `OEXDialerLeadResult`.
- `src/types/index.ts` — barrel export of all types.

---

## Existing code to read before starting

Study these files to learn the SDK's conventions. Match them exactly.

### Package foundation
- `CLAUDE.md` — conventions, architecture, project structure
- `package.json` — dependencies, peer deps, build scripts
- `tsconfig.json` — TypeScript configuration, strict mode settings
- `src/index.ts` — public exports (only what's in this file is part of the public API)

### Hooks (study return types — components consume these)
- `src/hooks/useVoice.ts` — **critically important.** The `UseVoiceReturn` interface defines every field the CallBar, Dialer, and IncomingCallBanner consume. Study `callState`, `callInfo`, `connect()`, `disconnect()`, `sendDigits()`, `mute()`, `toggleMute()`, `acceptIncoming()`, `rejectIncoming()`, `deviceReady`.
- `src/hooks/useDevice.ts` — `UseDeviceReturn`: `state`, `deviceReady`, `isBusy`, `identity`.
- `src/hooks/useAudioDevices.ts` — `UseAudioDevicesReturn`: `inputDevices`, `outputDevices`, `isOutputSelectionSupported`, `setInputDevice()`, `setOutputDevice()`, `testSpeaker()`.
- `src/hooks/useCallActions.ts` — `UseCallActionsReturn`: `hold()`, `unhold()`, `isOnHold`.
- `src/hooks/usePowerDialer.ts` — `UsePowerDialerReturn`: session control, session state, voice passthrough, disposition.

### Types (study exact field names for props)
- `src/types/voice.ts` — all voice and power dialer types.

---

## Design overview

### Headless component conventions

Every component in this directive follows these rules:

1. **`forwardRef`** on the root element. The ref is forwarded to the outermost `<div>` (or semantic element).
2. **`className` prop** on the root element and on every significant sub-element (each subcomponent accepts its own `className`).
3. **`data-*` attributes** for state-based styling:
   - `data-state` — maps to the component's primary state (e.g., `data-state="open"` on CallBar when a call is active)
   - `data-muted` — `"true"` or `"false"` when mute state is relevant
   - `data-active` — `"true"` when the element represents an active/selected state
   - `data-hold` — `"true"` when call is on hold
   - `data-disabled` — `"true"` when the element is disabled
4. **ARIA attributes** for accessibility — `role`, `aria-label`, `aria-live`, `aria-disabled`, `aria-pressed` where appropriate.
5. **No CSS** — no inline styles, no className defaults, no layout assumptions. No `position: fixed`, no `width`, no `display: flex`. Zero visual opinions.
6. **Composable subcomponents** via compound component pattern: `CallBar.Timer`, `CallBar.Controls`, etc. Implemented using `Object.assign(forwardRef(...), { SubComponent })`.
7. **`children` or render props** where the consuming app might want full control. Subcomponents accept `children` to allow custom content.

### Compound component pattern

Subcomponents share state with their parent via a React context that is **internal to the component file** — not exported from `src/index.ts`. The parent component (e.g., `CallBar`) calls the hook(s) and provides state through this internal context. Subcomponents consume the context.

```
CallBar (calls useVoice, useDevice, useCallActions → provides context)
  ├── CallBar.Status (reads callState from context)
  ├── CallBar.Timer (reads callState, manages its own interval)
  ├── CallBar.Controls (reads mute/hold/disconnect from context)
  └── CallBar.CallerInfo (reads callInfo from context)
```

The parent component renders `{children}` inside its context provider. If no children are provided, it renders all subcomponents in a default arrangement.

This pattern means the consuming app can compose:

```tsx
<CallBar>
  <CallBar.CallerInfo />
  <CallBar.Timer />
  <CallBar.Controls />
</CallBar>
```

Or use the parent alone for the default layout:

```tsx
<CallBar />
```

### Phone number formatting (Dialer)

The Dialer formats phone numbers as the user types. The formatting logic:

1. Strip all characters except digits and leading `+`.
2. If the raw digits (after stripping +) start with `1` and have 11 digits total: format as `+1 (XXX) XXX-XXXX`.
3. If the raw digits have exactly 10 digits (no country code): format as `+1 (XXX) XXX-XXXX` and store `+1XXXXXXXXXX` as the E.164 value.
4. Partial formatting during typing:
   - 0 digits: empty
   - 1 digit (the `1`): `+1`
   - 2–4 digits: `+1 (XX...`
   - 5–7 digits: `+1 (XXX) XXX...`
   - 8–11 digits: `+1 (XXX) XXX-XXXX`
5. For international numbers (not starting with `1` or `+1`): display as `+{digits}` with no specific formatting.
6. The `connect()` call receives the raw E.164 string (e.g., `+15551234567`), never the formatted display string.

The formatted value is display-only. The component tracks both the raw E.164 value and the formatted display value internally.

### CallBar timer

The timer starts counting when `callState` transitions to `'open'`. It uses `setInterval` with a 1-second tick. The component captures `Date.now()` when the call becomes active and computes elapsed time as `now - startTime` on each tick. The timer value is exposed as total elapsed seconds. The subcomponent formats it as `MM:SS` (or `HH:MM:SS` when >= 1 hour). The timer resets when `callState` returns to `'idle'`.

---

## Build 1: CallBar component

**File:** `src/components/CallBar.tsx` (new)

### Internal context

Create a `CallBarContext` (not exported) that holds the combined state from `useVoice()`, `useDevice()`, and `useCallActions()`, plus timer state (`elapsedSeconds: number`) and callback props (`onDisposition`).

### CallBar (root)

Props interface:

```typescript
export interface CallBarProps {
  /** Callback fired when the user triggers disposition capture */
  onDisposition?: (callSid: string) => void
  /** Additional className for the root element */
  className?: string
  /** Custom content — if provided, replaces the default subcomponent arrangement */
  children?: React.ReactNode
}
```

Implementation:
- Uses `forwardRef<HTMLDivElement, CallBarProps>`.
- Calls `useVoice()`, `useDevice()`, and `useCallActions()`.
- Manages a timer via `setInterval`:
  - When `callState` transitions to `'open'`, capture `Date.now()` in a ref and start an interval that updates `elapsedSeconds` every 1000ms.
  - When `callState` leaves `'open'`, stop the interval and reset `elapsedSeconds` to 0.
  - Clean up the interval on unmount.
- Provides all state via `CallBarContext.Provider`.
- Root `<div>` attributes:
  - `data-state={callState}`
  - `data-muted={String(callInfo?.isMuted ?? false)}`
  - `data-hold={String(isOnHold)}`
  - `role="region"`
  - `aria-label="Call controls"`
- If `children` is provided, render children. Otherwise, render the default arrangement: `<CallBar.Status />`, `<CallBar.CallerInfo />`, `<CallBar.Timer />`, `<CallBar.Controls onDisposition={onDisposition} />`.

### CallBar.Status

Props:
```typescript
export interface CallBarStatusProps {
  className?: string
  children?: React.ReactNode
}
```

- Reads `callState` from `CallBarContext`.
- Renders a `<div>` with `data-state={callState}` and `aria-live="polite"`.
- Default children: text label for the call state (e.g., `"Connecting..."`, `"Ringing"`, `"Connected"`, `"Reconnecting..."`, `"Call ended"`, `"Incoming call"`).
- If custom `children` provided, render those instead.

### CallBar.Timer

Props:
```typescript
export interface CallBarTimerProps {
  className?: string
  children?: (elapsedSeconds: number) => React.ReactNode
}
```

- Reads `elapsedSeconds` from `CallBarContext`.
- If `children` is a render function, call it with `elapsedSeconds`.
- Otherwise, format as `MM:SS` (or `H:MM:SS` when >= 3600). Use `aria-label="Call duration"` and `role="timer"` on the root element.

### CallBar.Controls

Props:
```typescript
export interface CallBarControlsProps {
  className?: string
  onDisposition?: (callSid: string) => void
  children?: React.ReactNode
}
```

- Reads voice/device/callActions state from `CallBarContext`.
- Default children: four `<button>` elements:
  1. **Mute button**: calls `toggleMute()`. `aria-pressed={isMuted}`, `data-active={String(isMuted)}`, `aria-label={isMuted ? "Unmute" : "Mute"}`.
  2. **Hold button**: calls `hold()` or `unhold()`. `aria-pressed={isOnHold}`, `data-active={String(isOnHold)}`, `aria-label={isOnHold ? "Resume" : "Hold"}`.
  3. **Hangup button**: calls `disconnect()`. `aria-label="Hang up"`.
  4. **Disposition button**: calls `onDisposition?.(callSid)` when call is in `'idle'` state (post-call) and a `callSid` is available. `data-disabled={String(!canDisposition)}`, `aria-disabled={!canDisposition}`.
- Mute, hold, and hangup buttons should have `data-disabled="true"` and `aria-disabled` when there is no active call (`callState` is not `'open'` and not `'reconnecting'`).
- If custom `children` provided, render those instead.

### CallBar.CallerInfo

Props:
```typescript
export interface CallBarCallerInfoProps {
  className?: string
  children?: (info: { from: string; to: string; direction: OEXCallDirection } | null) => React.ReactNode
}
```

- Reads `callInfo` from `CallBarContext`.
- If `children` is a render function, call it with the caller info (or null).
- Default: renders two `<span>` elements for `from` and `to` inside a `<div>`.

---

## Build 2: Dialer component

**File:** `src/components/Dialer.tsx` (new)

### Props

```typescript
export interface DialerProps {
  /** Initial phone number value */
  defaultValue?: string
  /** Controlled phone number value (E.164 raw format, e.g., "+15551234567") */
  value?: string
  /** Called when the phone number changes (receives raw E.164 string) */
  onChange?: (value: string) => void
  /** Called when a call is initiated — receives the E.164 number */
  onCall?: (number: string) => void
  /** Whether to show the DTMF keypad during active calls */
  showDtmfKeypad?: boolean
  /** Additional className for the root element */
  className?: string
  /** className for the phone input */
  inputClassName?: string
  /** className for the call button */
  callButtonClassName?: string
  /** className for the DTMF keypad container */
  keypadClassName?: string
  /** Custom content — replaces entire default render */
  children?: React.ReactNode
}
```

### Implementation

- Uses `forwardRef<HTMLDivElement, DialerProps>`.
- Calls `useVoice()`.
- Internal state: `rawValue` (the E.164 digits string, e.g., `+15551234567`), `displayValue` (the formatted string, e.g., `+1 (555) 123-4567`).
- Supports both controlled (`value` prop) and uncontrolled (`defaultValue` prop) modes.
- `formatPhoneNumber(raw: string): string` — pure function, implements the formatting logic from the design overview. Defined inside the file, not exported.
- `stripToE164(input: string): string` — strips non-digit characters, preserves/prepends `+`. Defined inside the file, not exported.
- Input `onChange`: strip input to digits, update `rawValue`, compute `displayValue`, call `onChange` prop.
- Root `<div>` attributes: `data-state={callState}`, `data-disabled={String(!deviceReady)}`.
- Phone input: `<input type="tel">` with `value={displayValue}`, `aria-label="Phone number"`, `inputClassName`.
- Call button: `<button>` with `aria-label="Start call"`, disabled when `!deviceReady || callState !== 'idle' || !rawValue`. On click: call `connect(rawValue)` and then `onCall?.(rawValue)`.
  - When a call is active (`callState !== 'idle'`), the button transforms into a hangup button: calls `disconnect()`, `aria-label="Hang up"`, `data-state="active"`.
- DTMF keypad: rendered only when `showDtmfKeypad !== false` AND `callState === 'open'`. A `<div>` containing 12 `<button>` elements (digits 0–9, `*`, `#`). Each button calls `sendDigits(digit)` on click. Each button: `aria-label="Digit {d}"`. The keypad container has `role="group"`, `aria-label="Dialpad"`.
- If custom `children` provided, render those inside the context provider instead.

### Dialer internal context

Create a `DialerContext` (not exported) that provides: `rawValue`, `displayValue`, `setNumber(raw)`, `callState`, `deviceReady`, `connect`, `disconnect`, `sendDigits`. This allows a consuming app to use `<Dialer>{children}</Dialer>` with custom children that access the dialer state via a `useDialerContext()` hook exported only for internal use.

Actually — **do not export `useDialerContext`**. The Dialer does not have subcomponents (no dot notation). The render prop or children approach is sufficient. The context is internal-only to support custom children accessing state. Instead, expose a render prop alternative:

```typescript
export interface DialerProps {
  // ... other props
  /** Render prop for full control */
  children?: (state: {
    rawValue: string
    displayValue: string
    callState: OEXCallState
    deviceReady: boolean
    setNumber: (raw: string) => void
    dial: () => void
    hangUp: () => void
    sendDigit: (digit: string) => void
  }) => React.ReactNode
}
```

When `children` is a function, call it with the state object. When `children` is a ReactNode (or not provided), render the default UI.

---

## Build 3: AudioDeviceSelector component

**File:** `src/components/AudioDeviceSelector.tsx` (new)

### Props

```typescript
export interface AudioDeviceSelectorProps {
  /** Additional className for the root element */
  className?: string
  /** className for the microphone select */
  inputSelectClassName?: string
  /** className for the speaker select */
  outputSelectClassName?: string
  /** className for the test speaker button */
  testButtonClassName?: string
  /** Custom render for the input device selector */
  renderInputSelect?: (props: {
    devices: OEXAudioDevice[]
    selectedDeviceId: string | null
    onChange: (deviceId: string) => void
  }) => React.ReactNode
  /** Custom render for the output device selector */
  renderOutputSelect?: (props: {
    devices: OEXAudioDevice[]
    onChange: (deviceId: string) => void
  }) => React.ReactNode
  /** Label text for microphone selector */
  inputLabel?: string
  /** Label text for speaker selector */
  outputLabel?: string
  children?: React.ReactNode
}
```

### Implementation

- Uses `forwardRef<HTMLDivElement, AudioDeviceSelectorProps>`.
- Calls `useAudioDevices()`.
- Root `<div>` with `role="group"`, `aria-label="Audio device settings"`.
- **Microphone section**: a `<label>` + `<select>` pair (or `renderInputSelect` if provided). The `<select>` lists `inputDevices` as `<option>` elements. Value is `selectedInputDeviceId`. On change, calls `setInputDevice(deviceId)`. Default label: `"Microphone"` (overridable via `inputLabel`).
- **Speaker section**: only rendered when `isOutputSelectionSupported` is `true`. A `<label>` + `<select>` pair (or `renderOutputSelect` if provided). Lists `outputDevices`. On change, calls `setOutputDevice(deviceId)`. Default label: `"Speaker"` (overridable via `outputLabel`).
- **Test speaker button**: `<button>` that calls `testSpeaker()`. `aria-label="Test speaker"`. Only rendered when `isOutputSelectionSupported` is `true`.
- Data attributes on root: `data-output-supported={String(isOutputSelectionSupported)}`.
- Error state: if `error` is set, render a `<div>` with `role="alert"` and `data-error="true"` containing `error.message`.

---

## Build 4: IncomingCallBanner component

**File:** `src/components/IncomingCallBanner.tsx` (new)

### Props

```typescript
export interface IncomingCallBannerProps {
  /** Additional className for the root element */
  className?: string
  /** className for the accept button */
  acceptButtonClassName?: string
  /** className for the reject button */
  rejectButtonClassName?: string
  /** Called after the call is accepted */
  onAccept?: () => void
  /** Called after the call is rejected */
  onReject?: () => void
  /** Custom content */
  children?: (info: { from: string; to: string }) => React.ReactNode
}
```

### Implementation

- Uses `forwardRef<HTMLDivElement, IncomingCallBannerProps>`.
- Calls `useVoice()`.
- **Renders `null`** when `callState !== 'pending'`. This is the core behavior — the component auto-shows on incoming calls and auto-hides when the call is accepted, rejected, or cancelled.
- Root `<div>` attributes: `role="alertdialog"`, `aria-label="Incoming call"`, `aria-live="assertive"`, `data-state="pending"`.
- Default content:
  - Caller info `<div>`: shows `callInfo.from`. `aria-label="Caller"`.
  - Accept `<button>`: calls `acceptIncoming()` then `onAccept?.()`. `aria-label="Accept call"`.
  - Reject `<button>`: calls `rejectIncoming()` then `onReject?.()`. `aria-label="Reject call"`.
- If `children` is a render function and `callInfo` is available, call it with `{ from: callInfo.from, to: callInfo.to }` and render the result alongside the default accept/reject buttons.

---

## Build 5: PowerDialerPanel component

**File:** `src/components/PowerDialerPanel.tsx` (new)

### Internal context

Create a `PowerDialerPanelContext` (not exported) that holds the full return value of `usePowerDialer()`.

### PowerDialerPanel (root)

Props:
```typescript
export interface PowerDialerPanelProps {
  /** The lead queue to dial through */
  leads: OEXDialerLead[]
  /** Power dialer options (advanceDelayMs, etc.) */
  options?: OEXDialerOptions
  /** Callback fired when disposition should be captured */
  onDisposition?: (callSid: string) => void
  /** Additional className for the root element */
  className?: string
  children?: React.ReactNode
}
```

Implementation:
- Uses `forwardRef<HTMLDivElement, PowerDialerPanelProps>`.
- Calls `usePowerDialer(leads, options)`.
- Provides all state via `PowerDialerPanelContext.Provider`.
- Root `<div>`: `data-state={sessionState}`, `data-lead-state={currentLeadState ?? 'none'}`, `role="region"`, `aria-label="Power dialer"`.
- Default children: `<PowerDialerPanel.LeadInfo />`, `<PowerDialerPanel.QueueProgress />`, `<PowerDialerPanel.Controls />`, `<PowerDialerPanel.Stats />`.

### PowerDialerPanel.LeadInfo

Props:
```typescript
export interface PowerDialerPanelLeadInfoProps {
  className?: string
  children?: (lead: OEXDialerLead | null) => React.ReactNode
}
```

- Reads `currentLead` from context.
- Default: renders lead `name` and `phoneNumber` in `<span>` elements, or "No lead" when null.
- `data-state={currentLeadState ?? 'none'}`.

### PowerDialerPanel.QueueProgress

Props:
```typescript
export interface PowerDialerPanelQueueProgressProps {
  className?: string
  children?: (position: number, total: number) => React.ReactNode
}
```

- Reads `queuePosition` and `stats.totalLeads` from context.
- Default: renders `"{position + 1} of {total}"` (1-indexed for display). Uses `role="status"`, `aria-label="Queue progress"`.
- If `sessionState` is `'idle'`, displays `"0 of {total}"`.

### PowerDialerPanel.Controls

Props:
```typescript
export interface PowerDialerPanelControlsProps {
  className?: string
  onDisposition?: (callSid: string) => void
  children?: React.ReactNode
}
```

- Reads session control functions and session state from context.
- Default: renders the appropriate buttons based on `sessionState`:
  - `'idle'`: **Start** button (`start()`)
  - `'active'`: **Pause** (`pause()`), **Skip** (`skip()`), **End** (`endSession()`) buttons
  - `'paused'`: **Resume** (`resume()`), **End** (`endSession()`) buttons
  - `'completed'`: no action buttons (or a "Session complete" text)
- Each button: `data-action="{action}"`, `aria-label="{Action}"`.
- When `currentLeadState === 'awaiting_disposition'` and `lastCallSid` is available, render a **Disposition** button that calls `onDisposition?.(lastCallSid)`.
- When `isDispositionSubmitted`, the disposition button shows `data-state="submitted"`.

### PowerDialerPanel.Stats

Props:
```typescript
export interface PowerDialerPanelStatsProps {
  className?: string
  children?: (stats: OEXDialerSessionStats) => React.ReactNode
}
```

- Reads `stats` from context.
- Default: renders `callsCompleted`, `callsSkipped`, `callsRemaining` in `<span>` elements with `data-stat="{statName}"`.
- `role="status"`, `aria-label="Session statistics"`.

---

## Build 6: Index exports

**File:** `src/index.ts` (modify)

Add the following exports **after** the existing hook exports and **before** any trailing comments. Add a new section:

```typescript
// Voice components
export { CallBar } from './components/CallBar'
export type {
  CallBarProps,
  CallBarStatusProps,
  CallBarTimerProps,
  CallBarControlsProps,
  CallBarCallerInfoProps,
} from './components/CallBar'

export { Dialer } from './components/Dialer'
export type { DialerProps } from './components/Dialer'

export { AudioDeviceSelector } from './components/AudioDeviceSelector'
export type { AudioDeviceSelectorProps } from './components/AudioDeviceSelector'

export { IncomingCallBanner } from './components/IncomingCallBanner'
export type { IncomingCallBannerProps } from './components/IncomingCallBanner'

export { PowerDialerPanel } from './components/PowerDialerPanel'
export type {
  PowerDialerPanelProps,
  PowerDialerPanelLeadInfoProps,
  PowerDialerPanelQueueProgressProps,
  PowerDialerPanelControlsProps,
  PowerDialerPanelStatsProps,
} from './components/PowerDialerPanel'
```

Do NOT remove any existing exports. Append this new section.

---

## Build 7: Tests

**Files:**
- `tests/components/CallBar.test.tsx` (new)
- `tests/components/Dialer.test.tsx` (new)
- `tests/components/AudioDeviceSelector.test.tsx` (new)
- `tests/components/IncomingCallBanner.test.tsx` (new)
- `tests/components/PowerDialerPanel.test.tsx` (new)

### Mocking strategy

Mock all hooks at the module level:

```typescript
vi.mock('../../src/hooks/useVoice', () => ({ useVoice: vi.fn() }))
vi.mock('../../src/hooks/useDevice', () => ({ useDevice: vi.fn() }))
vi.mock('../../src/hooks/useCallActions', () => ({ useCallActions: vi.fn() }))
vi.mock('../../src/hooks/useAudioDevices', () => ({ useAudioDevices: vi.fn() }))
vi.mock('../../src/hooks/usePowerDialer', () => ({ usePowerDialer: vi.fn() }))
```

Each test configures the mocked hook to return specific state. No need for providers in these tests — the hooks are fully mocked.

Use `render` from React Testing Library (not `renderHook`). Use `screen.getByRole`, `screen.getByText`, `screen.getByLabelText` for assertions. Use `fireEvent` or `userEvent` for interactions.

### `tests/components/CallBar.test.tsx` — CallBar tests (8 tests)

1. Renders with `data-state` matching callState from useVoice
2. Timer starts counting when callState is 'open' (use `vi.useFakeTimers`, advance 3 seconds, verify "0:03" or "00:03" is rendered)
3. Timer resets to 0 when callState returns to 'idle'
4. Mute button calls toggleMute and has correct `aria-pressed` attribute
5. Hold button calls hold/unhold and has correct `aria-pressed` attribute
6. Hangup button calls disconnect
7. Disposition callback fires with callSid when triggered
8. CallerInfo subcomponent renders from/to from callInfo

### `tests/components/Dialer.test.tsx` — Dialer tests (7 tests)

1. Renders phone input with type="tel"
2. Formats US phone number as user types (input "5551234567" → displays "+1 (555) 123-4567")
3. Call button calls connect with raw E.164 value ("+15551234567"), not formatted
4. Call button is disabled when deviceReady is false
5. Call button is disabled when callState is not 'idle'
6. DTMF keypad renders during active call and sendDigits is called on button click
7. DTMF keypad is hidden when callState is 'idle'

### `tests/components/AudioDeviceSelector.test.tsx` — AudioDeviceSelector tests (5 tests)

1. Renders input device select with available devices as options
2. Selecting an input device calls setInputDevice with the device ID
3. Speaker section is hidden when isOutputSelectionSupported is false
4. Test speaker button calls testSpeaker
5. renderInputSelect render prop overrides the default select element

### `tests/components/IncomingCallBanner.test.tsx` — IncomingCallBanner tests (5 tests)

1. Renders nothing when callState is not 'pending'
2. Renders with role="alertdialog" when callState is 'pending'
3. Accept button calls acceptIncoming and onAccept callback
4. Reject button calls rejectIncoming and onReject callback
5. Shows caller info (from) when callInfo is available

### `tests/components/PowerDialerPanel.test.tsx` — PowerDialerPanel tests (7 tests)

1. Renders with data-state matching sessionState
2. LeadInfo shows current lead name and phone number
3. Controls shows Start button when session is idle
4. Controls shows Pause/Skip/End buttons when session is active
5. Controls shows Resume/End buttons when session is paused
6. QueueProgress shows correct position (1-indexed) and total
7. Stats renders callsCompleted, callsSkipped, callsRemaining

Total: **32 tests** (new). Combined with 149 existing = **181 total**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `src/components/CallBar.tsx`
- `src/components/Dialer.tsx`
- `src/components/AudioDeviceSelector.tsx`
- `src/components/IncomingCallBanner.tsx`
- `src/components/PowerDialerPanel.tsx`
- `tests/components/CallBar.test.tsx`
- `tests/components/Dialer.test.tsx`
- `tests/components/AudioDeviceSelector.test.tsx`
- `tests/components/IncomingCallBanner.test.tsx`
- `tests/components/PowerDialerPanel.test.tsx`

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

Commit message: `feat: add headless voice components — CallBar, Dialer, AudioDeviceSelector, IncomingCallBanner, PowerDialerPanel (directive 08)`

---

## Build order

1. **Build 1**: CallBar → `src/components/CallBar.tsx`
2. **Build 2**: Dialer → `src/components/Dialer.tsx`
3. **Build 3**: AudioDeviceSelector → `src/components/AudioDeviceSelector.tsx`
4. **Build 4**: IncomingCallBanner → `src/components/IncomingCallBanner.tsx`
5. **Build 5**: PowerDialerPanel → `src/components/PowerDialerPanel.tsx`
6. **Build 6**: Index exports → `src/index.ts`
7. **Build 7**: Tests → all test files

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm all 5 component files use `forwardRef` on the root element.
(c) Confirm all components accept `className` on the root element and on significant sub-elements.
(d) Confirm all components use `data-state` and other `data-*` attributes for state-based styling — no CSS, no inline styles, no layout assumptions.
(e) Confirm all components have appropriate ARIA attributes (`role`, `aria-label`, `aria-live`, `aria-pressed`, `aria-disabled`).
(f) Confirm CallBar.Timer ticks every second during an active call and resets when the call ends.
(g) Confirm Dialer formats phone numbers as the user types and passes raw E.164 to `connect()`.
(h) Confirm Dialer call button is disabled when device is not ready or a call is active.
(i) Confirm AudioDeviceSelector hides speaker section when `isOutputSelectionSupported` is false and supports `renderInputSelect`/`renderOutputSelect` render props.
(j) Confirm IncomingCallBanner renders `null` when `callState !== 'pending'` and uses `role="alertdialog"`.
(k) Confirm PowerDialerPanel subcomponents render the correct controls per session state.
(l) Confirm compound component patterns work — subcomponents can be composed as children of the parent.
(m) Confirm no Twilio types appear in any component prop interface or public export.
(n) Confirm `src/index.ts` exports all 5 components and all prop type interfaces.
(o) Confirm `pnpm build` succeeds.
(p) Confirm `pnpm test` passes with 181 tests (149 existing + 32 new).
(q) Confirm no files outside ALLOWED_FILES were modified.
(r) Confirm `src/hooks/`, `src/providers/`, `src/services/`, `src/types/`, `src/utils/`, `CLAUDE.md`, `docs/`, and `api-reference-docs-new/` were NOT modified.
