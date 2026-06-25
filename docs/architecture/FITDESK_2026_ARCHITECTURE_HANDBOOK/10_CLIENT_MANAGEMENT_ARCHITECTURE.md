# 10 — Client Management Architecture

> **Purpose:** Document the ERP-authoritative hybrid client model, the local projection/index layer,
> and duplicate detection / Client Hub behavior.
> **Last verified:** 2026-06-25 · **Authority:** `ADR-001`, `ADR-UX-010`.

## Scope

`actions/clients.ts`, `lib/clients/*`, `lib/db/schema.ts`, `types/clients.ts`, and the client UI
(`app/dashboard/clients/*`, `components/modules/ClientsView.tsx`,
`features/clients/components/ClientWorkspaceOverlay.tsx`).

## Current known state

### VERIFIED FACTS (confirmed by reading current repo 2026-06-25)

- **ERPNext `Customer` is the canonical client identity** (ADR-001). Invoices/payments/messages depend
  on the ERP Customer docname.
- **Local enrichment files exist on disk** (verified by file listing 2026-06-25):
  `lib/clients/{ai-parse,backfill,create-draft,directory-map,directory,duplicates,hub-map,hub,list-derive,phone,repository}.ts`
  and their test counterparts under `lib/clients/__tests__/`.
  `lib/db/schema.ts` contains the `clientIndex`, `clientGoal`, `clientActionIntent`, and `clientEvent`
  Drizzle table definitions.
- **`addClient` is fully wired** (confirmed by reading `actions/clients.ts` 2026-06-25):
  ERP-first via `createClient()` → proxy, then synchronously creates local rows via
  `ClientRepository.createClientRow()`. Duplicate-check, goal sanitization, billing-mode mapping,
  and `completeClientAction`/`dismissClientAction` are also fully implemented.
  **Do not re-implement any of these** — they exist and are wired.
- **Real vs. not-yet-real fields** (live ERP read, `normalizeClient`): real = id, name, phone, goal
  (JSON-in-text), notes, createdAt, plus invoices/outstanding on detail. Made real where ERP provides:
  email, status. Still **not faked**: `sessionCount` (hidden/deferred — see `11`/`09`).
- **Pilot flags OFF:** `FITDESK_CLIENT_DIRECTORY_LOCAL_READ`, `FITDESK_CLIENT_HUB_ENABLED` default OFF.

### PLANNING-CONTEXT (from prior session — not re-verified in this session)

- **"~150 tests green"** — reported in a prior planning session. The test files exist on disk
  (see file list above). **Tests were NOT re-run** in this verification session; treat the count as
  indicative, not current. Re-run `npx vitest run lib/clients` before relying on this claim.
  If tests fail, do not treat the local layer as production-ready.

## Architecture rules

### Identity model (ADR-001)
```text
ERPNext Customer  = canonical business client identity
client_index.erpCustomerId = ERPNext Customer docname (required for active/billable clients)
client_index.tenantId      = WorkspaceProvisioning.tenantId
Local tables = fast UX layer + goals + action queue + hub state + audit enrichment (NOT financial truth)
```

### Create flow (synchronous, ERP-first — no early success)
```text
validate → tenant-scoped duplicate check → trainer confirms → create ERP Customer (proxy)
→ receive docname → create local rows (client_index/goal/action_intent/event) → open Client Hub
```
- Add Client must **not** create invoices, payment entries, WhatsApp sends, sessions, or programs.

### Failure behavior (ADR-001)
- ERP create fails → no local rows; recoverable error; retry.
- ERP succeeds, local fails → **do not delete the ERP Customer**; log; recoverable error; repair via backfill.
- Later projection fails → log; do not roll back the domain action; reconcile via backfill.

### Local-table rules
- **Every local query is tenant-scoped** (`assertTenantId`). Duplicate detection is tenant-scoped only.
- Backfill is a **manually triggered, idempotent** CLI/script run once per tenant before its directory
  goes live (`tenantId + erpCustomerId` keyed; never duplicates; never deletes ERP Customers).

### Duplicate detection & Client Hub
- Duplicate detection runs pre-create, tenant-scoped (phone-normalized), with an audited override.
- Client Hub (ADR-UX-010) is the per-client workspace; overview/hub state lives in local tables, not ERP.

## Do-not-touch areas (protected — see `00`)

- The `addClient` ERP→local chain and the `erpFetch` boundary.
- Manual "+ Invoice" on client detail is intentionally **hidden** (billing-UX decision); do not reintroduce.
- Goal taxonomy (canonical goal/sub-goal IDs + AI-parse allow-list) — data contract.
- Single-trainer IDOR invariant — no new by-id mutations without ownership scoping.

## Open decisions

- When to flip `FITDESK_CLIENT_DIRECTORY_LOCAL_READ` / `FITDESK_CLIENT_HUB_ENABLED` ON (post-pilot).
- Email **edit** write-path: email is read-only/hidden for edit until the ERP round-trip is audited.
- Future local-first identity / outbox / background sync — explicitly **deferred** (ADR-001).

## Verification checklist

- [ ] ERP Customer remains canonical; `erpCustomerId` stored for active/billable clients.
- [ ] Add Client uses the approved proxy path; no creds; no invoices/payments/sessions created.
- [ ] Every local client query is tenant-scoped; duplicate detection tenant-scoped.
- [ ] Local-row failure after ERP success is recoverable via backfill.
- [ ] No `sessionCount`/email shown as real unless truly sourced.
- [ ] **`npx vitest run lib/clients` passes** before treating the local layer as production-ready
      (planning-context "~150 tests green" must be confirmed against current `main`).

## Target architecture: Goal System & Program Design

> **Status:** TARGET ARCHITECTURE — not current implemented state.
> Source documents (on disk):
> - `docs/product/FITDESK_GOAL_SYSTEM.md` — 19-goal taxonomy, sub-goals, safety interactions, conflict rules, ProgramGoal mapping, Smart Accordion UX contract. Status as of 2026-06-25: spec written; **pending product owner confirmation before any Phase 4 implementation**.
> - `docs/product/FITDESK_GOAL_SYSTEM_RECOVERY_FINAL_PLAN.md` — phased implementation plan (Phases 4.1–4.8). Status: draft; pending approval.
>
> **Do not implement any Phase 4 code until `FITDESK_GOAL_SYSTEM.md` is confirmed by the product owner.**

### Long-term data model (full chain)

```text
ERPNext Customer                      ← billing/business identity (canonical, ERP)
  └─ client_index                     ← local read model / UX projection
       └─ client_goal                 ← per-goal record (multi-goal, one primary)
            └─ client_sub_goal        ← normalized sub-goals (long-term target; MVP uses JSON columns)
  └─ intake_goal_program_mapping      ← sole approved IntakeGoal → ProgramGoal mapping table
  └─ client_program                   ← trainer-created or generated program (future)
       └─ program_phase               ← mesocycle / block (future)
            └─ program_workout        ← individual workout session template (future)
                 └─ exercise_prescription ← prescribed exercise, sets/reps/load/tempo (future)
                 └─ progress_log      ← logged actual performance per set (future)
```

The `client_goal` and `client_sub_goal` tables sit between the client identity layer and the program layer. They are the structured input that program generation consumes. They are **not** the program itself; the program chain (`client_program` → `progress_log`) is a separate future platform concern.

### Goal System rules (binding — `00` protected)

1. **ERPNext Customer remains the official client and billing identity.** Goal data is a local enrichment layer; it does not modify ERP Customer records or create ERP financial documents.
2. **`client_index` remains the local read model / UX projection.** It carries `primaryGoalLabel` / `primaryGoalId` as denormalized fast-path fields; the canonical per-goal record lives in `client_goal`.
3. **`client_goal` stores: selected goals, exactly-one-primary (`is_primary`), urgency, safety state, and goal-level trainer notes.** Exactly one `is_primary = true` per client at any time — enforced at repository write time, not only by the UI.
4. **`client_sub_goal` is the long-term normalized model** for the 19-goal / ~190-sub-goal system. MVP may use `sub_goal_ids_json` and `trainer_sub_goal_ids_json` TEXT columns inside `client_goal` as a transitional measure. Sub-goals must be normalized into `client_sub_goal` rows before advanced reporting or program generation goes live.
5. **`intake_goal_program_mapping` is the only approved way to map intake goals to program goals.** All `IntakeGoal → ProgramGoal` resolution must go through `lib/goals/mapping.ts` (code-backed for MVP; database-backed in future). No inline `switch`/`if-else` mapping chains in the program builder or UI components.
6. **Program generation must consume structured goals, sub-goals, safety state, and trainer notes** — not guess from free text. `custom_fitness_goals` (ERP field) is a legacy capture field, not a program generation input.
7. **Program generation must not guess from free text only.** If structured goal data is absent, the program builder must surface an explicit "no structured goals — configure goals first" state.
8. **Program generation must not hardcode mapping rules inside UI components.** All goal constants, mapping rules, conflict rules, and safety flag triggers live in `lib/goals/taxonomy.ts`, `lib/goals/mapping.ts`, `lib/goals/conflicts.ts`, and `lib/goals/safety.ts`.
9. **Rehab and postnatal goals must trigger safety gating before program generation.** Selecting `rehab` or `postnatal` must transition `client_index.safety_state` to `needs_review` or `blocked_downstream` at goal-save time — not deferred to first program generation attempt. A client with `safety_state = blocked_downstream` must not reach the "generate program" action.
10. **MVP may temporarily use JSON-backed `subGoalIds`**, but production architecture must normalize sub-goals into `client_sub_goal` rows before enabling advanced reporting, program generation, or per-sub-goal progress tracking.

### Goal structure (19 intake goals, two-layer sub-goals)

The canonical taxonomy lives in `docs/product/FITDESK_GOAL_SYSTEM.md` and is implemented in `lib/goals/taxonomy.ts`:

- **19 `IntakeGoal` values** across three sections: Core (goals 1–8), Specialist (goals 9–16), Emerging 2026 (goals 17–19).
- **~190 sub-goals** split into two layers:
  - `primary` (client-stated) — what the client says during intake.
  - `secondary` (trainer-assessed) — what the trainer identifies via screening/assessment.
- **12 `ProgramGoal` values** — the base programming engine tracks. 7 of 19 intake goals map `approximate`; the `programmingBias` metadata preserves intent specificity within a shared track.
- **Conflict rules** — two known pairs: `fat-loss + muscle` (soft/advisory) and `underweight + fat-loss` (hard/blocking). Checked at repository write time, not only in the UI.
- **Safety interactions** — `rehab` and `postnatal` carry mandatory `SAFETY_GATING` triggers (see rule 9 above and `docs/product/FITDESK_GOAL_SYSTEM.md` §10).

### Note / timeline architecture (multi-level)

| Type | Storage | Notes |
|---|---|---|
| Client-level note timeline | `client_event` (type `note.*`) | Chronological, tenant-scoped, linked to `client_index` |
| Goal-level trainer notes | `client_goal.trainer_notes` | Free text per goal; context / history / medical flags |
| Session-level notes | PT Session `notes` field in ERP | Passed via `completeSession()` |
| Program-level notes | `client_program` (future) | Phase/workout level; deferred to Program Design platform |

### MVP vs production-hardening vs future split

**MVP (Phases 4.1–4.8 per recovery plan):**
- Canonical taxonomy module (`lib/goals/taxonomy.ts`, `mapping.ts`, `conflicts.ts`, `safety.ts`)
- Multi-goal persistence with JSON sub-goal columns (additive schema migration — approval-gated)
- Conflict intercepts (soft advisory + hard blocking)
- Safety gating at goal-save time (`needs_review` / `blocked_downstream` written to `client_index`)
- AI parse expanded to 19 goals
- Client Hub goal cards + safety review panel (flag-gated)

**Production hardening (post-rollout):**
- Sub-goal normalization into `client_sub_goal` rows; backfill script for pre-existing ERP clients
- Goal edit / archive UI; safety note history view; conflict acknowledgement audit events

**Future platform (requires separate planning and approval — not in cleanup program):**
- `client_program → program_phase → program_workout → exercise_prescription → progress_log`
- Workout plan generation per client (AI-assisted or template-based)
- AI-driven goal recommendation; multi-trainer goal visibility; per-tenant taxonomy customization

## Related files

- `actions/clients.ts`, `lib/clients/{repository,phone,duplicates,backfill,directory,hub,ai-parse,create-draft,list-derive}.ts`,
  `lib/db/schema.ts`, `types/clients.ts`, `lib/erpnext/client.ts:normalizeClient`.
- `lib/goals/{taxonomy,mapping,conflicts,safety}.ts` — Goal System modules (implemented; feed into Phase 4 target).
- `docs/product/FITDESK_GOAL_SYSTEM.md` — canonical 19-goal taxonomy spec (source for target architecture above).
- `docs/product/FITDESK_GOAL_SYSTEM_RECOVERY_FINAL_PLAN.md` — phased implementation plan (Phases 4.1–4.8).

## Related ADRs

- `ADR-001` (controlling), `ADR-UX-010` (Client Hub workspace).
- **Missing: `ADR-PROG-001`** — Program Design / Goal System architecture. To be written after product owner confirms `FITDESK_GOAL_SYSTEM.md`. See `14`.

## Next actions

- Keep pilot flags OFF until directory/hub QA; audit the email write-path before enabling email edit.
- **Await product owner confirmation of `FITDESK_GOAL_SYSTEM.md`** before starting Goal System Phase 4 implementation.
- Write `ADR-PROG-001` once spec is confirmed; record the full goal → program chain decision.
