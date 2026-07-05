# Phase 9 — Goal UX Default Decision

- **Date:** 2026-07-05
- **Phase:** 9B (decision + docs only — no runtime code changed)
- **Author:** Claude Code
- **Predecessor:** Phase 9A — read-only Goal System UX audit (passed)
- **Related spec:** [`FITDESK_GOAL_SYSTEM.md`](FITDESK_GOAL_SYSTEM.md), [`FITDESK_GOAL_SYSTEM_RECOVERY_FINAL_PLAN.md`](FITDESK_GOAL_SYSTEM_RECOVERY_FINAL_PLAN.md)

---

## Status: **Decided — documented default confirmed. No runtime change.**

The intended production default is **already clearly documented in the repo**, so this run records it rather than inventing or changing it. Product-owner confirmation is **not required** to keep the current default; it is required only to *promote* the experimental path (see "Promotion path" below).

---

## Decision

**`GoalAccordion` is the production default Goal UX.** `AddClientGoalWorkspace` remains an **experimental, flag-gated** path (Phase 4D) behind `NEXT_PUBLIC_GOAL_WORKSPACE`.

### Evidence (repo is authoritative)

| Signal | Source | Finding |
|---|---|---|
| Feature-flag documentation | [`.env.example:19-22`](../../.env.example) | "*Set to 1 to enable the Pop-and-Split Goal Workspace in Add Client (Phase 4D). Unset or 0 = legacy GoalAccordion (**default, safe for production**).*" The flag line ships **commented out** → default is unset → GoalAccordion. |
| Runtime gate | `components/clients/AddClientForm.tsx` | `const GOAL_WORKSPACE_ENABLED = process.env.NEXT_PUBLIC_GOAL_WORKSPACE === '1'` — renders `GoalAccordion` unless the flag is exactly `'1'`. |
| Convergent server contract | `actions/clients.ts` (`addClient`) | Both UI paths bridge to the same `SelectedGoalDraft[]` server contract. The choice is **UI-only**; server-side safety and conflict enforcement are identical either way. |

### Note on local development

The developer's local `.env.local` sets `NEXT_PUBLIC_GOAL_WORKSPACE=1`, so **local dev exercises the GoalWorkspace path**. This is a development choice and does **not** change the documented production default. Deployment environments (e.g. Dokploy) inherit the `.env.example` default (flag off → GoalAccordion) unless the flag is explicitly set there. `.env.local` is not committed and is out of scope for this decision.

---

## Why GoalWorkspace is not promoted now

Phase 9A found the experimental path is not yet production-ready to become the default:

1. **No component-level tests** exist for any `components/clients/GoalWorkspace/*` UI file (the reducer is tested; the ledger, inspector, command dialog, alerts, and notes components are not).
2. **No 375px mobile validation** — the Recovery Plan's own Risk **R6** ("test on 375px viewport") has never been executed for either selector.
3. **Desktop-first interaction** — the `Cmd/Ctrl+K` command palette is a power-user pattern unverified against the mobile-first "PT on a phone between sessions" persona in `CLAUDE.md`.
4. **Consolidation is a product decision, not an implementation slice** — Recovery Plan **Hard Rule #7** ("exactly one goal system") means merging or replacing the two selectors needs explicit product-owner sign-off.

Both paths are functionally complete and converge on the same hardened server contract, so keeping GoalAccordion as the safe default carries **no functional loss** while GoalWorkspace matures behind the flag.

---

## Promotion path (future — requires product-owner sign-off)

To promote `GoalWorkspace` to the production default:

1. Add component-level tests for the `GoalWorkspace` UI files.
2. Complete mobile / 375px QA for the goal-selection flow (closes Risk R6).
3. Obtain explicit product-owner approval to change the default.
4. Flip the default in `.env.example` (and the deployment environment).
5. Later, once stable, remove `GoalAccordion` and the `NEXT_PUBLIC_GOAL_WORKSPACE` flag to satisfy Hard Rule #7 ("exactly one goal system").

## Forward-looking product options (not blocking this run)

This run documents the **status quo** the repo already encodes. Whenever the product owner revisits the default, the choices are:

- **A. Keep `GoalAccordion` as the pilot default** *(status quo — recommended until the promotion criteria above are met).*
- **B. Promote `GoalWorkspace`** once the promotion path is complete.
- **C. Keep `GoalWorkspace` experimental behind the flag indefinitely.**

No option is selected here beyond recording the current, already-documented state (A/C).

---

## Scope guarantees for Phase 9B

- **No runtime code changed.** No component, reducer, server action, `lib/goals/*`, `lib/clients/create-draft.ts`, `actions/clients.ts`, `types/clients.ts`, schema, or migration was edited.
- **`.env.example` unchanged.** The default is already correct and documented; no product-owner confirmation to change it was given in this run.
- **Server-side safety enforcement unchanged.** Hard-conflict rejection in `addClient` and postnatal/rehab safety gating at goal-save time are exactly as shipped.
- This run is limited to this decision record plus the conflict-spec reconciliation in [`FITDESK_GOAL_SYSTEM.md`](FITDESK_GOAL_SYSTEM.md) §7.
