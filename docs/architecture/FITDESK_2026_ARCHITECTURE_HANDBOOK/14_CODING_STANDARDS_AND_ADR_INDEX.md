# 14 — Coding Standards & ADR Index

> **Purpose:** Capture the coding standards in force and index every ADR — including the ADRs that
> are **missing** and should be written.
> **Last verified:** 2026-06-25 · **Authority:** `FitDesk/CLAUDE.md`, the `ADR-UX` suite, `ADR-001`.

## Scope

FitDesk code conventions and the architecture-decision record set.

## Current known state (verified)

- TypeScript strict mode; no `any`; explicit interfaces for core entities; typed action/adapter returns.
- Server-side-only integrations; normalize/validate external payloads at the boundary.
- Typed `ActionResult<T>` success/error pattern (see `actions/sessions.ts`, `actions/clients.ts`).
- Tests use vitest (`lib/clients` ~150 tests; scheduling engine tested).
- On-disk ADRs: `ADR-001` and `ADR-UX-001…011`. **No `ADR-SCH-*`**, no source-control/token/deploy/program ADRs.
- On-disk product specs (non-ADR but authoritative for target architecture):
  - `docs/product/FITDESK_GOAL_SYSTEM.md` — 19-goal taxonomy, sub-goals, safety, ProgramGoal mapping, Smart Accordion UX. Status: spec written 2026-06-16; **pending product owner confirmation**.
  - `docs/product/FITDESK_GOAL_SYSTEM_RECOVERY_FINAL_PLAN.md` — implementation plan Phases 4.1–4.8. Status: draft pending approval.
  - **No Phase 4 implementation** until both docs are product-owner confirmed.

## Architecture rules (coding standards)

1. **TypeScript:** `"strict": true`; never `any`; explicit interfaces for `Trainer`, `Client`,
   `Session`, `Invoice`, `Payment`; type-guard/validate all external payloads.
2. **Returns:** every action/adapter returns a typed success or error result; never fail silently.
3. **Boundaries:** server-side only for ERP/payments/WhatsApp; normalize before the UI.
4. **Errors:** log integration errors with timestamp, user/tenant id, action, result; payment/WhatsApp
   failures surface in the UI; logs are scrubbed of secrets.
5. **Styling:** token-only (`07`); no arbitrary values.
6. **Frontend layering:** per `ADR-UX-011` (`06`); no `UI → ERP` access.
7. **Commits:** atomic, reversible, build-green (`03`).

## ADR Index

### On disk (authoritative)
| ADR | Title | Governs |
|---|---|---|
| ADR-001 | Client Management — ERP-Authoritative Hybrid | `10`, client create/identity |
| ADR-MKT-001 | Workspace Operating Market Authority | Payment-method market eligibility; `Tenant.country` vs `operatingMarket` separation |
| ADR-UX-001 | Design System Foundation | `07` |
| ADR-UX-002 | Component Taxonomy | `06` |
| ADR-UX-003 | Motion Constitution | `06` |
| ADR-UX-004 | Design Tokens | `07` |
| ADR-UX-005 | Interaction Model | `06`, `11` triage |
| ADR-UX-006 | Semantic Color System | `07` |
| ADR-UX-007 | Typography & Density | `07` |
| ADR-UX-008 | Navigation & Command System | `06` |
| ADR-UX-009 | Dashboard Command Center | `11` |
| ADR-UX-010 | Client Hub Workspace | `10` |
| ADR-UX-011 | 2026 Frontend Architecture Amendments | `06` (controlling frontend blueprint) |

### Missing ADRs (should be written)
| Proposed ADR | Purpose | Handbook home |
|---|---|---|
| **ADR-SCH-001 — Scheduling/Session Truth** | Canonical scheduler engine + PT/FD Session identity + recovered UX requirements | `09` (write in F1) |
| **ADR-SRC-001 — Source Control / Worktree Policy** | Worktree lifecycle, branch cleanup, untracked-ERP, push rules | `04` |
| **ADR-TOK-001 — Design Token Governance** | One bridge/one color space; arbitrary-value prohibition; lint enforcement | `07` |
| **ADR-DEP-001 — Production Deployment Policy** | Dokploy-from-Git, push gating, no prod mutation, read-only debugging | `13` |
| **ADR-PROG-001 — Goal System & Program Design Architecture** | Canonical IntakeGoal/ProgramGoal model; sub-goal normalization path; `intake_goal_program_mapping` as sole mapping authority; safety-gate timing; `client_program` chain target | `10` (write after `FITDESK_GOAL_SYSTEM.md` is product-owner confirmed) |

## Do-not-touch areas

- ADR provenance: do not edit an approved ADR's decision in place — supersede with a new ADR.

## Open decisions

- Author/owner and target dates for the four missing ADRs.
- Whether `ADR-SCH-001` is blocked on the PT/FD Session decision (yes — it records that decision).

## Verification checklist

- [ ] New code passes strict TS, no `any`, typed returns.
- [ ] Any architecture decision made during cleanup is captured as an ADR (or supersession), not left in chat.
- [ ] The four missing ADRs are tracked.

## Related files

- `docs/adr/ADR-001-*.md`, `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-*.md`, `FitDesk/CLAUDE.md`.

## Next actions

- Write `ADR-SCH-001` during F1; backfill `ADR-SRC-001`, `ADR-TOK-001`, `ADR-DEP-001`.
