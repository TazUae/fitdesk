> **Status:** Completed and frozen - historical implementation plan
> **Closeout authority:** Phase 6 closeout evidence and docs/plans/FITDESK_ACTIVE_ROADMAP_V3.md
> **Archived date:** 2026-07-18
> **Instruction:** Do not execute this historical plan without a new current-state audit.
> **Note:** Relative link paths were depth-adjusted on 2026-07-19 for the archive location. No other content was modified.

---

# Phase 6 — Package / Session Ledger Hardening Plan (6A)

> **Date:** 2026-07-04
> **Phase:** FitDesk Remaining Roadmap v2.1 — Phase 6A (audit + docs-only implementation plan)
> **Deliverable of this run:** this plan only. **No runtime code, schema, or migration changed.**
> **Related:** [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](./FITDESK_REMAINING_ROADMAP_V2.md) §Phase 6 ·
> [`docs/architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/09_SCHEDULING_ARCHITECTURE.md`](../../../architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/09_SCHEDULING_ARCHITECTURE.md) ·
> `docs/architecture/FITDESK_BILLING_PACKAGE_ERP_DECISION.md`

---

## Verdict: **GO WITH CAUTIONS**

The billing layer is already mature and safe for the common cases: the ledger is append-only, balance
is always derived (`SUM(delta_units)`, never a stored counter), same-session consumption is DB-enforced
idempotent (`package_ledger_tenant_idempotency_uq`), tenant isolation is enforced everywhere, and both
package and pay-per-session completion paths are wired with partial-failure-safe ordering. Phase 6 is
**hardening, not construction.**

The single real data-integrity gap is a **last-unit concurrency race** in
[`package-consumption-service.ts:86`](../../../../lib/billing/package-consumption-service.ts): the balance
is read *outside* the transaction that appends the debit (read-then-insert TOCTOU). Two *different*
sessions racing on a package's final slot can each pass the `balance > 0` guard and each append `-1`,
driving the derived balance to `-1`. The idempotency key protects the *same* session from
double-consuming; it does **not** protect two different sessions from over-consuming.

Why **cautions**, not an unqualified GO:
1. **The fix is code-only, but the concurrency *proof* is hard.** The strongest fix (a single atomic
   conditional `INSERT … SELECT … WHERE balance ≥ 1`) needs no schema change, but vitest runs
   single-threaded against a temp-file SQLite DB — a *true* OS-level race cannot be reproduced there.
   Tests can prove the guard's *logic* (sequential exhaustion, the conditional never inserts past
   zero) but cannot prove behavior under genuine parallelism, and local SQLite isolation may differ
   from remote Turso/libSQL. This is called out as **Stop-condition S7**.
2. **Any `package_ledger` column addition is a schema change** → hard approval gate (Roadmap Risk
   Register; Stop-condition S1). 6B/6C are designed to need none.
3. **ERP Payment Entry / submitted-document mutation is explicitly deferred** to a separately-approved
   sub-phase (Stop-conditions S2/S3). This plan touches neither.

---

## Audited files (canonical `FitDesk/` tree only)

> The `fitdesk-platform/services/fitdesk/**` deploy mirror and `backups/**` snapshots were ignored.

| Area | File | What it told us |
|---|---|---|
| **Consumption service** | [`lib/billing/package-consumption-service.ts`](../../../../lib/billing/package-consumption-service.ts) | The hardening target. Idempotency pre-check `:70`; balance read `:86` **outside** the append transaction `:98-113` → the read-then-insert TOCTOU. Idempotency key `session_consumed:{sessionId}` `:66`. Returns structured outcomes (`consumed`/`already_done`/`no_package`/`no_balance`); never throws for business outcomes. |
| **Ledger repository** | [`lib/billing/package-ledger-repository.ts`](../../../../lib/billing/package-ledger-repository.ts) | Append-only; `appendEvent` is the only writer `:174`. Idempotency pre-check `:223` + `UNIQUE`-constraint race recovery `:252-263` (replays on payload match, throws on payload divergence). Balance derived via `SUM` `:132-149`. Direction validated `:208`. No update/delete/void. |
| **Purchase repository** | [`lib/billing/client-package-purchase-repository.ts`](../../../../lib/billing/client-package-purchase-repository.ts) | Purchase creation in one tx `:568`; `first_sold_at_utc` stamped race-safely via `WHERE … IS NULL` `:588-599`; `findBestEligiblePackageForClient` expiry-first, NULLs-last `:230-260`; `recordInvoiceCreated`/`attachInvoiceAndActivate` idempotent on `erpSalesInvoiceId`. |
| **Session completion** | [`lib/scheduling/sessionCompletionService.ts`](../../../../lib/scheduling/sessionCompletionService.ts) | Pure, fully DI'd. Guard order: version check `:165` (optimistic concurrency) → terminal-state check `:170`. Trial → status-only `:175`. Package → ledger-first consume then status write `:235-262`. PPS → invoice create+submit **before** status write, idempotent via `findInvoiceBySession` `:189-233`. Fails closed on `unset`/unknown mode. |
| **Completion action (billing-wired)** | [`actions/schedulingActions.ts:283-336`](../../../../actions/schedulingActions.ts) | `completeSessionAction(id, expectedVersion)` — resolves trainer + tenant, injects billing deps, calls `completeSession`. This is the **authoritative** FD-Session completion path. |
| **Completion action (legacy)** | [`actions/sessions.ts:92-107`](../../../../actions/sessions.ts) | Legacy `completeSession(sessionId, notes)` → `markSessionComplete`; carries an unfilled `TODO(P-C)` for billing `:87-90`. **No billing dispatch.** Dual-path risk — see R7. |
| **Manual "Use 1 session"** | [`actions/packages.ts:180-219`](../../../../actions/packages.ts) | Hub action; requires caller-supplied `idempotencyKey` `:191`; passes it as `sessionId` into the same `PackageConsumptionService`. Same TOCTOU applies here. |
| **Void / reversal** | [`lib/billing/package-void-service.ts`](../../../../lib/billing/package-void-service.ts) | Compensating `refund_credit` event; strict eligibility (complimentary, unpaid, fully unused); idempotent via `voidIdempotencyKey`; no schema migration. Reversal already exists. |
| **PPS invoice builder** | [`lib/scheduling/sessionInvoiceBuilder.ts`](../../../../lib/scheduling/sessionInvoiceBuilder.ts) | Builds the Sales Invoice payload anchored on the FD Session docname. |
| **Taxonomy** | [`lib/billing/taxonomy.ts`](../../../../lib/billing/taxonomy.ts) | Canonical event types `:45-54`; direction map `:109-116`; `ledgerDeltaMatchesDirection` `:119`. `session_consumed` = negative. |
| **Schema** | [`lib/db/schema.ts:278-336`](../../../../lib/db/schema.ts) | `client_package_purchase` + `package_ledger`. `package_ledger` has **no balance column** (event-sourced). CHECK constraints + partial unique indexes live in the migration DDL, not Drizzle. |
| **Migration DDL** | [`scripts/migrate-app.mjs:201-227`](../../../../scripts/migrate-app.mjs) | Confirms `delta_units != 0` CHECK `:212`, `event_type` CHECK `:208`, and the partial unique index `package_ledger_tenant_idempotency_uq` on `(tenant_id, idempotency_key)` `:225-227` — the same-session idempotency guarantee is **DB-enforced and real**. |
| **Existing consumption tests** | [`lib/billing/__tests__/package-consumption-service.test.ts`](../../../../lib/billing/__tests__/package-consumption-service.test.ts) | Covers happy path, idempotent replay, independent sessions, `no_package`, **sequential** `no_balance`, expiry, selection order, tenant isolation, input validation, source invariants. **No concurrent last-unit race test** — the exact gap Phase 6 must add. |

---

## Current-state findings

### 1. Ledger & purchase structures
`package_ledger` is an append-only, event-sourced log; balance is derived per `package_purchase_id`
as `SUM(delta_units)`. `client_package_purchase` is one row per sale, carrying local + ERP identity,
an immutable template snapshot, lifecycle status, and an optional `erp_sales_invoice_id`. Package
*templates* are the reusable catalog. All three are tenant-scoped in every query.

### 2. Session completion flow
`completeSessionAction` → `completeSession` (pure, DI'd). Guards: **optimistic version check** then
**terminal-state check**. Then billing dispatch: **trial** = status-only; **package** = ledger-first
consume (`consumeForSession`) then ERP status write with `sessionConsumedPackage=true`;
**pay-per-session** = idempotent invoice create+submit *before* the ERP status write.

### 3. Idempotency protections (already present)
- **Same-session package consumption:** key `session_consumed:{sessionId}`, DB-enforced by
  `package_ledger_tenant_idempotency_uq`, with an app-level pre-check *and* a UNIQUE-violation
  recovery path that replays on payload match / throws on payload divergence. Solid.
- **PPS invoice:** `findInvoiceBySession` anchors on the FD Session docname; retries reuse the
  existing invoice (submit a lingering draft; reject a cancelled one). No duplicate invoices.
- **Package purchase:** partial unique index on `(tenant_id, idempotency_key)`.
- **Package void:** `voidIdempotencyKey` prevents double-reversal.

### 4. Concurrency protections
- **Session mutation:** optimistic concurrency via `expectedVersion` in `completeSession` — two
  stale-read completions can't both win.
- **Purchase activation / first-sold stamping:** race-safe conditional `WHERE` clauses.
- **Ledger last-unit debit:** **THE GAP.** Balance is read at `:86` outside the append transaction;
  the append `:98-113` does not re-check balance. Under real concurrency, two different sessions on
  the last slot both pass and both debit → **negative balance possible.** The idempotency key does
  not help here because the two requests have *different* keys.

### 5. Package vs pay-per-session logic
Both fully implemented and kept separate by billing-mode dispatch. Package never creates an invoice;
PPS never touches the ledger. `unset`/unknown modes fail closed.

### 6. What is stubbed / missing / unsafe
- **Missing:** atomic last-unit guard (negative-balance prevention under concurrency); a concurrent
  double-submit test; an explicit **reconcile-required** marker for the (narrow) "ledger debited but
  ERP status write permanently fails" divergence.
- **Legacy/unsafe path:** `actions/sessions.ts::completeSession` still exists with no billing
  dispatch (`TODO(P-C)`). If any live UI calls it for a package/PPS client, consumption/invoicing is
  silently skipped. Needs a wiring audit (R7).
- **Not a bug, by design:** on package partial failure the ledger debit lands but
  `sessionConsumedPackage` stays false; the next retry re-enters `consumeForSession`, gets
  `already_done` (no second debit), and re-attempts the ERP write — convergent and safe.

---

## Risk analysis

- **R1 — Double-click / double-submit (same session).** *Covered today.* Idempotency key + partial
  unique index make a repeat a no-op (`already_done`). PPS reuses the existing invoice. Keep a
  regression test.
- **R2 — Concurrent completion of the last unit (different sessions).** **PRIMARY RISK.** TOCTOU at
  `:86` → balance can go negative. Target of Phase 6C.
- **R3 — Package balance negative.** Consequence of R2. No DB-level guard exists (CHECK cannot
  express a cross-row aggregate; there is no balance column). Fix must be an atomic conditional write
  or equivalent.
- **R4 — ERP invoice/payment divergence (PPS).** *Low.* Invoice is issued before the status write and
  reused on retry via the session anchor; no duplicate invoices. Cancelled-invoice reuse is explicitly
  rejected.
- **R5 — Partial failure between ERP and local ledger (package).** *Convergent on retry* via ledger
  idempotency. Residual: if the ERP status write *never* succeeds, a debit persists with no completed
  session and no explicit "reconcile-required" flag. Documentation/marker is a 6E question.
- **R6 — Retry & reconciliation behavior.** Retries are safe for both modes. There is no *automatic*
  reconciler and none should be added in Phase 6 (Roadmap non-goal). Manual, dry-run-first only.
- **R7 — Dual completion path / ownership boundary.** Legacy `actions/sessions.ts` completion bypasses
  billing. Both actions enforce trainer ownership + tenant scope, so this is a *correctness/billing*
  risk, not an isolation breach — but it must be audited before 6C so hardening isn't applied to a
  path the UI has already abandoned (or, worse, left live).

---

## Proposed implementation split

> Each sub-phase is independently committable and independently verifiable. **6B and 6C are
> designed to need no schema change and no ERP writes.** Anything beyond that hits a stop condition.

### Phase 6B — pure ledger/idempotency helpers + tests (safe, no schema, no ERP)
- Extract/confirm pure helpers with exhaustive unit tests: idempotency-key construction
  (`session_consumed:{sessionId}`), `ledgerDeltaMatchesDirection`, and a pure
  `projectBalanceAfter(events, delta)` / "would this debit breach zero?" predicate that 6C's guard and
  tests can share. No I/O. This isolates the *logic* of the negative-balance invariant from the
  concurrency mechanism, so it is fully provable in unit tests.
- Add the **missing regression tests** against the *current* service that don't require the 6C guard:
  sequential exhaustion never goes below zero; independent sessions consume independently; replay is a
  no-op.
- **Commit:** `feat(billing): pure ledger idempotency + balance-guard helpers`

### Phase 6C — atomic last-unit consumption guard (code-only, no schema)
- Replace the read-then-insert in `consumeSession` with a **single atomic conditional append**: insert
  the `session_consumed(-1)` row *only if* the derived balance for that purchase is `≥ 1`, expressed
  as one SQL statement (`INSERT … SELECT … WHERE (SELECT COALESCE(SUM(delta_units),0) …) >= 1`), so
  there is no window between the check and the write. This prevents negative balance **regardless of
  transaction isolation** and needs **no `package_ledger` column** and **no migration**. Keep the
  idempotency-key UNIQUE index as the same-session guard; keep the `already_done`/`no_balance`/
  `no_package` outcome contract unchanged.
- If the atomic insert affects zero rows because balance was exhausted concurrently, return
  `no_balance` (not an error) — matching today's contract.
- **Caution (S7):** the concurrency *proof* is limited to (a) unit tests of the pure predicate, (b) a
  sequential-exhaustion test asserting the guard never inserts past zero, and (c) a best-effort
  interleaved-promises test. A genuine multi-threaded race is not reproducible in the vitest harness;
  the correctness argument rests on the single-statement atomicity of the conditional insert under
  SQLite's write serialization. State this explicitly in the test file and the commit body.
- **Commit:** `feat(billing): atomic conditional guard against negative package balance`

### Phase 6D — session-completion intent state hardening (audit-gated)
- **Audit first (R7):** confirm which completion action the live UI calls. If the legacy
  `actions/sessions.ts` path is dead, document it as such (or remove it in a separate, approved
  change); if it is live for billable clients, that is a billing-correctness defect to escalate before
  proceeding. No code change lands here without that determination.
- Only if warranted: strengthen the version/terminal-state guards' test coverage. No new state
  machine, no schema.

### Phase 6E — failure / retry / reconcile documentation (doc-first)
- Document the package partial-failure convergence and the residual "debit-without-completion"
  divergence (R5). Decide — **as a documented proposal, not code** — whether a `reconcile_required`
  marker is warranted. Any marker that needs a new column is a **schema change → STOP / approval**.
- **Deferred entirely:** ERP Payment Entry creation/mutation and any submitted-document changes.

---

## Exact non-goals (Phase 6, this plan and 6B/6C)

- **No schema change, no migration.** If 6C or any later step appears to *need* a `package_ledger`
  column (e.g. a stored balance, a `reconcile_required` flag, audit metadata), **STOP and request
  approval** (Roadmap Risk Register).
- **No ERP Payment Entry, no ERP submitted-document mutation, no invoice creation** in 6B/6C.
- **No new automatic reconciler / background worker / cron / queue.**
- **No manual-invoice path exposed** — the hidden "+ Invoice" affordance stays hidden (protected UX
  decision).
- **No ERP-proxy bypass, no stored ERP credentials** — all ERP I/O stays on `erpFetch`.
- **No deletion** of ledger rows, purchases, invoices, or payments — reversals are compensating
  events only.
- **No cross-tenant reads/writes** — every path stays `assertTenantId`-guarded.
- **No change to the append-only ledger invariant** — `appendEvent` remains the only writer.

---

## Test plan

### Pure helpers (6B)
1. Idempotency key = `session_consumed:{sessionId}` exactly.
2. Direction guard: `session_consumed` requires negative delta; positive is rejected.
3. `projectBalanceAfter` / breach predicate: balance 1 + (−1) → 0 (allowed); balance 0 + (−1) →
   breach (rejected).

### Consumption guard (6C)
4. **Sequential exhaustion never goes negative** — N grants, N+1 debits: the (N+1)th returns
   `no_balance`, and the derived balance floors at 0.
5. **Concurrent double-submit does not double-consume** — two different `sessionId`s on a
   balance-1 package via interleaved promises: **exactly one** `consumed`, the other `no_balance`;
   final balance = 0, never −1. *(Best-effort under S7; assert the invariant, document the harness
   limitation.)*
6. **Idempotent retry returns the same final result** — same `sessionId` twice → `already_done`, no
   second event, unchanged balance.
7. **Package cannot go negative** — direct assertion on derived balance after any mix of the above.
8. **Tenant/trainer isolation** — a debit under tenant A never affects tenant B's balance; ownership
   gate rejects foreign sessions.
9. **Package vs pay-per-session stay separated** — package completion writes no invoice; PPS
   completion writes no ledger event.

### Failure semantics (6C/6D, using the DI'd completion service)
10. **ERP failure does not silently mark the ledger complete in a divergent way** — if the ERP status
    write fails after a package debit, a retry yields `already_done` (no second debit) and re-attempts
    the write; assert no double consumption and convergent state.
11. **Local ledger failure after ERP success (PPS)** — invoice already issued; retry reuses it via the
    session anchor (no duplicate). If/when a `reconcile_required` marker is introduced (6E, approval),
    assert it is set rather than the completion being silently dropped.
12. **No manual invoice path exposed** — source-invariant test (mirroring the existing
    "no forbidden patterns" test) asserting the package/consumption modules create no invoices and the
    hidden affordance remains absent.

### Regression
13. Full `npm test` stays green (current baseline **1607**), plus `lint` + `build:verify`.

---

## Stop conditions for implementation

Halt and request approval (do **not** work around) if any of these arise:

- **S1 — A schema or migration is required** (any `package_ledger`/`client_package_purchase` column,
  index change, trigger, or CHECK addition).
- **S2 — An ERP *submitted document* write is required** (submit/cancel/amend of an ERP doc beyond the
  already-wired PPS invoice create+submit).
- **S3 — A Payment Entry mutation is required.**
- **S4 — Uncertainty about idempotency-key design** (e.g. the manual "Use 1 session" key colliding
  with the FD-Session-derived key namespace).
- **S5 — Uncertainty about tenant/trainer ownership** on any touched path.
- **S6 — Production data is required** to validate.
- **S7 — Concurrency behavior cannot be proven in tests.** The vitest harness cannot force a true
  race; if a proposed fix *depends on* transaction-isolation semantics that only hold on remote
  Turso/libSQL (not local SQLite), stop and escalate rather than shipping an unprovable guarantee.
  (The recommended single-statement conditional insert sidesteps this by not relying on isolation, but
  any pivot to row-locks/`BEGIN IMMEDIATE`/triggers re-triggers S7 and likely S1.)

---

## Implementation prompts

### Phase 6B — pure ledger idempotency + balance-guard helpers (safe)
```
Implement Phase 6B — pure, no-I/O ledger helpers + missing regression tests. No schema, no ERP.
Scope ONLY:
  1. Add/confirm pure helpers (idempotency key builder, direction guard reuse, and a
     breach predicate e.g. wouldBreachZero(currentBalance, delta)). No DB, no imports of erpFetch.
  2. Unit tests for helpers (test-plan #1-3).
  3. Add regression tests to the existing consumption suite that need no new guard:
     sequential exhaustion floors at 0 (#4 partial), replay no-op (#6), independent sessions.
Constraints: no schema/migration; no ERP; no invoice; append-only ledger unchanged; tenant-scoped.
Verify: targeted tests, npm test (baseline 1607), lint, build:verify.
Commit: feat(billing): pure ledger idempotency + balance-guard helpers
Do not push.
```

### Phase 6C — atomic conditional negative-balance guard (code-only, no schema)
```
Implement Phase 6C — replace the read-then-insert in package-consumption-service.ts:86 with a single
atomic conditional append that inserts session_consumed(-1) ONLY IF derived balance >= 1.
Scope ONLY:
  1. Rework consumeSession so the balance check and the debit insert are one atomic SQL statement
     (INSERT ... SELECT ... WHERE (SELECT COALESCE(SUM(delta_units),0) ...) >= 1). Keep the
     idempotency-key UNIQUE guard, keep outcomes consumed/already_done/no_balance/no_package.
     Zero-rows-affected (balance exhausted concurrently) => no_balance, not an error.
  2. Tests #4-9 (+ #10 via the DI'd completion service). For the concurrency test, use interleaved
     promises and assert the invariant (exactly one consumed; balance never negative); document in
     the test file that a true OS race is not reproducible in vitest (Stop-condition S7).
Constraints: NO schema/migration (no package_ledger column); no ERP write; no Payment Entry; no
deletion; append-only preserved; tenant-scoped. If a schema change seems required, STOP.
Verify: targeted tests, npm test, lint, build:verify.
Commit: feat(billing): atomic conditional guard against negative package balance
Do not push.
```

---

## Commit recommendation

This run is **docs-only**. If and only if the sole changed path is
`docs/plans/PHASE_6_PACKAGE_LEDGER_HARDENING_PLAN.md` (no runtime/schema/migration/env/lockfile
changes, no secrets), stage exactly that file and commit:

```
docs(billing): plan package ledger hardening
```

Do **not** push. Phase 6B/6C implementation happens in later, separately-verified runs, each behind
the stop conditions above.
