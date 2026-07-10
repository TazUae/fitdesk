# FitDesk Pre-Flight Inventory Report

> Read-only audit performed prior to Sprint 1 execution-environment-architect work.
> No files were created, edited, deleted, staged, committed, or pushed during this audit.

## 1. Repository State

- **Branch:** `axis-erp` (workspace root) is **not a git repository** (confirmed: `git rev-parse` fails). Each service is its own repo. Most relevant to Sprint 1: `FitDesk/` → branch `main`.
- **Working tree:** `FitDesk/` clean (0 pending changes).
- **Latest commit:** `FitDesk`: `aae5276` "Merge pull request #22 from TazUae/fix/statement-unavailable-actions" (2026-07-10).
- **Prior-context note, not re-verified in this FitDesk docs-only task:** `control-plane/` was previously observed on branch `feat/provisioning-reliability-v2` with unpushed work, clean tree, latest commit `d3fa151` "Close latent raw failureReason leak in tenant.service.ts" (2026-07-09). This is carried over from prior session memory, not freshly audited as part of this FitDesk-scoped inventory.
- **Package manager:** npm (`package-lock.json` present in `FitDesk/`; no yarn/pnpm lockfiles found).
- **Test command:** `npm test` → `vitest run` (FitDesk).
- **Lint command:** `npm run lint` → `next lint` (FitDesk).
- **Build/verify command:** `npm run build` → `next build`; `npm run build:verify` → `node scripts/build-verify.mjs`.

## 2. Execution Kit Inventory

| Area | Expected | Found | Status | Notes |
|---|---|---|---|---|
| CLAUDE.md | yes | root `CLAUDE.md` (401 lines) + `FitDesk/CLAUDE.md` (192 lines) | RISK | Both exist and are substantive/well-structured, but neither is "short" in the lean bounded-execution-loop sense — root file alone is 401 lines of policy. |
| settings.json | yes | not found anywhere | MISSING | Only `.claude/settings.local.json` exists at root and inside `FitDesk/`, `FitDesk/worktrees` — both are pure Bash/PowerShell/WebFetch **permission allowlists**, no `hooks` key. |
| hooks | yes | none | MISSING | No `.claude/hooks/*.sh`, `*.ps1`, or any hook scripts anywhere in the workspace (excluding `node_modules`). |
| subagents | yes | none | MISSING | No `.claude/agents/*.md` anywhere. `spec-conformance-reviewer.md` and `tenant-isolation-auditor.md` specifically do not exist. |
| fitdesk-spec skill | yes | not found | MISSING | `FitDesk/.claude/skills/` exists with 4 skills — `better-auth`, `docker-deployment`, `erpnext-integration`, `whatsapp-evolution`, `whish-payments` — but no `fitdesk-spec`. |
| product docs | yes | `FitDesk/docs/product/*.md` (9 files) | PASS (partial) | Docs exist but are feature/phase-freeze narratives (Client Area, Dashboard Command Center, Goal System), not user-story-formatted acceptance criteria. No `docs/product` at workspace root — real docs live under `FitDesk/docs/`. |
| sprint-1 execution docs | yes | none | MISSING | No `docs/execution` anywhere, no `sprint-1` directory anywhere in the workspace. |

## 3. Product Documentation Readiness

Real product documentation lives at `FitDesk/docs/` (not `axis-erp/docs/`, which only has 2 loose files + an `audits/` folder). `FitDesk/docs/` is organized into `adr/`, `architecture/` (the 2026 Architecture Handbook, 16 files), `audits/`, `plans/`, `product/`, `prompts/`, `research/`, `security/`. This is a mature, phase-driven documentation set — but it tracks work by **Phase number** (Phase 0–10, per `FITDESK_REMAINING_ROADMAP_V2.md`), not by **User Story ID**. There is no existing convention mapping "US-###" to a spec or acceptance-criteria block anywhere in the repo. `FitDesk/docs/product/FITDESK_GOAL_SYSTEM.md` is worth flagging by name only: it's a *client fitness-goal intake taxonomy* feature spec, unrelated to a Claude Code `/goal` command — a naming collision to be aware of, not a blocker.

Verdict: the docs are rich and would likely contain the underlying detail for US-025/026/030/018 if traced back to phase/feature docs, but nothing is pre-formatted as `/goal`-ready acceptance criteria today.

## 4. Sprint 1 Acceptance Criteria Readiness

| Story | Acceptance criteria found? | Source doc | Ready for /goal? | Notes |
|---|---:|---|---:|---|
| US-025 | no | — | no | Zero matches for "US-025" anywhere in the workspace (`.md`, or otherwise). |
| US-026 | no | — | no | Zero matches for "US-026" anywhere in the workspace. |
| US-030 | no | — | no | Zero matches for "US-030" anywhere in the workspace. |
| US-018 | no | — | no | Zero matches for "US-018" anywhere in the workspace. |

None of the four Sprint 1 story IDs exist in any form in this repo. Either the US-numbering is new (to be introduced with the execution-environment architect model) or it maps to unlabeled existing phase work that hasn't been cross-referenced yet.

## 5. Misalignments / Risks

- **No US-ID convention exists.** The repo's real tracking unit is "Phase N" (see `FitDesk/docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`). Introducing US-025/026/030/018 requires either a fresh mapping decision or confirmation these are net-new stories not yet scoped.
- **No deterministic hooks configured anywhere.** `settings.local.json` (root and `FitDesk/`) is a Bash/PowerShell/WebFetch command allowlist only — it has no `hooks` block. The "hooks as deterministic shell commands" requirement is currently unmet at 0%.
- **No subagents exist**, isolated or otherwise — `spec-conformance-reviewer` and `tenant-isolation-auditor` are net-new builds, not present in any form (not even a draft).
- **No `fitdesk-spec` skill.** `FitDesk/.claude/skills/` has 4 domain skills (auth, docker, ERP integration, WhatsApp, payments) but nothing that indexes/points to `docs/product`.
- **CLAUDE.md files are large, not lean.** Root `CLAUDE.md` (401 lines) is a full governance policy document (approval gates, forbidden commands, incident response) — appropriate for its scope, but not the "short, pointer-style" file implied by a bounded execution-loop architecture. This is a design decision to make, not a defect — the current file mixes workspace-wide safety policy with what could be an execution-loop pointer file.
- **No stale/monolithic content found** — searches for "Master Context Prompt", "monolithic", `ENG-###`, `[cite:`, and "native device WhatsApp" returned zero matches. Clean on this front.
- **No raw ERP credential leakage found in FitDesk.** `ERP_API_KEY`/`ERP_API_SECRET` only appear in `erp-execution-service/` (its legitimate owner) and workspace gate scripts — never inside `FitDesk/`. This matches the Sovereign Rule ("FitDesk does not store raw ERP credentials").
- **Auth is confirmed as Better Auth from the repo itself** (`FitDesk/package.json` dependency `better-auth@^1.2.0`, and `FitDesk/CLAUDE.md` explicitly states "Better Auth is the only auth system"). Safe to document as fact, not assumption.
- **Duplicate/nested doc trees exist**: `fitdesk-platform/services/fitdesk/docs/` is a parallel copy of `FitDesk/docs/` (previously flagged in memory as architecture debt — "nested committed service copies"). Any Sprint 1 doc work should target `FitDesk/docs/`, not the nested platform copy, to avoid drift.
- **Prior-context note, not re-verified in this FitDesk docs-only task:** control-plane was previously observed to have an unpushed branch (`feat/provisioning-reliability-v2`) — if Sprint 1 stories touch Control Plane, re-confirm this branch's current state before building on it, rather than relying on this carried-over note.

## 6. Missing Execution Kit v1.0 Assets

Not created — listed only:

- `.claude/settings.json` (with a `hooks` block using deterministic shell commands)
- `.claude/hooks/*.sh` or `*.ps1` (the actual hook scripts)
- `.claude/agents/spec-conformance-reviewer.md`
- `.claude/agents/tenant-isolation-auditor.md`
- `.claude/skills/fitdesk-spec/SKILL.md` (or `FitDesk/.claude/skills/fitdesk-spec/SKILL.md`)
- `docs/product/US-025.md`, `US-026.md`, `US-030.md`, `US-018.md` (or equivalent acceptance-criteria packets) — location TBD (root `docs/product` doesn't exist; likely belongs under `FitDesk/docs/product/`)
- `docs/execution/sprint-1/` directory with per-story goal packets
- A US-ID ↔ Phase-N cross-reference note, so Sprint 1 stories map onto the existing phase-based roadmap instead of creating a second, disconnected tracking scheme

## 7. Recommended Next Step

Before writing any Sprint 1 execution kit files, resolve the tracking-scheme mismatch first: confirm with the user whether US-025/026/030/018 are brand-new stories to be scoped from scratch, or whether they correspond to specific unlabeled work already described in `FitDesk/docs/plans/FITDESK_REMAINING_ROADMAP_V2.md` — since building `/goal` packets against the wrong assumption here would put every downstream Sprint 1 artifact on a false foundation.
