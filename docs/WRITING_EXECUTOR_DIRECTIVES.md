# Writing Executor Directives

This is the canonical reference for how to produce directives that are handed to executor agents. The Chief Agent (or a human architect) writes the directive; a separate, stateless executor agent implements it. The executor has no prior context — the directive is its only input.

---

## What a Directive Is

A directive is a scoped implementation prompt written as a `.md` file. It tells an executor agent exactly what to build, what to read, what to touch, and how to report back. The executor is competent but context-blind — it sees `CLAUDE.md`, the directive file, and the codebase. Nothing else.

Directives live at `docs/DIRECTIVE_{NN}_{SLUG}.md`. Number them sequentially starting from 01. The slug should be 2–4 words in UPPER_SNAKE_CASE.

---

## Document Structure

Every directive follows this section order. Sections may be omitted if genuinely irrelevant, but the order must not change.

```
1. Title + header block
2. Reference material
3. Existing code to read before starting
4. Design overview (optional — only for non-trivial work)
5. Builds (numbered, sequential)
6. Tests (may be its own build or a subsection of each build)
7. Scope (ALLOWED_FILES, DO NOT MODIFY list)
8. Build order summary (optional — useful when builds > 3)
9. When done (completion report checklist)
```

---

## 1. Title + Header Block

The header block is 4 items, always in this order:

```markdown
# Directive {N}: {Title}

**Context:** You are working on `oex-comms-sdk`. Read `CLAUDE.md` before starting.

**Scope clarification on autonomy:** You are expected to make strong engineering
decisions within the scope defined below. What you must not do is drift outside
this scope, publish the package, or take actions not covered by this directive.
Within scope, use your best judgment.

**Background:** {1–3 paragraphs. What already exists. What this directive adds.
Why it matters. Enough context that a fresh agent can understand the motivation
without reading prior directives.}

**New agent. Do not assume any context from prior agents.**
```

### Header rules

- **Context line** is always identical. It anchors the agent to the right repo and its conventions.
- **Scope clarification** is always identical. It grants local autonomy and denies global drift.
- **Background** is the most important paragraph. Assume the reader has zero prior directive context. Name the directives that created relevant infrastructure ("Directive 01 built the provider context and token manager…") and describe what they produced — the executor cannot read prior directive files to figure this out.
- **"New agent" sentinel** tells the executor to treat the directive as self-contained.

---

## 2. Reference Material

Point the executor to documents that provide domain context or API details. Split into tiers:

```markdown
## Reference material

### SDK reference (read this first)
- `docs/SDK_REFERENCE_ASSESSMENT.md` — {what it covers, why it matters}

### Twilio Voice JS SDK docs (consult for implementation details)
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/01-device-class.md` — {what to extract}
- `api-reference-docs-new/twilio/voice/45-voice-javascript-sdk/02-call-class.md` — {what to extract}
```

### Reference rules

- **Tier the references.** Assessment/synthesis docs first (read in full), raw SDK references last (consult as needed).
- **Say what each file contains and what the executor should extract from it.** Don't just list files.
- **Call out known gaps.** If the reference corpus is incomplete, say so explicitly.
- **Include line number hints** when the file is long and only one section matters.

---

## 3. Existing Code to Read Before Starting

This section is the most critical for quality. The executor must understand the patterns before writing code. Group by domain:

```markdown
## Existing code to read before starting

Study these files to learn the SDK's conventions. Match them exactly.

### Package foundation
- `CLAUDE.md` — conventions, architecture, project structure
- `package.json` — dependencies, peer deps, build scripts
- `tsconfig.json` — TypeScript configuration, strict mode settings
- `src/index.ts` — public exports (only what's in this file is part of the public API)

### {Domain-specific group} (study for patterns)
- `src/services/token-manager.ts` — **critically important.** {What to study and why.}
```

### Code-to-read rules

- **"Study these files to learn the SDK's conventions. Match them exactly."** — this sentence is required.
- **Mark the most important file with "critically important."**
- **Name specific functions, types, and patterns.**
- **Distinguish "study" from "modify" and "do not modify."**
- **Group by domain**, not by file type.
- **Include import paths** where non-obvious.
- **Package foundation group** is boilerplate — include it in every directive.

---

## 4. Design Overview

Include this section when the directive involves non-obvious architecture decisions.

### When to include

- Multi-step flows (token fetch → Device init → registration → connect)
- State machines (call lifecycle, device lifecycle)
- Hook composition patterns (which hooks depend on which context)
- Event-to-state mapping (Twilio events → React state transitions)

### When to skip

- Simple component additions following an established pattern
- Quick fixes
- Documentation-only directives

### Design overview rules

- **State machine diagrams > prose** for lifecycle logic.
- **Include the "why" for non-obvious decisions.**
- **Surface hook dependency chains.** If `useVoice` depends on context from `OEXCommsProvider`, say so.
- **Specify TypeScript types inline** for enums, union types, and interface shapes that builds will reference.

---

## 5. Builds

Builds are the numbered implementation steps. Each build targets one or a small cluster of files.

```markdown
## Build {N}: {What it produces}

**File:** `src/hooks/useVoice.ts` (new | modify)

{Description of what to build.}

### {Hook or component name}

{Signature, implementation notes, type definitions.}
```

### Build rules

- **One build = one logical unit of work.** A build might touch 1–3 files.
- **Always state the file path and whether it's new or modified.**
- **Provide TypeScript type definitions for all public interfaces.**
- **Provide full code for:**
  - Type definitions (exact field names and types)
  - Constants and enum values (disposition values, error code maps)
  - `src/index.ts` export updates
- **Provide implementation guidance (not full code) for:**
  - Hook bodies (describe the state, effects, and return shape)
  - Service internals (describe the flow and error handling)
  - Component render logic (describe the structure and state-driven behavior)
- **Call out error handling expectations.**
- **Use horizontal rules (`---`) between builds.**

### Build ordering for this SDK

1. **Types** (TypeScript interfaces and types — no dependencies)
2. **Utils** (error maps, constants — depend on types only)
3. **Services** (internal — API client, token manager — depend on types + utils)
4. **Context/Providers** (React context — depend on services)
5. **Hooks** (public interface — depend on context)
6. **Components** (optional UI — depend on hooks)
7. **Index exports** (wire up public API)
8. **Tests** (depend on everything above)

---

## 6. Tests

```markdown
## Build {N}: Tests

**Files:**
- `tests/hooks/useVoice.test.ts` (new)
- `tests/services/token-manager.test.ts` (new)

### `tests/hooks/useVoice.test.ts` — {description} ({N} tests)

Mock `@twilio/voice-sdk` Device and Call classes. Mock `api-client`. Test:

1. {Test description}
2. {Test description}
...

Total: **{N} tests**.
```

### Test rules

- **Enumerate every test by number.**
- **Specify what to mock.** Twilio SDK classes and OEX API calls are always mocked.
- **State the total test count.**
- **Include negative tests.** Missing token → error state. Device not supported → fallback UI. Network error → reconnection state.
- **Tests use `renderHook` from React Testing Library** for hooks, `render` for components.

---

## 7. Scope

```markdown
## Scope

### ALLOWED_FILES

Files to create:
- `src/hooks/useVoice.ts`
- `tests/hooks/useVoice.test.ts`

Files to modify:
- `src/index.ts` — add useVoice export

Files that must NOT be modified:
- `src/services/token-manager.ts`
- `api-reference-docs-new/` (entire directory — read-only reference)
- Any file not listed above
```

### Scope rules

- **Three lists: create, modify, do-not-modify.** All required.
- **The modify list must say WHAT is being modified.**
- **`api-reference-docs-new/` is always in do-not-modify** — it's read-only reference documentation.
- **"Any file not listed above" is always the last line.**
- **Include commit instructions:**

```markdown
**One commit. Do not push.**

Commit message: `feat: add useVoice hook with call lifecycle management (directive 02)`
```

---

## 8. Build Order Summary

Include when the directive has more than 3 builds.

```markdown
## Build order

1. **Build 1**: Types → `src/types/voice.ts`
2. **Build 2**: Token manager → `src/services/token-manager.ts`
3. **Build 3**: Voice hook → `src/hooks/useVoice.ts`
4. **Build 4**: Tests → all test files
```

---

## 9. When Done (Completion Report)

```markdown
## When done

Report the following:

(a) List every file created or modified and what changed.
(b) Confirm {specific implementation detail}.
(c) Confirm {another detail}.
...
(k) Confirm all test files created and total test count.
(l) Confirm no files outside ALLOWED_FILES were modified.
(m) Confirm {specific files} were NOT modified.
```

### When-done rules

- **Use lettered items (a), (b), (c).**
- **Item (a) is always "List every file created or modified."**
- **Last two items are always scope confirmations.**
- **Middle items are specific implementation assertions.** Frame as "Confirm {X}".
- **Include behavioral assertions**, not just file changes.

---

## Anti-Patterns

**Don't write these directives:**

1. **The ambiguous directive.** "Build the voice calling feature." — Too broad.

2. **The over-specified directive.** Every JSX element and CSS class dictated. The executor is competent — give them the hook interface, the state shape, and the constraints.

3. **The assumption-laden directive.** "Since we set up the provider in the last session…" — The executor has no prior sessions.

4. **The scope-free directive.** No ALLOWED_FILES list. Always include scope.

5. **The orphaned directive.** Hook created but not exported from `src/index.ts`. Always include an export wiring step.

6. **The Twilio-leaking directive.** Public API exposes Twilio types directly. The SDK's public interface must be provider-agnostic — Twilio types stay internal.

---

## Assessing Completion Reports

Verify:

1. **File list matches ALLOWED_FILES.** No extra, no missing.
2. **Every (a)–(n) item is affirmed.**
3. **Test count matches.**
4. **Commit message matches.**
5. **No scope creep.**
6. **Public API doesn't expose Twilio internals.** Check `src/index.ts` — only SDK-defined types should be exported.

A clean report means: all items affirmed, test count exact, no files outside scope, no Twilio type leakage. Ship it.
