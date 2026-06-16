# FitDesk Goal System — Recovery & Implementation Final Plan

```
Status: Draft restored from approved handover — requires product owner confirmation
Version: 1.0-draft
Date: 2026-06-16
Relates to: FITDESK_GOAL_SYSTEM.md (Goal System 2.0 specification)
```

---

## Purpose

This document defines the approved execution order for recovering and implementing the FitDesk Goal System 2.0. It establishes what must happen before any code changes, which phases are in scope for MVP, and hard boundaries that must not be crossed during implementation.

This is a recovery plan, not a greenfield plan. The existing codebase has a working 7-goal system, a wired Add Client flow, and 150+ passing tests. The goal is to evolve the system without breaking any of that.

---

## Hard Rules

These apply to every phase of this plan. Violating any of them requires explicit product owner approval.

1. **No implementation before spec approval.** Do not write goal-system code until `FITDESK_GOAL_SYSTEM.md` has been confirmed by the product owner. The draft status on that document means it is not yet approved.
2. **No billing or scheduling changes.** The Goal System touches neither the billing model (`BillingMode`, payment providers, invoice flow) nor the scheduling engine (`lib/scheduling/engine.ts`, session booking). These are out of scope.
3. **No Client Hub or Dashboard redesign.** Goal System 2.0 adds a goal card and a safety panel to the existing Client Hub. It does not redesign the hub layout, the dashboard command center, or the action center.
4. **No ERP schema changes without approval.** The ERP `Customer` DocType stores `custom_fitness_goals` as a free-text field. Changing that field type or adding new ERP custom fields requires explicit approval from the product owner and must go through the approved ERP execution service path.
5. **No new auth systems, no new services.** The goal system uses the existing Drizzle/libsql local store, the existing ERP proxy, and the existing Better Auth session. No new services, queues, or databases.
6. **No hardcoded goal mappings in UI components.** All goal constants live in `lib/goals/constants.ts` after Phase 4.1. UI components import from there.
7. **No fifth goal system.** The codebase has had multiple competing implementations (GoalSelect, GoalMultiSelect, GoalWithSubGoal, MultiGoalSelector). This plan consolidates to exactly one system. Do not introduce new goal selector variants.
8. **No automatic side effects on Add Client.** The Add Client flow must not auto-send WhatsApp messages, auto-create invoices or sessions, or auto-run billing logic. The existing guardrails must be preserved.
9. **No duplicate constants.** Goal IDs, goal labels, category groupings, sub-goal lists, and safety flag triggers must live in `lib/goals/constants.ts` only. No copies, no inline duplicates, no re-definitions in UI components, actions, or tests. All consumers import from the canonical module.
10. **No direct ERP bypass.** All ERP I/O must go through the approved `erpFetch` proxy path (`lib/erpnext/client.ts`). Goal-system code must not call ERPNext DocType APIs directly, must not construct raw Frappe API URLs, and must not write to ERPNext from client components or outside the approved server-side path.

---

## Approved Execution Order

### Phase 1 — Finish Goal System Specification

**Prerequisite to all subsequent phases.**

| Task | Owner | Status |
|---|---|---|
| Write `docs/product/FITDESK_GOAL_SYSTEM.md` (19-goal taxonomy, sub-goals, safety, conflicts, ProgramGoal, AI rules, UX rules, acceptance criteria) | Engineering | Draft written 2026-06-16 |
| Product owner reviews and confirms the taxonomy | Product | Pending |
| Product owner confirms ProgramGoal list (including `youth_physical_literacy`, `neuro_centric_movement`) | Product | Pending |
| Product owner confirms conflict rules and safety flag triggers | Product | Pending |
| Write `docs/product/FITDESK_GOAL_SYSTEM_RECOVERY_FINAL_PLAN.md` (this document) | Engineering | Draft written 2026-06-16 |
| Product owner approves this recovery plan | Product | Pending |

**Exit gate:** Both documents exist in `docs/product/`, are confirmed (not draft), and the product owner has explicitly approved.

---

### Phase 2 — Fix Add Client Parity

**Independent of Goal System 2.0. Can be merged before Phase 3.**

This phase fixes two confirmed functional regressions in the existing Add Client paths. It does not change the goal taxonomy.

| Task | Risk | Notes |
|---|---|---|
| Add billing mode selector to `/dashboard/clients/new/page.tsx` | Low | Sheet already has it; page is missing it; ERP defaults to "Package" when omitted |
| Add `showWhatsApp` prop to `PhoneInput` on `/clients/new` | Low | Sheet passes it; page does not; WhatsApp flag defaults to false on legacy path |
| Ensure parity in success-state navigation links between sheet and page | Low | Sheet has 3 links; page has 2 |

**What Phase 2 does NOT touch:**
- Goal taxonomy
- Schema
- AI parse
- ERP custom fields

**Exit gate:** Both Add Client paths (AddClientSheet and `/clients/new`) produce identical ERP payloads for billing mode and WhatsApp flag. Existing tests pass. `build:verify` clean.

---

### Phase 3 — Duplicate System Cleanup Sprint

**Prerequisite: Phase 2 merged. Can be done in parallel with Phase 1 confirmation.**

This phase eliminates confirmed dead code and duplicate source-of-truth risks identified in the codebase audit. It makes the codebase clean before the Goal System 2.0 code lands.

| Task | Risk | Notes |
|---|---|---|
| Delete `components/modules/dashboard/MoneySnapshot.tsx` (dead component) | Very low | Not imported anywhere; superseded by BusinessHealth |
| Delete `components/modules/StatCard.tsx` (dead component) | Very low | Exported in barrel but never consumed |
| Delete `components/clients/SmartClientPicker.tsx` (dead component) | Very low | Never imported anywhere |
| Remove `addSession` / `removeSession` deprecated aliases from `actions/sessions.ts` | Low | Confirmed dead by grep |
| Remove `getDashboardMetrics()` dead function from `lib/business-data/index.ts` | Low | Never called anywhere |
| Extract `resolveTrainerId()` to `lib/auth/resolve-trainer.ts` | Low | Currently copied 4× |
| Extract `fmtMoney()` to `lib/format/money.ts` | Low | Currently copied 5× |
| Fix `OUTSTANDING_STATUSES` in `lib/clients/list-derive.ts` to import `isOutstandingInvoiceStatus` | Low | Duplicate source of truth |
| Consolidate `PaymentProvider` type to `types/index.ts` only | Low | Defined 3× |
| Extract `e164ToPhoneValue()` shared by both Add Client paths | Low | Identical copy in 2 files |

**What Phase 3 does NOT touch:**
- Goal taxonomy or goal components
- Schema
- AI parse logic (only the drift-guard test)

**Exit gate:** All dead code removed. All duplicate types consolidated. All existing tests pass. `build:verify` clean.

---

### Phase 4 — Implement Goal System 2.0

**Prerequisite: Phase 1 spec confirmed and approved. Phases 2 and 3 merged.**

This is the main implementation phase. It is broken into sub-phases that are sequenced carefully to avoid breaking the live system.

#### Phase 4.1 — Canonical taxonomy module

| Task | Notes |
|---|---|
| Create `lib/goals/constants.ts` | Export `GOALS` (19 entries with id, label, category), `GoalValue`, `GOAL_CATEGORIES`, `SUB_GOALS` map, `GOAL_SAFETY_FLAGS` map |
| Update `components/ui/GoalSelect.tsx` to import from `lib/goals/constants.ts` | Remove self-defined `GOALS` const; pure re-export or import |
| Update `components/ui/GoalMultiSelect.tsx` to import from `lib/goals/constants.ts` | Remove self-defined imports from GoalSelect |
| Update `lib/clients/ai-parse.ts` to derive `AI_PARSE_ALLOWED_GOALS` from `lib/goals/constants.ts` | Remove manual copy; update drift-guard test |
| Create `lib/goals/program-map.ts` | `ProgramGoal` type + `intake_goal_program_mapping` static object |

**No schema changes in this sub-phase. No UI changes beyond import paths.**

**Exit gate:** `GoalSelect` and `GoalMultiSelect` work identically to before. AI parse drift-guard test passes. `build:verify` clean. All existing tests pass.

#### Phase 4.2 — Database and mapping updates

| Task | Notes |
|---|---|
| Add `is_primary INTEGER NOT NULL DEFAULT 0` column to `client_goal` table | Additive migration — `ALTER TABLE` in `scripts/migrate-app.mjs` |
| Add `trainer_sub_goal_ids_json TEXT NOT NULL DEFAULT '[]'` column to `client_goal` table | Additive migration |
| Backfill existing `client_goal` rows: set `is_primary = 1` where `goalId` matches `client_index.primary_goal_id` | One-time migration step |
| Update `lib/db/schema.ts` to reflect new columns | Drizzle schema update |
| Update `ClientGoal` type in `types/clients.ts` to include `isPrimary` and `trainerSubGoalIds` | Type update |
| Update `ClientRepository.createClientRow()` to accept multiple goal drafts and write one row per goal | Core logic change |
| Update `buildClientCreateDraft()` in `create-draft.ts` to pass all goal IDs, not just the first | Logic change |

**Approval required before starting:** These are schema migrations. Explicit product owner and engineering approval must be obtained before running `ALTER TABLE` commands.

**Exit gate:** New columns present in schema. Existing `client_goal` rows have `is_primary` populated correctly. Repository writes all goals from Add Client. Tests for multi-goal persistence pass.

#### Phase 4.3 — Add Client goal UX

| Task | Notes |
|---|---|
| Expand `GoalMultiSelect` to display 19 goals grouped by category (Core / Specialist / Emerging) | UI change; no schema change |
| Add primary goal designation UI (first selected = primary; trainer can change) | UI state only |
| Add sub-goals for all 19 goals (where defined in `lib/goals/constants.ts`) | Uses canonical SUB_GOALS map |
| Wire sub-goal selection to form state; ensure sub-goal values are passed to `addClient()` payload | Form → action wire-up |
| Add urgency selector per goal (optional; defaults to `active_focus` for primary, `background` for secondary) | UI + payload |

**What this sub-phase does NOT add:**
- Conflict intercepts (Phase 4.4)
- Safety gating (Phase 4.5)
- Client Hub rendering (Phase 4.7)

**Exit gate:** Add Client sheet and page both display all 19 goals. Sub-goals appear for applicable goals. Primary goal is visually designated. Urgency selector present. `build:verify` clean.

#### Phase 4.4 — Conflict intercepts

| Task | Notes |
|---|---|
| Implement conflict detection function in `lib/goals/conflicts.ts` | Pure function: `(goalIds: string[]) => ConflictResult[]` — no I/O |
| Wire conflict detection to `GoalMultiSelect` goal change handler (client-side) | Real-time; runs on every goal change |
| Add advisory conflict banner below goal section (informational; non-blocking) | UI component |
| Add warning conflict blocking banner + acknowledgement checkbox | UI component |
| Add server-side conflict check in `addClient()` action | Redundant safety net; returns error if unacknowledged warning-level conflicts reach the server |

**Exit gate:** Advisory conflicts display inline. Warning conflicts block submit. Trainer can acknowledge and proceed. Tests for conflict detection function pass.

#### Phase 4.5 — Safety trigger timing

| Task | Notes |
|---|---|
| Implement `computeSafetyFlags(goalIds: string[]): SafetyFlag[]` in `lib/goals/safety.ts` | Pure function; uses `GOAL_SAFETY_FLAGS` map from `lib/goals/constants.ts` |
| Call `computeSafetyFlags()` in `buildClientCreateDraft()` | Sets `safetyFlags` on each goal draft |
| Write safety flags to `client_goal.safety_flags_json` in `createClientRow()` | Already schema-supported |
| Compute and write `safety_state` on `client_index` in `createClientRow()` | 'needs_review' if any flag present; else 'clear' |
| Add safety flag summary to Add Client success state | Informational; trainer sees "This client has a safety check: [flag reason]" |

**What this sub-phase does NOT do:**
- Block the Add Client form (safety flags are set; no blocking at intake time)
- Send any message or take any autonomous action

**Exit gate:** Safety flags written correctly for all safety-sensitive goals. `client_index.safety_state` reflects flag presence. Tests for safety flag computation pass.

#### Phase 4.6 — Persistence validation

End-to-end validation that the full goal persistence chain works:
- Add Client form → `addClient()` action → ERP create → `buildClientCreateDraft()` → `createClientRow()` → `client_goal` rows + `client_index` → `ClientRepository.listGoals()` → Client Hub

**Exit gate:** Integration test: create a client with 2 goals + sub-goals → verify exactly 2 `client_goal` rows with correct `is_primary` values, correct `sub_goal_ids_json`, correct `safety_flags_json`, correct `client_index.safety_state`. All 150+ existing tests pass.

#### Phase 4.7 — AI parsing for 19 goals

| Task | Notes |
|---|---|
| Update `buildParsePrompt()` in `lib/clients/ai-parse.ts` to list all 19 canonical goal IDs | Prompt update; model remains `claude-haiku-4-5-20251001` |
| Update AI parse test suite with 19-goal drift guard | Replace hardcoded 7-goal list with derivation from `lib/goals/constants.ts` |
| Validate AI parse can correctly identify new goals (manual smoke test) | Not automated; spot-check with example trainer text |

**Exit gate:** AI parse drift-guard test passes with 19 goals. Existing parse tests pass. `build:verify` clean.

#### Phase 4.8 — Client Hub and reporting hooks

| Task | Notes |
|---|---|
| Render primary goal card in `ClientHubPanel` (goal label, urgency badge, sub-goals, program recommendation) | Feature-flag-gated by `FITDESK_CLIENT_HUB_ENABLED` |
| Render secondary goals list below primary card | Same flag |
| Render safety review panel when `safety_state = 'needs_review'` | Same flag |
| Wire "Log safety note" action to create `client_event` of type `safety.reviewed` | New server action; no ERP write |

**What this sub-phase does NOT do:**
- Redesign the Client Hub layout
- Change the action intent queue
- Add program creation or session creation

**Exit gate:** Client Hub shows goal card and safety panel correctly. Safety review action creates the event. Flag-gated; existing hub tests pass.

---

## MVP / Production-Hardening / Future Architecture Split

### MVP (required before production rollout of Goal System 2.0)

Everything in Phases 4.1 through 4.8 above.

### Production hardening (after initial rollout)

- Backfill script for goal data on existing ERP clients (normalize `custom_fitness_goals` → structured `client_goal` rows for all pre-existing clients)
- Goal edit UI on the client detail page (change primary goal, add/remove secondary goals, change sub-goals)
- Goal archive UI (soft-delete secondary goals)
- Safety note edit and history view
- Conflict acknowledgement audit events

### Future architecture (deferred — requires further planning and approval)

- `intake_goal_program_mapping` as a database table (queryable at runtime, per-tenant customizable)
- Program template CRUD for trainers (self-service program library)
- Goal progress tracking (weight logged, strength benchmarks, session completion rates)
- Goal recommendation engine (AI suggests goals based on conversation transcript)
- Multi-trainer goal visibility (clinic/gym multi-trainer model)

---

## Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Spec not confirmed before Phase 4 implementation starts | Critical | Phase 1 exit gate is hard: no Phase 4 code until product owner confirms spec |
| R2 | Schema migration breaks existing `client_goal` rows | High | Additive-only DDL; backfill sets `is_primary` from existing `primary_goal_id`; integration test validates |
| R3 | 19-goal expansion breaks AI parse drift-guard test | Medium | Test is designed to catch this; fix is immediate (update allowed list or derivation) |
| R4 | Conflict intercepts block a valid Add Client | Medium | Advisory conflicts never block; warning conflicts require explicit acknowledgement, not refusal |
| R5 | Safety gate creates a two-step add flow that trainers abandon | Medium | Safety flags are informational at add time; the gate is deferred to the Client Hub review flow |
| R6 | GoalMultiSelect with 19 goals is too long on mobile | Medium | Category grouping + progressive disclosure (Emerging goals collapsed by default); test on 375px viewport |
| R7 | ERP `custom_fitness_goals` cannot represent 19 goals cleanly | Low | Field is already free-text JSON; 19-goal JSON array is valid; `formatGoal()` already handles arrays |

---

## Do Not Touch (during this recovery plan)

| Area | Reason |
|---|---|
| `lib/erpnext/client.ts` — erpFetch / JWT / DocType constants | ERP boundary; any change requires separate approval |
| `lib/auth.ts` / Better Auth wiring / `middleware.ts` | Auth boundary; CLAUDE.md §4 |
| `actions/invoices.ts` / `lib/payments/*` / `lib/invoices/*` | Payment logic; CLAUDE.md §4 |
| `lib/tenant/context.ts` | Tenant resolution |
| `lib/scheduling/engine.ts` / `actions/sessions.ts` | Scheduling — out of scope |
| Existing migration SQL statements | Append-only; never alter shipped DDL |
| `provisioning-agent`, `erp-execution-service`, `provisioning_api`, `control-plane` | Repo boundary |
| `scripts/start-with-migrations.mjs` | Boot script; append-only |
