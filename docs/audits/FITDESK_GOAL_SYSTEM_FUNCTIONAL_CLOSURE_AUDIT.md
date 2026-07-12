# FitDesk Goal System — Functional Closure Audit

| | |
|---|---|
| **Product** | FitDesk |
| **Document** | Goal System Functional Closure Audit |
| **Type** | Audit — factual record of state at time of audit (per `docs/DOCUMENTATION_AUTHORITY_MAP.md`, audits document state; they do not define desired state) |
| **Date** | 2026-07-13 |
| **Repository** | `C:\Users\Lenovo\Dev\axis-erp\FitDesk` |
| **Baseline HEAD** | `3fc5911a1bc8e20413fb0b68ab80a6aa914e169b` (branch `main`, level with `origin/main`) |
| **Mode** | Read-only. No application code, tests, schema, or migrations were modified during this audit. |
| **Verdict** | **FAIL — MODERNIZATION BLOCKED** |
| **Companion** | `docs/plans/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_PLAN.md` (the remediation plan built from this audit) |

> This file persists the in-session functional-closure audit so the closure plan's baseline is reproducible. It is a faithful record of what the audit found against the baseline HEAD above; design decisions (e.g. archival vs hard-delete removal, the corrected zero-goal primary invariant) are resolved in the companion plan, not here.

---

## 1. Repository Baseline

- **Path:** `C:\Users\Lenovo\Dev\axis-erp\FitDesk` (confirmed).
- **Branch:** `main` · **HEAD:** `3fc5911a1bc8e20413fb0b68ab80a6aa914e169b` ("Merge pull request #41 from TazUae/fix/statement-payment-entry-currency-field").
- **origin/main:** same commit — 0 ahead / 0 behind.
- **Working tree:** clean except one untracked, unrelated product doc: `docs/product/FITDESK_USER_JOURNEY_MAP_2026.md`.
- No `provisioning-agent` / `erp-execution-service` / `control-plane` paths were read or touched. No `AGENTS.md` exists in this repo.

## 2. Governing Document Hierarchy

1. `CLAUDE.md` (tier 1, sovereign) — read.
2. `docs/DOCUMENTATION_AUTHORITY_MAP.md` — read.
3. `docs/product/FITDESK_GOAL_SYSTEM.md` (v1.1) — 19-goal taxonomy, sub-goal layers, conflict rules, safety interactions, Smart Accordion UX contract.
4. `docs/product/FITDESK_GOAL_SYSTEM_RECOVERY_FINAL_PLAN.md` — the operative implementation plan; it chose a JSON-column representation on `client_goal` over the taxonomy spec's original separate `client_sub_goal` table, and explicitly deferred goal-edit UI, goal-archive UI, and safety-note history to a post-MVP "production hardening" phase.
5. `docs/product/PHASE_9_GOAL_UX_DEFAULT_DECISION.md` — confirms `NEXT_PUBLIC_GOAL_WORKSPACE` ships off by default; `GoalAccordion` is the shipped production UI.
6. `docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md` — ERPNext Customer canonical; local tables are enrichment/read-model; goal edits are local; ERP failure/repair model.

No conflict requiring architect escalation was found: the Recovery Plan's JSON-column storage supersedes the taxonomy doc's `client_sub_goal` sketch, and current code matches the Recovery Plan.

## 3. Executive Verdict

**FAIL — MODERNIZATION BLOCKED.** The Goal System is not functionally closed. Two independent, code-confirmed defects each violate the required contract on their own:

1. **No update path exists.** After creation, a client's goals, primary designation, urgency, sub-goals, and trainer notes are permanently immutable — no repository method, server action, or reachable UI changes them.
2. **The shipped production-default UI silently loses data at creation.** With `NEXT_PUBLIC_GOAL_WORKSPACE` unset (the real default), a trainer can configure multiple goals in `GoalAccordion`, but only the single primary goal reaches the server, and even that goal's notes are hardcoded to `null`.

The full-fidelity mechanism (multi-goal persistence, per-goal notes, hard-conflict rejection, server-side safety recomputation, tenant isolation) is well-built and well-tested at the repository/server-action layer, but is reachable in production only behind a flag that ships off.

## 4. Current End-to-End Architecture

```
AddClientSheet ─┐
/clients/new  ──┼─→ AddClientForm.tsx (single shared component, variant sheet|page)
(intercepted)  ─┘        │  NEXT_PUBLIC_GOAL_WORKSPACE
                         ├─ off (default) → GoalAccordion  → orderedGoalConfigs()[0] only → { primaryGoal }
                         └─ on            → AddClientGoalWorkspace → toSelectedGoalDrafts() → { selectedGoals: N }
                         ▼
              actions/clients.ts → addClient()
                - bridge primaryGoal → 1-item SelectedGoalDraft[] (trainerNotes:null)
                - exactly-one-primary invariant (pre-check)
                - sanitizeSelectedGoalDrafts + detectConflicts hard-reject (before ERP)
                - createClient() → ERPNext Customer (erpFetch proxy)
                - repo.createClientRow() — ONE db.transaction: client_index + N client_goal rows
                         ▼
              client_goal (libsql/Drizzle, JSON sub-goal columns)
                         ▼ (read-only)
              lib/clients/hub.ts getClientHubOverview() → hub-map.ts → ClientGoalSummary (fields stripped)
                         ▼
              ClientHubPanel.tsx (renders goalId + confidence only)

              [NO write path from the Hub back into client_goal]
```

## 5. Canonical Taxonomy Findings

| Requirement | Status |
|---|---|
| Exactly 19 intake goals | **OK** — `lib/goals/taxonomy.ts` `GOALS`, 19 entries |
| Stable machine ID + display label per goal | **OK** |
| Core(8)/Specialist(8)/Emerging(3) sectioning | **OK** — matches `FITDESK_GOAL_SYSTEM.md` §5 |
| Stable sub-goal keys, 192 total (96/96) | **OK** — `fat-loss` 6 primary, `general` 6 secondary, others 5/5 |
| Client-stated vs trainer-assessed distinct | **OK** — `SubGoalLayer = 'primary' | 'secondary'` |
| No old 7-goal taxonomy reachable in production | **CONCERN** — orphaned dead files (below) |
| AI parsing derives from canonical taxonomy | **CONCERN** — `lib/clients/ai-parse.ts` `AI_PARSE_ALLOWED_GOALS` (23-30) is a hand-maintained literal duplicate of the 19 IDs, guarded only by a drift test |
| UI selectors derive from canonical taxonomy | **CONCERN** — live `GoalAccordion` derives correctly; orphaned `components/ui/GoalSelect.tsx` (13-21 `LEGACY_GOAL_IDS`) + `GoalMultiSelect.tsx` still hardcode the old 7-goal underscore list, unreachable but not deleted |
| Server validation derives from canonical taxonomy | **OK** — `sanitizeSelectedGoalDrafts`/`validateLayerSubGoals` in `create-draft.ts` |
| No competing formatting/display goal lists | **OK** — `lib/goals/format.ts` derives from taxonomy; `normalizeUrgency` aliases forbidden `'warm'` → `'active_focus'`; `'warm'` never persisted |

**Duplicate/stale definitions (exhaustive):** `components/ui/GoalSelect.tsx:13-21` (legacy 7 IDs, unreachable); `GoalMultiSelect.tsx` (inherits via re-export, unreachable); `lib/clients/ai-parse.ts:23-30` (manual 19-ID duplicate, reachable+correct but not derived). `GoalWithSubGoal` / `MultiGoalSelector` (named in the Recovery Plan) are fully gone (docs-only references).

## 6. Persistence-Model Findings

- **Representation:** `client_goal` rows with JSON sub-goal arrays (`sub_goal_ids_json`, `trainer_sub_goal_ids_json`) — matches the Recovery Plan's Phase 4.2 decision (not the taxonomy doc's `client_sub_goal`-table design). Intentional, documented divergence.
- Schema (`lib/db/schema.ts:178-197`) and executable migration (`scripts/migrate-app.mjs`, additive `ALTER TABLE` for `is_primary` + `trainer_sub_goal_ids_json`, plus a one-time `is_primary` backfill from `client_index.primary_goal_id`) **agree**.
- **Field coverage:** tenantId, clientIndexId/erpCustomerId, goalId, urgency, isPrimary, both sub-goal JSON arrays, notes, safetyFlagsJson, status, timestamps — all present. `status` supports `active`/`archived` but **`archived` is dead — nothing sets it**.
- **Constraints:**
  - Exactly one primary per client: enforced only as a **pre-check in `actions/clients.ts:188-195`**, not in the repository, not at the DB.
  - No duplicate active goal: **no unique index** on `(tenant_id, client_index_id, goal_id)` (`schema.ts:178-197`); no app-level dedup in the insert loop.
  - Tenant scoping: **OK** — every repository method calls `assertTenantId(ctx)`.
  - Goal↔sub-goal integrity: enforced at write time via `validateLayerSubGoals`.
  - Sub-goal removal / empty-vs-null notes: **not applicable — no removal/edit path exists**.

## 7. Add Client Save Findings

- All three entry points (`AddClientSheet`, intercepted `/clients/new`, full-page `/clients/new`) render the same `AddClientForm.tsx`. `FITDESK_ADD_CLIENT_SHEET_ENABLED` toggles only chrome. Entry-point parity: **OK**.
- **BLOCKING GAP (`AddClientForm.tsx:378-390`):** with `NEXT_PUBLIC_GOAL_WORKSPACE` unset (default), the submit handler takes `orderedGoalConfigs()[0]` (primary only) and discards every other configured goal. The server receives `{ primaryGoal }`, not `{ selectedGoals }`. `actions/clients.ts:181` hardcodes `trainerNotes: null` on this bridge. A trainer who selects 3 goals persists 1 `client_goal` row, silently, with no note.
- Server-side validation, hard-conflict rejection (before ERP write, `actions/clients.ts:204-207`), and `computeSafetyFlags` recomputation are correctly wired — for whatever payload reaches the action (only ever 1 goal under the default UI).
- ERP-write ordering: ERP Customer first, local rows after, inside one transaction. No orphan on ERP failure; documented recovery (not auto-retry) on local failure after ERP success (ADR-001).
- Confirmed **no** side effects: no invoice/payment/session/package/WhatsApp/program creation in `addClient()`. All ERP I/O via `erpFetch`.

## 8. Client Hub Hydration Findings

- **Genuine server-side fetch:** `app/dashboard/clients/[id]/page.tsx` → `getClientHubOverview()` (`lib/clients/hub.ts`, `'server-only'`) → `ClientRepository.listGoals` on every navigation/reload. **OK.**
- **GAP — thin render/mapping.** `ClientGoalSummary` (`types/clients.ts:328-335`, produced by `hub-map.ts:53-60`) strips `isPrimary`, `subGoalIds`, `trainerSubGoalIds`, `notes`, `safetyFlags` before the data reaches the client. `urgency` **does** survive the mapping (`types/clients.ts:331`, `hub-map.ts:56`) but is **not rendered**. `ClientHubPanel.tsx:397-408` renders only label + confidence. No primary badge, no sub-goal pills, no per-goal notes, no per-goal safety.
- **CONCERN — duplicate, unreconciled goal display.** `app/dashboard/clients/[id]/page.tsx:192-197` renders `formatGoal(client.goal)` from the ERP `Customer.custom_fitness_goals` free-text field, alongside the Hub's local-sourced goal display. On the default create path, ERP holds all goal labels while the local structured store holds only the primary; the two can diverge with no reconciliation.
- Flag-gating (`FITDESK_CLIENT_HUB_ENABLED`) fails safe: on error/disabled, `getClientHubOverview` returns null and the panel is omitted; no stale-ERP fallback attempted.

## 9. Update-Flow Findings

**No goal update flow exists anywhere in the reachable application — the single most severe finding.**

- `lib/clients/repository.ts` has one write path for `client_goal`: `createClientRow` (insert-only). No `UPDATE`/`DELETE`, no `updateClientGoal`/`removeClientGoal`/`setGoalPrimary`/`archiveClientGoal`.
- `actions/clients.ts` export list contains no goal-update action; `editClient` only forwards ERP customer-field updates. No `actions/goals.ts` exists.
- The GoalWorkspace editing components (`ActiveGoalInspector`, `GoalCommandDialog`, `SelectedGoalLedger`, `SelectedGoalRow`, `GoalSystemAlerts`) are imported **exclusively** by `AddClientGoalWorkspace.tsx`, itself imported exclusively by `AddClientForm.tsx` (create-only).
- The edit-client page (`app/dashboard/clients/[id]/edit/page.tsx:175-188`) shows a read-only "Goals" input with the comment "Goals can only be updated from Add Client or the goal workspace" — but the goal workspace is unreachable post-creation, so the comment is aspirational.

This is a **product** gap, not merely a test gap.

## 10. Goal-Specific Trainer-Note Findings

- `client_goal.notes` exists in schema/type but: is `null` unconditionally via the default UI (`GoalAccordion` `SelectedGoalConfig` has no notes field); is only reachable via the flag-gated GoalWorkspace path (off by default), where it is captured and tested (`actions/clients.test.ts:545`); is never rendered in the Hub (stripped by `hub-map.ts`); is never editable post-creation.
- **Conclusion:** goal-specific trainer notes do not work end-to-end in the production-default configuration.

## 11. General Client-Note Findings (kept separate)

- `addClientNoteAction` (`actions/clients.ts:587-614`) writes append-only `client_event` rows of type `client.note` — a client-wide timeline, unrelated to any goal. Reachable, server-verified, rendered as `recentNotes`. **Works correctly** — but must not be mistaken for goal-specific note functionality.
- The edit-client page's "Trainer notes" submits ERP `custom_trainer_notes` — a third, separate notes concept, also not goal-scoped.

## 12. Path-Parity Matrix

| Path | Goals | Primary | Urgency | Both sub-goal layers | Trainer notes | Conflict | Safety | Save | Update | Reload |
|---|---|---|---|---|---|---|---|---|---|---|
| AddClientSheet (default flag) | 1 only (others dropped) | ✅ (survivor) | ✅ (primary only) | ✅ (primary only) | ❌ (hardcoded null) | ✅ | ✅ | ✅ | ❌ | ✅ (thin) |
| Full-page `/clients/new` (default flag) | same (same component) | same | same | same | same | ✅ | ✅ | ✅ | ❌ | ✅ (thin) |
| Either path w/ `NEXT_PUBLIC_GOAL_WORKSPACE=1` | ✅ all | ✅ | ✅ per goal | ✅ per goal/layer | ✅ per goal | ✅ | ✅ | ✅ | ❌ | ✅ (thin) |
| Client Hub goal editor | — | — | — | — | — | — | — | — | **absent** | — |

The production-default configuration persists strictly less data than the flag-enabled configuration of the same form — a blocking parity defect.

## 13. Test-Coverage Matrix

480 goal-related tests were run in this audit (`npx vitest run lib/goals/__tests__ lib/clients/__tests__/repository.test.ts lib/clients/__tests__/create-draft.test.ts lib/clients/__tests__/ai-parse.test.ts components/clients/GoalAccordion/tests/GoalAccordion.test.tsx actions/clients.test.ts`) — **all 480 passed**.

| Requirement | Coverage |
|---|---|
| Taxonomy (19 goals, stable IDs, sub-goal keys, both layers) | ✅ `lib/goals/__tests__/taxonomy.test.ts` |
| Multi-goal create, exactly one primary | ✅ `actions/clients.test.ts` (selectedGoals block) |
| Urgency saved per goal | ✅ `actions/clients.test.ts:529` |
| Both sub-goal layers saved | ✅ `actions/clients.test.ts:563,582` |
| Trainer notes saved per goal | ✅ `actions/clients.test.ts:545` (via `selectedGoals` payload directly — not via the default `GoalAccordion` UI) |
| Fresh repository read after creation | ✅ `repository.test.ts:361-414` (temp-file SQLite round-trip) |
| Hub hydration returns all fields | ❌ NOT COVERED (would fail — `hub-map` strips fields) |
| Update existing goals (add/remove/primary/urgency/sub-goals/notes) survives read | ❌ NOT COVERED — feature does not exist |
| No duplicate active goals | ❌ NOT COVERED — no constraint, no test |
| Tenant isolation | ✅ `repository.test.ts` US-025 block |
| Forged client ID / missing tenant fails closed | ✅ (same block) |
| Hard conflict → zero writes | ✅ `actions/clients.test.ts:679,700` |
| Safety recomputed server-side | ✅ `actions/clients.test.ts:727,749` |
| Path parity (sheet vs fallback) | ❌ NOT COVERED |
| AI-parse 19-goal drift guard | ✅ `ai-parse.test.ts` |

## 14. End-to-End Acceptance Matrix

| # | Scenario | Verdict |
|---|---|---|
| 1 | Create 1 goal, primary+urgency+both sub-goal layers+note | FAIL via default UI (note null); PASS only flag-on / test-level |
| 2 | Create 3 goals, exactly one primary | FAIL via default UI (2 dropped); PASS at mechanism level |
| 3 | Reload, confirm all values | FAIL — round-trip real, but Hub render/mapping discards fields |
| 4 | Change primary goal | FAIL — no update path |
| 5 | Change urgency on two goals | FAIL — no update path |
| 6 | Add/remove client-stated sub-goals | FAIL — no update path |
| 7 | Add/remove trainer-assessed sub-goals | FAIL — no update path |
| 8 | Edit trainer note | FAIL — no update path; not settable via default UI |
| 9 | Clear trainer note | FAIL — same |
| 10 | Remove one goal | FAIL — no delete/archive path; `archived` status dead |
| 11 | Hard conflict → zero persistence | PASS — tested, correct ordering |
| 12 | Safety-sensitive goal → saved safety state | PASS for primary/`client_index`; GAP for non-primary goals under default UI |
| 13 | Cross-tenant read/update | PASS (read); N/A (update — feature absent) |
| 14 | Compare every reachable create/edit path | FAIL — default vs flag-on diverge; no edit path to compare |

## 15. Gap Classification

**P0 — Data loss / cross-tenant / safety / corrupt update**
- **P0-1:** Default Add Client UI (`AddClientForm.tsx:378-390`) silently discards non-primary goals and forces notes to `null`. Live, reachable, silent production data loss.

**P1 — Required behavior missing / paths inconsistent**
- **P1-1:** No update/edit/remove capability for any `client_goal` field after creation (repository, action, UI all absent).
- **P1-2:** Hub goal card omits urgency (render), and `hub-map.ts` strips `isPrimary`/sub-goals/notes/safety before they reach the client.
- **P1-3:** `client_goal.notes` unreachable in the default configuration (never captured, rendered, or editable).
- **P1-4:** Full-fidelity capture (`AddClientGoalWorkspace`) ships behind a flag defaulting off — production path is the lossy one (path-parity defect).

**P2 — Works but under-covered / low observability**
- **P2-1:** No unique constraint on `(tenant_id, client_index_id, goal_id)`.
- **P2-2:** Exactly-one-primary enforced only at the action layer, not repository/DB.
- **P2-3:** Orphaned dead files `GoalSelect.tsx` / `GoalMultiSelect.tsx` duplicating the legacy 7-goal taxonomy.
- **P2-4:** `AI_PARSE_ALLOWED_GOALS` a manual duplicate guarded only by a test.
- **P2-5:** `GoalStatus.archived` declared but never set (unwired soft-delete intent).
- **P2-6:** Two unreconciled goal displays on the client page (ERP free text vs local rows).
- **P2-7:** No payload-parity test between the sheet and full-page paths.

**P3 — Visual/copy/minor** — goal-card visual design (badges, pills, progressive disclosure) — legitimately deferred modernization, but only after P0/P1 data plumbing is closed.

## 16. Exact Files and Line References

- `lib/goals/taxonomy.ts` — `GOALS` (37-60), `GOAL_SAFETY_FLAGS` (368-388), `LEGACY_GOAL_ALIASES` (391-397).
- `lib/goals/conflicts.ts` — `GOAL_CONFLICT_RULES` (33-74), `detectConflicts` (76-92). `lib/goals/safety.ts` — `computeSafetyFlags` (18-32), `deriveSafetyState` (36-38). `lib/goals/format.ts` — `normalizeUrgency` (22-27).
- `lib/db/schema.ts:178-197` — `client_goal`; `scripts/migrate-app.mjs:77-94,260-286,341-360` — DDL + ALTERs + backfill.
- `types/clients.ts:176-195` — `ClientGoal`; `:87-94` — `SelectedGoalDraft` (has `trainerNotes`); `:328-335` — `ClientGoalSummary` (stripped).
- `lib/clients/repository.ts:268-281` — `listGoals` (no status filter); `:363-498` — `createClientRow` (insert-only; multi-goal loop 406-453; no dedup, no repo-level primary enforcement).
- `lib/clients/create-draft.ts:147-214` — `buildClientCreateDraft` (`goalNotes:null` at 206); `:227-239` — `sanitizeSelectedGoalDrafts`; `:127-141` — `validateLayerSubGoals`.
- `lib/clients/hub.ts:61-99` — `getClientHubOverview`; `lib/clients/hub-map.ts:53-60` — field-stripping mapper.
- `lib/clients/ai-parse.ts:23-30` — `AI_PARSE_ALLOWED_GOALS`.
- `components/clients/AddClientForm.tsx:252` (flag), `:315-322` (`orderedGoalConfigs`), `:333-348` (`buildPayload`), `:378-390` (goal bridge — the P0 defect), `:647-650` (selector switch), `:654-668` (ERP-level trainer notes).
- `components/clients/GoalAccordion/types.ts:4-9` — `SelectedGoalConfig` (no notes).
- `actions/clients.ts:120-293` — `addClient` (bridge 173-183, invariant 188-195, sanitize+hard-conflict 197-207, ERP create 218-226, local write 231-279); `:587-614` — `addClientNoteAction` (mutation pattern).
- `components/modules/ClientHubPanel.tsx:397-408` — thin goal render; `:353-355` — goal chip.
- `app/dashboard/clients/[id]/page.tsx:80` (hub load), `:192-197` (ERP free-text goal display).
- `app/dashboard/clients/[id]/edit/page.tsx:175-201` — read-only Goals field; ERP `custom_trainer_notes`.

## 17. Smallest Safe Remediation Sequence (proposed — implemented in the companion plan)

1. Fix P0 first: change the `AddClientForm` default goal bridge to send all selected goals as `SelectedGoalDraft[]`; add a per-goal notes field to `GoalAccordion`. Backend already supports N goals.
2. Stop stripping fields in `hub-map.ts`; render them in `ClientHubPanel.tsx`.
3. Add tenant-safe, transactional `replaceClientGoals` repository method + `updateClientGoalsAction`; wire the existing GoalWorkspace components into the Client Hub as an edit surface.
4. Retire the functionally divergent flag distinction once both paths emit `selectedGoals`.
5. Low-risk cleanup: delete orphaned selectors; derive `AI_PARSE_ALLOWED_GOALS` from taxonomy; add the unique index; move the primary invariant into the repository; add a path-parity test.

## 18. Whether the UI/UX Modernization Plan May Begin

**No.** Per the contract and `CLAUDE.md` ("do not classify missing save/update behavior as visual modernization work"), this is a data/functionality gap, not a styling gap. Building modernized UI on an update-less, field-stripping, silently-lossy save path would bake in the defects or require redoing the work. At minimum the P0 and P1 items must be fixed before modernization design begins. See the companion closure plan for the sequenced remediation and the binding product-owner decisions governing it.
