# SDK Reference Assessment

> Assessment of Twilio SDK documentation for building a React wrapper component for browser-based calling and messaging.
> Generated: 2026-03-17

---

## Table of Contents

1. [Primary: Voice JavaScript SDK](#1-primary-voice-javascript-sdk)
   - [00-index.md](#00-indexmd)
   - [01-device-class.md](#01-device-classmd)
   - [02-call-class.md](#02-call-classmd)
   - [03-audio-helper-class.md](#03-audio-helper-classmd)
   - [04-preflight-test-class.md](#04-preflight-test-classmd)
   - [05-output-device-collection-class.md](#05-output-device-collection-classmd)
   - [06-interfaces.md](#06-interfacesmd)
   - [07-enums.md](#07-enumsmd)
   - [08-errors.md](#08-errorsmd)
2. [Secondary: Client SDKs General](#2-secondary-client-sdks-general)
   - [00-overview.md](#00-overviewmd-1)
   - [01-network-connectivity-requirements.md](#01-network-connectivity-requirementsmd)
   - [02-error-codes.md](#02-error-codesmd)
   - [03-voice-sdk-call-message-events.md](#03-voice-sdk-call-message-eventsmd)
   - [04-client-call-notification-webhook.md](#04-client-call-notification-webhookmd)
3. [Tertiary: Conversations SDK](#3-tertiary-conversations-sdk)
   - [SDK Guides — Getting Started](#sdk-guides--getting-started)
   - [SDK Guides — More Resources](#sdk-guides--more-resources)
   - [Client-Side SDKs (JavaScript)](#client-side-sdks-javascript)
   - [Migration Guide](#migration-guide)
4. [Cross-SDK Structural Comparison](#4-cross-sdk-structural-comparison)
5. [React Wrapper Design Implications](#5-react-wrapper-design-implications)

---

## 1. Primary: Voice JavaScript SDK

**Directory:** `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/`
**Total files:** 9 | **Total lines:** 2,256

### 00-index.md

**Lines:** 249
**Covers:** Package overview, class/interface/enum inventory, usage patterns, browser compatibility, CSP requirements.

**Key details for React wrapper:**

- Package: `@twilio/voice-sdk` (npm only, no CDN as of v2.0). Named export: `Device`.
- Browser check: `Device.isSupported` static boolean — must be checked before mounting any calling component.
- CSP headers required: `script-src blob:`, `connect-src *.twilio.com wss://*.twilio.com`, `media-src mediastream:`.
- Migrated from legacy `twilio-client.js` 1.x.

**Core classes:** Device, Call, AudioHelper, PreflightTest, OutputDeviceCollection

**All Device events:** `registered`, `registering`, `unregistered`, `incoming`, `tokenWillExpire`, `error`, `destroyed`

**All Call events:** `accept`, `audio`, `cancel`, `disconnect`, `error`, `messageReceived`, `messageSent`, `mute`, `reconnected`, `reconnecting`, `reject`, `ringing`, `sample`, `volume`, `warning`, `warningCleared`

**Edge locations (16):** ashburn, dublin, frankfurt, roaming (default), sao-paulo, singapore, sydney, tokyo, umatilla + 7 interconnect variants (ashburn-ix, frankfurt-ix, london-ix, san-jose-ix, singapore-ix, sydney-ix, tokyo-ix)

---

### 01-device-class.md

**Lines:** 214
**Covers:** Device class — constructor, options, methods, events, state machine.

#### Constructor

```typescript
new Device(token: string, options?: Device.Options)
```

#### Device.Options (all optional)

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `allowIncomingWhileBusy` | boolean | false | Raise incoming event when busy |
| `appName` | string | — | Insights logging |
| `appVersion` | string | — | Tracking |
| `closeProtection` | string\|boolean | — | Prevent page nav during calls |
| `codecPreferences` | Codec[] | — | Ordered codec list |
| `disableAudioContextSounds` | boolean | — | HTMLAudioElement fallback |
| `maxAverageBitrate` | number | — | 8000–40000 bps recommended |
| `edge` | string\|string[] | "roaming" | Geographic location or fallback array |
| `dscp` | boolean | — | googDscp RTC constraint |
| `forceAggressiveIceNomination` | boolean | — | Experimental |
| `maxCallSignalingTimeoutMs` | number | — | Max reconnect before edge-fallback |
| `enableImprovedSignalingErrorPrecision` | boolean | — | More precise error codes |
| `logLevel` | LogLevelDesc | — | 0–5 or trace/debug/info/warn/error/silent |
| `tokenRefreshMs` | number | 10000 | ms before expiry for tokenWillExpire |
| `sounds` | Record\<SoundName, string\> | — | Custom sound URLs |

#### Static Properties

- `isSupported` (boolean) — browser compatibility check
- `version` (string)
- `packageName` (string)

#### Instance Properties

- `state` (Device.State) — current state
- `isBusy` (boolean) — actively on a call
- `identity` (string) — populated when registered
- `token` (string) — current JWT
- `edge` (string|null) — current edge (null when offline)
- `home` (string|null) — home region (null when offline)
- `calls` (Call[]) — active Call objects
- `audio` (AudioHelper) — audio operations

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(): Promise<void>` | Enable incoming calls |
| `unregister` | `(): Promise<void>` | Disable incoming calls |
| `connect` | `(options?: ConnectOptions): Promise<Call>` | Make outbound call |
| `disconnectAll` | `(): void` | Terminate all active calls |
| `updateToken` | `(token: string): void` | Refresh JWT |
| `updateOptions` | `(options?: Device.Options): void` | Modify settings |
| `runPreflight` | `(token, options?): PreflightTest` | Run diagnostic test |
| `destroy` | `(): void` | Release resources for GC |

#### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `registered` | — | Device successfully registered for incoming calls |
| `registering` | — | Registration in progress |
| `unregistered` | — | Device unregistered |
| `incoming` | Call | Incoming call received |
| `tokenWillExpire` | Device | Token nearing expiry (default 10s before) |
| `error` | TwilioError | Error occurred |
| `destroyed` | — | Device destroyed |

#### State Transitions (Device.State)

```
Unregistered → Registering → Registered → Unregistered → Destroyed
                    ↓ (failure)
                  Failed
```

**React wrapper relevance:** Device should be instantiated once (useRef or context provider). `register()` is async. `tokenWillExpire` is critical for token refresh logic. `destroy()` must be called on component unmount. `connect()` returns `Promise<Call>`. The `calls` array tracks active calls. `allowIncomingWhileBusy` and `closeProtection` are important UX options.

---

### 02-call-class.md

**Lines:** 267
**Covers:** Call class — methods, properties, events, state machine, quality feedback.

#### Properties

- `callerInfo` (CallerInfo|null) — caller verification (STIR/SHAKEN)
- `customParameters` (Map\<string,string\>) — custom params to/from TwiML
- `outboundConnectionId` (string) — temporary CallSid for outbound
- `parameters` (Record\<string,string\>) — call params from Twilio (incoming): `From`, `To`, `CallSid`

#### Accessors

- `codec` (string) — audio codec in use
- `connectToken` (string) — for reconnecting
- `direction` (CallDirection) — incoming or outgoing

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `accept` | `(options?: AcceptOptions): void` | Accept incoming call. AcceptOptions includes `rtcConstraints`. |
| `reject` | `(): void` | Reject incoming call |
| `ignore` | `(): void` | Stop ringing without rejecting |
| `disconnect` | `(): void` | Hang up |
| `mute` | `(shouldMute?: boolean): void` | Mute/unmute (toggles if no arg) |
| `isMuted` | `(): boolean` | Current mute status |
| `sendDigits` | `(digits: string): void` | DTMF. Valid: 0–9, *, #, w (0.5s pause) |
| `getLocalStream` | `(): MediaStream\|undefined` | Microphone audio |
| `getRemoteStream` | `(): MediaStream\|undefined` | Call audio |
| `status` | `(): Call.State` | Current state |
| `sendMessage` | `(message: CallMessage): string` | Beta — returns message SID |
| `postFeedback` | `(score?, issue?): Promise<void>` | Quality feedback after call ends |

**Post-call feedback options:**
- FeedbackScore: 1–5
- FeedbackIssue: `audio-latency`, `one-way-audio`, `choppy-audio`, `dropped-call`, `echo`, `background-noise`, `unclear-speech`

#### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `accept` | Call | Call accepted (incoming or outbound connected) |
| `audio` | (inputEnabled, outputEnabled) | Audio track state changed |
| `cancel` | — | Incoming call cancelled by caller |
| `disconnect` | Call | Call ended |
| `error` | TwilioError | Error on call |
| `messageReceived` | CallMessage | Beta — in-call message from server |
| `messageSent` | OutgoingCallMessage | Beta — confirmation of sent message |
| `mute` | (isMuted, Call) | Mute state changed |
| `reconnected` | — | Media connection restored |
| `reconnecting` | TwilioError | Attempting to restore connection |
| `reject` | — | Incoming call rejected |
| `ringing` | (hasEarlyMedia) | Outbound call ringing at destination |
| `sample` | RTCSample | WebRTC stats sample (every second) |
| `volume` | (inputVolume, outputVolume) | Volume levels (0–1 range) |
| `warning` | (warningName, warningData) | Quality warning raised |
| `warningCleared` | (warningName) | Quality warning cleared |

#### Call.State Transitions

```
Outbound: Connecting → Ringing → Open → Closed
                                   ↕
                              Reconnecting

Inbound:  Pending → Open → Closed
                     ↕
                Reconnecting
```

#### Call.QualityWarning Values

`high-rtt`, `high-jitter`, `high-packet-loss`, `low-mos`, `constant-audio-input-level`, `constant-audio-output-level`

**React wrapper relevance:** Call object comes from `device.connect()` or the `incoming` event. Track `status()` via events for UI state. `mute`/`isMuted` maps to toggle UI. `sendDigits` for dialpad. `getLocalStream`/`getRemoteStream` can feed `<audio>` elements or visualizers. `sample` event (every second) provides RTT, MOS, jitter for real-time quality UI. `warning`/`warningCleared` for quality alerts.

---

### 03-audio-helper-class.md

**Lines:** 228
**Covers:** AudioHelper class — device enumeration, input/output selection, audio processing.

Accessed via `device.audio`.

#### Properties

- `availableInputDevices` (Map\<string, MediaDeviceInfo\>) — all microphones
- `availableOutputDevices` (Map\<string, MediaDeviceInfo\>) — all speakers
- `speakerDevices` (OutputDeviceCollection) — output for call audio, DTMF, disconnect sounds
- `ringtoneDevices` (OutputDeviceCollection) — output for ringtone
- `isOutputSelectionSupported` (boolean) — browser support for output selection
- `isVolumeSupported` (boolean) — browser support for real-time volume analysis

#### Accessors

- `inputDevice` (MediaDeviceInfo|null) — current mic
- `inputStream` (MediaStream|null) — audio from mic or processor
- `audioConstraints` (MediaTrackConstraints|null) — applied constraints
- `localProcessedStream` (MediaStream|null) — processed local audio
- `remoteProcessedStream` (MediaStream|null) — processed remote audio

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `setInputDevice` | `(deviceId: string): Promise<void>` | Select microphone |
| `unsetInputDevice` | `(): Promise<void>` | Release microphone |
| `setAudioConstraints` | `(constraints: MediaTrackConstraints): Promise<void>` | Apply constraints (echoCancellation, noiseSuppression, autoGainControl, channelCount, sampleRate) |
| `unsetAudioConstraints` | `(): Promise<void>` | Remove constraints |
| `addProcessor` | `(processor: AudioProcessor, isRemote?: boolean): void` | Attach audio processor |
| `removeProcessor` | `(processor: AudioProcessor, isRemote?: boolean): void` | Detach audio processor |
| `incoming` | `(enable: boolean): void` | Toggle ringtone sound |
| `outgoing` | `(enable: boolean): void` | Toggle outgoing sound |
| `disconnect` | `(enable: boolean): void` | Toggle disconnect sound |

**React wrapper relevance:** `availableInputDevices`/`availableOutputDevices` map directly to dropdown selectors. `setInputDevice`/`speakerDevices.set()` for device switching. `isOutputSelectionSupported` must be checked before rendering speaker selection UI (not supported in Firefox/Safari). Audio processors enable custom noise suppression hooks. Sound toggles are useful settings.

---

### 04-preflight-test-class.md

**Lines:** 213
**Covers:** PreflightTest class — connectivity diagnostics, MOS scoring, network timing.

#### Creation

```typescript
new PreflightTest(token, options?)
// or
device.runPreflight(token, options?)
```

#### Properties

- `callSid` (string|undefined)
- `status` (PreflightTest.Status)
- `startTime` (number)
- `endTime` (number|undefined)
- `latestSample` (RTCSample|undefined)
- `report` (PreflightTest.Report|undefined) — available after completion

#### Methods

- `stop(): void` — stops test, raises `failed` event

#### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | — | Test call connected |
| `completed` | Report | Test finished with results |
| `failed` | DOMException\|TwilioError | Test failed |
| `sample` | RTCSample | Stats sample (every second) |
| `warning` | (name, WarningData) | Quality warning |

#### PreflightTest.Status

`Connecting`, `Connected`, `Completed`, `Failed`

#### MOS Score / CallQuality Interpretation

| Quality | MOS Range |
|---------|-----------|
| Excellent | ≥ 4.2 |
| Great | 4.0–4.2 |
| Good | 3.6–4.0 |
| Fair | 3.1–3.6 |
| Degraded | < 3.1 |

#### Recommended Quality Thresholds

| Metric | Good | Warning |
|--------|------|---------|
| RTT | < 200ms | > 400ms |
| Jitter | < 30ms | > 50ms |
| Packet Loss | < 1% | > 3% |
| MOS | > 4.0 | < 3.5 |

#### Report Properties

`callQuality`, `callSid`, `edge`, `iceCandidateStats`, `networkTiming`, `samples`, `selectedEdge`, `selectedIceCandidatePairStats`, `stats`, `testTiming`, `totals`, `warnings`

#### NetworkTiming Breakdown

`dtls`, `ice`, `peerConnection`, `signaling` — each a `TimeMeasurement` object

#### PreflightTest.Options

`codecPreferences`, `edge`, `fakeMicInput`, `iceServers`, `signalingTimeoutMs`

**React wrapper relevance:** Enables a "test your connection" feature before calls. `sample` event provides real-time progress. `completed` gives final report with `callQuality` enum. `fakeMicInput` option is useful for testing without a real mic. Network timing breakdown helps diagnose issues.

---

### 05-output-device-collection-class.md

**Lines:** 157
**Covers:** OutputDeviceCollection class — speaker management for call audio and ringtone.

Used as `device.audio.speakerDevices` and `device.audio.ringtoneDevices`.

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(): Set<MediaDeviceInfo>` | Current active output devices |
| `set` | `(deviceIdOrIds: string\|string[]): Promise<void>` | Replace all active devices |
| `delete` | `(device: MediaDeviceInfo): boolean` | Remove device (auto-fallback if last removed) |
| `test` | `(soundUrl?: string): Promise<void>` | Play test audio through devices |

#### Browser Support for Output Selection

- **Supported:** Chrome 49+, Edge 79+, Opera 36+
- **Not supported:** Firefox, Safari

**React wrapper relevance:** Speaker selection UI needs `isOutputSelectionSupported` guard. `set()` accepts single or array of IDs. `test()` enables "test speaker" button. Separate `speakerDevices` and `ringtoneDevices` allow different speakers for call audio vs ringtone. Auto-fallback on `delete()` guarantees at least one output device.

---

### 06-interfaces.md

**Lines:** 287
**Covers:** All TypeScript interfaces.

#### AudioProcessor

```typescript
interface AudioProcessor {
  createProcessedStream(stream: MediaStream): Promise<MediaStream>;
  destroyProcessedStream(stream: MediaStream): Promise<void>;
}
```

Use cases: noise elimination, on-hold music, audio filtering, AI classification.

#### RTCSample

```typescript
interface RTCSample {
  audioInputLevel: number;      // 0–32767
  audioOutputLevel: number;     // 0–32767
  bytesReceived: number;
  bytesSent: number;
  codecName: string;
  jitter: number;
  mos: number | null;           // 1.0–~4.5
  packetsLost: number;
  packetsLostFraction: number;  // 0.0–1.0
  packetsReceived: number;
  packetsSent: number;
  rtt: number;                  // ms
  timestamp: number;
  totals: RTCSampleTotals;
  [key: string]: any;
}
```

#### RTCSampleTotals

```typescript
interface RTCSampleTotals {
  bytesReceived: number;
  bytesSent: number;
  packetsLost: number;
  packetsLostFraction: number;
  packetsReceived: number;
  packetsSent: number;
}
```

#### RTCWarning

```typescript
interface RTCWarning {
  name?: string;
  samples?: RTCSample[];
  threshold?: ThresholdWarningData;
  value?: number;
  values?: number[];
}
```

#### ThresholdWarningData

```typescript
interface ThresholdWarningData {
  name: string;
  value: number;
}
```

#### NetworkTiming

```typescript
interface NetworkTiming {
  dtls?: TimeMeasurement;
  ice?: TimeMeasurement;
  peerConnection?: TimeMeasurement;
  signaling?: TimeMeasurement;
}
```

#### TimeMeasurement

```typescript
interface TimeMeasurement {
  start: number;
  duration?: number;
  end?: number;
}
```

#### Device.ConnectOptions

```typescript
interface ConnectOptions {
  params?: Record<string, string>;
  rtcConstraints?: RTCOfferOptions;
  rtcConfiguration?: RTCConfiguration;
}
```

`params` is how you pass `To`, `From`, and custom data to TwiML.

#### CallMessage (Beta)

```typescript
interface CallMessage {
  content: string;
  contentType: string;
  messageType: string;
}
```

**React wrapper relevance:** RTCSample is key for building real-time quality dashboards (MOS, RTT, jitter, packet loss). AudioProcessor interface enables custom noise suppression hooks. ConnectOptions.params is the mechanism for passing call routing data to TwiML.

---

### 07-enums.md

**Lines:** 319
**Covers:** All TypeScript enumerations.

#### Edge (16 values)

`Ashburn`, `Dublin`, `Frankfurt`, `Roaming` (default), `SaoPaulo`, `Singapore`, `Sydney`, `Tokyo`, `Umatilla`, `AshburnIx`, `FrankfutIx`, `LondonIx`, `SanJoseIx`, `SingaporeIx`, `SydneyIx`, `TokyoIx`

Supports fallback arrays: `{ edge: ['ashburn', 'umatilla'] }`

#### Device.State (4 values)

| Value | String |
|-------|--------|
| Destroyed | "destroyed" |
| Registered | "registered" |
| Registering | "registering" |
| Unregistered | "unregistered" |

#### Call.State (6 values)

| Value | String |
|-------|--------|
| Pending | "pending" |
| Connecting | "connecting" |
| Ringing | "ringing" |
| Open | "open" |
| Reconnecting | "reconnecting" |
| Closed | "closed" |

#### Call.Codec (2 values)

| Value | Description |
|-------|-------------|
| PCMU | G.711 μ-law, 64kbps |
| Opus | Variable bitrate, recommended |

#### Call.FeedbackScore (5 values)

`One=1`, `Two=2`, `Three=3`, `Four=4`, `Five=5`

#### Call.FeedbackIssue (7 values)

`AudioLatency`, `OneWayAudio`, `ChoppyAudio`, `DroppedCall`, `Echo`, `BackgroundNoise`, `UnclearSpeech`

#### Call.QualityWarning (6 values)

`high-rtt`, `high-jitter`, `high-packet-loss`, `low-mos`, `constant-audio-input-level`, `constant-audio-output-level`

#### PreflightTest.Status (4 values)

`Connecting`, `Connected`, `Completed`, `Failed`

#### PreflightTest.CallQuality (5 values)

`Excellent` (≥4.2), `Great` (4.0–4.2), `Good` (3.6–4.0), `Fair` (3.1–3.6), `Degraded` (<3.1)

#### Device.SoundName

`Incoming`, `Outgoing`, `Disconnect`, `Dtmf0`–`Dtmf9`, `DtmfS` (*), `DtmfH` (#). Customizable via `Device.Options.sounds`.

**React wrapper relevance:** These enums should be used as TypeScript types in the wrapper. `Call.State` drives the UI state machine. `Device.State` determines registration status UI. `QualityWarning` maps to user-facing alerts. `FeedbackScore`/`FeedbackIssue` for post-call surveys.

---

### 08-errors.md

**Lines:** 322
**Covers:** Full error catalog — TwilioError base class, derived classes, all error codes with categories/causes/solutions.

#### TwilioError Base Class

```typescript
class TwilioError extends Error {
  code: number;
  name: string;
  message: string;
  description: string;
  explanation: string;
  causes: string[];
  solutions: string[];
  originalError: Error | undefined;
}
```

#### Derived Error Classes

- `InvalidArgumentError` (code 31000)
- `InvalidStateError` (code 31000)
- `NotSupportedError` (code 31000)

#### Full Error Catalog

**AuthorizationErrors (20xxx)**

| Code | Name | Description |
|------|------|-------------|
| 20101 | InvalidJWTToken | JWT is invalid |
| 20102 | JWTTokenExpired | JWT has expired |
| 20103 | AuthenticationFailed | Authentication failed |
| 20104 | InvalidAccessToken | Access token invalid |
| 20151 | ExpirationTimeExceedsMaximum | Token TTL too long |
| 20157 | ExpiredJWTToken | JWT expired (alternate code) |

**ClientErrors (31001–31009)**

| Code | Name | Description |
|------|------|-------------|
| 31001 | BadRequest | Bad request |
| 31002 | NotFound | Not found |
| 31003 | Forbidden | Forbidden |
| 31005 | UnexpectedSignalingError | WebSocket unexpectedly closed |
| 31008 | UserDeniedMediaAccess | User denied microphone access |
| 31009 | RegistrationError | Registration failed |

**GeneralErrors (31000, 31006–31007)**

| Code | Name | Description |
|------|------|-------------|
| 31000 | UnknownError | Generic error |
| 31006 | ConnectionError | Connection failed |
| 31007 | CallCancelled | Call was cancelled |

**MalformedRequestErrors (311xx)**

| Code | Name |
|------|------|
| 31100 | MalformedRequest |

**MediaErrors (312xx)**

| Code | Name | Description |
|------|------|-------------|
| 31201 | ConnectionFailed | Media connection failed |
| 31202 | MediaConnectionFailed | Media connection failed |
| 31203 | LowBytesReceived | Low bytes received |
| 31204 | LowBytesSent | Low bytes sent |
| 31205 | IceGatheringFailed | ICE gathering failed |
| 31206 | IceConnectionFailed | ICE connection failed |
| 31207 | NoSupportedCodec | No supported codec |

**SignalingErrors (313xx)**

| Code | Name | Description |
|------|------|-------------|
| 31301 | SignalingConnectionDisconnected | Signaling disconnected |
| 31302 | SignalingConnectionError | Signaling error |
| 31303 | SignalingConnectionTimeout | Signaling timeout |

**SignatureValidationErrors (314xx)**

| Code | Name |
|------|------|
| 31401 | InvalidSignature |
| 31402 | AccessTokenSignatureInvalid |

**SIPServerErrors (315xx)**

| Code | Name | Description |
|------|------|-------------|
| 31501 | SIPServerError | SIP server error |
| 31502 | SIPBadRequest | SIP bad request |
| 31503 | SIPUnavailable | SIP unavailable |
| 31504 | SIPTimeout | SIP timeout |
| 31505 | SIPBusyEverywhere | SIP busy everywhere |
| 31506 | SIPDecline | SIP decline |
| 31507 | SIPNotAcceptable | SIP not acceptable |

**UserMediaErrors (314xx overlap)**

| Code | Name | Description |
|------|------|-------------|
| 31401 | PermissionDenied | Media permission denied |
| 31402 | DeviceNotFound | Media device not found |
| 31403 | ConstraintNotSatisfied | Media constraint not satisfied |
| 31404 | OverconstrainedError | Overconstrained media request |

#### Common Error Scenarios with Solutions

| Scenario | Error Codes | Solution |
|----------|-------------|----------|
| Token expired | 20102, 20157 | Fetch new token, call `device.updateToken()` |
| Mic denied | 31008 | Prompt user for permission |
| Media connection failed | 31201, 31202 | Check network, try different edge |
| Connection failed | 31006 | Check internet |
| Signaling timeout | 31303 | Check firewall, try different edge |
| ICE failed | 31205, 31206 | Check TURN/STUN config |

#### Best Practices

- Always handle errors on both Device and Call
- Implement proactive token refresh via `tokenWillExpire`
- Provide user feedback per error type
- Log error codes and messages
- Implement graceful degradation
- Enable `enableImprovedSignalingErrorPrecision: true` for more specific error codes (avoids generic 53000/31005)

**React wrapper relevance:** Error handling should be centralized. Token errors (20xxx) need automatic refresh. Media errors (31008, 31402) need user-facing permission/device prompts. Network errors (312xx, 313xx) need reconnection UI. The `causes` and `solutions` arrays from TwilioError can be surfaced directly to users or logs. A switch on `error.code` is the recommended pattern.

---

## 2. Secondary: Client SDKs General

**Directory:** `api-reference-docs-new/twilio/voice/43-client-sdks-general/`
**Total files:** 5

### 00-overview.md

**Lines:** 277
**Covers:** Full Voice SDK architecture — AccessTokens, TwiML Apps, connection lifecycle, call legs (parent/child), inbound vs outbound handling.

**Token management patterns:**
- AccessTokens are JWTs serving as end-user credentials
- Decoded payload contains: `grants.identity`, `grants.voice.incoming.allow`, `grants.voice.outgoing.application_sid`, `iat`/`exp`, `iss` (API Key SID), `sub` (Account SID)
- Typical flow: client sends GET to `/token` endpoint; server creates and returns JWT
- Tokens expire — the `exp` field controls this. First thing to check when encountering errors.

**TwiML App integration:**
- TwiML App SID in the token links outbound calls to a Voice URL
- Three URLs: Voice Request URL (call handling), Voice Fallback URL (backup), Voice Status Callback URL (status updates)
- All outbound SDK calls trigger a request to the TwiML App's Voice URL

**Connection lifecycle / call legs:**
- Every SDK call has two legs: a **parent** Call and a **child** Call (created by `<Dial>`)
- **Incoming to SDK:** Parent = caller-to-Twilio-number; Child = Twilio-to-SDK-client. SDK Call SID = **child** Call SID.
- **Outgoing from SDK:** Parent = SDK-client-to-Twilio; Child = Twilio-to-recipient. SDK Call SID = **parent** Call SID.
- Status callback: if `ParentCallSid` absent, child Call hasn't been created yet.

---

### 01-network-connectivity-requirements.md

**Lines:** 357
**Covers:** Network/firewall requirements, media/signaling connectivity, GLL routing, edge selection, TURN/NTS config, Opus codec settings.

**Two connection types required:**
1. **Signaling** — TLS (TCP port 443) for call control
2. **Media** — SRTP (UDP ports 10,000–60,000) for audio

**Media server IP range:** `168.86.128.0/18`, UDP ports `10,000–60,000` (all edge locations)

**JS SDK signaling endpoints:**
- GLL: `voice-js.roaming.twilio.com` port 443 (v2.3.0+)
- Regional: `voice-js.{edge-location}.twilio.com` port 443
- Insights: `eventgw.twilio.com` port 443
- Legacy (pre-2.3.0): `chunderw-gll.twilio.com`, `chunderw-vpc-gll.twilio.com`

**Edge selection:**
```javascript
const device = new Twilio.Device(token, { edge: 'ashburn' });
device.updateOptions({ edge: 'ashburn' });
```

**Global Low Latency (GLL):**
- Default behavior; uses Route53 for lowest-latency edge
- Requires DNS supporting RFC 7871 (Client Subnet)
- VPN users may route to wrong edge based on VPN exit

**Bandwidth requirements:**

| Metric | Opus | PCMU |
|--------|------|------|
| Bandwidth | 40kbps up/down | 100kbps up/down |
| Latency (RTT) | < 200ms | < 200ms |
| Jitter | < 30ms | < 30ms |
| Packet loss | < 3% | < 3% |

**TURN via NTS (Network Traversal Service):**
- For restrictive firewalls blocking UDP
- Server requests credentials: `POST https://api.twilio.com/2010-04-01/Accounts/$SID/Tokens.json`
- Returns `ice_servers` array (TURN/STUN URIs, username, credential)
- Client passes via `rtcConfiguration`:
  ```javascript
  const call = await device.connect({ rtcConfiguration: { iceServers } });
  device.on('incoming', call => { call.accept({ rtcConfiguration: { iceServers } }); });
  ```
- Credentials are ephemeral — fetch fresh ones per Device initialization

**Opus codec config:**
```javascript
const device = new Twilio.Device(token, {
  codecPreferences: ['opus', 'pcmu'],
  maxAverageBitrate: 16000  // custom 16kbps
});
```

---

### 02-error-codes.md

**Lines:** 17
**Covers:** Common Voice SDK error codes by series (condensed reference).

**Key notes:**
- JS SDK emits errors with a `twilioError` field containing a `TwilioError` object (v2.0+ default)

**Error code series summary:**

| Series | Description |
|--------|-------------|
| 310xx | General errors (31000 generic, 31001 app not found, 31002 declined, 31003 timeout, 31005 WebSocket closed, 31009 no transport) |
| 311xx | Malformed requests (31100 generic, 31101–31105 parameter/token/name issues) |
| 312xx | Authorization (31201–31208 including mic access denial at 31208) |
| 53xxx | Signaling (53000 WebSocket timeout, 53405 ICE failure) |

**Identity constraint:** Only alphanumeric and underscore characters allowed; max 256 characters. Spaces or other characters cause unexpected behavior (error 31105).

---

### 03-voice-sdk-call-message-events.md

**Lines:** 337
**Covers:** Bidirectional custom messaging during active calls via signaling connection.

**Minimum version:** Voice JavaScript SDK v2.2.0

**Call must be "active":** Status is `"open"` or `"ringing"` (via `call.status()`)

**Receiving messages from server (JS):**
```javascript
call.on("messageReceived", (message) => {
  console.log(JSON.stringify(message.content));
  console.log('voiceEventSid: ', message.voiceEventSid);
});
```

**Sending messages to server (JS):**
```javascript
const callMessage = {
  content: { key1: 'Message from parent call' },
  messageType: 'user-defined-message',
  contentType: "application/json"
};
const voiceEventSid = call.sendMessage(callMessage);
```

**Server-side mechanics:**
- **Server→SDK:** POST to Call's `UserDefinedMessages` endpoint
- **SDK→Server:** Server creates `UserDefinedMessageSubscription` on the Call with a callback URL, then SDK calls `call.sendMessage()`

**Call SID usage (critical):**
- Outgoing from SDK: use **parent** Call SID
- Incoming to SDK: use **child** Call SID

**React wrapper relevance:** Only enable message-sending UI during active calls. This feature enables real-time server-to-client communication during calls (e.g., CRM data push, AI transcription results).

---

### 04-client-call-notification-webhook.md

**Lines:** 133
**Covers:** Custom webhook for incoming call notification delivery, replacing Twilio's default FCM/APNs push.

**Relevance to browser SDK:** Primarily for mobile, but the webhook fires for **both mobile and non-mobile client users**, meaning browser SDK users trigger it too.

**Webhook POST body parameters:**

| Parameter | Description |
|-----------|-------------|
| `twi_account_sid` | Account SID |
| `twi_bridge_token` | Encrypted reconnection token |
| `twi_call_sid` | Call SID |
| `twi_from` | Caller ID (e.g., `client:alice`) |
| `twi_to` | Callee ID (e.g., `client:bob`) |
| `twi_message_id` | Unique webhook request ID |
| `twi_message_type` | Always `"twilio.voice.call"` |
| `twi_params` | Optional URL-encoded custom parameters |

**Expected responses:** 200 OK (binding found) or 404 (no matching binding).

---

## 3. Tertiary: Conversations SDK

**Directories:**
- `api-reference-docs-new/twilio/messaging/15-conversations/04-conversations-sdk-guides/`
- `api-reference-docs-new/twilio/messaging/15-conversations/06-client-side-sdks/`

### SDK Guides — Getting Started

#### 01-sdk-overview.md (138 lines)

**Initialization and authentication:**
```javascript
import { Client } from "@twilio/conversations";
const client = new Client("token");
client.on("stateChanged", (state) => {
    if (state === "initialized") { /* ready */ }
    if (state === "failed") { /* error */ }
});
```

**Token lifecycle:**
- `tokenAboutToExpire` → get new token, call `client.updateToken(token)`
- `tokenExpired` → must create a brand new `Client` instance
- Max token TTL: 24 hours

**Connection states (5):** `connecting`, `connected`, `disconnecting`, `disconnected`, `denied`
- Listen via: `client.on("connectionStateChanged", ({state}) => { ... })`
- `denied` = invalid JWT

#### 02-event-handling.md (65 lines)

**Event-driven architecture.** Events fire on Client, Conversation, User, Participant, and Message objects.

```javascript
client.on("conversationUpdated", ({conversation, updateReasons}) => { ... });
conversation.on("messageUpdated", ({message, updateReasons}) => { ... });
```

**Best practice:** Receive most events at the Client level rather than duplicating on each object.

#### 03-working-with-conversations.md (148 lines)

**Conversation CRUD:**
```javascript
// Create
await client.createConversation({ friendlyName: "new conversation", uniqueName: "unique-id" });
// Join/Leave
await conversation.join();
await conversation.leave();
// Add participants
await conversation.add("identity");               // chat participant
await conversation.addNonChatParticipant(proxy, address);  // SMS/WhatsApp
// List
let paginator = await client.getSubscribedConversations();
```

**Message retrieval (paginated):**
```javascript
let paginator = await conversation.getMessages(30, 0, "backwards");
const messages = paginator.items;
```

#### 04-sending-messages-and-media.md (167 lines)

**Text:** `await conversation.sendMessage('hello world')`

**MessageBuilder (fluent pattern):**
```javascript
await conversation.prepareMessage()
    .setBody('Hello!')
    .setAttributes({foo: 'bar'})
    .addMedia(media1)
    .addMedia(media2)
    .build()
    .send();
```

**Media:** Accepts String, Blob, or Node.js Buffer. Max 150 MB combined. Temp URLs valid 300 seconds.

#### 05-user-reachability-indicator.md (84 lines)

**Presence feature** (disabled by default, enable via REST API).
```javascript
client.on("userUpdated", ({ user, updateReasons }) => {
    if (updateReasons.includes("reachabilityOnline")) { /* online/offline */ }
});
const user = await participant.getUser();
user.isOnline;      // boolean
user.isNotifiable;  // boolean
```

#### 06-read-horizon-and-read-status-overview.md (91 lines)

**Read tracking (not auto-set):**
```javascript
await conversation.advanceLastReadMessageIndex(message.index); // won't go backwards
await conversation.setAllMessagesRead();
await conversation.getUnreadMessagesCount();
```

#### 07-delivery-receipts-overview.md (130 lines)

**Delivery status for non-chat participants** (SMS/WhatsApp). Statuses: sent, delivered, read, failed, undelivered.
```javascript
const agg = message.aggregatedDeliveryReceipt;  // summary
const details = await message.getDetailedDeliveryReceipts();  // per-participant
```

#### 08-conversations-attributes.md (84 lines)

**JSON attributes** on Conversation (16KB), User (16KB), Participant (4KB), Message (4KiB).
```javascript
await conversation.setAttributes({key: "value"});
```

#### 09-modifying-a-conversation-message-or-participant.md (76 lines)

**Update operations:**
```javascript
await conversation.updateFriendlyName("foo");
await message.updateBody("bar");
await participant.updateAttributes({foo: 8});
```

**Delete operations (cascading):**
```javascript
await conversation.delete();  // deletes all messages, media, participants
await message.remove();
await participant.remove();
```

---

### SDK Guides — More Resources

#### 01-initializing-conversations-sdk-clients.md (150 lines)

**JS initialization patterns:**
```javascript
// Promise-based
Conversations.Client.create(token).then(client => { /* use */ });
// Async/await
let client = await Twilio.Conversations.Client.create(token);
```

**On login, the SDK automatically:**
- Retrieves subscribed Conversations list
- Subscribes to change notifications
- Retrieves friendlyName, uniqueName, attributes for each
- Retrieves Participant lists
- Does NOT retrieve Messages (must call `getMessages()`)
- Does NOT retrieve/subscribe to Users linked to Participants

#### 02-create-access-tokens-for-conversations.md (86 lines)

**Token generation (server-side):**
- Requires: Account SID, Chat Service SID (ISXXX), API Key SID + Secret, Identity
- Uses `ChatGrant` (not "ConversationGrant")
- Default TTL: 3600s (1 hour), max 24 hours

#### 03-user-identity-and-active-users.md (72 lines)

Identity is unique per User. Billing is per active unique identity per month. Just creating a `Client` makes the user "active."

#### 04-read-horizon-and-read-status.md (155 lines)

**Advanced read horizon:**
```javascript
activeConversation.on("participantUpdated", function(event) {
    event.participant.lastReadMessageIndex;
    event.participant.lastReadTimestamp;
});
```
- SDKs do NOT auto-set read horizon
- `getUnreadMessageCount()` returns max 1000
- Read reports batched every 10 seconds
- Indexes are sequential but not necessarily consecutive

#### 05-typing-indicator.md (69 lines)

**Producer/consumer model:**
```javascript
// Sending
inputBox.on('keydown', (e) => { activeConversation.typing(); });
// Consuming
activeConversation.on('typingStarted', (participant) => { ... });
activeConversation.on('typingEnded', (participant) => { ... });
```
Throttled to once every 5 seconds (configurable via `TypingIndicatorTimeout`).

#### 06-best-practices-using-the-conversations-sdk.md (68 lines)

**Critical implementation guidance:**
- No shutdown/create cycle on network drops — SDK auto-reconnects
- Only call `shutdown` on logout/login
- Always create new instance after shutdown
- Subscribe to `Client#conversationAdded` BEFORE calling `getSubscribedConversations()` to avoid missing items
- Messages NOT fetched on load — only `messageAdded` fires for new messages
- Semi-real-time (cached) methods: `getParticipantCount()`, `getMessagesCount()`, `getUnreadMessagesCount()`
- Token TTL: several hours to 24H recommended; under 5 minutes won't work

#### 07-error-handling-and-diagnostics.md (128 lines)

**JS error handling:**
```javascript
client.getMessages().catch(e => { console.error(e.code, e.message); });
```
- All async methods return Promises
- Error objects have `.code` and `.message`
- Connection state `denied` = token problem

**Logging:**
```javascript
Twilio.Conversations.Client.create(token, { logLevel: 'debug' });
```
Default: `SILENT`. Recommended for debugging: `DEBUG`.

---

### Client-Side SDKs (JavaScript)

#### 01-versioning-and-support-lifecycle.md (1 line — stub/empty)

No content.

#### javascript/01-download.md (1 line — stub/empty)

No content.

#### javascript/02-sdk-docs.md (38 lines)

**Current version:** 2.6.5
**Package:** `npm install @twilio/conversations`
**Key classes:** Client, Conversation, Message, Participant, Media, User

```javascript
import { Client } from '@twilio/conversations';
const client = new Client(token);
client.on('connectionStateChanged', (state) => { ... });
client.on('conversationJoined', (conversation) => { ... });
```

#### javascript/03-react-demo-app.md (33 lines)

Official React demo: `https://github.com/twilio/twilio-conversations-demo-react`
Demonstrates: auth, conversation CRUD, real-time messaging, participant management, push notifications, media attachments.

#### javascript/04-changelog.md (1 line — stub/empty)

No content.

#### javascript/05-supported-browsers-for-the-javascript-sdk.md (1 line — stub/empty)

No content.

---

### Migration Guide

#### 01-migrating-from-programmable-chat.md (244 lines)

**Vocabulary changes:** Channels → Conversations, Members → Participants, ChatClient → ConversationsClient

**Key differences:**
- All Conversations are private (no public channels)
- Conversations is multichannel (SMS, WhatsApp, chat)
- Chat SIDs (CHXXX) carry over
- Uses `ChatGrant` in access token (same as Chat)

**New in Conversations:** Multichannel messaging, delivery receipts, states/timers (active/inactive/closed), group MMS.

---

## 4. Cross-SDK Structural Comparison

| Pattern | Voice JS SDK | Conversations JS SDK |
|---------|-------------|---------------------|
| **Package** | `@twilio/voice-sdk` | `@twilio/conversations` |
| **Entry point** | `new Device(token)` | `new Client(token)` or `Client.create(token)` |
| **Ready detection** | `device.on("registered")` | `client.on("stateChanged", "initialized")` |
| **Token refresh** | `device.updateToken(token)` on `tokenWillExpire` | `client.updateToken(token)` on `tokenAboutToExpire` |
| **Connection states** | Device.State: Unregistered/Registering/Registered/Destroyed | connecting/connected/disconnecting/disconnected/denied |
| **Event model** | EventEmitter `.on()` on Device, Call | EventEmitter `.on()` on Client, Conversation, Participant, User, Message |
| **Error handling** | TwilioError with `.code`, `.causes`, `.solutions` | Promise-based `.catch()` with `.code`, `.message` |
| **Logging** | `logLevel` in Device options | `logLevel` in Client options |
| **Cleanup** | `device.destroy()` | `client.shutdown()` |
| **Token grant** | VoiceGrant | ChatGrant |
| **Data model** | Ephemeral (calls start and end) | Persistent (conversations, messages, participants, read horizons) |

**Shared patterns the React wrapper can reuse:**
1. Token management hook — both SDKs use `updateToken()` with a pre-expiry event
2. Connection state tracking — both have connection state enums suitable for a shared status indicator component
3. EventEmitter subscription pattern — both use `.on()/.off()`, suitable for a shared `useEvent` hook
4. Error handling pattern — both emit errors with codes, suitable for a shared error boundary/handler
5. Logging configuration — both accept `logLevel` in options

---

## 5. React Wrapper Design Implications

### Voice SDK — Critical Integration Points

1. **Device lifecycle:** Instantiate once in a context provider (useRef). Call `destroy()` on unmount. `register()` for incoming calls is async.

2. **Token refresh:** Listen for `tokenWillExpire` (fires 10s before expiry by default). Fetch new token from server, call `device.updateToken()`. This must be automatic and invisible to the user.

3. **Call state machine:** Track `Call.State` transitions via events. The UI should reactively reflect: Connecting → Ringing → Open → Closed, with Reconnecting as an overlay state.

4. **Audio device management:** `device.audio.availableInputDevices`/`availableOutputDevices` for dropdowns. Check `isOutputSelectionSupported` before rendering speaker selector. Use `speakerDevices.test()` for speaker test buttons.

5. **Real-time quality metrics:** The `sample` event on Call fires every second with RTCSample data (MOS, RTT, jitter, packet loss). This enables live quality indicators.

6. **Error centralization:** Handle errors on both Device and Call. Use `error.code` switch for user-facing messages. Token errors (20xxx) → auto-refresh. Media errors (31008) → permission prompt. Network errors → reconnection UI.

7. **Browser compatibility:** Check `Device.isSupported` before rendering. Set CSP headers. Output selection only in Chrome/Edge/Opera.

8. **Preflight testing:** `device.runPreflight()` or `new PreflightTest()` for "test your connection" UI. Report includes MOS-based CallQuality enum and network timing breakdown.

### Conversations SDK — Critical Integration Points

1. **Client lifecycle:** Create with `new Client(token)`. Wait for `stateChanged` → `"initialized"`. Call `shutdown()` only on logout. SDK auto-reconnects on network drops.

2. **Subscription ordering:** Subscribe to `conversationAdded` BEFORE calling `getSubscribedConversations()` to avoid race conditions.

3. **Message loading:** Messages are NOT fetched on conversation load. Must call `getMessages()` explicitly. Only `messageAdded` fires for new messages in real-time.

4. **Typing indicators:** Call `conversation.typing()` on keydown (SDK throttles to 5s). Listen for `typingStarted`/`typingEnded`.

5. **Read receipts:** Not auto-set. Must call `advanceLastReadMessageIndex()` when user views messages. Listen for `participantUpdated` to show others' read status.

6. **Paginated data:** Conversations and messages are paginated. Handle paginator pattern consistently.

### Shared Wrapper Architecture Opportunities

- **Token provider hook/context** — shared token fetch, refresh, and update logic for both Voice and Conversations SDKs
- **Connection status hook** — unified online/offline/reconnecting indicator
- **Event subscription hook** — `useEvent(emitter, eventName, handler)` with automatic cleanup
- **Error boundary** — shared error code → user message mapping
- **Device permissions hook** — microphone/speaker permission state tracking (Voice needs mic; Conversations may need it for future voice features)
