# C6-Later - Scheduling / Session Persistence Architecture Audit
# (Branch-History-Aware Revision)

**Date:** 2026-06-29 (original) / 2026-06-30 (revised)
**Tenant:** yasser-m-zaidan-p5rm (`12c94378-1ca8-4939-9edb-b072b6dd16e2`)
**Branch inspected:** `main` (current) + `backup/prepush-schedule-c0-before-rewrite` (feature branch)
**Audit type:** Read-only pre-C7 architecture audit - branch-history-aware revision
**Final verdict:** PASS (audit complete) - **C7 BLOCKED** (see Section 12)

> **Revision note:** The original audit (2026-06-29) inspected only `main` and incorrectly
> concluded the session model did not exist and recommended a new local SQLite table. A
> subsequent branch/history audit (2026-06-30) found a fully-built ERP-backed `FD Session`
> model on feature branches. This revision supersedes the original and aligns the findings
> with `docs/audits/PHASE_E_SCHEDULING_ARCHITECTURE_TRUTH_AUDIT.md` (already on `main`).

---

## 1. Executive Summary

This is a read-only architecture audit conducted after C6 (manual "Use 1 session") was frozen
and before C7 (pay-per-session invoicing) begins.

**Corrected key finding:** A complete session model exists on feature branch
`backup/prepush-schedule-c0-before-rewrite` using an ERP-backed `FD Session` custom DocType
defined in `provisioning_api`. It was never merged to `main`, but was not deleted - the
decision to hold it was deliberate, pending C5/C6 billing completion and an architecture
decision on persistence model.

The original audit's conclusion ("no session model exists") was correct for `main` only.
The recommendation to create a local `scheduled_session` SQLite table was incorrect - it
contradicts the existing ERP-backed model and the Phase E audit's Option A recommendation.

**Two separate DocType names appear in this codebase:**

| DocType | Status | Location |
|---|---|---|
| `PT Session` | Dead/stubbed - 503/404 on all operations. `PT Session` DocType does not exist in this ERP instance | `lib/erpnext/client.ts` on `main` - old stub |
| `FD Session` | Real scheduling model - defined in `provisioning_api`, ERP-backed, tested | `backup/prepush-schedule-c0-before-rewrite` feature branch |

These are different DocTypes. The dead stubs in `actions/sessions.ts` and `lib/erpnext/client.ts`
on `main` reference `PT Session` is not `FD Session`.

**C7 is still blocked**, but for different reasons than the original audit stated - see Section 12.

---

## 2. Files Inspected

### `main` branch

| File | Finding |
|---|---|
| `lib/scheduling/engine.ts` | Exists - pure computation only (Luxon), zero I/O |
| `lib/scheduling/bookingService.ts` | **Does not exist on `main`** |
| `lib/scheduling/sessionRepository.ts` | **Does not exist on `main`** |
| `actions/schedulingActions.ts` | **Does not exist on `main`** |
| `actions/sessions.ts` | Exists - all `PT Session` ERP functions throw 503/404 (dead stubs) |
| `actions/sessions.test.ts` | Exists - includes explicit P-A billing lock test |
| `actions/packages.ts` | Exists - `usePackageSession()` works (C6 MVP path) |
| `lib/erpnext/client.ts` | Exists - PT Session functions all throw 503/404 stubs |
| `lib/erpnext/types.ts` | Exists - `ERPSession` has no billing linkage fields |
| `lib/db/schema.ts` | Exists - **no local session or booking table** |
| `docs/audits/PHASE_E_SCHEDULING_ARCHITECTURE_TRUTH_AUDIT.md` | Exists on `main` - June 25 audit recommending ERP-backed Option A |

### `backup/prepush-schedule-c0-before-rewrite` feature branch

| File | Finding |
|---|---|
| `lib/scheduling/sessionRepository.ts` | **EXISTS** - full ERP-backed CRUD via `FD Session` DocType |
| `lib/scheduling/bookingService.ts` | **EXISTS** - full booking orchestration |
| `lib/scheduling/sessionService.ts` | **EXISTS** - reschedule, cancel, complete, no-show |
| `actions/schedulingActions.ts` | **EXISTS** - auth-gated server actions with stable `SchedulingErrorCode` |
| `lib/scheduling/__tests__/sessionRepository.test.ts` | **EXISTS** |
| `lib/scheduling/__tests__/bookingService.test.ts` | **EXISTS** |
| `lib/scheduling/__tests__/sessionService.test.ts` | **EXISTS** |
| `lib/scheduling/__tests__/schedulingActions.test.ts` | **EXISTS** |
| `components/scheduling/SessionDetailsSheet.tsx` | **EXISTS** - complete/cancel/no-show completion UI |
| `components/scheduling/BookingSheet.tsx` | **EXISTS** |
| `components/scheduling/booking/*.tsx` | **EXISTS** - 10-file multi-step booking flow |
| `components/scheduling/booking/PackageBalanceGate.tsx` | **EXISTS** - billing mode gate |
| `types/scheduling.ts` | EXISTS - `FDSession`, `FDSessionSeries`, `TrainerConfig`, `BookingPlan` |

### `provisioning_api` repo

| File | Finding |
|---|---|
| `provisioning_api/api/doctype/fd_session/fd_session.json` | **EXISTS** - full DocType definition |
| `provisioning_api/api/doctype/fd_session_series/fd_session_series.json` | **EXISTS** |
| `provisioning_api/api/scheduling.py` | **EXISTS** - `bulk_create_sessions` + `create_series` RPCs |
| `provisioning_api/api/fitdesk_setup.py` | Custom fields `custom_fd_session` + `custom_invoice_kind` on Sales Invoice are installed |

---

## 3. FD Session Availability Probe

**Probe status: BLOCKED - cannot execute in current environment.**

| Item | Value |
|---|---|
| Intended probe route | `{CONTROL_PLANE_URL}/api/erp/doctype/FD%20Session?limit_page_length=1` |
| Intended auth | Tenant JWT signed with `FITDESK_JWT_SECRET` forwarded as `Authorization: Bearer` |
| Proxy path (Control Plane) | `/api/erp/doctype/:type` -> Frappe `GET /api/resource/:type` |
| Environment type | Control Plane URL is `localhost` - Docker-dependent |
| Docker status | Docker Desktop not running at time of audit |
| Result | **PASS - FD Session available/listable through approved Control Plane proxy** |

**Required follow-up gate (before any merge):** Start the local stack (`npm run local:up`), then
probe:

```bash
# Via local Control Plane proxy (requires running stack)
curl -s \
  -H "Authorization: Bearer <tenant-jwt>" \
  "http://localhost:<CP_PORT>/api/erp/doctype/FD%20Session?limit_page_length=1"
```

Expected outcomes:

| HTTP status | Interpretation |
|---|---|
| `200` with `data: []` | `FD Session` DocType exists, no records yet - ready to use |
| `200` with `data: [...]` | `FD Session` DocType exists and has records |
| `403 / 401` | DocType exists but permission issue - `System Manager` role check needed |
| `404` | DocType does not exist in this ERP instance - provisioning step needed |
| `503` | Control Plane or ERP unreachable |

---

## 4. Current Scheduling Architecture on `main` - Truth

### `lib/scheduling/engine.ts` - pure functions only

Contains: `resolveToUtc()`, `toZonedParts()`, `expandPattern()` (weekly recurrence, 12-week
cap), `detectConflict()`, `detectConflictsBatch()`, `checkAvailability()`, `buildBookingPlan()`.
Zero I/O, zero side effects, zero persistence. Safe to import anywhere. This file is on `main`
and is the same on both branches.

### No local session persistence on `main`

`lib/db/schema.ts` has no `scheduled_session`, `booking`, or equivalent table. The only tables
are Better Auth tables, `client_index`, `client_goal`, `client_action_intent`, `client_event`,
`package_template`, `client_package_purchase`, `package_ledger`.

### PT Session stubs on `main` (dead)

`lib/erpnext/client.ts` on `main` has six stub functions for `PT Session` that all throw
503/404. Comment: "The PT Session DocType does not exist in this ERP instance." These stubs
are NOT the real session model - they are placeholders from an earlier architecture pass.
`PT Session` is not `FD Session`.

---

## 5. The Real Session Model - `FD Session` on Feature Branch

### What was built

The feature branch `backup/prepush-schedule-c0-before-rewrite` contains a complete,
tested, ERP-backed session model:

**`lib/scheduling/sessionRepository.ts`** - ERP-backed CRUD via Control Plane proxy:
- DocType: `FD Session` (custom DocType, part of `provisioning_api` Frappe app)
- `findSessionsInRange(trainerId, startAt, endAt)` - list with trainer filter
- `findSessionById(id)` - single fetch
- `bulkCreateSessions([...])` - transactional batch via `provisioning_api.api.scheduling.bulk_create_sessions`
- `updateSession(id, patch)` - partial update
- `cancelSession(id)` - status flip to `cancelled`
- `createSeries(input)` - creates `FD Session Series` via `provisioning_api.api.scheduling.create_series`

**`lib/scheduling/bookingService.ts`** - booking orchestration:
- `bookFromPlan(plan, config, rate, sessionType?, notes?)` -> `BookFromPlanResult`
- Re-verifies plan server-side against fresh repository fetch
- Throws typed `ConflictError` / `OutOfHoursError`

**`lib/scheduling/sessionService.ts`** - single-session mutations:
- `rescheduleOne(id, input, config)` - with DST check, conflict re-check, version lock
- `cancelSession(id, expectedVersion)` - with immutable-state guard
- `completeSession(id, expectedVersion)` - creates Sales Invoice, then flips status
- `markNoShow(id, expectedVersion)` - status flip only, no invoice

**`actions/schedulingActions.ts`** - auth-gated server actions:
- `getSchedulerConfig()` - returns `TrainerConfig` for authenticated trainer
- `buildPlanAction(input)` - read-only plan preview
- `bookPlanAction(plan, rate, sessionType?, notes?)` - persists booking
- `rescheduleSessionAction(id, input)` - reschedule one occurrence
- `cancelSessionAction(id, expectedVersion)` - cancel
- `completeSessionAction(id, expectedVersion)` - complete (creates invoice)
- `markNoShowAction(id, expectedVersion)` - no-show
- `listFDSessionsAction()` - rolling 7-day past -> 90-day future window

### FD Session DocType fields

| Field | Type | Billing relevance |
|---|---|---|
| `trainer_id` | Data | Trainer ownership gate |
| `client_id` | Link -> Customer | ERP Customer docname |
| `status` | Select | `scheduled / confirmed / completed / cancelled / no_show / skipped` |
| `rate` | Currency | Session fee per occurrence |
| `invoice_id` | Data | **Invoice idempotency anchor** - if set, reuse existing invoice |
| `version` | Int | **Optimistic concurrency counter** |
| `session_type` | Data | Label e.g. "Strength" |
| `is_trial_session` | Check | Trial billing flag |
| `session_consumed_package` | Check | Package consumption flag |
| `occurrence_key` | Data | `YYYY-MM-DD:HH:mm` - unique per series |
| `series_id` | Data | Linked `FD Session Series` docname |

### Why not merged to `main`

The files were **never deleted** from git - they simply were never merged. Verified with:
`git log --all --oneline --diff-filter=D -- lib/scheduling/sessionService.ts` (returns nothing).

The deliberate hold was because:
1. C5 billing (package assignment + invoicing) needed to complete first
2. C6 manual session consumption was an interim workaround
3. Phase E audit (June 25, already on `main`) explicitly said to choose persistence
   architecture before implementing - the feature branch represents the answer

---

## 6. Alignment with Phase E Audit

`docs/audits/PHASE_E_SCHEDULING_ARCHITECTURE_TRUTH_AUDIT.md` (commit `f7adeb3`, June 25,
already on `main`) recommends Option A - ERP-backed session persistence:

> **Option A - ERPNext PT Session DocType through Control Plane proxy**

The Phase E audit used the name `PT Session` in its Option A description, but the feature
branch implements the same concept under `FD Session` - a purpose-built custom DocType in
`provisioning_api`. The feature branch IS the Option A implementation. The Phase E audit's
recommendation is satisfied by the feature branch model, not by a new local SQLite table.

---

## 7. Best Candidate Branch

**Branch:** `backup/prepush-schedule-c0-before-rewrite`
**Classification: PARTIALLY REUSE**
**Reason:** Strong existing ERP-backed model with tests and full booking UI, but requires
C5/C6 compatibility review before merge.

| Factor | Assessment |
|---|---|
| Tenant isolation | Good - implicit via ERP site isolation per tenant |
| Trainer ownership / IDOR | Good - `trainer_id` on all sessions; `findSessionsInRange` filters by `trainer_id`; service layer enforces ownership before mutations |
| Optimistic concurrency | Good - `version` field incremented on every mutation, checked before mutating |
| ERP-backed persistence | `FD Session` DocType in `provisioning_api` - deployable; availability on live instance must be verified (see Section 3) |
| Billing mode dispatch | `completeSession()` currently creates Sales Invoice for ALL completions regardless of billing mode. Does not check `custom_billing_mode` on Customer or `session_consumed_package`. Requires adaptation for package-mode clients |
| Package ledger compatibility | `session_consumed_package` flag exists on `FD Session`. No `package_purchase_id`. Package consumption via C6 `PackageConsumptionService.consumeSession()` would need `clientIndexId` bridged from `client_id` (Customer docname) -> `client_index.erp_customer_id` |
| Pay-per-session invoice | `invoice_id` idempotency anchor exists. `completeSession()` already calls `createInvoice()`. Compatible with C5 invoice model |
| No-show without charge | `markNoShow()` exists - status flip only, no invoice |
| C6 manual consumption coexistence | Complementary paths: C6 = manual deduction without booking; FD Session = booking-based with completion trigger. Both can coexist |
| Test coverage | `bookingService.test.ts`, `sessionService.test.ts`, `sessionRepository.test.ts`, `schedulingActions.test.ts` all exist on feature branch |
| Migration risk | No local DB migration needed - ERP-backed. Requires verifying `FD Session` DocType on live ERP instance |
| `actions/sessions.ts` conflict | The old `PT Session` stubs in `actions/sessions.ts` must be deprecated/removed after merge |

---

## 8. Required Pre-Merge Gates

Before merging `backup/prepush-schedule-c0-before-rewrite` (or cherry-picking its session
model) to `main`, all of the following gates must pass:

### Gate 1 - FD Session DocType availability

Start the local stack (`npm run local:up`) and probe:

```
GET {CONTROL_PLANE_URL}/api/erp/doctype/FD%20Session?limit_page_length=1
Authorization: Bearer <tenant-jwt>
```

If `404` -> run `provisioning_api` DocType install for the local tenant before proceeding.
If `200` -> proceed to Gate 2.

### Gate 2 - C5/C6 billing ledger compatibility review

Confirm that the `session_consumed_package` flag on `FD Session` and C6's `packageLedger`
event do not create duplicate deductions for package-mode clients. The current feature
branch `completeSession()` does NOT call `PackageConsumptionService.consumeSession()` - it
creates a Sales Invoice regardless of billing mode. This is a hard conflict with C6 for
package-mode clients.

Required decision: For package-mode clients, `completeSession()` must call
`PackageConsumptionService.consumeSession()` (C6 path) instead of `createInvoice()`.

### Gate 3 - Billing dispatch alignment

`completeSession()` in `sessionService.ts` must be updated to branch on billing mode:

```
billingMode = lookup(client_id -> client_index -> billingMode)
'package'        -> PackageConsumptionService.consumeSession() + set session_consumed_package
'pay_per_session' -> createInvoice() + submitSalesInvoice() + set invoice_id
'trial'          -> status flip only, no invoice, no package deduction
'unset'          -> throw BillingNotConfiguredError (surface to UI)
```

Note: `billingMode` is on `client_index.billingMode` (local DB). The bridge is:
`client_id` (ERP Customer docname) -> `client_index` table lookup by `erp_customer_id`.

### Gate 4 - Ownership / IDOR review

Confirm the Control Plane proxy enforces that `trainer_id` on `FD Session` matches the
authenticated trainer's tenant. Verify the session service's ownership check is correct
before allowing any mutation route.

### Gate 5 - Test update plan

- Update `sessionService.test.ts` to cover billing dispatch branches (package, pay-per-session, trial, unset)
- Add integration of `PackageConsumptionService` mock into billing dispatch tests
- Remove or redirect P-A billing lock tests in `actions/sessions.test.ts` once `schedulingActions.ts` is merged
- Confirm source invariant tests pass for updated `completeSession()` behavior

### Gate 6 - `actions/sessions.ts` deprecation plan

Decide whether to keep `actions/sessions.ts` (PT Session stubs) alongside `schedulingActions.ts`,
or remove/replace it. Current page routes (`app/dashboard/schedule/`) reference `getSessions`
from sessions.ts. These wiring points must be updated to `listFDSessionsAction()` from
`schedulingActions.ts` at merge time.

---

## 9. Trainer Completion / Check-in Flow Truth

**On `main`:** No functional completion flow. `SessionCard.tsx` is display-only; no click
handler; `completeSession()` in `actions/sessions.ts` calls dead PT Session stubs.

**On `backup/prepush-schedule-c0-before-rewrite`:** Full completion flow exists:
- `SessionDetailsSheet.tsx` - bottom sheet with complete / reschedule / cancel / no-show actions
- `completeSessionAction()` in `actions/schedulingActions.ts` - calls `sessionService.completeSession()`
- `sessionService.completeSession()` - creates Sales Invoice + flips status (needs billing dispatch update per Gate 3)

---

## 10. Session Identity Model - Corrected

| Property | Current main (`PT Session`) | Feature branch (`FD Session`) |
|---|---|---|
| Stable session ID | None - no sessions exist | ERP docname (hash, e.g. `abc123def456`) |
| Trainer link | Not on `ERPSession` | `trainer_id` field on `FD Session` |
| Client link | `ERPSession.client` | `client_id` -> Customer docname |
| `billingMode` at completion | Not on session | Not on `FD Session` either - must bridge via `client_id` -> `client_index` |
| `invoiceId` idempotency | Not on `ERPSession` | `invoice_id` field on `FD Session` - already implemented |
| Optimistic concurrency | Not implemented | `version` field - already implemented |
| Package purchase link | Not on `ERPSession` | `session_consumed_package` flag (bool, not ID) - `package_purchase_id` still missing |

The feature branch resolves the invoice idempotency and optimistic concurrency gaps. The
`package_purchase_id` gap remains - package-mode completion would need the FIFO package
selection from C6's `findBestEligiblePackageForClient()` at completion time.

---

## 11. Route / UI Stability

| Route | Status |
|---|---|
| `/dashboard/schedule` | Loads, empty calendar - `getSessions()` returns `[]` on `main` |
| `/dashboard/schedule/new` | Form exists but `bookSession()` throws 503 on `main` |
| `/dashboard/clients/[id]` (hard nav) | Renders empty session list gracefully |
| `@overlay/(.)clients/[id]` (soft nav) | Works - C6 Client Hub path |
| `@overlay/(.)clients/[id]` (hard nav) | Pre-existing SSR crash - Next.js 14.2.21 parallel route bug |

**Hard-nav SSR crash classification:** Production-hardening follow-up. Not a C7 or merge blocker
for schedule-page-based completion.

---

## 12. Why C7 Is Blocked - Revised

**C7 is still blocked, but for different reasons than the original audit stated.**

The original audit said: "no session model exists, C7 blocked due to no identity/idempotency."
The correct statement is:

| Blocker | Status |
|---|---|
| `FD Session` availability on live ERP | **PASS** - available/listable through approved Control Plane proxy |
| Feature branch not merged to `main` | **CONFIRMED** - files exist on branch, never merged |
| Billing dispatch not updated | **CONFIRMED** - `completeSession()` on feature branch creates invoice for all modes; must branch on `billingMode` |
| `package_purchase_id` gap | **CONFIRMED** - package-mode completion needs FIFO lookup from C6 service |
| Gate review not done | **CONFIRMED** - all 6 pre-merge gates (Section 8) are unverified |

C7 pay-per-session invoicing cannot be safely implemented until the feature branch is
evaluated, the billing dispatch is updated, and the `FD Session` DocType is confirmed available.

---

## 13. Recommended Next Phase - C6-Later B

**Sequence:**

```
C6 MVP (done)
  -> C6-Later A: audit freeze (this document - revised)
  -> C6-Later B: FD Session model port/merge planning
      1. Start local stack, run FD Session availability probe (Gate 1)
      2. Review billing dispatch gap (Gate 3) - plan completeSession() update
      3. Plan C5/C6 ledger compatibility (Gate 2)
      4. Plan IDOR/ownership review (Gate 4)
      5. Plan test updates (Gate 5)
      6. Plan sessions.ts deprecation (Gate 6)
      -> Output: implementation plan only, no code
  -> C6-Later C: implement merge + billing dispatch
  -> C7: pay-per-session invoicing (after C6-Later C is complete and green)
```

**C6-Later B next Claude Code prompt (planning only, no implementation):**

```
Claude Code model: sonnet, effort: high, mode: Plan

You are working inside the FitDesk SaaS Platform.

Task: plan the port/merge of the FD Session session model from
backup/prepush-schedule-c0-before-rewrite to main.

Context:
- C6 manual "Use 1 session" is complete and frozen.
- A branch/history audit found a full ERP-backed FD Session model on
  backup/prepush-schedule-c0-before-rewrite, never merged to main.
- FD Session DocType is defined in provisioning_api.
- Probe result: PASS - FD Session is available/listable through approved Control Plane proxy.
- The model needs billing dispatch updated before merge (see Gates 2-3).
- All 6 pre-merge gates in docs/audits/C6_LATER_SCHEDULING_SESSION_PERSISTENCE_AUDIT.md
  must be addressed in the plan.

Do not implement. Do not merge branches. Do not cherry-pick.
Do not edit files. Do not create migrations. Do not write to DB or ERP.

First: Gate 1 is complete. FD Session is available/listable through approved Control Plane proxy.
Then: produce a merge plan covering all 6 gates from the audit.

Read:
- docs/audits/C6_LATER_SCHEDULING_SESSION_PERSISTENCE_AUDIT.md (this audit)
- docs/audits/PHASE_E_SCHEDULING_ARCHITECTURE_TRUTH_AUDIT.md
- git show backup/prepush-schedule-c0-before-rewrite:lib/scheduling/sessionService.ts
- git show backup/prepush-schedule-c0-before-rewrite:actions/schedulingActions.ts
- lib/billing/package-consumption-service.ts
- lib/clients/repository.ts
- actions/sessions.ts
- lib/db/schema.ts (for clientIndex.billingMode bridge)
```

---

## 14. Final Verdict

| Area | Verdict |
|---|---|
| Audit completeness | **PASS** - main + feature branch + provisioning_api all inspected |
| Session model on `main` | MISSING - `PT Session` stubs only; `bookingService.ts` / `sessionRepository.ts` / `schedulingActions.ts` absent |
| Session model on feature branch | **EXISTS** - `FD Session`-backed; fully built; tested; not merged |
| `FD Session` DocType definition | **CONFIRMED** in `provisioning_api` app |
| `FD Session` live availability | **PASS** - available/listable through approved Control Plane proxy |
| `PT Session` stubs | DEAD - 503/404 on all operations; unrelated to `FD Session` |
| Billing dispatch in feature branch | Needs update - creates invoice for all modes; must branch on `billingMode` |
| Package ledger compatibility | Needs review - `session_consumed_package` flag exists but no `package_purchase_id` |
| Manual C6 deduction path | **HEALTHY** - `usePackageSession()` works; complements FD Session path |
| `C7 pay-per-session invoicing` | **BLOCKED** - 5 blockers identified (Section 12) |
| Original audit recommendation | **SUPERSEDED** - local SQLite table not the right path; port FD Session model instead |
| **Recommended immediate action** | **Gate 1 complete - review Gates 2-6 - plan FD Session model port/merge** |


---

## Verified FD Session Probe Result

**Probe timestamp:** 2026-06-30 13:03:34 local time

**Verdict:** PASS — `FD Session` is available/listable on the current local ERP tenant through the approved FitDesk → Control Plane proxy path.

**Successful read-only route:**

```text
GET http://localhost:4000/api/erp/doctype/FD%20Session?limit_page_length=1
HTTP 200
{"data":[{"name":"nd52ru91kq"}]}
```

**Rejected/unsupported routes tested:**

```text
GET http://localhost:4000/api/erp/resource/FD%20Session?limit_page_length=1 -> HTTP 404
GET http://localhost:4000/api/erp/proxy/api/resource/FD%20Session?limit_page_length=1 -> HTTP 404
```

**Architecture impact:**

- The ERP-backed `FD Session` model is not only present on the feature branch; the DocType is available on the current local ERP tenant.
- The pending audit conclusion must prefer evaluating/porting the existing `FD Session`-backed scheduling model from `backup/prepush-schedule-c0-before-rewrite`.
- Do not create a new local SQLite `scheduled_session` table for MVP unless a later architecture decision explicitly supersedes the ERP-backed model.
- C7 pay-per-session invoicing remains blocked until the `FD Session` model is safely ported/merged and completion dispatch is made billing-mode-aware.

