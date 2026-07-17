/**
 * Session reschedule service — moves an existing FD Session to a new local
 * date/time (US-039).
 *
 * Approved design (docs/execution/phase-1-plus-safe-run-plan.md, US-039,
 * "Reschedule A vs B"): Option A — update the existing FD Session's
 * start_at/end_at in place. Financially inert by construction: this module
 * never resolves billing mode and never touches the invoice/package-ledger
 * dependencies at all (there are none to inject) — a reschedulable session is
 * always pre-completion (the mutable-status guard), so there is never an
 * invoice or package debit to disturb.
 *
 * Reuses the pure scheduling primitives from lib/scheduling/engine.ts
 * (resolveToUtc, detectConflict, checkAvailability) — the exact same
 * conflict/DST/availability logic bookingService.ts already uses for new
 * bookings — rather than reimplementing them, so reschedule can never drift
 * from how a fresh booking would be validated.
 *
 * Single-occurrence only in this increment: reschedule moves one FD Session's
 * time. A series member additionally gets isOverride=true so future
 * series-level edits skip this row (mirrors how a manually-edited single
 * occurrence is already modeled elsewhere in the scheduling engine).
 *
 * All I/O dependencies are injected so this module has zero direct imports of
 * ERP clients or the database — unit-testable without mocking module internals.
 */

import {
  resolveToUtc,
  detectConflict,
  checkAvailability,
} from '@/lib/scheduling/engine'
import {
  VersionConflictError,
  ImmutableSessionError,
} from '@/lib/scheduling/sessionCompletionService'
import type { FDSession, FDSessionStatus, ConflictKind, TrainerConfig } from '@/types/scheduling'

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when the requested local date/time falls in a DST spring-forward gap. */
export class DstInvalidError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly date: string,
    public readonly time: string,
  ) {
    super(`Session ${sessionId}: "${date} ${time}" does not exist in this timezone (DST gap)`)
    this.name = 'DstInvalidError'
  }
}

/** Thrown when the new time overlaps or is within buffer distance of another session. */
export class RescheduleConflictError extends Error {
  constructor(public readonly sessionId: string, public readonly kind: ConflictKind) {
    super(`Session ${sessionId}: new time conflicts with an existing booking (${kind})`)
    this.name = 'RescheduleConflictError'
  }
}

/** Thrown when the new time falls outside the trainer's working hours. */
export class RescheduleOutOfHoursError extends Error {
  constructor(public readonly sessionId: string, public readonly reason: string) {
    super(`Session ${sessionId}: ${reason}`)
    this.name = 'RescheduleOutOfHoursError'
  }
}

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface RescheduleDeps {
  findSessionById: (id: string) => Promise<FDSession>
  /** Existing sessions for the trainer in the given UTC window — used for conflict detection. */
  findSessionsInRange: (trainerId: string, startAt: Date, endAt: Date) => Promise<FDSession[]>
  updateSession: (id: string, patch: {
    startAt?:    Date
    endAt?:      Date
    version?:    number
    isOverride?: boolean
    notes?:      string | null
  }) => Promise<FDSession>
}

// ─── Internal ─────────────────────────────────────────────────────────────────

const MUTABLE_STATUSES: FDSessionStatus[] = ['scheduled', 'confirmed']

/**
 * Append a reschedule reason to the session's existing notes, if one is given.
 * Same append-only contract as the completion service's reason capture —
 * never overwrites, no-op for a blank/absent reason.
 */
function rescheduleNotesPatch(
  currentNotes: string | null,
  reason?: string | null,
): { notes?: string | null } {
  const trimmed = reason?.trim()
  if (!trimmed) return {}
  const entry = `Rescheduled: ${trimmed}`
  return { notes: currentNotes ? `${currentNotes}\n${entry}` : entry }
}

// ─── rescheduleSession ─────────────────────────────────────────────────────────

/**
 * Move an FD Session to a new local date/time.
 *
 * Guards applied in order:
 *  1. Version check — rejects stale reads (optimistic concurrency).
 *  2. Immutable-state check — only scheduled/confirmed may be rescheduled.
 *  3. DST check — resolveToUtc throws 'DST_SKIP' for a spring-forward gap;
 *     mapped here to DstInvalidError.
 *  4. Conflict check — detectConflict against a buffer-expanded window of the
 *     trainer's existing sessions, EXCLUDING this session's own id (the
 *     session being moved must never conflict with its own prior slot).
 *  5. Availability check — checkAvailability against the trainer's working hours.
 *
 * No financial side effect: never resolves billing mode, never creates/voids an
 * invoice, never consumes/reverses a package. The patch never includes
 * `invoiceId` or `sessionConsumedPackage`.
 *
 * `newLocalDate`/`newLocalTime` are interpreted in the session's own recorded
 * `timezone` (the tz the booking was made in) — not the trainer's current
 * config timezone, so a reschedule is unaffected by the trainer's config
 * changing after the original booking. `config` (trainer working hours +
 * buffer) is still required for the availability/conflict window, mirroring
 * bookingService.ts's bookFromPlan.
 *
 * `reason` is optional free text appended to the session's existing notes —
 * same capture mechanism as cancelSession/markNoShow.
 */
export async function rescheduleSession(
  deps: RescheduleDeps,
  config: TrainerConfig,
  id: string,
  expectedVersion: number,
  newLocalDate: string,
  newLocalTime: string,
  reason?: string | null,
): Promise<FDSession> {
  const current = await deps.findSessionById(id)

  // Guard 1: optimistic concurrency
  if (current.version !== expectedVersion) {
    throw new VersionConflictError(id)
  }

  // Guard 2: terminal-state check — only scheduled/confirmed may be rescheduled
  if (!MUTABLE_STATUSES.includes(current.status)) {
    throw new ImmutableSessionError(id, current.status)
  }

  // Guard 3: DST-safe resolution, in the session's own recorded timezone.
  let newStart: Date
  try {
    newStart = resolveToUtc(newLocalDate, newLocalTime, current.timezone)
  } catch (err) {
    if (err instanceof Error && err.message === 'DST_SKIP') {
      throw new DstInvalidError(id, newLocalDate, newLocalTime)
    }
    throw err
  }
  const newEnd = new Date(newStart.getTime() + current.durationMinutes * 60_000)

  // Guard 4: conflict check — buffer-expanded window, self excluded.
  const bufferMs = config.bufferMinutes * 60_000
  const winStart = new Date(newStart.getTime() - bufferMs)
  const winEnd   = new Date(newEnd.getTime() + bufferMs)

  const existing = await deps.findSessionsInRange(current.trainerId, winStart, winEnd)
  const existingExcludingSelf = existing
    .filter(s => s.id !== id)
    .map(s => ({ startAt: s.startAt, endAt: s.endAt }))

  const conflictKind = detectConflict({ startAt: newStart, endAt: newEnd }, existingExcludingSelf, bufferMs)
  if (conflictKind !== null) {
    throw new RescheduleConflictError(id, conflictKind)
  }

  // Guard 5: working-hours availability.
  const outOfHoursReason = checkAvailability({ startAt: newStart, endAt: newEnd }, config)
  if (outOfHoursReason !== null) {
    throw new RescheduleOutOfHoursError(id, outOfHoursReason)
  }

  return deps.updateSession(id, {
    startAt: newStart,
    endAt:   newEnd,
    version: expectedVersion + 1,
    // Series member: mark as a manual override so future series-level edits skip this row.
    ...(current.seriesId !== null ? { isOverride: true } : {}),
    ...rescheduleNotesPatch(current.notes, reason),
  })
}
