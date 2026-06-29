# C5 Billing + Package Architecture — QA Freeze / Handover Report

**Date:** 2026-06-29
**Tenant:** yasser-m-zaidan-p5rm (`12c94378-1ca8-4939-9edb-b072b6dd16e2`)
**Branch:** `main`
**Final gate:** C5-D8 Final Verification — **PASS**

---

## 1. Executive Summary

All C5 Billing + Package Architecture QA gates have passed. The FitDesk package assignment feature is verified end-to-end across the following paths: Pay Later (Sales Invoice only), Paid Now (Sales Invoice + Payment Entry + allocation), duplicate guard (blocking), duplicate override (intentional second assignment), and paid package void guard (ineligible reason rendered, no Void button exposed). The full test suite (1227 tests), ESLint, and production build are all green on `main`.

---

## 2. Scope Covered

- Local DB package model: `client_package_purchase`, `package_ledger`, `package_template`
- ERP-authoritative hybrid: ERPNext Sales Invoice and Payment Entry created/verified via approved Control Plane proxy
- FitDesk UI: `AssignPackageForm`, `AssignPackageSheet`, `PackageDetailsSheet`, `ClientHubPanel`
- Server actions: `assignPackage`, `listAssignablePackageTemplates`, `getClientPackageSummary`, `voidClientPackagePurchase`
- Billing services: `PackageAssignmentService` (Pay Later + Paid Now), `PackageVoidService` (complimentary-only guard)
- Source invariant tests: `assign-package-source.test.ts`
- Duplicate guard: client-side (`canSubmit`) and server-side (`allowDuplicateActivePackage`)
- Void eligibility guard: `isVoidEligible()` + `ineligibleReason()` in `PackageDetailsSheet`

---

## 3. Architecture Decisions Confirmed

| Decision | Status |
|---|---|
| ERPNext is authoritative for Sales Invoice and Payment Entry | Confirmed |
| FitDesk must not create ERP Items at runtime | Confirmed — `TRAINING-SESSION` is a provisioned item, not created by the app |
| `PT-SESSION-BLOCK` item is deferred (not required for MVP QA) | Confirmed |
| Pay Later path: Sales Invoice only, `payment_status=unpaid` | Confirmed |
| Paid Now path: Sales Invoice + Payment Entry (Cash), `payment_status=paid` | Confirmed |
| Payment Entry allocation to Sales Invoice done inside ERP Execution Service | Confirmed |
| `erp_payment_entry_id` is **not** mirrored in local `client_package_purchase` | Confirmed — ERPNext is source of truth for PE |
| Void flow is complimentary-only (`priceAmount === 0`, `erpSalesInvoiceId === null`) | Confirmed |
| Paid and Pay Later packages return `"Paid packages cannot be voided here."` ineligible reason | Confirmed (source + UI) |
| `allowDuplicateActivePackage` flag gates intentional duplicate assignments | Confirmed |
| Idempotency keys generated client-side via `crypto.randomUUID()` | Confirmed |
| FitDesk → Control Plane HMAC-HS256 JWT proxy is the only ERP access path | Confirmed — no direct Frappe calls from app code |

---

## 4. Gate-by-Gate QA Results

| Gate | Description | Result |
|---|---|---|
| C5-A | Package read actions | PASS |
| C5-B | Assign Package UI | PASS |
| C5-C | Package summary card | PASS |
| C5-D1 | Duplicate package warning copy and blocking | PASS |
| C5-D2 | Complimentary package void / cancel | PASS |
| C5-D2.1 | Void reason selector polish | PASS |
| C5-D2.2 | Package void identity safety polish | PASS |
| C5-D3 | Expiry persistence fix | PASS |
| C5-D4 | Pay Later Package QA (end-to-end) | PASS |
| C5-D5 | Paid Now Package QA (end-to-end) | PASS |
| C5-D6A | Duplicate guard blocking | PASS |
| C5-D6B | Duplicate override mutation | PASS |
| C5-D7A | Paid package void guard | PASS |
| C5-D8 | Final verification (tests / lint / build / DB / ERP) | PASS |

---

## 5. Pay Later Result (C5-D4)

**Client:** QA F3 Test Client (`508737cf-…`)
**Template:** `tpl-local-yasser-paid-5` — QA Standard 5 Sessions, USD 100, 5 sessions, 30d expiry

| Check | Result |
|---|---|
| Local purchase created | `ed6d3151-9b9c-4e75-9a76-be0723d0987f` |
| `payment_status` | `unpaid` |
| `package_status` | `active` |
| `erp_sales_invoice_id` | `ACC-SINV-2026-00004` |
| ERP Sales Invoice | `Unpaid`, grand_total=$100, outstanding=$100 |
| ERP Payment Entry | None created |
| Ledger event | `purchase_activation`, delta=+5, ref=ACC-SINV-2026-00004 |
| Session balance | 5 |

---

## 6. Paid Now Result (C5-D5)

**Client:** E2E Alpha Test (`36fbd0fb-…`)
**Template:** `tpl-local-yasser-paid-5`

| Check | Result |
|---|---|
| Local purchase created | `d660081d-74dc-4130-8894-aba6f0ad0ac8` |
| `payment_status` | `paid` |
| `package_status` | `active` |
| `erp_sales_invoice_id` | `ACC-SINV-2026-00005` |
| ERP Sales Invoice | `Paid`, grand_total=$100, outstanding=$0 |
| ERP Payment Entry | `ACC-PAY-2026-00004`, $100, Cash, Receive |
| Payment Entry allocated to invoice | Confirmed (outstanding_amount=$0) |
| Ledger event | `purchase_activation`, delta=+5, ref=ACC-SINV-2026-00005 |
| Session balance | 5 |

---

## 7. Duplicate Guard + Duplicate Override Results (C5-D6A / C5-D6B)

### C5-D6A — Guard Blocking

- Same template (`tpl-local-yasser-paid-5`) selected for E2E Alpha Test while one active purchase already exists.
- Warning rendered: `"This client already has this package active."`
- Detail: `"QA Standard 5 Sessions is already active 1 time with 5 sessions available."`
- `canSubmit` blocked until override checkbox checked (source-confirmed: `(!duplicateWarning || duplicateConfirmed)`).
- Handler guard: `if (!canSubmit || !selectedId) return` — server call never made.
- No new purchase, no new ledger event, no new ERP invoice created.

### C5-D6B — Override Mutation (Pay Later)

- Override checkbox checked: `"I understand — assign another package"`.
- Button label changed to `"Assign another anyway"` (source-confirmed: `duplicateConfirmed ? 'Assign another anyway' : 'Assign'`).
- `allowDuplicateActivePackage: true` sent to server.
- New purchase created: `30afa69f-f7fc-4265-976c-80fd83e8eff4`, `payment_status=unpaid`.
- New ERP Sales Invoice: `ACC-SINV-2026-00006`, `Unpaid`, $100.
- No new Payment Entry.
- Session balance: 5 → 10.
- Both packages `active` simultaneously.

---

## 8. Paid Package Void Guard Result (C5-D7A)

**Tested on:** Both E2E Alpha Test packages (`d660081d` paid, `30afa69f` unpaid).

**Source guard** (`PackageDetailsSheet.tsx:55–71`):

```typescript
function isVoidEligible(p): boolean {
  return (
    p.packageStatus === 'active' &&
    p.templateSnapshot.templateType === 'complimentary' &&  // fails here
    p.templateSnapshot.priceAmount === 0 &&                 // fails here
    p.erpSalesInvoiceId === null &&
    p.remainingBalance > 0 &&
    p.remainingBalance === p.templateSnapshot.sessionCount
  )
}

function ineligibleReason(p): string {
  if (p.templateSnapshot.priceAmount > 0) return 'Paid packages cannot be voided here.'
  ...
}
```

**UI evidence** (accessibility tree, dialog `"Active packages"` open):

| Package | Package ID ref | Ineligible reason ref | Void button |
|---|---|---|---|
| `30afa69f` (unpaid) | ref_139: `"Package ID: 30afa69f"` | ref_140: `"Paid packages cannot be voided here."` | **Absent** |
| `d660081d` (paid) | ref_146: `"Package ID: d660081d"` | ref_147: `"Paid packages cannot be voided here."` | **Absent** |

No void was attempted. No DB or ERP state changed.

---

## 9. Final Verification — C5-D8

### Commands Run

```bash
npx vitest run                   # 47 files / 1227 tests — all passed
npx next lint                    # ✔ No ESLint warnings or errors
node scripts/build-verify.mjs    # next build — compiled successfully
```

### Build Output

- TypeScript: no type errors
- Static pages: 21/21 generated
- Middleware: 27.6 kB
- All 27 app routes compiled

### Git Status (at freeze)

```
?? .env.local.backup-before-client-hub   ← pre-existing, untracked, do not stage
```

No tracked files modified.

---

## 10. DB Artifacts

### `client_package_purchase`

| Client | Purchase ID | `payment_status` | `package_status` | `erp_sales_invoice_id` |
|---|---|---|---|---|
| QA F3 Test Client | `ed6d3151-…` | `unpaid` | `active` | `ACC-SINV-2026-00004` |
| E2E Alpha Test | `d660081d-…` | `paid` | `active` | `ACC-SINV-2026-00005` |
| E2E Alpha Test | `30afa69f-…` | `unpaid` | `active` | `ACC-SINV-2026-00006` |

### `package_ledger`

| Client | Event | Delta | ERP Reference |
|---|---|---|---|
| QA F3 Test Client | `purchase_activation` | +5 | `ACC-SINV-2026-00004` |
| E2E Alpha Test | `purchase_activation` | +5 | `ACC-SINV-2026-00005` |
| E2E Alpha Test | `purchase_activation` | +5 | `ACC-SINV-2026-00006` |

### Session Balances

| Client | Balance |
|---|---|
| QA F3 Test Client | 5 |
| E2E Alpha Test | 10 |

---

## 11. ERP Artifacts

All verified via FitDesk → Control Plane HMAC-HS256 JWT proxy.

| Document | Type | Customer | Status | grand_total | outstanding |
|---|---|---|---|---|---|
| `ACC-SINV-2026-00004` | Sales Invoice | QA F3 Test Client | Unpaid | $100 | $100 |
| `ACC-SINV-2026-00005` | Sales Invoice | E2E Alpha Test | Paid | $100 | $0 |
| `ACC-SINV-2026-00006` | Sales Invoice | E2E Alpha Test | Unpaid | $100 | $100 |
| `ACC-PAY-2026-00004` | Payment Entry | E2E Alpha Test | — | $100 | — |

Payment Entry details: mode=Cash, type=Receive, allocated to ACC-SINV-2026-00005.

ERP Item `TRAINING-SESSION` confirmed reachable: item_group=Services.

---

## 12. Outstanding QA Artifacts / Cleanup Notes

| Item | Notes |
|---|---|
| `ACC-SINV-2026-00006` outstanding $100 | Expected — created deliberately in C5-D6B Pay Later duplicate override. Not a bug. Do not cancel manually in ERPNext; leave for record. |
| QA F3 Test Client pay-later purchase | Active, 5 sessions, unpaid. QA record only. |
| E2E Alpha Test dual packages | Active, 10 sessions total. QA record for duplicate-override scenario. |
| `.env.local.backup-before-client-hub` | Pre-existing untracked file in repo root. Do not stage or delete. |
| `.next/` build artifact | Created by `build:verify`. Already in `.gitignore`. No action needed. |

---

## 13. Risks and Production-Hardening Recommendations

### P1 — ERP Item provisioning

`TRAINING-SESSION` exists because it was manually provisioned in the QA ERPNext tenant. In production, every new tenant needs this item created automatically during provisioning. **Provisioning agent must create `TRAINING-SESSION` (or equivalent items) as part of the tenant setup flow.** FitDesk app code must never attempt runtime item creation.

### P2 — Pay Later invoice recovery path

`ACC-SINV-2026-00006` (and future Pay Later invoices) can remain `Unpaid` indefinitely. FitDesk needs a "Record payment" flow tied to the ERP proxy to mark these invoices paid and create the corresponding Payment Entry. This flow exists at `/dashboard/invoices/[id]/pay` but was not QA'd in C5. Include in C6 or a dedicated invoice payment gate.

### P3 — Duplicate override audit trail

The duplicate override path records `allowDuplicateActivePackage: true` in the server action call but does not persist an audit note on the ERP invoice or local ledger. Consider adding a `notes` field to `client_package_purchase` or a `metadata` column on the ledger entry for operator traceability.

### P4 — Session consumption not yet connected

`package_ledger` events of type `session_consumed` are not yet triggered (FitDesk scheduling is not yet connected). Balance is currently based on `purchase_activation` deltas only. When session booking is wired in C6+, verify that balance calculations in `getClientPackageSummary` use the full ledger sum correctly.

### P5 — Expiry enforcement

Expiry is persisted correctly (`expires_at_utc`) but packages are not auto-expired when the expiry date passes. An expiry job or DB view filtering `expires_at_utc < NOW()` is needed before production launch.

### P6 — Chrome renderer freeze (tool limitation, not app bug)

Window resize while a `WorkspaceShell` dialog is animated causes `Page.captureScreenshot` CDP timeouts. The accessibility tree (`read_page`) remains reliable. Documented here for future QA sessions: avoid resizing browser while sheets are open; use a large stable viewport (1440×900+) from the start.

---

## 14. Final Verdict

**PASS**

All 14 C5 gates passed. The FitDesk Billing + Package Architecture is verified correct for:
- Pay Later and Paid Now assignment paths
- Duplicate detection, blocking, and intentional override
- Paid package void guard
- Local DB ↔ ERP consistency
- Source invariants, unit tests, lint, and production build

The feature is ready to freeze on `main` and proceed to the next phase.

---

## 15. Recommended Next Phase

**C6 — Session Consumption + Balance Deduction**

Wire the session booking flow into `package_ledger`. Each completed session should append a `session_consumed` event with `delta_units = -1`. Verify that `getClientPackageSummary` reports correct remaining balance after session events, and that the package details UI reflects the consumed sessions accurately. Confirm that a package with `remainingBalance < sessionCount` becomes non-voidable (existing guard: `remainingBalance !== sessionCount`).

Pre-conditions before C6:
- Scheduling feature connected to package ledger
- `PT-SESSION-BLOCK` ERP Item created in provisioning (if required by C6 ERP writes)
- Pay Later invoice payment flow (P2 above) included in C6 or a parallel gate
