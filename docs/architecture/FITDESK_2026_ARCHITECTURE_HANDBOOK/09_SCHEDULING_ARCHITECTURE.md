# 09 — Scheduling Architecture

> **Purpose:** Document what is **known** about scheduling/sessions, and what must **not** be
> decided or deleted yet.
> **Last verified:** 2026-06-25 · **Update 2026-07-03:** the session-architecture decision this
> document previously deferred is now settled by code — see "Session architecture (current
> truth)" below. The rest of this document's classifications (scheduler engine, orphans, branches)
> stand as of 2026-06-25 and were not re-verified in this pass.

## Session architecture (current truth, confirmed 2026-07-03)

**FD Session is the shipped, canonical session architecture.** Evidence:
`lib/scheduling/sessionRepository.ts` (`DOCTYPE_SESSION = 'FD Session'`, `DOCTYPE_SERIES = 'FD
Session Series'`), `lib/scheduling/bookingService.ts`, `lib/scheduling/sessionCompletionService.ts`,
and `lib/dashboard/dashboardDataService.ts` all read/write through this repository.

**PT Session (`lib/erpnext/client.ts:411-459`) is legacy / dead / stubbed** — kept in the codebase,
not deleted:
- `getSessions()` unconditionally returns `[]`.
- `getSessionById`, `createSession`, `markSessionComplete`, `cancelSession`, `markSessionMissed`
  all throw (`404`/`503`) with messages stating the PT Session DocType is unavailable.

**Known consequence (not fixed by this doc pass):** `app/dashboard/clients/[id]/page.tsx:61` still
calls the dead PT Session path (`getSessions` via `lib/business-data`), so the client detail page
shows an empty session history even when live FD Sessions exist for that client. Rewiring this to
`lib/scheduling/sessionRepository.ts` (`findSessionsInRange`) is scoped as **Phase 4** in
[`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md) — not
done here. **Do not delete the PT Session stub before that rewire lands and is verified.**

## Scope

`components/scheduling/*`, `components/modules/ScheduleView.tsx`, `lib/scheduling/*`,
`types/scheduling.ts`, `actions/sessions.ts`, `lib/erpnext/client.ts` (session read), and the
ERP-side session DocType.

## Current known state (verified)

### Engine & UI (live on `main`)
- **SchedulerX is the live engine.** `ScheduleView` dynamically imports `SchedulerXAdapter`
  (`@schedule-x/*` + `temporal-polyfill`). A domain engine exists at `lib/scheduling/engine.ts` (tested).
- **Live component tree:** `ScheduleView → PlannerShell → {PlannerToolbar, PlannerSidebar →
  {MiniCalendar, CalendarFilters}}` + `SchedulerErrorBoundary` + `SchedulerXAdapter → {SessionCard, NowLine}`.
- **Orphaned components:** `TimeGrid` and `SessionBlock` are imported only by each other and are not
  in the live tree (custom-grid leftovers). 🟩 FACT.
- The Planner* / MiniCalendar / CalendarFilters components are **LIVE** — not dead. 🟩 FACT.

### Scheduler branches (unmerged work)
- `scheduler/custom-v1-snapshot` — 1 unique commit (a snapshot of the custom grid).
- `scheduler/schedulex-integration` — **11 unique commits**, including **drag-to-create** and
  **drag-to-reschedule**; not an ancestor of `main`.
- `backup/prepush-schedule-c0-before-rewrite` — **72 unique commits** (substantial pre-rewrite history).

### UX regression signal (🟥 PROBLEM, Medium-High confidence)
- Current `main` adapter sets `editable: false`; `ScheduleView` does not pass `onCreate` ("Book
  session" hidden). The integration branch built drag-to-create and drag-to-reschedule — interactions
  `main` appears to lack. This is the likely basis for "schedule used to feel better."

### Session action ownership (verified from `actions/sessions.ts` 2026-06-25)

- **`bookSession` (L61-73) — SAFE.** Trainer is server-derived via `resolveTrainerId()` at L65;
  the client-supplied payload never includes a `trainer` field. 🟩 FACT.
- **`completeSession` / `cancelSession` / `noShowSession` — ownership gate IS present in code.**
  Each calls `await getSessionById(sessionId, resolved.trainerId)` before mutating (L101, L118, L135).
  Comment in source: *"Ownership gate: only the session's own trainer may complete/cancel/mark it."* 🟩 FACT.
- **BUT — `getSessionById` is a throwing stub (🟥 PROBLEM / 🟦 DECISION REQUIRED):**
  `lib/erpnext/client.ts:382-387` → `getSessionById` unconditionally throws `ERPNextError(404,
  "Session DocType is not available in this workspace.")`. It does **not** perform an ERP query
  or scope by trainer. **Effect today:** all session mutations are blocked (throw 404/503) —
  no mutation can succeed while PT Session DocType is absent. **Risk when DocType is deployed:**
  if `getSessionById` is implemented without trainer-scoping, the actions-layer gate becomes
  meaningless and the intra-tenant IDOR returns. See `docs/security/H5-trainer-ownership.md`.
- **H5 note:** `docs/security/H5-trainer-ownership.md` was written when `completeSession`/
  `cancelSession` had no ownership gates. The actions layer has since been updated. The H5
  plan's ERP-adapter implementation step (threading `trainerId` into the ERP query) is
  **still required** and must be completed when PT Session is deployed. H5 is **not closed**.

### Sessions (data) — historical ambiguity (SUPERSEDED — see "Session architecture (current truth)" above)
> The bullets below describe the state as of 2026-06-25, when only the dead PT Session path was
> known and FD Session's deployment/wiring was unconfirmed. That ambiguity is now resolved; kept
> here for history, not as current truth.
- FitDesk session **UI + actions + types are fully built** (`actions/sessions.ts` with ownership gates;
  `ERPSession` type; `getSessions` wrapper). 🟩 FACT.
- The ERP **read is intentionally stubbed**: `lib/erpnext/client.ts` states *"The PT Session DocType
  does not exist in this ERP instance."* 🟩 FACT — but this describes the dead PT Session path only.
- ~~**Naming mismatch (🟥 PROBLEM + 🟦 DECISION)**~~ — **RESOLVED:** FD Session is deployed and is
  the live path FitDesk actually reads/writes through (`sessionRepository.ts` et al.); PT Session
  is the dead stub.
- Session completion is **status-only** today: PT Session lacks `custom_billing_mode` / `invoice_id`,
  so no invoicing/decrement happens on complete (deferred by design). 🟩 FACT — again, this is the
  dead PT Session path. FD Session completion **does** carry billing hooks; see the updated
  contract status directly below.

## Billing & Session Outcome Contract

> **Status update (confirmed 2026-07-03):** session billing hooks **are implemented** on the live
> FD Session path — `lib/scheduling/sessionCompletionService.ts` implements ledger-first package
> consumption (tagged `C4C`) and idempotent pay-per-session Sales Invoice create+submit (tagged
> `C7C`). The paragraph below ("TARGET BEHAVIOR... not yet implemented") describes the old,
> PT-Session-only assumption and is **stale** for the FD Session path; it remains accurate only as
> a description of the dead PT Session stub. Live-ERP QA for the PPS invoice path has **not** been
> run yet (mock-only verification per the roadmap's C7 freeze report) — see Phase 7 in
> `FITDESK_REMAINING_ROADMAP_V2.md`.
>
> **Original status text (historical, PT-Session-only):** TARGET BEHAVIOR — session billing hooks
> are **not yet implemented** because the PT Session DocType is absent (all mutation stubs return
> `ERPNextError(503)`). This section documents what the billing flow **must** look like when the
> DocType is deployed.
> **Billing hooks must be preserved during any scheduler cleanup (F0/F1/G/H).** See `00`.

### Add Client — no financial side effects (binding, `ADR-001`)

Client creation must **never** create invoices, payment entries, WhatsApp sends, sessions, or
programs. `addClient` creates an ERP Customer and local enrichment rows only.

### Package billing mode

1. The package invoice is generated when the package is **sold/assigned** to a client — not on
   session completion.
2. The trainer records payment as **Paid Now** (immediate Payment Entry) or **Pay Later** (outstanding balance).
3. Session completion **decrements** the package session balance.
4. If decrement would put balance below zero, the UI must warn; silent over-spend is not allowed.

### Pay-per-session billing mode

1. The session price is stored on the client / local UX projection (`client_index.billingMode`).
2. A Sales Invoice is generated **automatically only after session completion** — not before.
3. The trainer is prompted to record payment (Paid Now / Pay Later) immediately post-completion.
4. Invoice generation failure must be surfaced in the UI; silent failure is not allowed.

### No-show flow

- **Package client:** trainer explicitly chooses whether to deduct a session from the package.
  Default behavior: ask. Do not auto-deduct.
- **Pay-per-session client:** trainer explicitly chooses whether to charge the missed session.
  Default behavior: ask. Do not auto-charge.
- A no-show must never create or modify a financial record without explicit trainer confirmation.

### Session completion requirements (non-negotiable)

Session completion must be:
- **Conflict-aware** — blocked or warned for invalid billing state transitions (e.g. package exhausted).
- **Tenant-scoped** — every ERP mutation carries the tenant JWT; cross-tenant completion is impossible
  by construction.
- **Trainer-owned** — `getSessionById` must scope by `trainerId` in the ERP query when the DocType
  is deployed (H5 open decision — see Open decision 5 above and `docs/security/H5-trainer-ownership.md`).
- **ERP-proxy-backed** — all invoice creation, Payment Entry creation, and session-status writes go
  through `erpFetch()` → Control Plane proxy. No direct ERP billing writes from client components.

### Financial source-of-truth rule

FitDesk local tables (`client_index.paymentSummary`, `billingMode`, etc.) may store UX projection /
read-model state but **must not become the financial source of truth**. ERPNext Sales Invoice and
Payment Entry remain authoritative. Local fields must never be used to compute financial totals,
statements of account, or payment status outside the ERP proxy path.

### Scheduling cleanup preservation rule

**Billing hooks must be preserved during any scheduler cleanup (F0/F1/G/H).** Refactoring the
scheduler UX, merging branches, renaming components, or replacing the calendar engine must not
silently remove the session-completion billing trigger. Any commit that touches `actions/sessions.ts`,
the ERP session adapter, or the scheduler engine must verify the billing hook chain is intact.

### Current implementation status (updated 2026-07-03 — two parallel action layers exist)

There are **two separate session action layers** in the codebase today; do not confuse them:

- **`actions/sessions.ts` (dead / legacy PT Session layer).** Still imports `getSessionById`,
  `markSessionComplete`, etc. from `lib/erpnext/client.ts`. All of those mutation stubs
  (`markSessionComplete`, `cancelSession`, `markSessionMissed`, `createSession`) return
  `ERPNextError(503)`/404 — PT Session DocType is absent, so this layer cannot fire a billing hook
  and fails safely. This matches the original 2026-06-25 finding below, but it now describes **only
  this dead layer**, not FitDesk's real session-completion path.
- **`actions/schedulingActions.ts` (live FD Session layer).** Calls
  `lib/scheduling/sessionCompletionService.ts`, which **does** implement the billing contract:
  ledger-first package consumption (`C4C`) and idempotent pay-per-session Sales Invoice
  create+submit (`C7C`). This is the layer real bookings/completions go through.

**Original 2026-06-25 finding (accurate only for the dead `actions/sessions.ts` / `lib/erpnext/client.ts`
layer):** all session mutation stubs return `ERPNextError(503)` — PT Session DocType is absent —
so no billing hook can fire on that path; `completeSession` calls `getSessionById` as an ownership
gate, which throws 404 first, so mutations on that layer fail safely. See comments in
`lib/erpnext/client.ts:389–416`.

**Open follow-up (not resolved by this doc pass):** `actions/sessions.ts` being dead but still
present/imported is itself a truth risk if a caller invokes it expecting real behavior — worth a
grep-audit of its callers before Phase 4 lands, so the client-detail rewire doesn't accidentally
route through the dead layer instead of `sessionCompletionService.ts` / `sessionRepository.ts`.

## Architecture rules

1. **F0 before deletion (blocking).** No `scheduler/*` branch or scheduling component may be deleted
   until the **F0 UX Archaeology Audit** documents the capability diff across the three versions.
2. **Recover before remove.** If F0 finds the integration branch had valuable UX (drag-create/
   reschedule), port it into the canonical engine **before** archiving the branch.
3. **Archive, never destroy.** Tag every `scheduler/*` and the 72-commit backup branch before any deletion.
4. **One canonical engine** after F1, recorded in `ADR-SCH-001`.
5. **Session reads stay through the proxy** (`08`). No fake session data in the UI (`11`).

## Do-not-touch areas (protected — see `00`)

- All `scheduler/*` branches, `backup/prepush-schedule-c0-before-rewrite`, `TimeGrid`, `SessionBlock`
  — frozen until F0.
- The session DocType identity is **decided** (FD Session — see "Session architecture (current
  truth)" above); the dead PT Session stub code stays untouched/undeleted until Phase 4 of
  `FITDESK_REMAINING_ROADMAP_V2.md` lands and is verified.

## Open decisions

1. ~~**PT Session vs FD Session**~~ — **RESOLVED (2026-07-03):** FD Session is canonical/shipped.
   Remaining work is the client-detail-page rewire (Phase 4) and `getSessionById` trainer scoping
   (item 5 below, H5) — not the naming decision itself.
2. **Integration-branch UX** — port drag-to-create / drag-to-reschedule into `main`, or accept reduced scope?
3. **`backup/prepush-schedule-c0`** — keep / extract / discard (after review)?
4. Session billing fields (`custom_billing_mode`, `invoice_id`) — when to add (Path-C), if at all.
   *Note:* this applies to the dead PT Session stub; FD Session's completion path already carries
   equivalent billing wiring via `sessionCompletionService.ts` (see status update above).
5. **`getSessionById` ERP implementation (H5 — not closed).** When PT Session DocType is deployed,
   `lib/erpnext/client.ts:getSessionById` must scope the ERP query by `trainerId`; otherwise the
   intra-tenant IDOR described in `H5-trainer-ownership.md` returns. The actions-layer gate is
   present; the ERP-adapter implementation is not. This is an **authorization/isolation change**
   (workspace `CLAUDE.md` §4 approval gate).

## Verification checklist

- [ ] F0 capability diff produced and signed off before any deletion.
- [ ] PT/FD Session decision recorded before any session-read deployment.
- [ ] `lib/scheduling/__tests__/engine.test.ts` green.
- [ ] Orphan removal (`TimeGrid`/`SessionBlock`) only after F0 + snapshot tag.
- [ ] When PT Session DocType is deployed: `getSessionById` scopes ERP query by `trainerId`
      (H5 not closed — see `docs/security/H5-trainer-ownership.md` and Open decision 5 above).
- [ ] **Billing contract verified** before session completion is enabled: package decrement wired;
      PPS invoice-on-completion wired; no-show trainer prompt wired; no auto-charge without confirmation;
      all billing writes go through `erpFetch()` → proxy (see Billing & Session Outcome Contract above).

## Related files

- `components/scheduling/SchedulerXAdapter.tsx`, `PlannerShell.tsx`, `SessionCard.tsx`, `NowLine.tsx`,
  `TimeGrid.tsx`, `SessionBlock.tsx`; `components/modules/ScheduleView.tsx`; `lib/scheduling/engine.ts`;
  `types/scheduling.ts`; `actions/sessions.ts`; `lib/erpnext/client.ts:373-416` (session stubs);
  `provisioning_api/api/doctype/fd_session/*`; `docs/security/H5-trainer-ownership.md` (IDOR audit).

## Related ADRs

- **Missing: `ADR-SCH-001`** (scheduling/session truth) — to be written in F1. See `14`.

## Known prior audit conclusions from planning sessions (planning-context only)

- A "Scheduling Archaeology Audit" and "ADR-SCH-001" were discussed in planning but are **not on disk**.
  The "Scheduling Recovery Plan" is likewise **not on disk**; treat it as an **input to F0**, not an
  executable and not a source file. The verified branch/commit findings above are the on-disk evidence.

## Next actions

- Historical: run F0 (UX Archaeology) early; resolve the PT/FD Session decision; only then plan F1/G.
- Current (2026-07-03): the PT/FD Session decision is resolved (see above). Next real work on this
  area is Phase 4 (client-detail-page FD Session rewire) in
  [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md);
  F0 (scheduler UX archaeology) remains a separate, still-open item for the scheduler-engine track.
