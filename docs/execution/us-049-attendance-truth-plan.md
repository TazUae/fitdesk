# US-049 — Session Outcome Counts / Attendance Truth — Implementation Note

> Short plan note per the batch instructions (implementation shape wasn't obvious).
> Governed by `docs/execution/phase-1-plus-safe-run-plan.md`.

## Decision: count on raw `FDSession[]`, not the legacy-adapted `Session[]`

`lib/dashboard/fdSessionAdapter.ts`'s `mapFDStatus` folds `no_show` → `'missed'` and
`skipped` → `'cancelled'` when adapting to the legacy 4-value `SessionStatus` the client
detail page renders. Counting on that adapted view would silently lose the skipped-vs-
cancelled distinction the task explicitly asks to preserve ("skipped where already
meaningful"). The new pure helper (`lib/scheduling/attendance.ts`) operates directly on
`FDSession[]` so all 6 statuses stay distinct.

## Decision: no fabricated "rescheduled" count

Reschedule (US-039) updates the existing FD Session's `start_at`/`end_at` in place —
there is no `rescheduled` status and no reschedule-count field on the DocType. Deriving a
count from `version` deltas would be indistinguishable from any other patch (e.g. a notes
edit) and would be a fabricated number. Per the task's own instruction, this is
**documented as a limitation, not faked** — `SessionOutcomeCounts` has no reschedule field.

## Decision: separate read, not a widened `getClientSessions` return shape

`getClientSessions` (`lib/clients/clientSessions.ts`) already returns `Session[]` directly,
has 5 existing tests asserting that exact shape, and 2 callers (the canonical client
detail page + the intercepting overlay route). Widening its return type to
`{sessions, outcomeCounts}` would touch both callers and rewrite passing tests for a
purely additive feature.

Instead: a new, separate, read-only export `getClientAttendanceCounts(trainerId, clientId)`
calls `findSessionsForClient` again and derives counts. This costs one extra ERP read when
both are called together, but touches zero existing tested contracts. `getClientSessions`
itself is unmodified.

## Wiring: canonical client detail page only

`app/dashboard/clients/[id]/page.tsx`'s existing "Sessions (N)" header is the one safe,
already-existing display surface — a small additive line is appended below it. The
overlay route (`app/dashboard/@overlay/(.)clients/[id]/page.tsx`) does not render a
session list at all (it only uses `sessions` internally for `getNextUp`), so there is no
safe surface there — left untouched.

## Not in scope

- No dashboard/business-health wiring (out of scope; no request for it here).
- No invoice/payment/package mutation — purely additive read/derive/display.
- No change to session mutation behavior (`completeSession`/`markNoShow`/`cancelSession`/
  `rescheduleSession` are untouched).
