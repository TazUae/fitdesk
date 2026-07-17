# Sprint 2 — US-045 Business Health: Sessions This Week — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §5.1 (lines
> 485–500). Note this story is `NEXT` priority in the backlog, not `NOW` like
> the other three Sprint 2 stories — included per this sprint's explicit
> ordering instruction regardless.

## Acceptance criteria (verbatim from the backlog)

```
Priority: NEXT

Acceptance criteria:
Counts sessions from the approved session source.
Uses timezone-safe weekly boundaries.
Shows simple trend or comparison where available.
Does not conflict with Today Timeline.
```

## A real conflict found between the doc pack and the shipped code

`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` classifies this as "Built
but needs upgrade." The actual code disagrees, explicitly: `features/dashboard/components/BusinessHealth.tsx`'s
own header comment reads *"Unified 3-metric honest strip... No Sessions/Week.
No deltas. No fake data."* — this metric was **deliberately removed**, not
partially built.

Investigated rather than guessed past, per this session's standing
instruction to stop on doc conflicts rather than pick a side blindly.
`docs/product/FITDESK_DASHBOARD_COMMAND_CENTER_FREEZE_HANDOVER.md` (the
actual decision record) explains why, in its "Deferred until after Client
Area redesign" table: *"Sessions This Week (timezone-safe) | Requires real
session data + UTC/local timezone resolution."*

**That blocking condition no longer holds.** At the time of that freeze
handover, there was no live session backend — this predates the FD Session
architecture landing (confirmed via `docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`'s
own truth-repair history). Tonight's dashboard page already has real,
timezone-resolved session data on hand: `sessions: Session[]` from
`getDashboardSessions()` (live FD Session data via `fdSessionToSession`,
which already does UTC→local timezone conversion). The prerequisite the
freeze doc named is satisfied by other, already-shipped work — this is not
overriding the original decision, it's completing what that decision always
said should happen once the blocker cleared.

## Week boundary: rolling 7 days, not a calendar week with an assumed start day

`types/settings.ts` defines `WeekStart = 'sunday' | 'monday' | 'saturday'`
and a `CalendarSettings.weekStartsOn` field — exactly the kind of
per-trainer preference "timezone-safe weekly boundaries" would ideally
respect (MENA workspaces commonly use a Saturday or Sunday week start, not
Monday). **Checked and confirmed not wired to anything real** — repo-wide
grep for `CalendarSettings` found only the type definition, no settings
fetch, no persisted value, no UI. Building on an unwired settings field would
be building on sand; a future session that ships `CalendarSettings` for real
would need to revisit this anyway.

**Decision:** use a rolling 7-day window (today and the 6 days before it) —
timezone-safe (same local-date-string comparison already used throughout
`derive.ts`), unambiguous, and a legitimate, common interpretation of "this
week" for a business-health KPI (this is how many analytics dashboards
present "this week" — a trailing window, not a calendar week). Does not
depend on a setting that doesn't exist yet.

## Implementation plan

1. `lib/dashboard/dashboardDataService.ts` — extend `getDashboardSessions`'s
   lookback from 7 to 14 days so a full trailing "last week" window is also
   available for the trend comparison (small, backward-compatible change to
   an existing date-range parameter — not a new function, not a new query
   shape).
2. `lib/dashboard/derive.ts` — `getSessionsThisWeek(sessions, today):
   { thisWeekCount, lastWeekCount, completedThisWeek }` — pure function,
   counts non-cancelled sessions in [today-6, today] vs. [today-13,
   today-7], using the same date-string comparison convention as every other
   function in this file. Satisfies "counts sessions from the approved
   session source" (takes the same `Session[]` `getNextUp`/`getTodaySections`
   already consume) and "simple trend or comparison" (this-week vs.
   last-week delta).
3. Tests in `lib/dashboard/derive.test.ts`: window boundaries (inclusive at
   both ends), cancelled sessions excluded, empty-sessions default, the
   trend delta direction (more/fewer/same as last week).

## Scope decision: UI wiring not done tonight

`BusinessHealth.tsx` is a fixed `grid-cols-3` layout, and its own header
comment states the 3-cell design and the "No Sessions/Week" exclusion were
deliberate, reviewed choices (confirmed via the freeze handover doc above —
this passed a real QA pass as a 3-cell strip). Adding a 4th metric means
either restructuring to 4 columns or replacing one of the three existing
cells — a real visual/product design decision, not a mechanical addition
like `ActionCenter.tsx`'s per-type branches were. Combined with the
`.tsx`-testing gap (no way to verify a layout change renders correctly
without a browser), this is judged the same category of risk as US-057's
deferred UI: real, tested logic delivered; the visual integration left as a
clearly-flagged follow-up rather than rushed. Flagged in the Sprint 2
report.

## Gate

`node scripts/story-gate.mjs` must pass before commit.
