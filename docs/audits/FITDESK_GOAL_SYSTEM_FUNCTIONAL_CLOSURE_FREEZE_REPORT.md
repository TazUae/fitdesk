# FitDesk Goal System — Functional Closure Candidate Freeze Report

| | |
|---|---|
| **Product** | FitDesk |
| **Document** | Goal System Functional Closure — Candidate Freeze Report |
| **Date** | 2026-07-13 |
| **Branch** | `fix/goal-system-functional-closure` |
| **Baseline (main)** | `6b4bf1d` (untouched) |
| **Implementation HEAD (Phases 1–5 complete)** | `62477e3` |
| **Candidate freeze report commit (Phase 6)** | `4b5b193` |
| **Current branch HEAD** | this docs-only metadata-correction commit (see §10 commit list; content is unchanged from `4b5b193` other than this metadata correction) |
| **Governing plan** | `docs/plans/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_PLAN.md` (v1.1) |
| **Baseline audit** | `docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_AUDIT.md` |

## Verdict

**PASS — IMPLEMENTATION COMPLETE, READY FOR PRODUCT-OWNER QA**

All automated closure gates pass (full suite, lint, build, isolated index verification, tenant-isolation and forbidden-side-effect checks). This is **not** a production freeze: browser/manual acceptance QA and the production backup/migration/deployment gates below remain and are the product owner's to execute.

---

## 1. Scope delivered (Phases 1–6)

| Phase | Outcome | Commit |
|---|---|---|
| 1 — Close create-time data loss | Both selector states emit a complete `selectedGoals[]`; per-goal notes captured; no primary-only truncation | `a2a781d` |
| 2 — Complete Hub hydration/display | `ClientGoalSummary` carries all fields; Hub renders primary/urgency/both sub-goal layers/notes/safety | `8576b84` |
| (housekeeping) | Reverted a duplicate roadmap doc that the previous run created against instructions | `1b299f0` (reverts `37c66a2`) |
| 3 — Transactional updates | `replaceClientGoals` (strict replace-set, archive semantics, atomic, audit) + `updateClientGoalsAction` | `3d592a6`, corrected in `3d9652a` |
| 4 — Reachable Hub editor | `GoalEditorSheet` (confirmed-first) reusing the GoalWorkspace reducer; edit-page link | `be870bf` |
| 5 — Integrity & canonicalization | Centralized primary invariant; partial unique indexes (defense-in-depth); AI parse derived from taxonomy; dead selectors removed; flag parity proven | `62477e3` |
| 6 — Verification & freeze | This report | `4b5b193` |

**Phase 3 correction note (`3d9652a`):** the initial Phase 3 commit (`3d592a6`) contained defects that vitest did not catch because the test harness does not typecheck — the reconcile loop wrote to non-existent Drizzle properties (`subGoalIds`/`trainerSubGoalIds`/`safetyFlags`) which Drizzle silently dropped, so sub-goals and safety flags would not have persisted. The correction switched to the real JSON columns, fixed the context type, added `hasGoalHistory` (Decision D3), and expanded the test suite to round-trip non-empty sub-goals/safety. This is disclosed here rather than hidden.

---

## 2. Automated checks that actually passed (exact commands + totals)

| Check | Command | Result |
|---|---|---|
| Full unit/integration suite | `npx vitest run` | **4698 passed / 4698**, 152 files, exit 0 |
| Goal-system targeted group | `npx vitest run lib/goals lib/clients/__tests__/{repository,hub-map,ai-parse}.test.ts components/clients/GoalAccordion lib/db/__tests__/client-goal-indexes.test.ts` | **764 passed / 764**, 20 files |
| Repository (isolation) | `npx vitest run lib/clients/__tests__/repository.test.ts` | **206 passed / 206** |
| Isolated index verification | `npx vitest run lib/db/__tests__/client-goal-indexes.test.ts` | **7 passed / 7** |
| Lint | `npx next lint` | exit 0 — *No ESLint warnings or errors* |
| Build | `npx next build` | exit 0 — *Compiled successfully* (22 routes) |
| Type-check (source) | `npx tsc --noEmit` (source files) | 0 errors in changed source files |

> Note on `tsc`: pre-existing type errors exist in several **unrelated test files** (e.g. `actions/messages.test.ts`, `actions/schedulingActions.test.ts`, `lib/__tests__/pilot.test.ts`) that predate this branch and were not touched. `next build` (the authoritative gate) compiles clean. A `| tail` pipe initially masked a genuine build failure (duplicate `urgency` key); it was found via `tsc`, fixed, and the build re-run capturing the real exit code (0).

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

---

## 3. Browser / E2E evidence actually executed

**None.** No Playwright/Cypress config or `test:e2e` script exists in this repo, and no DOM test environment (jsdom/RTL) is installed. Per the run constraint, **no browser-testing dependency was installed for this run.** The React component *logic* (reducer hydration, draft mapping, parity, confirmed-first control flow inputs) is unit-tested; the rendered DOM was not exercised.

---

## 4. Manual QA still pending (product owner)

These require a running app / device and were **not** executed here:

1. **Rendered reload fidelity** — refresh / direct-URL navigation shows the full goal set on the real page (logic is tested; the DOM render is not).
2. **Confirmed-first UX in the browser** — editor stays open during save, disabled submit while pending, success only after server success, `router.refresh()` pulls new state, failed save keeps the sheet open with input intact.
3. **Mobile 375px** — `GoalEditorSheet` bottom-sheet layout, scroll, and safe-area padding on a real 375px viewport.
4. **Accessibility** — dialog focus management, keyboard operability, Escape-to-close under real focus conditions.
5. **Hard-conflict save block** — the sheet's disabled save + message when a hard conflict is present.
6. **Full acceptance matrix walkthrough** on both flag states across Add Client (sheet, intercepted, full page) and the Client Hub.

---

## 5. Production backup / migration / deployment gates still pending

The Phase 5 partial unique indexes were verified **only against isolated temporary libSQL databases**. Before production:

1. **Production backup confirmation** — not performed here; **no production backup verification is claimed.**
2. **Read-only duplicate scan on production data** — scan `(tenant_id, client_index_id, goal_id)` among `status='active'` rows and remediate any pre-existing duplicates **before** the unique indexes are applied (a duplicate would make `CREATE UNIQUE INDEX` fail).
3. **Migration execution** — run `scripts/migrate-app.mjs` against staging, then production, during deployment. DDL is additive and idempotent (`IF NOT EXISTS`), verified idempotent in the isolated test.
4. **Rollback** — the indexes are additive; rollback is `DROP INDEX client_goal_active_uniqueness; DROP INDEX client_goal_active_primary;`. The repository enforces the same invariants without them, so dropping the indexes does not corrupt data.
5. **Deployment approval** — merge to `main` → Dokploy deploy remains a separate, human-approved gate.

---

## 6. Tenant-isolation evidence

- `replaceClientGoals`: `assertTenantId(ctx)` (fail-closed on empty), loads `client_index` scoped by `tenant_id` and throws `client_not_found` on absence/mismatch; every write is tenant-stamped; returns the tenant-verified `erpCustomerId` used for revalidation (never a client-supplied id, Decision D9).
- `hasGoalHistory`: `assertTenantId(ctx)` + `tenant_id`-scoped query.
- `updateClientGoalsAction`: `resolveTrainerId()` then `getTenantContext()`, fails closed with "Tenant context not available." when absent; passes only `{ tenantId: ctx.tenantId }` to the repository.
- Tests: cross-tenant update rejected; missing tenant fails closed; cross-tenant `hasGoalHistory` returns false.

## 7. Forbidden-side-effect evidence

Scanned the goal create/update paths (`replaceClientGoals`, `updateClientGoalsAction`, `GoalEditorSheet`, `GoalWorkspace/*`): **no** ERP mutation, invoice, Payment Entry, package consumption, session creation/completion, WhatsApp send, program creation, or network `fetch`. `lib/clients/repository.ts` contains zero `erpnext` references. Goal editing is strictly local; the only external effect is `revalidatePath` on the client route.

## 8. Isolated index / migration evidence

`lib/db/__tests__/client-goal-indexes.test.ts` (7 tests, against the actual `@libsql/client`): confirms the engine supports partial `WHERE` unique indexes; the DDL is idempotent; the uniqueness index blocks a duplicate **active** `(tenant, client, goal)` while allowing archived duplicates and active reuse alongside archived history; the primary index blocks a second **active primary** per `(tenant, client)`.

---

## 9. Files changed (by phase)

29 files, **+1643 / −315** since `6b4bf1d`. Highlights:

- **Phase 1:** `GoalAccordion/{types,GoalAccordion}.tsx`, `AddClientForm.tsx` (+ tests)
- **Phase 2:** `types/clients.ts`, `lib/clients/hub-map.ts`, `ClientHubPanel.tsx`, detail/edit pages (+ tests)
- **Phase 3 (+correction):** `lib/clients/repository.ts`, `actions/clients.ts`, `lib/clients/hub.ts` (+ repository/hub-map tests)
- **Phase 4:** `components/clients/GoalEditorSheet.tsx` (new), `GoalWorkspace/{state,reducer,index}.ts`, `ClientHubPanel.tsx`, edit page (+ workspace tests)
- **Phase 5:** `lib/goals/primary-invariant.ts` (new), `lib/db/schema.ts`, `scripts/migrate-app.mjs`, `lib/clients/ai-parse.ts`, deleted `components/ui/GoalSelect.tsx` + `GoalMultiSelect.tsx`, `lib/db/__tests__/client-goal-indexes.test.ts` (new), primary-invariant + parity tests

## 10. Commits (this branch)

```
4b5b193 docs(goals): add goal system closure candidate report            (Phase 6)
62477e3 refactor(goals): enforce canonical goal system invariants        (Phase 5)
be870bf feat(goals): enable client goal editing from client hub          (Phase 4)
3d9652a fix(goals): complete transactional goal update guarantees         (Phase 3 correction + D3)
3d592a6 feat(goals): add transactional client goal updates                (Phase 3)
1b299f0 Revert "docs: add Phase 3-6 implementation roadmap"               (housekeeping)
8576b84 fix(goals): hydrate complete goal state in client hub            (Phase 2)
a2a781d fix(goals): preserve complete goal drafts on client creation      (Phase 1)
```

## 11. Remaining risks

1. **No browser/DOM test coverage** for the editor — the confirmed-first UX and 375px layout rely on manual QA (§4). *Mitigation: logic is unit-tested; UX follows the existing SignOutConfirmSheet pattern.*
2. **Pre-existing duplicate active rows in production** would block the unique-index migration. *Mitigation: the §5 read-only scan gate must run first; the app has enforced repository-level uniqueness only since this branch, so legacy data could in principle contain duplicates.*
3. **Legacy never-projected clients** with zero active goals and no local history still show ERP `custom_fitness_goals` text and have no Hub "Edit goals" entry point (only clients with local history do). This is intended fallback behavior, not a regression, but such clients cannot yet open the editor from the Hub.
4. **Pre-existing unrelated test-file type errors** remain (not introduced here); they do not affect `next build`.

## 12. Handover status

- Branch `fix/goal-system-functional-closure` — implementation complete at `62477e3` (Phases 1–5), candidate freeze report at `4b5b193` (Phase 6) — **ready for product-owner QA**.
- `main` untouched at `6b4bf1d`; nothing merged, pushed, or deployed.
- Working tree clean.
- Modernization remains **blocked** until this report is product-owner-approved, manual QA (§4) passes, and the deployment gates (§5) are cleared (Decision D1).
