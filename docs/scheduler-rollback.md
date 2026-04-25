# Scheduler UI Rollback Runbook

## Context

The FitDesk scheduler UI is being migrated from the custom React/Tailwind
calendar to Schedule-X. The migration runs in phases behind the
`SCHEDULER_UI` feature flag. The custom calendar remains fully operational
and is the rollback target at every phase.

This runbook is created as part of Phase 1 of the approved Schedule-X
integration plan. It must be kept in sync with that plan.

## Rollback targets

- **Backup tag:** `scheduler/custom-v1-backup` — annotated tag anchoring
  the custom scheduler snapshot at the audit point (2026-04-24).
- **Snapshot branch:** `scheduler/custom-v1-snapshot` — local branch that
  holds the tagged commit. The tag is the source of truth; the branch is
  the commit's current label and is not pushed to the remote.
- **Migration branch:** `scheduler/schedulex-integration` — the feature
  branch where all Schedule-X work lives until production rollout
  completes. Pushed to `origin`.
- **Feature flag:** `SCHEDULER_UI` with values `schedulex` (default,
  Phase 11+) | `custom` (emergency rollback only, removed in Phase 12).

## Rollback methods, from least to most invasive

### 1. Feature flag flip (preferred)

Set `SCHEDULER_UI=custom` in the target environment.

- **Effect:** `ScheduleView` renders the original `CalendarView`. No code
  change. No deploy required if the env var is read at request time;
  otherwise one container restart.
- **RTO:** under 5 minutes.
- **Data impact:** none.

### 2. Revert the most recent migration PR

If a specific phase PR caused the regression, revert it on the
`scheduler/schedulex-integration` branch via `git revert`.

- **Effect:** behavior returns to the prior phase.
- **RTO:** one deploy cycle.
- **Data impact:** none.

### 3. Restore from tag (last resort)

If the migration branch is unrecoverable, check out
`scheduler/custom-v1-backup` to retrieve the audited scheduler source.

- Read-only inspection:
  `git checkout scheduler/custom-v1-backup`
- To restore specific files onto `main` or a hotfix branch:
  `git checkout scheduler/custom-v1-backup -- <path>`
- Do **not** force-push to `main`.
- **Data impact:** none. No schema changes have been made by the
  migration.

## What is NOT a rollback concern

The migration plan deliberately does not touch any of the following, so
none of them need to be rolled back:

- ERPNext / Frappe data.
- `FD Session` and `FD Session Series` doctypes.
- `lib/scheduling/engine.ts`, `bookingService.ts`, `sessionService.ts`,
  `sessionRepository.ts`.
- Server actions in `actions/schedulingActions.ts`.
  (Phase 10 only adds a strictly additive `newDurationMinutes` parameter;
  everything else is untouched.)
- Invoice creation, WhatsApp messaging, payment link generation, and
  package balance reads.
- Tenant context, Better Auth sessions, Control Plane JWT proxy.

## Rollback drill — run before declaring Phase 1 complete

1. On staging, set `SCHEDULER_UI=custom`. Confirm the planner renders the
   original calendar. Smoke test: book one-off session, reschedule,
   cancel, complete. Draft invoice appears in staging ERPNext.
2. Set `SCHEDULER_UI=schedulex`. Confirm the env branch exists; with no
   adapter present yet, the safe default must fall back to `custom`
   rendering.
3. Re-flip to `custom`. Smoke test again.
4. Record start and end timestamps for each flip in the incident log
   below.

## Incident log

| Date | Environment | Reason | Method used | RTO | Outcome | Operator |
|------|-------------|--------|-------------|-----|---------|----------|
|      |             |        |             |     |         |          |

## Related references

- Approved plan: see conversation history on the Schedule-X migration
  plan (Phases 1–13).
- Backup tag creation commit: `scheduler/custom-v1-backup`
  (annotated tag).
- Migration branch: `scheduler/schedulex-integration`.

## Change log

- 2026-04-24 — Initial runbook created as part of Phase 1
  (backup tag + migration branch + runbook). No runtime changes.
