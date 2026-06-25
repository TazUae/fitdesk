# 05 — Repository Architecture

> **Purpose:** Document the current repo layout, the target layout, and which repos are canonical.
> **Last verified:** 2026-06-25.

## Scope

The workspace `C:\Users\Lenovo\Dev\axis-erp` and its service repos. The platform boundary is:

```text
Product Layer (FitDesk) → Control Plane → Provisioning Agent → ERP Execution Service → ERPNext/Frappe
```

## Current known state (verified)

The workspace **root is not a git repo**. Seven `.git` repos exist, plus worktrees and stray dirs:

| Directory | Type | Notes |
|---|---|---|
| `FitDesk` | repo (Next.js product) | `main`, ahead 17. **Canonical product repo.** |
| `control-plane` | repo | tenant orchestration + ERP proxy; 19 branches, 5 extra worktrees |
| `erp-execution-service` | repo | ERP executor; **detached HEAD**; 4 extra worktrees |
| `provisioning-agent` | repo | thin relay; **detached HEAD**; 7 extra worktrees |
| `provisioning_api` | repo (Frappe app) | untracked ERP backend; behind 1; 1 extra worktree |
| `bench-agent` | repo | Frappe bench support |
| `fitdesk-app` | repo | **DECISION REQUIRED** — likely Frappe-side app; last commit 2026-05-04 |
| `*-suffix` dirs (×17) | git worktrees | of CP/EES/PA/prov_api — collapse per `04` |
| `FitDesk;C` | **accidental dir** | **DECISION/Phase D** — inspect then remove; not a repo/worktree |
| root files | unversioned | compose files, `.env*`, several report `.md`s, a stray `.db` |

## Architecture rules

### Canonical repos (authoritative)
- **`FitDesk`** — the product/UI layer. The Next.js app. (Not `fitdesk-app`.)
- **`control-plane`** — tenant metadata, job state, routing, and the **ERP proxy** (sole keeper of
  per-tenant ERP credentials).
- **`provisioning-agent`** — thin relay/orchestrator boundary. No business logic.
- **`erp-execution-service`** — infrastructure executor for ERP/Frappe operations.
- **`provisioning_api`** — Frappe/ERP-side app + API surface (DocTypes, server scripts).
- **`bench-agent`** — Frappe bench support layer.

### Target repo layout (steady state)
- One canonical checkout per repo; **no `*-suffix` worktree directories** lingering.
- No accidental directories (`FitDesk;C` removed).
- Root remains a non-versioned workspace holder; cross-cutting docs live **inside** a versioned repo
  (this handbook lives in `FitDesk/docs/architecture/`).
- Each repo's `main` is the Dokploy deploy source and is not chronically divergent.

### Boundaries (must hold)
- FitDesk calls approved APIs/proxy only; it does not own provisioning orchestration or ERP infra.
- Control Plane is not a product UI; it persists useful failure reasons and keeps tenant ops idempotent.
- Provisioning Agent stays thin.
- ERP Execution Service owns no product UX/business rules beyond ERP execution behavior.

## Do-not-touch areas

- Repo boundaries: do not move business logic across the layer boundary lines above.
- `fitdesk-app` and `FitDesk;C` — no deletion until classified/inspected.

## Open decisions

1. **`fitdesk-app`** — is it the live Frappe-side FitDesk app, a duplicate, or abandoned? Determines keep/retire.
2. **`FitDesk;C`** — confirm it holds no unique content, then remove (Phase D).
3. Where future cross-cutting workspace docs live (recommendation: inside `FitDesk/docs` so they are versioned).

## Verification checklist

- [ ] `git -C <repo> rev-parse --show-toplevel` confirms each canonical repo.
- [ ] `git worktree list` per repo shows no obsolete worktrees.
- [ ] `fitdesk-app` role recorded; `FitDesk;C` inspected.

## Related files

- Each repo root; workspace `CLAUDE.md` (repo boundary rules).

## Related ADRs

- Workspace `CLAUDE.md` §3 (repo boundaries). A formal Repository-Topology ADR is not yet written.

## Next actions

- Resolve the two DECISION items; collapse worktrees in Phase A per `04`.
