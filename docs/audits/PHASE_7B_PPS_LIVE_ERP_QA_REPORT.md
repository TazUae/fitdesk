# Phase 7B — Pay-per-Session Live ERP Invoice QA — Result Report

- **Date:** 2026-07-06
- **Phase:** 7B (guarded live ERP QA — approval-gated)
- **Author:** Claude Code
- **Predecessor plan:** [`docs/plans/PHASE_7_PPS_LIVE_ERP_QA_PLAN.md`](../plans/PHASE_7_PPS_LIVE_ERP_QA_PLAN.md)
- **Safety cross-reference:** [`docs/architecture/PAYMENT_SAFETY_GATES.md`](../architecture/PAYMENT_SAFETY_GATES.md)

---

## Result: **BLOCKED (no mutation performed)**

The run was **halted at the pre-flight tenant-confirmation gate, before any ERP mutation.** No session was completed, **no Sales Invoice was created or submitted**, no Payment Entry was created, no Whish/external payment provider was called, and no payment link was generated. The working tree change from this run is **this report only**.

**Root cause:** the local runtime stack required to (a) positively confirm a non-production test tenant and (b) drive exactly one PPS completion is **not running**, and tenant identity therefore **cannot be positively confirmed**. The plan's Stop Condition #1 ("Target tenant cannot be positively confirmed non-production → STOP") and the task's Stop Conditions ("tenant is production or ambiguous"; "any unexpected error occurs before invoice submission") apply.

---

## Explicit approval text (recorded verbatim)

> "I approve Phase 7B PPS live ERP QA on a non-production test tenant only. I understand it may create and submit a real ERP Sales Invoice, no Payment Entry, no Whish/external payment link, disposable test client only."

Approval was valid for the run. Execution was blocked by environment readiness, **not** by lack of approval.

---

## Pre-flight results

| # | Check | Result |
|---|---|---|
| 1 | Repo path `C:\Users\Lenovo\Dev\axis-erp\FitDesk` | ✅ PASS |
| 2 | Branch is `main` | ✅ PASS |
| 3 | Local `main` synced with `origin/main` | ✅ PASS (`## main...origin/main`, not ahead/behind) |
| 4 | Working tree clean (before this report) | ✅ PASS |
| 5 | Latest commit `9901879` or newer | ✅ PASS (`9901879`) |
| 6 | GitHub Actions latest run green | ⚠️ UNKNOWN — `gh` CLI unavailable locally; CI not verifiable from this environment (monitor: `https://github.com/TazUae/fitdesk/actions`) |
| 7 | Required source/docs files read | ✅ PASS (plan, `PAYMENT_SAFETY_GATES.md`, `sessionCompletionService.ts`, `schedulingActions.ts`, `erpnext/client.ts`, `invoices.ts`, `whish.ts`, `pilot.ts`) |
| 8 | Approved path uses the existing ERP client/proxy path only | ✅ PASS — `erpFetch` ([`lib/erpnext/client.ts:120`](../../lib/erpnext/client.ts)) is Control-Plane-proxy-only; path translation `/api/resource/*`→`/api/erp/doctype/*`, `/api/method/*`→`/api/erp/method/*` |
| 9 | No direct ERP credential reads in FitDesk | ✅ PASS — signs a short-lived HS256 tenant JWT (`signTenantJwt`), no static ERP secret stored or sent |
| 10 | PPS completion path does not call payment/link functions | ✅ PASS — `completeSessionAction` ([`actions/schedulingActions.ts:283`](../../actions/schedulingActions.ts)) injects only `findInvoiceBySession`, `createInvoice`, `submitSalesInvoice`, `buildSessionInvoicePayload` + package/billing deps. It does **not** import or call `createAndSubmitPaymentEntry`, `recordPayment`, `collectPayment`, `getPaymentLink`, `generatePaymentLink`, `markInvoicePaid`, or the Whish adapter |
| 11 | `CONTROL_PLANE_URL` host (no secrets) | ⚠️ Config = `http://localhost:4000` (local), but see Blockers — the Control Plane is **not running**, so the host cannot be confirmed to resolve to a known non-production ERPNext |
| 12 | Non-production test tenant confirmed | ❌ **CANNOT CONFIRM** — stack down; tenant identity unverifiable → **STOP** |
| 13 | `WHISH_*` not needed / must not be used | ✅ Confirmed not needed — PPS path never touches Whish. Left untouched |
| 14 | No external payment provider action will be called | ✅ Confirmed by code path (item 10) — none invoked |

---

## Tenant / environment confirmation (no secrets)

- **`CONTROL_PLANE_URL` host:** `localhost` (scheme `http`, port `4000`) — read from `.env`; no override in `.env.local` (which sets only two feature flags).
- **App identity (`.env`, non-secret):** `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `BETTER_AUTH_URL=http://localhost:3000`, `APP_VERSION=1.0.0`, `NODE_ENV` unset.
- **Live runtime state:**
  - Docker daemon: **DOWN** (Docker Desktop not reachable) → local Control Plane and local ERPNext containers cannot be running.
  - Port `4000` (Control Plane): **no listener**.
  - Port `3000` (FitDesk app): **no listener**.
- **Conclusion:** the environment is *configured* for local, which is a strong non-production signal, but the tenant **cannot be positively confirmed** because there is no running Control Plane/ERPNext to (a) confirm the ERP target is a non-production test instance and (b) confirm a disposable test tenant is provisioned. "Configured local" is **not** the same as "confirmed non-production test tenant against a live system," which the plan requires before any mutation.

---

## Blockers (all must clear before a future Phase 7B attempt)

1. **Local stack is down.** Docker Desktop is stopped; nothing is listening on `3000`/`4000`. The Control Plane, the local ERPNext, and the FitDesk app must all be brought up (`npm run local:up` per the local-stack workflow) before anything can be confirmed or driven.
2. **Tenant identity unconfirmable.** With the Control Plane down, there is no way to positively verify that `localhost:4000` proxies to a non-production test ERPNext, nor that the provisioned tenant is a disposable test tenant. This must be confirmed against the live system (plan step 1).
3. **No authenticated session / no drivable completion path.** PPS completion is a Next.js **server action** (`completeSessionAction`) that requires a live, authenticated trainer session. There is no running app and no session. An interactive trainer login is required, which the operator must perform (the agent must not enter credentials).
4. **Test-data eligibility unverified.** Cannot confirm the existence of: a disposable PPS client (`billingMode = pay_per_session`, ERP `custom_billing_mode = 'Pay Per Session'`), an eligible FD Session (`rate > 0`, start in the past, status `scheduled`/`confirmed`, not trial, not package, not completed), the `TRAINING-SESSION` ERP Item, and the `custom_fd_session` + `custom_invoice_kind` custom fields on Sales Invoice.

---

## Mutation-safety confirmations for this run

- **No ERP Sales Invoice created or submitted.** The create+submit path was never reached (no completion attempted). Invoice identifier / docstatus / outstanding amount: **N/A**.
- **No Payment Entry created.** By design the PPS path never creates one (item 10), and no completion ran regardless.
- **No Whish / external payment provider called.** Confirmed by code path and by the run halting pre-mutation.
- **No payment link generated.** `getPaymentLink` / `generatePaymentLink` never invoked.
- **No package Paid Now / Pay Later executed.** Not invoked.
- **No session completed.** Zero completions attempted.
- **No local DB / Docker volume mutation.** None.

---

## Submitted-document irreversibility note (carried into any future run)

When Phase 7B does execute, PPS completion creates and submits a **docstatus 1** ERP Sales Invoice. Submitted Sales Invoices **cannot be deleted** — only **Cancelled** (docstatus 2), which is itself a separate, approval-gated mutating ERP action. FD Session completion is likewise terminal (no "un-complete"). This is why the future run must use a **disposable test client in a positively-confirmed non-production tenant**, and why cleanup/cancellation must not be attempted as part of the QA run.

---

## Follow-up recommendations (to unblock a future Phase 7B run)

Perform these **in order**, halting at the first anomaly (this is an operator-driven sequence; the agent can assist with read-only verification but must not enter credentials or force mutations):

1. **Start Docker Desktop** and bring up the local stack (`npm run local:up`; verify with `npm run local:check`).
2. **Confirm the ERP target is non-production.** Verify the local Control Plane proxies to the **local test ERPNext** (not a VPS/production Frappe), and record the confirmed tenant id/name (non-secret) — this satisfies plan Stop Condition #1.
3. **Operator logs in** to `http://localhost:3000` as the test trainer mapped to the confirmed test tenant.
4. **Read-only data prep verification** (no writes): confirm a disposable PPS client exists with `rate > 0` on an eligible session; confirm `TRAINING-SESSION` Item and the two custom fields exist; confirm `findInvoiceBySession(<target session>)` returns `null`. If any are missing, create/prepare them through the approved app flow first (or report exactly what is missing).
5. **Re-run Phase 7B** with the stack up and tenant confirmed: complete **exactly one** eligible PPS session via the app UI; do not double-click; verify the single submitted, unpaid Sales Invoice and the FD Session write-back; confirm zero Payment Entries; then record a PASS report.
6. Consider whether the agent should drive step 5 via the `verify` skill against the operator's already-authenticated session, or whether the operator drives it while the agent verifies — decide before the run.

---

## Non-goals honored this run

No runtime code changed; no live ERP writes; no Payment Entry; no Whish/external call; no payment link; no package Paid Now/Pay Later; no schema/migration/DocType change; no env/Dokploy/volume edits; no proxy bypass; no push. This report is the only file changed.
