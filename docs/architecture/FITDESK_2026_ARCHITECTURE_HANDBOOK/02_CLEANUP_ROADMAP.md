# 02 — Cleanup Roadmap

> **Purpose:** The phased program to remove architectural drift before resuming feature work.
> **Last verified:** 2026-07-03 · **Companion:** `03_EXECUTION_PLAN.md` (order + gates).
> **Superseded by:** [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../../plans/FITDESK_REMAINING_ROADMAP_V2.md)
> for current-state phase planning. This file remains the historical cleanup record; see the
> "Current known state" update below for what has actually shipped since 2026-06-25.

## Scope

Substrate-first cleanup of FitDesk and its sibling service repos. Each phase is independently
gated. Phase A is a hard prerequisite for everything else.

## Current known state (updated 2026-07-03)

Workspace cleanup is **closed enough** and product work has resumed. The "0 / 9 phases started"
framing below is **stale** — Phase A (source control recovery), Phase B0 (Graphify audit), and
Phase C (design tokens) have shipped since this file was last verified. Do not cite "0 / 9" going
forward; see the roadmap linked above for the authoritative phase count.

- **Phase B0 (Graphify audit) — COMPLETE.** See
  [`docs/audits/PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md`](../../audits/PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md)
  (Status: COMPLETE, dated 2026-06-25) and `graphify-out/` (graph + targeted evidence reports,
  gitignored per plan).
- **Phase C (design-token OKLCH repair) — COMPLETE.** `app/globals.css` defines shadcn tokens as
  raw OKLCH triplets (e.g. `--border: 0.92 0.008 240`) and `tailwind.config.ts` now wraps them as
  `oklch(var(--border))` etc. — the `hsl(var(--x))`/OKLCH mismatch described in `01` (C1) is fixed.
- **FD Session vs PT Session (Open decision, `01`/G3) — RESOLVED BY CODE.** FD Session is the
  shipped, live session architecture (`lib/scheduling/sessionRepository.ts`:
  `DOCTYPE_SESSION = 'FD Session'`, plus `bookingService.ts`, `sessionCompletionService.ts`,
  `lib/dashboard/dashboardDataService.ts`). PT Session (`lib/erpnext/client.ts:411-459`) is a dead
  stub: `getSessions()` returns `[]`; `createSession` / `markSessionComplete` / `cancelSession` /
  `markSessionMissed` throw 503/404. It is **not deleted yet** — only isolated as legacy. See `09`
  for the full detail and the still-open `getSessionById` trainer-scoping item (H5).
- **`features/` migration (Phase E) — still open, scaffold-only.** 28 `.gitkeep` placeholders +
  one real component (`features/clients/components/ClientWorkspaceOverlay.tsx`). No migration has
  started.
- **CI (Phase H) — still open.** No `.github/workflows` directory exists in FitDesk today. The
  current roadmap (`FITDESK_REMAINING_ROADMAP_V2.md`) pulls a minimal CI gate forward as **Phase
  1.5**, ahead of write-path changes, rather than leaving it to the end as Phase H implied.

## The phases

### Phase A — Source Control Recovery (P0)
- **Status (2026-07-03): CLOSED ENOUGH.** See the "Current known state" update above; product work
  has resumed. Not re-verified item-by-item in this pass — if a specific gate item needs
  re-confirmation, re-run the checks below rather than assuming.
- **Objective:** All repos attached, deployable, with one canonical checkout each; no commit lost.
- **Targets:** detached HEADs (EES, PA); FitDesk `main` ahead-17; `provisioning_api` untracked ERP
  backend + behind-1; 17 extra worktrees; `FitDesk;C`; `fitdesk-app` classification.
- **Risk:** High (history-adjacent). **Mitigation:** tag-before-touch; worktree removal is reversible;
  no force-push / reset / clean.
- **Gate (GO):** no detached HEADs; `provisioning_api` clean & not-behind; every worktree justified;
  `git fsck` shows no lost objects; safety tags exist in all repos.

### Phase B0 — Graphify Knowledge Graph Audit (post-A, pre-B)
- **Status: COMPLETE (2026-06-25).** See
  [`docs/audits/PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md`](../../audits/PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md)
  and `graphify-out/` (graph + targeted evidence reports). All 8 audit questions answered;
  output stayed gitignored per the governing rules below.
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
- **Status: COMPLETE (confirmed 2026-07-03).** `app/globals.css` defines shadcn tokens as raw
  OKLCH triplets (`--border: 0.92 0.008 240`, etc.); `tailwind.config.ts` consumes them via
  `oklch(var(--border))` etc. — the `hsl(var(--x))` mismatch is fixed.
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
- **Status: STILL OPEN — scaffold only.** `features/` holds 28 `.gitkeep` placeholders + one real
  component (`features/clients/components/ClientWorkspaceOverlay.tsx`). No migration map, shim,
  or move has started. Tracked as Phase 8 in `FITDESK_REMAINING_ROADMAP_V2.md`, sequenced after
  basic CI (Phase 1.5) so moves land under automated gates.
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

### Phase G — Session Architecture Deployment (unfrozen — PT/FD decision resolved by code)
- **Status update (2026-07-03):** the **PT Session vs FD Session** decision that froze this phase
  is resolved: **FD Session is the shipped, live session architecture**
  (`lib/scheduling/sessionRepository.ts`: `DOCTYPE_SESSION = 'FD Session'`, plus
  `bookingService.ts`, `sessionCompletionService.ts`, `lib/dashboard/dashboardDataService.ts`).
  **PT Session is a dead/legacy stub** (`lib/erpnext/client.ts:411-459`) — kept in place, not yet
  deleted. One known user-visible gap remains: the client detail page still reads the dead PT
  Session path (`app/dashboard/clients/[id]/page.tsx:61`), so client-level session history shows
  empty despite live FD Sessions existing. That rewire is tracked as Phase 4 in
  `FITDESK_REMAINING_ROADMAP_V2.md`, not done in this pass. The `getSessionById` trainer-scoping
  gap (H5) also remains open — see `09`.
- **Objective:** Make sessions real through the proxy — replacing the stub.
- **Blocked by (historical):** A + B + C + F complete **and** the **PT Session vs FD Session** decision
  (`09`, `01`/G3) **and** DocType/provisioning approval.
- **Risk:** High (ERP DocTypes + provisioning). Treat any further session-completion / billing-hook
  change as approval-gated per workspace `CLAUDE.md` §4, even though the naming decision is settled.

### Phase H — CI/CD Hardening
- **Status: STILL OPEN.** No `.github/workflows` directory exists in FitDesk today. A minimal CI
  gate (install/typecheck/test/lint/build using existing scripts) is pulled forward as **Phase
  1.5** in `FITDESK_REMAINING_ROADMAP_V2.md`, ahead of write-path changes — full per-repo pipeline
  hardening as originally scoped here remains later work.
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

- The six items in `01` — **PT/FD Session (the program-blocking one for G) is now RESOLVED BY
  CODE:** FD Session is the shipped architecture, PT Session is legacy/dead. The remaining open
  item under G is the client-detail-page rewire (Phase 4 in `FITDESK_REMAINING_ROADMAP_V2.md`) and
  the `getSessionById` trainer-scoping gap (H5, `09`) — not the naming decision itself.

## Verification checklist

- [ ] Each phase has its GO gate met before the next begins.
- [ ] Safety tags created before A.
- [ ] F0 completed before any scheduler deletion.

## Related files / ADRs

- See per-phase targets above; `ADR-UX-011`, `ADR-001`, `ADR-UX-004/006`; future `ADR-SCH-001`.

## Next actions

- Historical: read `03` for the execution order and gates; start at Phase A, then B0.
- Current (2026-07-03): see
  [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../../plans/FITDESK_REMAINING_ROADMAP_V2.md) for
  the active phase plan — Phase 0 (this truth repair) → Phase 1 (re-open safely) → Phase 1.5
  (basic CI) → onward.
