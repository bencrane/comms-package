# Directive 01: Project Foundation & Internal Services

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** This is the first directive for `oex-comms-sdk`. Nothing exists yet — no `package.json`, no `src/` directory, no build config. This directive scaffolds the entire project foundation: package config, TypeScript config, build tooling, directory structure, and the two foundational internal services (API client and token manager). These services are the plumbing that every future hook, provider, and component will depend on. No hooks, no components, no React context, and no Twilio SDK integration are built here — just the skeleton and the internal services.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### OEX backend API contract (read the relevant sections)
- `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md` — exact request/response schemas for all 10 voice/SMS endpoints. Extract: the Auth Model section (Bearer token pattern), the `GET /api/voice/token` response shape (`VoiceTokenResponse`), and the TypeScript type definitions at the bottom of the file. The API client and token manager are built against this contract.

### SDK conventions (read in full)
- `CLAUDE.md` — architecture, project structure, key principles, all conventions. This is the authority on how the SDK is structured.

---

## Existing code to read before starting

Study these files to learn the SDK's conventions. Match them exactly.

### Package foundation
- `CLAUDE.md` — **critically important.** Conventions, architecture, project structure, key principles. The project structure diagram defines every directory and file. The "Key Conventions" section defines how the API client and error handling work. The "Package Identity" section defines the package name, entry points, and dependency strategy.

### API contract
- `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md` — **critically important for Build 3 and Build 4.** The TypeScript type definitions section at the bottom provides the exact interface shapes for `src/types/api.ts`. The Auth Model section defines how auth tokens are passed. The `GET /api/voice/token` endpoint defines the token response shape the token manager will consume.

---

## Design overview

### API client

The API client is a thin HTTP wrapper. It is initialized with `apiBaseUrl` and `authToken`. Every request attaches `Authorization: Bearer {authToken}`. It handles:

- `GET`, `POST`, `PUT`, `DELETE` methods
- Automatic retry on `429` (rate limited) and `503` (service unavailable) with exponential backoff
- Typed responses — no `any` anywhere
- Error normalization — HTTP errors are caught and transformed into the SDK's standard error shape: `{ code: number, message: string, recoverable: boolean }`

The client is a class, not a hook. It is instantiated by the provider (built in a future directive) and passed to services that need it.

### Token manager

The token manager handles the Twilio voice token lifecycle:

1. **Fetch** — calls `GET /api/voice/token` via the API client. Returns `{ token, identity, ttl_seconds }`.
2. **Schedule refresh** — after a successful fetch, schedules the next refresh at `ttl_seconds - buffer` (buffer = 60 seconds or 10% of TTL, whichever is smaller). Uses `setTimeout`, not polling.
3. **Refresh** — when the timer fires, fetches a new token. On success, emits a `tokenUpdated` event with the new token. On failure, retries up to 3 times with exponential backoff. If all retries fail, emits a `tokenError` event.
4. **Destroy** — clears the refresh timer. Called when the provider unmounts.

The token manager is a class. It takes an API client instance in its constructor. It exposes:

```typescript
class TokenManager {
  constructor(apiClient: ApiClient)
  fetchToken(): Promise<VoiceTokenResponse>
  startAutoRefresh(): void
  stopAutoRefresh(): void
  onTokenUpdated(callback: (token: string) => void): () => void
  onTokenError(callback: (error: OEXError) => void): () => void
  destroy(): void
}
```

The `onTokenUpdated` and `onTokenError` methods return unsubscribe functions.

### Event bus

A minimal typed pub/sub for internal coordination. Services emit events, other services or the provider subscribe. This avoids tight coupling between services.

```typescript
class EventBus {
  on<T>(event: string, callback: (data: T) => void): () => void
  emit<T>(event: string, data: T): void
  removeAllListeners(event?: string): void
}
```

The `on` method returns an unsubscribe function.

---

## Build 1: Package config and directory structure

**Files:**
- `package.json` (new)
- `tsconfig.json` (new)
- `vite.config.ts` (new)
- `.eslintrc.cjs` (new)
- `.prettierrc` (new)

### `package.json`

Create with:
- `name`: `@oex/comms-sdk`
- `version`: `0.1.0`
- `type`: `module`
- `main`: `dist/index.cjs`
- `module`: `dist/index.js`
- `types`: `dist/index.d.ts`
- `exports`: map `.` to `import`, `require`, and `types`
- `files`: `["dist"]`
- `peerDependencies`: `react` (>=18.0.0), `react-dom` (>=18.0.0)
- `dependencies`: `@twilio/voice-sdk` (latest stable)
- `devDependencies`: `typescript`, `vite`, `vitest`, `@testing-library/react`, `@testing-library/react-hooks`, `@types/react`, `@types/react-dom`, `react`, `react-dom`, `eslint`, `prettier`, `@vitejs/plugin-react`, `jsdom`
- `scripts`:
  - `dev`: `vite build --watch`
  - `build`: `vite build`
  - `test`: `vitest run`
  - `test:watch`: `vitest`
  - `lint`: `eslint src/ --ext .ts,.tsx && tsc --noEmit`
  - `format`: `prettier --write "src/**/*.{ts,tsx}"`

### `tsconfig.json`

Create with:
- `strict`: true
- `target`: `ES2020`
- `module`: `ESNext`
- `moduleResolution`: `bundler`
- `jsx`: `react-jsx`
- `declaration`: true
- `declarationDir`: `dist`
- `outDir`: `dist`
- `include`: `["src"]`
- `exclude`: `["node_modules", "dist", "tests"]`

### `vite.config.ts`

Library mode build config:
- Input: `src/index.ts`
- Output formats: `es` and `cjs`
- Externalize `react`, `react-dom`, and `react/jsx-runtime`
- Enable `dts` generation (use `vite-plugin-dts`)
- Filename: `index`

### `.eslintrc.cjs`

Minimal ESLint config for TypeScript. Extend `eslint:recommended` and `plugin:@typescript-eslint/recommended`. Set parser to `@typescript-eslint/parser`. Set `parserOptions.project` to `./tsconfig.json`.

### `.prettierrc`

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

After creating config files, create the directory structure:
- `src/providers/` (empty — future directive)
- `src/hooks/` (empty — future directive)
- `src/services/` (files created in Build 3 and 4)
- `src/components/` (empty — future directive)
- `src/types/` (files created in Build 2)
- `src/utils/` (files created in Build 5)
- `tests/services/` (files created in Build 6)

Create placeholder `src/index.ts` with a comment: `// Public API — exports added by future directives`

Run `pnpm install` after creating `package.json` to generate the lockfile and `node_modules`.

---

## Build 2: TypeScript types

**Files:**
- `src/types/index.ts` (new)
- `src/types/api.ts` (new)
- `src/types/events.ts` (new)

### `src/types/api.ts`

Copy the TypeScript type definitions **exactly** from the bottom of `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md`. These interfaces are:

- `VoiceTokenResponse`
- `VoiceSessionResponse`
- `DispositionRequest`
- `DispositionResponse`
- `CallActionRequest`
- `OutboundCallRequest`
- `OutboundCallResponse`
- `SendSmsRequest`
- `SendSmsResponse`
- `SmsMessageResponse`

Export all of them as named exports. Add `export type` prefix to each (they are pure type definitions).

Also add the valid disposition values as a const array and union type:

```typescript
export const DISPOSITION_VALUES = [
  'busy',
  'callback_scheduled',
  'disqualified',
  'do_not_call',
  'follow_up_needed',
  'gatekeeper',
  'left_voicemail',
  'meeting_booked',
  'no_answer',
  'not_interested',
  'other',
  'qualified',
  'wrong_number',
] as const

export type Disposition = (typeof DISPOSITION_VALUES)[number]
```

And the valid call action values:

```typescript
export const CALL_ACTION_VALUES = ['hangup', 'hold', 'redirect', 'unhold'] as const
export type CallAction = (typeof CALL_ACTION_VALUES)[number]
```

### `src/types/events.ts`

Define the internal event types the event bus will use:

```typescript
export interface TokenUpdatedEvent {
  token: string
  identity: string
  ttlSeconds: number
}

export interface TokenErrorEvent {
  code: number
  message: string
  recoverable: boolean
}

export type OEXEventMap = {
  'token:updated': TokenUpdatedEvent
  'token:error': TokenErrorEvent
}
```

### `src/types/index.ts`

Re-export everything from `api.ts` and `events.ts`:

```typescript
export * from './api'
export * from './events'
```

Also define and export the SDK's standard error shape:

```typescript
export interface OEXError {
  code: number
  message: string
  recoverable: boolean
}
```

---

## Build 3: API client

**File:** `src/services/api-client.ts` (new)

### `ApiClient` class

Constructor takes `{ apiBaseUrl: string, authToken: string }`.

Store both as private fields. Provide an `updateAuthToken(token: string)` method so the provider can update the token without reconstructing the client.

#### Methods

- `get<T>(path: string, params?: Record<string, string>): Promise<T>` — GET request with optional query params
- `post<T>(path: string, body?: unknown): Promise<T>` — POST request with JSON body
- `put<T>(path: string, body?: unknown): Promise<T>` — PUT request with JSON body
- `delete<T>(path: string): Promise<T>` — DELETE request

#### Internal `request` method

All public methods delegate to a private `request<T>(method, path, options?)` method that:

1. Constructs the full URL: `${apiBaseUrl}${path}`
2. Sets headers: `Authorization: Bearer ${authToken}`, `Content-Type: application/json`
3. Calls `fetch()`
4. On success (2xx): parses JSON and returns typed `T`
5. On 429 or 503: retries with exponential backoff (base 1s, max 3 retries, jitter). After max retries, throws.
6. On other errors: parses the error body (expects `{ detail: string }` from the OEX backend) and throws an `OEXError` with:
   - `code`: HTTP status code
   - `message`: the `detail` string from the response, or a fallback
   - `recoverable`: `true` for 429/503, `false` for 4xx

Use the browser `fetch` API. Do not add an axios or ky dependency.

---

## Build 4: Event bus and error utilities

**Files:**
- `src/services/event-bus.ts` (new)
- `src/utils/errors.ts` (new)
- `src/utils/constants.ts` (new)

### `src/services/event-bus.ts`

Generic typed event bus:

```typescript
class EventBus {
  private listeners: Map<string, Set<Function>>

  on<T>(event: string, callback: (data: T) => void): () => void
  emit<T>(event: string, data: T): void
  removeAllListeners(event?: string): void
}
```

- `on` adds a callback to the set for that event and returns an unsubscribe function that removes it.
- `emit` calls all callbacks registered for that event with the data.
- `removeAllListeners` clears either a specific event's listeners or all listeners.

### `src/utils/errors.ts`

Utility for creating `OEXError` objects and mapping HTTP status codes:

```typescript
export function createOEXError(code: number, message: string, recoverable?: boolean): OEXError

export function isRecoverableHttpStatus(status: number): boolean
// Returns true for 429 and 503
```

### `src/utils/constants.ts`

SDK-level constants:

```typescript
export const DEFAULT_TOKEN_REFRESH_BUFFER_SECONDS = 60
export const MAX_TOKEN_REFRESH_RETRIES = 3
export const RETRY_BASE_DELAY_MS = 1000
export const MAX_API_RETRIES = 3
```

---

## Build 5: Token manager

**File:** `src/services/token-manager.ts` (new)

### `TokenManager` class

Constructor takes `{ apiClient: ApiClient }`.

#### Token fetch

`fetchToken(): Promise<VoiceTokenResponse>` — calls `apiClient.get<VoiceTokenResponse>('/api/voice/token')`. Returns the response. Does not catch errors — callers handle errors.

#### Auto-refresh

`startAutoRefresh(): void` — fetches a token immediately, then schedules the next refresh. The refresh interval is `ttl_seconds - buffer`, where buffer is `Math.min(60, ttl_seconds * 0.1)`. Uses `setTimeout` (not `setInterval`) so each refresh schedules the next one only on success.

On successful refresh:
- Emit `token:updated` to all subscribers with `{ token, identity, ttlSeconds }`
- Schedule the next refresh

On failed refresh:
- Retry up to 3 times with exponential backoff (1s, 2s, 4s)
- If all retries fail, emit `token:error` to all subscribers with `{ code, message, recoverable: false }`
- Do not schedule the next refresh — the consumer must handle the error state

`stopAutoRefresh(): void` — clears the pending timeout. Does not emit events.

#### Event subscriptions

- `onTokenUpdated(callback: (event: TokenUpdatedEvent) => void): () => void` — subscribe to token updates. Returns unsubscribe function.
- `onTokenError(callback: (event: TokenErrorEvent) => void): () => void` — subscribe to token errors. Returns unsubscribe function.

Implement subscriptions using the `EventBus` from Build 4.

#### Cleanup

`destroy(): void` — calls `stopAutoRefresh()` and removes all event listeners.

---

## Build 6: Tests

**Files:**
- `tests/services/api-client.test.ts` (new)
- `tests/services/token-manager.test.ts` (new)
- `tests/services/event-bus.test.ts` (new)

### `vitest.config.ts` (or inline in `vite.config.ts`)

If not already configured, ensure vitest is configured with `jsdom` environment for React Testing Library compatibility.

### `tests/services/api-client.test.ts` — API client tests (10 tests)

Mock `global.fetch`. Test:

1. GET request sends correct URL, method, and Authorization header
2. POST request sends JSON body with correct Content-Type header
3. PUT request sends JSON body correctly
4. DELETE request sends correct method
5. Successful response returns parsed JSON typed correctly
6. 400 error returns OEXError with `recoverable: false` and `detail` message from response body
7. 404 error returns OEXError with `recoverable: false`
8. 429 error triggers retry (verify fetch is called more than once)
9. 503 error triggers retry with exponential backoff
10. `updateAuthToken` changes the token used in subsequent requests

### `tests/services/token-manager.test.ts` — Token manager tests (8 tests)

Mock the `ApiClient` class. Use `vi.useFakeTimers()` for timer control. Test:

1. `fetchToken` calls `apiClient.get` with `/api/voice/token`
2. `fetchToken` returns the `VoiceTokenResponse` from the API client
3. `startAutoRefresh` fetches a token immediately
4. `startAutoRefresh` schedules next refresh at `ttl_seconds - buffer`
5. `onTokenUpdated` callback fires with token data after successful refresh
6. Failed refresh retries up to 3 times
7. `onTokenError` callback fires after all retries exhausted
8. `destroy` clears timers and removes listeners

### `tests/services/event-bus.test.ts` — Event bus tests (5 tests)

1. `on` + `emit` delivers data to subscriber
2. Multiple subscribers all receive the event
3. Unsubscribe function prevents future deliveries
4. `removeAllListeners` for a specific event clears only that event
5. `removeAllListeners` with no args clears all events

Total: **23 tests**.

---

## Build 7: Index exports and build verification

**File:** `src/index.ts` (modify)

Update `src/index.ts` to export the public types:

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
} from './types'

export { DISPOSITION_VALUES, CALL_ACTION_VALUES } from './types'
```

**Do NOT export** `ApiClient`, `TokenManager`, or `EventBus` — these are internal services.

After all builds are complete, run:
1. `pnpm build` — verify it completes without errors
2. `pnpm test` — verify all 23 tests pass
3. `pnpm lint` — verify no lint errors

---

## Scope

### ALLOWED_FILES

Files to create:
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `.eslintrc.cjs`
- `.prettierrc`
- `src/index.ts`
- `src/types/index.ts`
- `src/types/api.ts`
- `src/types/events.ts`
- `src/services/api-client.ts`
- `src/services/token-manager.ts`
- `src/services/event-bus.ts`
- `src/utils/errors.ts`
- `src/utils/constants.ts`
- `tests/services/api-client.test.ts`
- `tests/services/token-manager.test.ts`
- `tests/services/event-bus.test.ts`

Files that must NOT be modified:
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: scaffold project foundation with API client, token manager, and types (directive 01)`

---

## Build order

1. **Build 1**: Package config + directory structure → `package.json`, `tsconfig.json`, `vite.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `src/index.ts`
2. **Build 2**: Types → `src/types/api.ts`, `src/types/events.ts`, `src/types/index.ts`
3. **Build 3**: API client → `src/services/api-client.ts`
4. **Build 4**: Event bus + utils → `src/services/event-bus.ts`, `src/utils/errors.ts`, `src/utils/constants.ts`
5. **Build 5**: Token manager → `src/services/token-manager.ts`
6. **Build 6**: Tests → all test files
7. **Build 7**: Index exports + build verification → `src/index.ts`

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `package.json` has `@oex/comms-sdk` as the package name with `react` and `react-dom` as peer dependencies and `@twilio/voice-sdk` as a regular dependency.
(c) Confirm `tsconfig.json` has `strict: true`.
(d) Confirm `vite.config.ts` builds in library mode with `src/index.ts` as entry, outputting ES and CJS formats, externalizing React.
(e) Confirm all TypeScript types in `src/types/api.ts` match the contract at `api-reference-docs-new/oex/00-general/frontend-voice-sms-api-contract.md` exactly.
(f) Confirm `ApiClient` uses `fetch`, handles retries on 429/503 with exponential backoff, and normalizes errors to `OEXError`.
(g) Confirm `TokenManager` auto-refreshes tokens at `ttl_seconds - buffer`, retries up to 3 times on failure, and emits `token:updated` / `token:error` events.
(h) Confirm `EventBus` supports typed pub/sub with unsubscribe functions.
(i) Confirm `src/index.ts` exports only types and constants — no service classes are exported.
(j) Confirm `pnpm build` succeeds.
(k) Confirm `pnpm test` passes with 23 tests.
(l) Confirm no files outside ALLOWED_FILES were modified.
(m) Confirm `CLAUDE.md`, `docs/`, and `api-reference-docs-new/` were NOT modified.
