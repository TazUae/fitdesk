# Phase 7A — Pay-per-Session Live ERP Invoice QA Plan

- **Date:** 2026-07-04
- **Phase:** 7A (planning only — audit + safe live-QA script for a later approved run)
- **Author:** Claude Code (audit / docs-only)
- **Predecessor:** Phase 6 closed — `66d860d` `docs(billing): close package ledger hardening audit`
- **Scope:** Audit the implemented-but-mock-verified PPS invoice-on-completion path and produce a safe, step-by-step live ERP QA script for **Phase 7B** (a later, explicitly-approved run against a **test tenant only**). **No runtime code changed. No live ERP writes in this run.**

---

## Verdict: **PLAN READY** — live execution is approval-gated

The PPS completion path is fully implemented, routes exclusively through the approved ERP proxy, and is anchored on a durable idempotency key. This plan is executable as written **once (a) a non-production test tenant is confirmed and (b) explicit approval is given**. Two cautions carry into execution (see **Stop conditions** and **Cleanup/rollback**): the accepted concurrent-double-create residual, and the irreversibility of submitted ERP documents.

---

## Audited files

| Area | File | Finding |
|---|---|---|
| Completion UI | [`components/scheduling/SessionCompletionSheet.tsx`](../../components/scheduling/SessionCompletionSheet.tsx) `:66`, `:193` | "Complete session" → `completeSessionAction(id, version)`; PPS hint shown when `rate>0 && !trial && !packageConsumed && !invoiceId`. |
| Completion action | [`actions/schedulingActions.ts:283`](../../actions/schedulingActions.ts) | Resolves trainer+tenant; injects PPS deps; maps errors → `SchedulingErrorCode`. Docstring: "No payment entries. No manual invoice UI." |
| Completion service | [`lib/scheduling/sessionCompletionService.ts:189-233`](../../lib/scheduling/sessionCompletionService.ts) | PPS branch: rate check → `findInvoiceBySession` → create+submit / reuse / submit-draft / reject-cancelled → `updateSession(status,invoiceId,version+1)`. Invoice-first ordering. |
| Invoice builder (pure) | [`lib/scheduling/sessionInvoiceBuilder.ts`](../../lib/scheduling/sessionInvoiceBuilder.ts) | Builds payload; `custom_fd_session=sessionId`; `custom_invoice_kind='Session'`; item `TRAINING-SESSION` qty 1; rejects rate ≤ 0. |
| ERP proxy wrapper | [`lib/erpnext/client.ts:120`](../../lib/erpnext/client.ts) | `erpFetch` — CP proxy only; 5-min tenant JWT; `/api/resource/*`→`/api/erp/doctype/*`. No direct ERP creds. |
| Invoice create/submit/find | [`lib/erpnext/client.ts:558,573,632`](../../lib/erpnext/client.ts) | `findInvoiceBySession` (filter `custom_fd_session`); `createInvoice` (POST draft); `submitSalesInvoice` (`frappe.client.submit`). |
| Session repository | [`lib/scheduling/sessionRepository.ts`](../../lib/scheduling/sessionRepository.ts) | `findSessionById` / `updateSession` (FD Session DocType via proxy); `invoice_id` write-back field. |
| Tests (mock-only) | [`lib/scheduling/sessionCompletionService.test.ts`](../../lib/scheduling/sessionCompletionService.test.ts), [`lib/erpnext/client.test.ts`](../../lib/erpnext/client.test.ts), [`lib/scheduling/__tests__/sessionInvoiceBuilder.test.ts`](../../lib/scheduling/__tests__/sessionInvoiceBuilder.test.ts), [`actions/schedulingActions.test.ts`](../../actions/schedulingActions.test.ts) | PPS create/submit/reuse/rate-validation/failure-propagation — **all mocked; zero live ERP coverage.** |
| Prior QA + residual | [`docs/audits/C7_PPS_COMPLETION_QA_FREEZE_REPORT.md`](../audits/C7_PPS_COMPLETION_QA_FREEZE_REPORT.md) `:101-106` | Documents & accepts concurrent double-create at MVP. |
| Failure closeout | [`docs/audits/PHASE_6E_BILLING_FAILURE_RECONCILE_CLOSEOUT.md`](../audits/PHASE_6E_BILLING_FAILURE_RECONCILE_CLOSEOUT.md) | CF-1 (PPS duplicate) carried forward as FW-1. |
| Roadmap | [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md:388-417`](../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md) | Phase 7 scope/acceptance; test tenant only; C8 = Payment Entry. |

---

## Current PPS flow summary

```
/dashboard/schedule (Server Component)
  → ScheduleView → tap session → SessionCompletionSheet → "Complete session"
    → completeSessionAction(session.id, session.version)           [actions/schedulingActions.ts:283]
        resolveTrainerId() + getTenantContext()                     [auth + tenant gate]
        → sessionCompletionService.completeSession(deps, id, ver)   [lib/scheduling/sessionCompletionService.ts:157]
            guard: version check → terminal-state check
            billingMode == 'pay_per_session':
              1. rate > 0 ? else SessionRateNotConfiguredError
              2. findInvoiceBySession(id)          [custom_fd_session probe]
                   cancelled → throw (re-book)   draft → submitSalesInvoice
                   sent/paid/overdue/partial → reuse (no ERP write)
                   null → buildSessionInvoicePayload → createInvoice (draft) → submitSalesInvoice
              3. updateSession(id,{ status:'completed', invoiceId, version+1 })
```

- **Billing mode source:** read from the **local** `client_index` row (`ClientRepository.findClientByErpId(...).billingMode`) — must be `pay_per_session` for the PPS branch. Trial flag and package-consumed both short-circuit before PPS.
- **Rate source:** the FD Session's `rate` field (set at booking). `rate ≤ 0` → `SESSION_RATE_NOT_CONFIGURED`.

### Where the ERP Sales Invoice is created
[`lib/erpnext/client.ts:573`](../../lib/erpnext/client.ts) `createInvoice` → `POST /api/resource/Sales Invoice` (draft), then [`:632`](../../lib/erpnext/client.ts) `submitSalesInvoice` → `POST /api/method/frappe.client.submit` (docstatus 0→1). Both via `erpFetch`.

### Fields sent to ERP (`buildSessionInvoicePayload`)
`customer` = erpCustomerId · `posting_date` = today (YYYY-MM-DD) · `due_date` = same (clamped ≥ posting at submit) · `custom_fd_session` = FD Session docname · `custom_invoice_kind` = `'Session'` · `items` = `[{ item_code:'TRAINING-SESSION', qty:1, rate }]`.

### Invoice ↔ FD Session linkage
Forward: `custom_fd_session` on the Sales Invoice = FD Session docname (the idempotency anchor). Reverse: `invoice_id` written back on the FD Session at completion.

### Retry / duplicate avoidance
`findInvoiceBySession` runs **before** any create; the FD Session write is **last**. Sequential retries reuse the existing invoice (submit a lingering draft; reject a cancelled one) — no duplicate. **Concurrency residual:** two truly-parallel completions of the same session can both see `null` and create two invoices (accepted MVP residual, C7 §101-106 / 6E CF-1) — unmitigated; do not trigger during QA.

---

## ERP proxy / path confirmation

**Confirmed — all ERP I/O goes through the approved proxy path; FitDesk holds no ERP credentials.**

- `erpFetch` ([`:120`](../../lib/erpnext/client.ts)) requires `CONTROL_PLANE_URL`; refuses without it (503).
- It resolves the tenant from `getTenantContext()` and signs a **5-minute HS256 tenant JWT** (`FITDESK_JWT_SECRET`) — no static ERP secret is stored or sent.
- Path translation: `/api/resource/*` → `/api/erp/doctype/*`; `/api/method/*` → `/api/erp/method/*` → Control Plane → Frappe.
- `createInvoice`, `submitSalesInvoice`, `findInvoiceBySession`, `updateSession` all call `erpFetch` — **no bypass, no second HTTP client, no direct Frappe URL.**

---

## Live QA prerequisites

1. **Explicit human approval** for this specific run (it writes submitted Sales Invoices).
2. **A confirmed NON-production test tenant** — `CONTROL_PLANE_URL` and the signing tenant must be a disposable QA workspace, verified before any completion (see Stop conditions).
3. Test-tenant env available to the app: `CONTROL_PLANE_URL`, `FITDESK_JWT_SECRET`, provisioned workspace mapping for the QA user. **Do not print these values.**
4. ERP Item **`TRAINING-SESSION`** exists in the test tenant (pre-provisioned by `fitdesk_setup.py`) — a missing item would produce a broken/failed invoice.
5. Custom fields `custom_fd_session` + `custom_invoice_kind` present on Sales Invoice in the test tenant.

---

## Exact QA data needed (test tenant only)

| Item | Requirement |
|---|---|
| Test Customer | ERP `custom_billing_mode = 'Pay Per Session'`; **and** local `client_index.billingMode = 'pay_per_session'` (completion reads billing mode locally). Prefer a **disposable** customer (invoices can't be deleted — see rollback). |
| Session rate | FD Session `rate > 0` (e.g. a small nominal value). |
| FD Session | Booked for the test client, `start_at < now` (completable), status `scheduled`/`confirmed`, **not** trial, **not** package-consumed. |
| ERP Item | `TRAINING-SESSION` present. |
| Clean anchor | No pre-existing Sales Invoice with `custom_fd_session = <target session docname>` (verify via `findInvoiceBySession` before starting). |

---

## Step-by-step live QA script (for the later approved Phase 7B run)

> Read-only verification first; a single completion is the only mutating step. Stop at the first anomaly.

1. **Confirm target is the test tenant.** Print only the **host** of `CONTROL_PLANE_URL` (not secrets) and confirm it is the known QA host, not production. If unconfirmable → **STOP**.
2. **Pre-flight reads (no writes):** confirm `TRAINING-SESSION` Item exists; confirm `findInvoiceBySession(<sessionDocname>)` returns `null`; note the FD Session `version`, `rate`, `status`, `clientId`.
3. **Confirm data prep:** client billing mode `pay_per_session` (ERP + local); session rate > 0; session start in the past; not trial/package.
4. **Complete once** — via the app UI (`/dashboard/schedule` → session → "Complete session") or a single `completeSessionAction(id, version)` call. **Do not** click twice / fire parallel requests.
5. **Verify ERP invoice (read):** exactly **one** Sales Invoice with `custom_fd_session = <docname>`, `custom_invoice_kind = 'Session'`, one `TRAINING-SESSION` line (qty 1, rate = fee), `grand_total = rate`, **docstatus = 1 (submitted)**.
6. **Verify FitDesk (read):** FD Session `status = completed`, `invoice_id = <SINV name>`, `version` incremented by 1. UI shows "Session marked complete".
7. **Idempotency check (safe, observable):** attempt a second `completeSessionAction(id, <same or stale version>)`. Expect `VERSION_CONFLICT` or `IMMUTABLE_STATUS` (the session is now terminal) and **no second invoice** — re-run `findInvoiceBySession` and confirm still exactly one. (True mid-write-failure reuse is covered by unit tests; reproducing it live needs fault injection and is out of scope — note this, don't force it.)
8. **Confirm no Payment Entry** was created (that is C8). 
9. **Record results** in a Phase 7B freeze report; note any deviation verbatim.

---

## Expected ERP artifacts

- **One** submitted Sales Invoice (docstatus 1): `custom_fd_session = <FD Session docname>`, `custom_invoice_kind = 'Session'`, single `TRAINING-SESSION` line (qty 1, rate = session fee), `grand_total = rate`, `outstanding_amount = grand_total` (unpaid).
- **No** Payment Entry. **No** second/duplicate invoice.

## Expected FitDesk artifacts

- FD Session: `status = completed`, `invoice_id` = the submitted SINV docname, `version + 1`.
- Success toast "Session marked complete". **No local DB writes** — PPS does not touch `package_ledger` / `client_package_purchase`.

## Retry / idempotency checks (what to assert)

- Sequential re-complete → terminal-state/version guard, **zero** new invoices.
- `findInvoiceBySession` before and after retry → **same single** invoice docname.
- Draft-left-behind reuse and cancelled-invoice rejection are **unit-test-covered**; only observe live if they arise naturally — do not fabricate them.

---

## Stop conditions (halt live QA immediately)

1. Target tenant **cannot be positively confirmed non-production** → STOP.
2. `TRAINING-SESSION` Item **missing** in the tenant → STOP (would create a malformed invoice).
3. A **duplicate** invoice for one session appears → STOP; **do not fix-forward** mid-QA; record it (this is the known accepted residual).
4. Any ERP 4xx/5xx that is **not** a clean idempotent reuse → STOP; collect scrubbed logs.
5. Any prompt/need to create or submit a **Payment Entry** → STOP (C8, out of scope).
6. Client billing mode ≠ `pay_per_session` or rate = 0 → the flow safely returns `BILLING_NOT_CONFIGURED` / `SESSION_RATE_NOT_CONFIGURED`; fix the **data**, do not change code.
7. Any temptation to edit runtime code to "make QA pass" → STOP; QA verifies existing behavior only.

---

## Cleanup / rollback notes (read before executing)

- **Submitted Sales Invoices are docstatus 1 → cannot be deleted.** They can only be **Cancelled** (docstatus 2), which is itself a mutating ERP action requiring its own approval. **QA invoices persist.** Use a **disposable test client** and accept residual test invoices in the QA tenant.
- **FD Session completion is not auto-reversible** — there is no "un-complete" action; status is terminal after completion.
- These irreversibility facts are the core reason Phase 7B must run **only** on a throwaway test tenant with approval — there is no clean rollback.
- **Do not** attempt cancellation/cleanup of ERP documents as part of this plan; if cleanup is wanted, it is a separate, explicitly-approved task.

---

## Observations / cautions (not changes in this run)

- **Manual invoice UI is currently reachable** (`/dashboard/invoices/new` via `QuickActions` "Invoice" and `InvoicesView` "New Invoice") — this is **separate** from the PPS auto-invoice path and does not affect PPS QA. The roadmap constraint "keep manual invoice creation hidden from normal trainer flows" ([roadmap `:514`](../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md), [gap audit `:165-170`](../audits/FITDESK_2026_HANDBOOK_FULL_CODE_GAP_AUDIT.md)) is a **product decision to confirm separately**; it is **not** a Phase 7 blocker and must not be conflated with the completion-triggered invoice.
- PPS invoice creation is triggered **only** by session completion for a `pay_per_session` client with `rate > 0` — never auto-fired elsewhere.

---

## Exact non-goals (this 7A run)

- **No runtime code changes** — no edits under `actions/`, `lib/`, `components/`, `app/`.
- **No live ERP writes** — no `createInvoice`, no `submitSalesInvoice`, no `findInvoiceBySession` against a live tenant in this run.
- **No Payment Entry** creation/submission (that is C8).
- **No schema / migration / DocType changes.**
- **No env / Dokploy / volume / sibling-service edits; no ERP credentials in FitDesk; no proxy bypass.**
- **No manual-invoice-UI change** (separate product decision).
- **No push** (commit stays local; push is a separate, explicitly-instructed step).

---

## Recommended Phase 7B execution prompt (do NOT execute here)

> **Task: execute the Phase 7A PPS live ERP QA script against the confirmed test tenant (approval required).**
> Preconditions: explicit human approval obtained; `CONTROL_PLANE_URL` host verified as the non-production QA tenant; `TRAINING-SESSION` Item and `custom_fd_session`/`custom_invoice_kind` fields present. Use the `verify` skill to drive the real app; do not edit runtime code.
> Execute steps 1–9 of the QA script exactly. Halt at the first stop condition; never fix-forward mid-QA; never trigger parallel same-session completions. Do not create or submit any Payment Entry. Do not print secrets (print only the CP host for the tenant-confirmation step).
> Deliverable: a docs-only `docs/audits/PHASE_7B_PPS_LIVE_QA_FREEZE_REPORT.md` recording: tenant confirmation, the single completion, the observed Sales Invoice (docname, docstatus, grand_total, custom_fd_session, custom_invoice_kind, item line), the FD Session write-back, the idempotency assertion, confirmation of zero Payment Entries, and the C8 (payment-collection) scope. Commit as `docs(billing): record C7 live PPS QA results and C8 scope`. Do not push until instructed.
