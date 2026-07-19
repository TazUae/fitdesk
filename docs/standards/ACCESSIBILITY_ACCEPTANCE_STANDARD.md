# FitDesk Accessibility Acceptance Standard

Status: Proposed (product-owner approval required)
Date: 2026-07-18
Scope: every modernized component and vertical slice. Accessibility is a per-slice acceptance criterion, not a final cleanup task.

## Per-component acceptance checklist

A modernized component passes only when all of the following hold:

1. **Keyboard-only completion** — every action reachable and completable with Tab/Shift-Tab/Enter/Escape/arrows. No gesture-only or hover-only critical action (swipe may enhance, never replace).
2. **Overlays** — sheets/dialogs trap focus while open, restore focus on close, are removed from the accessibility tree while closed (`inert` + `aria-hidden`), close on Escape, and carry `role="dialog"` with an accessible name. `WorkspaceShell` is the reference implementation; hand-rolled overlays are non-compliant by definition.
3. **Labels** — every input has a programmatic label; icon-only buttons have `aria-label`.
4. **Focus visibility** — `:focus-visible` outline using `--fd-primary-strong`; never `outline: none` without replacement.
5. **Contrast** — text ≥ 4.5:1 (3:1 for large text), non-text UI components/graphics ≥ 3:1 (WCAG 1.4.11). Indigo on light surfaces must use `--fd-primary-text`/`--fd-primary-strong`, never raw `--fd-primary`, per `ADR-UX-012`'s Focus Contrast Policy. Indigo-on-Midnight (`~4.03:1`) is insufficient for small normal text — use white/light text on Midnight or Indigo-filled surfaces.
6. **No color-only meaning** — status conveys with text or icon plus color (e.g., "Overdue" chip has the word, not just red).
7. **Status announcements** — async results (save success/failure, loading) are announced: toasts via the existing Sonner live region; inline errors rendered adjacent to the control; confirm buttons render disabled-with-reason rather than appearing/disappearing.
8. **Touch targets** — interactive elements ≥ 44×44 px on mobile, or have equivalent padding/hit-slop.
9. **Reduced motion** — non-essential animation respects `prefers-reduced-motion`.
10. **Semantics** — one `h1` per page, sectioning headings in order, lists as lists, tables as tables or explicit card alternatives.

## WCAG 2.2 AA — explicit binding requirements (added 2026-07-19)

These items are binding acceptance criteria, not aspirational goals:

11. **Focus not obscured (2.4.11)** — a focused element must not be entirely
    hidden by sticky headers, footers, or overlays.
12. **Dragging alternatives (2.5.7)** — any drag interaction (e.g. a future
    calendar drag-create) must have a non-drag equivalent (tap-to-select,
    explicit buttons).
13. **Accessible authentication (3.3.8)** — no cognitive-function test
    (e.g. a puzzle) as the only sign-in path; password managers/autofill
    must not be blocked.
14. **Redundant entry (3.3.7)** — do not ask the trainer to re-enter
    information already provided earlier in the same process (e.g. client
    details already captured in Add Client).
15. **Reduced motion** — every non-essential animation has a
    `prefers-reduced-motion` equivalent (restates item 9 as explicitly
    binding, not just "respects" in spirit).
16. **Zoom and reflow (1.4.10)** — content and functionality remain usable
    at 200% zoom (required) and should degrade gracefully at 400%; no
    horizontal scroll at standard mobile widths from zoom alone.
17. **Forced-colors / high-contrast mode** — the app must remain usable and
    non-decorative meaning must survive a forced-colors media query; icons
    conveying state must not rely solely on a fill color that forced-colors
    would neutralize.
18. **Mobile safe areas** — critical actions (FAB, bottom nav, sheet
    confirm buttons) respect `env(safe-area-inset-*)`, consistent with the
    existing `padding-bottom: env(safe-area-inset-bottom)` on `body`.
19. **Screen-reader announcement of asynchronous *authoritative* results**
    — distinct from item 7's general status announcements: a mutation that
    changes financial or scheduling truth (payment recorded, package
    consumed, session completed) must announce its *authoritative* outcome
    (success or failure) to assistive tech, not merely a generic "loading"
    or "done" toast — the announcement must convey what actually happened.

## Production-hardening (not binding for the current pilot)

- Automated WCAG 2.2 AA scanning in CI.
- Scripted keyboard/screen-reader regression walkthroughs.
- Automated 200%/400% zoom and forced-colors visual regression capture.

## Per-slice acceptance

Before a vertical slice freezes: a keyboard-only walkthrough of the slice's primary workflow, a screen-reader spot-check (NVDA or VoiceOver) of the same, and zero regressions on the checklist above for every component the slice touched. Record the result in the slice's freeze report.

## Known debt (tracked, not silently accepted)

- ~~Hidden-until-valid confirm buttons remain in `SessionCompletionSheet`
  (reschedule/no-show) — migrate to disabled-with-reason.~~ **Resolved,
  verified 2026-07-19** — both the no-show and reschedule footers already
  use disabled-with-reason (`components/scheduling/SessionCompletionSheet.tsx`,
  confirmed via direct code read).
- ~~`GoalEditorSheet`... predate `WorkspaceShell` compliance.~~ **Resolved
  for `GoalEditorSheet`, verified 2026-07-19** — it is portaled with
  `useFocusTrap` and focus restore (functionally equivalent to
  `WorkspaceShell` compliance, via the shared hook rather than the shared
  component). Other legacy `components/modules/*` sheets were not
  individually re-verified in this pass; do not assume they are compliant
  without checking each one before its slice freezes.
