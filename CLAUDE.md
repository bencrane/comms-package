# CLAUDE.md — OEX Comms SDK

## What This Is

Standalone React/TypeScript SDK package that gives any OEX-powered frontend browser-based voice calling and messaging capabilities. Wraps Twilio's Voice JavaScript SDK and Conversations SDK behind a clean, provider-agnostic React interface. The consuming frontend never interacts with Twilio directly — it imports hooks and components from this package, points them at an OEX backend URL, and gets calling + messaging UI out of the box.

This is the frontend counterpart to `outbound-engine-x-api` (OEX). OEX provides the backend APIs (voice tokens, call management, disposition, SMS, conversation threads). This SDK consumes those APIs and wraps the Twilio browser SDKs into React hooks and components.

Any product built on OEX — StaffingEdge, Outbound Solutions, FleetSignal, or future verticals — imports this package to get comms capabilities without building their own Twilio integration.

## Stack

- **Language**: TypeScript (strict mode)
- **Framework**: React 18+
- **Build**: Vite (library mode) or tsup for package bundling
- **Package manager**: pnpm
- **Testing**: Vitest + React Testing Library
- **Linting**: ESLint + Prettier
- **Twilio dependencies**: `@twilio/voice-sdk` (voice calling), `@twilio/conversations` (messaging — future)

## Package Identity

- **Package name**: `@oex/comms-sdk`
- **Entry points**: Named exports (no default export)
- **Peer dependencies**: `react` (>=18.0.0), `react-dom` (>=18.0.0)
- **Twilio SDKs are regular dependencies** — bundled with the package, not peer deps. Consuming apps don't need to install Twilio directly.

## Architecture

### Provider / Hook / Component layers

```
┌─────────────────────────────────────┐
│  Components (optional UI)           │  ← Ready-made UI (Dialer, CallBar, etc.)
├─────────────────────────────────────┤
│  Hooks (core interface)             │  ← useVoice, useMessaging, useDevice, etc.
├─────────────────────────────────────┤
│  Context Providers                  │  ← OEXCommsProvider wraps the app
├─────────────────────────────────────┤
│  Services (internal)                │  ← API client, token manager, event bus
├─────────────────────────────────────┤
│  Twilio SDKs (internal)             │  ← @twilio/voice-sdk, @twilio/conversations
└─────────────────────────────────────┘
```

- **Services** are internal — not exported. They handle OEX API calls, Twilio SDK initialization, and token lifecycle.
- **Hooks** are the primary public interface. Every feature is a hook.
- **Components** are optional — consuming apps can use hooks directly and build their own UI, or use the provided components for a quick start.
- **Context Providers** hold shared state (Twilio Device, connection status, auth token).

### What the consuming app does

```tsx
import { OEXCommsProvider, useVoice } from '@oex/comms-sdk'

function App() {
  return (
    <OEXCommsProvider
      apiBaseUrl="https://api.oex.com"
      authToken={userJwt}
    >
      <MyApp />
    </OEXCommsProvider>
  )
}

function PhoneButton({ number }: { number: string }) {
  const { connect, call, disconnect, deviceReady } = useVoice()

  if (!deviceReady) return <span>Initializing...</span>

  return call
    ? <button onClick={disconnect}>Hang Up</button>
    : <button onClick={() => connect(number)}>Call</button>
}
```

### What happens under the hood

1. `OEXCommsProvider` mounts → internal token service calls `GET /api/voice/token` on the OEX backend
2. Token service initializes `new Twilio.Device(token)` with the returned JWT
3. Token service listens for `tokenWillExpire` → auto-fetches a fresh token → calls `device.updateToken()`
4. `useVoice()` exposes the Device and Call state via React hooks
5. `connect(number)` calls `device.connect({ params: { To: number } })` → Twilio hits the TwiML App → OEX returns TwiML → call bridges
6. Call state changes (ringing, connected, ended) flow through events → hook state updates → UI re-renders
7. On call end, the SDK exposes disposition capture via `setDisposition()`

## Project Structure

```
oex-comms-sdk/
├── CLAUDE.md                    ← You are here
├── package.json
├── tsconfig.json
├── vite.config.ts               ← Library mode build config
├── .eslintrc.cjs
├── .prettierrc
├── api-reference-docs-new/      ← Reference documentation (read-only)
│   ├── oex/
│   │   └── 00-general/
│   │       └── frontend-voice-sms-api-contract.md  ← OEX backend API contract
│   └── twilio/
│       ├── voice/
│       │   ├── 43-client-sdks-general/
│       │   └── 45-voice-javascript-sdk/   ← Primary Voice JS SDK reference
│       └── messaging/
│           └── 15-conversations/           ← Conversations SDK reference
├── docs/
│   ├── SDK_REFERENCE_ASSESSMENT.md         ← Assessment of Twilio SDK docs
│   ├── ARCHITECTURE.md                     ← SDK architecture decisions
│   ├── WRITING_EXECUTOR_DIRECTIVES.md      ← Directive authoring guide
│   └── DIRECTIVE_*.md                      ← Executor directives (numbered)
├── src/
│   ├── index.ts                 ← Package entry point — public exports only
│   ├── providers/               ← React context providers
│   │   └── OEXCommsProvider.tsx
│   ├── hooks/                   ← Public hooks (primary interface)
│   │   ├── useVoice.ts
│   │   ├── useDevice.ts
│   │   ├── useAudioDevices.ts
│   │   ├── useCallQuality.ts
│   │   └── usePreflight.ts
│   ├── services/                ← Internal services (not exported)
│   │   ├── api-client.ts        ← OEX backend HTTP client
│   │   ├── token-manager.ts     ← Token fetch, refresh, lifecycle
│   │   └── event-bus.ts         ← Internal event coordination
│   ├── components/              ← Optional pre-built UI components
│   │   ├── Dialer.tsx
│   │   ├── CallBar.tsx
│   │   └── AudioDeviceSelector.tsx
│   ├── types/                   ← TypeScript type definitions
│   │   ├── index.ts
│   │   ├── voice.ts
│   │   ├── api.ts               ← Types matching OEX backend API contract
│   │   └── events.ts
│   └── utils/                   ← Shared utilities
│       ├── errors.ts            ← Error code mapping, user-friendly messages
│       └── constants.ts         ← Disposition values, call states, etc.
├── tests/
│   ├── hooks/
│   ├── services/
│   └── components/
└── examples/                    ← Usage examples (not part of the package build)
    └── basic-dialer/
```

## Key Principles

### Never Expose Twilio

The public API is provider-agnostic. No Twilio types, classes, or constants are exported from `src/index.ts`. If a consuming app needs to `import` anything from `@twilio/voice-sdk` to use this package, that's a bug. Twilio is an implementation detail — if the underlying provider changed, the public interface would stay the same.

### Never Crash the Host App

All Twilio SDK interactions are wrapped in try/catch. WebRTC is fragile — network drops, browser permission changes, audio device disconnections, ICE failures. The SDK absorbs these and surfaces them as error states, never as uncaught exceptions that crash the consuming app's React tree.

### Never Swallow Errors Silently

Every error is either handled (token refresh on expiry), surfaced to the consumer (via the `error` field on hooks), or logged. There is no code path where an error is caught and ignored. If a token refresh fails after retries, the consumer sees it. If a WebRTC connection drops, the consumer sees it. Silent failure is worse than visible failure.

### Token Refresh Is Invisible

The consumer never thinks about tokens. `OEXCommsProvider` handles the full lifecycle — initial fetch, proactive refresh before expiry, retry on failure. If refresh ultimately fails (backend down, credentials revoked), the error surfaces. But under normal operation, the consumer's code never touches a token.

### Hooks Never Throw

Every hook returns an `error` field: `{ code: number, message: string, recoverable: boolean } | null`. The consumer checks `error` in their render logic. No hook ever throws an exception — not on initialization, not on API failure, not on Twilio SDK errors.

### Verify Browser Capabilities Before Rendering

Check `Device.isSupported` before rendering any calling UI. Check `AudioHelper.isOutputSelectionSupported` before rendering speaker selection (not supported in Firefox/Safari). Don't render features the browser can't support — show a clear message instead.

### The API Contract Is the Source of Truth

`api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md` defines the exact request/response shapes for every OEX backend endpoint. The types in `src/types/api.ts` must match this contract exactly. If the backend changes an endpoint, the contract doc is updated first, then the SDK types are updated to match.

### Test Against Mocks, Never Real Connections

All tests mock the Twilio SDK classes and the OEX API client. No test makes a real WebRTC connection or hits a real backend. Tests validate behavior (state transitions, error handling, token refresh logic) against controlled mock responses.

### One Export File, One Public API

`src/index.ts` is the complete public API. If it's not exported there, it doesn't exist to consumers. Adding a new public hook or component requires adding it to `src/index.ts`. Internal services, utilities, and Twilio SDK wrappers are never exported.

## Key Conventions

### Exports

- Everything exported from `src/index.ts` is public API.
- Hooks, providers, components, and types are exported.
- Services and utils are internal — never exported.
- No default exports anywhere. Named exports only.

### Hooks

- Every hook starts with `use`.
- Hooks return plain objects (not arrays). `const { call, connect, disconnect } = useVoice()`.
- Hooks do not throw. They expose `error` state for the consumer to handle.
- Hooks are idempotent — calling them multiple times in different components returns the same shared state from context.

### State Management

- All shared state lives in React context via `OEXCommsProvider`.
- No external state management library (no Redux, no Zustand).
- Internal state updates use `useReducer` for complex state (call lifecycle, device state).
- Components re-render only when their specific slice of state changes.

### Error Handling

- Twilio error codes (20xxx, 31xxx, 53xxx) are mapped to user-friendly messages in `utils/errors.ts`.
- Token errors (20xxx) trigger automatic refresh — never surfaced to the consumer unless refresh fails.
- Media errors (31008 — mic denied) are surfaced with actionable messages.
- Network errors trigger reconnection UI state, not error states.
- The `error` field on hooks is always `{ code: number, message: string, recoverable: boolean } | null`.

### API Client

- All OEX backend calls go through `services/api-client.ts`.
- The client is initialized with `apiBaseUrl` and `authToken` from the provider.
- Auth token is passed as `Authorization: Bearer {token}` header.
- The client handles retries on 429/503 with exponential backoff.
- All responses are typed — no `any`.

### Testing

- Unit tests for hooks use React Testing Library's `renderHook`.
- Twilio SDK classes are mocked — tests never make real WebRTC connections.
- OEX API calls are mocked — tests never hit a real backend.
- Test files mirror source structure: `tests/hooks/useVoice.test.ts` tests `src/hooks/useVoice.ts`.

### Browser Compatibility

- Check `Device.isSupported` before rendering any calling UI.
- Speaker selection (`AudioHelper.isOutputSelectionSupported`) only works in Chrome/Edge/Opera — guard UI accordingly.
- CSP requirements: `script-src blob:`, `connect-src *.twilio.com wss://*.twilio.com`, `media-src mediastream:`.

## OEX Backend Endpoints This SDK Consumes

These endpoints are built and deployed in `outbound-engine-x-api`. Full contract with exact request/response schemas is at `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/voice/token` | GET | Mint a Twilio access token (JWT) |
| `/api/voice/sessions/{call_sid}/disposition` | POST | Submit call disposition |
| `/api/voice/sessions/{call_sid}/action` | POST | Call actions (hangup, hold, redirect) |
| `/api/voice/sessions` | GET | List voice sessions (call history) |
| `/api/voice/sessions/{call_sid}` | GET | Get single voice session |
| `/api/outbound-calls` | POST | Initiate server-side outbound call |
| `/api/outbound-calls/{call_sid}` | GET | Get outbound call status |
| `/api/sms` | POST | Send SMS |
| `/api/sms/{message_sid}` | GET | Get message status |
| `/api/sms` | GET | List messages |

## Build & Publish

```bash
pnpm install          # Install dependencies
pnpm dev              # Development mode with hot reload
pnpm build            # Production build (library mode)
pnpm test             # Run tests
pnpm lint             # Lint + type check
pnpm publish          # Publish to npm (when ready)
```

## What This Package Does NOT Do

- Does not manage Twilio accounts, phone numbers, or Trust Hub registrations — that's OEX backend.
- Does not handle campaign orchestration or lead management — that's OEX backend.
- Does not store any data persistently — all state is in-memory React state.
- Does not make direct Twilio REST API calls — all Twilio interaction is through the browser SDKs (WebRTC) or via OEX backend endpoints.
- Does not handle authentication — it receives an auth token from the consuming app.
