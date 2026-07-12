# FitDesk Goal System — Functional Closure Plan

| | |
|---|---|
| **Product** | FitDesk |
| **Document** | Goal System Functional Closure Plan |
| **Version** | v1.1 |
| **Status** | Approved with binding product-owner decisions incorporated |
| **Scope** | Goal and sub-goal create, read, update, reload, integrity, and path parity |
| **Architecture posture** | Minimal, additive, tenant-safe, business-logic-preserving |
| **Modernization dependency** | Blocking prerequisite — closure and freeze required |
| **Date** | 2026-07-13 |
| **Repository** | `C:\Users\Lenovo\Dev\axis-erp\FitDesk` |
| **Baseline HEAD** | `3fc5911a1bc8e20413fb0b68ab80a6aa914e169b` (branch `main`, level with `origin/main`) |
| **Baseline audit** | `docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md` (persisted; see Decision D6) |
| **Authority** | Governed by `CLAUDE.md` (tier 1) and `docs/DOCUMENTATION_AUTHORITY_MAP.md`. Where the code and any doc disagree, code is the source of truth for current state. |

---

## 1. Title and Metadata

See the metadata table above. This document is a **planning-only** artifact — it authorizes no code, test, schema, or migration changes by itself. The ten binding product-owner decisions in Section 19 are incorporated throughout this v1.1; where a decision resolved a previously-open choice, the resolved position is now stated as the plan of record. Every implementation phase still carries an explicit approval gate for any action that `CLAUDE.md §4` (workspace) / repo `CLAUDE.md` classify as approval-required (schema changes, migrations, dependency additions, ERP/DocType changes).

---

## 2. Executive Summary

The FitDesk Goal System has a **correct, well-tested storage and server-action core** (19-goal canonical taxonomy, multi-goal persistence, server-side conflict rejection, server-side safety recomputation, tenant isolation), but it is **not functionally closed** because the currently-shipped production UI cannot exercise that core, cannot fully read it back, and cannot update it after creation.

Three independent, code-confirmed defects each break the required user contract on their own:

1. **Create-time data loss (P0).** With the production-default `GoalAccordion` selector (flag `NEXT_PUBLIC_GOAL_WORKSPACE` unset), the form forwards **only the primary goal** to the server ([`AddClientForm.tsx:378-390`](../../components/clients/AddClientForm.tsx)), and even that goal's per-goal note is hardcoded to `null` ([`actions/clients.ts:181`](../../actions/clients.ts); `GoalAccordion` has no notes field at all). A trainer who configures three goals persists one, silently.
2. **Read-back loss (P1).** The Client Hub mapper strips `isPrimary`, `subGoalIds`, `trainerSubGoalIds`, `notes`, and `safetyFlags` before they reach the client ([`hub-map.ts:53-60`](../../lib/clients/hub-map.ts)), and the panel renders only the goal label + confidence ([`ClientHubPanel.tsx:397-408`](../../components/modules/ClientHubPanel.tsx)). `urgency` survives the mapping but is not rendered.
3. **No update path (P1).** There is no repository method, server action, or reachable UI to change any goal field after creation. [`repository.ts`](../../lib/clients/repository.ts) has `listGoals` (read) and `createClientRow` (insert) only.

This plan closes all three, plus the supporting integrity gaps (no duplicate-goal constraint, primary invariant enforced only at the action layer, functionally divergent feature-flag behavior), using **additive, tenant-safe** changes that reuse the existing hardened backend. Goal editing is **local-only** (ADR-001 and Decision D3: `client_goal` is the canonical trainer-facing Goal System source; ERPNext Customer stays canonical for business identity and minimal; ERP `custom_fitness_goals` is a legacy fallback only), so update transactions are clean, single-transaction, all-or-nothing with no ERP-orphan risk.

**Per Decision D1, UI/UX modernization remains blocked until Phases 1–6 pass, the full acceptance matrix (§17) passes, and the Goal System freeze report is approved and committed.** Phases 1–4 close the create/read/update behavior; Phases 5–6 close integrity, retirement of divergent flag behavior, and freeze.

---

## 3. Accepted Audit Baseline

The accepted working verdict is **FAIL — MODERNIZATION BLOCKED**, from the Goal System functional-closure audit performed against this same HEAD and now persisted at [`docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md`](../audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md) (Decision D6).

Accepted blocking findings (all re-verified against current code while writing this plan):

| # | Finding | Verified evidence |
|---|---|---|
| B1 | Default `GoalAccordion` path persists only the primary goal | `AddClientForm.tsx:378-390`, `runCreate` legacy branch sends `primaryGoal` = `orderedGoalConfigs()[0]` |
| B2 | Non-primary goal configuration discarded before submission | Same; the other selected configs never enter `selectedGoals`/`primaryGoal` |
| B3 | Goal-specific trainer notes hardcoded to `null` on default path | `actions/clients.ts:181` (`trainerNotes: null`); `GoalAccordion/types.ts:4-9` `SelectedGoalConfig` has no notes field |
| B4 | Client Hub strips / fails to render persisted goal fields | `hub-map.ts:53-60` (drops 5 fields); `ClientHubPanel.tsx:397-408` (renders label + confidence only) |
| B5 | No reachable post-creation goal update flow | `repository.ts` has no `update*`/`remove*` for `client_goal`; no goal-update export in `actions/clients.ts`; `GoalWorkspace/*` edit components imported only by `AddClientForm` |
| B6 | Feature-flag states produce different persistence behavior | `NEXT_PUBLIC_GOAL_WORKSPACE` off → 1 goal, notes null; on → all goals, notes captured (`AddClientForm.tsx:378-390`) |

Supporting (non-headline) findings accepted as scope: no unique index on `(tenant_id, client_index_id, goal_id)` (`schema.ts:178-197`, `migrate-app.mjs`); exactly-one-primary enforced only at `actions/clients.ts:188-195`, not the repository; `AI_PARSE_ALLOWED_GOALS` a hand-maintained duplicate (`ai-parse.ts:23-30`); orphaned legacy `components/ui/GoalSelect.tsx` / `GoalMultiSelect.tsx`; duplicate ERP-vs-local goal display on the client detail page (`app/dashboard/clients/[id]/page.tsx:192-197` renders the ERP `custom_fitness_goals` free text alongside the local Hub goals).

---

## 4. Audit Reconciliation Against Current HEAD

The audit was produced against HEAD `3fc5911…`, which is **still the current HEAD** (working tree clean apart from untracked docs). Nothing in the Goal System changed between the audit and this plan. Reconciliation result: **the audit matches current code**, with two precision corrections and one artifact note:

1. **Correction — `urgency` is a render gap, not a mapping gap.** `ClientGoalSummary` *includes* `urgency` (`types/clients.ts:331`) and `hub-map.ts:56` *does* carry it through; it is simply never rendered in `ClientHubPanel`. The genuinely *stripped* fields are `isPrimary`, `subGoalIds`, `trainerSubGoalIds`, `notes`, `safetyFlags`. This narrows Phase 2: `urgency` needs only a render change; the other four need type + mapper + render changes.
2. **Correction — ERP still receives all goal labels on the default path.** `buildPayload` (`AddClientForm.tsx:333-348`) serializes *all* selected goal IDs into ERP `custom_fitness_goals`. So on the default path the ERP free-text field holds all goals while the local structured store holds only the primary — the root of the duplicate/divergent display, resolved by declaring the local `client_goal` rows the single trainer-facing authority (Phase 2, Decision D3).
3. **Artifact note — the audit is now persisted.** Per Decision D6, the audit has been saved at `docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md` (this doc-only pass). Persisting it is a **mandatory prerequisite to Phase 1**.

No conflict was found that requires architect escalation per `DOCUMENTATION_AUTHORITY_MAP.md` — the Recovery Plan's chosen JSON-column storage design supersedes the taxonomy spec's original `client_sub_goal`-table sketch, and current code matches the Recovery Plan.

---

## 5. Current Architecture (as-built)

```
Add Client entry points (identical shared component; chrome only differs)
  AddClientSheet ─┐
  /clients/new (intercepted @overlay) ─┼─→ AddClientForm.tsx  (variant = sheet | page)
  /clients/new (full page) ────────────┘        │
                                                 │  NEXT_PUBLIC_GOAL_WORKSPACE
                        ┌────────────────────────┴─────────────────────────┐
                   flag off (PROD DEFAULT)                             flag on (dev)
                   GoalAccordion                                       AddClientGoalWorkspace
                   → orderedGoalConfigs()[0] only                      → toSelectedGoalDrafts(all)
                   → { primaryGoal }  (notes forced null)              → { selectedGoals: N }
                        └────────────────────────┬─────────────────────────┘
                                                 ▼
              actions/clients.ts → addClient()
                • bridge primaryGoal → 1-item SelectedGoalDraft[] (trainerNotes:null)  [173-183]
                • exactly-one-primary invariant [188-195]
                • sanitizeSelectedGoalDrafts + detectConflicts hard-reject [197-207]  (before ERP)
                • createClient() → ERPNext Customer via erpFetch proxy [218-226]
                • buildClientCreateDraft + computeSafetyFlags (full set) [238-257]
                • repo.createClientRow(...) — ONE db.transaction: client_index + N client_goal rows [259-264]
                                                 ▼
              client_goal (libsql/Drizzle, JSON sub-goal columns)   [schema.ts:178-197]
                                                 ▼ (read-only)
              lib/clients/hub.ts getClientHubOverview() → hub-map.ts → ClientGoalSummary (5 fields dropped)
                                                 ▼
              ClientHubPanel.tsx  (renders label + confidence only)   [397-408]

              ✗ NO write path from the Hub back into client_goal (no update/remove method exists)
```

Key invariants already in place and **must be preserved**: ERP Customer is canonical for business identity (ADR-001); ERP I/O only via `lib/erpnext/client.ts` `erpFetch`; every repository method calls `assertTenantId(ctx)`; Add Client creates no invoice/payment/session/package/WhatsApp/program side effects; hard-conflict rejection and safety recomputation run server-side before the ERP write.

---

## 6. Closure Definition

The Goal System is **functionally closed** when every row below is true and covered by an automated test, on **all production-reachable paths** (both feature-flag states until the flag's divergence is retired in Phase 5):

**Create** — select **zero or more** goals; when ≥1 goal is configured, **exactly one** is primary; per-goal urgency; client-stated sub-goals; trainer-assessed sub-goals; per-goal trainer notes; hard conflicts rejected with zero writes; safety state recomputed server-side.

**Read** — a fresh server render (page refresh, new navigation, direct URL) returns every persisted goal field, sourced from the canonical local `client_goal` rows (Decision D3), with no dependency on transient client state.

**Update** — add a goal; **archive** a goal (active → archived; hard deletion is not a normal trainer action, Decision D2); change primary atomically; change urgency; add/remove client-stated sub-goals; add/remove trainer-assessed sub-goals; add/edit/clear per-goal notes; conflict + safety recomputed; audit event written; changes survive a fresh read.

**Integrity (corrected primary invariant, Decision D7)** —
- **zero active goals is valid** (goal configuration deferred); in that state `client_index.primaryGoalId` and `client_index.primaryGoalLabel` are **null**;
- **when one or more active goals exist, exactly one is `isPrimary`**;
- no duplicate **active** goal for the same client+goalId; validation failure produces zero writes; archived/removed sub-goals stay removed; cross-tenant access fails closed; missing tenant context fails closed; all reachable paths produce equivalent canonical payloads; `createdAtUtc` preserved across updates; `updatedAtUtc` advanced on change.

---

## 7. Non-Negotiable Guardrails

Preserve, unchanged: ERPNext Customer as canonical business identity; the `erpFetch` / Control Plane proxy path; tenant-scoped local repositories; server-side tenant + trainer resolution (`resolveTrainerId`, `getTenantContext`); `detectConflicts` / `GOAL_CONFLICT_RULES`; `computeSafetyFlags` / `deriveSafetyState`; all financial hooks; Add Client billing behavior; session and package rules; the additive Client Hub read architecture; existing passing Goal System components and tests where reusable.

Do not: rewrite the Goal System; introduce a second taxonomy; bypass the ERP proxy; store ERP credentials; trust client-supplied tenant/trainer IDs; introduce invoice/payment/session/package-consumption/WhatsApp-send/program-generation side effects into goal create or edit; treat missing persistence or update as UI polish; fold unrelated UI modernization into this closure work.

Approval gates (repo `CLAUDE.md` / workspace `CLAUDE.md §4`) that this plan explicitly routes through the product owner: the **active-goal uniqueness protection / migration** (Phase 5) is **conditionally approved only** after the six technical-verification prerequisites in §19A; any **dependency addition** (none anticipated — see Risk R7); any change to **ERP DocTypes / provisioning APIs** (none in scope).

---

## 8. Risk Register

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | Phase 1 change to the create bridge regresses the working flag-on workspace path | High | Both paths converge on the *same* `selectedGoals` contract; add regression tests for both **before** editing the bridge (Phase 1 test-first). Keep `toSelectedGoalDrafts` for the accordion as a pure, unit-tested mapper. |
| R2 | Adding the active-goal unique index fails or corrupts data if duplicate active rows already exist, or partial-index support is absent on the deployed engine | High | Phase 5 is gated on §19A: read-only duplicate scan, conflict report + repair plan, backup confirmation, isolated-DB verification, **deployed SQLite/libSQL partial-index support verification**, and migration + rollback docs — all before any `CREATE UNIQUE INDEX`. Additive `IF NOT EXISTS`, never destructive. Schema change → approval gate. |
| R3 | Primary reconciliation leaves two primaries, or a stray primary when zero active goals | High | All reconciliation is inside one `db.transaction`; a throw rolls back entirely. The repository's final in-transaction assertion enforces the corrected invariant (D7): **at most one** active primary, **exactly one** when ≥1 active goals exist, and `client_index` primary fields **null** when zero active goals. |
| R4 | Local `client_goal` and ERP `custom_fitness_goals` diverge after edits | Med | Resolved by Decision D3: local `client_goal` is the canonical trainer-facing source; ERP `custom_fitness_goals` is a legacy fallback only, and goal editing stays local-only for this program. Phase 2 demotes the ERP free-text display. |
| R5 | Hub type/mapper extension breaks the Directory or other `ClientGoalSummary` consumers | Med | Additive fields only; grep all `ClientGoalSummary` consumers before editing; extend, never remove existing fields. |
| R6 | New edit sheet not validated on 375px mobile (Recovery Plan Risk R6, still open) | Med | Phase 4 mobile-first sheet + explicit 375px manual QA gate (§17). Reuse existing responsive Hub components. |
| R7 | Temptation to add a form/date/state library for the edit UI | Low | Reuse the existing `workspaceReducer` and Hub component patterns; **no new dependency**. If one seems needed, stop and request approval. |
| R8 | Optimistic UI reports success before the server persists | Med | Phase 4 is confirmed-first: `await` the action result, then `router.refresh()` / rely on `revalidatePath`; never show success before the typed success result returns. |
| R9 | Removing legacy `GoalSelect.tsx` / `GoalMultiSelect.tsx` breaks a hidden import | Low | Phase 5 greps for all importers first; delete only after confirming zero reachable references. |
| R10 | Concurrent multi-device edit (last-writer-wins) silently overwrites | Low | Out of scope for MVP (single trainer). Documented as Future (§9). No optimistic-lock claim made. |
| R11 | Flag divergence removed prematurely, before an edit-UI rollback path exists | Med | Decision D4: persistence stops diverging in Phase 1; a **controlled rollback window** is retained after Phase 4; the functionally-divergent flag behavior is removed in Phase 5 and its **absence verified in the Phase 6 freeze**. |

---

## 9. Scope Categories

**MVP / pilot-safe now (this plan, Phases 1–6):** close the create data-loss defect on all paths; full Hub read hydration + render; tenant-safe local update foundation (repository + server action); Hub goal-editing UI (mobile-first sheet + desktop surface); active-goal duplicate prevention + repository-level primary invariant; canonical taxonomy derivation for AI parse; removal of confirmed-dead legacy files; retirement of functionally divergent flag behavior; full automated + manual coverage; freeze.

**Production-hardening soon (post-closure, separate plan):** richer goal-change audit history / timeline surfacing; reconciliation + repair tooling for ERP-vs-local goal drift; expanded observability on goal writes; safety-note history view; archived-goal restore/history UI.

**Future platform architecture (explicitly deferred):** durable outbox / event bus; offline goal editing; background ERP sync worker; multi-device conflict resolution; automated retry / dead-letter handling. **No offline queue or automatic recovery system exists today; this plan claims none.**

Nothing in the required create/read/update/reload contract is deferred to production hardening.

---

## 10. File and Dependency Inventory

No new runtime dependencies. All work is additive within existing modules. Legend: **R**=reuse as-is, **E**=edit, **N**=new, **T**=test.

| Path | Role | Disposition |
|---|---|---|
| `components/clients/AddClientForm.tsx` | Both Add Client goal bridges | **E** (P1): default branch emits `selectedGoals` for all goals + per-goal notes |
| `components/clients/GoalAccordion/GoalAccordion.tsx` | Default goal selector UI | **E** (P1): add per-goal notes input |
| `components/clients/GoalAccordion/types.ts` | Accordion state + pure helpers | **E** (P1): add `notes` to `SelectedGoalConfig`; add `toSelectedGoalDrafts(state)` pure mapper |
| `components/clients/GoalWorkspace/**` | Multi-goal editor (reducer, ledger, inspector, notes, alerts) | **R/E** (P4): reuse for the Hub edit sheet; wire to load existing goals |
| `components/modules/ClientHubPanel.tsx` | Hub render | **E** (P2 render fields; P4 add "Edit goals" entry) |
| `app/dashboard/clients/[id]/page.tsx` | Client detail server page | **E** (P2): demote ERP free-text goal display; local is canonical (D3) |
| `app/dashboard/clients/[id]/edit/page.tsx` | Client edit page | **E** (P2): **neutral copy** for the read-only Goals field; **no link to a Hub editor until P4** (Decision D10) |
| `actions/clients.ts` | Server actions | **E** (P3): add `updateClientGoalsAction`; mirror existing validate→tenant→repo→revalidate pattern |
| `lib/clients/create-draft.ts` | Pure draft/sanitize helpers | **R/E** (P3): reuse `validateLayerSubGoals` for **strict** per-layer validation on the replace-set; `sanitizeSelectedGoalDrafts` (silent-drop) stays for AI drafts only, not the authoritative mutation |
| `lib/clients/repository.ts` | Local persistence | **E** (P3): add `replaceClientGoals` (transactional reconcile, returns tenant-verified `erpCustomerId` — D9); **E** (P5) `listGoals` filters to `status='active'` (archive semantics, D2) |
| `lib/clients/hub.ts` | Server-only Hub read | **R** (already correct server-side fetch) |
| `lib/clients/hub-map.ts` | Pure mapper | **E** (P2): carry the 5 stripped fields |
| `lib/clients/ai-parse.ts` | AI parse allowed goals | **E** (P5): derive from `lib/goals/taxonomy` |
| `lib/goals/**` | Taxonomy, conflicts, safety, mapping, format | **R** (all reused unchanged) |
| `lib/db/schema.ts` | Drizzle schema | **E** (P5, §19A-gated): active-goal unique index declaration |
| `scripts/migrate-app.mjs` | Additive migration runner | **E** (P5, §19A-gated): duplicate scan + partial `CREATE UNIQUE INDEX IF NOT EXISTS` |
| `types/clients.ts` | Type contracts | **E** (P2 extend `ClientGoalSummary`; P3 `UpdateClientGoalsPayload` type + `replaceClientGoals` return type) |
| `components/ui/GoalSelect.tsx`, `GoalMultiSelect.tsx` | Orphaned legacy selectors | **DELETE** (P5) after import check |
| **Tests** | | |
| `lib/goals/__tests__/*` | Pure taxonomy/conflict/safety/mapping/reducer | **R** |
| `components/clients/GoalAccordion/tests/GoalAccordion.test.tsx` | Accordion state | **T** (P1): extend for notes + `toSelectedGoalDrafts` |
| `lib/clients/__tests__/create-draft.test.ts` | Draft/sanitize | **T** (P1/P3) |
| `actions/clients.test.ts` | `addClient` create + safety; new update action | **T** (P1 parity; P3 update action; P3 note-state rules) |
| `lib/clients/__tests__/repository.test.ts` | Repo round-trip + tenant isolation | **T** (P3 update/archive/primary/round-trip; P5 duplicate + invariant) |
| `lib/clients/__tests__/hub-map.test.ts` | Mapper | **T** (P2 fields retained) |

---

## 11. Phase-by-Phase Implementation Plan

### Phase 0 — Baseline verification and audit reconciliation *(no code)*

- Confirm branch/HEAD/`origin/main`/working tree (done: `main` @ `3fc5911…`, clean but for untracked docs).
- Re-verify each blocking finding against code (done — §3/§4).
- **Persist the functional-closure audit — MANDATORY before Phase 1 (Decision D6).** Done in this pass: `docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md`.
- **Exit gate:** baseline recorded; audit persisted and committed; §4 reconciliation accepted by product owner.

### Phase 1 — Close the production Add Client data-loss defect *(test-first)*

Files: `GoalAccordion/types.ts`, `GoalAccordion.tsx`, `AddClientForm.tsx`; tests first.

**Decision D4 requirement: `NEXT_PUBLIC_GOAL_WORKSPACE` must stop affecting persistence in this phase.** After Phase 1, both flag states emit the identical `selectedGoals` server contract; the flag may still choose which selector UI renders, but it must no longer change what is persisted.

1. **Tests first (R1 mitigation):** add a path-parity test asserting the default (`GoalAccordion`) submission and the flag-on (`GoalWorkspace`) submission produce **equivalent `SelectedGoalDraft[]`** for the same selections, and a create test asserting N goals + per-goal notes persist through `addClient`.
2. Add `notes: string | null` to `SelectedGoalConfig` (`GoalAccordion/types.ts:4-9`) and a per-goal notes input in `GoalAccordion.tsx` (reuse the existing card layout).
3. Add a pure `toSelectedGoalDrafts(state: GoalSelectionState): SelectedGoalDraft[]` mapper (in `GoalAccordion/types.ts`): map every `selected` config → draft; carry `urgency`, `clientSubGoalIds`, `trainerSubGoalIds`, and `trainerNotes` (always present, `string | null` — never omitted, per Decision D8). **Primary-resolution rule aligned with the corrected invariant (D7):** zero selected goals → emit `[]` (no rows; `client_index` primary fields null downstream); ≥1 selected → exactly one `isPrimary` (the chosen `primaryGoalId`, or the first selected goal if none was chosen — matching today's implicit `orderedGoalConfigs()[0]`).
4. Edit `AddClientForm.tsx:378-390` so the **default** branch sends `{ selectedGoals: toSelectedGoalDrafts(goalState) }` (all goals) instead of `{ primaryGoal: first }`. **Zero goals selected → send `selectedGoals: []`.** Both selector implementations always submit the `selectedGoals` property; the legacy `primaryGoal` bridge is not used by either active UI path after Phase 1. (One explicit shape removes ambiguity between a missing property, an empty confirmed selection, accidental payload loss, and legacy fallback behavior.) The server `addClient` path (invariant, strict validation, hard-conflict, safety) is unchanged.
5. Leave the ERP `custom_fitness_goals` payload (`buildPayload`) as-is (already includes all goals; it is a legacy fallback per D3).

- **Data/migration:** none. **Flags:** both flag states now emit `selectedGoals` — **persistence divergence eliminated** (D4). **Cache:** none new (`addClient` already `router.refresh()`s). **Rollback:** revert the three files.
- **Exit gate:** default and flag-on paths persist all selected goals + per-goal notes and produce equivalent payloads; flag no longer changes persistence; new parity/create tests green; full suite green.

### Phase 2 — Complete Client Hub goal hydration and display

Files: `types/clients.ts`, `hub-map.ts`, `ClientHubPanel.tsx`, `app/dashboard/clients/[id]/page.tsx`, `app/dashboard/clients/[id]/edit/page.tsx`; tests.

1. Extend `ClientGoalSummary` (`types/clients.ts:328-335`) additively with `isPrimary: boolean`, `subGoalIds: string[]`, `trainerSubGoalIds: string[]`, `notes: string | null`, `safetyFlags: string[]`.
2. Extend `mapToClientHubOverview` (`hub-map.ts:53-60`) to pass those through from the already-hydrated `ClientGoal[]`; add `isPrimary` directly from `g.isPrimary` (do not keep inferring primary solely from `index.primaryGoalId`).
3. Render in `ClientHubPanel.tsx:397-408`: primary badge, urgency, client-stated sub-goal pills, trainer-assessed sub-goal pills, per-goal notes, per-goal safety flags. Render only; visual polish is later modernization — keep it functional and legible.
4. **Resolve display authority (Decision D3), with a precise fallback condition:** on `app/dashboard/clients/[id]/page.tsx:192-197`, stop presenting the ERP `custom_fitness_goals` free text as a competing goal list. The local `client_goal` rows are the canonical trainer-facing source. The ERP free text is a fallback **only for clients that have never received a structured local Goal System projection** — it must never resurface merely because the active goal count dropped to zero (e.g. the trainer archived every goal):
   ```text
   ERP custom_fitness_goals may be used only when the client has never
   received a structured local Goal System projection.

   The existence of any local client_goal history — including archived rows —
   means the local Goal System is authoritative.

   Valid deferred or intentionally empty local goal state:
   show "Goals not configured."

   Do not fall back to ERP text merely because the active goal count is zero.
   ```
   Implementation note: distinguish "never projected" from "projected then emptied" by the existence of **any** `client_goal` row for the client (active *or* archived), not by the active count. If repository evidence shows that row existence alone cannot reliably distinguish migrated from unmigrated clients, add an explicit projection/migration marker instead of inferring from row presence.
5. **Edit-page copy (Decision D10):** on `[id]/edit/page.tsx:175-201`, use **neutral copy** for the read-only Goals field (e.g. "Goals are managed in the Client Hub"). **Do not link to a Hub goal editor** — that editor does not exist until Phase 4; add the link only in Phase 4, or defer it.
6. Tests: extend `hub-map.test.ts` (fields retained); add a Hub read test asserting a fresh read returns all fields.

- **Data/migration:** none. **Flags:** `FITDESK_CLIENT_HUB_ENABLED` behavior unchanged (fail-safe → null → panel omitted). **Cache:** none new. **Rollback:** revert; summary reverts to 6 fields.
- **Exit gate:** a created client's full goal set (primary, urgency, both sub-goal layers, notes, safety) renders on a fresh server render; no divergent ERP goal display; edit-page copy is neutral with no dead link.

### Phase 3 — Tenant-safe Goal System update foundation *(no UI yet)*

Files: `repository.ts`, `actions/clients.ts`, `types/clients.ts`; tests.

1. **Canonical update payload (replace-set).** Define `UpdateClientGoalsPayload = { clientIndexId: string; goals: SelectedGoalDraft[] }` — the trainer submits the **complete desired active goal set** for the client. This single shape covers add/archive/change-primary/change-urgency/sub-goal add-remove/notes edit-clear, and makes the invariants structural rather than per-operation. **Complete note state is required for every goal (Decision D8):** each draft's `trainerNotes` must be present; **omitting the note field makes the replacement payload invalid** (reject, zero writes).
2. **Server action `updateClientGoalsAction`** (mirror `addClientNoteAction`/`addProgressEntryAction` pattern): `resolveTrainerId()` → **strict validation of the replacement payload** (see below) → `getTenantContext()` (fail closed if missing) → `repo.replaceClientGoals(ctx, payload)` (ownership-verified) → **use the tenant-verified `erpCustomerId` returned by the repository (Decision D9)** for `revalidatePath('/dashboard/clients/${erpCustomerId}')` — never a client-supplied id → typed `ActionResult`. No ERP call.

   **Strict validation — a confirmed full-replacement mutation fails visibly on invalid input; it is never silently transformed into a different valid command:**
   ```text
   For replaceClientGoals, validation is strict:

   - Unknown goalId → reject the complete request.
   - Duplicate goalId → reject the complete request.
   - Unknown sub-goal key → reject the complete request.
   - Sub-goal assigned to the wrong goal or layer → reject the complete request.
   - Missing trainerNotes property → reject the complete request.
   - Any validation failure → zero writes.

   Sanitization that silently drops values may remain appropriate for
   non-authoritative AI draft preparation, but not for the confirmed
   full-replacement mutation.
   ```
   Rationale: silently dropping one malformed goal would shrink the desired set and could **unintentionally archive an existing valid goal** (the reconcile treats "absent from the desired set" as archive, D2). The corrected primary invariant (D7 — zero allowed; exactly one primary when ≥1) and hard-conflict rejection (`detectConflicts`) also run here, before any write.
3. **Repository `replaceClientGoals(ctx, clientIndexId, goals): { erpCustomerId }`** — one `db.transaction`:
   - `assertTenantId(ctx)`; load the `client_index` row and **verify it belongs to this tenant** (fail closed if not found / mismatched); capture its `erpCustomerId` to return for revalidation (D9).
   - Apply per-goal **note semantics (D8):** non-empty string → trimmed and stored; blank/whitespace or explicit `null` → cleared to `null`.
   - Reconcile `client_goal` rows against the desired **active** set, keyed by `goalId`:
     - existing active goalId retained → **UPDATE in place** (preserve `createdAtUtc`; set `updatedAtUtc = now`; overwrite `subGoalIdsJson`, `trainerSubGoalIdsJson` = replace semantics, `urgency`, `notes`, `isPrimary`, recomputed `safetyFlagsJson`);
     - new goalId → INSERT (`createdAtUtc = now`, `status='active'`);
     - goalId absent from the desired set → **archive: set `status='archived'`, `updatedAtUtc = now` (Decision D2 — hard deletion is not a normal trainer action)**; a previously-archived goalId re-submitted → reactivate (`status='active'`) with UPDATE.
   - Recompute per-goal safety (`computeSafetyFlags`) and update `client_index.primaryGoalId` / `primaryGoalLabel` / `safetyState` in the **same** transaction to match the active set — **and set both primary fields to `null` when the active set is empty (Decision D7)**.
   - Final in-transaction assertion (D7): **at most one** active primary; **exactly one** when ≥1 active goals; **zero active goals ⇒ `client_index` primary fields null**; no two active rows share a `goalId`. Throw → rollback if violated (R3).
   - Write a `client.goals_updated` audit `client_event` (before/after active goal-id set, primary, counts — goal metadata only, no PII).
4. **`listGoals` scope (D2):** update `listGoals` (or add an active-scoped read the Hub uses) to return `status='active'` rows so archived goals do not surface in the trainer-facing Hub.
5. Tests (`repository.test.ts`, `actions/clients.test.ts`): add goal; archive goal (row becomes `archived`, absent from active read, reappears if re-submitted); change primary (old cleared atomically); change urgency; add/remove both sub-goal layers; **note-state rules (D8): non-empty trims+stores, blank/null clears, omitted field rejected**; reduce to zero goals (index primary fields null); each **survives a fresh active `listGoals` read**; hard conflict → zero writes; cross-tenant update rejected; missing tenant fails closed; `createdAtUtc` preserved / `updatedAtUtc` advanced; action revalidates using the repository-returned `erpCustomerId`.

- **Data/migration:** none (works on existing columns incl. `status`). **Flags:** none. **Cache:** `revalidatePath` on the client detail route, keyed by the tenant-verified `erpCustomerId`. **Rollback:** the action/method are additive and unreferenced by UI until P4 — safe to revert.
- **Exit gate:** every update behavior works and survives a fresh active read, proven by tests; archived goals hidden; zero-goal state valid with null index primary fields; no UI yet.

### Phase 4 — Client Hub goal editing

Files: `ClientHubPanel.tsx`, `GoalWorkspace/**` (reuse), a Hub edit sheet; tests.

1. Audit `GoalWorkspace/**` for reuse: the `workspaceReducer` already models multi-goal state (primary, urgency, both sub-goal layers, notes) — seed it from the client's current **active** `client_goal` rows to edit, then submit `toSelectedGoalDrafts(...)` (with complete `trainerNotes` per D8) via `updateClientGoalsAction`.
2. Add an "Edit goals" entry on the Hub goal card → mobile-first bottom sheet (reuse existing sheet pattern); appropriate desktop surface (drawer/inline panel). Preserve existing FitDesk tokens; no new dependency. (This is where the edit-page copy from P2 may finally link to, per D10.)
3. **Confirmed-first save (R8, no optimistic persistence):** `await` the action; on success `router.refresh()` (or rely on `revalidatePath`) then close; on failure keep the sheet open with the error and **no local state claiming success**.
4. Tests: component/interaction tests for load→edit→save→reload; archive-a-goal from the sheet; failure keeps sheet open and data unchanged.

- **Data/migration:** none. **Flags:** editor always available on the Hub (not behind the create-time selector flag). Per Decision D4, a **controlled rollback window** for the create-time selector flag is retained through this phase before divergence is removed in P5. **Cache:** `revalidatePath`. **Rollback:** remove the edit entry point; read-only Hub remains.
- **Exit gate:** a trainer can change every goal field (incl. archive) from the Hub; changes survive refresh; failures write nothing.

### Phase 5 — Integrity and canonicalization

Files: `schema.ts` + `migrate-app.mjs` (**§19A-gated**), `repository.ts`, `ai-parse.ts`, delete `components/ui/GoalSelect.tsx` + `GoalMultiSelect.tsx`, flag-divergence removal.

1. **Active-goal duplicate prevention (Decision D5 — conditionally approved, gated on §19A).** Only after all six §19A prerequisites are satisfied: additive **partial** `CREATE UNIQUE INDEX IF NOT EXISTS` on `(tenant_id, client_index_id, goal_id) WHERE status='active'` (partial because archived duplicates are allowed by the archive model, D2). Repository-level dedup is already enforced by `replaceClientGoals`; the index is defense-in-depth.
2. **Primary-cardinality enforcement — explicit division of responsibility (the goalId index does *not* enforce primary cardinality):**
   ```text
   Database:
   - Enforces at most one active row for each client + goalId.
   - Optionally enforces at most one active primary row per client through
     a separately verified partial unique index.

   Repository transaction:
   - Allows zero active goals.
   - Requires exactly one primary when one or more active goals exist.
   - Keeps client_index primary fields synchronized.
   ```
   The optional second partial index (subject to the same §19A gates as the goalId index) is:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS ...
   ON client_goal (tenant_id, client_index_id)
   WHERE status = 'active' AND is_primary = 1;
   ```
   Even with that index, the repository must still enforce "exactly one when nonempty," because the database index only guarantees "at most one." The shared assertion helper (corrected invariant, D7) is used by both the create and update paths.
3. **Canonical taxonomy derivation:** make `AI_PARSE_ALLOWED_GOALS` (`ai-parse.ts:23-30`) derive from `GOALS` in `lib/goals/taxonomy`; keep/adjust the drift-guard test.
4. **Remove confirmed-dead legacy files:** grep for importers of `GoalSelect.tsx` / `GoalMultiSelect.tsx`; if zero reachable references, delete (satisfies Recovery Plan Hard Rule #7 "one goal system").
5. **Remove functionally divergent flag behavior (Decision D4):** persistence already converged in P1; here, remove the divergent branch so the flag no longer changes behavior in any functional way (retire the selector-choice divergence per `PHASE_9_GOAL_UX_DEFAULT_DECISION.md`, keeping `GoalAccordion` as the default unless product-owner sign-off promotes the workspace). The controlled rollback window from P4 closes here.

- **Data/migration:** the partial unique index only, gated on §19A. **Rollback:** index is `IF NOT EXISTS` + additive; taxonomy-derivation and file deletions revert cleanly.
- **Exit gate:** active-goal uniqueness is enforced by the database and repository — the database enforces at most one active primary where supported; the repository transaction enforces exactly one primary when the active set is nonempty. Active-goal + goalId duplicates impossible (post-§19A); AI parse derives from taxonomy; dead files gone; flag no longer produces divergent behavior.

### Phase 6 — Verification, QA, documentation, freeze

Targeted goal tests → full suite → lint → build → manual create/read/update/reload matrix (§17) on mobile + desktop → **verify the absence of functionally divergent flag behavior (Decision D4)** → author the Goal System freeze report → **product-owner approval, and the freeze report committed (Decision D1)**. **Exit gate:** all gates in §16 pass; the full §17 acceptance matrix passes; the freeze report is approved and committed. Only then is modernization unblocked.

---

## 12. Data-Integrity and Transaction Design

- **Canonical update payload:** replace-set — `{ clientIndexId, goals: SelectedGoalDraft[] }` representing the complete desired **active** goal set. Chosen over granular ops because it makes the corrected invariants structural, not per-call.
- **Server validation boundary (before any mutation) — strict for the authoritative replace-set:** the confirmed full-replacement payload is **validated, not sanitized**. Any of the following rejects the whole request with **zero writes**: unknown goalId; duplicate goalId; unknown sub-goal key; sub-goal on the wrong goal or layer; missing `trainerNotes` property (D8); wrong primary count (D7 — zero allowed; exactly one when ≥1); a hard conflict (`detectConflicts`); missing/mismatched tenant (fail closed). Silent sanitization (`sanitizeSelectedGoalDrafts`) remains appropriate only for non-authoritative AI draft preparation, never for this confirmed mutation. Client-supplied tenant/trainer ids are never trusted.
- **Repository transaction boundary:** a single `db.transaction` (same pattern as `createClientRow:380`). Reconcile rows + update `client_index` denormalized primary/safety + write audit event, all inside it. **Purely local — no ERP call** (D3), so there is no two-phase/orphan concern.
- **Atomic primary replacement (D7):** within the transaction set `isPrimary` per the desired active set and update `client_index.primaryGoalId`/`primaryGoalLabel`; when the active set is empty, set both to `null`. Final assertion enforces at-most-one / exactly-one-when-nonempty or the transaction throws and rolls back.
- **Goal addition/archival semantics (D2):** add = INSERT (`createdAtUtc = now`, `status='active'`); remove = **archive** (`status='archived'`; hard deletion is not a normal trainer action); re-submitting an archived goalId reactivates it. Retained active goals UPDATE in place to preserve `createdAtUtc`.
- **Sub-goal replacement semantics:** **replace, not append** — the JSON arrays are overwritten with the submitted (layer-validated) sets, so removed sub-goals cannot reappear.
- **Notes null/empty/clear semantics (D8):** non-empty string → **trim and store**; blank/whitespace or explicit `null` → **clear to `null`**; **omitted note field → invalid replacement payload (reject)**. "No note" and "cleared note" are both `null` (no historical distinction in MVP; consistent with the single `notes` column).
- **Safety recomputation timing:** recomputed server-side from the desired active goal set at save time (create and update), never trusted from the client — `computeSafetyFlags`/`deriveSafetyState`, writing per-goal `safetyFlagsJson` and `client_index.safetyState` in the same transaction.
- **Conflict validation timing:** hard conflicts checked server-side before the transaction opens; zero writes on rejection. Soft conflicts remain advisory (UI), non-blocking.
- **Audit-event behavior:** one `client.goals_updated` `client_event` per successful update (tenant-scoped, goal metadata only). Append-only; consistent with existing `client_event` audit usage.
- **Path/cache revalidation (D9):** `revalidatePath('/dashboard/clients/${erpCustomerId}')` after a successful commit, using the **tenant-verified `erpCustomerId` returned by `replaceClientGoals`** — never a client-supplied id. The Hub re-reads server-side on next render.
- **Failure before mutation:** any strict-validation failure (unknown or duplicate goalId, unknown or mis-layered sub-goal, missing note field, wrong primary count, hard conflict, missing/mismatched tenant) → typed failure, nothing written.
- **Failure during transaction:** any throw → full rollback → no mixed old/new state; no external side effect to unwind (local-only).
- **Failure after persistence but before UI refresh:** the transaction already committed atomically and durably; `revalidatePath`/`router.refresh` is best-effort — if it does not run, the next navigation/server render still shows correct persisted state. **No offline queue or auto-recovery is claimed or relied upon** (none exists in the repo).

---

## 13. UI Integration Strategy

- **Create (P1):** minimal change — `GoalAccordion` gains a per-goal notes input and a pure `toSelectedGoalDrafts` mapper; `AddClientForm` sends all goals; the flag stops changing persistence.
- **Read (P2):** `ClientHubPanel` goal card renders the full field set functionally (badges/pills/notes/safety) using existing tokens; the ERP free-text goal display on the detail page is demoted so local is the canonical trainer-facing source; edit-page copy is neutral with no dead link (D10).
- **Update (P4):** reuse `GoalWorkspace/**` + `workspaceReducer` inside a mobile-first Hub edit sheet with an appropriate desktop surface; confirmed-first save, no optimistic success. Functional wiring, **not** the modernization redesign.
- Boundary: all visual/interaction *modernization* (Smart Accordion Card polish, motion, information architecture) stays out of this plan and begins only after closure and freeze (D1).

---

## 14. Feature-Flag Strategy

Governed by Decision D4.

| Flag | Current | This plan |
|---|---|---|
| `NEXT_PUBLIC_GOAL_WORKSPACE` | off = `GoalAccordion` (lossy), on = `GoalWorkspace` (full) | **P1:** both paths emit `selectedGoals` → **persistence identical in both states; the flag must stop affecting persistence**. **P4:** retain only a **controlled rollback window** for the selector choice. **P5:** remove the functionally divergent flag behavior (selector-choice divergence retired; `GoalAccordion` stays default unless product-owner sign-off promotes the workspace). **P6:** verify the absence of functionally divergent flag behavior during freeze. |
| `FITDESK_CLIENT_HUB_ENABLED` (+ `_TENANTS`) | Hub read enabled by default; fail-safe to null | Unchanged. Hub editing (P4) lives behind the same Hub gate. |

Principle: **no production-reachable flag state may persist or read less canonical data than another.** P1 removes the only place this is violated; P5 removes the residual divergent behavior entirely.

---

## 15. Test Strategy

**Creation:** one goal with all fields; N goals with exactly one primary; **default vs flag-on paths produce equivalent `SelectedGoalDraft[]`** (path parity); per-goal notes survive creation.

**Read:** fresh repository read returns all fields; `hub-map` retains all fields; server-rendered Hub exposes all fields; archived goals are excluded from the active read.

**Update:** add goal; archive goal (hidden from active read; reactivates on re-submit); change primary (old cleared atomically); change urgency; add/remove both sub-goal layers; **note-state rules (D8): non-empty trims+stores, blank/null clears, omitted field rejected**; reduce to zero goals (index primary fields null, D7); **each survives a fresh active read**; removed sub-goals do not reappear.

**Integrity:** active-goal duplicate rejected; corrected primary invariant (at most one; exactly one when ≥1; zero valid with null index primaries); hard conflict → zero writes; safety recomputed server-side; cross-tenant read/write rejected; missing tenant fails closed; partial failure leaves no mixed state; `createdAtUtc` preserved / `updatedAtUtc` advanced; action revalidates using the repository-returned `erpCustomerId` (D9).

Reuse the existing safe harness: pure `lib/goals/__tests__/*`, temp-file SQLite round-trip in `repository.test.ts`, mocked-ERP `actions/clients.test.ts`. **Run only isolated/mocked tests — never against a live ERP tenant or production DB** (per task and `CLAUDE.md`). Verified safe command from the audit run: `npx vitest run <goal-related paths>` (480 tests green at baseline).

---

## 16. Verification Gates

Each phase must pass, in order, before the next:

1. Targeted goal-system tests green (`npx vitest run` on the changed areas).
2. Full unit suite green.
3. Lint clean (repo lint script).
4. Build verification (repo build script; read-only, no deploy).
5. Manual create/read/update/reload matrix (§17 QA) on the phase's surface.
6. No unintended side effects (grep the changed actions for invoice/session/package/WhatsApp/program calls — must remain absent).

Final closure additionally requires the full §17 acceptance matrix to pass on mobile + desktop, the **absence of functionally divergent flag behavior verified (D4)**, and the **freeze report approved and committed (D1)**.

---

## 17. Manual QA Matrix

Run each on **Add Client sheet**, **intercepted `/clients/new`**, **full-page `/clients/new`**, **Client Hub**, at **375px mobile** and **desktop**, with the goal flag **off** and **on** (until the divergence is removed in P5):

| # | Scenario | Pass = |
|---|---|---|
| 1 | Create 1 goal: primary + urgency + both sub-goal layers + note | all persisted, visible on fresh reload |
| 2 | Create 3 goals | exactly one primary; all three persisted |
| 3 | Create with no goals (deferred) | valid; `client_index` primary fields null (D7) |
| 4 | Reload (refresh / new nav / direct URL) | every field re-renders from the server |
| 5 | Change primary | old primary cleared, new set, atomically |
| 6 | Change urgency on two goals | both updated independently |
| 7 | Add + remove client-stated sub-goals | removals stay removed after reload |
| 8 | Add + remove trainer-assessed sub-goals | removals stay removed after reload |
| 9 | Edit a note | new text persists (trimmed) |
| 10 | Clear a note (blank / null) | note cleared to null, persists (D8) |
| 11 | Archive a goal | goal hidden from active Hub; reactivates on re-submit; no active duplicate (D2) |
| 12 | Reduce to zero active goals (archive all) | valid; index primary fields null (D7); Hub shows "Goals not configured", never stale ERP text (D3) |
| 13 | Attempt hard conflict (underweight + fat-loss) | rejected, zero writes |
| 14 | Safety-sensitive goal (postnatal / rehab) | safety state saved + shown |
| 15 | Cross-tenant read/update attempt | rejected / not-found (fail closed) |
| 16 | Default vs flag-on create paths | equivalent persisted result; flag changes no persistence |
| 17 | Every reachable create/edit path | equivalent persisted result |

---

## 18. Rollback Strategy

Each phase is additive and independently revertible:

- **P1:** revert `AddClientForm.tsx` + `GoalAccordion` files → prior default behavior restored.
- **P2:** revert `hub-map.ts` + `ClientHubPanel.tsx` + type extension → 6-field summary restored (no data loss; fields still stored). Edit-page copy revert is trivial.
- **P3:** action + repository method are unreferenced until P4 → delete/revert with no live impact.
- **P4:** remove the Hub edit entry point → read-only Hub remains. The controlled rollback window (D4) keeps the selector flag available until P5.
- **P5:** the partial unique index is `CREATE … IF NOT EXISTS` (additive, non-destructive) and gated on §19A; taxonomy-derivation, file deletions, and flag-divergence removal revert via git. The index cannot be trivially "un-created" by revert — treat its addition as the point-of-no-return and gate it on the §19A prerequisites (incl. backup confirmation).
- Panic rule (`CLAUDE.md §9`): if any change breaks startup/auth/tenant isolation/create flow, stop, revert only the last change, report the failing file + exact error + safest next step.

No force-push, no history rewrite, no destructive DB/bench/volume commands at any phase.

---

## 19. Approved Product Decisions

The following product-owner decisions are **binding** and incorporated throughout this v1.1. They replace the former "open decisions" list; the only items still genuinely unresolved are the technical-verification gates in §19A.

- **D1 — Modernization stays blocked until closure and freeze.** UI/UX modernization remains blocked until Phases 1–6 pass, the full §17 acceptance matrix passes, and the Goal System freeze report is **approved and committed**.
- **D2 — Archival, not deletion.** Goal removal in normal trainer workflows is `active → archived`. Hard deletion is not a normal user action. `listGoals` (trainer-facing) returns active rows; the unique index (§19A) is partial on `status='active'`.
- **D3 — Local is canonical; ERP is legacy fallback (precise condition).** Local `client_goal` rows are the canonical trainer-facing Goal System source. ERP `custom_fitness_goals` is a fallback **only for clients that have never received a local Goal System projection**; the existence of any `client_goal` row (active *or* archived) makes local authoritative. A deferred/empty local state shows "Goals not configured", never ERP text, and the ERP fallback must not be triggered merely because the active goal count is zero (see Phase 2). Goal editing remains **local-only** for this closure program.
- **D4 — Flag must stop affecting persistence.** `NEXT_PUBLIC_GOAL_WORKSPACE` stops affecting persistence in Phase 1. After Phase 4, retain only a controlled rollback window. Remove functionally divergent flag behavior in Phase 5 and verify its absence during the Phase 6 freeze.
- **D5 — Active-goal uniqueness protection is conditionally approved,** subject only to the §19A verification gates below.
- **D6 — Persisting the functional-closure audit is mandatory before Phase 1.** Done: `docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md`.
- **D7 — Corrected goal invariant.** Zero active goals is valid when goal configuration is deferred; when one or more active goals exist, exactly one must be primary; `client_index` primary fields must be `null` for zero active goals.
- **D8 — Complete note state in the replacement payload.** For every active goal: non-empty string → trim and store; blank/whitespace or explicit `null` → clear to `null`; **omitted note field → invalid replacement payload**.
- **D9 — Trusted revalidation identity.** `replaceClientGoals` returns the tenant-verified `erpCustomerId` used for route revalidation. Do not trust another (client-supplied) id.
- **D10 — No premature edit link.** Do not point the edit page at a Hub editor before Phase 4 creates that editor. Use neutral copy in Phase 2 or defer the link.

### 19A. Remaining Technical Verification Gates (not product decisions)

The active-goal uniqueness protection (D5) is approved **only after all** of the following are completed and recorded (these are engineering verification steps, not product choices). They gate the Phase 5 migration — and cover **both** the `(tenant_id, client_index_id, goal_id)` uniqueness index **and** the optional `(tenant_id, client_index_id) WHERE is_primary=1` primary-cardinality index:

1. **Read-only duplicate scan** of existing `(tenant_id, client_index_id, goal_id)` among `status='active'` rows.
2. **Conflict report and repair plan** for any duplicates the scan finds (how each is resolved before the index is created).
3. **Backup confirmation** of the target database prior to migration.
4. **Isolated database verification** — run the migration end-to-end against an isolated copy, not production.
5. **Deployed SQLite/libSQL partial-index support verification** — confirm the deployed engine supports the `WHERE status='active'` partial unique index.
6. **Migration and rollback documentation** — the exact forward migration and its rollback, written before execution.

Only when all six are satisfied and the schema-change approval gate (`CLAUDE.md §4`) is cleared may the partial unique index be created.

---

## 20. Final Recommended Execution Order

1. **Phase 0** — baseline + reconciliation; **persist + commit the audit (D6)**; product-owner accepts §4 reconciliation and the §19 decisions.
2. **Phase 1** — close create data-loss (test-first); **flag stops affecting persistence (D4)**. *Highest urgency: active, silent, production data loss.*
3. **Phase 2** — full Hub read hydration + render; resolve display authority (D3); neutral edit-page copy (D10).
4. **Phase 3** — tenant-safe update foundation (repository + action), archival semantics (D2), corrected invariant (D7), note-state rules (D8), trusted revalidation id (D9); fully tested, no UI.
5. **Phase 4** — Hub goal-editing UI (reuse `GoalWorkspace`), confirmed-first; retain the controlled rollback window (D4).
6. **Phase 5** — integrity + canonicalization: active-goal partial unique index (gated on §19A), repository-level primary invariant, taxonomy derivation, delete dead files, **remove functionally divergent flag behavior (D4)**.
7. **Phase 6** — verification, manual QA matrix, verify flag-divergence absence (D4), freeze report, **product-owner approval + freeze report committed (D1)**.

**Modernization remains blocked until Phases 1–6 pass, the full §17 acceptance matrix passes, and the freeze report is approved and committed (Decision D1).** No phase of modernization may run before that gate.

---

### Guardrail restatement

This docs-only pass creates/updates exactly two files — this plan and the persisted audit (`docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md`) — and modifies **no application code, tests, schema, migrations, or dependencies**. Implementation of any phase requires separate execution and, where noted, explicit product-owner approval (the §19A-gated schema change/migration in Phase 5). No staging, commit, or push is authorized by this document.
