# ADR-MKT-001: Workspace Operating Market Authority

```text
Status: Approved — architecture decision and documentation-governance transition only.
         Does NOT authorize implementation, migration, deployment, ERP
         provisioning, production mutation, or enabling the Lebanon catalog.
Approved: 2026-07-16 (owner)
Date: 2026-07-16
Project: FitDesk SaaS Platform
Scope: Tenant market eligibility for payment-method availability
Decision Type: Architecture / Data Ownership / Authorization Boundary
Implementation plan: docs/plans/FITDESK_WORKSPACE_OPERATING_MARKET_AUTHORITY_PLAN.md
```

> **Numbering note.** This ADR uses the domain-prefixed convention that Handbook
> `14 — Coding Standards & ADR Index` already establishes for new domains
> (`ADR-SCH-001`, `ADR-SRC-001`, `ADR-TOK-001`, `ADR-DEP-001`, `ADR-PROG-001` are
> all registered there as "missing, should be written"). A plain `ADR-003` was
> deliberately **not** used: the plain-number space is already double-booked —
> `docs/adr/ADR-001` is Client Management, while `docs/architecture/ADR-002`'s own
> numbering note declares *its* "ADR-001" to be the Phase 8 migration plan. `MKT`
> avoids inheriting that ambiguity.

## Context

FitDesk is expanding its payment catalog with six Lebanon-specific methods
(Whish Money, OMT Pay, MyMonty, Suyool, Purpl, Bank Transfer — Fresh USD). These
must be offered **only** to workspaces whose operating market is Lebanon. Cash
remains global.

The obvious candidate for that eligibility signal is the existing Control Plane
`Tenant.country` column. An audit performed 2026-07-16 established that using it
would be a serious mistake, for two independent reasons.

### 1. `country` is a provisioning seed, not a fact about the business

`Tenant.country`'s documented purpose is locale derivation
(`control-plane/src/modules/tenants/tenant.schemas.ts:28` — *"Required — drives
all locale defaults"*). It seeds `getCountryDefaults()` → default currency,
timezone, fiscal-year start month, and ERPNext regional setup module. It then
flows into ERPNext itself:

```text
Tenant.country
  → getCountryDefaults()                     currency / timezone / fiscal year / regional module
  → provisioning_api bootstrap.py:166        System Settings.country
  → provisioning_api bootstrap.py:276        Company.country  (on doc.insert)
  → Company after_insert hook                Chart of Accounts template selection
```

That last step is decisive. `bootstrap.py:289` fails the whole provisioning run
when the inserted Company yields zero accounts — *"Verify ERPNext is fully
installed and the country has a default CoA template."* **`country` selects the
tenant's Chart of Accounts.** It is one of the most load-bearing accounting
inputs in the platform.

Consequently, `country` can never be safely retuned to express market intent. A
future operator correcting a market would be silently making an
accounting-structure decision.

### 2. Its provenance is an unconfirmed browser guess

The value is produced, today, by this chain:

```text
Intl.DateTimeFormat().resolvedOptions().timeZone   (the browser's timezone)
  → lib/workspace/locale.ts  MENA_TZ_MAP           (5 timezones only)
  → DEFAULT_LOCALE = 'AE'                          silent fallback for every other timezone
  → features/onboarding/components/workspace-setup-form.tsx
                                                   auto-submitted; the UI shows a
                                                   read-only "preview", never a picker
  → app/onboarding/actions.ts:14                   validated against {AE, SA, LB, KW, QA}
  → POST /tenants                                  → Tenant.country
```

The trainer never chooses. A Beirut-based trainer whose laptop is set to UTC, or
who signs up while travelling, is recorded as `AE`. Anyone outside those five
timezones is recorded as `AE` silently. Validation is weaker than it appears:
`CreateTenantSchema` enforces only *"two letters, uppercased"* — not a real ISO
code, not a supported one — and `getCountryDefaults()` returns a silent USD/UTC
`FALLBACK` for anything unrecognized.

The value is *plausible*. It is never *confirmed*. It is not evidence.

### 3. ERPNext is not an independent second opinion

`Company.country` and `System Settings.country` are both **downstream of the same
guessed value** (chain above). Reading either back would inherit the identical
defect while adding a round-trip and the appearance of authority.

### 4. Reachability was never the real blocker

A prior handover framed this as *"FitDesk cannot obtain the country."* That is not
accurate, and the distinction matters. `lib/controlplane/client.ts` already
exports `getTenant(tenantId)` → `GET /tenants/:id`, which already returns
`country`; FitDesk already holds `CONTROL_PLANE_API_KEY`. That function is
exported and **never called** — dead code.

It must not be adopted. `CONTROL_PLANE_API_KEY` also authorizes
`GET /tenants/:id/erp-credentials` (which returns **decrypted** ERP API keys for
any tenant), `DELETE /tenants/:id`, and `POST /tenants`. Putting that credential
on the per-payment path would widen the payment code's blast radius and abandon
the platform's actual isolation primitive — the per-tenant `FITDESK_JWT` — in
favour of app-level "we promise to pass the right tenantId".

## Decision

**Operating market is a separate, purpose-built, explicitly-verified fact. It is
never derived from `country`, and `country` never authorizes anything.**

```text
Tenant.country          = locale / provisioning seed   (currency, timezone,
                          fiscal year, regional module, ERPNext CoA template)
                          → authorizes NOTHING

Tenant.operatingMarket  = authoritative market fact    (payment-method eligibility)
                          → set ONLY by an operator, explicitly, with an audit trail
                          → NULL until verified  → fail closed
```

### Approved rule

```text
operatingMarket = 'LB'  (verified)   → Cash + eligible, ERP-configured Lebanon methods
operatingMarket != 'LB' (verified)   → global methods only; zero Lebanon ERP probes
operatingMarket = NULL  (unverified) → Cash remains available
                                       Lebanon methods fail closed; zero ERP probes
```

Market eligibility is **necessary, not sufficient**. A verified `LB` workspace
still sees a Lebanon method only after the existing per-tenant ERP preflight
passes (Mode of Payment exists → enabled → company-mapped account → currency
compatible). ADR-MKT-001 adds a gate; it removes none.

### Approved trust model — operator-verified

FitDesk **never infers** the market. Only an internal operator may set it, through
an internal-admin endpoint, emitting an audit event. Verification is a human
decision recorded against a written standard (see the plan's operator runbook).

The following are **explicitly not evidence** and must never be used to derive,
default, or infer market eligibility:

```text
trainer nationality or citizenship        browser locale / Arabic language
trainer physical or current location      IANA timezone (incl. Asia/Beirut)
IP address / geolocation                  +961 phone prefix (trainer or customer)
invoice currency (incl. USD)              company name / ERP site name
Tenant.country                            environment name
ERPNext Company.country                   payment-method availability itself
```

That list is the point of this ADR. Every entry is a signal that *correlates* with
Lebanon and *proves* nothing.

### Approved delivery boundary

```text
FitDesk payment resolver
  → lib/tenant/market.ts        (server-only, short TTL cache, fails closed)
  → FITDESK_JWT (tenantId claim)
  → Control Plane  GET /api/erp/tenant/market
  → resolveTenantFromAuth()     (existing; verifies JWT, scopes to the claim,
                                 403s inactive tenants, 503s unprovisioned)
  → { operatingMarket, verified, verifiedAt }
```

This reuses the module that **already** returns tenant metadata (`companyName`,
`currency`) to FitDesk over the same JWT-authenticated path. It is an in-pattern
extension, not a new trust boundary.

Prohibited:

- Reading market via `CONTROL_PLANE_API_KEY` / `GET /tenants/:id` / `GET /tenants`.
- Returning `country` or any credential from the market endpoint.
- Accepting a market value from the client, or from any request-derived signal.
- Deriving market from `country` at any layer, including backfill.

### Backfill decision

**None.** Every existing tenant starts `operatingMarket = NULL`.

This is deliberate and load-bearing: a backfill from `country` would convert a
browser-timezone guess into a financial-capability grant for every existing
tenant, retroactively, with nobody deciding. NULL means every tenant's behaviour
after this change is **byte-identical to before it** — Cash only — until an
operator acts.

## Consequences

### Benefits

- A timezone guess can never authorize a financial rail.
- `country` keeps its real job (locale + CoA) with its semantics unchanged.
- Fail-closed is the default and the unverified state, not a special case.
- Non-LB and unverified workspaces make **zero** ERP probes for Lebanon methods —
  no wasted reads, no misleading "account missing" errors for a method that was
  never on offer.
- Historical payment identity is untouched — market gates *new transactions only*
  (see "Interaction with payment identity" below).
- The market signal arrives over the existing tenant-scoped JWT path, reducing
  rather than extending reliance on the admin god key.

### Trade-offs

- Every Lebanon-eligible tenant requires a deliberate human verification step.
  This is the intended cost, not an oversight.
- A new network read sits on the payment-availability path (mitigated by a short
  TTL cache; a Control Plane outage degrades to Cash-only, never to a wrong offer).
- Operator verification is only as good as its runbook. The endpoint is the easy
  half; the written standard for what an operator must confirm is the real control.
- Two fields where a naive reader expects one. That is what this ADR exists to
  explain, and the reason it must not be "simplified" later.

### Interaction with payment identity (do not conflate)

Market eligibility governs **what may be selected for a new payment**. It must
never touch **readback of what was already paid**. A workspace that is not
verified `LB` must still resolve the exact identity of a historical MyMonty
payment (`methodId: 'mymonty'`, `methodLabel: 'MyMonty'`) without that method
becoming newly selectable. Exact-identity preservation is global and
unconditional; market gating is a forward-looking availability filter. These are
separate systems and are tested separately.

## Deferred decisions

- Trainer self-declaration as a *second*, lower-trust tier (`operatingMarketSource`
  is designed to carry it; only `operator_verified` is defined today).
- Evidence-backed verification (business registration, bank account).
- Multi-market / multi-country tenants — a single tenant is assumed to operate in
  exactly one market.
- Market-driven behaviour beyond payment-method eligibility.
- Consolidating the drifting country lists (§ below).

## Known adjacent defects (recorded, not decided here)

1. **Onboarding still writes a guessed `country`.** After this ADR it authorizes
   nothing — but it still silently misconfigures ERP currency, timezone, fiscal
   year, and **Chart of Accounts** for any trainer outside the five mapped
   timezones. That is a real bug and deserves its own slice. This ADR does not fix
   it and must not be read as having fixed it.
2. **Four overlapping country lists**, already drifting:
   `MENA_TZ_MAP` (5) · `ALLOWED_COUNTRY_CODES` (5) · `COUNTRY_DEFAULTS` (32) ·
   `SUPPORTED_MARKETS` (proposed).
3. **`CONTROL_PLANE_API_KEY` blast radius** — that FitDesk holds a credential able
   to read any tenant's decrypted ERP credentials is a pre-existing posture
   question, out of scope here.

## Code review checklist

Any change touching market eligibility must verify:

- `operatingMarket` is never derived, defaulted, or backfilled from `country`,
  timezone, locale, phone, IP, currency, or company/site name.
- `country` is never read as an authorization input.
- Market is resolved **server-side** from the tenant-scoped JWT path; never
  client-supplied; never read via `CONTROL_PLANE_API_KEY`.
- Unverified / NULL / any error → fail closed (Cash unaffected; Lebanon methods
  absent and unprobed).
- Market filtering happens **before** the per-candidate ERP detail read.
- The availability cache key includes market (otherwise a verification — or worse,
  a revocation — is ignored for a full TTL).
- The **write-side** guard is market-aware, not only the availability projection.
  `isEnabledPaymentMethod()` is synchronous with no tenant context; it cannot
  carry this gate alone (see the plan's §4.6).
- Historical payment readback remains exact and market-independent.
- The market endpoint returns no `country` and no credentials.

## Supersession

Per Handbook `14` ("do not edit an approved ADR's decision in place — supersede
with a new ADR"): if a future decision reunifies `country` and `operatingMarket`,
or lowers the trust bar below operator verification, it must be recorded as a new
ADR that explicitly supersedes this one — stating what changed about the
provenance problem in §Context that made the merge safe.

Collapsing the two fields without such an ADR reintroduces, exactly, the defect
this record exists to prevent.

## Final status

**Approved by the owner, 2026-07-16.**

This is the controlling architecture decision for workspace operating-market
authority. Approval scope, recorded verbatim from the owner's decision:

- Control Plane is authoritative for workspace operating market.
- `Tenant.country` remains an ERP accounting and localization input and must
  never authorize market-specific payment methods.
- A separate nullable `operatingMarket` field controls market-specific product
  capabilities.
- The initial trusted state is `operator_verified` only.
- Existing tenants receive no automatic backfill from country, timezone,
  phone, locale, currency, or any inferred value.
- Missing or unverified operating market fails closed: Cash remains available,
  while Lebanon-specific methods remain unavailable and are not ERP-probed.
- Historical payment identity remains global and independent of the current
  operating market.
- The six Lebanon-specific methods remain disabled until the tenant-scoped
  market contract, FitDesk server-side gate, and ERP configuration are
  separately implemented, reviewed, merged, and deployed.

**This approval authorizes the architecture decision and documentation-governance
transition only.** It does not authorize application implementation, database
migration, Control Plane deployment, FitDesk deployment, ERP provisioning,
production mutation, or enabling the Lebanon payment catalog. No schema,
migration, endpoint, or code change has been made. The implementation plan is
`docs/plans/FITDESK_WORKSPACE_OPERATING_MARKET_AUTHORITY_PLAN.md`; it is now
**eligible for execution approval**, but every phase in it remains individually
approval-gated and none is approved by this decision.
