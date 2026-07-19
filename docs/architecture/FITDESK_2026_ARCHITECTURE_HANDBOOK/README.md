# FitDesk 2026 Architecture Handbook

> **Status:** Canonical · **Owner:** FitDesk engineering · **Last verified:** 2026-06-25
> **Repo:** `C:\Users\Lenovo\Dev\axis-erp\FitDesk` · **Branch verified:** `main`
> **Truth-repair update (2026-07-03):** the "Next actions" below are stale — cleanup Phase A/B0/C
> are closed, and the PT/FD Session decision is resolved (FD Session shipped, PT Session dead).
> Product work has resumed; see
> [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md) for
> the current phase plan, and `01`/`02`/`09` for the corrected per-topic truth.

This folder is the **canonical architecture reference for FitDesk**. When a question about
"how is FitDesk supposed to be built / deployed / cleaned up" arises, the answer lives here
first. Chat sessions, scratch plans, and ad-hoc notes are **not** authoritative — this folder is.

It exists to end a specific failure mode the team experienced in 2026:

> Architecture decisions scattered across chats · multiple branches/worktrees evolving
> independently · design system evolving while features were built · session backend partially
> built but uncommitted · feature-architecture skeleton created but not completed · continuous
> feature additions before substrate cleanup.

---

## How to use this handbook

- **Read it before starting any cleanup or feature work.** Especially `00_ARCHITECTURE_CONSTITUTION.md`.
- **Treat `00` as binding.** It lists non-negotiable rules and protected areas. If a change would
  violate `00`, stop and escalate.
- **Treat `01` as the evidence base.** Every claim is tagged VERIFIED FACT / VERIFIED PROBLEM /
  HYPOTHESIS / DECISION REQUIRED with a confidence level. Do not act on a HYPOTHESIS as if it
  were a fact.
- **Keep it current.** When repository state changes (a phase completes, a decision is made),
  update the relevant document and bump its "Last verified" date. A stale handbook re-creates
  the drift it was built to stop.

## Reading order

1. `00_ARCHITECTURE_CONSTITUTION.md` — the rules and protected areas (read first, always).
2. `01_ARCHITECTURE_TRUTH_AUDIT.md` — what is proven vs. assumed.
3. `02_CLEANUP_ROADMAP.md` — the phased cleanup program (A–I).
4. `03_EXECUTION_PLAN.md` — execution order and phase gates.
5. `04_SOURCE_CONTROL_STRATEGY.md` → `15_PRODUCTION_READINESS_CHECKLIST.md` — domain references,
   read as needed.

## Document index

| # | Document | What it answers |
|---|---|---|
| 00 | Architecture Constitution | What may never be violated; what is protected |
| 01 | Architecture Truth Audit | What is proven vs. assumed (with confidence) |
| 02 | Cleanup Roadmap | The phased cleanup program A, B0, B–I |
| 03 | Execution Plan | The order and the gates (no time estimates); includes B0 knowledge graph step |
| 04 | Source Control Strategy | Worktrees, branches, untracked-ERP, push rules |
| 05 | Repository Architecture | Current vs. target repo layout; canonical repos |
| 06 | Frontend / UI Architecture | App Router, feature folders, shell/overlays, mobile-first |
| 07 | Design System & Tokens | Token rules, the OKLCH/HSL defect, governance |
| 08 | ERP Integration Architecture | Proxy boundary, no-credentials rule, thin agent |
| 09 | Scheduling Architecture | Engine, scheduler UX, the PT/FD Session decision |
| 10 | Client Management Architecture | ERP-authoritative hybrid, local projections |
| 11 | Dashboard Architecture | Action-first command center; blocked widgets |
| 12 | Multi-Tenant SaaS Blueprint | Isolation principles; now vs. later |
| 13 | CI/CD & Deployment Standards | Local QA, Dokploy-from-Git, required checks |
| 14 | Coding Standards & ADR Index | ADR list + the ADRs still missing |
| 15 | Production Readiness Checklist | Grouped go/no-go checklist |

## Handbook Trust Rules

Before acting on any claim in this handbook, apply these rules:

1. **Planning-context ≠ current state.** Claims sourced from prior chat sessions are labeled "planning-context." They describe intent or a reported state at a point in time — they are not a substitute for reading the live code.
2. **Target architecture ≠ implemented code.** Sections marked as "target" or "approved design" describe where the system should go. They do not mean the code is already there.
3. **Never make a cleanup change based on a hypothesis.** A claim tagged `🟡 HYPOTHESIS` in `01` requires verification before acting. Verify by reading files, running grep, or running tests — not by re-reading the handbook.
4. **Before each phase, re-verify repo state.** Bump the "Last verified" date in each document you rely on. A stale "Last verified" date means the document needs a fresh read of the referenced files before use.
5. **If a claim conflicts with current code, trust the code.** Update the stale handbook entry rather than acting on it.

## Document structure

Numbered documents (`00`–`14`) follow the standard 10-section format:
**Purpose / Scope / Current known state / Architecture rules / Do-not-touch / Open decisions / Verification checklist / Related files / Related ADRs / Next actions.**

Two documents intentionally use a different structure:
- **This README** — an index file; no architecture content.
- **`15_PRODUCTION_READINESS_CHECKLIST.md`** — a checklist-oriented gate document; it groups items by domain rather than following the 10-section format.

## A note on prior planning artifacts

Several earlier documents are referenced across these files under the heading
**"Known prior audit conclusions from planning sessions."** Where such a document
(e.g. a "Master Recovery Plan," "Deployment Readiness Report," "Scheduling Archaeology Audit,"
or `FITDESK_2026_ARCHITECTURE_CLEANUP_MASTER_PLAN.md`) is **not present on disk**, it is labeled
as **planning-context only** and is never cited as an on-disk source. The on-disk sources of
record are: this handbook, the `ADR-UX-001…013` suite (`012` Design Token
Governance and `013` Brand and Product UI Foundation added 2026-07-19),
`ADR-001`, the project `CLAUDE.md` files,
and the live repository state.

## Next actions

- Historical: resolve the **Open Decisions** consolidated in `01` and `09` (notably **PT Session vs
  FD Session**); begin cleanup at **Phase A**; run **Phase B0** (Graphify) after Phase A is GREEN.
- Current (2026-07-03): **PT Session vs FD Session is resolved** (FD Session shipped, PT Session
  legacy/dead); **Phase A, B0 (Graphify), and C (design tokens) are done.** Cleanup is closed
  enough and product work has resumed — see
  [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md),
  starting at its Phase 0 (this truth repair) → Phase 1 → Phase 1.5 (basic CI, still open).
- Still open regardless of the above: `features/` migration (Phase E / roadmap Phase 8), CI
  (Phase H / roadmap Phase 1.5), and backfilling the **missing ADRs** listed in `14`.
