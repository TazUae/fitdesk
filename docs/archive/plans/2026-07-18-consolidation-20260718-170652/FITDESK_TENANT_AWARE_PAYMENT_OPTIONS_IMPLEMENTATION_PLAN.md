> **Status:** Archived - superseded payment plan
> **Replacement authority:** docs/plans/FITDESK_LEBANON_PAYMENT_PROGRAM_MASTER_EXECUTION_PLAN.md
> **Archived date:** 2026-07-18
> **Instruction:** Do not execute this historical plan without a new current-state audit.
> **Note:** Relative link paths were depth-adjusted on 2026-07-19 for the archive location. No other content was modified.

---

# FitDesk — Tenant-Aware Payment Options — Implementation Plan

| | |
|---|---|
| **Status** | Draft for approval — **not approved**. Planning only; no code written. |
| **Author** | Claude Code (audit + planning pass) |
| **Date** | 2026-07-15 |
| **Scope** | Make the payment-method selector reflect what each tenant's ERPNext site can actually accept, fix the incident that mis-reported a missing Mode of Payment as a missing deposit account, and lay out the full tenant-aware payment catalog. |
| **Authoritative baseline** | `origin/main` @ `ed7c42f` (see §1). Future implementation branches **from `origin/main`**, never from the deleted `fix/goal-system-functional-closure` branch. |
| **Supersedes** | The chat-only plan from the prior audit run. This document is the corrected, authoritative plan. |

> This plan touches **payment logic**, which is on the CRITICAL / REQUIRE-APPROVAL list in both the workspace and FitDesk `CLAUDE.md`. No implementation begins until this plan is explicitly approved. The plan creates **no** Modes of Payment, **no** Chart-of-Accounts changes, **no** migrations, and **no** provisioning changes.

---

## 1. Baseline & branch safety

The working checkout is on branch `fix/goal-system-functional-closure` whose upstream is **gone** (deleted after merge). That deleted branch must **not** be treated as the baseline for payment work. Read-only verification performed this run:

- `git fetch origin` (read-only; no checkout, reset, rebase, merge, or branch modification).
- **`origin/main` HEAD** = `ed7c42f Merge pull request #42 from TazUae/fix/goal-system-functional-closure`.
- Current local HEAD `36d443e` **is an ancestor of `origin/main`** (`git merge-base --is-ancestor` → true). The only commit on `origin/main` not in the local checkout is the PR-#42 merge commit itself.
- **Payment-file diff `HEAD..origin/main` is empty** for every payment-related file (`lib/payments/`, `lib/whish.ts`, `actions/invoices.ts`, `lib/erpnext/client.ts`, `lib/erpnext/types.ts`, `app/dashboard/invoices/[id]/pay/*`, `components/modules/InvoicesView.tsx`, `components/clients/AssignPackageForm.tsx`, `app/dashboard/settings/page.tsx`, `types/settings.ts`, `types/index.ts`, `lib/errors/is-unavailable-error.ts`, `lib/pilot.ts`, `lib/tenant/context.ts`).

**Conclusion:** the audited current-state code equals the newest authoritative code on `origin/main`. No difference affects this plan. **Action for implementation:** cut the feature branch (e.g. `feat/tenant-aware-payments`) **from `origin/main` @ `ed7c42f`**, not from the current detached goal branch.

---

## 2. Confirmed root causes (verified against `origin/main`)

**Defect A — the catalog is not tenant-aware.** [`lib/payments/methods.ts:25-32`](../../../../lib/payments/methods.ts) marks `whish_money` `enabled: true` **globally**. Every tenant is offered Whish Money regardless of whether their ERPNext site has that Mode of Payment. The audited tenant has only `Cash`.

**Defect B — a missing Mode of Payment is mistranslated into a deposit-account error.** In `createAndSubmitPaymentEntry` ([`lib/erpnext/client.ts:731-752`](../../../../lib/erpnext/client.ts)):

```
Step 2: GET /api/resource/Mode of Payment/<name>   → 404 when the MoP does not exist
        catch { /* swallowed */ }                  → the 404 is discarded silently
        if (!paidTo) throw ERPNextError(503, "Payment Account Missing",
              "No deposit account is configured for payment method …")
```

A **404 (method absent)** is swallowed and re-thrown as a **503 "deposit account missing"** — the exact incident on `ACC-SINV-2026-00007`. Correctly, the throw happens **before** the Payment Entry POST (Step 3), so **no financial write occurred**. That safety property is preserved by this plan.

**Gap C — no availability probe exists.** The ERP client can only GET a single MoP doc; there is no capability to *list* a tenant's enabled Modes of Payment, so the UI cannot know what to offer.

**Structural issue D — two overlapping enums.** `PaymentMethod` (`cash | whish_money | omt`, [`lib/payments/methods.ts`](../../../../lib/payments/methods.ts)) drives *recording*; `PaymentProvider` (`whish | cash | bank_transfer`, [`lib/whish.ts:37`](../../../../lib/whish.ts)) drives *link generation* + `Payment.provider` + audit. They are reconciled ad-hoc in the UI ([`InvoicesView.tsx:236`](../../../../components/modules/InvoicesView.tsx)). The design formalizes this split (see §6) rather than adding a third representation.

**Current payment surfaces (complete inventory):**

| Surface | File | Note |
|---|---|---|
| Method catalog | `lib/payments/methods.ts` | static global `enabled` |
| Selector (invoice pay page) | `app/dashboard/invoices/[id]/pay/RecordPaymentForm.tsx` | uses `enabledPaymentMethods()` |
| Selector (invoice list sheet) | `components/modules/InvoicesView.tsx` | uses `enabledPaymentMethods()` + `PAYMENT_PROVIDERS` |
| Selector (package assign) | `components/clients/AssignPackageForm.tsx` | uses `enabledPaymentMethods()` |
| Server validation | `actions/invoices.ts` (`recordPayment`, `collectPayment`) | `isEnabledPaymentMethod()` |
| MoP → account resolve + POST | `lib/erpnext/client.ts` (`createAndSubmitPaymentEntry`) | site of Defect B |
| Settings display list | `app/dashboard/settings/page.tsx:5` | hardcoded, decorative, not tenant-aware |
| Settings type (unwired) | `types/settings.ts:150` (`PaymentsSettings`) | never persisted |

---

## 3. Locked decisions (from prior run) + corrections (this run)

- **Availability source of truth:** live ERPNext probe through the **existing `erpFetch` → Control Plane proxy**. No new CP endpoint, no new DB table, no provisioning change. ERPNext stays the single source of truth.
- **Rollout:** incident-fix first (Slice 1), then full catalog (Slice 2).
- **CORRECTION — no "fail closed to Cash".** A failed probe does not prove Cash exists (see §4.4).
- **CORRECTION — account-mapping is validated *before* the method is selectable**, via a bounded preflight (see §4.3), not deferred to submit.
- **CORRECTION — transaction UI shows only `available` methods**; the full catalog with per-method status lives in Settings (see §4.5).
- **CORRECTION — structured domain error codes**, mirroring the existing `SchedulingResult` pattern; **no generic 503 for business-configuration errors** (see §4.6).
- **CORRECTION — stable method IDs** (`cash` stays `cash`); "Fresh USD" is settlement/display metadata, not an ID (see §4.1).

---

## 4. Corrected design

### 4.1 Domain model — stable identities + settlement metadata

Method IDs are stable domain identities and must be preserved across the catalog expansion. **Do not** rename `cash` → `cash_fresh_usd`. Model "Fresh USD" as settlement metadata.

```ts
// lib/payments/rails.ts (new)
export type PaymentRail = 'cash' | 'mobile_wallet' | 'bank_transfer' | 'digital_asset'

// Settlement asset the trainer actually receives.
export type SettlementAsset = 'USD' | 'USDT' | 'LBP' | 'OTHER'

// lib/payments/catalog.ts (new — the product catalog of supported methods)
export type PaymentMethodDefinition = {
  /** Stable internal id. Never an ERPNext name. Never renamed once shipped. */
  id: string
  rail: PaymentRail
  /** Rail-family provider code used for link generation / audit (see §6). */
  providerCode: string
  /** Trainer-facing label. */
  label: string
  settlementAsset: SettlementAsset
  /** Display/settlement nuance, e.g. cash-note quality. Metadata, NOT identity. */
  settlementContext?: 'fresh_usd' | null
  /** Exact ERPNext "Mode of Payment" docname this maps to. */
  erpModeOfPayment: string
  /** Whether a transaction reference is required to record this method. */
  requiresReference: boolean
  /** Optional feature-flag key gating product support. null = always supported. */
  featureGate?: string | null
}
```

`PaymentMethod` (the union in `lib/payments/methods.ts`) becomes the set of catalog `id`s. **`cash` remains `cash`.**

### 4.2 Catalog (stable IDs; Fresh USD as metadata)

| id (stable) | rail | providerCode | label | settlementAsset | settlementContext | erpModeOfPayment | requiresReference | featureGate |
|---|---|---|---|---|---|---|---|---|
| `cash` | cash | `cash` | Cash — Fresh USD | USD | `fresh_usd` | `Cash` | false | null |
| `whish_money` | mobile_wallet | `mobile_wallet` | Whish Money | USD | null | `Whish Money` | true | null |
| `omt` | mobile_wallet | `mobile_wallet` | OMT Pay | USD | null | `OMT Pay` | true | `payments.omt` |
| `mymonty` | mobile_wallet | `mobile_wallet` | MyMonty | USD | null | `MyMonty` | true | `payments.mymonty` |
| `suyool` | mobile_wallet | `mobile_wallet` | Suyool | USD | null | `Suyool` | true | `payments.suyool` |
| `purpl` | mobile_wallet | `mobile_wallet` | Purpl | USD | null | `Purpl` | true | `payments.purpl` |
| `mobile_wallet_other` | mobile_wallet | `mobile_wallet` | Other Mobile Wallet | USD | null | *(tenant-defined)* | true | `payments.wallet_other` |
| `bank_transfer` | bank_transfer | `bank_transfer` | Bank Transfer — Fresh USD | USD | `fresh_usd` | `Bank Transfer` | true | null |
| `usdt` | digital_asset | `digital_asset` | USDT | USDT | null | `USDT` | true | `payments.usdt` |

> The `erpModeOfPayment` docnames are **assumptions to verify against a real tenant site** during implementation — they are the join key and a mismatch reproduces this incident. **No Modes of Payment are created by this work.** `mobile_wallet_other` has no fixed ERP docname; it is only selectable if a tenant has defined a matching enabled MoP, and is out of scope for Slice 1.

### 4.3 Selectable-availability contract (bounded preflight)

A method is **selectable only when ALL applicable conditions pass**:

1. The exact ERPNext Mode of Payment **exists**.
2. It is **enabled**.
3. It has an **account mapping for the current invoice's company**.
4. **Currency / settlement compatibility** is valid for the invoice.
5. **Product support** is enabled (catalog `featureGate`, if any).
6. **Workspace enablement** passes (when introduced — see §4.7).
7. **Feature gating** passes.
8. Method-specific requirements are supported (e.g. `requiresReference` is enforceable).

**Bounded preflight algorithm** (new module `lib/payments/availability.ts`, server-only):

```
resolveAvailablePaymentMethods({ company, currency, tenantId })
  1. List enabled Modes of Payment:
       GET /api/resource/Mode of Payment?filters=[["enabled","=",1]]&fields=["name","type"]
       via existing erpFetch → CP proxy.  (1 request)
  2. Intersect with the supported catalog (match on erpModeOfPayment; drop
     feature-gated-off and product-unsupported methods first so we never probe them).
  3. For each surviving candidate, read its full MoP doc in BOUNDED PARALLEL
     (Promise.all over the small candidate set) to obtain accounts[].   (N small reads)
  4. Inspect accounts[] for an entry whose company === the invoice company;
     that entry's default_account is the required deposit account.
  5. Validate currency/settlement compatibility against the invoice currency.
  6. Produce normalized results:
       { id, status: 'available' | <unavailable code>, depositAccount? }
  7. Cache the result briefly, keyed by tenantId + company + currency + configVersion.
```

The catalog is small, so **correctness beats saving a bounded number of reads** — account-mapping is validated at preflight time, **not deferred** to after the trainer selects and submits.

**Server-side submission repeats the critical preflight as defense in depth.** Before any Payment Entry POST, `createAndSubmitPaymentEntry` (or a new guard in front of it) re-validates: MoP exists → enabled → account mapped for company → currency ok. This preserves the guarantee that **no Payment Entry POST occurs after a failed preflight**.

New thin server action `getAvailablePaymentMethods(invoiceId)` (`'use server'`, resolves trainer + tenant, derives company + currency from the invoice) returns the normalized availability list for the three selector surfaces.

### 4.4 Caching, last-known-good, and the corrected fail behavior

**Remove "fail closed to Cash" entirely.** A failed availability probe does **not** prove Cash — or any method — is configured. Corrected behavior:

- **Fresh resolution succeeds →** show only the validated `available` methods.
- **Fresh resolution fails, but a validated last-known-good cache exists and is within its approved stale window →** it *may* be used, **with explicit observability** (structured log / metric noting stale-serve, tenant, age). The stale window and TTL are tunable constants with recommended defaults (`TTL ≈ 60s`, `STALE_WINDOW ≈ 5 min`) — **confirm before implementation**.
- **Otherwise (no fresh result, no in-window cache) →** show **no selectable payment method** and return a **recoverable** `PAYMENT_CONFIGURATION_UNAVAILABLE` state.
- **Never assume** Cash, Whish, or any method exists during a probe failure.
- **Preserve the known-working Cash flow** whenever Cash is *successfully validated*.

Cache key: `tenantId + company + currency + configVersion`. `configVersion` bumps when workspace enablement / feature flags change (§4.7); for Slice 1 it is a constant.

### 4.5 Transaction UI vs Settings UI

**Payment transaction selector** (`RecordPaymentForm.tsx`, `InvoicesView.tsx` sheet, `AssignPackageForm.tsx`):

- Show **only** methods with `status === 'available'`.
- Do **not** render unavailable methods as selectable or as disabled clutter.
- When **none** are available, render a **configuration-unavailable** state (`PAYMENT_CONFIGURATION_UNAVAILABLE`) with a recoverable, non-alarming message and a link to Settings — never a raw error.

**Workspace Payment Settings** (`app/dashboard/settings/` — replaces the hardcoded list at `settings/page.tsx:5`):

- Show the **full supported catalog**.
- Show per-method status: **Available**, **Not configured**, **Disabled**, **Account missing**, **Currency mismatch**, **Feature disabled**.
- Provide **non-technical setup guidance** (FitDesk-branded language per `types/settings.ts` `FITDESK_TERMINOLOGY`).
- **Do not** let trainers type/guess ERP account names.

### 4.6 Error contract

Follow the **existing repository precedent** in [`actions/schedulingActions.ts:76-94`](../../../../actions/schedulingActions.ts): a typed error-code union + a discriminated result `{ success:false; code; message }` + a `mapError` that maps typed error classes to codes. **Do not** shoehorn codes into the generic `ActionResult<T>` string error, and **do not** use HTTP 503 for business-configuration failures.

```ts
// lib/payments/errors.ts (new)
export type PaymentErrorCode =
  | 'PAYMENT_METHOD_NOT_FOUND'
  | 'PAYMENT_METHOD_DISABLED'
  | 'PAYMENT_ACCOUNT_MISSING'
  | 'PAYMENT_CURRENCY_MISMATCH'
  | 'PAYMENT_REFERENCE_REQUIRED'
  | 'PAYMENT_PROVIDER_REQUIRED'
  | 'PAYMENT_METHOD_NOT_ENABLED_FOR_WORKSPACE'
  | 'PAYMENT_FEATURE_DISABLED'
  | 'PAYMENT_CONFIGURATION_UNAVAILABLE'
  | 'ERP_UNAVAILABLE'

export type PaymentResult<T> =
  | { success: true;  data: T }
  | { success: false; code: PaymentErrorCode; message: string }
```

**Mapping rules (authoritative):**

| Condition | Code |
|---|---|
| ERP document 404 for the MoP | `PAYMENT_METHOD_NOT_FOUND` |
| MoP exists but `enabled = 0` | `PAYMENT_METHOD_DISABLED` |
| MoP exists (enabled) but no `accounts[]` entry for the invoice company | `PAYMENT_ACCOUNT_MISSING` |
| Invoice currency incompatible with method settlement | `PAYMENT_CURRENCY_MISMATCH` |
| `requiresReference` method submitted without a reference | `PAYMENT_REFERENCE_REQUIRED` |
| Link/provider path invoked without a resolvable provider | `PAYMENT_PROVIDER_REQUIRED` |
| Method not enabled for the workspace (when §4.7 exists) | `PAYMENT_METHOD_NOT_ENABLED_FOR_WORKSPACE` |
| Product feature flag off | `PAYMENT_FEATURE_DISABLED` |
| No fresh result and no in-window cache | `PAYMENT_CONFIGURATION_UNAVAILABLE` |
| ERP connectivity / proxy / 5xx / tenant-context failure | `ERP_UNAVAILABLE` |

**Hard rules:**

- **Never** turn method-not-found into account-missing (this is the exact incident). The `catch {}` at `lib/erpnext/client.ts:742-744` must be replaced with logic that distinguishes a **404 (→ `PAYMENT_METHOD_NOT_FOUND`)** from a **found-but-no-company-account (→ `PAYMENT_ACCOUNT_MISSING`)** from a **connectivity error (→ `ERP_UNAVAILABLE`)**.
- **No Payment Entry POST after a failed preflight** — preserved.
- **No HTTP 503 for business configuration.** Implementation approach: the ERP client throws typed error classes (e.g. `PaymentMethodNotFoundError`, `PaymentAccountMissingError`, `PaymentMethodDisabledError`) — mirroring the typed errors `schedulingActions` maps — and the payment action's `mapError` converts them to `PaymentResult` codes. Genuine ERP connectivity failures continue to surface via the existing `ERPNextError` + `isErpUnavailableError` markers ([`lib/errors/is-unavailable-error.ts`](../../../../lib/errors/is-unavailable-error.ts)) and map to `ERP_UNAVAILABLE`. Server actions still **never throw to the UI** — they return the envelope. If a REST route handler is ever added, business-config codes map to **422 Unprocessable Entity** (not 503) and connectivity to **502/503**.

### 4.7 Workspace enablement (Slice 2, optional)

If/when trainer-level enablement is introduced, it is an **additional gate** on top of ERP truth (a trainer can hide a method their ERP supports, but can never enable one ERP lacks). It bumps `configVersion` for cache invalidation and yields `PAYMENT_METHOD_NOT_ENABLED_FOR_WORKSPACE` when it blocks. This does **not** adopt the unwired `PaymentsSettings` type as-is; that decision is deferred.

---

## 5. Implementation slices (file-by-file)

### Slice 1 — Incident fix (make the tenant see the truth)

Smallest safe, reversible change. Outcome for the audited tenant: **Cash only** (validated), no misleading errors, and a clean configuration-unavailable state if the probe fails.

1. **`lib/payments/rails.ts`** (new) — `PaymentRail`, `SettlementAsset`.
2. **`lib/payments/errors.ts`** (new) — `PaymentErrorCode`, `PaymentResult<T>`, typed error classes, `mapPaymentError`.
3. **`lib/erpnext/client.ts`**
   - Add `listEnabledModesOfPayment()` — pure read via `erpFetch`.
   - **Fix Defect B** in `createAndSubmitPaymentEntry` (lines 731-752): replace the swallowing `catch {}` with explicit branching → throw `PaymentMethodNotFoundError` on 404, `PaymentAccountMissingError` only when the MoP exists but has no company account, and let connectivity errors propagate as `ERPNextError` (→ `ERP_UNAVAILABLE`). Preserve throw-before-POST ordering.
4. **`lib/payments/availability.ts`** (new) — `resolveAvailablePaymentMethods()` per §4.3–4.4 (bounded preflight incl. account mapping; cache + last-known-good + stale-window observability; corrected fail behavior — no Cash assumption).
5. **`actions/invoices.ts`**
   - New action `getAvailablePaymentMethods(invoiceId)` returning normalized availability.
   - In `recordPayment` and `collectPayment`, replace/augment `isEnabledPaymentMethod` with the **defense-in-depth preflight** (§4.3) and return `PaymentResult` codes via `mapPaymentError`.
6. **Three selectors** (`RecordPaymentForm.tsx`, `InvoicesView.tsx`, `AssignPackageForm.tsx`) — build the selector from `getAvailablePaymentMethods` (available-only); render `PAYMENT_CONFIGURATION_UNAVAILABLE` when the list is empty. Keep the validated Cash flow working.

Slice 1 keeps the existing method IDs; it swaps the *availability source* and *error contract* without the full catalog/rail restructure.

### Slice 2 — Full catalog + rails + settings

1. **`lib/payments/catalog.ts`** (new) — the full §4.2 catalog with stable IDs + settlement metadata.
2. **`lib/payments/methods.ts`** — `PaymentMethod` becomes the catalog id union; remove the static global `enabled` as the UI gate (availability is tenant-derived).
3. **Reconcile dual enums** (§6) — derive `PaymentProvider` from `providerCode`; remove the ad-hoc ternary at `InvoicesView.tsx:236`.
4. **Transaction selector** — group available methods by rail (Cash / Mobile Wallet / Bank Transfer / Digital Asset).
5. **`app/dashboard/settings/`** — replace the hardcoded list with the full-catalog status view (§4.5), non-technical guidance, no ERP account name entry.
6. **Workspace enablement** (§4.7) — only if approved.

---

## 6. Reconciling the two enums

- Keep `PaymentProvider` (`whish | cash | bank_transfer`, `lib/whish.ts`) for the **link-generation** path, `Payment.provider`, and audit events — it is not a per-method identity.
- Each catalog method carries a `providerCode` mapping its rail-family to a provider for link/audit. A single mapper replaces the ad-hoc `m === 'whish_money' ? 'whish' : 'cash'` in `InvoicesView.tsx`.
- **Recording a payment is a manual path with no external call**, so mobile-wallet / USDT methods need only *MoP exists + enabled + account mapped + currency ok*. The `PILOT_ALLOW_EXTERNAL_PAYMENTS` flag ([`lib/pilot.ts:15`](../../../../lib/pilot.ts)) continues to gate only **Whish link generation**, never recording.

---

## 7. Testing & verification

- `lib/payments/availability.test.ts` (new): Cash-only tenant → only `cash` available; missing MoP → `PAYMENT_METHOD_NOT_FOUND`; enabled MoP with no company account → `PAYMENT_ACCOUNT_MISSING`; currency mismatch excluded; **probe failure with no in-window cache → `PAYMENT_CONFIGURATION_UNAVAILABLE` (never Cash-assumed)**; stale-within-window cache served with observability.
- `lib/erpnext/client.test.ts`: `createAndSubmitPaymentEntry` distinguishes 404 (method-not-found) from found-but-no-account, and **never POSTs after a failed preflight**.
- `actions/invoices.test.ts`: `recordPayment` / `collectPayment` reject a method absent from tenant availability and return the correct `PaymentErrorCode`.
- Update `lib/payments/methods.test.ts` for the catalog shape with **stable `cash` id preserved**.
- Commands: `npm test` (vitest) · `npm run lint` (next lint) · `npm run build` · `npm run build:verify`.

---

## 8. Risks, dependencies, approval gates

- **CP proxy allowlist (external dependency):** the probe assumes the Control Plane proxy permits `GET /api/erp/doctype/Mode of Payment` (list + single-doc). This lives in **control-plane**, out of this repo — verify before/with implementation. If not whitelisted, the probe fails and the UI shows `PAYMENT_CONFIGURATION_UNAVAILABLE` (recoverable), never a wrong method. **Do not edit CP in this repo's work.**
- **Exact ERPNext docnames** (`Whish Money`, `OMT Pay`, `MyMonty`, `Suyool`, `Purpl`, `USDT`, `Bank Transfer`) are assumptions — verify per tenant; a mismatch reproduces this incident.
- **Tunable constants** (`TTL`, `STALE_WINDOW`) require a product decision before coding.
- **Approval gate:** payment logic is CRITICAL / REQUIRE-APPROVAL. No code until this plan is approved. No MoP creation, no CoA change, no migration, no provisioning change.

---

## 9. Open decisions to confirm before implementation

1. Cache `TTL` and last-known-good `STALE_WINDOW` values, and the observability sink (log vs metric) for stale-serves.
2. Whether Slice 2 introduces workspace-level enablement (§4.7) now or defers it.
3. Currency policy for multi-currency tenants (settlement asset vs invoice currency) beyond the USD/USDT MVP.
4. `mobile_wallet_other` handling (tenant-defined MoP discovery) — deferred out of Slice 1.

---

## 10. Summary

- **What this plan changes:** availability becomes a live, bounded, cached ERP preflight (incl. account mapping); a missing Mode of Payment yields `PAYMENT_METHOD_NOT_FOUND` (never account-missing / 503); probe failure yields a recoverable `PAYMENT_CONFIGURATION_UNAVAILABLE` (never a Cash assumption); the transaction selector shows only validated methods while Settings shows the full catalog with status; method IDs stay stable with "Fresh USD" as settlement metadata.
- **What it preserves:** the ERP proxy boundary, the no-POST-after-failed-preflight guarantee, and the known-working Cash flow when Cash is validated.
- **Baseline:** implement from `origin/main` @ `ed7c42f`, not the deleted goal branch.
