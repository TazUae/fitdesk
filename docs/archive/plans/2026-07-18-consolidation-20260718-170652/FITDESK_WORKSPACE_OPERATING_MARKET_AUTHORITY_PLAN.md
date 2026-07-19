> **Status:** Archived - superseded payment authority plan
> **Replacement authority:** ADR-MKT-001 and docs/plans/FITDESK_LEBANON_PAYMENT_PROGRAM_MASTER_EXECUTION_PLAN.md
> **Archived date:** 2026-07-18
> **Instruction:** Do not execute this historical plan without a new current-state audit.
> **Note:** Relative link paths were depth-adjusted on 2026-07-19 for the archive location. No other content was modified.

---

# FitDesk — Workspace Operating Market Authority — Implementation Plan

| | |
|---|---|
| **Status** | **Architecture approved** (ADR-MKT-001, 2026-07-16) — **this plan itself is not approved for execution.** Every phase in §5 remains individually approval-gated; no code, schema, or migration has been written. |
| **Date** | 2026-07-16 |
| **Controlling ADR** | [`docs/adr/ADR-MKT-001-workspace-operating-market-authority.md`](../../../adr/ADR-MKT-001-workspace-operating-market-authority.md) — **Approved** |
| **Blocks / unblocks** | Unblocks the six Lebanon-only payment methods currently held at `enabled: false` by Payment Slice 2 |
| **Repos touched** | `control-plane` (schema, 2 endpoints), `FitDesk` (resolver, payment gate). **Not** provisioning-agent, **not** bench-agent, **not** ERPNext. |

> Every factual claim below was verified against the repositories on 2026-07-16.
> File:line citations are given so a reviewer can re-check rather than trust.

---

## 1. Why this slice exists

Payment Slice 2 shipped a **PARTIAL** result. Its safe subset is complete: exact
payment identity is preserved globally, non-cash methods can never read back or
audit as Cash, Cash remains globally available, and the six Lebanon-specific
methods are held at `enabled: false` and are never ERP-probed or exposed.

The held state is honest but not the goal: a genuine Lebanese trainer currently
sees exactly what everyone else sees — Cash only — because **nothing in FitDesk
can distinguish them.** This plan builds that distinction.

## 2. Audit findings (verified)

### 2.1 Reachability was never the blocker

`lib/controlplane/client.ts` already exports `getTenant(tenantId)` → `GET /tenants/:id`,
which already returns `country` (`control-plane/src/modules/tenants/tenant.service.ts:132`).
FitDesk already holds `CONTROL_PLANE_API_KEY`. **`getTenant` and `listTenants` are
exported and never called anywhere** — verified dead code.

It must not be adopted: that key also authorizes
`GET /tenants/:id/erp-credentials` — which returns **decrypted** ERP API keys for
any tenant (`tenant.routes.ts:111-152`) — plus `DELETE /tenants/:id`
(`tenant.routes.ts:156`) and `POST /tenants`. It is a god key; the payment path
must not hold it.

### 2.2 `country` cannot be the authority — it selects the Chart of Accounts

`Tenant.country` is documented as *"Required — drives all locale defaults"*
(`tenant.schemas.ts:28`). Verified flow:

| Step | Evidence |
|---|---|
| Seeds currency / timezone / fiscal-year / regional module | `tenant.routes.ts:215-221`, `country-defaults.ts` |
| Sets ERPNext `System Settings.country` | `provisioning_api/api/bootstrap.py:166` |
| Sets ERPNext `Company.country` on insert | `bootstrap.py:276` |
| **Selects the Chart of Accounts template** | `bootstrap.py:289` fails provisioning when the country yields no CoA |

`country` is among the most load-bearing accounting inputs in the platform.
Retuning it to express market intent would silently be an accounting-structure
decision.

### 2.3 Its provenance is an unconfirmed guess

```text
browser timezone → MENA_TZ_MAP (5 entries, lib/workspace/locale.ts)
                 → DEFAULT_LOCALE = 'AE'   ← silent fallback for every other timezone
                 → auto-submitted (workspace-setup-form.tsx; read-only "preview", no picker)
                 → allowlist {AE,SA,LB,KW,QA} (app/onboarding/actions.ts:14)
                 → POST /tenants → Tenant.country
```

The trainer never chooses. `CreateTenantSchema` validates only "2 letters,
uppercased"; `getCountryDefaults()` silently falls back to USD/UTC for unknown
codes. ERPNext's `Company.country` is **downstream of this same value** and is
therefore not an independent second opinion.

### 2.4 Verified counts (for the drift record)

| List | Size | Location |
|---|---|---|
| `MENA_TZ_MAP` | 5 | `lib/workspace/locale.ts` |
| `ALLOWED_COUNTRY_CODES` | 5 (`AE,SA,LB,KW,QA`) | `app/onboarding/actions.ts:14` |
| `COUNTRY_DEFAULTS` | 32 | `control-plane/src/lib/country-defaults.ts` |

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Trust bar | **Operator-verified** | FitDesk never infers. Smallest build, highest trust, fits current pilot size. |
| Delivery | **Tenant-scoped JWT endpoint** | Reuses the module that already returns `companyName`/`currency` over the FitDesk JWT. Correct isolation primitive; no new credential. |
| Field design | **New purpose-built fields** | §2.2 — `country` cannot carry this meaning. |
| Backfill | **None** | A backfill would convert a timezone guess into a capability grant for every existing tenant. NULL keeps behaviour byte-identical to today. |

## 4. Target design

### 4.1 Control Plane schema (`Tenant`)

```prisma
/// Authoritative operating market. NULL = unverified (fail closed).
/// Deliberately SEPARATE from `country` (a locale/CoA provisioning seed).
/// Never derived from country, timezone, phone, locale, IP, or currency.
/// See docs/adr/ADR-MKT-001.
operatingMarket           String?    // ISO 3166-1 alpha-2, e.g. "LB"
operatingMarketSource     String?    // only "operator_verified" is defined today
operatingMarketVerifiedAt DateTime?
operatingMarketVerifiedBy String?    // operator identifier, for audit
```

Migration `20260716000000_add_tenant_operating_market` (matches the existing
`YYYYMMDDHHMMSS_description` convention). **Purely additive; all NULL; no backfill.**

### 4.2 Write path — operator only

`POST /tenants/:id/operating-market` · `preHandler: [requireInternalApiKey]`

- Zod body `{ market: enum(SUPPORTED_MARKETS), verifiedBy: string().min(1) }` — a
  real allowlist, deliberately stricter than `country`'s 2-char check (§2.3).
- Sets all four fields; emits `writeAuditEvent({ type: 'tenant.operating_market.verified' })`
  via the existing helper (`control-plane/src/lib/audit.ts`).
- Idempotent (re-verifying the same market is a no-op + audit).

`DELETE /tenants/:id/operating-market` → back to NULL + audit.
**Revocation ships with grant, not after it** — a mis-verification must be
undoable without a database console.

### 4.3 Read path — tenant-scoped, FitDesk-facing

`GET /api/erp/tenant/market`, added to `erp-proxy.routes.ts` (the
`FITDESK_JWT_SECRET` module).

Reuses `resolveTenantFromAuth()` unchanged — it already verifies the HS256 JWT,
extracts the `tenantId` claim, loads the tenant, 403s when `status !== 'active'`,
and 503s when credentials are unprovisioned (`erp-proxy.routes.ts:49-89`). Its
`prisma.tenant.findUnique` already loads the full row, so this is a return-shape
change, not a new query.

```jsonc
{ "operatingMarket": "LB", "verified": true,  "verifiedAt": "2026-07-20T…" }
{ "operatingMarket": null, "verified": false, "verifiedAt": null }
```

Returns **only** these three fields. Never `country`; never credentials; never
another tenant's data.

### 4.4 FitDesk consumption

- Extract `signTenantJwt()` from `lib/erpnext/client.ts` (currently private) into a
  shared `lib/tenant/cp-jwt.ts`. Mechanical move; no behaviour change; both
  callers need it.
- New server-only `lib/tenant/market.ts`:
  `resolveWorkspaceMarket(): Promise<{ market: string | null; verified: boolean }>`
  - Short TTL cache keyed by `tenantId`, mirroring the existing 60s pattern in
    `lib/payments/availability.ts`.
  - **Fails closed on every path** — no tenant context, non-200, timeout,
    malformed body → `{ market: null, verified: false }`. Never throws into the
    payment path; never assumes LB.

### 4.5 The payment gate

`lib/payments/methods.ts` — the `market: 'global' | 'LB'` field already exists
(added by Slice 2 as documentation-only). It becomes live:

- Restore `enabled: true` on the six held methods. `enabled` reverts to its real
  meaning (product kill switch); `market` carries eligibility. Two orthogonal
  gates, neither overloaded.

`lib/payments/availability.ts`:

- `ResolveAvailabilityParams` gains `market: string | null`, resolved server-side
  by `actions/invoices.ts`. **Never client-supplied.**
- `probe()` filters `productSupported && (entry.market === 'global' || entry.market === params.market)`
  at **Step 2 — before any per-candidate ERP detail read.** Non-LB and unverified
  tenants therefore make zero Lebanon ERP probes, structurally.
- **Cache key must include market.** Today it is
  `` `${p.tenantId}|${p.company}|${p.currency}|${CONFIG_VERSION}` `` (`availability.ts:128`).
  Without market in the key, a verification is ignored for a full TTL — and, worse,
  so is a **revocation**. This is a correctness requirement, not an optimisation.

### 4.6 The write-side gap — the trap in this slice

`isEnabledPaymentMethod()` is **synchronous and has no tenant context**. It is the
write-side guard in `recordPayment` / `collectPayment` (`actions/invoices.ts`),
`assignPackage` (`actions/packages.ts`), and `PackageAssignmentService`.

Today it blocks all six Lebanon methods only because they are globally
`enabled: false`. **The moment §4.5 flips them to `enabled: true`, that guard
silently stops being market-aware** — a client could POST `method: 'mymonty'`
against a non-LB workspace and pass it.

Therefore the `enabled` flip and the write-side market check **must land in the
same change**. `recordPayment` / `collectPayment` must re-resolve the market and
reject an ineligible method *before any ERP write* — the same defense-in-depth
shape Slice 1 established for the Mode-of-Payment preflight. Package "Paid Now"
already defers to the invoice payment flow (Slice 1) and inherits the gate;
`actions/packages.ts`'s own guard needs the same treatment or an explicit note
that its path can no longer carry a method.

## 5. Phasing and approval gates

Each phase is independently revertable. Nothing deploys without its own approval.

| # | Phase | Repo | Approval gate |
|---|---|---|---|
| 1 | Schema + migration (§4.1) | control-plane | **CRITICAL** — DB schema + migration |
| 2 | Operator write + revoke endpoints (§4.2) | control-plane | Authorization surface |
| 3 | Tenant-scoped read endpoint (§4.3) | control-plane | New FitDesk-facing contract |
| 4 | Control Plane deploy | Dokploy | **Deployment** |
| 5 | FitDesk market resolver (§4.4) | FitDesk | New CP dependency on a payment path |
| 6 | Gate wiring + `enabled` flip + write-side check (§4.5–4.6) | FitDesk | **CRITICAL** — payment logic |
| 7 | Operator runbook (§7) | docs | — |
| 8 | Verify the pilot tenant | operator action | **Deliberate human act** |
| 9 | ERP Mode-of-Payment provisioning | separate | **CRITICAL** — separately blocked |

**Ordering.** Phases 1–4 ship before 5–6. (FitDesk 404ing the endpoint fails
closed and is *safe* — just noisy — so the order is for cleanliness, not safety.)
Phase 6 is atomic by construction (§4.6). Phase 8 is the first moment any trainer
sees a change, and it is a person deciding, not a deploy.

## 6. What "done" actually means

A real Lebanese trainer sees Whish Money only when **all** hold:

1. `operatingMarket = 'LB'`, operator-verified — Phase 8
2. `enabled: true` restored on the catalog entry — Phase 6
3. **Their ERP site has the exact Mode of Payment, enabled, with a company-mapped
   USD-compatible account** — **Phase 9, still blocked**
4. The live probe passes at request time

This plan delivers 1 + 2 and makes 4 correct. **It does not deliver 3.** Phase 9
is the ERP provisioning task that returned `BLOCKED` on 2026-07-16 and remains
blocked on its own merits: exact docnames are unverified assumptions against a
real tenant site, no reachable environment exists, and ERP writes need their own
approval. Anyone reading "Phase 6 complete" should **not** expect a working
Whish Money button.

## 7. Operator runbook (Phase 7 — the part that isn't code)

The endpoint is the easy half. A `POST` route does not make a market
authoritative — a human decision does, against a written standard:

- **What evidence is required** before setting `LB`. Proposed minimum: a direct
  confirmation from the trainer that the business operates in Lebanon, recorded —
  not inferred from anything in the product.
- Who may verify; where evidence is retained; how revocation is triggered.
- **Explicitly not evidence:** timezone, phone prefix, locale, IP, currency,
  company name, `Tenant.country`. These are precisely the signals ADR-MKT-001
  exists to reject.

## 8. Test strategy

All pure/mocked. No live tenant, no ERP writes.

**Control Plane** (colocated `*.routes.test.ts`, per existing `erp-proxy.routes.test.ts`):

- Write endpoint: rejects without admin key; rejects unsupported market; sets all
  four fields; emits audit; idempotent; revoke → NULL + audit.
- Read endpoint: rejects missing/invalid/expired JWT; scoped strictly to the JWT's
  `tenantId`; `verified:false` when NULL; **explicit negative assertion that the
  response body contains no `country` and no credentials**.
- Migration: existing rows land NULL (no backfill).

**FitDesk:**

- `resolveWorkspaceMarket` fails closed on 404 / 500 / timeout / malformed body /
  no tenant context — each asserted individually.
- Availability — the Slice 2 checkpoint's §14 items 13–15 become constructible for
  the first time:
  - verified `LB` → the six become candidates and *are* ERP-probed
  - non-`LB` → zero detail probes for all six (assert `getModeOfPaymentDoc` never
    called with each docname)
  - NULL/unverified → same as non-LB
  - `LB` + failing ERP checks → still unavailable (market is necessary, not sufficient)
  - Cash unaffected in every case
  - cache: key includes market; a revocation takes effect on the next probe
- Write-side (§4.6): non-LB workspace POSTing `mymonty` → rejected before any ERP call.
- Historical readback stays exact and market-independent (re-assert the Slice 2 invariant).

**Regression:** the full Slice 2 suite (2,514 tests at time of writing) stays
green; `tsc --noEmit` diffed against the `main` baseline for zero new errors.

## 9. Risks

| Risk | Mitigation |
|---|---|
| New network hop on the payment path | TTL cache + fail-closed; a CP outage degrades to Cash-only, never to a wrong offer |
| Stale cache after verify/revoke | Market in the cache key (§4.5); bounded TTL; documented operator expectation |
| §4.6 write-side gap missed | Phase 6 atomic by construction; explicit test |
| Admin key remains on FitDesk | Out of scope, but this plan *reduces* reliance on it. Recommend deleting the unused `getTenant`/`listTenants` exports in Phase 5 so the god-key path isn't casually re-adopted |
| Onboarding still writes a guessed `country` | Separate slice (§10.1) — after this plan it authorizes nothing, but still misconfigures ERP locale **and CoA** |

## 10. Out of scope — flagged, not fixed

1. **Onboarding provenance fix.** Replace the silent `detectLocale()` auto-submit
   with a trainer-confirmed picker (detected value as a pre-selection *hint* only).
   Post-ADR, `country` authorizes nothing — but it still silently misconfigures
   currency, timezone, fiscal year, and **Chart of Accounts** (§2.2) for anyone
   outside the five mapped timezones. A real, separate bug.
2. **Country list consolidation** (§2.4).
3. **`CONTROL_PLANE_API_KEY` blast radius** — pre-existing posture question.
4. **ERP Mode-of-Payment provisioning** — Phase 9, separately blocked.
5. **`PaymentProvider` / `PaymentMethod` enum reconciliation** — tracked separately.

## 11. Related documents

- [`docs/adr/ADR-MKT-001-workspace-operating-market-authority.md`](../../../adr/ADR-MKT-001-workspace-operating-market-authority.md) — controlling decision
- `docs/execution/TENANT_AWARE_PAYMENT_SLICE_2_CHECKPOINT.md` — the PARTIAL result
  this plan resolves (§13 architecture gap, §18 item 2). **Currently uncommitted on
  branch `feat/tenant-aware-payment-slice-2`**; cross-reference it to this plan
  when both land.
- `docs/plans/FITDESK_TENANT_AWARE_PAYMENT_OPTIONS_IMPLEMENTATION_PLAN.md` —
  **untracked** in the `main` checkout; predates the market boundary entirely.
