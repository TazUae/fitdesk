# Phase 2 — BookingSheet Visual QA Closeout

> **Date:** 2026-07-04
> **Phase:** FitDesk Remaining Roadmap v2.1 — Phase 2 (BookingSheet portal/layout/z-index visual QA)
> **Status:** **PASS**
> **Related:** [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../plans/FITDESK_REMAINING_ROADMAP_V2.md)

## Final verdict

**PASS.** The BookingSheet/PlannerShell z-index containment fix (`7e8380c`) is confirmed working at desktop, tablet, and true mobile viewports. A real mobile-trigger regression was found and fixed during this phase (`2687bed`), and re-verified clean across all three viewports.

## What was verified

- BookingSheet renders via `createPortal(..., document.body)` with an SSR hydration guard, and PlannerShell's `main` element uses CSS `isolation: isolate` to contain SchedulerX's internal z-index stack so it cannot bleed through modal overlays.
- Desktop and tablet: BookingSheet opens as a 520px right drawer, full viewport height, `z-index: 50`, above the scrim's `z-index: 40`. PlannerShell's calendar area reserves exactly `paddingRight: 520px` and keeps `isolation: isolate` active while the sheet is open. No SchedulerX header/grid/session-block bleed-through at any point. Backdrop-click closes the sheet cleanly and the calendar is fully interactive afterward.
- Mobile: BookingSheet opens as a bottom sheet — full width at 390px, bottom-aligned, rounded top corners (`border-top-left-radius`/`border-top-right-radius: 16px`), header/footer not clipped, scrim covers the full calendar, sheet `z-index` above the scrim/calendar, no SchedulerX bleed-through, backdrop-click closes cleanly.
- Actual browser viewport size was confirmed programmatically (`window.innerWidth`/`innerHeight`) to match the intended breakpoint at all three sizes — not just visually inferred.

## Regression found

True mobile QA initially failed: the Schedule page (`/dashboard/schedule`) had **no way to open BookingSheet** at true mobile width. The only trigger — the toolbar's "Book session" button in `PlannerToolbar.tsx` — is `hidden` below the `md` breakpoint by design, and no alternate mobile entry point existed anywhere in the current code (the Home dashboard's mobile FAB/"Book" quick-action only navigates to `/dashboard/schedule`; it does not open BookingSheet).

Git history confirmed this was a **regression, not an original design decision**: a working mobile booking FAB existed as of commit `eb89f6f` ("Mobile FAB hides while SelectionTray is visible to avoid collision"), but was dropped when the Planner UI was rebuilt in commit `91c5696` ("Phase D1... No drag-to-reschedule or booking wizard ported") and was never reinstated.

## Fix committed

**`2687bed fix(scheduling): restore mobile BookingSheet trigger`**

A mobile-only floating action button was added to the Schedule page, visible only below `md` and reusing the existing `bookingOpen` state and `handleOpenBooking` callback already wired to BookingSheet — no new booking flow, no duplicated state, no changes to `BookingSheet.tsx`, `PlannerShell.tsx`, or `PlannerToolbar.tsx`. The FAB is conditionally removed from the DOM whenever the sheet is open, so it can never render above the scrim.

## Test evidence

- `npx vitest run lib/scheduling` → **201/201 passed**
- `npx next lint --file components/modules/ScheduleView.tsx` → **clean, no warnings or errors**
- Local Docker rebuild of the FitDesk production image (`docker compose -f docker-compose.local.yml build fitdesk`) → **build passed**, container restarted successfully with no other services affected

## Playwright viewport evidence

Real browser-context viewport/device emulation was used (Playwright Chromium, installed ephemerally into a scratchpad folder outside the repo — never added to FitDesk's `package.json`/lockfile/`node_modules`), after an earlier remote-browser-resize approach failed to actually change `window.innerWidth`.

| Viewport | Expected | Actual (`window.innerWidth × innerHeight`) | Result |
|---|---|---|---|
| Desktop | 1280×900 | 1280×900 | PASS |
| Tablet | 768×1024 | 768×1024 | PASS |
| Mobile | 390×844 | 390×844 | PASS |

Computed-style assertions (not just screenshots) confirmed, for every viewport: BookingSheet bounding rect/z-index/position, scrim bounding rect/z-index/position, and PlannerShell's `isolation`/`paddingRight`. Screenshots were captured outside the repo in the session scratchpad (`desktop.png`, `tablet.png`, `mobile.png`) and are not part of this commit.

## Files changed by the fix

- `components/modules/ScheduleView.tsx` only (one new import, one new conditionally-rendered button; 19 lines added, 0 removed).

## Scope confirmation

- **No scheduling engine, billing, ERP, schema, migration, or database logic was touched** by this fix or by any QA step in this phase.
- **No booking or session was created** at any point during QA. Every Playwright run stopped at the first BookingSheet step (client selection); "Next" and "Confirm" were never clicked, in either the manual browser passes or the automated Playwright passes.
- No repository files outside `components/modules/ScheduleView.tsx` were modified. No secrets were printed at any point (QA login password was passed via an in-memory environment variable to the Playwright script, never logged, never written to a screenshot or output artifact).

## Remaining risks

- Playwright QA covered the BookingSheet's first step only (client selection). The remaining steps (date/time, pattern, review) were not visually re-verified at mobile width in this phase, since the fix only concerns reaching step 1.
- The scratchpad-local Playwright setup is a one-off QA tool, not a committed test suite — there is no regression-proof CI coverage for this mobile trigger going forward. If this class of regression (a UI rebuild silently dropping a mobile entry point) is a recurring risk, a durable Playwright/CI setup would be a separate, larger decision.
- The desktop/tablet toolbar "Book session" button remains visible in the DOM while BookingSheet is open (unchanged pre-existing behavior, not a regression from this fix, and not in scope for this phase).

## Deployment recommendation

**Safe to review and push after normal approval.** The change is narrow (one file, 19 lines), reuses existing state/callbacks with no new logic paths, is covered by passing unit tests and a clean Docker production build, and has been visually verified end-to-end at all three target viewports with no scheduling/billing/ERP/database surface touched.
