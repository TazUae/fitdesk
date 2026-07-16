# FitDesk Documentation Authority Map

> Defines which documents Claude Code (and any human contributor) should treat as
> authoritative, in what order, and what to do when two documents disagree.
> This map is itself governed by `CLAUDE.md` — if this file and `CLAUDE.md` conflict,
> `CLAUDE.md` wins.

## Purpose

FitDesk's `docs/` tree has grown organically across many phases (Phase 0 through
Phase 10+) and now contains architecture handbooks, ADRs, phase plans, audits,
freeze/closeout reports, and product narratives. Not all of these carry the same
weight. **Claude Code must not treat every doc as equally authoritative.** A phase
closeout report from three months ago does not override a current sovereign product
doc, and a plan-only security note is not the same as a shipped, verified behavior.

This file exists so that, when Claude Code (or a human) needs to resolve "what is
actually true right now," there is one deterministic place to look for the answer,
instead of re-reading the entire `docs/` tree from scratch each session.

## Authority hierarchy (highest to lowest)

1. **`CLAUDE.md`** — always-loaded sovereign rules and repo safety rules. This is the
   only document loaded into every session unconditionally. It defines approval gates,
   forbidden commands, architecture boundaries, and safety rules. Nothing below this
   tier may override it.

2. **`.claude/skills/fitdesk-spec/SKILL.md`** *(not yet built — see
   `docs/audits/PRE_FLIGHT_INVENTORY_REPORT.md` §6)* — the future on-demand spec
   router. Once built, this skill is what Claude Code invokes to find the correct
   `docs/product/*` file for a given feature area, instead of loading the entire
   documentation pack into every session. Until it exists, doc discovery is manual.

3. **`docs/product/*`** — canonical product truth, **once imported/aligned**. Today
   `docs/product/` contains real files (Client Area, Dashboard Command Center, Goal
   System, etc.) but they are feature/phase-freeze narratives, not yet normalized into
   a single canonical-truth format with acceptance criteria. As Sprint 1 stories are
   scoped, their canonical intent should be written or imported here under a
   US-ID-addressable structure.

4. **`docs/execution/*`** — sprint execution packets. New tier, introduced with this
   file. This is where `/goal`-ready acceptance-criteria packets and per-story
   traceability live (see `docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`).
   Execution packets here should always point back to their `docs/product/*` source
   of truth rather than restating it.

5. **`docs/plans/*`** — existing phase-based planning history (Phase 0 through
   Phase 10+, e.g. `FITDESK_REMAINING_ROADMAP_V2.md`). This is the project's actual
   historical tracking mechanism. It remains authoritative for *what phase of work
   this was and why*, but is not the source for current acceptance criteria once a
   story has a `docs/product/*` or `docs/execution/*` equivalent.

6. **`docs/audits/*`** — audit evidence and review reports (freeze reports, gap
   analyses, QA closeouts, this pre-flight inventory). Authoritative as a factual
   record of *what was found at the time of the audit*, not as a source of forward
   product intent. Audits document state; they do not define desired state.

7. **Older phase docs** (anything under `docs/architecture/`, `docs/adr/`,
   `docs/research/`, `docs/security/`, `docs/prompts/` not explicitly referenced by
   this map) — **historical unless explicitly referenced by this authority map or by
   a `docs/product/*` / `docs/execution/*` file.** They remain valuable context and
   are not deleted, but must not be assumed current without a live cross-reference.

### Binding ADRs (approved — controlling)

Listed here once an ADR's own `Status` line reads `Approved`. These carry full
architectural force per the hierarchy above and must not be silently
overridden — see each ADR's own "Do-not-touch" / "Supersession" clause for how
to change them.

| ADR | Status | Controlling decision |
|---|---|---|
| [`ADR-MKT-001`](adr/ADR-MKT-001-workspace-operating-market-authority.md) — Workspace Operating Market Authority | **Approved** (2026-07-16) | `Tenant.country` is a locale/Chart-of-Accounts provisioning seed and must never authorize payment-method eligibility. Operating market is a separate, nullable, operator-verified field (`operatingMarket`) that fails closed when unverified — Cash remains available; Lebanon-specific methods stay unavailable and unprobed. No backfill from country, timezone, phone, locale, or currency. Historical payment identity stays global and market-independent. **This approval covers the architecture decision and documentation-governance transition only** — it does not authorize implementation, migration, deployment, ERP provisioning, or enabling the Lebanon catalog; see the ADR's Final Status for the full scope and `docs/plans/FITDESK_WORKSPACE_OPERATING_MARKET_AUTHORITY_PLAN.md` for the still-gated execution phases. |

### Explicitly referenced, non-binding ADRs (tracked here — not historical)

Listing an ADR here exempts it from the tier-7 "historical unless referenced"
default above: it is current and discoverable, and must not be assumed stale or
ignored. **Listing here does not by itself make the ADR's decision binding.** An
ADR carries architectural force only once its own `Status` line reads
`Approved` — until then it is recorded, reviewable intent, not settled
architecture, and must not override existing approved behavior; it moves to the
binding table above on approval. Absence from this list does not by itself
demote an ADR that is already live-cross-referenced from code or the handbook
(e.g. `ADR-001`, cited from `actions/clients.ts`, `lib/db/schema.ts`, and
Handbook `10`/`14`, and itself `Approved`).

*No ADRs are currently pending in this tier.*

## Rules

- **Claude Code must not treat every doc as equally authoritative.** Always resolve
  via the hierarchy above — a lower tier never overrides a higher tier.
- **New Sprint 1 execution should use US-ID acceptance criteria once mapped.** Do not
  build `/goal` packets directly off Phase-N plans or audit reports; those are
  evidence and history, not acceptance criteria.
- **Existing Phase-N docs are not deleted.** They must be cross-referenced from the
  relevant `docs/product/*` or `docs/execution/*` file, or explicitly marked archived,
  before being treated as superseded. Silence is not archival.
- **If a conflict exists between old phase docs and the approved sovereign product
  docs, stop and ask for architect review.** Do not silently prefer one source over
  the other, and do not resolve the conflict by guessing which is more recent — dates
  alone are not sufficient evidence of correctness in this repo (see the H5
  trainer-ownership doc in `docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`, which
  is already known to be stale on at least one factual claim).

## Current state (as of this writing)

- Tier 2 (`fitdesk-spec` skill) does not exist yet.
- Tier 3 (`docs/product/*`) exists but is not yet normalized to a US-ID structure.
- Tier 4 (`docs/execution/*`) is new as of this file; only
  `SPRINT_1_STORY_TRACEABILITY_MAP.md` exists in it so far.
- Tiers 5–7 are populated and stable, per the inventory in
  `docs/audits/PRE_FLIGHT_INVENTORY_REPORT.md`.
