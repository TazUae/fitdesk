# 12 — Multi-Tenant SaaS Blueprint

> **Purpose:** Document tenant-isolation principles and separate what FitDesk is **now** from the
> platform modules planned **later**.
> **Last verified:** 2026-06-25 · **Authority:** workspace `CLAUDE.md`, `ADR-UX-011` (multi-tenant readiness).

## Scope

FitDesk's tenant model and its relationship to the Control Plane provisioning platform.

## Current known state (verified)

- The platform provisions **one ERPNext site per tenant** via the Control Plane → Provisioning Agent
  → ERP Execution Service → bench-agent chain.
- The Control Plane holds per-tenant ERP credentials and tenant metadata; FitDesk receives a
  `tenantId` and reaches ERP only through the signed proxy.
- FitDesk local tables are **tenant-scoped** (`tenantId` on `client_index`, etc.; `assertTenantId`).
- Provisioning concurrency is constrained (BullMQ concurrency = 1 per bench — a hard lock constraint).
- Pilot is effectively single-trainer-per-tenant; multi-trainer is a future concern.

## Architecture rules

### Tenant isolation principles
1. **Every tenant maps to an isolated ERP site.** No cross-tenant ERP access.
2. **`tenantId` is mandatory on all local rows and every local query is tenant-scoped.** Local app
   storage is shared, so tenant filtering is enforced in code, not assumed.
3. **Credentials are per-tenant and Control-Plane-held.** FitDesk never stores or sees them.
4. **The proxy carries `tenantId` in a signed JWT;** the Control Plane resolves the correct site/creds.
5. **Idempotent, traceable tenant operations.** Provisioning steps persist useful failure reasons.
6. **Frontend must not assume single trainer / single workspace / single module** (ADR-UX-011).

### Now vs. later
- **Now (FitDesk pilot):** single product app, single trainer per tenant, ERP-authoritative data,
  manual backfill per tenant, flags gating directory/hub.
- **Later (platform modules):** additional product modules on the same Control Plane; multi-bench
  sharding (`Tenant.benchShard`, `BenchShard`, `getAdapterForShard()` — designed, not built);
  webhook-based ERP→local reconciliation; multi-trainer workspaces; cross-module navigation.

## Do-not-touch areas (protected — see `00`)

- **Tenant isolation logic** and the credential boundary — changes are approval-gated.
- Provisioning job creation/retry/deletion — never automatic; approval-gated.
- The per-bench concurrency constraint.

## Open decisions

- Multi-trainer-per-tenant model (deferred).
- When to introduce multi-bench sharding (future-platform; not in the cleanup program).
- Webhook-based reconciliation vs. continued manual backfill (future-platform).

## Verification checklist

- [ ] No local query lacks a tenant scope.
- [ ] No cross-tenant ERP path exists; all ERP access carries `tenantId` via the proxy.
- [ ] No FitDesk-held credentials.
- [ ] Frontend code makes no single-trainer/single-workspace assumption it cannot later relax.

## Related files

- `lib/clients/repository.ts` (`assertTenantId`), `lib/erpnext/client.ts` (tenant JWT),
  control-plane proxy + tenant model (separate repo).

## Related ADRs

- `ADR-UX-011` (multi-tenant readiness); workspace `CLAUDE.md` (platform architecture boundary).
  A dedicated Multi-Tenant Isolation ADR is not yet written.

## Next actions

- Keep platform-module work out of the cleanup program (future-platform horizon); preserve isolation invariants.
