# Tenant-Aware Payment — Slice 1 — Checkpoint

| | |
|---|---|
| **Status** | Implementation complete, both release blockers closed, verified in isolated worktree. **Not committed, not pushed.** |
| **Date** | 2026-07-15 |
| **Worktree** | `FitDesk/.claude/worktrees/tenant-aware-payment-slice-1` (locked) |
| **Branch / baseline** | `worktree-tenant-aware-payment-slice-1` @ `ed7c42f` — confirmed equal to current `origin/main` tip (read-only `git fetch`/`rev-parse`, no checkout/reset/merge performed) |
| **Plan** | `docs/plans/FITDESK_TENANT_AWARE_PAYMENT_OPTIONS_IMPLEMENTATION_PLAN.md` §5 Slice 1 + §7 |

No production, ERP, database, or deployment mutations were performed at any point in this work. No Modes of Payment, Chart-of-Accounts entries, migrations, or provisioning changes were created. Commit and push remain **awaiting explicit approval**.

---

## 1. Incident root cause (recap)

A missing ERPNext Mode of Payment (404) was swallowed by a bare `catch {}` in `createAndSubmitPaymentEntry` and re-thrown as a generic HTTP 503 "deposit account missing" — mistranslating "method doesn't exist" into "method exists but is misconfigured." The catalog was also not tenant-aware: `whish_money` was marked `enabled: true` globally regardless of what a given tenant's ERP site actually supported.

## 2. What this slice changes

- Payment-method availability is now a **live, bounded, cached ERP preflight** (`lib/payments/availability.ts`), not a static global catalog.
- The 404-swallow is fixed: `createAndSubmitPaymentEntry` now throws `PaymentMethodNotFoundError` (404), `PaymentAccountMissingError` (found, enabled, but no company-mapped account), or lets `ERPNextError` (connectivity) propagate — never conflating the three. The account lookup now requires an exact company match (no `accounts[0]` cross-company fallback).
- A structured error contract (`lib/payments/errors.ts`) replaces ad-hoc string errors for configuration failures, mirroring the existing `schedulingActions.ts` typed-error precedent.
- **All three** transaction selectors now show tenant-validated methods only, never a guessed or assumed one:
  - Invoice pay page and the invoices-list "Mark Paid" sheet call `getAvailablePaymentMethods(invoiceId)` directly.
  - `AssignPackageForm` **defers** method selection entirely until a real invoice exists (§5) — it no longer offers a method picker at all.
- Cache: a short (60s) fresh-result cache is retained; **stale last-known-good serving is disabled by default** for pilot safety (§6).
- Canonical `npm run lint` now verified to exit 0 outside the nested-worktree artifact, with **zero changes to `.eslintrc.json`** (§7).

## 3. Files changed

New:
- `lib/payments/rails.ts`, `lib/payments/errors.ts`, `lib/payments/availability.ts`, `lib/payments/selector-view.ts`
- `lib/payments/availability.test.ts`, `lib/payments/selector-view.test.ts`
- `lib/billing/assign-package-flow.ts`, `lib/billing/assign-package-flow.test.ts`

Modified:
- `lib/erpnext/client.ts` (+ `client.test.ts`) — `listEnabledModesOfPayment()`, `getModeOfPaymentDoc()`, `getInvoiceCompany()`; Defect B fix in `createAndSubmitPaymentEntry`
- `actions/invoices.ts` (+ `invoices.test.ts`) — `getAvailablePaymentMethods(invoiceId)`; `recordPayment`/`collectPayment` carry a structured `code` on configuration failures
- `lib/business-data/index.ts` — return-type update for the barrel wrapper
- `app/dashboard/invoices/[id]/pay/page.tsx`, `app/dashboard/invoices/[id]/pay/RecordPaymentForm.tsx` — available-only selector + configuration-unavailable state
- `components/modules/InvoicesView.tsx` — `MarkPaidSheet` wired to the same availability resolver
- `components/clients/AssignPackageForm.tsx` — early payment-method selector removed; Paid Now now hands off to the existing invoice payment flow (§5)
- `components/clients/__tests__/assign-package-source.test.ts` — two assertions updated to match the new deferred-payment architecture (see §5); every other invariant in this file (duplicate-warning behavior, void-package wording, `ClientHubPanel`/`PackageDetailsSheet` integration) is untouched

Not touched (explicit scope boundary): `.eslintrc.json`, `lib/billing/package-assignment-service.ts`, `actions/packages.ts`, `types/billing.ts` (the pre-existing `executePaidNowPath`/`AssignPackagePaymentInput` capability is no longer called by the UI but was left in place — removing it is a separate, out-of-scope change), `package.json` / `package-lock.json` (dependencies installed exactly as locked, no version changes).

## 4. Control Plane proxy verdict: GO — no CP change required

Read-only audit of `control-plane/src/modules/erp-proxy/erp-proxy.routes.ts`:

- `GET /api/erp/doctype/:type` (lines 218-232) and `GET /api/erp/doctype/:type/:name` (lines 253-267) forward to Frappe's `GET /api/resource/*` for **any** DocType — no allowlist exists anywhere in `control-plane/src` (confirmed by repo-wide search).
- `forwardToFrappe` (lines 139-142) copies every query-string key verbatim onto the outgoing request — `filters`, `fields`, `limit_page_length`, and pagination params all pass through unrestricted.
- The detail-read route returns Frappe's raw response body unmodified (line 264) — a Mode of Payment's `accounts[]` child table is returned exactly as Frappe provides it.
- `erp-proxy.routes.test.ts` corroborates this generic behavior using an arbitrary DocType (`Item`) with no special-casing.
- FitDesk's `listEnabledModesOfPayment()` / `getModeOfPaymentDoc()` use the same param names (`filters`, `fields`, `limit_page_length`) as pre-existing, already-relied-upon reads (e.g. `getInvoices`) — a proven path, not new risk.

## 5. AssignPackageForm — RESOLVED: deferred-payment redesign (was a blocker, now closed)

**The blocker.** `resolveAvailablePaymentMethods` requires `company`, which has **no invoice-independent source anywhere in this codebase** (checked: `workspaceProvisioning` local table, `buildPackageInvoicePayload`, `ERPTrainerSettings` — none carry it). Inventing a "resolve the tenant's default Company" read would assume single-company-per-tenant-site, an unapproved design decision — explicitly out of scope, not built.

**The resolution: defer method selection until the invoice exists, then hand off to the already-safe invoice payment flow.**

Before (this session's earlier state):
- Trainer picks a template, toggles Pay Later/Paid Now, and — for Paid Now — picked a payment method from the **static, non-tenant-validated** `enabledPaymentMethods()` catalog, all before any invoice existed.
- `assignPackage()` was called with `{ payment: { method } }`; the service's `executePaidNowPath` attempted `createAndSubmitPaymentEntry` inline, using a method the UI never validated against this tenant's real ERP configuration.

After:
1. Trainer picks a template and toggles Pay Later / **Paid Now** — no method picker appears at all, for either mode.
2. `handleConfirm` calls `assignPackage()` via `buildAssignPackagePayload(...)`, which **never includes a `payment` field**, regardless of `payMode`. This routes both modes through the exact same, already-existing `executeNonZeroPath` (package + invoice created and submitted; invoice left `outstanding_amount > 0`, package activated as `paymentStatus: 'unpaid'`; no Payment Entry ever attempted at this step).
3. On success, `decidePostAssignmentAction({ payMode, erpInvoiceId: result.data.erpInvoiceId })` decides what happens next:
   - **Pay Later** (or a complimentary/zero-price package) → the existing "Package assigned" success screen, byte-for-byte unchanged.
   - **Paid Now** with a real invoice id → the sheet closes (`onClose()`) and the trainer is navigated (`router.push`) straight to the **existing**, unmodified `/dashboard/invoices/[id]/pay` page for that exact invoice.
4. That existing page independently resolves `getAvailablePaymentMethods(invoiceId)` against the invoice's **real** tenant, company, and outstanding currency — the same preflight already used by the other two selectors — and shows only validated, available methods.
5. The trainer records payment through the **existing, unmodified** `recordPayment` server action, which re-validates the Mode of Payment/account mapping server-side before any Payment Entry POST (defense in depth, inherited unchanged from §2/Defect B).
6. If the trainer never completes payment, nothing reverts: the package stays active, the invoice stays outstanding/payable — exactly the pre-existing "payment pending, collect later" state, just reached by navigating away instead of an inline failure.

**Why this is the smallest safe change:** no new server action, no new payment-recording code, no change to `package-assignment-service.ts`/`actions/packages.ts`/invoice-generation rules. The only new code is a small pure decision module (`lib/billing/assign-package-flow.ts`) and the component wiring to call it. `AssignPackageForm.tsx` still cannot import from `@/actions/invoices` (enforced by a pre-existing, unmodified source-invariant test) — the redesign works entirely via URL navigation to the existing page, never by duplicating its logic.

**Confirmed no company/account/method was guessed:** grep-verified `AssignPackageForm.tsx` no longer imports `enabledPaymentMethods` or anything from `@/lib/payments/methods`; `lib/billing/assign-package-flow.ts` has exactly one import (a type-only import from `@/types/billing`) and no path to the ERP client, `createAndSubmitPaymentEntry`, or `assignPackage` itself.

## 6. Cache behavior

- Fresh-result TTL: 60s (unchanged; ordinary caching of a just-validated result, never crosses a probe-failure boundary).
- **Stale last-known-good serving: disabled by default** (`STALE_SERVE_ENABLED = false` in `lib/payments/availability.ts`). A failed fresh probe always surfaces `PAYMENT_CONFIGURATION_UNAVAILABLE` with zero selectable methods — never a Cash or any-method assumption, regardless of cache age. The 5-minute stale-window mechanism is retained in code (not deleted) but is inert pending a separate approval to re-enable it.
- Cache key: `tenantId | company | currency | configVersion` — verified by dedicated tests that availability for one tenant/company/currency is never reused for another.

## 7. RESOLVED: canonical `npm run lint` (was blocked, now verified exit 0)

**Root cause (unchanged from the prior finding):** this worktree is nested inside the main checkout (`FitDesk/.claude/worktrees/tenant-aware-payment-slice-1/`, three levels under `FitDesk/`). Neither the worktree's nor the main checkout's `.eslintrc.json` sets `"root": true`, so ESLint's legacy config cascade walks up and merges in the main checkout's config too, resolving the `@next/next` plugin from two different physical `node_modules` locations and refusing with a plugin-conflict error.

**Resolution: verified in a true sibling worktree, outside the nested path, with zero `.eslintrc.json` changes.**

1. Exported the full uncommitted diff to a patch file (`git add -A && git diff --cached`, then unstaged).
2. Created `C:\Users\Lenovo\Dev\axis-erp\FitDesk-payment-verify` via `git worktree add ... ed7c42f` — a true sibling of `FitDesk/`, not nested under it.
3. Applied the patch cleanly (`git apply --check` then `git apply`) — file list matched the original exactly.
4. `npm ci` (590 packages, same as the original worktree).
5. Ran the canonical suite there:

| Check | Command | Exit |
|---|---|---|
| Lint | `npm run lint` | **0** — `✔ No ESLint warnings or errors` |
| Targeted payment tests | `vitest run lib/payments/ lib/erpnext/client.test.ts actions/invoices.test.ts` | **0** (152/152) |
| Full suite | `vitest run` | **0** (82/82 files, 2457/2457 tests, on retry — first attempt hit a transient vitest worker-pool crash unrelated to any test content, confirmed transient by an immediate clean re-run) |
| Build verify | `node scripts/build-verify.mjs` | **0** |
| `git diff --check` | | **0** |

6. Removed the sibling worktree (`git worktree remove --force`, then a filesystem retry for one transiently-locked empty directory handle) and the temporary patch file. Confirmed: `git worktree list` shows only the original 4 entries; the original implementation worktree's `git status --short` is byte-identical to before this phase.

**No `.eslintrc.json` edit was made anywhere.** The nested nested-nested worktree path was the sole cause; a sibling location resolves it with zero configuration changes.

## 8. Verification performed (final, original implementation worktree)

| Check | Command | Result |
|---|---|---|
| Targeted payment + package tests | `vitest run lib/payments/ lib/erpnext/client.test.ts actions/invoices.test.ts lib/billing/ components/clients/__tests__/assign-package-source.test.ts actions/packages.test.ts` | **779/779 passed** (24 files) |
| Full suite | `vitest run` | **2477/2477 passed** (83 files) on retry — first attempt hit the same transient worker-pool crash as §7, confirmed transient |
| Canonical lint | verified in the sibling worktree (§7) | **exit 0** |
| Diagnostic scoped lint (this worktree) | raw `eslint` with cascade bypassed, all changed files incl. this session's new files | **exit 0, clean** |
| Type-check baseline comparison | `tsc --noEmit` on stashed-to-`ed7c42f` vs. full worktree, diffed | **Zero new errors.** The only diff line is the same pre-existing `TS1501` (es2018 regex flag) at a shifted line number (268→283) — caused by this session's unrelated edits earlier in the same file, not a new error |
| Build verification | `node scripts/build-verify.mjs` | **exit 0** |
| `git diff --check` | | **exit 0** |

## 9. Remaining approval gates

1. Commit and push (payment logic — CRITICAL / REQUIRE-APPROVAL per workspace and FitDesk `CLAUDE.md`).
2. Stale-serve re-enablement (§6) — only after a separate product/security review.
3. Optional cleanup (not required for release): `package-assignment-service.ts`'s `executePaidNowPath` and `AssignPackagePaymentInput`/`createAndSubmitPaymentEntry` adapter capability are no longer called by any UI (the only caller, `AssignPackageForm`, no longer uses them) but were left in place as an out-of-scope change; a future PR could remove them if confirmed to have no other callers.
