# Phase 5.1 — FitDesk Scheduling UX Rebuild Plan (v3, Google-Calendar-Inspired)

**Status:** Approved 2026-05-11
**Author roles:** Senior SaaS Architect / Senior Product Designer / Lead Frontend Engineer
**Anchor docs:** [SCHEDULING_HANDOVER_REPORT.md](SCHEDULING_HANDOVER_REPORT.md), [scheduler-rollback.md](scheduler-rollback.md), [PHASE_5_0_REPORT.md](PHASE_5_0_REPORT.md), [../CLAUDE.md](../CLAUDE.md)

## Revision history

- **v1 (2026-05-11):** Initial UX rebuild plan — 4-step guided BookingSheet, yellow/gold CTA, sticky footer.
- **v2 (2026-05-11):** Mockup-aligned 6-step flow with SelectionTray, sessions-per-week, per-day time editor, explicit Success state, calendar redesign. CTA primary shifted to blue.
- **v3 (2026-05-11, this doc):** Phase 5.0 replaced with "Planner Layout Rebuild — Google Calendar-Inspired". Light theme, full desktop width, real toolbar + sidebar. Rejected dark/neon centered mobile-card layout.

---

## 1. Executive Summary

The scheduling engine is asset-grade (pure, isomorphic, 187 unit tests). The scheduling **UI/UX** is a first-pass admin form spread across three disjoint entry points (`BookingPanel`, `QuickAddPopover`, `SessionDetailsSheet`) with dark/neon styling, a narrow centered mobile-card layout on desktop, no in-sheet date/time editing, scroll-heavy admin forms, no sticky CTA, and a green CTA color that collides with status semantics.

This plan rebuilds the entire scheduling surface in 12 phases, structured around three rolling commitments:

1. **Planner Layout Rebuild (Phase 5.0) — Google Calendar-Inspired.** Light theme, full desktop width, real toolbar with Today/nav/view switcher, optional collapsible sidebar with mini calendar + filters. Mobile preserves bottom nav + bottom-sheet behavior but with the light/professional treatment.

2. **Guided Booking Flow (Phase 5.1A–E).** Multi-slot SelectionTray on the calendar opens a 6-step BookingSheet (Client → Date & Time → Pattern → Review → Success → Added). Includes per-day time editor, sessions-per-week selector, package balance gate, conflict banner, and an explicit success state with Add to Calendar.

3. **Production-Readiness (Phase 5.1F–I, 5.2+).** Per-day working hours, holidays, WhatsApp confirmation, invoice submission, Playwright smoke tests, and the deferred P1/P2/P3 work from the handover report.

**Design principle:** *"Suggest first, confirm second — never force the user to build from scratch."*

**Visual principle (v3):** *Professional SaaS, Google Calendar-inspired, light by default. Not a fitness-gaming app.*

---

## 2. Current-State Audit (read-only)

### 2.1 Files in the current flow

| File | Role |
|---|---|
| [app/dashboard/schedule/page.tsx](../app/dashboard/schedule/page.tsx) | RSC; fetches config + sessions + clients. |
| [components/modules/ScheduleView.tsx](../components/modules/ScheduleView.tsx) | Client orchestrator; owns `selectedSlots: Date[]`, `quickAddRange`, `detailSessionId`. |
| [components/scheduling/SchedulerXAdapter.tsx](../components/scheduling/SchedulerXAdapter.tsx) | Schedule-X bridge; tap toggles slots; drag emits range. |
| [components/scheduling/BookingPanel.tsx](../components/scheduling/BookingPanel.tsx) | Multi-slot booking form. **No date/time editing.** |
| [components/scheduling/QuickAddPopover.tsx](../components/scheduling/QuickAddPopover.tsx) | Drag-to-create fast path. **No date/time editing.** |
| [components/scheduling/SessionDetailsSheet.tsx](../components/scheduling/SessionDetailsSheet.tsx) | Edit existing session. **Only place date/time are editable.** |
| [components/scheduling/SessionPreviewByWeek.tsx](../components/scheduling/SessionPreviewByWeek.tsx) | Long scrollable week-grouped list. |

### 2.2 Observed defects

- **Booking is calendar-dependent.** No date/time controls inside BookingPanel.
- **Scroll-heavy.** Nested vertical scroll inside the panel.
- **Primary CTA invisible.** Buried below scroll on small screens; green `#00C853` conflicts with the `confirmed` status color.
- **Preview is too technical.** 12-week scrollable list buries the conflict signal.
- **Dark/neon dashboard background.** `radial-gradient(140% 100% at 50% -8%, rgba(94,127,255,0.22) ...)` in ScheduleView.
- **Narrow centered mobile-card layout on desktop.** `max-w-[1200px] lg:flex-row lg:justify-center` makes the calendar look like a scaled phone.
- **No multi-slot selection persistence.** Trainer can multi-tap but there's no tray surface.
- **No "Now" line.** Schedule-X may have one; not verified.
- **No success state.** Booking returns to the calendar with only a toast.

### 2.3 What the engine and server give us for free

- `buildBookingPlan` is **idempotent** — recompute on every keystroke.
- Server **re-validates** every booking with fresh ERP data.
- `SchedulingResult<T>` discriminated union with stable `SchedulingErrorCode` strings.
- `SeriesPattern.slots` already supports **independent per-weekday times** — no engine change needed for the per-day editor.

---

## 3. Product Principles

1. **Suggest first, confirm second.** Calendar tap pre-fills; sheet never starts blank.
2. **Editable always.** Anything pre-filled is editable in the sheet — including each weekday's time.
3. **Preview before commit.** Live engine recompute on every change.
4. **Server validation always wins.** Client preview is convenience; server rebuilds with fresh data.
5. **Mobile-first.** 360-px target; safe-area-inset; sticky CTA.
6. **Trainer speed.** Two-tap booking remains possible.
7. **One source of visual truth (v3).** Blue = primary action, yellow/gold = brand accent, green = success/confirmed, red/orange = warning.
8. **Calendar is the home base.** Planner must be calm, readable, beautiful in light mode.
9. **Reversibility.** Toast undo for destructive actions.
10. **Light + dark parity.** v3 ships light-only; a professional (not gaming-neon) dark theme is deferred.
11. **Professional SaaS surface.** Google Calendar is the UX inspiration; no neon, no glassmorphism, no centered mobile-card on desktop.

---

## 4. Proposed New Booking Flow (mockup-aligned)

### 4.1 Entry points

| Entry | Pre-fills | Opens at |
|---|---|---|
| Single tap a cell | date, startTime, durationMinutes=60 | Sheet Step 1 (or Step 4 if client deep-linked) |
| Drag a range | date, startTime, duration | Sheet Step 1 |
| **Multi-tap N cells** | N (date,time) pairs → weekday/time pattern | Tray docks; tap tray to open Sheet |
| Deep link `?client=` | clientId | Sheet Step 2 |
| FAB / sidebar "+ Create" | nothing | Sheet Step 1 |

### 4.2 Persistent SelectionTray

When `selectedSlots.length ≥ 1`, a docked tray appears:

```
┌────────────────────────────────────────────┐
│ 3 sessions selected                    X   │
│ Mon 6:00 PM · Wed 7:30 PM · Fri 5:00 PM    │
└────────────────────────────────────────────┘
```

### 4.3 Six-step BookingSheet

- **Step 1 — Client.** Search + Suggested chips (3 recent/relevant) + selected client card with remaining-sessions badge.
- **Step 2 — Date & Time.** Date picker + time picker + duration chips (30/45/60/90) + working-hours indicator + optional "Use Package" toggle.
- **Step 3 — Configure Recurrence.** Sessions-per-week chips (1–5) OR direct multi-slot pattern editor. "Repeat For" chips (1/2/3/4/8 weeks). **`PerDayTimeEditor`** — each weekday row tappable to edit time independently. Human summary: "This will create 6 sessions · Mar 25 – Apr 19".
- **Step 4 — Review & Confirm.** Compact card: count, range, client, per-weekday schedule, duration, repeat statement. Conflict banner if any. Optional fields (type, fee, notes). **Blue CTA "Book {N} Sessions".**
- **Step 5 — Success.** Green check + count + pattern summary + **Add to Calendar** (ICS/Google) + Done.
- **Step 6 — Added to Planner.** Calendar redraws with the new sessions.

### 4.4 Two-tap express

Deep-linked client + single cell tap → sheet opens at Step 4 with everything filled. Tap blue CTA → success.

---

## 5. Proposed State Model

```ts
// types/scheduling.ts (additive only)

export type RepeatMode = 'one_off' | 'weekly'

export interface PatternSlot {
  weekday:          0 | 1 | 2 | 3 | 4 | 5 | 6
  localTime:        string             // 'HH:mm'
  durationMinutes?: number             // per-slot override; engine uses plan-level
}

export interface BookingDraft {
  clientId:        string | null
  date:            string              // 'YYYY-MM-DD'
  startTime:       string              // 'HH:mm'
  durationMinutes: number
  packageOptIn:    boolean
  repeatMode:      RepeatMode
  recurrenceWeeks: number              // 1|2|3|4|8
  patternSlots:    PatternSlot[] | null
  sessionsPerWeek: 1 | 2 | 3 | 4 | 5 | null
  sessionType:     string | null
  fee:             number | null
  notes:           string | null
}

export type BookingValidity =
  | { kind: 'invalid'; reason: 'NO_CLIENT' | 'NO_TIME' | 'EMPTY_PLAN' | 'NO_PATTERN' }
  | { kind: 'blocked'; reason: 'CONFLICT' | 'OUT_OF_HOURS' | 'PACKAGE_OVERDRAW'; details: string }
  | { kind: 'ready';   plan: BookingPlan; total: number }
```

Mapping helper `draftToPlanInput()` lives in `lib/scheduling/draft.ts` (pure, no engine change).

---

## 6. Component Architecture

```
ScheduleView
└─ PlannerShell                                       (Phase 5.0)
   ├─ PlannerToolbar                                  (Phase 5.0)
   ├─ PlannerSidebar (≥ lg)                           (Phase 5.0)
   │   ├─ "+ Create"
   │   ├─ MiniCalendar                                (Phase 5.0)
   │   └─ CalendarFilters                             (Phase 5.0)
   ├─ <main>
   │   ├─ SchedulerXAdapter (light theme)             (Phase 5.0 edit)
   │   │   ├─ SessionCard (custom event)              (Phase 5.0)
   │   │   └─ NowLine                                 (Phase 5.0)
   │   ├─ SelectionTray                               (Phase 5.1A)
   │   └─ BookingSheet (overlay drawer)               (Phase 5.1A)
   │       ├─ BookingStepper
   │       ├─ BookingClientStep
   │       ├─ BookingDateTimeStep
   │       ├─ BookingPatternStep
   │       │   └─ PerDayTimeEditor
   │       ├─ BookingReviewStep
   │       │   ├─ CompactSessionPreview
   │       │   ├─ ConflictBanner
   │       │   └─ PackageBalanceGate
   │       ├─ BookingStickyFooter
   │       └─ BookingSuccessSheet
   └─ FAB (< lg only)                                 (Phase 5.0 restyle)
```

---

## 7. Phase 5.0 — Planner Layout Rebuild (Google Calendar-Inspired)

### 7.1 Goal

Replace the narrow centered mobile-card Planner with a professional, light, Google Calendar-inspired interface that uses the full desktop width.

### 7.2 Explicit rejections

- Reject dark/neon backgrounds.
- Reject centered-phone-mockup desktop layout.
- Reject saturated gradient session blocks.
- Reject Google branding/logo copying (UX inspiration only).
- No dark mode in this phase; defer professional dark theme to a later phase.

### 7.3 Color tokens (v3)

| Token | Hex | Role |
|---|---|---|
| `surface` | `#FFFFFF` | Cards, sheets, calendar grid. |
| `appBg` | `#F8F9FA` | Page background, sidebar. |
| `gridLine` | `#E8EAED` | Hour line, day divider. |
| `gridLineStrong` | `#DADCE0` | Day/week boundary, toolbar border. |
| `text` | `#3C4043` | Primary text. |
| `textSecondary` | `#70757A` | Secondary text. |
| `textOnPrimary` | `#FFFFFF` | Text on filled primary. |
| `actionPrimary` | `#1A73E8` | CTA, FAB, focus, today circle. |
| `actionPrimaryHover` | `#1765CC` | Hover/active. |
| `actionPrimarySubtle` | `#E8F0FE` | Selected pill background. |
| `brandAccent` | (existing FitDesk yellow) | Wordmark only. Never a CTA. |
| `statusSuccess` | `#188038` | Success state, confirmed status. |
| `statusWarning` | `#E37400` | Out-of-hours, package-low. |
| `statusDanger` | `#D93025` | Conflict, current-time line. |
| `pastel.blue` | `#D2E3FC` / text `#174EA6` | Event card. |
| `pastel.green` | `#CEEAD6` / text `#0D652D` | Event card. |
| `pastel.yellow` | `#FEEFC3` / text `#7E6101` | Event card. |
| `pastel.purple` | `#E7D9FF` / text `#4A148C` | Event card. |
| `pastel.pink` | `#FAD2CF` / text `#A50E0E` | Event card. |
| `pastel.teal` | `#CBF0F8` / text `#007B83` | Event card. |
| `pastel.gray` | `#E8EAED` / text `#3C4043` | Completed/cancelled. |

### 7.4 Responsive layout rules

| Breakpoint | Behavior |
|---|---|
| **xl ≥ 1280 px** | Sidebar (260 px) visible by default + full-width calendar. |
| **lg 1024–1279 px** | Sidebar collapsed-by-default, toggleable. |
| **md 768–1023 px** | Sidebar hidden. Calendar full-width. |
| **sm < 768 px** | Single-column calendar, bottom nav, bottom-sheet drawers. |

### 7.5 Layout regions (desktop ≥ lg)

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP TOOLBAR (60 px)                                             │
│ [☰] FitDesk | [Today] [<] [>]  April 2026     [Week ▾] [👤]    │
├──────────────┬──────────────────────────────────────────────────┤
│ SIDEBAR      │ CALENDAR (Schedule-X, light)                     │
│ (260 px)     │   day strip with today = blue circle             │
│              │   hour grid + soft 1 px gridlines                │
│ [+ Create]   │   pastel event cards with avatar + name + time   │
│ MiniCalendar │   2 px red current-time line                     │
│ CalendarFltr │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### 7.6 Layout regions (mobile < md)

Compact top toolbar + week strip + hour grid + bottom nav + FAB. Bottom-sheet drawers preserved.

### 7.7 Calendar grid spec

- Day-strip headers: 56 px tall, today as 32-px solid blue circle.
- Hour rows: 48 px desktop, 56 px mobile.
- Half-hour: dotted `gridLine`. Hour: solid `gridLine`. Day boundary: `gridLineStrong`.
- Current-time line: 2 px `statusDanger`, ticks every 60 s.

### 7.8 Event cards

- 6 px radius, pastel fill from hashed palette, no gradient, no inner shadow.
- Content: avatar (16-px initials circle) + client name + time range.
- Status overrides: completed/cancelled → `pastel.gray`; no_show → `pastel.yellow` outlined; confirmed → 2-px left border in `statusSuccess`.

### 7.9 Schedule-X migration

- Flip `isDark: true` → `false`.
- Replace `darkColors` with `lightColors` in `STATUS_CALENDARS`.
- Override Schedule-X CSS vars in `scheduler-x-overrides.css` to map to v3 tokens.

### 7.10 FAB

- Mobile: 56-px blue circle with white plus, position bottom-right with safe-area inset.
- Desktop (≥ lg): hidden; replaced by sidebar `+ Create`.

### 7.11 Files created in Phase 5.0

- `components/scheduling/PlannerShell.tsx`
- `components/scheduling/PlannerToolbar.tsx`
- `components/scheduling/PlannerSidebar.tsx`
- `components/scheduling/MiniCalendar.tsx`
- `components/scheduling/CalendarFilters.tsx`
- `components/scheduling/SessionCard.tsx`
- `components/scheduling/NowLine.tsx`
- `lib/ui/clientColor.ts`
- `lib/ui/__tests__/clientColor.test.ts`

### 7.12 Files edited in Phase 5.0

- `lib/ui/scheduleDesignTokens.ts`
- `components/scheduling/scheduler-x-overrides.css`
- `components/scheduling/SchedulerXAdapter.tsx`
- `components/modules/ScheduleView.tsx`
- `components/scheduling/SessionDetailsSheet.tsx` (CTA color + surface)
- `components/scheduling/BookingPanel.tsx` (interim CTA color only — deleted in 5.1A)
- `components/scheduling/QuickAddPopover.tsx` (interim CTA color only — deleted in 5.1A)
- `components/modules/DashboardView.tsx`
- `components/ui/MobileShell.tsx`
- `app/globals.css`

### 7.13 Acceptance criteria

1. `npm run lint`, `npm run build`, `npx vitest run` all green.
2. Planner uses full desktop width at ≥ lg.
3. Sidebar visible at xl, collapsed at lg, hidden < md.
4. Today's date renders as a 32-px solid blue circle with white text.
5. Current-time red line visible and ticks within 60 s.
6. Event cards are pastel + avatar + name + time, 6-px radius, no gradients.
7. FAB blue on mobile, hidden on desktop.
8. No neon, no glassmorphism, no backdrop-blur, no centered mobile-card layout on desktop.
9. DashboardView adopts v3 tokens.
10. Multi-tap selection still works; drag-create + drag-reschedule still work.

### 7.14 Rollback

`git revert` the squash commit. No data/schema/API change.

### 7.15 Commit

`feat(ui): Planner layout rebuild — Google Calendar–inspired light theme (P5.0)`

---

## 8. Phase 5.1A — BookingSheet + SelectionTray (+ 5.1C/D/E folded)

### 8.1 Goal

Replace `BookingPanel` + `QuickAddPopover` with a 6-step `BookingSheet` driven by `BookingDraft`, fronted by a persistent `SelectionTray`. Includes ConflictBanner (5.1C), PackageBalanceGate (5.1D), editable draft state (5.1E covered).

### 8.2 Files created

- `components/scheduling/BookingSheet.tsx`
- `components/scheduling/SelectionTray.tsx`
- `components/scheduling/booking/BookingStepper.tsx`
- `components/scheduling/booking/BookingClientStep.tsx`
- `components/scheduling/booking/BookingDateTimeStep.tsx`
- `components/scheduling/booking/BookingPatternStep.tsx`
- `components/scheduling/booking/PerDayTimeEditor.tsx`
- `components/scheduling/booking/BookingReviewStep.tsx`
- `components/scheduling/booking/BookingSuccessSheet.tsx`
- `components/scheduling/booking/BookingStickyFooter.tsx`
- `components/scheduling/booking/CompactSessionPreview.tsx`
- `components/scheduling/booking/ConflictBanner.tsx`
- `components/scheduling/booking/PackageBalanceGate.tsx`
- `lib/scheduling/draft.ts`
- `lib/scheduling/__tests__/draft.test.ts`

### 8.3 Files edited

- `components/modules/ScheduleView.tsx` (lift `bookingDraft`; mount `SelectionTray` + `BookingSheet`)
- `components/scheduling/SchedulerXAdapter.tsx` (rename `selectedSlots` → `draftHighlight`)
- `types/scheduling.ts` (add `RepeatMode`, `PatternSlot`, `BookingDraft`, `BookingValidity`)

### 8.4 Files deleted (after green build)

- `components/scheduling/BookingPanel.tsx`
- `components/scheduling/QuickAddPopover.tsx`
- `components/scheduling/SessionPreviewByWeek.tsx`

### 8.5 Acceptance

- Multi-tap → tray → 6-step flow works end-to-end.
- `PerDayTimeEditor` allows changing Mon/Wed/Fri times without leaving sheet.
- Success state shows after every successful booking; Add-to-Calendar generates correct ICS.
- All 187 existing tests + ~20 new `draft.test.ts` tests pass.

### 8.6 Commit

`feat(scheduling): guided BookingSheet with multi-slot selection + per-day editor (P5.1A)`

---

## 9. Approval-gated phases (defer; explicit sign-off required)

### Phase 5.1F — Per-Day Working Hours + Holidays

- **Engine change** to `checkAvailability` (per-day windows + unavailable dates).
- **DocType change**: `FitDesk Trainer Settings.unavailable_dates` child table.
- **Requires:** CLAUDE.md §4 DocType approval.

### Phase 5.1G — WhatsApp Confirmation

- Optional `confirmWhatsApp?: boolean` on `bookPlanAction`.
- New `sendBookingConfirmation` in `actions/messages.ts`.
- **Requires:** WhatsApp behavior approval per CLAUDE.md.

### Phase 5.1H — Invoice Completion Hardening

- New `submitInvoiceAction` + `submitSalesInvoice` ERP client method.
- "Submit Invoice" CTA on completed `SessionDetailsSheet`.
- **Requires:** Payment-adjacent change approval per CLAUDE.md §4.

### Phase 5.1I — Playwright Smoke Tests

- Adds `@playwright/test` devDependency.
- One spec: book → reschedule → cancel → complete.
- **Requires:** New-dep approval per CLAUDE.md §4.

### Phase 5.2 — Series Editing / Resize / Smart Skip / Undo

Resize via DnD, `onConflict: 'skip'`, series-level edits, toast undo, keyboard shortcuts, ARIA hardening, DB uniqueness migration.

### Phase 5.3 — Smart Scheduling Intelligence

Natural-language quick-add (`chrono-node`), AI suggester, conflict-resilient series, no-show predictor, utilization insights.

### Phase 5.4 — Native Mobile

Shell selection (Capacitor vs Expo), offline cache, push notifications, two-way calendar sync.

---

## 10. Risk Assessment

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Schedule-X light-mode CSS vars differ from expected | Medium | Medium | Spike at start of 5.0; map every consumed var. |
| Sidebar/toolbar shifts layout on smaller laptops | Medium | Low | Test at 1024/1280/1440/1920. |
| Existing pilot users expect dark theme | Medium | Low | Pilot has not launched; no user habits formed. |
| Color migration leaves stale yellow CTAs in screenshots | Medium | Low | Re-shoot per SCREENSHOT_TEMPLATE.md. |
| Selection tray entry pattern undiscoverable | Medium | Low | First-tap dwell tooltip in 5.1A. |
| Per-day time editor tap-target too small | Low | Medium | 56-px row height minimum. |
| Schedule-X DnD regresses on adapter restyle | Low | High | Manual smoke; Playwright assertion in 5.1I. |
| Demo screenshots show old CTA color | Medium | Low | Re-shoot after 5.1A. |

---

## 11. Approval Checklist

### Plan-level
- [x] Mockup-aligned 6-step booking flow approved.
- [x] Blue primary CTA, yellow brand accent, green success, red/orange warning.
- [x] Multi-slot SelectionTray.
- [x] Sessions-per-week chip selector (1–5).
- [x] Per-day time editor.
- [x] Explicit Success state with Add-to-Calendar/Done.
- [x] Google Calendar-inspired Planner layout (Phase 5.0).
- [x] Deletion of BookingPanel/QuickAddPopover/SessionPreviewByWeek.

### Visual (Phase 5.0)
- [x] §7.3 color tokens.
- [x] §7.4 responsive breakpoints.
- [x] No dark mode in Phase 5.0.
- [x] No Google branding copying.

### Engine / types
- [x] `checkAvailability` per-day + holidays (5.1F, additive backward-compat).
- [x] `TrainerConfig` extended additively.
- [x] New `BookingDraft`/`PatternSlot`/`BookingValidity` types.

### Server / action
- [x] Optional `confirmWhatsApp` on `bookPlanAction` (5.1G).
- [x] New `submitInvoiceAction` (5.1H).
- [x] No existing signatures altered.

### ERP / DocType (require explicit per-PR approval at phase boundary)
- [ ] `Trainer Unavailability` child table (5.1F).
- [ ] DB uniqueness migration (5.2).

### Pilot / messaging
- [x] WhatsApp confirmation defaults off.
- [x] PILOT_MODE + allowlist preserved.

### Testing
- [x] All 187 existing scheduling tests stay green at every phase boundary.
- [x] Playwright as `npm run e2e` manual (5.1I).

### Rollback
- [x] Each phase ships as one squash commit.

---

## 12. Implementation phases (consolidated)

| # | Phase | Bundle | Commit |
|---|---|---|---|
| 1 | **5.0** Planner Layout Rebuild (Google Calendar-inspired) | Bundle 1 | `feat(ui): Planner layout rebuild (P5.0)` |
| 2 | **5.1A** BookingSheet + SelectionTray + ConflictBanner + PackageBalanceGate + editable draft | Bundle 2 | `feat(scheduling): guided BookingSheet (P5.1A)` |
| 3 | **5.1F** Per-day working hours + holidays | (approval) | `feat(scheduling): per-day working hours (P5.1F)` |
| 4 | **5.1G** WhatsApp confirmation | (approval) | `feat(scheduling): WhatsApp confirmation (P5.1G)` |
| 5 | **5.1H** Invoice submission | (approval) | `feat(scheduling): submit-invoice action (P5.1H)` |
| 6 | **5.1I** Playwright smoke | (approval) | `test(scheduling): Playwright smoke (P5.1I)` |
| 7 | **5.2** Series editing / resize / skip / undo | (approval) | per sub-phase |
| 8 | **5.3** Smart scheduling intelligence | (approval) | per sub-phase |
| 9 | **5.4** Native mobile | (approval) | per sub-phase |

**This run will execute Bundles 1 and 2 only.** Phases 5.1F+ require line-item approval before further work.

---

## 13. Final assessment

The scheduling engine is asset-grade and will not be touched (until Phase 5.1F, additively). The UI layer is being rebuilt in two reviewable, reversible bundles. After Bundles 1 and 2 land, the pilot has:

- A professional Google Calendar-inspired Planner.
- A guided multi-step BookingSheet with per-day editing, multi-slot selection, conflict UX, package gate, and explicit success state.
- Zero engine/ERP/server-signature risk.
- 187 unit tests still green.
- A clear path to per-day working hours, WhatsApp confirmation, invoice submission, and E2E smoke as approval-gated next steps.
