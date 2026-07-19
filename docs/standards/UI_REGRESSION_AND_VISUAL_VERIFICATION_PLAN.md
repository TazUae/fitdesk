# FitDesk UI Regression & Visual Verification Plan

Status: Proposed (product-owner approval required)
Date: 2026-07-18
Why: earlier visual QA relied on ad-hoc Playwright checks with no durable governance. This plan makes visual verification repeatable per slice.

## Canonical viewports

- Mobile narrow: 320×568, 360×800
- Mobile: 390×844 (iPhone-class, primary)
- Tablet: 768×1024
- Desktop: 1024×768, 1440×900 (primary)
- Wide desktop (dashboard/planner only): 1920×1080

## Required coverage (added 2026-07-19)

Every surface below is captured once implemented; **target-only, unimplemented
surfaces (full Inbox, Programs) are never captured as if they exist** — a
mockup screenshot is not a baseline:

Logo variants (once integrated, see `ADR-UX-013` §7), authentication,
onboarding, Dashboard, Schedule, Clients, Client Hub, the current outbound
messaging bridge (not a full Inbox), Billing/`/invoices`, Settings, Session
Completion, mobile bottom navigation, mobile bottom/full-height sheets,
desktop drawers.

## Required states per slice

Each vertical slice (Dashboard, Clients, Scheduling, Billing, Messaging) captures, at each applicable viewport: empty, loading (skeleton), sparse, success/populated, partial, stale, error/unavailable, blocked (e.g., package-no-balance, no payment methods), uncertain-result, and long-content overflow. Overlays are captured both open and closed, plus a keyboard-focus screenshot showing the visible focus ring. Reduced-motion and 200% zoom variants are captured for any slice with animation or dense layout. Forced-colors mode is captured for financial and status-bearing surfaces.

## Business-state fixtures

Screenshots use deterministic fixtures, not live tenant data: one client per billing mode (package with balance, package exhausted, pay-per-session with rate, pay-per-session without rate, unset), one invoice per status (sent, overdue, partially_paid, paid), sessions in each status (scheduled, confirmed, completed, cancelled, no_show).

## Process

1. Before a slice starts: capture the *baseline* set on the current build.
2. After implementation: capture the *candidate* set with identical fixtures/viewports.
3. Diff review: any pixel diff beyond antialiasing noise (recommended threshold: 0.1% of pixels per image) requires explicit reviewer sign-off with a one-line justification per accepted diff.
4. Approval owner: the product owner approves visual diffs for financial surfaces (invoices, payments, session completion); the implementing engineer may self-approve pure-copy or spacing diffs elsewhere, recorded in the freeze report.
5. Storage: screenshot sets live outside the repo (CI artifacts); the freeze report links the run.

## Tooling

Playwright screenshot runs against `next dev` with fixture seeding, wired as a repeatable script. **Correction 2026-07-19:** `scripts/visual-qa/capture.mjs` already exists (uncommitted, from the 2026-07-18 modernization pass) — it is not "to be created." It requires `@playwright/test` as a new devDependency, which is **not yet added and requires separate product-owner approval** before first use (per CLAUDE.md's dependency-addition rule). Dark theme captures are added only after dark mode actually ships (`ADR-UX-012` governance rules: "dark mode remains out of scope until light-theme coverage is proven").

## Gate

Functional tests, lint, build, the Accessibility Acceptance checklist, and this visual verification must all pass before a slice's commit/freeze. A slice without a linked visual run is not freezable.
