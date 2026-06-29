# C6 Session Consumption + Balance Deduction — QA Freeze Report

**Date:** 2026-06-29
**Tenant:** yasser-m-zaidan-p5rm (`12c94378-1ca8-4939-9edb-b072b6dd16e2`)
**Branch:** `main`
**Final gate:** C6C-B Toast Polish — **PASS**

---

## 1. Executive Summary

All C6 Session Consumption + Balance Deduction gates have passed. The FitDesk "Use 1 session" feature is verified end-to-end via the Client Hub overlay path. A single click against an active-package client creates one `session_consumed` ledger event (`delta_units = -1`), FIFO-selects the oldest eligible package, decrements its balance, updates the UI total, and fires a client-level toast — all without touching ERP, creating invoices or payment entries, or requiring a migration. The full test suite (1289 tests), ESLint, and production build are all green on `main`.

---

## 2. Scope Completed

| Sub-phase | Description | Result |
|---|---|---|
| C6A | Package consumption building blocks | PASS |
| C6B | "Use 1 session" server action + UI button | PASS |
| C6C-A | Manual QA happy path (soft-nav) | PASS |
| C6C-B | Toast micro-polish (client-level total) | PASS |

**Components touched:**
- `lib/billing/package-consumption-service.ts` — `PackageConsumptionService.consumeSession()`
- `lib/billing/package-ledger-repository.ts` — `deriveBalance()`, `findBestEligiblePackageForClient()`
- `lib/clients/repository.ts` — `ClientRepository.findClientById()`
- `actions/packages.ts` — `usePackageSession()` server action
- `components/clients/PackageDetailsSheet.tsx` — "Use 1 session" button + toast
- `components/clients/__tests__/assign-package-source.test.ts` — source invariant tests

**Nothing touched:**
- ERP adapter (`lib/erpnext/client.ts`) — confirmed untouched
- Session actions (`actions/sessions.ts`) — confirmed untouched
- Scheduling files — confirmed untouched
- Invoice / payment code — confirmed untouched
- Database migrations — none created

---

## 3. Architecture Decisions Confirmed

| Decision | Status |
|---|---|
| `session_consumed` event is a local-only ledger append — no ERP write | Confirmed |
| Session balance = `SUM(delta_units)` over the append-only `package_ledger` | Confirmed |
| FIFO package selection: earliest `expires_at_utc ASC NULLS LAST`, then `activated_at_utc ASC` | Confirmed |
| `erpCustomerId` resolved server-side from `clientIndexId` — never trusted from client payload | Confirmed |
| All four `ConsumeSessionResult` outcomes (`consumed`, `already_done`, `no_package`, `no_balance`) return `success:true` | Confirmed |
| Idempotency key format: `session_consumed:{uuid}` where uuid is `crypto.randomUUID()` from the browser | Confirmed |
| C6 does not trigger ERP PT Session DocType | Confirmed — deferred |
| No migration required for C6 | Confirmed — schema already has `event_type` and `delta_units` columns |
| UI path is soft-navigation only via `@overlay/(.)clients/[id]` | Confirmed — hard-nav SSR crash is pre-existing and deferred |

---

## 4. C6A Implementation Summary

**Commit:** `aaaee6d feat(billing): add C6A package consumption building blocks`

| Component | Detail |
|---|---|
| `PackageConsumptionService.consumeSession()` | Core consumption method; appends `session_consumed` event; returns `ConsumeSessionResult` |
| `findBestEligiblePackageForClient()` | FIFO selection: active, non-expired, balance > 0; sorted by `expires_at_utc ASC NULLS LAST`, `activated_at_utc ASC` |
| Idempotency | Key prefix `session_consumed:{sessionId}`; duplicate call returns `outcome: 'already_done'` |
| `event_type` | `session_consumed` |
| `delta_units` | `-1` |
| `no_package` outcome | No active eligible package found |
| `no_balance` outcome | Package found but balance already exhausted |
| ERP writes | None |
| Server action / UI | Not wired in C6A — building blocks only |

---

## 5. C6B Implementation Summary

**Commit:** `2f51010 feat(billing): add C6B Use 1 session action and button`

| Component | Detail |
|---|---|
| `ClientRepository.findClientById()` | New method to resolve `erpCustomerId` from `clientIndexId` server-side |
| `usePackageSession({ clientIndexId, idempotencyKey })` | New server action in `actions/packages.ts`; resolves ERP ID server-side; calls `PackageConsumptionService.consumeSession()` |
| `PackageDetailsSheet` button | "Use 1 session" button at top of "Active packages" sheet; disabled when `totalAvailable <= 0` or action pending |
| Double-click guard | `isConsumingRef` ref prevents concurrent submissions |
| State reload | `getClientPackageSummary()` called after action; `setPurchases()` updates sheet without hard nav |
| `router.refresh()` | Called for page-level stale revalidation (may 503 due to pre-existing overlay SSR crash; state reload via server action is the primary update path) |
| ERP writes | None — explicitly documented in JSDoc |
| Invoice / payment side effects | None |
| Migration | None |

---

## 6. C6C-A Manual QA Result

**QA client:** E2E Alpha Test
**Method:** Soft navigation from `/dashboard/clients` only
**Local container:** `axis-local-fitdesk-1`, rebuilt from commit `2f51010` with `FITDESK_CLIENT_HUB_ENABLED=1`

### Pre-state

| Check | Value |
|---|---|
| Active packages | `d660081d` (5 sessions, activated 09:58 UTC) + `30afa69f` (5 sessions, activated 12:05 UTC) |
| Total session balance | 10 |
| `session_consumed` events | 0 |

### QA Flow

1. Hard nav to `/dashboard/clients` → clients list loaded
2. `JS .click()` on `<a>` for "E2E Alpha Test" → `@overlay/(.)clients/[id]` intercepted (soft nav) ✓
3. `JS .click()` on "View details" → `PackageDetailsSheet` opened, showed **"10 sessions available"** ✓
4. `JS .click()` on "Use 1 session" button (enabled, not disabled) → server action fired

*Note: `element.click()` via `javascript_tool` was required to fire React synthetic events — Chrome MCP `ref`-based `left_click` does not trigger React `onClick` handlers on Next.js `type="button"` elements.*

### Post-state

| Check | Value | Expected | Match |
|---|---|---|---|
| Network response | POST → 200 | 200 | ✓ |
| New `session_consumed` events | 1 | 1 | ✓ |
| `delta_units` | -1 | -1 | ✓ |
| Idempotency key | `session_consumed:e5a29eef-bdf8-4c2e-ba8c-1a0b1a6ef39e` | `session_consumed:{uuid}` | ✓ |
| `erp_customer_id` on event | `E2E Alpha Test` | server-resolved | ✓ |
| FIFO package selected | `d660081d` (older, activated 09:58) | older first | ✓ |
| Consumed package balance | 4 (was 5) | 5 − 1 = 4 | ✓ |
| Untouched package balance | 5 (unchanged) | 5 | ✓ |
| Total remaining | 9 | 10 − 1 = 9 | ✓ |
| UI: "Record a session" | **"9 sessions available"** | 9 | ✓ |
| UI: OLDER package | **"4 sessions available"** | 4 | ✓ |
| UI: NEWER package | **"5 sessions available"** | 5 | ✓ |
| Void guard (paid packages) | "Paid packages cannot be voided here." | ineligible | ✓ |
| ERP writes | 0 | 0 | ✓ |
| Invoice/payment writes | 0 | 0 | ✓ |
| Git status | `?? .env.local.backup-before-client-hub` only | clean | ✓ |

**C6C-A verdict: PASS**

---

## 7. C6C-B Toast Polish Result

**Commit:** `c231204 fix(billing): show total sessions remaining after manual use`

**Issue found in C6C-A:** The `consumed` toast displayed `result.data.remainingBalance`, which is the post-deduction balance of the single selected package (4), not the total remaining client sessions across all packages (9). Since "Use 1 session" is a client-level action, the toast should reflect the client's total available session count.

**Fix applied** (`PackageDetailsSheet.tsx`):

```typescript
// Before (C6B):
toast.success(`Session recorded. ${result.data.remainingBalance} remaining.`)

// After (C6C-B):
const remaining = Math.max(totalAvailable - 1, 0)
toast.success(`Session recorded. ${remaining} ${remaining === 1 ? 'session' : 'sessions'} remaining.`)
```

`totalAvailable` is the pre-click total (`purchases.reduce((sum, p) => sum + p.remainingBalance, 0)`), captured in the component closure when the button was clicked. `Math.max(..., 0)` guards the zero-session edge case.

**Toast copy examples:**

| Sessions before click | Toast after click |
|---|---|
| 10 | `Session recorded. 9 sessions remaining.` |
| 2 | `Session recorded. 1 session remaining.` |
| 1 | `Session recorded. 0 sessions remaining.` |

**Source invariant added** (`assign-package-source.test.ts`):
> `consumed toast uses client-level totalAvailable minus 1, not per-package remainingBalance`
- Asserts `result.data.remainingBalance` is absent from source
- Asserts `totalAvailable - 1` and `Math.max(` are present
- Asserts `'session'` and `'sessions'` string literals present (singular-safe)

**C6C-B verdict: PASS**

---

## 8. Test / Lint / Build Verification

### C6B Gate

| Check | Result |
|---|---|
| `npx vitest run` | 1288 / 1288 passed — 47 files |
| `npx next lint` | ✔ No ESLint warnings or errors |
| Build verify | Compiled successfully |

### C6C-B Gate (final)

| Check | Result |
|---|---|
| `npx vitest run` | **1289 / 1289 passed — 48 files** |
| `npx next lint` | ✔ No ESLint warnings or errors |
| `npx next build` | Compiled successfully |

### Git Status at Freeze

```
?? .env.local.backup-before-client-hub   ← pre-existing, untracked, do not stage
```

No tracked files modified. Working tree clean.

---

## 9. DB / Ledger Artifacts from Manual QA

### `package_ledger` (E2E Alpha Test)

| Event type | `delta_units` | Package ID | Idempotency key | Created at (UTC) |
|---|---|---|---|---|
| `purchase_activation` | +5 | `d660081d-…` | `ba0c5257-…:activation` | 2026-06-29T09:58:51Z |
| `purchase_activation` | +5 | `30afa69f-…` | `fdee6c93-…:activation` | 2026-06-29T12:05:15Z |
| `session_consumed` | **−1** | `d660081d-…` | `session_consumed:e5a29eef-…` | 2026-06-29T18:23:52Z |

### `client_package_purchase` (E2E Alpha Test)

| Purchase ID | `package_status` | Balance | FIFO order |
|---|---|---|---|
| `d660081d-74dc-4130-8894-aba6f0ad0ac8` | `active` | **4** (was 5) | Consumed first (older) |
| `30afa69f-f7fc-4265-976c-80fd83e8eff4` | `active` | **5** (unchanged) | Not consumed |

**Total balance: 9** (was 10)

---

## 10. ERP Non-Write Confirmation

The `usePackageSession` server action (`actions/packages.ts:175–217`) contains:

- Zero calls to `createInvoice`, `submitSalesInvoice`, `createAndSubmitPaymentEntry`, or `getInvoiceById`
- Zero imports of `erp-adapter` functions beyond what was already present
- Zero calls to `erpFetch` or the Control Plane HMAC proxy

**Confirmed by:** JSDoc (`"No ERP writes. No invoice or payment side effects."`), code review, and C6C-A runtime verification (network monitoring showed only local POST requests; no outbound ERP calls in container logs).

---

## 11. Known Deferred Issues

| Item | Status | Recommended path |
|---|---|---|
| Hard navigation to `/dashboard/clients/[id]` causes `TypeError: Cannot read properties of undefined (reading '0')` in `app-page.runtime.prod.js` (Next.js 14.2.21 parallel/intercepting route SSR crash) | Deferred — pre-existing, not introduced by C6 | Separate route stability fix; upgrade Next.js or restructure `@overlay/(.)clients/[id]` layout |
| `router.refresh()` returns 503 in overlay context (consequence of above SSR crash) | Deferred — UI state reload via `getClientPackageSummary()` + `setPurchases()` is the effective update path | Resolved automatically when SSR crash is fixed |
| `no_balance` and `no_package` outcome paths were not exercised in manual QA | Automated tests cover these outcomes; manual verification deferred | Exercise in C6-later once real depletion scenario exists in QA data |
| Idempotency replay (`already_done` outcome) not manually verified | Automated tests cover idempotency; manual verification deferred | Click "Use 1 session" twice on same session to observe toast "This session was already recorded." |
| Last-unit concurrency race (two trainers clicking simultaneously on zero-balance client) | Not addressed — production hardening | Add `SELECT ... FOR UPDATE` or optimistic concurrency check before insert |
| Expiry sweep (packages not auto-expired when `expires_at_utc` passes) | Carried from C5 — production hardening | Scheduled expiry job or SQL view filter |
| Session reversal / undo (un-consume a `session_consumed` event) | Not implemented — future hardening | Append compensating `session_unconsume` event with `delta_units = +1` |
| ERP PT Session DocType trigger | Deferred — not required for C6 MVP | C6-later: when scheduling/session persistence is wired, append ERP session record |
| Real scheduling integration (FitDesk scheduler → package ledger) | Deferred | C6-later / Phase E scheduling integration |

---

## 12. Production-Hardening Recommendations

### P1 — Concurrency guard for last-unit consumption

`consumeSession` reads balance and appends the event in two separate statements. Under concurrent writes, two trainers could both read `balance = 1` and both append `session_consumed`, resulting in `balance = -1`. Before production launch:

- Add a row-level lock or a `CHECK` constraint on the ledger balance
- Or use a conditional insert: `INSERT ... WHERE deriveBalance() > 0`

### P2 — Expiry enforcement at consumption time

`findBestEligiblePackageForClient` filters `expires_at_utc > NOW()` at query time, so expired packages are already excluded from selection. However, packages silently become ineligible without notifying the trainer. A proactive expiry sweep or a UI badge showing `X days until expiry` would prevent surprise `no_package` outcomes.

### P3 — `no_balance` / `no_package` UX recovery path

When `outcome` is `no_package` or `no_balance`, the toast warns the trainer but the sheet closes or stays with no action. Consider offering a one-tap shortcut to the "Assign package" flow directly from the warning toast.

### P4 — Session reversal (un-consume)

There is no undo for a `session_consumed` event. A trainer who clicks "Use 1 session" by mistake currently has no recovery path. A `session_reversal` compensating event (delta = +1) with a reason field and audit trail is the cleanest path without corrupting the ledger.

### P5 — ERP PT Session sync (deferred from C6)

When the scheduling integration is wired, the C6 `session_consumed` ledger event should correspond to or trigger an ERP PT Session record for billing reconciliation. Define the ERP DocType mapping before C7 or Phase E connects the scheduler.

### P6 — Overlay hard-nav stability (Next.js 14.2.21)

The `@overlay/(.)clients/[id]` parallel/intercepting route crashes on hard navigation. The C6 QA used soft nav (`<a>` clicks via JS) as the intended path, but if users bookmark the URL or navigate directly from elsewhere, they will hit the crash. This needs resolution before production rollout of the Client Hub.

---

## 13. Final Verdict

**PASS**

All C6 gates passed:
- `PackageConsumptionService.consumeSession()` correctly appends `session_consumed` with `delta_units = -1`
- FIFO package selection is working (oldest eligible package consumed first)
- Idempotency is enforced (`session_consumed:{uuid}` key prefix)
- UI updates correctly after consumption (no hard nav required)
- Toast shows client-level total remaining sessions (not per-package balance)
- No ERP writes at any point
- 1289 tests pass, lint is clean, production build compiles

The feature is ready to freeze on `main` and proceed to the next phase.

---

## 14. Commits

| Commit | Message | Scope |
|---|---|---|
| `aaaee6d` | `feat(billing): add C6A package consumption building blocks` | Service + repo layer |
| `2f51010` | `feat(billing): add C6B Use 1 session action and button` | Server action + UI |
| `c231204` | `fix(billing): show total sessions remaining after manual use` | Toast copy fix |

---

## 15. Recommended Next Phase

**C6-Later / Phase E — Scheduling Integration + Session Ledger Sync**

With the local `session_consumed` ledger established and verified, the natural next step is wiring the FitDesk scheduler to the package ledger: when a trainer marks a scheduled appointment as completed, auto-append a `session_consumed` event. Prerequisites:

- Phase E scheduling integration must produce a stable "session completed" event
- That event must pass `clientIndexId` and a server-generated `idempotencyKey` to `usePackageSession` (or a direct service call on the server side)
- ERP PT Session DocType sync can be layered on top once the scheduling event shape is stable

**Parallel tracks that do not block scheduling integration:**
- Hard-nav route stability fix (Next.js overlay crash)
- Pay Later invoice payment flow (carried from C5-P2)
- Concurrency guard (P1 above)
