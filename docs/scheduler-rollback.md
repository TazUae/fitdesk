# Scheduler UI Rollback Runbook

## Context

The FitDesk scheduler UI was migrated from a custom React/Tailwind calendar
to Schedule-X across Phases 1–13. As of Phase 12, Schedule-X is the only
implementation; the legacy `CalendarView` and the `SCHEDULER_UI` feature
flag have been removed. Rollback is now git-revert based.

## Rollback targets

- **Backup tag:** `scheduler/custom-v1-backup` — annotated tag anchoring
  the custom scheduler snapshot at the audit point (2026-04-24). Source
  of truth for the legacy implementation.
- **Migration branch:** `scheduler/schedulex-integration` — pre-merge
  reference for the full phased migration (Phases 1–13).

## Rollback methods, from least to most invasive

### 1. Revert the offending commit (preferred)

If a specific Schedule-X commit caused the regression, revert it on `main`
via `git revert <sha>` and deploy.

- **Effect:** behaviour returns to the prior commit.
- **RTO:** one deploy cycle.
- **Data impact:** none.

### 2. Restore from tag (full rollback to legacy calendar)

If Schedule-X is fundamentally broken in production, restore the legacy
calendar from the backup tag onto a hotfix branch.

```
git checkout -b hotfix/restore-custom-calendar
git checkout scheduler/custom-v1-backup -- components/scheduling/CalendarView.tsx
# Re-wire CalendarView in components/modules/ScheduleView.tsx
# Re-add the CalendarSession / QuickAddRange exports if needed
```

The legacy view depends only on types in `types/scheduling.ts` and
`lib/ui/scheduleDesignTokens.ts`, both of which still exist. Restoring
the file alone is enough; no business-logic changes required.

- **Effect:** legacy calendar is rendered again; Schedule-X path is
  unused (or removed if the hotfix also rips out `SchedulerXAdapter`).
- **RTO:** half a day for the hotfix + deploy.
- **Data impact:** none.

## What is NOT a rollback concern

The migration deliberately did not touch any of the following, so none
of them need to be rolled back:

- ERPNext / Frappe data.
- `FD Session` and `FD Session Series` doctypes.
- `lib/scheduling/engine.ts`, `bookingService.ts`, `sessionService.ts`,
  `sessionRepository.ts`.
- Server actions in `actions/schedulingActions.ts`.
- Invoice creation, WhatsApp messaging, payment link generation, and
  package balance reads.
- Tenant context, Better Auth sessions, Control Plane JWT proxy.

## Runtime safety net

`SchedulerErrorBoundary` (Phase 10) wraps `SchedulerXAdapter`. If the
adapter throws on mount or during render it is replaced with a static
"Calendar failed to load. Please refresh the page." message and the
error is logged to the browser console with a `[scheduler-x]` prefix.
This catches mount-time crashes without taking down the page, but is
not a substitute for a real revert.

## Incident log

| Date | Environment | Reason | Method used | RTO | Outcome | Operator |
|------|-------------|--------|-------------|-----|---------|----------|
|      |             |        |             |     |         |          |

## Related references

- Backup tag: `scheduler/custom-v1-backup`.
- Migration branch: `scheduler/schedulex-integration` (Phases 1–13).

## Change log

- 2026-04-24 — Initial runbook created as part of Phase 1
  (backup tag + migration branch + runbook). No runtime changes.
- 2026-04-25 — Phase 11 flipped `SCHEDULER_UI` default to `schedulex`.
- 2026-04-25 — Phase 12 deleted `CalendarView` and removed the
  `SCHEDULER_UI` flag. Runbook rewritten to drop flag-flip rollback;
  revert / tag-restore are the remaining paths.
