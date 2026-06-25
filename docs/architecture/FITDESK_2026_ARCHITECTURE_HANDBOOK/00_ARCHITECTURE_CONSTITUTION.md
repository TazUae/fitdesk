# 00 — Architecture Constitution

> **Status:** Binding · **Last verified:** 2026-06-25
> This document defines the non-negotiable rules of FitDesk. Other handbook documents may add
> detail but may not contradict this one. If a proposed change conflicts with the Constitution,
> **stop and escalate** — do not "fix forward."

## Purpose

Establish the small set of rules that must hold true regardless of feature pressure, deadline,
or convenience — and enumerate the areas that may not be touched without explicit owner approval.

## Scope

All FitDesk product code, configuration, docs, and deployment. Where FitDesk integrates with the
Control Plane, Provisioning Agent, ERP Execution Service, or ERPNext/Frappe, the workspace-level
`CLAUDE.md` rules also apply and the stricter rule wins.

## Current known state

- FitDesk is a Next.js (App Router) product app; ERPNext/Frappe is the system of record.
- ERP access is brokered through the Control Plane proxy via a signed JWT (no ERP credentials in FitDesk).
- Better Auth is the only frontend auth system; every authenticated user maps to exactly one Trainer.
- The cleanup program (`02`/`03`) has **not** started; several decisions remain open (`01`, `09`).

## Architecture rules (non-negotiable)

1. **ERPNext is the single source of truth** for clients, sessions, invoices, payments. No
   duplicate financial truth may live in FitDesk-owned storage.
2. **No ERP credentials in FitDesk.** Ever. Not in code, env consumed by the browser, or logs.
3. **All ERP I/O goes through the ERP client → Control Plane proxy.** No direct ERPNext calls,
   no proxy bypass, no new ERP HTTP client.
4. **No business/financial logic in the Provisioning Agent.** It stays a thin relay.
5. **No fake data in the UI.** A value is either real (sourced through the proxy) or hidden.
   Stubs must be visibly inert, never presented as real.
6. **Mobile-first.** Critical actions in ≤ 2–3 taps; no dense desktop tables on small screens.
7. **Token-only styling** (see `07`). No arbitrary color/spacing values outside approved tokens.
8. **Server-side integrations only.** No ERP/payment/WhatsApp calls from client components.
9. **Atomic, reversible commits.** Each commit builds and passes its checks; each phase has a
   rollback (tag/branch) before it starts.
10. **Tracked = deployable.** Untracked ERP/Frappe app files are a deployment risk and must be
    committed or removed deliberately — never shipped implicitly.

## Do-not-touch areas (require explicit owner approval)

These are **protected**. Changes here are gated, not routine:

- **ERP proxy path** — `lib/erpnext/client.ts:erpFetch()` → Control Plane `/api/erp/doctype/*`.
  The HMAC-JWT signing, the `tenantId` claim, and the Host-header forwarding behavior are load-bearing.
- **Billing / payment logic** — invoice submission, Payment Entry creation, provider abstraction
  (Whish/Cash/Bank Transfer), "mark paid" verification. Manual invoicing is intentionally hidden in
  the trainer UX. Session-billing coupling (package decrement on completion; PPS invoice-on-completion;
  no-show trainer confirmation) is governed by the Billing & Session Outcome Contract in `09` and must
  **never be silently removed** during scheduling cleanup (F0/F1/G/H). Any commit touching
  `actions/sessions.ts`, the ERP session adapter, or the scheduler engine must verify the billing
  hook chain is intact before merging.
- **Client creation flow** — the synchronous `addClient` chain (ERP Customer create → local
  `client_index`/`client_goal`/`client_action_intent`/`client_event`). No early success; ERP-first.
  Governed by `ADR-001`.
- **Goal taxonomy and program generation safety rules** — the canonical `IntakeGoal` / `ProgramGoal`
  enums, sub-goal definitions, conflict rules, and AI-parse allow-list all live in `lib/goals/`.
  Renaming or pruning a goal/sub-goal ID is a data-contract change requiring backfill of all
  `client_goal` rows referencing the old ID. The mapping table (`intake_goal_program_mapping` /
  `lib/goals/mapping.ts`) is the **only** approved `IntakeGoal → ProgramGoal` resolution path —
  inline mapping chains in UI components or the program builder are prohibited. Postnatal and rehab
  safety gates must fire at goal-save time, not at program-generation time; a client with
  `safety_state = blocked_downstream` must not reach the program generation action.
- **Scheduling engine — frozen until F0.** No deletion of `scheduler/*` branches or scheduling
  components until the F0 UX Archaeology Audit (`09`) has documented what UX would be lost.
- **Production deployment** — branch/push/Dokploy rules below. No production server edits.

## Production deployment rules (binding)

- Deploy flow is **commit → push → Dokploy deploys from Git**, per service.
- **No push without explicit instruction.** No force-push. No rebasing/amending shared history.
- **No production server edits**, no production env mutation, no production container restarts
  without approval. VPS debugging starts read-only.
- Local Docker success is **not** proof of VPS/Dokploy success.

## Open decisions

- Whether any Constitution rule needs a documented, time-boxed exception for a specific phase
  (default: none).

## Verification checklist

- [ ] The change keeps ERP as source of truth and introduces no duplicate financial store.
- [ ] No ERP credential is added anywhere reachable by the client.
- [ ] All ERP access still flows through `erpFetch()` → proxy.
- [ ] No protected area was modified without recorded approval.
- [ ] No scheduler branch/component deleted before F0.
- [ ] Commit is atomic and has a rollback path.

## Related files

- `lib/erpnext/client.ts` (proxy boundary), `actions/clients.ts` (client create), `actions/sessions.ts`.
- Workspace `CLAUDE.md`, `FitDesk/CLAUDE.md`.

## Related ADRs

- `ADR-001` (client management, ERP-authoritative hybrid).
- `ADR-UX-011` (frontend architecture), `ADR-UX-004/006` (tokens/color).

## Next actions

- Acknowledge this Constitution before Phase A.
- Promote the four missing governance ADRs (`14`) so scheduling/session, source-control, token,
  and deployment rules each have a formal ADR backing this document.
