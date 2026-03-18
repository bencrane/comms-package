# OEX Comms SDK — Component Design Specification

## Purpose

This document specifies the visual design for the opinionated styled layer of `@oex/comms-sdk`. The headless components (Phase 4A) are already built — they handle behavior, state, accessibility, and prop interfaces. This spec defines the default visual treatment that ships with the package. Consuming apps can override everything via `className` props and CSS custom properties.

The goal: a developer drops in `<CallBar />` and gets a production-quality UI out of the box. No additional CSS required. But every visual decision is overridable.

---

## Design System

### Theming via CSS Custom Properties

Every visual decision is a CSS custom property on a `.oex-comms` root class. Consuming apps override by redefining the variables.

```css
.oex-comms {
  /* Layout */
  --oex-radius-sm: 6px;
  --oex-radius-md: 10px;
  --oex-radius-lg: 16px;
  --oex-radius-full: 9999px;
  --oex-spacing-xs: 4px;
  --oex-spacing-sm: 8px;
  --oex-spacing-md: 12px;
  --oex-spacing-lg: 16px;
  --oex-spacing-xl: 24px;

  /* Typography */
  --oex-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --oex-font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  --oex-font-size-xs: 11px;
  --oex-font-size-sm: 13px;
  --oex-font-size-md: 14px;
  --oex-font-size-lg: 16px;
  --oex-font-size-xl: 20px;
  --oex-font-weight-normal: 400;
  --oex-font-weight-medium: 500;
  --oex-font-weight-semibold: 600;
  --oex-line-height-tight: 1.2;
  --oex-line-height-normal: 1.5;

  /* Colors — Light Mode */
  --oex-bg-primary: #ffffff;
  --oex-bg-secondary: #f7f7f8;
  --oex-bg-tertiary: #efefef;
  --oex-bg-active: #e8f4fd;
  --oex-bg-danger: #fef2f2;
  --oex-bg-success: #f0fdf4;
  --oex-bg-warning: #fffbeb;

  --oex-text-primary: #111111;
  --oex-text-secondary: #6b7280;
  --oex-text-tertiary: #9ca3af;
  --oex-text-inverse: #ffffff;
  --oex-text-danger: #dc2626;
  --oex-text-success: #16a34a;
  --oex-text-warning: #d97706;

  --oex-border-default: #e5e7eb;
  --oex-border-strong: #d1d5db;
  --oex-border-focus: #3b82f6;
  --oex-border-danger: #fca5a5;

  --oex-accent-primary: #3b82f6;
  --oex-accent-danger: #ef4444;
  --oex-accent-success: #22c55e;
  --oex-accent-warning: #f59e0b;

  /* Shadows */
  --oex-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --oex-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --oex-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --oex-shadow-float: 0 8px 30px rgba(0, 0, 0, 0.12);

  /* Transitions */
  --oex-transition-fast: 120ms ease;
  --oex-transition-normal: 200ms ease;
  --oex-transition-slow: 300ms ease;
}

/* Dark Mode */
.oex-comms[data-theme="dark"] {
  --oex-bg-primary: #18181b;
  --oex-bg-secondary: #27272a;
  --oex-bg-tertiary: #3f3f46;
  --oex-bg-active: #1e3a5f;
  --oex-bg-danger: #3b1111;
  --oex-bg-success: #052e16;
  --oex-bg-warning: #3b2506;

  --oex-text-primary: #fafafa;
  --oex-text-secondary: #a1a1aa;
  --oex-text-tertiary: #71717a;
  --oex-text-inverse: #18181b;

  --oex-border-default: #3f3f46;
  --oex-border-strong: #52525b;

  --oex-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --oex-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --oex-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
  --oex-shadow-float: 0 8px 30px rgba(0, 0, 0, 0.6);
}
```

### Interaction States

Every interactive element follows this state model:

| State | Visual Treatment |
|-------|-----------------|
| Default | Base colors, no shadow elevation |
| Hover | Subtle background shift, `translateY(-1px)`, shadow elevation |
| Active/Pressed | `translateY(0)`, darker background, no shadow |
| Focus-visible | `outline: 2px solid var(--oex-border-focus)`, `outline-offset: 2px` |
| Disabled | `opacity: 0.5`, `cursor: not-allowed`, no hover effects |

Transitions: `var(--oex-transition-fast)` for color changes, `var(--oex-transition-normal)` for transforms.

### Button Variants

Three button styles used across all components:

**Primary** — `background: var(--oex-accent-primary)`, `color: var(--oex-text-inverse)`, `border-radius: var(--oex-radius-md)`
**Danger** — `background: var(--oex-accent-danger)`, `color: var(--oex-text-inverse)`
**Ghost** — `background: transparent`, `color: var(--oex-text-primary)`, `border: 1px solid var(--oex-border-default)`. Hover: `background: var(--oex-bg-secondary)`

---

## Component Specifications

### CallBar

**Container:** Horizontal bar. `background: var(--oex-bg-primary)`, `border: 1px solid var(--oex-border-default)`, `border-radius: var(--oex-radius-lg)`, `box-shadow: var(--oex-shadow-md)`, `padding: var(--oex-spacing-md) var(--oex-spacing-lg)`. Flex row, `align-items: center`, `gap: var(--oex-spacing-lg)`.

**Visual states by `data-state`:**

| data-state | Visual |
|------------|--------|
| `idle` | Collapsed or hidden (consuming app decides) |
| `connecting` | Pulsing accent border animation (`@keyframes pulse-border`) |
| `ringing` | Same pulse, faster frequency |
| `open` | Solid subtle green left-border accent (`border-left: 3px solid var(--oex-accent-success)`) |
| `reconnecting` | Yellow/warning left-border, subtle opacity pulse |
| `pending` | Blue accent left-border, gentle bounce on accept/reject buttons |

**CallBar.Status:** Small pill badge. Monospace font, `font-size: var(--oex-font-size-xs)`, uppercase. Background color derived from state: connecting → `var(--oex-bg-active)`, open → `var(--oex-bg-success)`, reconnecting → `var(--oex-bg-warning)`.

**CallBar.Timer:** Monospace font, `font-size: var(--oex-font-size-lg)`, `font-weight: var(--oex-font-weight-semibold)`, `font-variant-numeric: tabular-nums` (prevents layout shift as digits change). `color: var(--oex-text-primary)`.

**CallBar.Controls:** Row of icon buttons. Each is a circle (`width: 40px`, `height: 40px`, `border-radius: var(--oex-radius-full)`). Layout: `display: flex`, `gap: var(--oex-spacing-sm)`.

| Button | Default | Active (`data-active="true"`) | Icon |
|--------|---------|-------------------------------|------|
| Mute | Ghost | `background: var(--oex-accent-primary)`, `color: white` | Microphone / MicrophoneOff |
| Hold | Ghost | `background: var(--oex-accent-warning)`, `color: white` | Pause / Play |
| Hangup | Danger (always) | N/A | PhoneOff |
| Disposition | Ghost | `background: var(--oex-accent-success)` when submitted | ClipboardCheck |

**CallBar.CallerInfo:** Two lines. First line: phone number or name, `font-size: var(--oex-font-size-md)`, `font-weight: var(--oex-font-weight-semibold)`. Second line: direction label ("Outbound call" / "Incoming call"), `font-size: var(--oex-font-size-xs)`, `color: var(--oex-text-secondary)`.

---

### Dialer

**Container:** Vertical layout. `background: var(--oex-bg-primary)`, `border-radius: var(--oex-radius-lg)`, `padding: var(--oex-spacing-xl)`.

**Phone input:** Full-width. `font-size: var(--oex-font-size-xl)`, `font-weight: var(--oex-font-weight-semibold)`, `text-align: center`, `letter-spacing: 0.5px`. No visible border — just a bottom line (`border-bottom: 2px solid var(--oex-border-default)`). Focus: bottom line color changes to `var(--oex-accent-primary)`. Formatted display (e.g., `+1 (555) 123-4567`).

**Call button:** Below the input. Full-width, large. `height: 48px`, `border-radius: var(--oex-radius-full)`. When idle: Primary button (accent blue), icon: Phone. When call active: Danger button (red), icon: PhoneOff. Transition between states: `var(--oex-transition-normal)`.

**DTMF Keypad:** 4×3 grid. Each key: `width: 56px`, `height: 56px`, `border-radius: var(--oex-radius-full)`, Ghost button style. `font-size: var(--oex-font-size-lg)`. Sub-label (letters ABC, DEF, etc.) in `font-size: var(--oex-font-size-xs)`, `color: var(--oex-text-tertiary)`. Press animation: `scale(0.95)` with `var(--oex-transition-fast)`.

---

### AudioDeviceSelector

**Container:** Vertical stack, `gap: var(--oex-spacing-md)`.

**Each selector row:** Label + select element. Label: `font-size: var(--oex-font-size-sm)`, `color: var(--oex-text-secondary)`, `font-weight: var(--oex-font-weight-medium)`. Select: full-width, `height: 40px`, `border: 1px solid var(--oex-border-default)`, `border-radius: var(--oex-radius-md)`, `padding: 0 var(--oex-spacing-md)`, `font-size: var(--oex-font-size-md)`. Custom dropdown arrow via CSS.

**Test speaker button:** Ghost button, small. `font-size: var(--oex-font-size-sm)`. Icon: Volume2. Align right below the speaker selector.

---

### IncomingCallBanner

**Container:** `background: var(--oex-bg-primary)`, `border: 1px solid var(--oex-accent-primary)`, `border-radius: var(--oex-radius-lg)`, `box-shadow: var(--oex-shadow-float)`, `padding: var(--oex-spacing-lg)`. Entrance animation: slide down + fade in (`translateY(-8px)` → `translateY(0)`, `opacity: 0` → `1`). `var(--oex-transition-slow)`.

**Layout:** Flex row. Left: caller info (phone number, large; "Incoming call" label, small secondary text). Right: two circular buttons.

**Accept button:** Circle, `width: 48px`, `height: 48px`, `background: var(--oex-accent-success)`, `color: white`. Icon: Phone. Gentle pulse animation on the border (`box-shadow` pulse with `var(--oex-accent-success)` at 30% opacity).

**Reject button:** Circle, same size. `background: var(--oex-accent-danger)`, `color: white`. Icon: PhoneOff. No pulse.

---

### PowerDialerPanel

**Container:** `background: var(--oex-bg-primary)`, `border: 1px solid var(--oex-border-default)`, `border-radius: var(--oex-radius-lg)`, `padding: var(--oex-spacing-xl)`. Vertical stack, `gap: var(--oex-spacing-lg)`.

**LeadInfo:** Card-like section. `background: var(--oex-bg-secondary)`, `border-radius: var(--oex-radius-md)`, `padding: var(--oex-spacing-lg)`. Lead name: `font-size: var(--oex-font-size-lg)`, `font-weight: var(--oex-font-weight-semibold)`. Phone number: `font-size: var(--oex-font-size-md)`, `color: var(--oex-text-secondary)`, monospace. State indicator: small colored dot (dialing → blue pulse, on_call → green solid, awaiting_disposition → amber pulse).

**QueueProgress:** Horizontal bar. Text: "3 of 25" in `font-size: var(--oex-font-size-sm)`. Below: progress bar (`height: 4px`, `border-radius: var(--oex-radius-full)`, `background: var(--oex-bg-tertiary)`, fill with `var(--oex-accent-primary)`, width proportional to `queuePosition / totalLeads`). Transition on fill width: `var(--oex-transition-slow)`.

**Controls:** Row of buttons. Size and style depend on session state:
- Idle: Single large Primary button "Start Session"
- Active: Three buttons — Pause (Ghost), Skip (Ghost), End (Danger, small)
- Paused: Two buttons — Resume (Primary), End (Danger, small)
- Completed: Text "Session complete" in `var(--oex-text-secondary)`, no buttons
- Awaiting disposition: "Set Disposition" Primary button, pulsing accent border

**Stats:** Grid of 2×2 stat cards. Each: `background: var(--oex-bg-secondary)`, `border-radius: var(--oex-radius-md)`, `padding: var(--oex-spacing-md)`. Number: `font-size: var(--oex-font-size-xl)`, `font-weight: var(--oex-font-weight-semibold)`. Label: `font-size: var(--oex-font-size-xs)`, `color: var(--oex-text-secondary)`, uppercase.

---

### ConversationThread

**Container:** Vertical flex, `height: 100%` (fills parent). Three sections: message list (scrollable, flex-grow), typing indicator (fixed height), compose input (fixed height).

**MessageList:** Scrollable area. `overflow-y: auto`, `padding: var(--oex-spacing-md)`. Messages stack vertically with `gap: var(--oex-spacing-sm)`.

**Message bubble:** Rounded container. Max-width 75% of the thread width.
- Outbound (`data-direction="outbound"`): aligned right, `background: var(--oex-accent-primary)`, `color: var(--oex-text-inverse)`, `border-radius: var(--oex-radius-lg) var(--oex-radius-lg) var(--oex-radius-sm) var(--oex-radius-lg)`.
- Inbound (`data-direction="inbound"`): aligned left, `background: var(--oex-bg-secondary)`, `color: var(--oex-text-primary)`, `border-radius: var(--oex-radius-lg) var(--oex-radius-lg) var(--oex-radius-lg) var(--oex-radius-sm)`.
- Body: `font-size: var(--oex-font-size-md)`, `line-height: var(--oex-line-height-normal)`.
- Timestamp: `font-size: var(--oex-font-size-xs)`, `color` is either `rgba(255,255,255,0.7)` (outbound) or `var(--oex-text-tertiary)` (inbound). Below the body.
- Read receipt: tiny checkmark icon, `font-size: 12px`. Single check (sent), double check (delivered/read). `color` same as timestamp.

**Load more trigger:** Top of the message list. Ghost button, centered, `font-size: var(--oex-font-size-sm)`. Hidden when `hasMoreMessages` is false.

**TypingIndicator:** `height: 24px`. Three animated dots in a row, bouncing with staggered delay (`@keyframes bounce`, 0ms/150ms/300ms offset). `color: var(--oex-text-tertiary)`. Adjacent text: "{name} is typing..." in `font-size: var(--oex-font-size-xs)`.

**ComposeInput:** `border-top: 1px solid var(--oex-border-default)`, `padding: var(--oex-spacing-md)`. Flex row. Input: flex-grow, `border: 1px solid var(--oex-border-default)`, `border-radius: var(--oex-radius-full)`, `padding: var(--oex-spacing-sm) var(--oex-spacing-md)`, `font-size: var(--oex-font-size-md)`. Send button: circle, `width: 36px`, `height: 36px`, `background: var(--oex-accent-primary)`, `color: white`, `border-radius: var(--oex-radius-full)`. Disabled state when empty: `opacity: 0.4`.

---

### ConversationList

**Container:** Vertical list, `overflow-y: auto`.

**Item:** `padding: var(--oex-spacing-md) var(--oex-spacing-lg)`, `border-bottom: 1px solid var(--oex-border-default)`. Hover: `background: var(--oex-bg-secondary)`. Active/selected (`data-active="true"`): `background: var(--oex-bg-active)`, `border-left: 3px solid var(--oex-accent-primary)`.

**Item layout:** Two rows. Top row: name (left, `font-weight: var(--oex-font-weight-semibold)`, `font-size: var(--oex-font-size-md)`) + timestamp (right, `font-size: var(--oex-font-size-xs)`, `color: var(--oex-text-tertiary)`). Bottom row: message preview (left, `font-size: var(--oex-font-size-sm)`, `color: var(--oex-text-secondary)`, single line truncated with ellipsis) + unread badge (right).

**Unread badge:** `min-width: 20px`, `height: 20px`, `border-radius: var(--oex-radius-full)`, `background: var(--oex-accent-primary)`, `color: var(--oex-text-inverse)`, `font-size: var(--oex-font-size-xs)`, `font-weight: var(--oex-font-weight-semibold)`, centered text. Only visible when `data-unread="true"`.

---

## Implementation Notes

- All styles ship as a single CSS file (`oex-comms.css`) that the consuming app imports alongside the components
- Styles target `data-*` attributes that the headless components already render — no additional wrapper elements needed
- The CSS file uses the `.oex-comms` class as the scope — all selectors are prefixed with `.oex-comms` to avoid conflicts with the host app's styles
- No CSS-in-JS, no styled-components, no Tailwind dependency — plain CSS with custom properties
- The styled layer is opt-in: if the consuming app doesn't import `oex-comms.css`, the headless components render unstyled
- Icons: use inline SVGs (not an icon library dependency). Each icon is a small React component in `src/components/icons/`. Only the icons actually used are bundled.