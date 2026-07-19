# 01 — Architecture Truth Audit

> **Purpose:** Separate what is **proven** from what is **assumed**, so cleanup never deletes
> business value on the strength of a stale inference.
> **Last verified:** 2026-06-25 (read-only inspection of FitDesk `main` + sibling repos).
> **Update (2026-07-03):** G3 (PT vs FD Session) is now resolved by code — see the G-section
> update below and [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md).
> C1 (design tokens) is confirmed fixed. The rest of this audit's classifications stand as of
> 2026-06-25 and have not been re-verified item-by-item in this pass.

## Scope

Every load-bearing claim behind the cleanup program. Classifications:

| Class | Means | Default action |
|---|---|---|
| 🟩 VERIFIED FACT | Directly observed this session (git/file). | Safe to rely on. |
| 🟥 VERIFIED PROBLEM | Observed **and** a defect/risk/principle-violation. | Fix — confirm blast radius. |
| 🟨 HYPOTHESIS | Inferred, not confirmed. Could be wrong. | Verify before any destructive step. |
| 🟦 DECISION REQUIRED | Evidence cannot resolve it — needs a human call. | Escalate. |

"Risk if wrong" = what breaks or is lost if the classification is mistaken.

## Current known state — the audit

### Source control
- **A1** Workspace root is not a git repo; 7 sub-repos exist. 🟩 FACT · High.
- **A2** `erp-execution-service` and `provisioning-agent` primary checkouts are in **detached HEAD**. 🟥 PROBLEM · High. *Risk if ignored:* new commits orphan.
- **A3** FitDesk `main` is **ahead 17 / 2 untracked** (`.claude/launch.json`, `docs/research/`). 🟩 FACT · High.
- **A4** `provisioning_api` has **untracked ERP-app files** (FD Session DocType, `api/scheduling.py`, …) and is **behind 1**. 🟥 PROBLEM · High. *Risk:* untracked ERP app = deploy hazard. Classify each file before acting.
- **A5** 17 extra **git worktrees** exist across CP/EES/PA/prov_api. 🟩 FACT · High. Removal is non-destructive to branches.
- **A6** Those worktree branches are safe to prune. 🟨 HYPOTHESIS · Low. *Verify per branch (`git branch --merged`, `git log main..<branch>`) before deleting any.*
- **A7** `FitDesk;C` is an accidental directory. 🟨 HYPOTHESIS (strong) · Medium. *Inspect before removal.*
- **A8** `fitdesk-app` is a separate (Frappe-side?) repo, possibly abandoned. 🟦 DECISION · Low on role.

### Design tokens
- **C1** shadcn vars hold OKLCH triplets but Tailwind consumes them via `hsl(var(--x))` → invalid/wrong colors. 🟥 PROBLEM · High. *Evidence:* `app/globals.css` vs `tailwind.config.ts`.
  **RESOLVED (confirmed 2026-07-03) — 🟩 FACT.** `tailwind.config.ts` now wraps the same triplets
  with `oklch(var(--border))` etc.; the `hsl()` mismatch is gone.
- **C2** Blast radius is **small**: app styles via `var(--fd-*)` inline; only ~5 shadcn-utility usages (both in onboarding). 🟩 FACT (calibration) · Medium-High.
- **C3** `* { @apply border-border }` makes the broken value the global default border color. 🟥 PROBLEM (latent) · Medium.
- **C4** The token defect is the cause of "screens feel different / used to feel better." 🟨 HYPOTHESIS · **Low** ⚠️. *More likely Phase F. Do not promise C fixes the feel.*

### Dead code
- **D1** `TimeGrid` + `SessionBlock` are orphans (imported only by each other; absent from the live tree). 🟩 FACT · High. *Gate deletion on F0 + a snapshot tag — they encode the custom-grid UX.*
- **D2** `PlannerToolbar` / `PlannerSidebar` / `MiniCalendar` / `CalendarFilters` are **LIVE** (not dead). 🟩 FACT · High. *Mis-flagging these as dead would break the planner.*
- **D3** `AddClientSheet` is dead/unmounted. 🟨 HYPOTHESIS · Low. *Grep on current `main` before removal.*

### Scheduler (highest value-at-risk)
- **F1** SchedulerX is the live engine on `main` (`ScheduleView` → `SchedulerXAdapter`, `@schedule-x`). 🟩 FACT · High.
- **F2** `scheduler/custom-v1-snapshot` = exactly 1 unique commit (a snapshot). 🟩 FACT · High.
- **F3** `scheduler/schedulex-integration` = 11 unique commits, NOT an ancestor of `main`; includes drag-to-create and drag-to-reschedule. 🟩 FACT · High.
- **F4** Current `main` scheduler **lacks** drag-to-create / drag-to-reschedule the branch built (`editable: false`, create button hidden). 🟥 PROBLEM · Medium-High ⚠️.
- **F5** `backup/prepush-schedule-c0-before-rewrite` holds **72 unique commits**. 🟩 FACT · High. *Deleting it risks large work loss — untouchable until F0.*
- **F6** "Schedule used to feel better" is explained by F4. 🟨 HYPOTHESIS (evidence-backed) · Medium. *F0 confirms.*

### Sessions (highest silent-failure risk)
- **G1** FitDesk session UI + actions + types are fully built. 🟩 FACT · High.
- **G2** ERP session read is intentionally stubbed: *"The PT Session DocType does not exist in this ERP instance"* (`lib/erpnext/client.ts`). 🟩 FACT · High.
- **G3** **Naming mismatch (RESOLVED, confirmed 2026-07-03):** FitDesk's real session read/write path
  (`lib/scheduling/sessionRepository.ts`, `bookingService.ts`, `sessionCompletionService.ts`,
  `lib/dashboard/dashboardDataService.ts`) uses **`DOCTYPE_SESSION = 'FD Session'`** — FD Session is
  the shipped, canonical session architecture. 🟩 FACT · High. The old `lib/erpnext/client.ts:411-459`
  **"PT Session"** functions (`getSessions` → `[]`, `getSessionById`/`createSession`/
  `markSessionComplete`/`cancelSession`/`markSessionMissed` → throw 404/503) are a **dead/legacy
  stub**, not deleted, and not on the live session path. *Remaining risk:* the client detail page
  (`app/dashboard/clients/[id]/page.tsx:61`) still calls the dead PT Session path, so it shows an
  empty session history for clients who have live FD Sessions — tracked as Phase 4 in
  `FITDESK_REMAINING_ROADMAP_V2.md`, not fixed by this doc pass.
- **G4** The FD Session backend is deployed and live (not merely "untracked" as previously
  hypothesized) — FitDesk's scheduling/booking/completion/dashboard code reads and writes FD
  Session today. 🟩 FACT · High (updated from prior 🟨 HYPOTHESIS). G is no longer frozen on the
  naming decision; see `02` Phase G status update.
- **G5** PT Session lacks `custom_billing_mode` / `invoice_id` on `main` → completion is status-only. 🟩 FACT · High.
  *Note:* this describes the dead PT Session stub, not the live FD Session path — see `09` for
  FD Session's actual billing-completion behavior.

### CI / Deploy
- **H1** FitDesk has a substantial vitest suite + next build/lint; control-plane has integration tests. 🟨 HYPOTHESIS · Medium. *Run before encoding CI.*
  **Partially confirmed (2026-07-03):** `FITDESK_REMAINING_ROADMAP_V2.md` records the full suite at
  1565/1565 passing (`npx vitest run`, 2026-07-03). No `.github/workflows` directory exists yet —
  CI itself is still open, pulled forward as Phase 1.5 in the current roadmap.
- **I1** Deploy flow is per-service Git → Dokploy; push only on instruction. 🟩 FACT · High.

## Architecture rules (how to read this audit)

- Never escalate a 🟨 HYPOTHESIS to action without the named verification step.
- 🟦 DECISION items block the phases they touch (G3 blocks G; A8 blocks parts of A/D).
- A 🟥 PROBLEM is safe to fix **only** after its blast radius is confirmed (see C2 vs C1).

## Do-not-touch areas

- The scheduler branches (F2/F3/F5) and components (D1) — frozen until F0.
- The session DocType identity is **decided** (FD Session, see G3 update above); the **PT Session
  stub code itself stays untouched/undeleted** until the Phase 4 rewire + verification in
  `FITDESK_REMAINING_ROADMAP_V2.md` completes.

## Open decisions (consolidated)

1. ~~**PT Session vs FD Session**~~ — **RESOLVED (2026-07-03):** FD Session is canonical/shipped;
   PT Session is legacy/dead. Remaining follow-on work (client-detail-page rewire, `getSessionById`
   trainer scoping) is tracked in `FITDESK_REMAINING_ROADMAP_V2.md` Phase 4 and `09` (H5), not as an
   open naming decision.
2. **`schedulex-integration` UX** — port drag-create/reschedule into `main`, or accept reduced scope?
3. **`backup/prepush-schedule-c0`** (72 commits) — keep / extract / discard?
4. **`fitdesk-app`** — live Frappe app or abandoned?
5. **Worktree-branch triage (A6)** — confirm keep/drop per branch before pruning.
6. **Expectation-setting** — accept C (tokens) ≠ the "feel" fix; the feel regression is owned by F.

## Verification checklist

- [ ] Re-run `git status -sb`, `worktree list`, and `rev-list --count main..<scheduler-branch>` if more than a few days old.
- [ ] Re-confirm D3 (`AddClientSheet`) and H1 (test counts) before relying on them.
- [ ] Confirm C2 blast radius by auditing `components/ui/*` for shadcn token utilities.

## Related files

- `app/globals.css`, `tailwind.config.ts`, `components/scheduling/*`, `components/modules/ScheduleView.tsx`,
  `actions/sessions.ts`, `lib/erpnext/client.ts`, `lib/erpnext/types.ts`.

## Related ADRs

- `ADR-001`, `ADR-UX-004/006/011`. Missing ADRs that would formalize these findings: see `14`.

## Next actions

- Resolve the six Open Decisions, then proceed to `02`/`03`.

---

### Known prior audit conclusions from planning sessions (planning-context only — not on-disk sources)

The following were produced in earlier planning conversations and are **not present on disk**.
They are recorded here as context, not as authoritative source files:

- "Master Recovery Plan," "Repository Recovery Report," "Deployment Readiness Report,"
  "Scheduling Archaeology Audit," and "ADR-SCH-001" — referenced in conversation; **no files found**
  in the repository. Their substantive conclusions have been re-derived from live repository state
  and folded into this audit. Do not cite them as if they exist on disk.
