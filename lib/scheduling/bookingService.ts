/**
 * Booking service — authoritative server-side booking logic.
 *
 * Responsibility: given a BookingPlan computed by buildBookingPlan(), re-verify
 * it against a fresh authoritative fetch from the repository, then persist.
 *
 * Does NOT run buildBookingPlan() itself — that is the caller's responsibility.
 * Does NOT contain data-access code — delegates entirely to sessionRepository.
 */
import 'server-only'

import {
  detectConflictsBatch,
  checkAvailability,
} from '@/lib/scheduling/engine'
import {
  findSessionsInRange,
  bulkCreateSessions,
  createSeries,
} from '@/lib/scheduling/sessionRepository'
import type {
  BookingPlan,
  ConflictKind,
  FDSessionSeries,
  Interval,
  Occurrence,
  TrainerConfig,
} from '@/types/scheduling'

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when one or more occurrences conflict with existing sessions. */
export class ConflictError extends Error {
  constructor(
    public readonly conflicts: Array<{ occurrence: Occurrence; kind: ConflictKind }>,
  ) {
    super(`${conflicts.length} occurrence(s) conflict with existing bookings`)
    this.name = 'ConflictError'
  }
}

/** Thrown when one or more occurrences fall outside the trainer's working hours. */
export class OutOfHoursError extends Error {
  constructor(
    public readonly violations: Array<{ occurrence: Occurrence; reason: string }>,
  ) {
    super(`${violations.length} occurrence(s) fall outside working hours`)
    this.name = 'OutOfHoursError'
  }
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface BookFromPlanResult {
  sessionIds: string[]
  /** null for one_off bookings; the new series docname for series bookings. */
  seriesId: string | null
}

// ─── bookFromPlan ─────────────────────────────────────────────────────────────

/**
 * Authoritative booking flow:
 *
 *  1. Narrow-window fetch of existing sessions for the plan's time range.
 *  2. Server-side conflict check via shared pure engine (detectConflictsBatch).
 *  3. Server-side availability check via shared pure engine (checkAvailability).
 *  4. Create series doc first (series bookings only).
 *  5. Bulk-create session docs in one Frappe API call.
 *
 * Throws ConflictError or OutOfHoursError — callers (actions) map to UI codes.
 *
 * @param plan        BookingPlan produced by buildBookingPlan() (client or server).
 * @param config      Phase 1 TrainerConfig (working hours, buffer, timezone).
 * @param rate        Session fee per occurrence — not stored in the plan itself.
 * @param sessionType Optional session type label stored on every created session.
 * @param notes       Optional free-text notes stored on every created session.
 */
export async function bookFromPlan(
  plan:         BookingPlan,
  config:       TrainerConfig,
  rate:         number,
  sessionType?: string | null,
  notes?:       string | null,
): Promise<BookFromPlanResult> {
  if (plan.occurrences.length === 0) {
    throw new Error('Plan has no occurrences to book')
  }

  const bufferMs = config.bufferMinutes * 60_000

  // ── 1. Narrow-window authoritative fetch ───────────────────────────────────
  // Expand the window by one buffer on each side so sessions that are exactly
  // at the buffer boundary are included in the conflict check.

  const times   = plan.occurrences.flatMap(o => [o.startAt.getTime(), o.endAt.getTime()])
  const winStart = new Date(Math.min(...times) - bufferMs)
  const winEnd   = new Date(Math.max(...times) + bufferMs)

  const existing = await findSessionsInRange(config.trainerId, winStart, winEnd)
  const existingIntervals: Interval[] = existing.map(s => ({
    startAt: s.startAt,
    endAt:   s.endAt,
  }))

  // ── 2. Server-side conflict check ─────────────────────────────────────────
  const candidates: Interval[] = plan.occurrences.map(o => ({
    startAt: o.startAt,
    endAt:   o.endAt,
  }))

  const hits = detectConflictsBatch(candidates, existingIntervals, bufferMs)
  if (hits.length > 0) {
    const byTime = new Map(hits.map(h => [h.interval.startAt.getTime(), h.kind]))
    const conflicts = plan.occurrences
      .filter(o => byTime.has(o.startAt.getTime()))
      .map(o => ({ occurrence: o, kind: byTime.get(o.startAt.getTime())! }))
    throw new ConflictError(conflicts)
  }

  // ── 3. Server-side availability check ────────────────────────────────────
  const outOfHours = plan.occurrences.flatMap(o => {
    const reason = checkAvailability({ startAt: o.startAt, endAt: o.endAt }, config)
    return reason ? [{ occurrence: o, reason }] : []
  })
  if (outOfHours.length > 0) {
    throw new OutOfHoursError(outOfHours)
  }

  // ── 4. Create series (series bookings only) ───────────────────────────────
  let seriesId: string | null = null

  if (plan.kind === 'series' && plan.series) {
    const series: FDSessionSeries = await createSeries({
      trainerId:       config.trainerId,
      clientId:        plan.clientId,
      pattern:         plan.series.pattern,
      startDate:       plan.series.startDate,
      endDate:         plan.series.endDate,
      durationMinutes: plan.series.durationMinutes,
      timezone:        plan.series.timezone,
      defaultRate:     rate,
    })
    seriesId = series.id
  }

  // ── 5. Bulk-create sessions ───────────────────────────────────────────────
  const sessionInputs = plan.occurrences.map(o => ({
    trainerId:       plan.trainerId,
    clientId:        plan.clientId,
    seriesId,
    startAt:         o.startAt,
    endAt:           o.endAt,
    durationMinutes: plan.durationMinutes,
    timezone:        plan.timezone,
    occurrenceKey:   o.occurrenceKey,
    occurrenceIndex: o.occurrenceIndex,
    rate,
    sessionType:     sessionType ?? null,
    notes:           notes       ?? null,
  }))

  const sessionIds = await bulkCreateSessions(sessionInputs)
  return { sessionIds, seriesId }
}
