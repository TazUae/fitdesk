# Payment Safety Gates — Architecture Decision Record

- **Date:** 2026-07-06
- **Status:** Accepted for MVP / pilot. No runtime behavior changed by this document.
- **Predecessor:** Phase 10C — payment safety audit (passed, no P0 blockers)
- **Related:** [`docs/plans/PHASE_7_PPS_LIVE_ERP_QA_PLAN.md`](../plans/PHASE_7_PPS_LIVE_ERP_QA_PLAN.md), [`docs/architecture/FITDESK_BILLING_PACKAGE_ERP_DECISION.md`](FITDESK_BILLING_PACKAGE_ERP_DECISION.md)

---

## Executive summary

- **ERP financial writes are gated by explicit trainer action + an approved test tenant, not by a runtime flag.** Every Sales Invoice submission and every Payment Entry in the codebase today is triggered by a trainer pressing a specific button (Complete session, Assign package, Record payment, Issue invoice) — nothing fires automatically in the background.
- **External payment provider calls are not live today.** There is no code path anywhere in FitDesk that makes a real network call to a payment provider.
- **Whish is mock-only today.** `generateLink()` in `lib/whish.ts` returns a fabricated URL string; the real API call is a commented-out sketch, never executed.
- **`PILOT_MODE` does not gate ERP financial writes.** It gates outgoing WhatsApp sends and a cosmetic banner only — it has no effect on invoices, payments, or packages.

This record exists so a future contributor does not assume `PILOT_MODE` / `PILOT_ALLOW_EXTERNAL_PAYMENTS` protect the billing paths, and so **Phase 7B (PPS live ERP QA)** has a single, explicit go/no-go reference before it runs.

---

## Payment-flow map

| Flow | Creates/submits ERP Sales Invoice? | Creates Payment Entry? | Calls external provider? | Trigger / action required |
|---|---|---|---|---|
| **PPS completion** (`lib/scheduling/sessionCompletionService.ts` → `actions/schedulingActions.ts:283` `completeSessionAction`) | **Yes** — creates + submits (docstatus 1), unpaid | No | No | Trainer taps "Complete session" on a `pay_per_session` client with FD Session `rate > 0` |
| **Package Paid Now** (`actions/packages.ts:46` `assignPackage` → `PackageAssignmentService`) | **Yes** — creates + submits | **Yes** — creates + submits `createAndSubmitPaymentEntry` | No | Trainer assigns a package with payment method = Paid Now |
| **Package Pay Later** (same entry point, no `payment` input) | **Yes** — creates + submits, unpaid | No | No | Trainer assigns a package with no payment collected yet |
| **recordPayment / collectPayment** (`actions/invoices.ts:140`/`314`) | No (acts on an existing invoice) | **Yes** — `createAndSubmitPaymentEntry`, then re-fetches the invoice to confirm outstanding actually decreased before reporting success | No | Trainer explicitly records a payment (amount, method, date required; ownership-gated to the invoice's trainer) |
| **finalizeInvoice / issueInvoice** (`actions/invoices.ts:261`/`387`) | **Yes** — submits a draft invoice so it becomes payable | No | No | Trainer issues/finalizes an invoice |
| **Whish payment link generation** (`actions/invoices.ts:87` `getPaymentLink` → `lib/whish.ts:163` `generatePaymentLink` → whish adapter `:86-135`) | No | No | **No — mock only.** Returns a deterministic fabricated URL (`${base}/pay/${ref}?...`); the real HTTP request (`lib/whish.ts:104-124`, commented out) has never been implemented. Requires `WHISH_API_URL`/`WHISH_API_KEY`/`WHISH_MERCHANT_ID` to be set, else returns a "not configured" error | Trainer clicks "Generate link" (`components/modules/InvoicesView.tsx:246`) |
| **Package consumption / "Use 1 session"** (`actions/packages.ts:177` `usePackageSession`) | No | No | No | Trainer/session-completion debits the local `package_ledger` only — no ERP write at all |

**Note:** generating a payment link never marks an invoice paid — `recordPayment()` is a separate, always-explicit step (per `lib/whish.ts:9-10` design comment).

---

## PILOT_MODE enforcement map

`isPilotMode()` (`lib/pilot.ts:10`) has exactly two production callers, neither in a payment path:

1. **WhatsApp send allowlist** — `actions/messages.ts:132`. When `PILOT_MODE` is true, outgoing WhatsApp sends are blocked (fail-closed) unless the destination matches `FITDESK_ALLOWED_TEST_PHONE` / `FITDESK_ALLOWED_TEST_PHONE_PREFIXES`.
2. **PilotBanner** — `app/dashboard/layout.tsx:13`. Cosmetic UI indicator only.

**`PILOT_MODE` has zero effect on any invoice, Payment Entry, package, or PPS code path.**

---

## PILOT_ALLOW_EXTERNAL_PAYMENTS / isExternalPaymentsAllowed() status

- **Zero callers.** The only occurrence of `isExternalPaymentsAllowed()` in the entire codebase is its own definition at `lib/pilot.ts:15`. It is never imported or invoked anywhere else, including tests.
- **Dormant by design today** — this is acceptable *only* because the capability it would protect (a real external Whish API call) does not exist yet. The gate currently guards nothing.
- **Must be wired fail-closed before replacing the Whish mock with a real provider call.** The moment `lib/whish.ts`'s `whishAdapter.generateLink()` (`:91-134`) is changed from the mock block to a real `fetch()` against Whish's API, that function must check `isExternalPaymentsAllowed()` first and refuse (fail-closed) when it returns `false`.
- **Exact future wiring point:** `lib/whish.ts`, inside `whishAdapter.generateLink()` — immediately after the existing `WHISH_API_URL`/`WHISH_API_KEY`/`WHISH_MERCHANT_ID` configuration check (`:96-102`), before the real API call replaces the current mock block (`:104-133`). This is a payment-behavior change and requires its own approval-gated implementation slice — not part of this document.

---

## markInvoicePaid() status

- **Dormant — zero production callers.** `lib/erpnext/client.ts:582` defines `markInvoicePaid()`, which creates a Payment Entry via `POST` but — unlike `createAndSubmitPaymentEntry` — never submits it (no `frappe.client.submit` call), so it would leave an unreconciled draft with no accounting effect if ever invoked. It is referenced nowhere outside its own definition (confirmed by `actions/packages.test.ts:623`, which asserts the string does not appear in package-assignment source).
- **Future decision needed:** either remove this dead helper or, if a future flow needs it, wire it correctly (submit the Payment Entry, verify reconciliation, same pattern as `createAndSubmitPaymentEntry`) — not decided in this document.

---

## Phase 7B PPS live ERP QA conditions

Phase 7B (executing the script in [`PHASE_7_PPS_LIVE_ERP_QA_PLAN.md`](../plans/PHASE_7_PPS_LIVE_ERP_QA_PLAN.md)) may proceed only when **all** of the following hold:

1. **Explicit human approval** obtained for the specific run.
2. **Confirmed non-production test tenant** — `CONTROL_PLANE_URL` host verified as the known QA host before any completion; never confirmed against production.
3. **Disposable test client** — submitted Sales Invoices cannot be deleted, only cancelled (itself a separate approval-gated action); the test client absorbs any residual invoice.
4. **Test client is `pay_per_session`** (ERP `custom_billing_mode` **and** local `client_index.billingMode`), with the target FD Session `rate > 0`, start time in the past, not trial, not package-consumed.
5. **ERP `TRAINING-SESSION` Item and `custom_fd_session`/`custom_invoice_kind` custom fields confirmed present** in the test tenant before executing.
6. **Single completion only** — no parallel or repeated clicks (the accepted concurrency residual can create a duplicate invoice if triggered).
7. **No Payment Entry created** — PPS completion must create/submit only a Sales Invoice; any prompt or need to create a Payment Entry is a stop condition (C8, out of scope).
8. **No Whish/external payment link generated** — Phase 7B does not touch `getPaymentLink`/`generatePaymentLink`; this stays out of scope for the run.
9. **Submitted-document irreversibility acknowledged** — the resulting Sales Invoice is docstatus 1 and permanent in the test tenant; there is no "un-complete" for the FD Session either.

These conditions are unchanged from the existing 7A plan; this document restates them as the definitive payment-safety cross-reference.

---

## P1 hardening (should close before scaling past pilot)

1. **Wire or retire the external-payment gate when the real Whish integration lands.** `isExternalPaymentsAllowed()` must gate the real API call fail-closed at that time — do not ship a real Whish integration with the gate still unwired.
2. **Keep Phase 7B strictly isolated from external-provider flows.** The QA script must not be expanded to include payment-link generation or Payment Entry creation without a separate, explicitly-approved audit (C8 scope).

## P2 future architecture

1. **Persistent payment audit table.** `logPaymentEvent()` (`lib/whish.ts:181`) currently writes only to server logs (rotated at 10MB × 3 files in the Docker logging config) — a disputed-payment investigation could lose the trail. Persist `PaymentAuditEvent` to a durable table (the TODO already exists in code).
2. **Dormant helper cleanup.** Decide the fate of `markInvoicePaid()` (remove or correctly wire) and keep `isExternalPaymentsAllowed()` visibly dormant (e.g. a code comment) until it is wired, so neither is mistaken for active protection.
3. **PPS concurrency/idempotency hardening.** The accepted double-create residual under true parallel completions (documented in `C7_PPS_COMPLETION_QA_FREEZE_REPORT.md` and carried forward in `PHASE_6E_BILLING_FAILURE_RECONCILE_CLOSEOUT.md` as FW-1) should eventually be closed with a durable ERP-side or application-side uniqueness guarantee on `custom_fd_session`.

---

## Final verdict

**Phase 7B may proceed under the documented conditions above.** No live external-payment path exists today, so the dormant `isExternalPaymentsAllowed()` gate does not block or endanger Phase 7B, which only submits an ERP Sales Invoice through the already-approved proxy path. **No payment behavior was changed by this document** — it is a record of the current, audited state only.
