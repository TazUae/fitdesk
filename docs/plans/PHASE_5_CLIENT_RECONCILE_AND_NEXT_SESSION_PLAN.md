# Phase 5 — Client Reconcile & `nextSessionAtUtc` Projection Plan v1.1

> **Current status:** Active after repository revalidation
> **Revision date:** 2026-07-18
> **Supersedes:** the original 2026-07-04 Phase 5A baseline where conflicting
> **Dashboard dependency:** `FITDESK_DASHBOARD_UI_UX_FULL_PLAN_V1_2.md`
> **Roadmap authority:** `FITDESK_ACTIVE_ROADMAP_V3.md`
> **Implementation posture:** existing repositories only; no new ERP surface

---

## Binding 2026-07-18 revalidation patch

This section has precedence over any conflicting statement in the older audit body below.

### 1. Why this plan remains active

The dashboard v1.2 program requires honest scheduling state and explainable Client Pulse signals.
`nextSessionAtUtc` is therefore no longer only a Client Hub convenience. It is a required shared
projection for:

- client roster truth;
- Client Hub scheduling status;
- Dashboard Needs Attention;
- Client Pulse scheduling signals;
- first-run and reactivation guidance.

### 2. Required sequencing

```text
Dashboard operational-truth foundation
→ nextSessionAtUtc projection and availability semantics
→ Client Pulse v1
```

Do not implement Client Pulse scheduling classifications before this projection is revalidated.

### 3. Existing-data boundary

This phase may use only the existing approved paths:

```text
lib/scheduling/sessionRepository.ts
lib/dashboard/fdSessionAdapter.ts
lib/clients/repository.ts
existing tenant and trainer resolution
existing ERP client/proxy path
```

It must not add:

- a new ERP endpoint;
- a direct ERP call;
- a new Control Plane contract;
- ERP credentials in FitDesk;
- scheduling logic outside the established engine/service/repository/action boundary.

### 4. Availability is separate from value

A `null` projection is not sufficient by itself to tell the UI that no session is booked.

The projection/read contract must distinguish:

```text
available + nextSessionAtUtc value
available + no valid future session
unavailable
partial or stale
```

The UI may render “Not booked” only when the session source was successfully checked and no valid
future session exists.

When session data is unavailable, the Dashboard and Client Hub must show an unavailable or unknown
state and must not classify the client as At Risk due to missing data alone.

### 5. v1 projection semantics

When data is available, `nextSessionAtUtc` means:

> the UTC start time of the earliest valid future FD Session for the client, relative to an injected
> `now`, excluding cancelled, skipped, completed, and other terminal/non-upcoming states.

The exact eligible status allowlist must be verified against the current FD Session taxonomy.
Prefer an explicit allowlist such as `scheduled` and `confirmed` rather than a broad negative filter.

### 6. Refresh and staleness rules

The stored projection is a cache, not authoritative scheduling truth.

Minimum refresh points:

- after a successful booking;
- after a successful reschedule;
- after a cancellation affecting the projected next session;
- after completion/no-show when it changes the earliest future session;
- during the tenant-scoped reconcile run.

A projection may become stale as time passes even without a mutation. The plan must therefore record:

- `projectedAtUtc` or an equivalent freshness signal when available without schema change;
- the stale-data UI behavior;
- the manual reconcile path;
- future scheduled reconciliation as hardening, not an MVP claim.

Do not add a schema column in this phase without separate approval. When no freshness column exists,
the service result must still carry availability/freshness context for the current request.

### 7. Reconcile rules

- Dry run defaults to `true`.
- Scope is one verified tenant.
- No ERP mutation.
- No client deletion.
- No billing, payment, invoice, package-ledger, or WhatsApp mutation.
- Preserve all FitDesk-owned enrichment fields.
- Update only the projection fields explicitly approved.
- Per-client failures are isolated and reported.
- Cross-tenant access fails closed.
- The current Git diff and current repository methods must be re-audited before implementation.

### 8. Client Pulse relationship

Client Pulse v1 may consume this projection only after it can distinguish:

- verified upcoming session;
- verified no upcoming session;
- unknown/unavailable;
- stale/partial.

A missing future session is only one signal. The final Healthy / Watch / At Risk classification
requires owner-approved thresholds and precedence from the dashboard plan.

### 9. Current implementation gate

Before code changes, verify:

1. whether `nextSessionAtUtc` is still never written;
2. whether any modernization change already added a projection path;
3. current consumers in Dashboard, Client Hub, and Directory;
4. current `lib/dashboard/derive.ts` eligibility logic;
5. current FD Session status taxonomy;
6. whether the existing execution log explains changes in these files;
7. that the working tree can be changed without overwriting unrelated modernization work.

### 10. Updated recommended commits

```text
feat(clients): add tenant-safe next-session projection
```

```text
fix(clients): distinguish unavailable and unbooked session state
```

```text
chore(clients): add dry-run client session reconcile
```

Keep these separate when the diff allows it.

---

> **Date:** 2026-07-04
> **Phase:** FitDesk Remaining Roadmap v2.1 — Phase 5A (audit + docs-only implementation plan)
> **Deliverable of this run:** this plan only. **No runtime code, schema, or migration changed.**
> **Related:** [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md) §Phase 5 ·
> [`docs/architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/10_CLIENT_MANAGEMENT_ARCHITECTURE.md`](../architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/10_CLIENT_MANAGEMENT_ARCHITECTURE.md) ·
> [`docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md`](../adr/ADR-001-client-management-erp-authoritative-hybrid.md)

---

## Verdict: **GO WITH CAUTIONS**

The path is safe and the biggest structural risk is already retired: the `next_session_at_utc`
**column already exists** (`lib/db/schema.ts:154`), so Phase 5B/5C need **no schema change and no
migration**. Two existing, battle-tested precedents (`backfill.ts` and `setBillingModeIfUnset`) give
us the exact shapes to copy. The cautions are behavioral, not blocking:

1. **A projected `nextSessionAtUtc` is a cache and goes stale** — "next" drifts into the past as
   time passes, and booking/cancelling outside a reconcile run makes it wrong. Phase 5 must document
   this honestly and NOT pretend the projection is live. (Mitigations listed under Risks.)
2. **One decision is deferred to the implementer** (see "Open decision D1"): whether the Phase 5C
   reconcile also refreshes ERP-owned summary fields (name/phone/goal-label) via the existing
   backfill upsert, or projects **only** `nextSessionAtUtc`. Recommendation given below.
3. **Minor pre-existing return-value staleness** in `upsertClientFromBackfill` (documented under
   Risks R5) — noted, not fixed in this plan.

No Phase-5 stop condition is triggered (no schema/migration, no deletion, no
payment/package/invoice mutation, no ERP-proxy bypass, ownership boundary is unambiguous).

---

## Audited files (canonical `FitDesk/` tree only)

> The workspace also contains `fitdesk-platform/services/fitdesk/**` (deploy mirror) and
> `backups/**` snapshots. Those are **out of scope** and were deliberately ignored; every citation
> below is the canonical `C:\Users\Lenovo\Dev\axis-erp\FitDesk` copy.

| Area | File | What it told us |
|---|---|---|
| Projection store | `lib/db/schema.ts:134-167` | `client_index` table; `next_session_at_utc TEXT` (nullable) at `:154`; unique index `(tenant_id, erp_customer_id)` at `:164`. Also `client_goal`, `client_action_intent`, `client_event`, `client_package_purchase`, `package_ledger`. |
| Projection type | `types/clients.ts:119-146` | `ClientIndex`; `nextSessionAtUtc: string | null` at `:138` labelled "Placeholder for MVP — null until a real session store exists". |
| Repository | `lib/clients/repository.ts` | Hydrate `nextSessionAtUtc` at `:102`; written `null` at `:365` (createClientRow insert), `:575` (createClientRow return), `:759` (upsertClientFromBackfill new row). **No setter for it anywhere.** `setBillingModeIfUnset` `:644-707`; `upsertClientFromBackfill` `:714-773`. |
| Backfill (reconcile precedent) | `lib/clients/backfill.ts` | Idempotent per-tenant upsert; `dryRun` defaults true; injected `fetchCustomers`; structured `BackfillResult`; per-customer error isolation; no ERP deletes. |
| FD Session reads | `lib/scheduling/sessionRepository.ts` | `findSessionsForClient(trainerId, clientId)` (Phase 4, newest-first, no window, includes cancelled/skipped) `:148-176`; `findSessionsInRange(trainerId, start, end)` **excludes** `['status','not in',['cancelled','skipped']]` `:124-146`. All via `erpFetch`. |
| Session adapter | `lib/dashboard/fdSessionAdapter.ts` | `fdSessionToSession(fds, tz)`; status map; `localDateString`/`todayInTimezone`. Pure, no I/O. |
| Client-session helper | `lib/clients/clientSessions.ts` | Phase 4 `getClientSessions(trainerId, clientId, tz)` — FD read + map + degrade-to-`[]`. |
| Dashboard session read | `lib/dashboard/dashboardDataService.ts` | `getDashboardSessions(trainerId, tz)` — window read + map. The pattern Phase 5B derivation mirrors. |
| Actions | `actions/clients.ts` | ERP-first create; tenant context via `getTenantContext()`; `resolveTrainerId()` gate. No next-session logic. |
| List UI | `app/dashboard/clients/page.tsx` | `getDirectoryClients()` → `deriveClientRoster()`. |
| Detail UI | `app/dashboard/clients/[id]/page.tsx` | Phase 4 wired to `getClientSessions`; resolves `trainerId`+`timezone`. |
| Hub surface | `lib/clients/hub-map.ts:90`, `components/modules/ClientHubPanel.tsx:286` | Hub passes `index.nextSessionAtUtc` through and renders `formatDate(...)` **or `'Not booked'`** — the dishonest badge. |
| Trainer scope | `lib/auth/resolve-trainer.ts`, `lib/scheduling/trainerConfig.ts` | `resolveTrainerId()` + `getTrainerConfig()` (React.cache) → timezone. |
| Arch rules | `.../10_CLIENT_MANAGEMENT_ARCHITECTURE.md:58-66` | "Later projection fails → reconcile via backfill"; backfill is manual, idempotent, `tenantId+erpCustomerId`-keyed, never deletes. |

---

## Current-state findings

### 1. Where client projection data is stored
`client_index` (Drizzle `clientIndex`, `lib/db/schema.ts:134`) is the local read model / projection,
keyed uniquely on `(tenant_id, erp_customer_id)`. Enrichment lives in sibling local tables
(`client_goal`, `client_action_intent`, `client_event`, `client_package_purchase`, `package_ledger`).
**ERPNext `Customer` is the canonical identity** (ADR-001); local tables are a fast UX/enrichment
layer and are **not financial truth**. Every repository query is tenant-scoped via `assertTenantId`.

### 2. Where `nextSessionAtUtc` comes from today
**Nowhere real.** The column exists and is nullable, is hydrated on read (`repository.ts:102`), and is
written `null` in all three creation paths (`:365`, `:575`, `:759`). **No code path ever writes a
non-null value.** It therefore renders as `'Not booked'` for *every* client via
`ClientHubPanel.tsx:286`. The roadmap's "the 'No next session' badge cannot be honest" is confirmed:
the badge is structurally always-empty, independent of real bookings.

### 3. Does reconcile exist?
**No.** `lib/clients/reconcile.ts` is absent (zero runtime matches under `FitDesk/lib/`; matches are
only in docs, the `fitdesk-platform` mirror, and `backups/`). The reusable precedents are
`lib/clients/backfill.ts`, `repository.upsertClientFromBackfill`, and `repository.setBillingModeIfUnset`.

### 4. Which ERP paths are authoritative
All ERP I/O flows through `erpFetch` (→ Control Plane JWT proxy → Frappe REST). FD Sessions:
`sessionRepository.findSessionsForClient` / `findSessionsInRange`. ERP Customers (for reconcile):
the injected `fetchCustomers` callback used by `backfill.ts`, which proxies the same way. **No direct
DB access, no stored ERP credentials, no proxy bypass anywhere in the client layer.**

### 5. FitDesk-owned fields that must NOT be overwritten
On `client_index`, **trainer/product-owned** (reconcile must preserve): `whatsappEnabled`,
`billingMode`, `paymentSummary`, `safetyState`, `onboardingState`, `possibleDuplicateClientId`,
`duplicateOverrideReason`, and the local `id`. **Safe to refresh from ERP** (already done by
`upsertClientFromBackfill`): `fullName`, `phoneE164`, `primaryGoalLabel`, `primaryGoalId`.
**Projection-owned, the only field Phase 5 writes:** `nextSessionAtUtc` (+ `updatedAtUtc`).
**Never touched by reconcile:** all sibling tables (`client_goal`, `client_event`,
`client_action_intent`, `client_package_purchase`, `package_ledger`) and all ERP records
(Customer, invoices, payments, sessions).

---

## Proposed implementation architecture

### `nextSessionAtUtc` — chosen semantics
> **Definition:** the `startAt` (UTC ISO-8601 string) of the client's **earliest FD Session that is
> in the future relative to an injected `now`** and whose status is **not** `cancelled`/`skipped`;
> otherwise `null`.

- **Future-only.** Past sessions never populate "next". A client with only past sessions → `null`.
- **Excludes `cancelled`/`skipped`**, matching `findSessionsInRange`'s existing filter and the FD
  status taxonomy. (`completed` in the future is not expected but, if present, is excluded because a
  "next session" badge should mean *upcoming and still open* — implementer confirms during 5B; the
  default is: count only `scheduled`/`confirmed`.)
- **Deterministic + testable:** the derivation takes `now` as a parameter (no hidden `new Date()`),
  and reads UTC `startAt` directly (no timezone math needed for comparison; formatting to local is a
  UI concern already handled by `fdSessionToSession`).

### Pure derivation (Phase 5B, Step 1)
`lib/clients/nextSession.ts` — pure, no I/O, no `server-only`:
```
deriveNextSessionAtUtc(sessions: FDSession[], now: Date): string | null
```
Filters future + non-cancelled/skipped, sorts ascending by `startAt`, returns `[0].startAt.toISOString()`
or `null`. Mirrors the purity of `fdSessionToSession`. Fully unit-tested in isolation.

### Repository projection setter (Phase 5B, Step 2)
Add `repository.setNextSessionAtUtc(ctx, erpCustomerId, valueOrNull)` modelled **exactly** on
`setBillingModeIfUnset` (`:644-707`):
- `assertTenantId` first; tenant filter in **both** the guard SELECT and the UPDATE `WHERE`.
- Updates **only** `nextSessionAtUtc` + `updatedAtUtc`. Touches no other column.
- No-op + returns `null` when the row is absent in this tenant.
- Idempotent: writing the same value twice yields the same row (optionally short-circuit when
  unchanged to avoid a needless `updatedAtUtc` bump — implementer's call; either is safe).
- **Difference from `setBillingModeIfUnset`:** this may write repeatedly over time (it's a refreshable
  cache, not a one-way `unset→set` latch), so there is **no** `unset`-guard. It still never touches
  enrichment.
- Audit event is **optional** here and, if added, should be low-noise (e.g. only on transition to/from
  `null`) to avoid flooding `client_event` on every reconcile. Recommend: **no event in 5B**; revisit
  if operators need it.

### Dry-run reconcile (Phase 5C, Step 3) — `lib/clients/reconcile.ts`
Structural clone of `backfill.ts`:
- `dryRun` **defaults true**; real writes require explicit `{ dryRun: false }`.
- Tenant-scoped `ctx.tenantId`; **trainerId required** (next-session is a trainer-scoped FD query).
- **Injected data callbacks** (no direct ERP): a `fetchClientSessions(clientId)` fetcher wrapping
  `findSessionsForClient` (prod) / a mock (tests), exactly as `backfill.ts` injects `fetchCustomers`.
- Iterates the tenant's existing `client_index` rows (via a tenant-scoped repo read), derives the new
  `nextSessionAtUtc` per client, and — in execute mode only — calls `setNextSessionAtUtc`.
- **Per-client error isolation** (one client's ERP failure never aborts the run; collected in
  `errors[]`), matching `backfill.ts`.
- Returns a structured `ReconcileResult { inspected, projected, unchanged, cleared, skipped, errors[] }`.
- **Never deletes, never creates ERP records, never touches enrichment or sibling tables.**

### Safe write mode (Phase 5C, Step 4)
Execute mode is reached only behind an explicit `{ dryRun: false }` call from a server action or
script — **no background worker, no cron, no scheduler** in Phase 5 (roadmap non-goal). A thin
server action may wrap it later, tenant-scoped via `getTenantContext()` + `resolveTrainerId()`,
following `syncClientBillingMode` in `actions/clients.ts` as the shape.

### UI exposure (Step 5) — later, optional
Once the projection is populated, `ClientHubPanel.tsx:286` becomes truthful automatically (no UI
change required). Any explicit "Reconcile now" button is out of Phase 5 scope.

### Data-flow summary
```
reconcileTenant(repo, {tenantId, trainerId, dryRun}, fetchClientSessions)
  └─ repo.listClients(tenant)                    // existing tenant-scoped read
       └─ for each client (error-isolated):
            fetchClientSessions(clientId)         // → findSessionsForClient → erpFetch (proxy)
            deriveNextSessionAtUtc(sessions, now) // pure
            if !dryRun: repo.setNextSessionAtUtc(tenant, erpCustomerId, value)  // only this field
  └─ ReconcileResult (structured summary)
```

---

## Exact non-goals (Phase 5)

- **No schema change, no migration** — the column exists; if either is ever "needed," **STOP**.
- **No deletion** of clients, sessions, goals, events, packages, invoices, or payments — ever.
- **No enrichment overwrite:** `whatsappEnabled`, `billingMode`, `paymentSummary`, `safetyState`,
  `onboardingState`, duplicate fields, and all sibling tables are read-only to reconcile.
- **No ERP mutation** — reconcile is read-from-ERP / write-local-projection only; no Customer,
  invoice, payment, package, or session writes; no session creation.
- **No direct ERP calls / no stored credentials** — proxy (`erpFetch`) via injected fetcher only.
- **No background worker / cron / queue** — manual/explicit invocation only.
- **No booking-path coupling in Phase 5** — updating `nextSessionAtUtc` at booking/cancel time in
  `actions/schedulingActions.ts` is a **separate** future item (it edits scheduling write logic).
- **No cross-tenant reads** — every path `assertTenantId`-guarded.

---

## Test plan

### Pure derivation (`deriveNextSessionAtUtc`)
1. No sessions → `null`.
2. Only past sessions → `null`.
3. Future sessions present → nearest **future** `startAt` (ISO), not an earlier past one.
4. Mixed past+future → ignores past, returns earliest future.
5. `cancelled`/`skipped` future sessions ignored (a cancelled soonest + scheduled later → the
   scheduled one).
6. Exactly-`now` boundary is deterministic and documented (recommend: strictly `> now`).
7. Unsorted input still yields the earliest future (sort is internal).

### Repository setter (`setNextSessionAtUtc`)
8. Writes a non-null value and re-reads it back.
9. Clears to `null` (future→none transition) correctly.
10. **Tenant isolation:** tenant A cannot update tenant B's row (guessed `erpCustomerId` is a no-op → `null`).
11. Absent client in tenant → `null`, no write.
12. **Enrichment preserved:** seed a row with `whatsappEnabled/billingMode/safetyState/onboardingState`
    set; after the setter, those fields and all sibling-table rows are byte-for-byte unchanged.
13. Idempotent: same value twice → stable row.

### Reconcile (`reconcileTenant`)
14. **Dry-run writes nothing** (DB identical before/after; result still reports intended `projected`).
15. Execute mode projects the derived value per client.
16. **Per-client ERP error is isolated** — one failing fetch lands in `errors[]`, others still project.
17. **Tenant/trainer scope** — only the active tenant's rows are inspected/written.
18. **No ERP mutation / no proxy bypass** — assert the injected fetcher is the only ERP touchpoint and
    no `createSession`/invoice/payment/`updateClient` mock is ever called.
19. Reconcile does **not** erase enrichment (same assertion as #12, end-to-end).
20. Empty tenant (no clients) → zero-count result, no error.

### Regression
21. Full `npm test` stays green (current baseline **1584**), plus `lint` + `build:verify`.

---

## Risks

- **R1 — Projection staleness (primary caution).** `nextSessionAtUtc` is a cache: it drifts as time
  passes and as bookings/cancellations happen outside a reconcile run. *Mitigation:* document it as
  "accurate as of last reconcile"; keep booking-time refresh and/or read-time recomputation as named
  follow-ups (not Phase 5). Never claim it is live.
- **R2 — Tenant leakage.** A reconcile that iterates clients must never cross tenants. *Mitigation:*
  mandatory `assertTenantId`; tenant filter in every SELECT and UPDATE; explicit isolation tests
  (#10, #17).
- **R3 — Enrichment clobber.** A careless `UPDATE ... SET (many fields)` could wipe trainer data.
  *Mitigation:* the setter writes **only** `nextSessionAtUtc`+`updatedAtUtc`; test #12/#19 enforce it.
- **R4 — Event-log flooding.** Emitting a `client_event` per client per reconcile would bloat the
  audit table. *Mitigation:* no event in 5B; if added later, gate on `null↔value` transitions only.
- **R5 — Pre-existing return-value staleness in `upsertClientFromBackfill`** (`repository.ts:740`):
  the returned object reflects `fullName/phoneE164/updatedAtUtc` but not the just-written
  `primaryGoalLabel/primaryGoalId`. DB is correct; only the in-memory return is stale. *Not fixed in
  Phase 5* — flagged for a later cleanup so reconcile authors don't rely on that return shape.
- **R6 — ERP unavailability.** FD Session reads can 4xx/5xx. *Mitigation:* per-client error isolation
  + overall degrade-safe (like `getClientSessions`/`getDashboardSessions` returning `[]`); a failed
  fetch must not null-out an existing good projection unless the client genuinely has no future
  session (implementer: on fetch error, **skip** the client — do not clear — and record in `errors[]`).

---

## Implementation prompts

### Phase 5B — derivation + tenant-scoped projection setter (+ tests), no reconcile yet
```
Implement Phase 5B — pure nextSessionAtUtc derivation and a tenant-scoped repository setter.
Scope ONLY:
  1. Create lib/clients/nextSession.ts exporting
     deriveNextSessionAtUtc(sessions: FDSession[], now: Date): string | null
     — future-only, exclude cancelled/skipped, earliest startAt as ISO, else null. Pure, no I/O.
  2. Add ClientRepository.setNextSessionAtUtc(ctx, erpCustomerId, value: string | null) modelled on
     setBillingModeIfUnset: assertTenantId; tenant filter in guard SELECT and UPDATE; update ONLY
     nextSessionAtUtc + updatedAtUtc; no unset-guard (refreshable); no enrichment touched; no event.
  3. Tests: derivation cases (#1–7) and setter cases (#8–13), including the enrichment-preservation
     and tenant-isolation assertions.
Constraints: no schema/migration change (column exists at schema.ts:154); no ERP calls in these units;
do not touch sibling tables; do not edit booking/scheduling logic; do not create sessions.
Verify: targeted tests, npm test (baseline 1584), lint, build:verify. Commit:
  feat(clients): derive and persist nextSessionAtUtc projection
Do not push.
```

### Phase 5C — dry-run-first reconcile utility (+ tests)
```
Implement Phase 5C — tenant-scoped, idempotent, dry-run-first client reconcile.
Scope ONLY:
  1. Create lib/clients/reconcile.ts modelled structurally on lib/clients/backfill.ts:
     reconcileTenant(repo, ctx{tenantId, trainerId, dryRun?=true}, fetchClientSessions) → ReconcileResult
     { inspected, projected, unchanged, cleared, skipped, errors[] }. dryRun defaults true; real writes
     require { dryRun:false }. Per-client error isolation. Injected fetchClientSessions (prod wraps
     findSessionsForClient; tests mock it) — no direct ERP, no proxy bypass, no credentials.
     Uses deriveNextSessionAtUtc + setNextSessionAtUtc from 5B. On fetch error: skip client, record in
     errors[], do NOT clear an existing projection.
  2. Tests: reconcile cases (#14–20) + enrichment-preservation end-to-end.
Constraints: no schema/migration; no deletion; no ERP/invoice/payment/package/session mutation; no
background worker; tenant-scoped only. Verify: targeted tests, npm test, lint, build:verify. Commit:
  feat(clients): add dry-run-first tenant reconcile for next-session projection
Do not push.
```

---

## Open decision (implementer, at 5C)

- **D1 — Reconcile scope.** Should 5C reconcile *also* refresh ERP-owned summary fields
  (`fullName/phoneE164/primaryGoalLabel/primaryGoalId`) by reusing `upsertClientFromBackfill`, or
  project **only** `nextSessionAtUtc`? **Recommendation: project only `nextSessionAtUtc` in Phase 5C.**
  Summary-field refresh already has a home in `backfill.ts`; keeping reconcile single-purpose makes it
  smaller, safer, and easier to reason about. Combine later only if operators ask for a one-shot
  "repair everything" run.

---

## Commit recommendation

This run is **docs-only**. If and only if the sole changed path is
`docs/plans/PHASE_5_CLIENT_RECONCILE_AND_NEXT_SESSION_PLAN.md` (no runtime/schema/migration/env/lockfile
changes, no secrets), stage exactly that file and commit:

```
docs(clients): plan reconcile and next session projection
```

Do **not** push. Phase 5B/5C implementation happens in later, separately-verified runs.
