# Tenant Payment-Method Provisioning — Execution Report

**Execution timestamp:** 2026-07-16
**Verdict:** **BLOCKED — no ERP mutation performed, no code changed**
**Resolution invoice (requested target):** `ACC-SINV-2026-00007`

---

## 1. Summary

The task asked for the complete approved payment-method configuration to be provisioned in ERPNext for the tenant owning `ACC-SINV-2026-00007`, such that FitDesk's Record Payment dropdown exposes eight methods.

**The required outcome is not achievable by ERPNext configuration, because the constraint is in FitDesk application code, not in ERP data.** Five of the eight requested methods have no identity in the FitDesk payment catalog and are never probed against ERP. Creating the ERP records would therefore produce accounting records that FitDesk cannot use, without moving the dropdown at all.

Execution stopped at Stage 2 (target resolution) and never reached Stage 4 (mutation). Four independent stop conditions were hit; any one of them alone is disqualifying.

---

## 2. Repositories and commits inspected

| Repository | Branch | Commit | Working tree |
|---|---|---|---|
| `FitDesk` (canonical app) | `main` | `615e56b` | clean (2 pre-existing untracked paths, unrelated) |
| `fitdesk-platform` | `chore/bump-fitdesk-submodule-tenant-aware-payments` | `a3bc72f` | clean |
| `services/fitdesk` (submodule) | — | `615e56b` | clean — matches canonical |
| `services/control-plane` | — | `abd2c4b` | clean |
| `services/erp-execution-service` | — | `28a53eb` | clean |
| `services/provisioning-agent` | — | `d8d8f68` | clean |
| `services/provisioning_api` | — | `5c324cd` | clean |

Instruction sources read: workspace `CLAUDE.md`, `FitDesk/CLAUDE.md`, `fitdesk-safe-autonomy` skill, `docs/plans/FITDESK_TENANT_AWARE_PAYMENT_OPTIONS_IMPLEMENTATION_PLAN.md`.

---

## 3. Blockers

### Blocker 1 — The dropdown catalog is a closed 3-id union (primary, decisive)

`lib/payments/methods.ts:12` is the declared single source of truth:

```ts
export type PaymentMethod = 'cash' | 'whish_money' | 'omt'
```

| Method | Catalog id | `enabled` | ERP docname in code |
|---|---|---|---|
| Cash | `cash` | `true` | `Cash` |
| Whish Money | `whish_money` | `true` | `Whish Money` |
| OMT Pay | `omt` | **`false`** | `OMT` |
| MyMonty | — absent — | — | — |
| Suyool | — absent — | — | — |
| Purpl | — absent — | — | — |
| Other Mobile Wallet | — absent — | — | — |
| Bank Transfer — Fresh USD | — absent — | — | — |
| USDT | — absent — | — | — |

Verified production path for the Record Payment dropdown:

```text
app/dashboard/invoices/[id]/pay/page.tsx:24  getAvailablePaymentMethods(params.id)
  → actions/invoices.ts:153                  server action
  → lib/payments/availability.ts:202         resolveAvailablePaymentMethods()
  → lib/payments/availability.ts:104         SLICE1_CATALOG = PAYMENT_METHODS.map(...)
  → lib/payments/availability.ts:145         .filter(c => c.productSupported)   // enabled only
  → lib/payments/selector-view.ts:34         pure projection of result.data.available
```

`deriveSelectableMethodOptions` is a pure `.map` over `available` — it adds nothing. The dropdown is therefore **strictly bounded by `PAYMENT_METHODS`**. Today it can contain at most **Cash** and **Whish Money**.

**Consequence:** no ERPNext Mode of Payment or Account, however perfectly configured, can cause MyMonty / Suyool / Purpl / Other Mobile Wallet / Bank Transfer — Fresh USD to appear. Those ids do not exist and are never probed. OMT is defined but `enabled: false`, so it is filtered out before any ERP read.

### Blocker 2 — The plan of record explicitly forbids creating these records

`docs/plans/FITDESK_TENANT_AWARE_PAYMENT_OPTIONS_IMPLEMENTATION_PLAN.md` §4.2:

> The `erpModeOfPayment` docnames are **assumptions to verify against a real tenant site** during implementation — they are the join key and a mismatch reproduces this incident. **No Modes of Payment are created by this work.** `mobile_wallet_other` has no fixed ERP docname; it is only selectable if a tenant has defined a matching enabled MoP, and is out of scope for Slice 1.

The authoritative design for this exact feature states that FitDesk **verifies** tenant ERP configuration and does not create it. The requested task inverts that intent.

### Blocker 3 — Conflicting ERP docnames; prompt forbids guessing

Two in-repo sources disagree on the join key:

| Method | `lib/payments/methods.ts` (shipped code) | Plan §4.2 (design) | Prompt |
|---|---|---|---|
| OMT | `OMT` | `OMT Pay` | `OMT Pay` |
| Other Mobile Wallet | absent | *(tenant-defined — no fixed docname)* | `Other Mobile Wallet` |
| Bank Transfer | absent | `Bank Transfer` | `Bank Transfer — Fresh USD` |

The Mode of Payment docname is the join key; the plan warns that a mismatch **reproduces the original incident**. `mobile_wallet_other` has no defined docname anywhere, yet the task requires an "exact admin-managed fallback method". Picking any name here would be a guess against explicit instruction ("Do not guess when the evidence conflicts").

### Blocker 4 — Target cannot be resolved; no reachable ERP

- `CONTROL_PLANE_URL` in FitDesk env resolves to **localhost**; health probe returned **HTTP 000 (unreachable)**.
- Docker daemon is not running — no local stack.
- Tenant → ERP site → company resolution for `ACC-SINV-2026-00007` requires a live Control Plane + ERP. **The invoice's existence, company, currency, customer, outstanding amount, and tenant ownership could not be confirmed at all.**

Stage 2 fail-closed applies: resolution is not merely ambiguous, it is impossible in this environment.

### Blocker 5 (secondary) — ERP client has no write capability for these DocTypes

`lib/erpnext/client.ts` exposes for Mode of Payment only:
- `listEnabledModesOfPayment()` — read (line 727)
- `getModeOfPaymentDoc(mode)` — read (line 748)

There are **no** `Account` functions and **no** create/update for Mode of Payment. Existing writes cover only Client, Invoice, Payment Entry, Trainer Settings.

The Control Plane proxy (`src/modules/erp-proxy/erp-proxy.routes.ts`) *is* a generic passthrough with **no doctype allowlist**, so `POST /api/erp/doctype/Account` would transport-wise succeed. But using it would require **new FitDesk capability code**, which Stage 7 requires be stopped before any production ERP write. Transport availability is not authorization.

---

## 4. Pre-mutation matrix

Not produced. It requires live reads of Modes of Payment, Chart of Accounts, company abbreviation, and default currency from the target site — unreachable (Blocker 4). Per Stage 3, writes may not begin until this matrix is complete. It is not complete, so no writes began.

---

## 5. Financial safety proof

**No mutation of any kind was attempted or performed.**

| Check | Result |
|---|---|
| Payment Entry created | No — no ERP write attempted |
| Journal entry created | No |
| Invoice outstanding changed | No — invoice never read or touched |
| Invoice status changed | No |
| Ledger balance changed | No |
| Accounts created | No |
| Modes of Payment created / enabled / disabled | No |
| Existing accounts renamed / merged / disabled | No |
| Company base currency touched | No |

Before/after values cannot be quoted because the ERP was never reachable — which is itself the proof that nothing was changed.

## 6. USDT guard

USDT remains unavailable, and is unavailable **by construction**: no `usdt` id exists in the `PaymentMethod` union, so it is never probed and cannot be selected. No USDT Mode of Payment or account mapping was created. The guard holds without any action taken.

---

## 7. Repository impact

| Item | Result |
|---|---|
| Source files changed | **None** |
| Files added | This report only (untracked, uncommitted) |
| Tests run | None — no code change to verify (Stage 7: "If no code change is required, do not modify source code") |
| Commits | None |
| Pushes / merges / deploys | **None** |
| Branch changed | No |
| Docker / Dokploy / env touched | No |
| Secrets printed | None — env inspected by variable **name** only; values masked. `.env` confirmed gitignored and untracked. |

---

## 8. What would actually deliver the requested outcome

This is **Slice 2**, already scoped in the plan (§"Slice 2 — Full catalog + rails + settings"):

1. `lib/payments/catalog.ts` (new) — the full §4.2 catalog with stable ids + settlement metadata.
2. `lib/payments/methods.ts` — `PaymentMethod` becomes the catalog id union; remove the static global `enabled` as the UI gate.
3. Reconcile the dual enums (§6); derive `PaymentProvider` from `providerCode`.
4. Transaction selector — group available methods by rail.
5. Settings — full-catalog status view.

**Sequenced correctly, ERP configuration comes second, not first:**

1. **Decide the docnames** — resolve `OMT` vs `OMT Pay`, and define `mobile_wallet_other`'s docname (or confirm it stays tenant-defined). These are product decisions, not inferable from code.
2. **Bring up a reachable environment** and resolve `ACC-SINV-2026-00007` → tenant → site → company → currency.
3. **Read-only audit** of that site's Modes of Payment + Chart of Accounts — establish the real company abbreviation, default currency, and valid non-group parents. The plan is explicit that the docnames are assumptions to verify.
4. **Implement Slice 2** behind tests (idempotency, duplicate prevention, tenant/company isolation, currency compatibility, no-financial-transaction).
5. **Then** configure ERP to match the verified join keys — via tenant provisioning, per the plan's stated boundary.

Doing step 5 first — which is what this task asked for — creates ERP records against unverified assumed names that the app cannot consume.

---

## 9. Rollback considerations

None required. No ERP records were created, updated, or deleted; no repository state changed. Deleting this report file returns the workspace to its exact prior state.

---

## 10. Remaining manual action

Product/architecture decisions required before this work can proceed safely:

1. **Confirm the exact ERP Mode of Payment docname for OMT** (`OMT` in shipped code vs `OMT Pay` in the plan and prompt).
2. **Define `mobile_wallet_other`'s ERP docname**, or confirm it remains tenant-defined and therefore out of scope.
3. **Confirm whether Slice 2 is approved to be implemented**, and whether ERP payment-method provisioning is in FitDesk's remit at all — the plan currently says it is not.
4. **Provide a reachable environment** and confirm whether `ACC-SINV-2026-00007` belongs to a pilot or production tenant. Writing to a production tenant ERP is a `CLAUDE.md` §4 approval gate and was not authorized by this task.
