# C7 Pay-Per-Session Invoice on Session Completion — QA Freeze Report

**Date:** 2026-07-01
**Branch:** `main`
**Final gate:** C7D UI copy — **PASS**

---

## 1. Executive Summary

All C7 Pay-Per-Session completion gates have passed. When a trainer completes an FD Session
whose client has billing mode `pay_per_session`, the service now:

1. Queries ERPNext for an existing Sales Invoice anchored to this FD Session via
   `custom_fd_session` (idempotency check).
2. If none exists: creates a draft Sales Invoice with `TRAINING-SESSION` item, rate, and
   both `custom_fd_session` + `custom_invoice_kind = Session` set, then submits it.
3. If a draft exists (prior run crashed before submit): submits it.
4. If a submitted/paid/overdue invoice exists: reuses it with no ERP write.
5. Writes `status = completed` + `invoiceId` back to the FD Session in a single patch.

Retry is safe at any point. Parallel TOCTOU double-create is accepted as an MVP residual
(documented). No payment entries are created. Package and trial completion paths are
unchanged. The full test suite (453 tests), ESLint, and production build are all green.

---

## 2. Scope Completed

| Sub-phase | Description | Commit | Result |
|---|---|---|---|
| C7A | Implementation plan + scope audit | — (plan only) | PASS |
| C7B | PPS invoice infrastructure (dead code) | `0520798` | PASS |
| C7C | Wire PPS completion to ERP invoice flow | `5b5595c` | PASS |
| C7D | UI error copy + invoice hint | `ca394e8` | PASS |

---

## 3. Files Changed

### C7B — Infrastructure (no behavior change)

| File | Change |
|---|---|
| `lib/erpnext/types.ts` | Added `custom_fd_session` + `custom_invoice_kind` to `ERPInvoice` and `CreateInvoicePayload` |
| `lib/erpnext/client.ts` | Added `'custom_fd_session'` to `invoiceFields()`; added `findInvoiceBySession()` |
| `lib/scheduling/sessionInvoiceBuilder.ts` | New — pure payload builder for PPS invoices |
| `lib/scheduling/__tests__/sessionInvoiceBuilder.test.ts` | New — 25 tests |
| `lib/erpnext/client.test.ts` | Added 5 tests for `findInvoiceBySession` |

### C7C — Implementation

| File | Change |
|---|---|
| `lib/scheduling/sessionCompletionService.ts` | Added `SessionRateNotConfiguredError`; extended `CompletionDeps` with 5 PPS deps + `invoiceId` in patch; replaced PPS `throw` with full idempotent invoice flow |
| `actions/schedulingActions.ts` | Imported and wired PPS deps; added `SESSION_RATE_NOT_CONFIGURED` error code + mapping |
| `lib/scheduling/sessionCompletionService.test.ts` | Added `makeInvoice()` fixture; updated `makeDeps()`; added ~18 PPS path tests |
| `actions/schedulingActions.test.ts` | Added mocks for ERP client + invoice builder; added mapping + wiring tests |

### C7D — UI copy

| File | Change |
|---|---|
| `lib/scheduling/completionUI.ts` | Added `SESSION_RATE_NOT_CONFIGURED` message; retired `PPS_DEFERRED` to generic fallback |
| `components/scheduling/SessionCompletionSheet.tsx` | Added PPS invoice hint (shown when rate > 0, not trial, not package-consumed, no invoice yet) |

---

## 4. Nothing Touched

- `actions/packages.ts` — untouched
- `lib/billing/package-consumption-service.ts` — untouched
- `lib/billing/package-ledger-repository.ts` — untouched
- `lib/billing/client-package-purchase-repository.ts` — untouched
- `components/clients/PackageDetailsSheet.tsx` — untouched
- `components/scheduling/BookingSheet.tsx` — untouched
- `components/scheduling/booking/*` — untouched
- `components/scheduling/SessionCompletionSheet.tsx` — C7D UI hint only (no logic)
- `package.json` / `package-lock.json` — untouched
- Database migrations — none created
- ERP DocType definitions — none modified (infrastructure pre-provisioned in `fitdesk_setup.py`)

---

## 5. Architecture Notes

### Idempotency design (Option A — invoice-first)

```
findInvoiceBySession(fdSessionDocname)
  └─ found, cancelled → throw (surface to trainer; re-book required)
  └─ found, draft     → submitSalesInvoice(invoice.id)
  └─ found, other     → reuse as-is
  └─ null             → buildSessionInvoicePayload → createInvoice → submitSalesInvoice
updateSession(id, { status: 'completed', invoiceId, version: v+1 })
```

The `custom_fd_session` field on Sales Invoice is the durable anchor. All retry paths are safe
because the ERP query happens before any write, and the FD Session write happens last.

### TOCTOU residual (accepted MVP)

Sequential retries are fully safe. Two concurrent completions of the same session in the same
millisecond could each pass the `findInvoiceBySession → null` check and create two invoices
before either writes `invoiceId` back to the FD Session. This is accepted at MVP and documented.
Mitigation (distributed lock or DB-level unique constraint on `custom_fd_session`) is deferred.

### Billing dispatch unchanged

- `isTrialSession = true` → status flip only, no billing lookup.
- `billingMode = 'package'` → ledger-first consumption (C4C), no invoice.
- `billingMode = 'pay_per_session'` → C7C invoice flow.
- `billingMode = 'unset'` or null → `BillingNotConfiguredError`.

---

## 6. Test Results

| Suite | Tests | Result |
|---|---|---|
| Pre-C7B baseline | 215 | PASS |
| Post-C7B | 453 | PASS |
| Post-C7C | 453 | PASS |
| Lint | — | ✔ No ESLint warnings or errors |
| Build | 21 routes | ✓ Compiled successfully, types valid |

All 453 tests pass. 238 net new tests added across C7B + C7C.

---

## 7. Non-Goals (explicitly deferred)

- Payment entries — deferred
- Manual invoice UI — deferred
- Cancel / no-show / reschedule PPS handling — deferred
- Distributed lock for TOCTOU — deferred
- Live ERP QA (no invoices created in any real tenant during C7 development)
- Package completion changes — unchanged
- Trial completion changes — unchanged

---

## 8. Suggested Next Steps

- Live QA against test tenant: complete one PPS session, verify Sales Invoice appears in ERPNext
  with `custom_fd_session = <FD Session docname>` and `custom_invoice_kind = Session`
- Verify `invoice_id` field written back to FD Session doc
- Verify idempotency: close tab mid-completion, re-open, re-complete — should reuse existing invoice
- C8 / follow-up: payment entry creation on invoice payment
