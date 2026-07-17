# FitDesk Goal System — Functional Closure Candidate Freeze Report

| | |
|---|---|
| **Product** | FitDesk |
| **Document** | Goal System Functional Closure — Candidate Freeze Report |
| **Date** | 2026-07-15 |
| **Branch** | `fix/goal-system-functional-closure` |
| **Baseline (main)** | `6b4bf1d` (untouched) |
| **Implementation HEAD (Phases 1–5 complete)** | `62477e3` |
| **Candidate freeze report commit (Phase 6)** | `4b5b193` |
| **Metadata-correction commit (Phase 6, cont.)** | `5df3c0b` |
| **Progress-selector & canonical-label closure (Phase 7)** | `e4d6180`, `19fa07e`, `db3cb07` |
| **Current branch HEAD (implementation)** | `db3cb07` |
| **Freeze-report correction commit** | `d26368d` (`docs(goals): freeze functional closure report`) |
| **Migration ordering hardening** | `fa0c658` (`fix(goals): harden client goal index migration ordering`) — see §5.1 |
| **Governing plan** | `docs/plans/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_PLAN.md` (v1.1) |
| **Production preflight runbook** | `docs/runbooks/FITDESK_GOAL_INDEX_PRODUCTION_PREFLIGHT.md` (created this update) |
| **Baseline audit** | `docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md` |

> **Isolation note.** The migration-hardening commit `fa0c658` lives on an **isolated worktree branch** `fix/goal-index-migration-ordering`, based on `db3cb07`'s tree state (`d26368d`), created for autonomous overnight work. It is **not yet merged** into `fix/goal-system-functional-closure`, has **not** been pushed, and has **no** open pull request. This freeze-report update and the new runbook are committed on that same isolated branch. Merging `fa0c658` into the closure branch is a human review step (see §13).

## Verdict

**READY TO FREEZE**

This means:
- The Goal System branch is **functionally complete** and eligible for a **documentation freeze** — implementation, automated verification, and live manual/browser QA (product owner, this update) all pass.
- This **does not authorize an automatic production deployment**. Freezing the branch is a statement about the code and its verification, not a deployment decision.
- A merge into an auto-deploying `main` branch **remains blocked** until the production schema/migration preflight (§5) is completed and separately approved. See §12 for the explicit release-decision gates.

---

## 1. Scope delivered (Phases 1–7)

| Phase | Outcome | Commit |
|---|---|---|
| 1 — Close create-time data loss | Both selector states emit a complete `selectedGoals[]`; per-goal notes captured; no primary-only truncation | `a2a781d` |
| 2 — Complete Hub hydration/display | `ClientGoalSummary` carries all fields; Hub renders primary/urgency/both sub-goal layers/notes/safety | `8576b84` |
| (housekeeping) | Reverted a duplicate roadmap doc that the previous run created against instructions | `1b299f0` (reverts `37c66a2`) |
| 3 — Transactional updates | `replaceClientGoals` (strict replace-set, archive semantics, atomic, audit) + `updateClientGoalsAction` | `3d592a6`, corrected in `3d9652a` |
| 4 — Reachable Hub editor | `GoalEditorSheet` (confirmed-first) reusing the GoalWorkspace reducer; edit-page link | `be870bf` |
| 5 — Integrity & canonicalization | Centralized primary invariant; partial unique indexes (defense-in-depth); AI parse derived from taxonomy; dead selectors removed; flag parity proven | `62477e3` |
| 6 — Verification & freeze (candidate) | Initial candidate freeze report | `4b5b193`, metadata correction `5df3c0b` |
| 7a — Canonical labels in Client Hub | Goal-card titles, focus/assessment chips, progress goal-link dropdown, and saved progress-entry labels all resolved via shared `resolveGoalDisplayLabel`/`resolveSubGoalDisplayLabel` instead of raw-id/per-row fallback rendering | `e4d6180` |
| 7b — Selection feedback & notes clarity | Improved chip selected-state feedback (Add Client + Edit Goals); clarified separation between per-goal notes and general client notes | `19fa07e` |
| 7c — Progress goal-selector preservation | Removed `revalidatePath` from `addProgressEntryAction`; local server-confirmed-event state for Progress/Recent activity — fixes the trainer's explicit goal-link selection (including "No goal link") silently resetting to the primary goal immediately after submitting a progress entry | `db3cb07` |

**Phase 3 correction note (`3d9652a`):** the initial Phase 3 commit (`3d592a6`) contained defects that vitest did not catch because the test harness does not typecheck — the reconcile loop wrote to non-existent Drizzle properties (`subGoalIds`/`trainerSubGoalIds`/`safetyFlags`) which Drizzle silently dropped, so sub-goals and safety flags would not have persisted. The correction switched to the real JSON columns, fixed the context type, added `hasGoalHistory` (Decision D3), and expanded the test suite to round-trip non-empty sub-goals/safety. This is disclosed here rather than hidden.

**Phase 7c root cause (`db3cb07`):** a Server Action response that carries revalidated RSC data (from `revalidatePath`) automatically refreshes the currently active Next.js route and remounts `ClientHubPanel`, resetting its in-progress `progressGoalId` selection to a freshly-computed default — independent of whether the client ever called `router.refresh()` itself. The fix removes `revalidatePath` from this one action only; the caller already updates Progress/Recent activity locally from the action's own server-confirmed returned event. Sibling actions retain `revalidatePath` where their own contracts require it.

---

## 2. Automated checks that actually passed (exact commands + totals)

| Check | Command | Result |
|---|---|---|
| Full unit/integration suite (isolated, authoritative) | `npx vitest run --no-file-parallelism --maxWorkers=1 --exclude ".claude/worktrees/**"` | **2410 passed / 2410**, 79 files, exit 0 |
| Goal-system + Client Hub targeted group | `npx vitest run lib/goals lib/clients/__tests__/{repository,hub-map,ai-parse,progress-goal-selection}.test.ts components/clients/GoalAccordion lib/db/__tests__/client-goal-indexes.test.ts actions/clients.test.ts` | 1036 passed / 1037, 23/24 files (see reliability note below) |
| Repository (isolation) | `npx vitest run lib/clients/__tests__/repository.test.ts` | included in full suite, passing |
| Isolated index verification | `npx vitest run lib/db/__tests__/client-goal-indexes.test.ts` | included in full suite, passing |
| Lint | `npx next lint` | exit 0 — *No ESLint warnings or errors* |
| Build | `npm run build` | exit 0 — *Compiled successfully* (22 routes, both canonical and intercepted-overlay client routes) |
| Local Docker health | `docker ps` / `curl /api/health` | `axis-local-fitdesk-1` healthy; `200 OK` |

> **Test-runner reliability note (not a Goal System blocker):** two vitest invocations on this development machine — one full-suite run with `next lint` running concurrently in the background, and one large focused-subset run — each hit a single transient `Worker exited unexpectedly` fork crash, with zero failing assertions in either case (all tests that did run passed). A clean, isolated re-run of the exact same full-suite command immediately afterward passed completely: **79/79 files, 2410/2410 tests, exit code 0, no `.claude/worktrees` paths, no worker crash.** This pattern is consistent with Node/OS fork-resource contention under concurrent background load, not a defect tied to any specific test file or to Goal System code. It is noted here for CI-reliability awareness (avoid running large concurrent vitest invocations on constrained hardware), not as an implementation risk.

> Note on `tsc`: pre-existing type errors exist in several **unrelated test files** (e.g. `actions/messages.test.ts`, `actions/schedulingActions.test.ts`, `lib/__tests__/pilot.test.ts`) that predate this branch and were not touched. `next build` (the authoritative gate) compiles clean.

### Acceptance matrix — automated coverage

| Scenario | Automated evidence |
|---|---|
| Create with `selectedGoals: []` | GoalAccordion parity tests + create path |
| Create one / multiple complete goals | `repository.test.ts` replace + create suites |
| Exactly one primary when nonempty | `primary-invariant.test.ts`, repository B-suite |
| Change primary (atomic, no transient dup) | repository "sets index primary fields"; write-order hardening + index test |
| Change urgency | repository C-suite (`advances updatedAtUtc`) |
| Add/remove both sub-goal layers (replace, not append) | repository "replaces (does not append) sub-goal arrays" |
| Edit / clear notes (trim, blank/null→null, omitted→reject) | repository sub-goal/notes + strict-validation suites |
| Archive / reactivate (same row, createdAtUtc preserved) | repository C-suite reactivation test |
| Reduce to zero (index primary fields null) | repository B-suite zero-goal test |
| Hard conflict → zero writes | repository A-suite |
| Malformed replacement → zero writes | repository A-suite (unknown/duplicate/sub-goal/omitted-notes) |
| Safety recompute + display | repository "sub-goal + safety persistence"; hub-map field tests |
| Cross-tenant access fails closed | repository E-suite + `hasGoalHistory` tenant-scope test |
| Both selector states equivalent persistence | GoalAccordion selector-parity tests |
| No ERP fallback once local history exists | `hasGoalHistory` tests + hub-map D3 tests |
| No competing ERP/local display | detail-page gating on `!hub?.hasGoalHistory` (code) + hub-map tests |
| Canonical goal/sub-goal labels on every display surface | `lib/goals/__tests__/format.test.ts` (shared helper tests) + `hub-map.test.ts` |
| Progress goal-selector preservation (explicit selection survives submission) | `lib/clients/__tests__/progress-goal-selection.test.ts` + `actions/clients.test.ts` (`revalidatePath` not called) |

---

## 3. Manual / Browser QA — Executed and Confirmed by Product Owner

**This corrects the prior version of this report, which incorrectly stated no browser/E2E QA had been executed.** Claude did not perform this QA — Claude lacked login credentials for the local stack in every session of this engagement. The product owner independently executed live QA in a browser against the rebuilt local Docker image and confirmed the following:

**Goal UX (Commit A):**
- Selected Add Client chips showed checkmarks and a visually distinct selected state.
- Edit Goals chips showed checkmarks and a visually distinct selected state.
- "Notes for this goal" and "General client notes" were visibly separate fields.
- Goal edits and notes persisted correctly.

**Progress selector (Commit B):**
- Zero-goal client remained unlinked.
- One-goal client defaulted to Rehabilitation & Recovery.
- Multi-goal client initially defaulted to Strength & Power.
- Explicit "No goal link" remained selected immediately after submission.
- "Mobility & Flexibility" remained selected immediately after submission.
- Server-confirmed entries appeared immediately.
- Unlinked entries displayed without a goal badge.
- Linked entries displayed the canonical "Mobility & Flexibility" badge.
- Recent activity updated immediately.
- Entries remained visible after navigating away and reopening.
- F5 reset the selector to Strength & Power (correct fresh-load default).
- This behavior was revalidated after a no-cache Docker build and container force-recreate.
- The local FitDesk container was healthy throughout.

This QA covers the full Goal UX (Commit A) and Progress selector (Commit B) acceptance scenarios end-to-end in a real browser, superseding the automated-only evidence claimed in the prior version of this report.

---

## 4. Manual QA still pending (product owner)

The following were **not** covered by the QA pass recorded in §3 and remain open:

1. **Confirmed-first save-failure UX** — editor stays open during save, disabled submit while pending, success only after server success, and the sheet stays open with input intact when a save fails server-side. (Logic is unit-tested; this specific failure-path UX was not exercised live.)
2. **Mobile 375px** — `GoalEditorSheet` bottom-sheet layout, scroll, and safe-area padding on a real 375px viewport.
3. **Accessibility** — dialog focus management, keyboard operability, Escape-to-close under real focus conditions (the underlying `aria-*` attributes are present in code and were not disproven, but were not exercised with assistive tech or keyboard-only navigation).
4. **Hard-conflict save block** — the sheet's disabled save + message when a hard conflict is present.
5. **Full acceptance matrix walkthrough across both flag states** — the QA in §3 was run against one flag configuration; the full matrix across both selector states / flag states has not been separately re-walked.

None of these are Goal System blockers — the underlying logic for each is unit-tested — but they remain open manual-QA items the product owner may choose to close before or after freeze, at their discretion.

---

## 5. Production backup / migration / deployment gates still pending

The Phase 5 partial unique indexes (`lib/db/schema.ts`, `scripts/migrate-app.mjs`, introduced by `62477e3`) were verified **only against isolated temporary libSQL databases**. These are **production deployment gates, not Goal System functional blockers** — the Goal System itself is complete and correct with or without these indexes (the repository layer enforces the same invariants at the application level; the indexes are additive defense-in-depth). Before any production deployment:

a. **Verified production backup** — not performed here; **no production backup verification is claimed.**
b. **Read-only duplicate-data scan** — scan `(tenant_id, client_index_id, goal_id)` among `status='active'` rows and remediate any pre-existing duplicates **before** the unique indexes are applied (a duplicate would make `CREATE UNIQUE INDEX` fail).
c. **Staged migration execution** — run `scripts/migrate-app.mjs` against staging, then production, during a separately-approved deployment. DDL is additive and idempotent (`IF NOT EXISTS`), verified idempotent in the isolated test.
d. **Rollback procedure** — the indexes are additive; rollback is `DROP INDEX client_goal_active_uniqueness; DROP INDEX client_goal_active_primary;`. The repository enforces the same invariants without them, so dropping the indexes does not corrupt data.
e. **Deployment approval** — merge to `main` → auto-deploy remains a separate, human-approved gate, distinct from and subsequent to gates a–d.

---

## 5.1 Migration ordering hardening (2026-07-15, commit `fa0c658`)

A strictly read-only migration preflight found a **statement-ordering defect** in `scripts/migrate-app.mjs` as introduced by `62477e3`. This section records the confirmed defect, the fix, and its verification. **The Goal System feature was already complete; this hardens the deployment/migration path only.**

**Confirmed original defect.** The two goal-system partial unique indexes were declared inside the `statements` array, which executes **before** the `ALTER TABLE "client_goal" ADD COLUMN "is_primary"` later in the same script. Because `client_goal_active_primary`'s predicate references `is_primary`, creating it there fails with `no such column: is_primary` on **any database that predates the `is_primary` column** — fresh installs, disaster-recovery-to-empty, and fresh staging clones. Since `migrate-app.mjs` runs as a **hard startup gate** (via `scripts/start-with-migrations.mjs`, before the server; a non-zero exit aborts startup), this would crash-loop such a container. The existing isolated test (`client-goal-indexes.test.ts`) could not catch it because it pre-creates `client_goal` **with** `is_primary` and only exercises the indexes in isolation, never the real script's statement order. *(Note: production, if deployed from `main` at/after `5fc18c5`, already has the `is_primary` column, so the defect primarily threatens fresh/DR/staging bootstraps and any environment whose `is_primary` presence is unverified — hence the runbook's schema-state gate.)*

**Corrected execution order** (now enforced by `fa0c658`): `client_goal` table exists → `is_primary` + `trainer_sub_goal_ids_json` ALTERs → existing backfills (incl. the `is_primary` backfill) → `client_goal_active_uniqueness` → `client_goal_active_primary` → verification. The index SQL is **unchanged** (identical names, columns, predicates, `CREATE UNIQUE INDEX IF NOT EXISTS`). No transaction wrapper was introduced (the task and existing structure favor per-statement autocommit); conflicting data still fails loudly (non-zero exit, **no silent repair or deletion**), and reruns remain deterministic and idempotent.

**Automated coverage added** — `lib/db/__tests__/migrate-app.test.ts` spawns the **real** `migrate-app.mjs` as a child process against throwaway `file:` databases under the OS temp directory (synthetic env only, no network, no real/remote/Turso DB, no `/app/data`, no repo/volume DB):

| Scenario | Result |
|---|---|
| **A. Fresh empty database** | Exit 0; `client_goal` + `is_primary` + `trainer_sub_goal_ids_json` present; both indexes created with exact names/columns/predicates; **no `no such column: is_primary`**. |
| **B. Idempotent second run** | Exit 0; each target index present exactly once; no duplicate-index/column errors. |
| **C. Legacy upgrade fixture** | Old-shape `client_goal` (no `is_primary`) + valid rows → exit 0; columns added; `is_primary` backfilled from `client_index.primary_goal_id`; both indexes created; **existing rows preserved (no deletion)**. |
| **D. Duplicate active goal conflict** | Non-zero exit; clear index-creation error; **no row deletion/repair**; uniqueness index not falsely created. |
| **E. Multiple active primary conflict** | Non-zero exit; clear index-creation error; **no row deletion/repair**; primary index not falsely created. |
| **F. Temp-database safety** | Every DB path asserted under the OS temp dir, `file:` URL only, never a real FitDesk DB. |

**Verification totals for `fa0c658`** (run in the isolated worktree):
- Focused: `migrate-app.test.ts` + `client-goal-indexes.test.ts` → **13 passed / 13** (2 files).
- Full isolated suite (`npx vitest run --no-file-parallelism --maxWorkers=1 --exclude ".claude/worktrees/**"`) → **80 files / 2416 tests passed, exit 0, no `.claude/worktrees` paths, no worker crash** (clean on the first run — no retry needed). This is **+1 file / +6 tests** vs. the `db3cb07` baseline (the new migration test).
- Lint (`npx next lint`) → exit 0, no warnings/errors. Build (`npm run build`) → exit 0, *Compiled successfully*.
- **No production access** of any kind: no remote/Turso connection, no `.env`/secret read, no production DDL. All databases touched were throwaway files under the OS temp directory.

**Effect on the §5 gates.** Gate (c) staged migration is now safe for fresh/DR/staging bootstraps as well as the production upgrade path. The read-only conflict scans in gate (b) — plus a schema-state (`is_primary` presence) check — are now specified precisely in the new runbook (`docs/runbooks/FITDESK_GOAL_INDEX_PRODUCTION_PREFLIGHT.md`). Gates (a) verified backup, (b) read-only scan, (c) staged migration, (d) rollback, and (e) deployment approval **all remain open and human-owned.** This hardening does **not** authorize production deployment.

---

## 6. Tenant-isolation evidence

- `replaceClientGoals`: `assertTenantId(ctx)` (fail-closed on empty), loads `client_index` scoped by `tenant_id` and throws `client_not_found` on absence/mismatch; every write is tenant-stamped; returns the tenant-verified `erpCustomerId` used for revalidation (never a client-supplied id, Decision D9).
- `hasGoalHistory`: `assertTenantId(ctx)` + `tenant_id`-scoped query.
- `updateClientGoalsAction`: `resolveTrainerId()` then `getTenantContext()`, fails closed with "Tenant context not available." when absent; passes only `{ tenantId: ctx.tenantId }` to the repository.
- Tests: cross-tenant update rejected; missing tenant fails closed; cross-tenant `hasGoalHistory` returns false.

## 7. Forbidden-side-effect evidence

Scanned the goal create/update paths (`replaceClientGoals`, `updateClientGoalsAction`, `GoalEditorSheet`, `GoalWorkspace/*`) and the progress-entry path (`addProgressEntryAction`): **no** ERP mutation, invoice, Payment Entry, package consumption, session creation/completion, WhatsApp send, program creation, or network `fetch`. `lib/clients/repository.ts` contains zero `erpnext` references. Goal editing is strictly local; the only external effect on the goal paths is `revalidatePath` on the client route. `addProgressEntryAction` (Phase 7c) intentionally omits `revalidatePath` — see §1 Phase 7c.

## 8. Isolated index / migration evidence

`lib/db/__tests__/client-goal-indexes.test.ts` (part of the 79-file suite, against the actual `@libsql/client`): confirms the engine supports partial `WHERE` unique indexes; the DDL is idempotent; the uniqueness index blocks a duplicate **active** `(tenant, client, goal)` while allowing archived duplicates and active reuse alongside archived history; the primary index blocks a second **active primary** per `(tenant, client)`.

---

## 9. Files changed (by phase)

Since `6b4bf1d`, through Phase 7 (`db3cb07`). Highlights:

- **Phase 1:** `GoalAccordion/{types,GoalAccordion}.tsx`, `AddClientForm.tsx` (+ tests)
- **Phase 2:** `types/clients.ts`, `lib/clients/hub-map.ts`, `ClientHubPanel.tsx`, detail/edit pages (+ tests)
- **Phase 3 (+correction):** `lib/clients/repository.ts`, `actions/clients.ts`, `lib/clients/hub.ts` (+ repository/hub-map tests)
- **Phase 4:** `components/clients/GoalEditorSheet.tsx` (new), `GoalWorkspace/{state,reducer,index}.ts`, `ClientHubPanel.tsx`, edit page (+ workspace tests)
- **Phase 5:** `lib/goals/primary-invariant.ts` (new), `lib/db/schema.ts`, `scripts/migrate-app.mjs`, `lib/clients/ai-parse.ts`, deleted `components/ui/GoalSelect.tsx` + `GoalMultiSelect.tsx`, `lib/db/__tests__/client-goal-indexes.test.ts` (new), primary-invariant + parity tests
- **Phase 7a (`e4d6180`):** `components/modules/ClientHubPanel.tsx`, `lib/goals/display.ts` (new), `lib/goals/__tests__/format.test.ts` (new)
- **Phase 7b (`19fa07e`):** `components/clients/AddClientForm.tsx`, `components/clients/GoalAccordion/GoalAccordion.tsx`, `components/clients/GoalWorkspace/ActiveGoalInspector.tsx`
- **Phase 7c (`db3cb07`):** `actions/clients.ts`, `actions/clients.test.ts`, `components/modules/ClientHubPanel.tsx`, `lib/clients/hub-map.ts` (+ tests), `lib/clients/progress-goal-selection.ts` (new, + tests)

## 10. Commits (this branch)

```
db3cb07 fix(clients): preserve progress goal selection                 (Phase 7c)
19fa07e fix(goals): improve selection feedback and clarify notes       (Phase 7b)
e4d6180 fix(goals): resolve canonical labels in client hub             (Phase 7a)
5df3c0b docs(goals): correct closure freeze report metadata            (Phase 6, cont.)
4b5b193 docs(goals): add goal system closure candidate report          (Phase 6)
62477e3 refactor(goals): enforce canonical goal system invariants      (Phase 5)
be870bf feat(goals): enable client goal editing from client hub        (Phase 4)
3d9652a fix(goals): complete transactional goal update guarantees      (Phase 3 correction + D3)
3d592a6 feat(goals): add transactional client goal updates             (Phase 3)
1b299f0 Revert "docs: add Phase 3-6 implementation roadmap"            (housekeeping)
8576b84 fix(goals): hydrate complete goal state in client hub          (Phase 2)
a2a781d fix(goals): preserve complete goal drafts on client creation   (Phase 1)
```

## 11. Remaining risks

1. **No live browser/DOM coverage for a subset of manual QA items** (§4) — confirmed-first save-failure UX, 375px mobile layout, assistive-tech accessibility, and hard-conflict save block. *Mitigation: the underlying logic for each is unit-tested; §3's live QA pass already covers the primary Goal UX and Progress selector acceptance scenarios end-to-end.*
2. **Pre-existing duplicate active rows in production** would block the unique-index migration. *Mitigation: the §5 read-only scan gate must run first; the app has enforced repository-level uniqueness only since this branch, so legacy data could in principle contain duplicates.*
3. **Legacy never-projected clients** with zero active goals and no local history still show ERP `custom_fitness_goals` text and have no Hub "Edit goals" entry point (only clients with local history do). This is intended fallback behavior, not a regression, but such clients cannot yet open the editor from the Hub.
4. **Pre-existing unrelated test-file type errors** remain (not introduced here); they do not affect `next build`.
5. **"Reorder" is not an implemented capability.** No drag/move action exists anywhere in the `GoalWorkspace` reducer (`ADD_GOAL`/`REMOVE_GOAL`/`SET_PRIMARY`/etc. — no `MOVE_GOAL`). Goals currently follow **add-order**: the order goals were selected in, with no explicit UI reorder control. This was never implemented and was never part of this closure's scope — it is **not** a regression and **not** a blocker. Any acceptance wording that implied reorder as a delivered capability is corrected by this report.
6. **Test-runner concurrency flake** (§2) — noted for CI-reliability awareness only, not a code defect.
7. **Migration fresh-bootstrap ordering defect — RESOLVED** (§5.1, commit `fa0c658`). The `no such column: is_primary` failure on fresh/DR/staging bootstraps is fixed by reordering the goal-system index creation after the `is_primary` column and backfill, with real-child-process migration tests. Merging `fa0c658` into the closure branch is a pending human step (§13). Production's own upgrade path was not affected by the original defect (production already has `is_primary`), but the runbook still verifies that assumption before any migration.

---

## 12. Release Decision

| Gate | Status |
|---|---|
| **Branch freeze** | **APPROVED** — Goal System implementation (Phases 1–7) is functionally complete, automated-verified, and live-QA-confirmed by the product owner. |
| **Controlled merge preparation** | **APPROVED** — *only* when merging does not automatically trigger a production deployment (e.g., a merge target/process without an auto-deploy hook, or a merge gated behind a separate manual deploy step). |
| **Merge to an auto-deploying production `main` branch** | **BLOCKED** until the production migration preflight (§5, gates a–d) is completed and separately approved. |
| **Production deployment** | **NOT AUTHORIZED** by this freeze report. This document freezes the branch and its documentation; it is not a deployment approval. |
| **Deferred Pay-per-Session billing** | Remains **out of scope** for this branch and report. Must be handled on its own separate release-blocking branch. |

## 13. Recommended next sequence

A. Review the two isolated-branch commits from the overnight run (`fa0c658` migration hardening + this documentation commit) and merge `fa0c658` into `fix/goal-system-functional-closure`.
B. Follow the production preflight runbook (`docs/runbooks/FITDESK_GOAL_INDEX_PRODUCTION_PREFLIGHT.md`): confirm production database identity, then run the read-only conflict scans (duplicate active goal, multiple active primary, backfill hazard) plus the `is_primary`-presence and existing-index checks.
C. Verify a production backup artifact + restore readiness (§5a).
D. Approve the migration and rollback procedure (§5c–d) with whoever owns production deployment sign-off.
E. Only then prepare the controlled merge/deployment gate (§12) — this step is explicitly **not** authorized by this report alone.

## 14. Handover status

- Branch `fix/goal-system-functional-closure` — implementation complete through Phase 7 at `db3cb07` — **READY TO FREEZE** per §Verdict and §12.
- `main` untouched at `6b4bf1d`; nothing merged, pushed, or deployed.
- Working tree clean at the time of this report.
- Production deployment remains **blocked** until the §5 gates are cleared and the §12 release decision's merge/deploy gates are separately approved.
