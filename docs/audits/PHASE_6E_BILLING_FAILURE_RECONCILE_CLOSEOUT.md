# Phase 6E — Billing / Session-Completion Failure & Reconciliation Closeout

- **Date:** 2026-07-04
- **Phase:** 6E (failure / retry / reconcile documentation — doc-first, per Phase 6 plan §178)
- **Author:** Claude Code (audit / docs-only)
- **Predecessors:** 6A plan · 6B pure guard helpers (`a25b038`) · 6C atomic package-consumption guard (`61bc26f`) · 6D completion-path audit (`2466fb3`)
- **Scope:** Read-only audit of partial-failure and reconciliation behavior across package-mode completion, pay-per-session (PPS) completion, the completion state machine, and the manual "Use 1 session" action. Determines whether a `reconcile_required` state is needed and whether Phase 6 can close for MVP/pilot. **No runtime code changed.**

---

## Verdict: **PASS** — Phase 6 closes safely for MVP/pilot

Phase 6's actual scope — **prevent negative package balance under concurrency** — is fully delivered and convergent-safe on retry. **No `reconcile_required` state exists, and none is required for MVP/pilot.** Package-mode and sequential-retry PPS partial failures are self-healing via idempotency anchors. Two residual, previously-accepted, out-of-Phase-6-scope risks are carried forward to a future hardening phase (see **Carried-forward risks**); neither blocks closeout.

- **Reconcile/retry verdict:** retries are safe and convergent for every mode; **no automatic reconciler should be added** (Roadmap non-goal). A future **read-only** reconcile *report* is the recommended visibility tool.
- **Can Phase 6 close safely for MVP/pilot?** **Yes.**
- **Risk rating:** **Low** for package mode (fully hardened by 6C); **Low–Medium** residual for PPS concurrency (narrow trigger, but a financial document).

---

## Audited files

| Area | File | What it told us |
|---|---|---|
| Completion service (pure, DI'd) | [`lib/scheduling/sessionCompletionService.ts:157`](../../lib/scheduling/sessionCompletionService.ts) | Guard order version→terminal-state; **package = ledger-first** (`:235-262`); **PPS = invoice-first** (`:189-233`); fails closed on unset/unknown. |
| Consumption service | [`lib/billing/package-consumption-service.ts:49`](../../lib/billing/package-consumption-service.ts) | Idempotency pre-check `:70`; atomic conditional debit `:91`; disambiguates zero-rows via follow-up read. |
| Ledger repository | [`lib/billing/package-ledger-repository.ts:311`](../../lib/billing/package-ledger-repository.ts) | `appendSessionConsumedIfBalanceAvailable` — single-statement `INSERT…SELECT…WHERE NOT EXISTS(key) AND SUM>=1`. |
| PPS invoice builder | [`lib/scheduling/sessionInvoiceBuilder.ts`](../../lib/scheduling/sessionInvoiceBuilder.ts) | Pure; anchors `custom_fd_session = sessionId`; rejects rate ≤ 0. |
| ERP invoice lookup | [`lib/erpnext/client.ts:558`](../../lib/erpnext/client.ts) | `findInvoiceBySession` filters on `custom_fd_session` — the durable PPS idempotency anchor. |
| Completion action | [`actions/schedulingActions.ts:283`](../../actions/schedulingActions.ts) | Injects deps; maps typed errors → `SchedulingErrorCode`. |
| Manual "Use 1 session" | [`actions/packages.ts:177`](../../actions/packages.ts) | `usePackageSession` → same consumption service; `erpCustomerId` resolved server-side. |
| Session status enum | [`types/scheduling.ts:81`](../../types/scheduling.ts) | `FDSessionStatus` = 6 states; **no** pending/applying/failed/reconcile state. |
| Local schema | [`lib/db/schema.ts:268`](../../lib/db/schema.ts) | `client_package_purchase` + `package_ledger` only; **no** reconcile/intent/failed columns. |
| Migration DDL | [`scripts/migrate-app.mjs`](../../scripts/migrate-app.mjs) | Confirms CHECK + partial-unique-index; **no** reconcile columns. |
| Retry/idempotency tests | [`lib/scheduling/sessionCompletionService.test.ts`](../../lib/scheduling/sessionCompletionService.test.ts) `:315-343` (package retry), `:421-464` (PPS reuse) | Prove no double debit / no duplicate invoice on **sequential** retry. |
| Prior gap record | [`docs/audits/C7_PPS_COMPLETION_QA_FREEZE_REPORT.md`](./C7_PPS_COMPLETION_QA_FREEZE_REPORT.md) `:101-106` | Documents & accepts the **concurrent** PPS duplicate-invoice TOCTOU at MVP. |
| Plan (R5/R6/6E) | [`docs/plans/PHASE_6_PACKAGE_LEDGER_HARDENING_PLAN.md`](../plans/PHASE_6_PACKAGE_LEDGER_HARDENING_PLAN.md) `:126-134`, `:178-182` | R5 divergence, R6 no-auto-reconciler, 6E doc-first. |
| Path audit | [`docs/audits/PHASE_6D_SESSION_COMPLETION_PATH_AUDIT.md`](./PHASE_6D_SESSION_COMPLETION_PATH_AUDIT.md) | Confirms only two live consumption paths, both hardened. |

---

## Current failure-state inventory

**There is no persisted failure/intermediate state.** Completion is a direct transition to a terminal status; failures are **transient thrown errors** that leave the session in its prior mutable status (`scheduled`/`confirmed`) for retry.

### Session state machine (`FDSessionStatus`)
```
scheduled ─┐
confirmed ─┼─→ completed   (terminal, on success)
           ├─→ cancelled   (terminal)
           ├─→ no_show     (terminal)
           └─→ skipped     (terminal)
```
No `completion_pending`, `ledger_applying`, `erp_confirmed`, `erp_failed`, `ledger_failed`, or `reconcile_required` status exists. Only `scheduled`/`confirmed` are mutable into `completed` (terminal-state guard, `:170`).

### Failure surfaces = typed errors → `SchedulingErrorCode` (not persisted)
`VersionConflictError`→`VERSION_CONFLICT` · `ImmutableSessionError`→`IMMUTABLE_STATUS` · `BillingNotConfiguredError`→`BILLING_NOT_CONFIGURED` · `NoPackageBalanceError`→`NO_PACKAGE_BALANCE` · `SessionRateNotConfiguredError`→`SESSION_RATE_NOT_CONFIGURED` · generic→`ERR`. (`PayPerSessionCompletionDeferredError`/`PackageCompletionNotReadyError` are **deprecated** — retained for compile compatibility, no longer thrown on success paths.)

### Schema / migration
Local billing tables (`package_ledger` append-only; `client_package_purchase`) carry **no** reconcile, intent, or failure columns. The FD Session's `session_consumed_package` (bool) and `invoice_id` fields live on the **ERPNext** DocType and act as durable per-session idempotency markers — not failure states. The one `pending`/`completed` status found in `client_action_intent` is an unrelated client-hub feature, **not** session-completion.

**Reachable failure states:** all of the typed errors above are reachable; **zero persisted failure states are reachable because none exist.**

---

## Package-mode partial-failure behavior

**Ordering: ledger-first, then ERP status write** (`sessionCompletionService.ts:235-262`).

```
consumeForSession → PackageConsumptionService.consumeSession → atomic debit (6C)   [step 1]
updateSession(status=completed, sessionConsumedPackage=true)                        [step 2]
```

- **Debit succeeds, status write fails (step 2 fails):** the ledger holds the `session_consumed(-1)` row, but `sessionConsumedPackage` was never written to the FD Session. **Retry** re-reads the session (`sessionConsumedPackage` still `false`) → re-enters `consumeForSession` → the idempotency key `session_consumed:{sessionId}` already exists → the 6C guard's `NOT EXISTS` clause returns zero rows → service returns **`already_done`** (no second debit; 6C also makes negative balance impossible) → `updateSession` is retried. **Convergent and safe.** (Test: `:315-328`.)
- **Debit fails / no balance (step 1):** returns `no_package` / `no_balance` → mapped to `NO_PACKAGE_BALANCE`; **nothing written**, session stays scheduled. Safe.
- **Residual divergence (R5):** if `updateSession` **permanently** fails (ERP unreachable indefinitely), a debit persists with the session never reaching `completed`. **No marker flags this today.** Impact is bounded — the balance is correctly decremented (client not over-served); the only artifact is a completed-in-ledger / not-completed-in-ERP mismatch that a human or a future report can reconcile. Low frequency (requires a durable ERP outage across all retries).

---

## PPS partial-failure behavior

**Ordering: invoice-first (create+submit), then ERP status write** (`sessionCompletionService.ts:189-233`).

```
findInvoiceBySession(id)                                    [step 0 — idempotency probe]
  cancelled → throw (re-book required)   draft → submit   other → reuse   null → create+submit
updateSession(status=completed, invoiceId, version+1)       [step 3]
```

- **Invoice submitted, status write fails (step 3 fails):** the Sales Invoice is payable in ERP but the FD Session has no `invoiceId` and stays scheduled. **Retry** → `findInvoiceBySession` finds it via the `custom_fd_session` anchor → reuses (submits if it was left draft; rejects if cancelled) → `updateSession` retried. **No duplicate invoice on sequential retry. Convergent and safe.** (Tests: `:437-458`.)
- **Missing/zero rate:** `SessionRateNotConfiguredError` before any ERP call. Safe.
- **Residual divergence (R5, PPS variant):** permanent `updateSession` failure → a submitted, payable invoice with no local session linkage (client billed, session not marked complete). Same low-frequency, human-reconcilable class as the package residual; **no marker today.**
- **Residual concurrency gap (pre-existing, accepted at MVP — C7 freeze `:101-106`):** two **truly simultaneous** completions of the same session can both pass `findInvoiceBySession → null` before either writes back, creating **two Sales Invoices** for one session. Unlike the package side (fully hardened by 6C), PPS has **no** atomic/uniqueness guard on `custom_fd_session`. Trigger is narrow — the UI's `useTransition` disables the button and sequential retries are safe — but a genuine parallel double-submit is unmitigated. This is a **duplicate financial document** risk (see FW-1).

---

## Manual "Use 1 session" behavior

`usePackageSession` (`actions/packages.ts:177`) resolves `erpCustomerId` server-side, then calls the **same** `PackageConsumptionService.consumeSession` → **same 6C atomic guard**. It performs **no ERP write, no invoice, and no session-status write** — its entire effect is the single atomic ledger insert. There is therefore **no partial-failure surface**: the insert either lands or it doesn't; there is nothing to leave half-done and nothing to reconcile.

- **Idempotency:** anchored on the caller-supplied `idempotencyKey` (used as `sessionId` → `session_consumed:{idempotencyKey}`). The UI must supply a **stable** key per logical action (it generates one UUID per "Use 1 session" click); retrying with the *same* key is a safe `already_done`, retrying with a *new* key would be a distinct legitimate debit (correct-by-contract, not a bug).
- **Needs separate reconciliation handling?** **No.** It is atomic and side-effect-free beyond the ledger.

---

## Retry / idempotency behavior (summary)

| Path | Anchor | Sequential retry | Concurrency |
|---|---|---|---|
| Package completion | `session_consumed:{sessionId}` + partial-unique index + `sessionConsumedPackage` flag | Safe — `already_done`, no double debit | **Hardened (6C):** no double debit, no negative balance |
| Manual "Use 1 session" | `session_consumed:{idempotencyKey}` | Safe — `already_done` | **Hardened (6C)** |
| PPS completion | `custom_fd_session` on Sales Invoice | Safe — invoice reused | **NOT hardened** — parallel double-submit can duplicate the invoice (FW-1) |

Can retry duplicate a **package debit**? **No** (idempotency + 6C). Can retry duplicate a **PPS invoice**? **No on sequential retry; yes only under true parallel same-session submission** (accepted MVP residual).

---

## Reconciliation gaps

1. **No `reconcile_required` marker exists** — and none is required for MVP/pilot. Package mode is convergent-safe; PPS sequential retry is convergent-safe; the divergence cases are rare (durable ERP outage) or narrow (parallel PPS double-submit).
2. **No visibility tool** for the two divergence artifacts (debit-without-completion; submitted-invoice-without-completion / duplicate `custom_fd_session`). A **read-only** report would surface them without any mutation (FW-2). This is *visibility*, not an automatic reconciler — an automatic reconciler remains a Roadmap **non-goal** (R6).

---

## Can Phase 6 close safely for MVP/pilot?

**Yes.** Phase 6's objective — the atomic negative-balance guard for package consumption — is complete (6A→6D) and proven convergent under retry. The `reconcile_required` question resolves as **"not needed now."** The remaining items are pre-existing, previously-accepted, and outside the package-ledger scope; they are carried forward as scheduled future work, not closeout blockers.

### Carried-forward risks (future phase, not blocking)
- **CF-1 — PPS concurrent duplicate invoice.** Unmitigated parallel same-session double-submit. Financial. → FW-1.
- **CF-2 — Divergence has no visibility.** Debit-without-completion / billed-without-completion are human-reconcilable but not surfaced. → FW-2.

---

## Recommended future work

### FW-1 — Uniqueness guard on PPS Sales Invoice `custom_fd_session` (Medium)
Close the concurrent duplicate-invoice window. Preferred: a DB/DocType-level unique constraint on `custom_fd_session` in ERPNext so a second insert for the same session fails fast; the caller then falls into the existing `findInvoiceBySession` reuse branch. **This is an ERP/Frappe DocType change → requires explicit approval and a `provisioning_api` change (out of FitDesk-app scope).** Alternative (app-side): a short-lived per-session advisory lock around the PPS branch. **Deferred — not in Phase 6.**

### FW-2 — Read-only reconcile report (Low–Medium)
A **dry-run, read-only** diagnostic (no writes, no ERP mutations) that lists: (a) `package_ledger` `session_consumed` debits whose FD Session is not `completed` / `sessionConsumedPackage=false`; (b) submitted Session invoices whose FD Session has no `invoiceId`; (c) any duplicate `custom_fd_session` invoices. Surfaces CF-1/CF-2 for manual resolution. **No automatic mutation** (R6 non-goal). **Deferred.**

---

## Exact implementation prompt (for a FUTURE run — do NOT execute in 6E)

> **Task: add a read-only billing-divergence reconcile report (FW-2).**
> Create a pure, tenant-scoped, **dry-run-only** utility (mirror the Phase 5C `lib/clients/reconcile.ts` shape: no write methods called, `dryRun: true` as a literal, all I/O injected). It must:
> 1. For each package purchase in the tenant, cross-check ledger `session_consumed` events against the corresponding FD Session's `status`/`sessionConsumedPackage` (FD Session data via an injected fetcher — never a direct `erpFetch`/ERP-credential import), and report debits with no matching completed session.
> 2. Report submitted Session Sales Invoices (via an injected `findInvoiceBySession`-style fetcher) whose FD Session carries no `invoiceId`, and any `custom_fd_session` value mapping to more than one non-cancelled invoice.
> 3. Return a structured `ReconcileReport` (counts + per-item findings + per-item errors with isolation); **never** mutate, void, delete, create, or submit anything.
> Add unit tests with spies asserting **zero** write/ERP-mutation calls. Do not add a schema column, a migration, an automatic reconciler, or any ERP write. Verify: `npm test`, `npm run lint`, `npm run build:verify`.
> FW-1 (ERP unique constraint on `custom_fd_session`) is a **separate** ERP/Frappe-side change requiring explicit approval and must not be bundled here.

---

## Exact non-goals (this 6E run)

- **No runtime code changes** — no edits under `actions/`, `lib/`, `components/`, `app/`.
- **No schema / migration / DocType changes** — no `reconcile_required` column, no new status.
- **No FW-1 / FW-2 implementation** — both are deferred, separately-scoped future work.
- **No automatic reconciler** — reconcile stays manual + dry-run-first (R6).
- **No ERP writes** — no invoice creation, no document submission, no Payment Entry, no proxy bypass, no ERP credentials in FitDesk.
- **No database, Docker volume, env, Dokploy, or production mutations.**
- **No package / session / payment data mutation.**
- **No push** (commit stays local; push is a separate, explicitly-instructed step).
