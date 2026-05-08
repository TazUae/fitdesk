# Phase 4.0 — Completion Report

**Branch:** `wip/main-2026-04-25`
**Baseline:** `2e315fd` (end of Phase 3.0, pushed to origin)
**Completion commit:** to be determined at push
**Test suite:** 225 tests across 10 files — 0 failures

## Sub-phase status

| Sub-phase | Commit | Outcome |
|---|---|---|
| 4.0.1 — Dashboard live data | `425ff25` | ✅ TODO removed, hardcoded `weeklyGoal=5` replaced, real `sessionsThisWeek` count, +12 metric tests |
| 4.0.2 — Clients workflow | `ce72900` | ✅ `custom_remaining_sessions` requested + surfaced; the three unprovisioned candidate fields (`custom_blood_type`, `custom_emergency_contact_*`) deliberately skipped |
| 4.0.3 — Sessions / live TrainerConfig | `9d3717d` | ✅ Schedule reads FitDesk Trainer Settings via the existing CP proxy; per-day windows reduced to min/max global window; falls back to PHASE1_* defaults if ERP unreachable; +11 mapper tests |
| 4.0.4 — Package balance | `2df0ce1` | ✅ Display-only per the plan; "Packages running low" row on dashboard `Needs Attention`; +4 helper tests |
| 4.0.5 — Invoice `paidAt` | `e2bd789` | ✅ `normalizeInvoice` populates `paidAt` from `modified` when fully paid (status=Paid OR outstanding=0); detail page now shows "Paid on …" |
| 4.0.6 — WhatsApp message log | `90cc520` | ✅ New `message_log` table; `getMessages` reads it; `sendMessage` audits every attempt; explicit "Preview only" banner; existing financial-message confirm preserved. **Migration required** |
| 4.0.7 — Payment readiness | `ff58d7f` | ✅ `getWhishReadiness()` returns presence flags only; "Whish Payments" card on settings; +4 tests asserting no env values leak |
| 4.0.8 — Settings write | `ac06177` | ✅ Working-days toggle + Save on settings; Schedule page revalidates after save; per-day hours / buffer / billing item still edit through ERPNext desk |
| 4.0.9 — UX polish | `49a1edd` | ✅ Reusable `<EmptyState>` and `<ErrorState>` (card + inline); applied at the rudimentary spots (schedule error, clients/invoices fetch error, clients empty) |
| 4.0.10 — Demo + report | (this commit) | ✅ Demo script + this report |

## Test / lint / build summary

| Metric | Phase 3.0 close | Phase 4.0 close | Δ |
|---|---|---|---|
| Tests | 189 | **225** | **+36** |
| Test files | 7 | **10** | **+3** |
| `npm run lint` | 1 pre-existing warning | 1 pre-existing warning (unchanged) | 0 |
| `npm run build` | clean | clean | 0 |

New test files:
- `lib/dashboard/metrics.test.ts` — active classifier, week start, low-balance, sessions-this-week
- `lib/scheduling/__tests__/trainerConfig.test.ts` — TrainerConfig mapper
- `lib/whish.test.ts` — env presence + secret-leak guard

## Required deployment step

Phase 4.0.6 introduces a new SQLite table. **Run before deploying:**
```
node scripts/migrate-app.mjs
```
The migration is idempotent (`CREATE TABLE IF NOT EXISTS`). Until it runs, `getMessages` gracefully returns `[]` so the page doesn't break.

## P0 flow status (vs the matrix in PHASE_4_0_PLAN.md)

| # | Flow | At plan time | After Phase 4.0 |
|---|---|---|---|
| 1 | Login | Done | Done |
| 2 | Dashboard | Partial | **Done** (4.0.1) |
| 3 | Settings view | Done | Done + writable working days (4.0.8) |
| 4 | Clients list | Done | Done + remaining-sessions badge (4.0.2) |
| 5 | Add client | Done | Done |
| 6 | Client profile | Partial | **Done** (4.0.2 / 4.0.4) |
| 7 | Schedule view | Partial | **Done** (4.0.3) |
| 8 | Create session | Done | Done |
| 9 | Update session status | Done | Done |
| 10 | Invoices list | Done | Done |
| 11 | Invoice detail | Done | Done + `paidAt` (4.0.5) |
| 12 | Create invoice | Done | Done |
| 13 | WhatsApp preview | Partial | **Done** (4.0.6) — preview banner + persisted history |
| 14 | Payment readiness | Partial | **Done** (4.0.7) — settings indicator |

All 14 P0 flows are now in the **Done** column.

## Architectural notes

### Trainer Settings as the single source of truth

`actions/schedulingActions.ts` no longer derives config from constants. The
new `lib/scheduling/trainerConfig.ts` reads FitDesk Trainer Settings (the
singleton from `fitdesk-app`) via the existing CP proxy on every request,
memoized by `React.cache` for the duration of one render. On ERP error
the helper falls back to PHASE1 defaults so the schedule page still
renders. `WorkingDaysEditor` in 4.0.8 writes back to the same DocType
via `PUT /api/resource/FitDesk Trainer Settings/...`.

### Data isolation guarantees

Every Phase 4 server module either:
- Imports `'server-only'` (e.g. `lib/scheduling/trainerConfig.ts`), or
- Lives under `actions/` with `'use server'` at the top.

`getWhishReadiness()` is the only Phase 4 helper that touches secrets,
and its return shape contains presence flags only. A test asserts that
the JSON-serialized output never contains the env values themselves.

### Schedule reduces per-day → global window

`mapTrainerSettings` collapses the per-day `start_time` / `end_time`
fields in the `working_days` table to a single global window using
`min(start)` / `max(end)` across enabled days. This matches the current
`TrainerConfig` shape (single `startTime` / `endTime`). Modeling per-day
windows requires schema changes to `TrainerConfig` and the engine — out
of Phase 4 scope.

## Deferred and carry-over

| Item | Status | Next phase |
|---|---|---|
| `getClientById` trainer-ownership defense-in-depth | deferred | Phase 5 |
| Per-day working-hours UI | deferred (still editable in ERP desk) | Phase 5 |
| `paidAt` per-payment timestamps from Payment Entry | deferred | Phase 5 |
| Live ERP integration tests in CI | deferred | Phase 5 |
| WhatsApp message-log DB action tests | deferred (no libsql test harness yet) | Phase 5 |
| Standard billing item edit | deferred | Phase 5 |
| Buffer minutes edit | deferred | Phase 5 |

## Acceptance criteria — final check

- [x] All 14 P0 flows in `Done`
- [x] Demo script (`docs/PHASE_4_0_DEMO_SCRIPT.md`) replayable in ≤5 min
- [x] Dashboard shows real tenant data on every metric
- [x] Schedule and Settings agree on working days
- [x] No ERP credentials, JWT secrets, webhook secrets in browser-visible payloads
- [x] No `console.log` of sensitive values in Phase 4 code
- [x] All ERP calls server-side
- [x] WhatsApp send still requires explicit user action; financial drafts have an extra confirm
- [x] Reusable empty/error state components exist
- [x] No raw ERP error strings reach the UI
- [x] Tests green (225/225)
- [x] Lint clean (only pre-existing `<img>` warning)
- [x] Build clean
- [x] `docs/PHASE_4_0_DEMO_SCRIPT.md` exists
- [x] `docs/PHASE_4_0_REPORT.md` exists

**Phase 4.0 is complete and safe to push.**
