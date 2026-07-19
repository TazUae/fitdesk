# Phase 6D — Session-Completion Path Audit

- **Date:** 2026-07-04
- **Phase:** 6D (session-completion intent state hardening — audit-gated, per Phase 6 plan §170)
- **Author:** Claude Code (audit / docs-only)
- **Predecessor:** Phase 6C — `61bc26f` `fix(billing): atomically guard package session consumption`
- **Scope:** Read-only audit of every reachable session-completion / session-consumption entry point, to determine whether any path can bypass the hardened billing + package ledger flow. **No runtime code changed.**

---

## Verdict: **PASS**

No reachable path bypasses package consumption, pay-per-session (PPS) invoicing, the session-completion intent/idempotency guards, or tenant/trainer ownership checks. The one legacy path that lacks billing dispatch (`actions/sessions.ts::completeSession`) is **doubly dead**: its only importer is never rendered, and the action is physically inert (it throws before any mutation). The Phase 6C atomic guard covers **all** live package-mode consumption paths.

- **Reachable-bypass verdict:** **NONE.**
- **Risk rating:** **Low** — the only residual is latent-reactivation / code-hygiene risk from the dead legacy path.
- **Recommended next action:** **A** (no code fix needed — document and proceed to Phase 6E), plus a **deferred C** (delete/deprecate the dead legacy completion trio in a separate, approved change).

---

## Audited files

| Area | File | Role |
|---|---|---|
| Legacy completion action | [`actions/sessions.ts`](../../actions/sessions.ts) | `completeSession` / `cancelSession` / `noShowSession` → PT Session ERP adapter (dead stubs) |
| Canonical completion action | [`actions/schedulingActions.ts:283`](../../actions/schedulingActions.ts) | `completeSessionAction(id, expectedVersion)` → billing dispatch |
| Manual "Use 1 session" action | [`actions/packages.ts:177`](../../actions/packages.ts) | `usePackageSession` → hardened consumption service |
| Completion service (pure, DI'd) | [`lib/scheduling/sessionCompletionService.ts:157`](../../lib/scheduling/sessionCompletionService.ts) | Version + terminal-state guards; trial / package / PPS dispatch |
| Session repository | [`lib/scheduling/sessionRepository.ts`](../../lib/scheduling/sessionRepository.ts) | `findSessionById` / `updateSession` (FD Session DocType, via ERP proxy) |
| Consumption service | [`lib/billing/package-consumption-service.ts:49`](../../lib/billing/package-consumption-service.ts) | `consumeSession` → Phase 6C atomic guard |
| Ledger repository | [`lib/billing/package-ledger-repository.ts:311`](../../lib/billing/package-ledger-repository.ts) | `appendSessionConsumedIfBalanceAvailable` (atomic conditional insert) |
| Legacy ERP session stubs | [`lib/erpnext/client.ts:415`](../../lib/erpnext/client.ts) | `getSessions`→`[]`; `getSessionById`/`createSession`/`markSessionComplete`/`markSessionMissed`→throw 404/503 |
| ERP adapter re-export | [`lib/business-data/erp-adapter.ts`](../../lib/business-data/erp-adapter.ts) | `export * from '@/lib/erpnext/client'` |
| Legacy completion UI (dead) | [`components/modules/SessionActions.tsx`](../../components/modules/SessionActions.tsx) | `'use client'`; Complete/Cancel buttons → legacy action |
| Canonical completion UI | [`components/scheduling/SessionCompletionSheet.tsx`](../../components/scheduling/SessionCompletionSheet.tsx) | Sheet → `completeSessionAction` |
| Schedule page / view | [`app/dashboard/schedule/page.tsx`](../../app/dashboard/schedule/page.tsx), [`components/modules/ScheduleView.tsx:120`](../../components/modules/ScheduleView.tsx) | Mounts `SessionCompletionSheet` (canonical) |
| Manual-consumption UI | [`components/clients/PackageDetailsSheet.tsx`](../../components/clients/PackageDetailsSheet.tsx) | Imports `usePackageSession as recordPackageSession` |
| Tests | [`lib/scheduling/sessionCompletionService.test.ts`](../../lib/scheduling/sessionCompletionService.test.ts), [`actions/schedulingActions.test.ts`](../../actions/schedulingActions.test.ts), [`actions/sessions.test.ts`](../../actions/sessions.test.ts), [`actions/packages.test.ts`](../../actions/packages.test.ts), [`lib/billing/__tests__/package-consumption-service.test.ts`](../../lib/billing/__tests__/package-consumption-service.test.ts), [`lib/billing/__tests__/package-ledger-repository.test.ts`](../../lib/billing/__tests__/package-ledger-repository.test.ts) | Completion, scheduling, PPS, packages, billing coverage |
| Prior plan | [`docs/plans/PHASE_6_PACKAGE_LEDGER_HARDENING_PLAN.md`](../archive/plans/2026-07-18-consolidation-20260718-170652/PHASE_6_PACKAGE_LEDGER_HARDENING_PLAN.md) | R7 dual-path risk; 6D audit gate |

---

## Current completion-path inventory

Three entry points exist that can complete or consume a session. Two are live and canonical; one is dead.

### Path 1 — Canonical FD Session completion (LIVE)

```
/dashboard/schedule (Server Component)
  → ScheduleView  → SessionCompletionSheet  (components/scheduling/SessionCompletionSheet.tsx:66)
    → completeSessionAction(session.id, session.version)   (actions/schedulingActions.ts:283)
      → resolveTrainerId() + getTenantContext()            [auth + tenant gate]
      → sessionCompletionService.completeSession(deps, id, expectedVersion)  (lib/scheduling/sessionCompletionService.ts:157)
          guard 1: version check       (:165)  → VersionConflictError
          guard 2: terminal-state check(:170)  → ImmutableSessionError
          dispatch:
            trial            → status-only flip
            package          → consumeForSession → PackageConsumptionService.consumeSession
                                 → appendSessionConsumedIfBalanceAvailable  [PHASE 6C ATOMIC GUARD]
                               → updateSession(status=completed, sessionConsumedPackage=true)
            pay_per_session  → findInvoiceBySession (idempotent) → createInvoice → submitSalesInvoice
                               → updateSession(status=completed, invoiceId)
            unset / unknown  → BillingNotConfiguredError (fail closed)
```

### Path 2 — Manual "Use 1 session" Hub action (LIVE, intentional, separate)

```
components/clients/PackageDetailsSheet.tsx   (recordPackageSession)
  → usePackageSession({ clientIndexId, idempotencyKey })   (actions/packages.ts:177)
    → resolveTrainerId() + getTenantContext()              [auth + tenant gate]
    → ClientRepository.findClientById(tenantCtx, clientIndexId)   [erpCustomerId resolved SERVER-SIDE]
    → PackageConsumptionService.consumeSession(tenantCtx, { sessionId: idempotencyKey, ... })
      → appendSessionConsumedIfBalanceAvailable            [PHASE 6C ATOMIC GUARD]
```

`erpCustomerId` is never accepted from the browser — it is resolved from the tenant-scoped client record ([`actions/packages.ts:207`](../../actions/packages.ts)), so a client cannot forge cross-client consumption. `idempotencyKey` is caller-supplied and used as the `session_consumed:{sessionId}` anchor.

### Path 3 — Legacy PT Session completion (DEAD)

```
components/modules/SessionActions.tsx   ('use client')   [NEVER RENDERED]
  → completeSession(sessionId)          (actions/sessions.ts:92)
    → resolveTrainerId()
    → getSessionById(sessionId, trainerId)   (lib/erpnext/client.ts:425)  → THROWS ERPNextError(404)
    → markSessionComplete(...)               (lib/erpnext/client.ts:440)  → 503 stub, NEVER REACHED
  ⇒ returns { success:false, error:'Session DocType is not available in this workspace.' }
```

---

## Canonical path

- **Session completion:** `completeSessionAction` → `sessionCompletionService.completeSession` (Path 1). This is the authoritative, billing-wired completion path and the only one the live schedule UI mounts.
- **Ad-hoc package debit:** `usePackageSession` (Path 2) — the deliberate C6 "Use 1 session" Hub action, distinct from session completion, sharing only the hardened `PackageConsumptionService`.

Both live paths funnel every package debit through `PackageConsumptionService.consumeSession`, which (post-6C) writes **exclusively** via the atomic `appendSessionConsumedIfBalanceAvailable`. There is no other caller of a ledger append for consumption anywhere in the tree.

---

## Legacy / dead path findings

`actions/sessions.ts::completeSession` (and its `cancelSession` / `noShowSession` siblings) is the last survivor of the pre-scheduling **PT Session** layer. It is dead on two independent axes:

1. **UI-dead (unmounted).** Its only importer is [`components/modules/SessionActions.tsx:6`](../../components/modules/SessionActions.tsx). `SessionActions` is exported from the `components/modules/index.ts` barrel ([`:11`](../../components/modules/index.ts)) but is **never rendered** — a full-tree search finds zero `<SessionActions` JSX usages and zero non-barrel importers. The live schedule UI uses `SessionCompletionSheet` instead.
2. **Runtime-inert (throws before mutating).** Even if invoked, the action's ownership gate `getSessionById` throws `ERPNextError(404)` because the PT Session DocType does not exist in this ERP instance ([`lib/erpnext/client.ts:425`](../../lib/erpnext/client.ts)). Control never reaches `markSessionComplete` (itself a 503 stub). It cannot complete a session, decrement a package, or create an invoice — it can only return an error result / error toast.

Note: the same file's `bookSession` / `fetchSessions` are re-exported via `lib/business-data/index.ts`, but those are booking/read (also backed by dead stubs: `getSessions`→`[]`, `createSession`→503) and are out of scope for completion. This confirms the R7 dual-path concern from the Phase 6 plan (§130) resolves as **"legacy path is dead,"** not **"legacy path is live for billable clients."**

---

## Reachable-bypass findings (audit questions)

| # | Question | Finding |
|---|---|---|
| 1 | All entry points that complete/consume a session? | Three: `completeSessionAction` (Path 1, live), `usePackageSession` (Path 2, live), `actions/sessions.ts::completeSession` (Path 3, dead). |
| 2 | Which is canonical? | Path 1 for completion; Path 2 for manual package debit. |
| 3 | Which is legacy? | Path 3 (`actions/sessions.ts` completion trio, PT Session layer). |
| 4 | Is `actions/sessions.ts` reachable? | **No, in practice.** Its `completeSession` has one importer (`SessionActions.tsx`) which is never mounted; and if called it throws 404 before any mutation. |
| 5 | Any reachable path bypass package consumption / PPS invoice? | **No.** Both live paths route through the hardened service + billing-mode dispatch. The only path without billing dispatch is unreachable **and** inert. |
| 6 | Any reachable path bypass completion intent / idempotency? | **No.** Path 1 enforces optimistic version check + terminal-state check; package consumption is idempotent via `session_consumed:{sessionId}` + the DB partial-unique index + the 6C atomic guard. |
| 7 | Any reachable path bypass tenant/trainer ownership? | **No.** Path 1: `resolveTrainerId` + `getTenantContext` + ERP-proxy trainer scoping. Path 2: `resolveTrainerId` + tenant ctx + server-side `erpCustomerId` resolution. Path 3 also carried an ownership gate — which is precisely why it throws 404. |
| 8 | Manual "Use 1 session" still separate & intentional? | **Yes.** `usePackageSession` is a deliberate Hub action, independent of completion, sharing only the hardened consumption service. |
| 9 | Does the 6C atomic guard cover all package-mode completion paths? | **Yes.** Both `completeSessionAction` (package branch) and `usePackageSession` call `PackageConsumptionService.consumeSession`, whose sole consumption writer is now `appendSessionConsumedIfBalanceAvailable`. No other ledger-append-for-consumption caller exists. |
| 10 | Fix / delete / document / defer? | No runtime fix needed now. Document (this file); **defer** deletion of the dead legacy trio to a separate approved change. |

---

## Risk rating: **Low**

There is no live bypass. The residual risk is **latent reactivation** of the dead legacy path — it would only become a real billing-bypass if **all** of the following became true simultaneously:

1. `SessionActions` is re-mounted somewhere in the live UI, **and**
2. a PT Session DocType (or equivalent) is later added so `getSessionById` / `markSessionComplete` stop throwing, **and**
3. the unfilled `TODO(P-C)` billing dispatch ([`actions/sessions.ts:87`](../../actions/sessions.ts)) is still never wired.

All three are false today. The action is self-documenting about the gap (explicit `TODO(P-C)`). Deleting the dead code (deferred rec C) removes the reactivation surface entirely.

---

## Recommended next action

### A — No code fix needed; document and proceed to Phase 6E  ✅ (selected)

The hardened flow is complete and fully covers every reachable path. This audit is the closeout for the R7 dual-path concern. Proceed to Phase 6E (failure/retry/reconcile documentation), which is doc-first per the Phase 6 plan (§178).

### C — Delete/deprecate the dead legacy completion path  ⏳ (deferred, separate approved change)

Recommended but **not** part of this run (Phase 6D is audit/docs-only, and deletion touches runtime + tests → requires its own approval per workspace rules on code changes). See implementation prompt below.

### B — Narrow bypass fix  ❌ (not required)

No reachable bypass exists, so no runtime fix is warranted in 6D.

---

## Exact implementation prompt (for the deferred rec C — do NOT run in 6D)

> **Task: remove the dead legacy PT Session completion path.**
> Preconditions to re-verify first (must all still hold): (a) `components/modules/SessionActions.tsx` has zero `<SessionActions` JSX usages and no importer other than the `components/modules/index.ts` barrel; (b) `actions/sessions.ts::completeSession` / `cancelSession` / `noShowSession` have no importer other than `SessionActions.tsx`; (c) `lib/business-data/index.ts` still re-exports only `bookSession` / `fetchSessions` / `BookSessionInput` / `SessionFilter` from `actions/sessions.ts` (leave those — they are a separate booking/read concern).
> Then: delete `components/modules/SessionActions.tsx`; remove its barrel export in `components/modules/index.ts`; delete the `completeSession` / `cancelSession` / `noShowSession` actions from `actions/sessions.ts` (keep `bookSession` / `fetchSessions`); update or remove `actions/sessions.test.ts` completion/ownership/P-A-billing-lock tests that target the removed functions. Do NOT touch the FD Session scheduling path, `PackageConsumptionService`, or `sessionCompletionService`.
> Verify: `npm test`, `npm run lint`, `npm run build:verify`. Confirm the schedule completion flow (`completeSessionAction`) and manual `usePackageSession` are unaffected.
> Approval gate: this is a runtime + test change — get explicit approval before editing (workspace CLAUDE.md §10 / §4).

---

## Exact non-goals (for this 6D run)

- **No runtime code changes** — no edits to `actions/`, `lib/`, `components/`, or `app/`.
- **No deletion of the legacy path in this run** — that is deferred rec C, separately approved.
- **No schema / migration / DocType changes.**
- **No database, Docker volume, env, Dokploy, or production mutations.**
- **No ERP writes** — no invoice creation, no document submission, no Payment Entry.
- **No changes to the ERP proxy/client path; no ERP credentials stored in FitDesk.**
- **No package / session / payment data mutation.**
- **No push** (commit stays local; push is a separate, explicitly-instructed step).
- **No automatic reconciler** — reconcile remains manual + dry-run-first (Phase 6E concern, R6).
