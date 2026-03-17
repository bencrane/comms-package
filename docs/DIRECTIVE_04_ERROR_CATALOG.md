# Directive 04: Error Catalog and Enriched Error Handling

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering decisions within the scope defined below. What you must not do is drift outside this scope, publish the package, or take actions not covered by this directive. Within scope, use your best judgment.

**Background:** Directives 01–03 built the full voice hook surface. Every hook exposes an `error` field of type `OEXError` (`{ code, message, recoverable }`). Currently, errors from the Twilio SDK are mapped generically — `createOEXError(error.code, error.message)` passes Twilio's raw message through. This directive adds a curated error catalog that maps all Twilio Voice SDK error codes to user-friendly messages with recovery guidance, extends `OEXError` with optional `userMessage` and `action` fields, and updates the provider to use the catalog when mapping Twilio errors. This is pure logic — no components, no new hooks, no design.

**New agent. Do not assume any context from prior agents.**

---

## Reference material

### Twilio error codes (study in full)
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/08-errors.md` — Complete error reference. Study every error code, category, and the Common Error Scenarios section. The `TwilioError` class has `causes: string[]` and `solutions: string[]` — the catalog should capture the best solution for each code as the `action` field.

### SDK conventions (read in full)
- `CLAUDE.md` — key principle: "Never Swallow Errors Silently." Every error is surfaced. Also: error codes 20xxx trigger token refresh (already handled by the provider), media errors (31008) are surfaced with actionable messages.

### Existing code (study before modifying)
- `src/utils/errors.ts` — current implementation. Has `createOEXError(code, message, recoverable?)` and `isRecoverableHttpStatus(status)`. This file is extended in this directive.
- `src/types/index.ts` — defines `OEXError` as `{ code, message, recoverable }`. This directive extends it.
- `src/providers/OEXCommsProvider.tsx` — every place `createOEXError` is called in this file needs to be updated to use the catalog. Search for all `createOEXError` call sites in this file. There are approximately 10 call sites in the provider.
- `src/hooks/useAudioDevices.ts`, `src/hooks/usePreflight.ts` — also call `createOEXError` with Twilio error codes. These should also benefit from the catalog.

---

## Design overview

### Extended OEXError

Add two optional fields to `OEXError`:

```typescript
export interface OEXError {
  code: number
  message: string
  recoverable: boolean
  /** User-facing message safe to display in UI */
  userMessage?: string
  /** Recovery action the consumer can present or take */
  action?: string
}
```

These fields are optional so existing code that constructs `OEXError` objects without them continues to work. The catalog populates them; SDK-internal errors (like "Device is not registered") don't need them.

### Error catalog structure

The catalog is a `Map<number, ErrorCatalogEntry>` keyed by Twilio error code:

```typescript
interface ErrorCatalogEntry {
  message: string
  userMessage: string
  action: string
  recoverable: boolean
}
```

### How errors flow through the catalog

1. Twilio emits an error event with `{ code, message }`.
2. The provider (or hook) calls `createTwilioOEXError(code, fallbackMessage)`.
3. `createTwilioOEXError` looks up the code in the catalog:
   - **Found:** returns `OEXError` with catalog's `message`, `userMessage`, `action`, and `recoverable`.
   - **Not found:** returns `OEXError` with the fallback message, no `userMessage`/`action`, and `recoverable: false`.

This is a separate function from `createOEXError` — the existing function is kept for SDK-internal errors (not Twilio errors). The new function is specifically for mapping Twilio error codes.

---

## Build 1: Extend OEXError type

**File:** `src/types/index.ts` (modify)

Add the optional `userMessage` and `action` fields to `OEXError`:

```typescript
export interface OEXError {
  code: number
  message: string
  recoverable: boolean
  /** User-facing message safe to display in UI */
  userMessage?: string
  /** Recovery action the consumer can present or take */
  action?: string
}
```

---

## Build 2: Error catalog and mapping function

**File:** `src/utils/errors.ts` (modify)

Keep the existing `createOEXError` and `isRecoverableHttpStatus` functions unchanged.

### Add the catalog

Add a `ErrorCatalogEntry` interface and the catalog `Map`:

```typescript
interface ErrorCatalogEntry {
  message: string
  userMessage: string
  action: string
  recoverable: boolean
}

const ERROR_CATALOG = new Map<number, ErrorCatalogEntry>()
```

Populate the catalog with all Twilio Voice SDK error codes. Group entries by category using comments. Here is the complete catalog:

**Authorization Errors (20xxx):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 20101 | Invalid JWT token | Your session could not be verified. Please sign in again. | Re-authenticate and fetch a new token. | true |
| 20102 | JWT token expired | Your session has expired. Reconnecting... | Token refresh is automatic. If this persists, sign in again. | true |
| 20103 | Authentication failed | Authentication failed. Please sign in again. | Re-authenticate with valid credentials. | false |
| 20104 | Invalid access token | Your session could not be verified. Please sign in again. | Re-authenticate and fetch a new token. | true |
| 20151 | Token expiration time exceeds maximum allowed | Your session could not be established. Please try again. | Contact support — the token configuration needs adjustment. | false |
| 20157 | JWT token expired | Your session has expired. Reconnecting... | Token refresh is automatic. If this persists, sign in again. | true |

**General Errors (31000, 31006, 31007):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 31000 | Unknown error | Something went wrong. Please try again. | Retry the operation. If this persists, refresh the page. | true |
| 31006 | Connection error | Unable to connect. Check your internet connection. | Verify network connectivity. Try refreshing the page. | true |
| 31007 | Call cancelled | The call was cancelled. | No action needed — the call ended normally. | false |

**Client Errors (31001–31009):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 31001 | Bad request | The call could not be placed. Please try again. | Retry the call. If this persists, contact support. | false |
| 31002 | Resource not found | The number or endpoint could not be reached. | Verify the phone number and try again. | false |
| 31003 | Access forbidden | You don't have permission to make this call. | Contact your administrator to verify your calling permissions. | false |
| 31005 | Unexpected signaling error | Connection interrupted. Retrying... | Check your internet connection. Try refreshing the page. | true |
| 31008 | User denied microphone access | Microphone access is required for calls. Please allow microphone access in your browser settings. | Open browser settings and grant microphone permission for this site. | false |
| 31009 | Device registration failed | Could not connect to the calling service. Please try again. | Refresh the page. If this persists, check your network. | true |

**Malformed Request Errors (311xx):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 31100 | Malformed request | The call could not be placed due to a configuration error. | Contact support — the request format needs correction. | false |

**Media Errors (312xx):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 31201 | Media connection failed | Call audio could not be established. Check your internet connection. | Check network connectivity. Disable VPN if active. Try a different network. | true |
| 31202 | Media connection failed | Call audio could not be established. Check your internet connection. | Check network connectivity. Ensure WebRTC is not blocked by firewall. | true |
| 31203 | Low bytes received — possible audio quality issue | Call quality is degraded — you may not hear the other party. | Check your internet connection speed. Move closer to your router. | true |
| 31204 | Low bytes sent — possible audio quality issue | Call quality is degraded — the other party may not hear you. | Check your internet connection speed. Check your microphone. | true |
| 31205 | ICE gathering failed | Could not establish a connection for the call. | Check that your firewall allows WebRTC traffic. Try a different network. | true |
| 31206 | ICE connection failed | Call connection was lost. | Check your internet connection. Try refreshing and calling again. | true |
| 31207 | No supported audio codec | Your browser does not support the required audio format. | Try using Chrome or Edge for the best calling experience. | false |

**Signaling Errors (313xx):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 31301 | Signaling connection disconnected | Connection to the calling service was lost. Reconnecting... | Automatic reconnection is in progress. Check your internet if it persists. | true |
| 31302 | Signaling connection error | Connection to the calling service failed. | Check your internet connection. Try refreshing the page. | true |
| 31303 | Signaling connection timeout | Connection to the calling service timed out. | Check your internet connection and firewall settings. | true |

**Signature Validation Errors (314xx):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 31401 | Invalid signature | Your session could not be verified. Please sign in again. | Re-authenticate — the token signature is invalid. | false |
| 31402 | Access token signature invalid | Your session could not be verified. Please sign in again. | Re-authenticate — the token signature is invalid. | false |

**SIP Errors (315xx):**

| Code | message | userMessage | action | recoverable |
|------|---------|-------------|--------|-------------|
| 31501 | SIP server error | The call service encountered an error. Please try again. | Retry the call. If this persists, contact support. | true |
| 31502 | SIP bad request | The call could not be placed due to a configuration error. | Contact support — the SIP request format needs correction. | false |
| 31503 | SIP service unavailable | The call service is temporarily unavailable. Please try again shortly. | Wait a moment and retry the call. | true |
| 31504 | SIP timeout | The call could not be connected — the other party did not respond. | Try calling again. The number may be unreachable. | true |
| 31505 | SIP busy everywhere | The line is busy. | Try calling again later. | false |
| 31506 | SIP call declined | The call was declined. | The other party declined the call. Try again later. | false |
| 31507 | SIP not acceptable | The call could not be completed due to a compatibility issue. | Contact support — there may be a codec or format mismatch. | false |

### Add the mapping function

```typescript
export function createTwilioOEXError(code: number, fallbackMessage?: string): OEXError {
  const entry = ERROR_CATALOG.get(code)
  if (entry) {
    return {
      code,
      message: entry.message,
      recoverable: entry.recoverable,
      userMessage: entry.userMessage,
      action: entry.action,
    }
  }
  return {
    code,
    message: fallbackMessage ?? `Unknown error (code ${code})`,
    recoverable: false,
  }
}
```

### Add a lookup function for consumers

Also export a function that lets consuming apps look up error guidance:

```typescript
export function getErrorInfo(code: number): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG.get(code)
}
```

Export `ErrorCatalogEntry` as a type from this file, and add it to `src/index.ts` exports (Build 4).

---

## Build 3: Update provider and hooks to use the catalog

**File:** `src/providers/OEXCommsProvider.tsx` (modify)

Import `createTwilioOEXError` from `../utils/errors`.

Replace all `createOEXError` calls that handle Twilio SDK errors (where the error code comes from a Twilio event) with `createTwilioOEXError`. **Do NOT replace** calls that use SDK-internal codes (like `createOEXError(0, 'Device is not registered', false)`) — those are not Twilio errors and should keep using `createOEXError`.

Specifically, replace these patterns:

```typescript
// BEFORE: Device error handler
createOEXError(error.code ?? 0, error.message ?? 'Device error')

// AFTER:
error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Device error')
```

```typescript
// BEFORE: Call error handler
createOEXError(error.code ?? 0, error.message ?? 'Call error')

// AFTER:
error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Call error')
```

```typescript
// BEFORE: Token refresh error
createOEXError(error.code ?? 0, error.message ?? 'Token refresh failed')

// AFTER:
error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Token refresh failed')
```

```typescript
// BEFORE: Registration error
createOEXError(error.code ?? 0, error.message ?? 'Device registration failed')

// AFTER:
error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Device registration failed')
```

```typescript
// BEFORE: Connect error
createOEXError(error.code ?? 0, error.message ?? 'Failed to connect call')

// AFTER:
error.code ? createTwilioOEXError(error.code, error.message) : createOEXError(0, error.message ?? 'Failed to connect call')
```

Leave all calls with code `0` (SDK-internal errors) unchanged:
- `createOEXError(0, 'Browser does not support WebRTC voice calling', false)` — keep as-is
- `createOEXError(0, 'Device is not registered', false)` — keep as-is
- `createOEXError(0, 'Already on a call', false)` — keep as-is

**Files:** `src/hooks/useAudioDevices.ts`, `src/hooks/usePreflight.ts` (modify)

Apply the same pattern: where the error code comes from a Twilio error (e.g., `e.code ?? 0` in catch blocks after Twilio SDK calls), use:

```typescript
e.code ? createTwilioOEXError(e.code, e.message) : createOEXError(0, e.message ?? 'Fallback message')
```

Leave SDK-internal errors (code `0`, like "Device not available", "Output device selection is not supported") unchanged.

---

## Build 4: Index exports

**File:** `src/index.ts` (modify)

Add the new exports. Append to the existing exports — do NOT remove anything:

```typescript
export type { ErrorCatalogEntry } from './utils/errors'
export { createTwilioOEXError, getErrorInfo } from './utils/errors'
```

These are public — consuming apps may want to look up error details by code or use the catalog for custom error UI.

---

## Build 5: Tests

**Files:**
- `tests/utils/errors.test.ts` (new)

### `tests/utils/errors.test.ts` — Error catalog tests (15 tests)

1. `createTwilioOEXError` returns catalog entry for known code 20101
2. `createTwilioOEXError` returns catalog entry for known code 31008
3. `createTwilioOEXError` returns catalog entry for known code 31201
4. `createTwilioOEXError` returns catalog entry for known code 31301
5. `createTwilioOEXError` returns catalog entry for known code 31505
6. `createTwilioOEXError` returns `userMessage` and `action` fields for known codes
7. `createTwilioOEXError` returns fallback for unknown code with no catalog entry
8. `createTwilioOEXError` uses fallbackMessage when code is not in catalog
9. `createTwilioOEXError` returns `recoverable: true` for 20102 (token expired)
10. `createTwilioOEXError` returns `recoverable: false` for 31008 (mic denied)
11. `createTwilioOEXError` returns `recoverable: true` for 31201 (media connection failed)
12. `getErrorInfo` returns entry for known code
13. `getErrorInfo` returns undefined for unknown code
14. `createOEXError` still works unchanged (backward compat)
15. `isRecoverableHttpStatus` still works unchanged (backward compat)

Total: **15 new tests**. Combined with 80 existing = **95 total**.

---

## Scope

### ALLOWED_FILES

Files to create:
- `tests/utils/errors.test.ts`

Files to modify:
- `src/types/index.ts` — add `userMessage?` and `action?` to `OEXError`
- `src/utils/errors.ts` — add error catalog, `createTwilioOEXError`, `getErrorInfo`, `ErrorCatalogEntry`
- `src/providers/OEXCommsProvider.tsx` — replace Twilio error mapping calls with `createTwilioOEXError`
- `src/hooks/useAudioDevices.ts` — replace Twilio error mapping calls with `createTwilioOEXError`
- `src/hooks/usePreflight.ts` — replace Twilio error mapping calls with `createTwilioOEXError`
- `src/index.ts` — add new exports

Files that must NOT be modified:
- `src/services/api-client.ts`
- `src/services/token-manager.ts`
- `src/services/event-bus.ts`
- `src/types/api.ts`
- `src/types/events.ts`
- `src/types/voice.ts`
- `src/utils/constants.ts`
- `src/hooks/useVoice.ts`
- `src/hooks/useDevice.ts`
- `src/hooks/useCallQuality.ts`
- `src/hooks/useDisposition.ts`
- `src/hooks/useCallActions.ts`
- `CLAUDE.md`
- `docs/` (entire directory)
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above

**One commit. Do not push.**

Commit message: `feat: add Twilio error catalog with user-friendly messages and recovery guidance (directive 04)`

---

## Build order

1. **Build 1**: Extend OEXError type → `src/types/index.ts`
2. **Build 2**: Error catalog and mapping function → `src/utils/errors.ts`
3. **Build 3**: Update provider and hooks → `src/providers/OEXCommsProvider.tsx`, `src/hooks/useAudioDevices.ts`, `src/hooks/usePreflight.ts`
4. **Build 4**: Index exports → `src/index.ts`
5. **Build 5**: Tests → `tests/utils/errors.test.ts`

---

## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm `OEXError` now has optional `userMessage` and `action` fields.
(c) Confirm the error catalog covers all error codes from `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/08-errors.md`: 20101, 20102, 20103, 20104, 20151, 20157, 31000, 31001, 31002, 31003, 31005, 31006, 31007, 31008, 31009, 31100, 31201, 31202, 31203, 31204, 31205, 31206, 31207, 31301, 31302, 31303, 31401, 31402, 31501, 31502, 31503, 31504, 31505, 31506, 31507.
(d) Confirm `createTwilioOEXError` returns catalog entry for known codes and fallback for unknown codes.
(e) Confirm `getErrorInfo` returns the catalog entry or undefined.
(f) Confirm the provider's Twilio error handlers now use `createTwilioOEXError` instead of `createOEXError` for Twilio errors.
(g) Confirm SDK-internal errors (code 0) still use `createOEXError` and are unchanged.
(h) Confirm `src/index.ts` exports `ErrorCatalogEntry` (type), `createTwilioOEXError`, and `getErrorInfo`.
(i) Confirm `createOEXError` and `isRecoverableHttpStatus` are unchanged (backward compat).
(j) Confirm `pnpm build` succeeds.
(k) Confirm `pnpm test` passes with 95 tests (80 existing + 15 new).
(l) Confirm no files outside ALLOWED_FILES were modified.
(m) Confirm protected files were NOT modified.
