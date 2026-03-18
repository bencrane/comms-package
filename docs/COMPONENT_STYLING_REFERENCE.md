# OEX Comms SDK — Component Styling Reference

This is the complete reference for styling the headless components in `@oex/comms-sdk`. Every component is unstyled — no CSS, no inline styles, no layout assumptions. Components render semantic HTML with `data-*` attributes and ARIA attributes. Consuming apps style them using CSS selectors targeting these attributes, className props, or render prop overrides.

This document covers every hook return type, every component prop interface, every data attribute rendered, every state value, and every state machine transition. If it's not in this document, it doesn't exist in the SDK.

---

## Table of Contents

1. [State Machines](#1-state-machines)
2. [Error Model](#2-error-model)
3. [Hooks Reference](#3-hooks-reference)
4. [Component Reference](#4-component-reference)
5. [Complete Data Attribute Reference](#5-complete-data-attribute-reference)
6. [Icon Requirements](#6-icon-requirements)
7. [CSS Custom Property Design Spec](#7-css-custom-property-design-spec)

---

## 1. State Machines

### 1.1 Device State (`OEXDeviceState`)

Controls whether the voice calling system is ready. Must be `'registered'` before any call can be made.

```
unregistered ──→ registering ──→ registered
                      │                │
                      ▼                ▼
                  (retry)          destroyed
```

| Value | Meaning |
|---|---|
| `'unregistered'` | Device not yet initialized. No calling capability. Initial state. |
| `'registering'` | Token obtained, Device is connecting to Twilio signaling. |
| `'registered'` | Device is connected and ready to make/receive calls. This is the "ready" state. |
| `'destroyed'` | Device was torn down (provider unmounted or auth revoked). Terminal. |

### 1.2 Call State (`OEXCallState`)

The complete call lifecycle. Drives most component rendering decisions.

```
                    ┌─────────────────────────┐
                    │                         │
idle ──→ connecting ──→ ringing ──→ open ──→ closed ──→ idle
  │                                  │ ▲
  │                                  │ │
  │                           reconnecting
  │
  └──→ pending (incoming) ──→ open ──→ closed ──→ idle
         │
         └──→ idle (rejected/cancelled)
```

| Value | Meaning | When it occurs |
|---|---|---|
| `'idle'` | No call in progress. Ready for a new call. | Initial state, after call ends |
| `'connecting'` | Outbound call initiated, WebRTC connection being established. | After `connect()` called |
| `'ringing'` | Outbound call ringing the remote party. | After signaling complete |
| `'open'` | Call is active — audio flowing both directions. | After remote answers (outbound) or `acceptIncoming()` (inbound) |
| `'reconnecting'` | Call audio temporarily interrupted, auto-recovering. | Network blip during active call |
| `'pending'` | Incoming call received, not yet answered. | Twilio pushes incoming call |
| `'closed'` | Call has ended (either side hung up). | After disconnect, cancel, or remote hangup |

**Transitions back to `idle`**: After `'closed'`, the state returns to `'idle'` on the next React render cycle. The `'closed'` state is transient — it exists so components can react to "call just ended" (e.g., show disposition prompt).

### 1.3 Call Direction (`OEXCallDirection`)

| Value | Meaning |
|---|---|
| `'inbound'` | Incoming call — someone called the user |
| `'outbound'` | Outgoing call — user dialed a number |

### 1.4 Dialer Session State (`OEXDialerSessionState`)

Controls the power dialer session lifecycle.

```
idle ──→ active ──→ paused ──→ active (resume)
  ▲         │          │
  │         ▼          ▼
  └──── completed ◄────┘ (via endSession)
         │
idle ◄───┘ (via endSession from active/paused)
```

| Value | Meaning |
|---|---|
| `'idle'` | No session running. Initial state, or after `endSession()`. |
| `'active'` | Session running — auto-dialing through the lead queue. |
| `'paused'` | Session paused — current call (if any) continues, no new calls auto-dialed. |
| `'completed'` | All leads in the queue processed. Terminal until reset. |

### 1.5 Dialer Lead State (`OEXDialerLeadState`)

State of the current lead being processed by the power dialer.

```
waiting ──→ dialing ──→ on_call ──→ awaiting_disposition ──→ completed
                │                                              ▲
                └─────────────── skipped ◄─────────────────────┘ (via skip)
```

| Value | Meaning |
|---|---|
| `'waiting'` | Lead is queued but not yet dialed. |
| `'dialing'` | Call to this lead is being placed. |
| `'on_call'` | Call is active (ringing or connected). |
| `'awaiting_disposition'` | Call ended — waiting for the user to capture a disposition. |
| `'completed'` | Disposition captured. Will auto-advance to next lead. |
| `'skipped'` | Lead was skipped by the user. |

### 1.6 Message Status (`OEXMessageStatus`)

SMS/MMS delivery lifecycle (REST-based, not real-time).

```
queued ──→ sending ──→ sent ──→ delivered
                         │
                         └──→ failed
                         └──→ undelivered
```

Inbound messages arrive as `'received'`.

| Value | Meaning | Terminal? |
|---|---|---|
| `'queued'` | Message accepted by backend, queued for delivery | No |
| `'sending'` | Carrier transmission in progress | No |
| `'sent'` | Delivered to carrier | No |
| `'delivered'` | Confirmed delivered to recipient device | **Yes** |
| `'failed'` | Delivery failed (rejected or error) | **Yes** |
| `'undelivered'` | Carrier accepted but could not deliver | **Yes** |
| `'received'` | Inbound message received | **Yes** |

### 1.7 Conversations Client State (`OEXConversationsClientState`)

```
uninitialized ──→ initializing ──→ initialized
                       │
                       ▼
                     failed
```

| Value | Meaning |
|---|---|
| `'uninitialized'` | Client not yet created. |
| `'initializing'` | Token fetched, client connecting. |
| `'initialized'` | Client ready — conversations can be loaded. |
| `'failed'` | Initialization failed (bad token, network error). |

### 1.8 Conversations Connection State (`OEXConversationsConnectionState`)

WebSocket connection state for real-time messaging.

```
disconnected ──→ connecting ──→ connected
                     │               │
                     ▼               ▼
                   denied      disconnecting ──→ disconnected
```

| Value | Meaning |
|---|---|
| `'connecting'` | WebSocket connecting. |
| `'connected'` | WebSocket active — real-time messages flowing. |
| `'disconnecting'` | WebSocket closing gracefully. |
| `'disconnected'` | WebSocket not connected. |
| `'denied'` | Connection refused (auth failure). |

### 1.9 Preflight Test Status (`OEXPreflightStatus`)

```
idle ──→ connecting ──→ connected ──→ completed
              │
              ▼
            failed
```

| Value | Meaning |
|---|---|
| `'idle'` | No test running. |
| `'connecting'` | Test initiated, establishing connection. |
| `'connected'` | Test connected, gathering quality data. |
| `'completed'` | Test finished — report available. |
| `'failed'` | Test failed — error set. |

### 1.10 Call Quality Level (`OEXCallQualityLevel`)

Derived from Mean Opinion Score (MOS). Updated every ~1 second during an active call.

| Level | MOS Range | Meaning |
|---|---|---|
| `'excellent'` | >= 4.2 | Crystal clear audio |
| `'great'` | 4.0 – 4.19 | Very good quality |
| `'good'` | 3.6 – 3.99 | Acceptable quality |
| `'fair'` | 3.1 – 3.59 | Noticeable degradation |
| `'degraded'` | < 3.1 | Poor quality, hard to hear |

### 1.11 Disposition Values

These are the valid values for post-call disposition capture. Used by `useDisposition` and the power dialer.

| Value | Meaning |
|---|---|
| `'busy'` | Line busy |
| `'callback_scheduled'` | Callback scheduled |
| `'disqualified'` | Lead disqualified |
| `'do_not_call'` | Added to do-not-call list |
| `'follow_up_needed'` | Needs follow-up |
| `'gatekeeper'` | Reached gatekeeper, not decision maker |
| `'left_voicemail'` | Left a voicemail |
| `'meeting_booked'` | Meeting/appointment booked |
| `'no_answer'` | No answer |
| `'not_interested'` | Contact not interested |
| `'other'` | Other — free-text notes |
| `'qualified'` | Lead qualified |
| `'wrong_number'` | Wrong number |

---

## 2. Error Model

Every hook returns an `error` field with this shape (or `null`):

```typescript
interface OEXError {
  code: number          // Error code (Twilio codes are 20xxx, 31xxx, 53xxx; SDK codes are 0)
  message: string       // Technical error message
  recoverable: boolean  // Whether the error can resolve without user intervention
  userMessage?: string  // Human-friendly message safe to display in UI
  action?: string       // Recovery guidance ("Refresh the page", "Check microphone permissions", etc.)
}
```

**Key error codes for UI treatment:**

| Code | Situation | User message |
|---|---|---|
| `31008` | Microphone access denied | "Microphone access is required for calls. Please allow microphone access in your browser settings." |
| `31201–31206` | Media/ICE connection failures | "Call audio could not be established. Check your internet connection." |
| `31301–31303` | Signaling connection issues | "Connection to the calling service was lost. Reconnecting..." |
| `20101–20104` | Token/auth errors | "Your session could not be verified. Please sign in again." |
| `20102`, `20157` | Token expired | "Your session has expired. Reconnecting..." (auto-recovers) |
| `0` | SDK internal errors | Varies — check `message` field |

**`recoverable: true`** means the system will attempt automatic recovery (token refresh, reconnection). Show a transient notification, not a blocking error.

**`recoverable: false`** means user action is needed. Show a persistent error with the `action` text as guidance.

---

## 3. Hooks Reference

### 3.1 `useVoice()`

**Requires:** `<OEXCommsProvider>` ancestor.
**Used by:** CallBar, Dialer, IncomingCallBanner.

```typescript
interface UseVoiceReturn {
  connect: (to: string) => Promise<void>    // Initiate outbound call. `to` is E.164 phone number.
  disconnect: () => void                     // End the active call.
  sendDigits: (digits: string) => void       // Send DTMF tones during active call. `digits` is "0"-"9", "*", "#".
  mute: (shouldMute: boolean) => void        // Set mute state explicitly.
  toggleMute: () => void                     // Toggle mute on/off.
  acceptIncoming: () => void                 // Accept a pending incoming call.
  rejectIncoming: () => void                 // Reject a pending incoming call.
  callInfo: OEXCallInfo | null               // Active call details. Null when idle.
  callState: OEXCallState                    // Current call lifecycle state. See state machine §1.2.
  deviceReady: boolean                       // True when device is registered and ready to make calls.
  error: OEXError | null                     // Current error.
}
```

**`OEXCallInfo`** (non-null when callState is not `'idle'`):

```typescript
interface OEXCallInfo {
  direction: 'inbound' | 'outbound'  // Who initiated the call.
  from: string                       // Caller's phone number or identity.
  to: string                         // Called party's phone number or identity.
  isMuted: boolean                   // Whether the local microphone is muted.
  callSid: string | null             // Twilio Call SID. Available after connection; null during early connecting phase.
}
```

### 3.2 `useDevice()`

**Requires:** `<OEXCommsProvider>` ancestor.
**Used by:** CallBar (indirectly).

```typescript
interface UseDeviceReturn {
  state: OEXDeviceState      // Device registration lifecycle. See §1.1.
  deviceReady: boolean        // True when state === 'registered'.
  isBusy: boolean             // True when any call is in progress (callState !== 'idle').
  identity: string | null     // User identity from the token. Populated once registered.
  error: OEXError | null
}
```

### 3.3 `useAudioDevices()`

**Requires:** `<OEXCommsProvider>` ancestor.
**Used by:** AudioDeviceSelector.

```typescript
interface UseAudioDevicesReturn {
  inputDevices: OEXAudioDevice[]            // Available microphones. Updated on device plug/unplug.
  outputDevices: OEXAudioDevice[]           // Available speakers. Updated on device plug/unplug.
  selectedInputDeviceId: string | null      // Currently active microphone device ID.
  isOutputSelectionSupported: boolean       // True in Chrome/Edge/Opera. False in Firefox/Safari.
  setInputDevice: (deviceId: string) => Promise<void>   // Switch microphone.
  setOutputDevice: (deviceId: string) => Promise<void>  // Switch speaker (only if supported).
  testSpeaker: () => Promise<void>                       // Play test tone through current speaker.
  error: OEXError | null
}
```

**`OEXAudioDevice`**:

```typescript
interface OEXAudioDevice {
  deviceId: string   // Unique device identifier.
  label: string      // Human-readable name (e.g., "MacBook Pro Microphone").
  groupId: string    // Physical device group (shared by related input/output on same hardware).
}
```

### 3.4 `useCallQuality()`

**Requires:** `<OEXCommsProvider>` ancestor. Only produces data during an active call (`callState === 'open'`).

```typescript
interface UseCallQualityReturn {
  metrics: OEXCallQualityMetrics | null   // Null when no active call. Updated ~every 1 second.
  warnings: OEXQualityWarning[]           // Active quality warnings. Empty when no issues.
}
```

**`OEXCallQualityMetrics`** (updated every ~1 second during a call):

```typescript
interface OEXCallQualityMetrics {
  mos: number | null                       // Mean Opinion Score (1.0–4.5). Null initially.
  rtt: number                              // Round-trip time in ms. Good: <200. Bad: >400.
  jitter: number                           // Packet jitter in ms. Good: <30. Bad: >100.
  packetLoss: number                       // Packet loss fraction 0.0–1.0. Good: <0.01. Bad: >0.05.
  qualityLevel: OEXCallQualityLevel | null // Derived from MOS. See §1.10.
  audioInputLevel: number                  // Mic input level 0–32767. 0 = silence.
  audioOutputLevel: number                 // Speaker output level 0–32767. 0 = silence.
  codec: string                            // Audio codec in use (e.g., "opus", "pcmu").
  timestamp: number                        // Sample timestamp (ms since epoch).
}
```

**`OEXQualityWarning`**:

```typescript
interface OEXQualityWarning {
  name: OEXQualityWarningName   // Warning identifier.
  value?: number                // Threshold value that triggered the warning.
}
```

Warning names: `'high-rtt'`, `'high-jitter'`, `'high-packet-loss'`, `'low-mos'`, `'constant-audio-input-level'`, `'constant-audio-output-level'`.

### 3.5 `usePreflight()`

**Requires:** `<OEXCommsProvider>` ancestor. Independent of the main Device — runs a standalone connectivity test.

```typescript
interface UsePreflightReturn {
  status: OEXPreflightStatus                // Test lifecycle. See §1.9.
  report: OEXPreflightReport | null         // Available after status === 'completed'.
  error: OEXError | null                    // Set when status === 'failed'.
  run: () => Promise<void>                  // Start the test.
  stop: () => void                          // Cancel a running test.
}
```

**`OEXPreflightReport`**:

```typescript
interface OEXPreflightReport {
  qualityLevel: OEXCallQualityLevel     // Overall assessment. See §1.10.
  averageMos: number | null             // Average MOS across the test.
  averageRtt: number | null             // Average RTT in ms.
  averageJitter: number | null          // Average jitter.
  networkTiming: {                      // Connection phase timings.
    signaling?: { start: number; duration?: number; end?: number }
    ice?: { start: number; duration?: number; end?: number }
    dtls?: { start: number; duration?: number; end?: number }
    peerConnection?: { start: number; duration?: number; end?: number }
  }
  edge: string                          // Twilio edge location used (e.g., "ashburn", "dublin").
  warnings: string[]                    // Warning names raised during the test.
  callSid: string                       // Test call SID.
}
```

### 3.6 `useDisposition()`

**Requires:** `<OEXCommsProvider>` ancestor. Submit a disposition code after a call ends.

```typescript
interface UseDispositionReturn {
  setDisposition: (disposition: Disposition, notes?: string) => Promise<void>  // Submit disposition.
  lastCallSid: string | null            // SID of the most recently ended call.
  isSubmitting: boolean                  // True while the API call is in flight.
  isSubmitted: boolean                   // True after successful submission.
  error: OEXError | null
  reset: () => void                     // Clear submission state for a new cycle.
}
```

`Disposition` is a string union — see §1.11 for all valid values.

### 3.7 `useCallActions()`

**Requires:** `<OEXCommsProvider>` ancestor. Mid-call server-side actions (hold/unhold via the backend).

```typescript
interface UseCallActionsReturn {
  hold: () => Promise<void>     // Put the active call on hold.
  unhold: () => Promise<void>   // Take the call off hold.
  isOnHold: boolean             // True when the call is currently on hold.
  isLoading: boolean            // True while hold/unhold API call is in flight.
  error: OEXError | null
}
```

### 3.8 `usePowerDialer(leads, options?)`

**Requires:** `<OEXCommsProvider>` ancestor. Automatically dials through a lead queue.

```typescript
// Arguments
leads: OEXDialerLead[]        // The lead queue. Each lead: { id, phoneNumber, name?, metadata? }
options?: { advanceDelayMs?: number }  // Delay before auto-advancing to next lead (default: 1500ms).

interface UsePowerDialerReturn {
  // Session control
  start: () => void              // Start the session. Dials first lead.
  pause: () => void              // Pause. Current call continues, no new auto-dials.
  resume: () => void             // Resume from pause. Dials next lead if queue position allows.
  skip: () => void               // Skip current lead. Disconnects any active call.
  endSession: () => void         // End session entirely. Disconnects any active call.

  // Session state
  sessionState: OEXDialerSessionState    // See §1.4.
  currentLead: OEXDialerLead | null      // The lead currently being processed. Null when idle or past end of queue.
  queuePosition: number                  // 0-indexed position in the leads array.
  stats: OEXDialerSessionStats           // Aggregated session statistics.
  results: OEXDialerLeadResult[]         // Per-lead results array.
  currentLeadState: OEXDialerLeadState | null  // State of the current lead. See §1.5.

  // Voice passthrough (same as useVoice)
  callState: OEXCallState
  callInfo: OEXCallInfo | null
  deviceReady: boolean
  disconnect: () => void
  sendDigits: (digits: string) => void
  mute: (shouldMute: boolean) => void
  toggleMute: () => void

  // Disposition (for current lead's call)
  setDisposition: (disposition: Disposition, notes?: string) => Promise<void>
  isDispositionSubmitting: boolean
  isDispositionSubmitted: boolean
  lastCallSid: string | null

  error: OEXError | null
}
```

**`OEXDialerLead`**:

```typescript
interface OEXDialerLead {
  id: string                            // Unique lead identifier.
  phoneNumber: string                   // Phone number to dial (E.164).
  name?: string                         // Display name.
  metadata?: Record<string, unknown>    // App-specific data, passed through untouched.
}
```

**`OEXDialerSessionStats`**:

```typescript
interface OEXDialerSessionStats {
  totalLeads: number              // Total leads in the queue.
  callsCompleted: number          // Leads with disposition captured.
  callsSkipped: number            // Leads skipped.
  callsRemaining: number          // Leads not yet dialed or skipped.
  outcomes: Partial<Record<Disposition, number>>  // Disposition breakdown.
  sessionStartedAt: number | null // Session start timestamp (ms since epoch).
  sessionDurationMs: number       // Elapsed session time.
}
```

### 3.9 `useMessaging()`

**Requires:** `<OEXCommsProvider>` ancestor. REST-based SMS send and fetch.

```typescript
interface UseMessagingReturn {
  sendMessage: (to: string, body: string, options?: OEXSendMessageOptions) => Promise<OEXMessage | null>
  messages: OEXMessage[]           // Messages from last fetchMessages call.
  fetchMessages: (params?: OEXMessageListParams) => Promise<void>
  refreshMessages: () => Promise<void>   // Re-fetch with last used params.
  isLoading: boolean
  isSending: boolean
  error: OEXError | null
}
```

**`OEXMessage`**:

```typescript
interface OEXMessage {
  id: string                           // Internal UUID.
  messageSid: string                   // Twilio Message SID.
  direction: 'inbound' | 'outbound'
  from: string                         // Sender phone number (E.164).
  to: string                           // Recipient phone number (E.164).
  body: string | null                  // Message body text.
  status: OEXMessageStatus             // Delivery status. See §1.6.
  errorCode: number | null             // Twilio error code if failed.
  errorMessage: string | null          // Twilio error message if failed.
  segments: number | null              // Number of SMS segments.
  mediaCount: number | null            // Number of media attachments.
  mediaUrls: string[] | null           // Media attachment URLs (MMS).
  sentAt: string | null                // ISO timestamp when sent.
  createdAt: string                    // ISO timestamp when created.
  updatedAt: string                    // ISO timestamp when last updated.
}
```

### 3.10 `useMessageStatus(messageSid, options?)`

**Requires:** `<OEXCommsProvider>` ancestor. Poll a single message's delivery status.

```typescript
interface UseMessageStatusReturn {
  message: OEXMessage | null        // Full message details.
  status: OEXMessageStatus | null   // Current delivery status.
  isTerminal: boolean               // True if status is delivered/failed/undelivered/received.
  isPolling: boolean                // True while polling is active.
  error: OEXError | null
  refresh: () => Promise<void>      // One-off status fetch.
  startPolling: () => void          // Begin polling at intervalMs (default: 3000).
  stopPolling: () => void           // Stop polling.
}
```

### 3.11 `useConversation(phoneNumber)`

**Requires:** `<OEXCommsProvider>` ancestor. REST-based SMS thread with a specific phone number.

```typescript
interface UseConversationReturn {
  messages: OEXMessage[]      // Messages in this thread, sorted oldest-first.
  send: (body: string, options?) => Promise<OEXMessage | null>  // Send a message to this number.
  refresh: () => Promise<void>
  isLoading: boolean
  isSending: boolean
  error: OEXError | null
  phoneNumber: string         // The phone number this conversation is with.
}
```

### 3.12 `useRealtimeConversation(conversationSid)`

**Requires:** `<OEXConversationsProvider>` ancestor. Real-time message stream for a single conversation.
**Used by:** ConversationThread.

```typescript
interface UseRealtimeConversationReturn {
  messages: OEXRealtimeMessage[]                // All loaded messages, oldest-first. Real-time additions append to end.
  participants: OEXRealtimeParticipant[]        // Current conversation participants.
  sendMessage: (body: string) => Promise<void>  // Send a text message.
  sendMedia: (file: File | Blob, contentType: string, filename?: string) => Promise<void>
  sendTyping: () => void                        // Signal that the current user is typing.
  participantsTyping: OEXRealtimeParticipant[]  // Participants currently typing (excludes self).
  setAllMessagesRead: () => Promise<void>       // Mark all messages as read.
  lastReadMessageIndex: number | null           // Current user's last read message index.
  unreadCount: number | null                    // Number of unread messages. Null if read horizon not set.
  conversation: OEXRealtimeConversation | null  // Conversation metadata.
  isLoading: boolean                            // True while initial messages are loading.
  loadMoreMessages: () => Promise<void>         // Load older messages. Prepends to messages array.
  hasMoreMessages: boolean                      // True if there are older messages to load.
  error: OEXError | null
}
```

**`OEXRealtimeMessage`**:

```typescript
interface OEXRealtimeMessage {
  sid: string                           // Message SID.
  index: number                         // Sequential index (0, 1, 2, ...). Used for read receipts.
  body: string | null                   // Text body. Null for media-only messages.
  author: string | null                 // Identity of the sender. Compare with current user identity for direction.
  createdAt: Date | null                // When the message was created.
  updatedAt: Date | null                // When the message was last updated.
  attributes: Record<string, unknown>   // Custom attributes.
  mediaSids: string[]                   // Attached media SIDs (empty for text messages).
  participantSid: string | null         // Author's participant SID.
  type: 'text' | 'media'               // Message type.
}
```

**`OEXRealtimeParticipant`**:

```typescript
interface OEXRealtimeParticipant {
  sid: string                              // Participant SID.
  identity: string | null                  // User identity string.
  type: 'chat' | 'sms' | 'whatsapp' | 'other'   // Channel type.
  lastReadMessageIndex: number | null      // Last read message index (for read receipts).
  lastReadTimestamp: Date | null
  attributes: Record<string, unknown>
}
```

**`OEXRealtimeConversation`** (metadata):

```typescript
interface OEXRealtimeConversation {
  sid: string
  uniqueName: string | null
  friendlyName: string | null
  attributes: Record<string, unknown>
  createdAt: Date | null
  updatedAt: Date | null
  lastMessageText: string | null          // Preview text of the most recent message.
  lastMessageAt: Date | null              // Timestamp of the most recent message.
  unreadCount: number | null              // Number of unread messages.
  lastReadMessageIndex: number | null
}
```

### 3.13 `useConversationList()`

**Requires:** `<OEXConversationsProvider>` ancestor.
**Used by:** ConversationList.

```typescript
interface UseConversationListReturn {
  conversations: OEXRealtimeConversation[]   // All conversations. Updated in real-time.
  isLoading: boolean
  refresh: () => Promise<void>
  error: OEXError | null
}
```

---

## 4. Component Reference

All components are headless — they render semantic HTML with zero CSS. Every component:
- Uses `forwardRef` (ref forwarded to root element)
- Accepts `className` on the root element
- Uses `data-*` attributes for state-driven styling
- Uses ARIA attributes for accessibility
- Accepts `children` or render props for full override

### 4.1 CallBar

**Hooks consumed internally:** `useVoice()`, `useDevice()`, `useCallActions()`
**Provider required:** `<OEXCommsProvider>`

#### Props

```typescript
interface CallBarProps {
  onDisposition?: (callSid: string) => void   // Fires when disposition should be captured.
  className?: string
  children?: React.ReactNode                   // Overrides default subcomponent arrangement.
}
```

#### Root element

| Element | `<div>` |
|---|---|
| `role` | `"region"` |
| `aria-label` | `"Call controls"` |
| `data-state` | `OEXCallState` — one of: `idle`, `connecting`, `ringing`, `open`, `reconnecting`, `pending`, `closed` |
| `data-muted` | `"true"` or `"false"` |
| `data-hold` | `"true"` or `"false"` |
| `ref` | Forwarded |
| `className` | From prop |

#### Default children (rendered when no `children` prop)

Renders in order: `<CallBar.Status>`, `<CallBar.CallerInfo>`, `<CallBar.Timer>`, `<CallBar.Controls>`.

#### Subcomponents

##### CallBar.Status

Displays the call state as a human-readable label.

| Element | `<div>` |
|---|---|
| `data-state` | Same as root — `OEXCallState` |
| `aria-live` | `"polite"` |
| `className` | `CallBarStatusProps.className` |

Default text content per state:

| `data-state` | Default text |
|---|---|
| `idle` | "Ready" |
| `connecting` | "Connecting..." |
| `ringing` | "Ringing" |
| `open` | "Connected" |
| `reconnecting` | "Reconnecting..." |
| `pending` | "Incoming call" |
| `closed` | "Call ended" |

Accepts `children` to override text.

##### CallBar.Timer

Ticking call duration timer. Starts counting when `callState === 'open'`, resets to 0 otherwise. Uses `setInterval` with 1-second ticks. Computes elapsed time as `Date.now() - startTime`.

| Element | `<div>` |
|---|---|
| `role` | `"timer"` |
| `aria-label` | `"Call duration"` |
| `className` | `CallBarTimerProps.className` |

Default format: `MM:SS` (e.g., `"03:45"`). When >= 1 hour: `H:MM:SS` (e.g., `"1:03:45"`).

Accepts render prop `children?: (elapsedSeconds: number) => ReactNode` for custom formatting.

##### CallBar.Controls

Action buttons for the active call.

| Element | `<div>` container |
|---|---|
| `className` | `CallBarControlsProps.className` |

Contains four `<button>` elements:

**Mute button:**

| Attribute | Value |
|---|---|
| Text | `"Mute"` or `"Unmute"` |
| `aria-pressed` | `true` when muted, `false` when unmuted |
| `aria-label` | `"Mute"` or `"Unmute"` |
| `data-active` | `"true"` when muted |
| `data-disabled` | `"true"` when no active call (`callState` not `open`/`reconnecting`) |
| `aria-disabled` | Same as `data-disabled` |

**Hold button:**

| Attribute | Value |
|---|---|
| Text | `"Hold"` or `"Resume"` |
| `aria-pressed` | `true` when on hold |
| `aria-label` | `"Hold"` or `"Resume"` |
| `data-active` | `"true"` when on hold |
| `data-disabled` | `"true"` when no active call |
| `aria-disabled` | Same as `data-disabled` |

**Hangup button:**

| Attribute | Value |
|---|---|
| Text | `"Hang up"` |
| `aria-label` | `"Hang up"` |
| `data-disabled` | `"true"` when no active call |
| `aria-disabled` | Same as `data-disabled` |

**Disposition button:**

| Attribute | Value |
|---|---|
| Text | `"Disposition"` |
| `aria-label` | `"Disposition"` |
| `data-disabled` | `"true"` when `callState !== 'closed'` or no `callSid` |
| `aria-disabled` | Same as `data-disabled` |

Accepts `children` to replace all buttons. Also accepts `onDisposition` prop (falls back to parent's `onDisposition`).

##### CallBar.CallerInfo

Displays from/to phone numbers.

| Element | `<div>` |
|---|---|
| `className` | `CallBarCallerInfoProps.className` |

Default children:

```html
<span data-field="from">{callInfo.from}</span>
<span data-field="to">{callInfo.to}</span>
```

Accepts render prop `children?: (info: { from, to, direction } | null) => ReactNode`.

#### Compound component usage

```tsx
{/* Default — all subcomponents rendered automatically */}
<CallBar onDisposition={handleDisposition} />

{/* Custom composition */}
<CallBar>
  <CallBar.CallerInfo className="caller" />
  <CallBar.Timer className="timer" />
  <CallBar.Status className="status" />
  <CallBar.Controls className="controls" />
</CallBar>

{/* Custom timer formatting */}
<CallBar>
  <CallBar.Timer>{(seconds) => <span>{seconds}s</span>}</CallBar.Timer>
</CallBar>
```

---

### 4.2 Dialer

**Hooks consumed internally:** `useVoice()`
**Provider required:** `<OEXCommsProvider>`

#### Props

```typescript
interface DialerProps {
  defaultValue?: string            // Initial phone number (uncontrolled mode).
  value?: string                   // Controlled phone number (E.164 raw, e.g., "+15551234567").
  onChange?: (value: string) => void   // Called with raw E.164 value on input change.
  onCall?: (number: string) => void    // Called when a call is initiated.
  showDtmfKeypad?: boolean             // Show DTMF keypad during active calls. Default: true.
  className?: string
  inputClassName?: string              // className for the phone input.
  callButtonClassName?: string         // className for the call/hangup button.
  keypadClassName?: string             // className for the DTMF keypad container.
  children?: ReactNode | RenderProp    // See render prop signature below.
}
```

**Render prop signature** (when `children` is a function):

```typescript
(state: {
  rawValue: string           // E.164 value (e.g., "+15551234567").
  displayValue: string       // Formatted value (e.g., "+1 (555) 123-4567").
  callState: OEXCallState
  deviceReady: boolean
  setNumber: (raw: string) => void
  dial: () => void
  hangUp: () => void
  sendDigit: (digit: string) => void
}) => ReactNode
```

#### Root element

| Element | `<div>` |
|---|---|
| `data-state` | `OEXCallState` |
| `data-disabled` | `"true"` when `!deviceReady` |
| `ref` | Forwarded |
| `className` | From prop |

#### Default children (no `children` prop)

**Phone input:**

| Element | `<input>` |
|---|---|
| `type` | `"tel"` |
| `value` | Formatted display value (e.g., `"+1 (555) 123-4567"`) |
| `aria-label` | `"Phone number"` |
| `className` | `inputClassName` |

**Call button** (when `callState === 'idle'`):

| Element | `<button>` |
|---|---|
| Text | `"Call"` |
| `aria-label` | `"Start call"` |
| `disabled` | `true` when `!deviceReady || !rawValue` |
| `data-disabled` | Same as `disabled` |
| `className` | `callButtonClassName` |

**Hangup button** (when `callState !== 'idle'`):

| Element | `<button>` |
|---|---|
| Text | `"Hang up"` |
| `aria-label` | `"Hang up"` |
| `data-state` | `"active"` |
| `className` | `callButtonClassName` |

**DTMF keypad** (when `callState === 'open'` and `showDtmfKeypad !== false`):

| Element | `<div>` container |
|---|---|
| `role` | `"group"` |
| `aria-label` | `"Dialpad"` |
| `className` | `keypadClassName` |

Contains 12 `<button>` elements in order: `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `*`, `0`, `#`.

Each button: `aria-label="Digit {d}"`, text content = the digit.

#### Phone number formatting

The Dialer formats as the user types:

| Raw input (digits) | Display value |
|---|---|
| (empty) | (empty) |
| `5` | `+1 (5` |
| `55` | `+1 (55` |
| `555` | `+1 (555` |
| `5551` | `+1 (555) 1` |
| `555123` | `+1 (555) 123` |
| `5551234` | `+1 (555) 123-4` |
| `5551234567` | `+1 (555) 123-4567` |
| `15551234567` | `+1 (555) 123-4567` |
| `442071234567` | `+442071234567` (international — no formatting) |

The `connect()` call always receives the raw E.164 value (e.g., `+15551234567`), never the formatted string.

---

### 4.3 AudioDeviceSelector

**Hooks consumed internally:** `useAudioDevices()`
**Provider required:** `<OEXCommsProvider>`

#### Props

```typescript
interface AudioDeviceSelectorProps {
  className?: string
  inputSelectClassName?: string          // className for the microphone <select>.
  outputSelectClassName?: string         // className for the speaker <select>.
  testButtonClassName?: string           // className for the test speaker button.
  renderInputSelect?: (props: {          // Render prop to replace the default <select>.
    devices: OEXAudioDevice[]
    selectedDeviceId: string | null
    onChange: (deviceId: string) => void
  }) => ReactNode
  renderOutputSelect?: (props: {         // Render prop to replace the default <select>.
    devices: OEXAudioDevice[]
    onChange: (deviceId: string) => void
  }) => ReactNode
  inputLabel?: string                    // Label text for mic selector. Default: "Microphone".
  outputLabel?: string                   // Label text for speaker selector. Default: "Speaker".
  children?: ReactNode
}
```

#### Root element

| Element | `<div>` |
|---|---|
| `role` | `"group"` |
| `aria-label` | `"Audio device settings"` |
| `data-output-supported` | `"true"` or `"false"` |
| `ref` | Forwarded |
| `className` | From prop |

#### Default children (no `children` or render props)

**Microphone section** (always rendered):

```html
<div>
  <label for="{auto-id}">Microphone</label>
  <select id="{auto-id}" class="{inputSelectClassName}" aria-label="Microphone">
    <option value="{deviceId}">{label}</option>
    ...
  </select>
</div>
```

**Speaker section** (only when `isOutputSelectionSupported === true`):

```html
<div>
  <label for="{auto-id}">Speaker</label>
  <select id="{auto-id}" class="{outputSelectClassName}" aria-label="Speaker">
    <option value="{deviceId}">{label}</option>
    ...
  </select>
</div>
<button class="{testButtonClassName}" aria-label="Test speaker">Test speaker</button>
```

**Error display** (when `error` is set):

```html
<div role="alert" data-error="true">{error.message}</div>
```

---

### 4.4 IncomingCallBanner

**Hooks consumed internally:** `useVoice()`
**Provider required:** `<OEXCommsProvider>`

**Renders `null` when `callState !== 'pending'`.** This component auto-shows when an incoming call arrives and auto-hides when the call is accepted, rejected, or cancelled.

#### Props

```typescript
interface IncomingCallBannerProps {
  className?: string
  acceptButtonClassName?: string
  rejectButtonClassName?: string
  onAccept?: () => void              // Callback after accept.
  onReject?: () => void              // Callback after reject.
  children?: (info: { from: string; to: string }) => ReactNode   // Custom caller info content.
}
```

#### Root element (only when `callState === 'pending'`)

| Element | `<div>` |
|---|---|
| `role` | `"alertdialog"` |
| `aria-label` | `"Incoming call"` |
| `aria-live` | `"assertive"` |
| `data-state` | `"pending"` (always, since it only renders in this state) |
| `ref` | Forwarded |
| `className` | From prop |

#### Default children

```html
<div aria-label="Caller">{callInfo.from ?? "Unknown"}</div>
<button aria-label="Accept call" class="{acceptButtonClassName}">Accept</button>
<button aria-label="Reject call" class="{rejectButtonClassName}">Reject</button>
```

When `children` render prop is provided: the caller info div is replaced by `children({ from, to })`. The accept/reject buttons still render.

---

### 4.5 PowerDialerPanel

**Hooks consumed internally:** `usePowerDialer(leads, options)`
**Provider required:** `<OEXCommsProvider>`

#### Props

```typescript
interface PowerDialerPanelProps {
  leads: OEXDialerLead[]                        // Lead queue.
  options?: OEXDialerOptions                     // { advanceDelayMs?: number }
  onDisposition?: (callSid: string) => void      // Fires when disposition should be captured.
  className?: string
  children?: React.ReactNode
}
```

#### Root element

| Element | `<div>` |
|---|---|
| `role` | `"region"` |
| `aria-label` | `"Power dialer"` |
| `data-state` | `OEXDialerSessionState` — one of: `idle`, `active`, `paused`, `completed` |
| `data-lead-state` | `OEXDialerLeadState` or `"none"` when no current lead |
| `ref` | Forwarded |
| `className` | From prop |

#### Default children

Renders: `<PowerDialerPanel.LeadInfo>`, `<PowerDialerPanel.QueueProgress>`, `<PowerDialerPanel.Controls>`, `<PowerDialerPanel.Stats>`.

#### Subcomponents

##### PowerDialerPanel.LeadInfo

| Element | `<div>` |
|---|---|
| `data-state` | `currentLeadState` or `"none"` |
| `className` | From prop |

Default children when lead exists:
```html
<span data-field="name">{lead.name}</span>
<span data-field="phoneNumber">{lead.phoneNumber}</span>
```

When no lead: `<span>No lead</span>`.

Accepts render prop `children?: (lead: OEXDialerLead | null) => ReactNode`.

##### PowerDialerPanel.QueueProgress

| Element | `<div>` |
|---|---|
| `role` | `"status"` |
| `aria-label` | `"Queue progress"` |
| `className` | From prop |

Default text: `"{position} of {total}"` where position is 1-indexed (0 when idle).

Accepts render prop `children?: (position: number, total: number) => ReactNode`.

##### PowerDialerPanel.Controls

| Element | `<div>` |
|---|---|
| `className` | From prop |

Buttons rendered vary by session state:

| `sessionState` | Buttons |
|---|---|
| `idle` | **Start** (`data-action="start"`, `aria-label="Start"`) |
| `active` | **Pause** (`data-action="pause"`), **Skip** (`data-action="skip"`), **End** (`data-action="end"`) |
| `paused` | **Resume** (`data-action="resume"`), **End** (`data-action="end"`) |
| `completed` | `<span>Session complete</span>` (no buttons) |

**Disposition button** (additional, when `currentLeadState === 'awaiting_disposition'` and `lastCallSid` exists):

| Attribute | Value |
|---|---|
| Text | `"Disposition"` |
| `data-action` | `"disposition"` |
| `data-state` | `"submitted"` when `isDispositionSubmitted`, otherwise absent |
| `aria-label` | `"Disposition"` |

Accepts `onDisposition` prop and `children` for full override.

##### PowerDialerPanel.Stats

| Element | `<div>` |
|---|---|
| `role` | `"status"` |
| `aria-label` | `"Session statistics"` |
| `className` | From prop |

Default children:
```html
<span data-stat="callsCompleted">{stats.callsCompleted}</span>
<span data-stat="callsSkipped">{stats.callsSkipped}</span>
<span data-stat="callsRemaining">{stats.callsRemaining}</span>
```

Accepts render prop `children?: (stats: OEXDialerSessionStats) => ReactNode`.

---

### 4.6 ConversationThread

**Hooks consumed internally:** `useRealtimeConversation(conversationSid)`
**Provider required:** `<OEXConversationsProvider>`

#### Props

```typescript
interface ConversationThreadProps {
  conversationSid: string          // The conversation to display.
  identity?: string                // Current user's identity. Used for message direction detection.
  onSendMessage?: (body: string) => void
  className?: string
  children?: React.ReactNode
}
```

#### Root element

| Element | `<div>` |
|---|---|
| `role` | `"region"` |
| `aria-label` | `"Conversation"` |
| `data-state` | `"loading"`, `"error"`, or `"ready"` |
| `data-typing` | `"true"` when someone is typing, `"false"` otherwise |
| `data-unread` | `"true"` when there are unread messages, `"false"` otherwise |
| `ref` | Forwarded |
| `className` | From prop |

**Error alert** (rendered when `error` is set and not loading):
```html
<div role="alert">{error.message}</div>
```

#### Default children

Renders: `<ConversationThread.MessageList>`, `<ConversationThread.TypingIndicator>`, `<ConversationThread.ComposeInput>`.

#### Subcomponents

##### ConversationThread.MessageList

| Element | `<div>` |
|---|---|
| `role` | `"log"` |
| `aria-label` | `"Messages"` |
| `aria-live` | `"polite"` |
| `className` | From prop |

**Load more button** (at the top, when `hasMoreMessages === true`):

| Element | `<button>` |
|---|---|
| Text | `"Load more"` |
| `data-action` | `"load-more"` |
| `aria-label` | `"Load older messages"` |

Messages rendered oldest-first. The component computes:
- `isOwn = identity != null && message.author === identity`
- `isRead = message.index <= lastReadByOthers` (where `lastReadByOthers` is the max `lastReadMessageIndex` across non-self participants)

Accepts `renderMessage?: (message: OEXRealtimeMessage, isOwn: boolean) => ReactNode` to override individual message rendering.

##### ConversationThread.Message

| Element | `<div>` |
|---|---|
| `role` | `"listitem"` |
| `data-direction` | `"outbound"` (own) or `"inbound"` (other) |
| `data-type` | `"text"` or `"media"` |
| `data-message-sid` | The message's SID |
| `data-read` | `"true"` when read by at least one other participant, `"false"` otherwise |
| `className` | From prop |

Props:
```typescript
interface ConversationThreadMessageProps {
  message: OEXRealtimeMessage
  isOwn?: boolean
  isRead?: boolean
  className?: string
  children?: React.ReactNode
}
```

Default children:
```html
<span data-part="author">{message.author}</span>
<span data-part="body">{message.body ?? (type === 'media' ? 'Media attachment' : '')}</span>
<time data-part="timestamp" dateTime="{ISO string}">{ISO string}</time>
```

##### ConversationThread.ComposeInput

| Element | `<form>` |
|---|---|
| `className` | From prop |

Contains:

```html
<input type="text" data-part="compose-input" aria-label="Type a message" class="{inputClassName}" />
<button type="submit" data-part="send-button" aria-label="Send message" class="{sendButtonClassName}" disabled="{empty}">Send</button>
```

Props:
```typescript
interface ConversationThreadComposeInputProps {
  className?: string
  inputClassName?: string
  sendButtonClassName?: string
  placeholder?: string
  children?: React.ReactNode
}
```

The send button is `disabled` when the draft text is empty (after trimming). On submit, calls `sendMessage(draft)` and clears the input. On every keystroke, calls `sendTyping()`.

##### ConversationThread.TypingIndicator

**Renders `null` when nobody is typing.**

| Element | `<div>` |
|---|---|
| `role` | `"status"` |
| `aria-live` | `"polite"` |
| `data-typing` | `"true"` (always, since it only renders when typing) |
| `className` | From prop |

Default text:
- 1 participant: `"{identity} is typing..."`
- 2 participants: `"{id1} and {id2} are typing..."`
- 3+ participants: `"{count} people are typing..."`

Accepts render prop `children?: (participants: OEXRealtimeParticipant[]) => ReactNode`.

#### Compound component usage

```tsx
{/* Default */}
<ConversationThread conversationSid="CH..." identity="agent@example.com" />

{/* Custom composition */}
<ConversationThread conversationSid="CH..." identity="agent@example.com">
  <ConversationThread.MessageList className="messages" />
  <ConversationThread.TypingIndicator className="typing" />
  <ConversationThread.ComposeInput className="compose" placeholder="Message..." />
</ConversationThread>
```

---

### 4.7 ConversationList

**Hooks consumed internally:** `useConversationList()`
**Provider required:** `<OEXConversationsProvider>`

#### Props

```typescript
interface ConversationListProps {
  onSelect?: (conversationSid: string) => void   // Fires when a conversation is clicked.
  selectedSid?: string                            // Currently selected conversation SID.
  className?: string
  children?: React.ReactNode
}
```

#### Root element

| Element | `<div>` |
|---|---|
| `role` | `"listbox"` |
| `aria-label` | `"Conversations"` |
| `data-state` | `"loading"`, `"error"`, or `"ready"` |
| `ref` | Forwarded |
| `className` | From prop |

**Error alert** (when `error` is set):
```html
<div role="alert">{error.message}</div>
```

**Loading state** (when `isLoading` and no conversations):
```html
<div data-state="loading" aria-busy="true">Loading...</div>
```

#### Default children

Conversations sorted by `lastMessageAt` descending (most recent first). Conversations with no `lastMessageAt` sort to the end.

Each conversation rendered as `<ConversationList.Item>`.

##### ConversationList.Item

| Element | `<div>` |
|---|---|
| `role` | `"option"` |
| `aria-selected` | `true` when this item's SID matches `selectedSid` |
| `data-active` | `"true"` when selected |
| `data-unread` | `"true"` when `unreadCount > 0` |
| `data-conversation-sid` | The conversation's SID |
| `tabIndex` | `0` |
| `className` | From prop |

Keyboard support: Enter and Space trigger `onSelect`.

Props:
```typescript
interface ConversationListItemProps {
  conversation: OEXRealtimeConversation
  className?: string
  children?: (conversation: OEXRealtimeConversation) => React.ReactNode
}
```

Default children:
```html
<span data-part="name">{friendlyName ?? uniqueName ?? sid}</span>
<span data-part="preview">{lastMessageText}</span>
<time data-part="timestamp" dateTime="{ISO string}">{ISO string}</time>
<span data-part="unread-badge" aria-label="{count} unread messages">{count}</span>
```

The unread badge only renders when `unreadCount > 0`.

---

## 5. Complete Data Attribute Reference

This is the master list of every `data-*` attribute rendered by every component, with every possible value.

### Global attributes (on root elements)

| Attribute | Components | Values |
|---|---|---|
| `data-state` | CallBar, Dialer, PowerDialerPanel, ConversationThread, ConversationList, CallBar.Status, PowerDialerPanel.LeadInfo | Varies per component — see below |
| `data-muted` | CallBar | `"true"`, `"false"` |
| `data-hold` | CallBar | `"true"`, `"false"` |
| `data-disabled` | Dialer, Dialer buttons, CallBar buttons | `"true"`, `"false"` |
| `data-output-supported` | AudioDeviceSelector | `"true"`, `"false"` |
| `data-typing` | ConversationThread, ConversationThread.TypingIndicator | `"true"`, `"false"` |
| `data-unread` | ConversationThread, ConversationList.Item | `"true"`, `"false"` |
| `data-lead-state` | PowerDialerPanel | `"waiting"`, `"dialing"`, `"on_call"`, `"awaiting_disposition"`, `"completed"`, `"skipped"`, `"none"` |

### `data-state` values by component

| Component | Possible values |
|---|---|
| CallBar root | `"idle"`, `"connecting"`, `"ringing"`, `"open"`, `"reconnecting"`, `"pending"`, `"closed"` |
| CallBar.Status | Same as CallBar root |
| Dialer root | `"idle"`, `"connecting"`, `"ringing"`, `"open"`, `"reconnecting"`, `"pending"`, `"closed"` |
| Dialer hangup button | `"active"` (always when rendered) |
| PowerDialerPanel root | `"idle"`, `"active"`, `"paused"`, `"completed"` |
| PowerDialerPanel.LeadInfo | `"waiting"`, `"dialing"`, `"on_call"`, `"awaiting_disposition"`, `"completed"`, `"skipped"`, `"none"` |
| PowerDialerPanel.Controls disposition button | `"submitted"` or absent |
| ConversationThread root | `"loading"`, `"error"`, `"ready"` |
| ConversationList root | `"loading"`, `"error"`, `"ready"` |
| IncomingCallBanner root | `"pending"` (always, since it only renders in this state) |

### Element-level attributes

| Attribute | Element | Values |
|---|---|---|
| `data-field` | CallBar.CallerInfo `<span>` | `"from"`, `"to"` |
| `data-field` | PowerDialerPanel.LeadInfo `<span>` | `"name"`, `"phoneNumber"` |
| `data-active` | CallBar.Controls mute/hold buttons, ConversationList.Item | `"true"`, `"false"` |
| `data-action` | PowerDialerPanel.Controls buttons, ConversationThread.MessageList load-more button | `"start"`, `"pause"`, `"resume"`, `"skip"`, `"end"`, `"disposition"`, `"load-more"` |
| `data-stat` | PowerDialerPanel.Stats `<span>` | `"callsCompleted"`, `"callsSkipped"`, `"callsRemaining"` |
| `data-error` | AudioDeviceSelector error div | `"true"` |
| `data-direction` | ConversationThread.Message | `"outbound"`, `"inbound"` |
| `data-type` | ConversationThread.Message | `"text"`, `"media"` |
| `data-message-sid` | ConversationThread.Message | Message SID string |
| `data-read` | ConversationThread.Message | `"true"`, `"false"` |
| `data-conversation-sid` | ConversationList.Item | Conversation SID string |
| `data-part` | Various sub-elements | `"author"`, `"body"`, `"timestamp"`, `"compose-input"`, `"send-button"`, `"name"`, `"preview"`, `"unread-badge"` |

### CSS selector examples

```css
/* Style the CallBar differently per call state */
[data-state="idle"] { /* ready state */ }
[data-state="connecting"] { /* show spinner */ }
[data-state="open"] { /* active call style */ }
[data-state="pending"] { /* incoming call alert */ }

/* Muted indicator */
[data-muted="true"] { /* muted visual */ }

/* Hold indicator */
[data-hold="true"] { /* on-hold visual */ }

/* Disabled buttons */
button[data-disabled="true"] { opacity: 0.5; pointer-events: none; }

/* Active toggle buttons */
button[data-active="true"] { /* pressed state */ }

/* Message direction */
[data-direction="outbound"] { /* right-aligned, blue bubble */ }
[data-direction="inbound"] { /* left-aligned, gray bubble */ }

/* Read receipts */
[data-direction="outbound"][data-read="true"] { /* show checkmark */ }

/* Media messages */
[data-type="media"] { /* media attachment style */ }

/* Unread conversations */
[data-unread="true"] { /* bold text, badge visible */ }

/* Active/selected conversation */
[data-active="true"] { /* highlighted background */ }

/* Power dialer states */
[data-state="active"] [data-lead-state="on_call"] { /* call in progress */ }
[data-state="active"] [data-lead-state="awaiting_disposition"] { /* disposition prompt */ }
[data-state="completed"] { /* session done */ }

/* Typing indicator */
[data-typing="true"] { /* show typing animation */ }

/* Hide speaker controls in unsupported browsers */
[data-output-supported="false"] .speaker-section { display: none; }

/* Stat values */
[data-stat="callsCompleted"] { /* green */ }
[data-stat="callsSkipped"] { /* yellow */ }
[data-stat="callsRemaining"] { /* neutral */ }

/* Disposition submitted */
[data-action="disposition"][data-state="submitted"] { /* success indicator */ }
```

---

## 6. Icon Requirements

Components render text labels by default. The styling layer should replace text labels with icons. Here is every button/label and its recommended icon:

### CallBar.Controls

| Button | Default text | Icon needed |
|---|---|---|
| Mute (inactive) | "Mute" | Microphone (mic) |
| Mute (active — muted) | "Unmute" | Microphone-off (mic-off) |
| Hold (inactive) | "Hold" | Pause-circle |
| Hold (active — on hold) | "Resume" | Play-circle |
| Hang up | "Hang up" | Phone-off / X |
| Disposition | "Disposition" | Clipboard / Notepad |

### Dialer

| Button | Default text | Icon needed |
|---|---|---|
| Call (idle) | "Call" | Phone |
| Hang up (active) | "Hang up" | Phone-off / X |
| DTMF digit buttons | "1"–"9", "*", "0", "#" | None (digit text is the icon) |

### AudioDeviceSelector

| Button | Default text | Icon needed |
|---|---|---|
| Test speaker | "Test speaker" | Volume-2 / Speaker |

### IncomingCallBanner

| Button | Default text | Icon needed |
|---|---|---|
| Accept | "Accept" | Phone (green) |
| Reject | "Reject" | Phone-off (red) / X |

### PowerDialerPanel.Controls

| Button | Default text | Icon needed |
|---|---|---|
| Start | "Start" | Play |
| Pause | "Pause" | Pause |
| Resume | "Resume" | Play |
| Skip | "Skip" | Skip-forward / Fast-forward |
| End | "End" | Square (stop) |
| Disposition | "Disposition" | Clipboard / Notepad |

### ConversationThread.ComposeInput

| Button | Default text | Icon needed |
|---|---|---|
| Send | "Send" | Send / Arrow-up / Paper-plane |

### ConversationThread.MessageList

| Button | Default text | Icon needed |
|---|---|---|
| Load more | "Load more" | Chevron-up / Arrow-up |

### Read receipts (ConversationThread.Message)

Not a button — style via `data-read`:

| State | Indicator |
|---|---|
| `data-read="false"` | Single check / no icon |
| `data-read="true"` | Double check / blue check |

### Typing indicator (ConversationThread.TypingIndicator)

Not a button — animated dots or pulse animation when `data-typing="true"` is present.

### Unread badge (ConversationList.Item)

Not a button — the `<span data-part="unread-badge">` contains the numeric count. Style as a badge (circle/pill with count).

---

## 7. CSS Custom Property Design Spec

The following custom properties form the design token contract for the OEX comms SDK components. The consuming app defines these on a parent element (`:root` or a wrapper). The styling layer references them.

### Color tokens

```css
:root {
  /* Primary palette */
  --oex-color-primary: #2563eb;            /* Brand blue — call buttons, active states */
  --oex-color-primary-hover: #1d4ed8;
  --oex-color-primary-active: #1e40af;

  /* Semantic colors */
  --oex-color-success: #16a34a;            /* Connected, delivered, accept */
  --oex-color-success-hover: #15803d;
  --oex-color-danger: #dc2626;             /* Hangup, reject, errors, failed */
  --oex-color-danger-hover: #b91c1c;
  --oex-color-warning: #d97706;            /* Reconnecting, degraded quality, awaiting disposition */
  --oex-color-warning-hover: #b45309;
  --oex-color-info: #0891b2;               /* Ringing, connecting */

  /* Neutral palette */
  --oex-color-neutral-50: #f8fafc;
  --oex-color-neutral-100: #f1f5f9;
  --oex-color-neutral-200: #e2e8f0;
  --oex-color-neutral-300: #cbd5e1;
  --oex-color-neutral-400: #94a3b8;
  --oex-color-neutral-500: #64748b;
  --oex-color-neutral-600: #475569;
  --oex-color-neutral-700: #334155;
  --oex-color-neutral-800: #1e293b;
  --oex-color-neutral-900: #0f172a;

  /* Text */
  --oex-color-text-primary: var(--oex-color-neutral-900);
  --oex-color-text-secondary: var(--oex-color-neutral-500);
  --oex-color-text-muted: var(--oex-color-neutral-400);
  --oex-color-text-on-primary: #ffffff;
  --oex-color-text-on-danger: #ffffff;
  --oex-color-text-on-success: #ffffff;

  /* Backgrounds */
  --oex-color-bg-primary: #ffffff;
  --oex-color-bg-secondary: var(--oex-color-neutral-50);
  --oex-color-bg-elevated: #ffffff;
  --oex-color-bg-overlay: rgba(0, 0, 0, 0.5);

  /* Borders */
  --oex-color-border: var(--oex-color-neutral-200);
  --oex-color-border-focus: var(--oex-color-primary);

  /* Message bubbles */
  --oex-color-message-outbound-bg: var(--oex-color-primary);
  --oex-color-message-outbound-text: var(--oex-color-text-on-primary);
  --oex-color-message-inbound-bg: var(--oex-color-neutral-100);
  --oex-color-message-inbound-text: var(--oex-color-text-primary);

  /* Call quality */
  --oex-color-quality-excellent: #16a34a;
  --oex-color-quality-great: #22c55e;
  --oex-color-quality-good: #84cc16;
  --oex-color-quality-fair: #eab308;
  --oex-color-quality-degraded: #ef4444;
}
```

### Typography tokens

```css
:root {
  --oex-font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --oex-font-size-xs: 0.75rem;      /* 12px — timestamps, badges */
  --oex-font-size-sm: 0.875rem;     /* 14px — secondary text, message previews */
  --oex-font-size-base: 1rem;       /* 16px — body text, message bodies */
  --oex-font-size-lg: 1.125rem;     /* 18px — caller info, lead names */
  --oex-font-size-xl: 1.25rem;      /* 20px — timer, large numbers */
  --oex-font-weight-normal: 400;
  --oex-font-weight-medium: 500;
  --oex-font-weight-semibold: 600;
  --oex-font-weight-bold: 700;
  --oex-line-height-tight: 1.25;
  --oex-line-height-normal: 1.5;
}
```

### Spacing tokens

```css
:root {
  --oex-space-1: 0.25rem;   /* 4px */
  --oex-space-2: 0.5rem;    /* 8px */
  --oex-space-3: 0.75rem;   /* 12px */
  --oex-space-4: 1rem;      /* 16px */
  --oex-space-5: 1.25rem;   /* 20px */
  --oex-space-6: 1.5rem;    /* 24px */
  --oex-space-8: 2rem;      /* 32px */
  --oex-space-10: 2.5rem;   /* 40px */
  --oex-space-12: 3rem;     /* 48px */
}
```

### Border radius tokens

```css
:root {
  --oex-radius-sm: 0.25rem;     /* 4px — inputs, selects */
  --oex-radius-md: 0.5rem;      /* 8px — cards, panels */
  --oex-radius-lg: 0.75rem;     /* 12px — message bubbles */
  --oex-radius-xl: 1rem;        /* 16px — modals, banners */
  --oex-radius-full: 9999px;    /* Pill — badges, round buttons */
}
```

### Shadow tokens

```css
:root {
  --oex-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --oex-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --oex-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --oex-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
}
```

### Transition tokens

```css
:root {
  --oex-transition-fast: 150ms ease;
  --oex-transition-normal: 200ms ease;
  --oex-transition-slow: 300ms ease;
}
```

### Z-index tokens

```css
:root {
  --oex-z-base: 0;
  --oex-z-dropdown: 10;
  --oex-z-sticky: 20;
  --oex-z-banner: 30;       /* IncomingCallBanner */
  --oex-z-overlay: 40;
  --oex-z-modal: 50;
}
```

### Recommended color mapping per data-state

| `data-state` value | Suggested color token |
|---|---|
| `idle` | `--oex-color-neutral-500` |
| `connecting` | `--oex-color-info` |
| `ringing` | `--oex-color-info` |
| `open` | `--oex-color-success` |
| `reconnecting` | `--oex-color-warning` |
| `pending` | `--oex-color-warning` |
| `closed` | `--oex-color-neutral-400` |
| `active` (dialer session) | `--oex-color-success` |
| `paused` (dialer session) | `--oex-color-warning` |
| `completed` (dialer session) | `--oex-color-neutral-500` |
| `loading` | `--oex-color-neutral-400` |
| `error` | `--oex-color-danger` |
| `ready` | `--oex-color-text-primary` |

---

*End of reference. This document describes the complete public surface of the `@oex/comms-sdk` headless components as of Directive 09.*
