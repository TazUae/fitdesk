# 15 — Production Readiness Checklist

> **Purpose:** A single go/no-go checklist, grouped by domain, used at the **Phase I** gate before any
> production push/deploy.
> **Last verified:** 2026-06-25. Items reflect current known state; unchecked ≠ broken, it means
> "not yet verified for production."

## Scope

FitDesk production readiness across all architecture domains. This is the terminal gate of `02`/`03`.

## How to use

- Do not authorize a deploy until the relevant groups are checked **and** an explicit deploy
  instruction is given (`00`/`13`).
- Each box should be backed by command output, a screenshot, or a recorded decision — not a feeling.

## Source control
- [ ] No repo in detached HEAD; `provisioning_api` clean and not behind.
- [ ] One canonical checkout per repo; obsolete worktrees pruned (`04`).
- [ ] Safety tags exist; no branch deleted without merge-or-tag.
- [ ] `fitdesk-app` classified; `FitDesk;C` resolved.
- [ ] FitDesk `main` reconciled with origin (the ahead-17 intentionally pushed under instruction).

## Knowledge graph audit (Phase B0)
- [ ] Graphify run completed on clean post-Phase-A repo.
- [ ] All 8 audit questions answered (ERP chain; billing chain; scheduling conflict ownership; UI↔action imports; duplicate formatters/resolvers/predicates; blast-radius ranking; doc/code drift; feature boundary violations).
- [ ] Output location resolved: gitignored (generated) or committed as audit artifact (`docs/audit/`).
- [ ] No application code, test, package, or Docker file changed during B0.
- [ ] Findings classified as evidence; no cleanup action taken solely on Graphify output without handbook rules, ADR review, tests, lint, and build.

## Deployment
- [ ] `npm run local:up` + `npm run local:check` green on the canonical compose/`.env`.
- [ ] One documented env template; no stray `.env`/compose variants in the deploy path.
- [ ] Dokploy deploy source = `main`; no production server/env edits pending.
- [ ] Rollback plan = redeploy previous tag; pre-deploy tag created.

## ERP
- [ ] No ERP credentials in FitDesk (code/env/logs).
- [ ] All ERP access via `erpFetch()` → Control Plane proxy; no bypass.
- [ ] ERP responses normalized before UI.
- [ ] Provisioning Agent contains no business logic.

## Billing & session outcomes
- [ ] Invoice status only marked paid after server-side verification.
- [ ] Provider abstraction intact (Whish/Cash/Bank Transfer); no hardcoding.
- [ ] Manual "+ Invoice" remains hidden per UX decision; no duplicate financial store.
- [ ] Payment events logged/auditable; failures surface in UI.
- [ ] **Package billing:** package invoice generated when package is sold/assigned (not on session
      completion); session completion decrements package balance; over-spend is warned, not silently allowed.
- [ ] **Pay-per-session billing:** Sales Invoice generated automatically only after session completion;
      invoice generation failure is surfaced in UI, not swallowed.
- [ ] **No-show billing decision:** trainer is explicitly prompted (package deduction / charge missed
      session); no auto-deduction or auto-charge without trainer confirmation.
- [ ] Session completion is trainer-owned: `getSessionById` scopes ERP query by `trainerId` (H5 fix
      must land before completion is enabled in production — see `09` Open decision 5).
- [ ] Session completion is tenant-scoped: every ERP mutation carries tenant JWT via `erpFetch()`.
- [ ] All invoice and Payment Entry writes go through `erpFetch()` → Control Plane proxy; no direct
      ERP billing writes from client components.
- [ ] Local fields (`paymentSummary`, `billingMode`) are read-model projections only; financial totals
      come from ERP (Sales Invoice / Payment Entry), not from local tables.
- [ ] Add Client creates no invoice, payment, session, or program side effects (verified by code
      review of `actions/clients.ts:addClient` — `ADR-001`).

## Clients
- [ ] ERP Customer canonical; `erpCustomerId` stored for active/billable clients (`ADR-001`).
- [ ] Add Client uses proxy path; creates no invoices/payments/sessions; recoverable on local-row failure.
- [ ] Every local client query tenant-scoped; duplicate detection tenant-scoped.
- [ ] Pilot flags (`FITDESK_CLIENT_DIRECTORY_LOCAL_READ`, `FITDESK_CLIENT_HUB_ENABLED`) intentionally set.

## Scheduling
- [ ] F0 UX Archaeology completed; no scheduler branch/component deleted before it.
- [ ] One canonical scheduler engine; `ADR-SCH-001` written.
- [ ] **PT Session vs FD Session decided**; session reads return real data (or are visibly gated).
- [ ] No lost drag-create/reschedule UX left unaddressed or un-acknowledged.

## Dashboard
- [ ] Every widget answers one of the four ADR-UX-009 questions.
- [ ] No fake/placeholder session or engagement data shown.
- [ ] Session-derived widgets gated until session truth resolves.

## Design system
- [ ] OKLCH/`hsl()` token bridge fixed; shadcn utilities render correct palette (screenshots).
- [ ] No arbitrary Tailwind values; token-governance lint in place.

## Tests
- [ ] FitDesk `npm test` / `lint` / `build` (+`tsc --noEmit` if configured) green.
- [ ] control-plane `npm test` + integration green; `provisioning_api` `pytest` green.
- [ ] Per-repo CI pipelines green (Phase H).

## Security / multi-tenant
- [ ] Tenant isolation holds; no cross-tenant ERP path; `tenantId` on every local row/query.
- [ ] Single-trainer IDOR invariant preserved (no by-id mutation without ownership scope).
- [ ] No secrets in repo/logs/health endpoints; inputs validated at boundaries; HTTPS for external calls.
- [ ] Auth: every user maps to exactly one Trainer; server-side session checks on protected routes.

## Open decisions blocking full readiness

- PT Session vs FD Session (`09`) · scheduler UX recovery (`09`/F) · `fitdesk-app`/`FitDesk;C` (`05`) ·
  flag flip timing (`10`) · email edit write-path (`10`).

## Related files / ADRs

- All handbook documents; `ADR-001`, `ADR-UX-001…011`, future `ADR-SCH-001`/`ADR-SRC-001`/`ADR-TOK-001`/`ADR-DEP-001`.

## Next actions

- Treat this as the Phase I gate; do not deploy until the relevant groups are green and instruction is given.
