# 02 — Cleanup Roadmap

> **Purpose:** The phased program to remove architectural drift before resuming feature work.
> **Last verified:** 2026-06-25 · **Companion:** `03_EXECUTION_PLAN.md` (order + gates).

## Scope

Substrate-first cleanup of FitDesk and its sibling service repos. Each phase is independently
gated. Phase A is a hard prerequisite for everything else.

## Current known state

Drift is concentrated in the source-control substrate and a few architecture seams, not in product
logic. See `01` for the evidence base. Program progress: **0 / 9 phases started.**

## The phases

### Phase A — Source Control Recovery (P0)
- **Objective:** All repos attached, deployable, with one canonical checkout each; no commit lost.
- **Targets:** detached HEADs (EES, PA); FitDesk `main` ahead-17; `provisioning_api` untracked ERP
  backend + behind-1; 17 extra worktrees; `FitDesk;C`; `fitdesk-app` classification.
- **Risk:** High (history-adjacent). **Mitigation:** tag-before-touch; worktree removal is reversible;
  no force-push / reset / clean.
- **Gate (GO):** no detached HEADs; `provisioning_api` clean & not-behind; every worktree justified;
  `git fsck` shows no lost objects; safety tags exist in all repos.

### Phase B0 — Graphify Knowledge Graph Audit (post-A, pre-B)
- **Objective:** Generate a read-only repository knowledge graph (Graphify) on a freshly stabilised
  repo to surface high-blast-radius files, duplicate logic paths, feature boundary violations, and
  code/doc drift. Use findings as **evidence** to sharpen Phases B–F. No code changes in this phase.
- **Entry condition:** Phase A gate GREEN (clean repo, no detached HEADs, `provisioning_api` clean).
- **Audit questions Graphify must answer:**
  1. Which files connect client creation to ERP?
  2. Which files connect session completion to billing?
  3. Which files own scheduling conflict logic?
  4. Which UI components import business actions directly?
  5. Where are duplicate money formatters, trainer resolvers, or invoice status predicates?
  6. Which files have the highest blast radius?
  7. Which docs disagree with current code structure?
  8. Which modules violate the target feature-based architecture?
- **Governing rules:**
  - Read-only — must not modify application code, tests, package files, Docker files, or branches.
  - Graphify output is **evidence only**, never source of truth. Architecture decisions still require
    handbook rules, ADR review, tests, lint, and build.
  - Must not auto-delete files, branches, or migrations.
  - Output location must be decided **before** running: add to `.gitignore` (generated, ephemeral) or
    commit as a one-off audit artifact (`docs/audit/`). Default: gitignore.
  - Sensitive repo content stays local; no AI-provider mode without explicit approval.
- **Risk:** Very Low (read-only tool invocation; zero code changes).
- **Gate (GO):** run completed; all 8 audit questions answered; output location resolved (gitignored or
  archived); no application file changed.

### Phase B — Deployment Contract Cleanup
- **Objective:** One canonical local compose, one env template, per-service Dockerfiles aligned to Dokploy.
- **Targets:** root compose set, `.env`/`.env.local` divergence, `.env.bak`, per-service Dockerfiles.
- **Risk:** Medium. **Mitigation:** local success ≠ prod proof; render-config + `local:check`; no prod env edits.
- **Gate (GO):** `local:up` + `local:check` green on the canonical compose/env; one documented template.

### Phase C — Design Token Repair
- **Objective:** Fix the OKLCH/`hsl()` bridge; one token source of truth (see `07`).
- **Targets:** `app/globals.css`, `tailwind.config.ts`; arbitrary-value scan.
- **Risk:** Medium (broad visual surface, small active blast radius). 
- **Gate (GO):** shadcn utilities render the intended palette (screenshot-confirmed); build/tests green.

### Phase D — Repo / Dead-Code Cleanup
- **Objective:** Remove confirmed junk and dead code; archive ambiguous artifacts, never hard-delete.
- **Targets:** `FitDesk;C`, stray `.db`, `.env.bak`, stale root reports; `AddClientSheet` (verify);
  scheduler orphans `TimeGrid`/`SessionBlock` **(deferred to post-F)**.
- **Risk:** Low-Medium. **Mitigation:** grep-prove dead before delete; archive-don't-delete.
- **Gate (GO):** every removal grep-proven + green; scheduler primitives untouched until F.

### Phase E — Feature Architecture Migration (split)
- **E1 Feature Architecture Audit** — produce the file→`features/*` migration map + shim plan.
- **E2 Clients Migration** — move + re-export shim; green after each.
- **E3 Dashboard Migration** — same pattern.
- **E4 Scheduling Migration** — only **after F1**; migrate the single canonical scheduler.
- **Risk:** Medium (import churn). **Mitigation:** re-export shims, `tsc --noEmit` per move.
- **Gate (GO):** migrated features build/test green; no `UI→ERP` direct calls introduced.

### Phase F — Scheduling Reconciliation (F0 blocking)
- **F0 UX Archaeology Audit (mandatory, blocking):** run `scheduler/custom-v1-snapshot`,
  `scheduler/schedulex-integration`, and `main`; produce a capability/interaction diff
  (what was lost / better / worse). **No `scheduler/*` branch or component is deleted before F0.**
- **F1 Reconcile:** write `ADR-SCH-001` (canonical engine + recovered UX requirements); port any
  lost-but-valuable UX; remove orphaned primitives (now UX-cleared); tag-then-delete `scheduler/*`.
- **Risk:** Medium (+variable if regressions must be ported). 
- **Gate (GO):** one scheduler; ADR-SCH-001 committed; no UX regression unaddressed; losing branches archived as tags.

### Phase G — Session Architecture Deployment (FROZEN)
- **Objective:** Make sessions real through the proxy — replacing the stub.
- **Blocked by:** A + B + C + F complete **and** the **PT Session vs FD Session** decision (`09`, `01`/G3)
  **and** DocType/provisioning approval.
- **Risk:** High (ERP DocTypes + provisioning). **Do not start until unfrozen.**

### Phase H — CI/CD Hardening
- **Objective:** Encode every phase's verification in per-repo pipelines + a token-governance guard.
- **Gate (GO):** each repo has a green pipeline reproducing its manual checks.

### Phase I — Production Readiness Gate
- **Objective:** Terminal checklist (`15`); authorize the first push/deploy on explicit instruction only.
- **Gate (GO):** all prior gates met; deploy approval given.

## Architecture rules

- Dependency order: `A → B0 → (B ∥ C ∥ D) → E → F → G → H → I`. A precedes all; B0 follows A and precedes the parallel block; I is terminal.
- Horizons: **MVP-now** = A, B0, C, D, B-hygiene · **hardening-soon** = B-full, E, F, G, H · **future** = multi-bench, ERP↔local reconciliation, full multi-tenant frontend.

## Do-not-touch areas

- Scheduler branches/components until F0; session DocType until G3; all `00` protected areas.

## Open decisions

- The six items in `01` (PT/FD Session is the program-blocking one for G).

## Verification checklist

- [ ] Each phase has its GO gate met before the next begins.
- [ ] Safety tags created before A.
- [ ] F0 completed before any scheduler deletion.

## Related files / ADRs

- See per-phase targets above; `ADR-UX-011`, `ADR-001`, `ADR-UX-004/006`; future `ADR-SCH-001`.

## Next actions

- Read `03` for the execution order and gates; start at Phase A, then B0.
