# Sprint 1 — US-025 Tenant-Isolation Test Coverage — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> source: `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.1 US-025, cross-checked
> against `FITDESK_PRE_PILOT_GATES_V1_0.md` §3 Gate G1's required-coverage list.

## Acceptance criteria (from the backlog)

```
Trainer A cannot read Trainer B's clients.
Trainer A cannot mutate Trainer B's sessions, packages, invoices, notes, goals, or payments.
Dashboard derived queries cannot include cross-tenant records.
Repository and server-action boundaries are covered.
Missing tenant context fails closed.
```

Gate G1 additionally lists required coverage across: Clients, Client Hub, Client
goals, Client notes/events, Sessions, Packages, Package ledger, Invoices, Payments,
Action queue, Dashboard derived data, Backfill/repair operations, WhatsApp/message
logs where applicable.

## What already exists (confirmed by direct inspection before writing any code)

Per `docs/execution/FINAL_DOC_PACK_TRACEABILITY_MAP.md` (written the prior session)
and re-verified tonight, tenant-isolation test coverage is **substantially better
than the doc pack credits**. Confirmed present, with explicit cross-tenant-denial
assertions:

| Area | File | Evidence |
|---|---|---|
| Clients, goals, action queue, events | `lib/clients/__tests__/repository.test.ts` | `describe('tenant isolation', ...)`, `findClientsByStatus`, `listGoals`/`listEvents`/`listPendingActions`, `completeActionIntent`/`dismissActionIntent` all cross-tenant-denial tested (PR #25) |
| Package templates | `lib/billing/__tests__/package-template-repository.test.ts` | `describe('tenant isolation guard', ...)` |
| Package purchases | `lib/billing/__tests__/client-package-purchase-repository.test.ts` | "rejects cross-tenant template access" |
| Package ledger | `lib/billing/__tests__/package-ledger-repository.test.ts` | CTX_A/CTX_B pattern throughout |
| Package consumption | `lib/billing/__tests__/package-consumption-service.test.ts` | `describe('consumeSession — tenant isolation', ...)` |
| Package void | `lib/billing/__tests__/package-void-service.test.ts` | `describe('tenant isolation', ...)` |
| Client backfill | `lib/clients/__tests__/backfill.test.ts` | `describe('tenant isolation', ...)` |
| Client reconcile | `lib/clients/__tests__/reconcile.test.ts` | Explicit TENANT_A/TENANT_B fixtures |
| Session actions (complete/cancel/no-show) | `actions/sessions.test.ts` | Trainer-ownership denial per action (though the underlying ERP call is dead code — see `docs/audits/OVERNIGHT_FINAL_DOC_PACK_AUDIT.md` R-1; the ownership *gate* itself is real and tested) |
| Invoices | `actions/invoices.test.ts` | Explicit "ownership gate" describe blocks |
| Clients (action layer) | `actions/clients.test.ts` | Cross-tenant duplicate + cross-tenant intentId tests |
| Messages/WhatsApp (invoice context) | `actions/messages.test.ts` | "invoice ownership gate" |

**Per the mission's own instruction ("most of this already exists, don't rebuild
it"): none of the above is touched tonight.**

## Confirmed gaps (scoped for tonight)

Three concrete, precise gaps found by inspection, each fillable with a test-only
change following an already-established pattern in a sibling file:

1. **`PackageAssignmentService`** (`lib/billing/package-assignment-service.ts`,
   tested in `lib/billing/__tests__/package-assignment-service.test.ts` and
   `package-assignment-service-paid-now.test.ts`) — both test files use a single
   tenant fixture throughout. Sibling services in the same file family
   (`PackageConsumptionService`, `PackageVoidService`) both have an explicit
   `describe('... — tenant isolation', ...)` block; this one does not.
2. **`findSessionsInRange`** (`lib/scheduling/sessionRepository.ts`) — the sibling
   function `findSessionsForClient` has an explicit test asserting the ERP query
   filters include `['trainer_id', '=', ...]` ("tenant/trainer ownership boundary").
   `findSessionsInRange` has no equivalent assertion, despite being the function
   `lib/dashboard/dashboardDataService.ts` calls to build dashboard session data —
   i.e. this is the literal code path the backlog's "Dashboard derived queries
   cannot include cross-tenant records" criterion is about.
3. ~~**`getClientStatement`** (`actions/statements.ts`)~~ — **correction made during
   implementation, not a real gap.** The initial grep pass (searching for
   "cross-tenant"/"ownership"/etc.) missed `actions/statements.test.ts:105`,
   `'rejects a missing/cross-trainer client — never fetches invoices/payments'`,
   which already asserts exactly this: a rejected `getClientById` call (simulating
   a client outside the trainer's tenant) causes `getClientStatement` to return
   `{ success: false, error: 'Client not found.' }` without ever calling
   `getInvoices`/`getPaymentsForCustomer`. Caught by reading the actual file before
   writing a new test — no change made here. Left in this plan as a record of the
   correction rather than silently deleting the line item.

## Verified correct by inspection, not additionally tested tonight

`messageLog` reads/writes in `actions/messages.ts` (lines ~33–35, ~178–180) are
correctly scoped: reads filter `eq(messageLog.trainerId, resolved.trainerId)`,
writes stamp `trainerId: resolved.trainerId` server-side (never client-trusted).
This is a simple, inline, easily-auditable pattern consistent with every other
correctly-scoped path in the repo. Deferred rather than tested tonight because the
three gaps above are higher-value (a full repository class + a dashboard-feeding
query + an undertested action, vs. a two-line inline WHERE clause that's already
easy to verify by reading). Flagged in the overnight report as a small follow-up.

## Explicitly out of scope tonight

- Extending isolation coverage to `Invoice`/`Payment` reads beyond what
  `actions/invoices.test.ts` already covers (ERP-backed, not a local repository —
  lower marginal value given existing ownership-gate tests).
- Any change to `actions/sessions.ts`'s dead PT-Session-backed mutations (R-1) —
  that is a runtime dead-code question, not a test-coverage question, and modifying
  session-completion runtime behavior requires approval per `CLAUDE.md` §4.
- Building new tenant-isolation *enforcement* code anywhere — this story is test
  coverage for isolation that (per the inspection above) already exists in the
  targeted areas. If a gap-filling test reveals an actual isolation failure (not
  expected, but possible), that specific finding will be written up and the story
  will stop rather than silently patching isolation logic — see `CLAUDE.md` §4
  ("Modifying tenant isolation" requires explicit approval).

## Implementation plan

1. `lib/billing/__tests__/package-assignment-service.test.ts` — add a
   `describe('assignPackage — tenant isolation', ...)` block mirroring the pattern
   in `package-consumption-service.test.ts`/`package-void-service.test.ts`: seed a
   template/client under `TENANT_B`, attempt `assignPackage` under `TENANT_A`
   context, assert it's rejected/not-found rather than silently succeeding against
   the other tenant's data.
2. `lib/scheduling/__tests__/sessionRepository.test.ts` — add a test to the
   existing `describe('findSessionsInRange', ...)` block asserting the erpFetch
   call's `filters` param contains `['trainer_id', '=', 'trainer-1']`, mirroring
   the existing `findSessionsForClient` assertion.
3. `actions/statements.test.ts` — add an ownership-gate test: mock `getClientById`
   to reject as it would for a client outside the resolved trainer's tenant, assert
   `getClientStatement` returns `{ success: false, error: 'Client not found.' }`
   without attempting any invoice/payment read.

## Gate

`node scripts/story-gate.mjs` must pass (build:verify + full vitest suite + lint)
before this story is committed. All three new tests are themselves the "tenant-
isolation coverage" the gate's heuristic looks for.
