# 08 — ERP Integration Architecture

> **Purpose:** Reinforce the ERP boundary: no credentials in FitDesk, all I/O through the proxy,
> Control Plane as the broker, Provisioning Agent thin.
> **Last verified:** 2026-06-25 · **Authority:** `FitDesk/CLAUDE.md`, workspace `CLAUDE.md`, `ADR-001`.

## Scope

All FitDesk ↔ ERPNext/Frappe communication.

## Current known state (verified)

- FitDesk talks to ERP through `lib/erpnext/client.ts:erpFetch()`, which signs a short-lived
  HMAC-HS256 JWT carrying `tenantId` and calls the Control Plane proxy
  (`/api/erp/doctype/:type[/:name]`), which forwards to Frappe.
- The Control Plane is the **sole keeper** of per-tenant `api_key`/`api_secret`. FitDesk holds none.
- `FITDESK_JWT_SECRET` is the shared signing secret (server-side only); absent → proxy returns 503.
- The proxy uses `http.request()` (not `fetch`) to forward a custom `Host` header so nginx routes to
  the correct tenant site (a load-bearing detail).
- Read models: ERPNext `Customer` is canonical for clients (`ADR-001`); Sales Invoice / Payment Entry
  for billing; session DocType identity is **unresolved** (see `09`).

## Architecture rules (binding)

1. **No ERP credentials in FitDesk** — not in code, client-reachable env, or logs.
2. **All ERP I/O through `erpFetch()` → Control Plane proxy.** No direct ERPNext client, no second
   HTTP path, no proxy bypass. If a code path needs ERP data, it goes through the adapter chain.
3. **Server-side only** — never call ERP from a client component (use server actions/route handlers).
4. **Normalize at the boundary** — raw ERP payloads are validated/normalized into app types before the
   UI sees them (`normalizeClient`, `normalizeInvoice`, `normalizeSession`).
5. **Control Plane boundary** — tenant credential storage, routing, and failure-reason persistence
   live in the Control Plane, not FitDesk.
6. **Provisioning Agent remains thin** — it is a relay; no business/financial logic accrues there.
7. **No duplicate financial truth** — FitDesk local tables are projections/enrichment only.

## The approved chain

```text
UI (server action)
  → actions/* (e.g. addClient, fetchSessions)
  → lib/business-data/erp-adapter (typed adapter)
  → lib/erpnext/client.ts:erpFetch()  [signs JWT with tenantId]
  → Control Plane /api/erp/doctype/*  [holds api_key/secret; forwards Host]
  → ERPNext / Frappe
```

## Do-not-touch areas (protected — see `00`)

- `erpFetch()` signing, the `tenantId` claim, and Host-header forwarding.
- Control Plane credential storage and proxy routes.
- Billing/payment write paths (invoice submit, Payment Entry, provider abstraction).

## Open decisions

- **PT Session vs FD Session** DocType identity (blocks real session reads — see `09`).
- When/if a webhook-based ERP→local reconciliation is introduced (currently manual backfill; future-platform).

## Verification checklist

- [ ] No new ERP HTTP client added; all access via `erpFetch()`.
- [ ] No ERP secret reachable by the browser or present in logs.
- [ ] ERP responses normalized before reaching the UI.
- [ ] Provisioning Agent contains no business logic.
- [ ] Local tables store no authoritative financial values.

## Related files

- `lib/erpnext/client.ts`, `lib/erpnext/types.ts`, `lib/business-data/erp-adapter.ts`,
  `actions/clients.ts`, `actions/sessions.ts`.

## Related ADRs

- `ADR-001` (ERP-authoritative client model). An **ERP-Boundary ADR** could formalize the proxy
  contract, but the `CLAUDE.md` rules currently govern.

## Next actions

- Resolve the session DocType identity before any session-read work (`09`, Phase G).
