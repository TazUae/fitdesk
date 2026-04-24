'use server'

/**
 * Server actions for the new FitDesk scheduling engine (Phase 1).
 *
 * Responsibilities:
 *  - Authenticate the caller via Better Auth session.
 *  - Derive Phase 1 TrainerConfig from defaults + env.
 *  - Delegate to service or engine functions.
 *  - Catch typed service errors; map to stable UI-facing error codes.
 *
 * The old invoice-based actions (actions/sessions.ts) are NOT touched.
 */

import { headers } from 'next/headers'
import { DateTime } from 'luxon'

import { auth } from '@/lib/auth'
import { getTrainerId } from '@/lib/trainer'
import { buildBookingPlan } from '@/lib/scheduling/engine'
import { findSessionsInRange } from '@/lib/scheduling/sessionRepository'
import {
  bookFromPlan,
  ConflictError,
  OutOfHoursError,
  type BookFromPlanResult,
} from '@/lib/scheduling/bookingService'
import {
  rescheduleOne,
  cancelSession as svcCancelSession,
  completeSession as svcCompleteSession,
  markNoShow as svcMarkNoShow,
  VersionConflictError,
  ImmutableSessionError,
} from '@/lib/scheduling/sessionService'
import type { BookingPlan, FDSession, TrainerConfig } from '@/types/scheduling'

// ─── Scheduling result type ───────────────────────────────────────────────────
//
// Extends the pattern of ActionResult<T> from types/index.ts but carries a
// stable error code alongside the human message so UI can branch on code
// without string parsing.

export type SchedulingErrorCode =
  | 'AUTH'
  | 'CONFLICT'
  | 'OUT_OF_HOURS'
  | 'VERSION_CONFLICT'
  | 'IMMUTABLE_STATUS'
  | 'EMPTY_PLAN'
  | 'ERR'

export type SchedulingResult<T> =
  | { success: true;  data: T }
  | { success: false; code: SchedulingErrorCode; message: string }

// ─── Phase 1 TrainerConfig derivation ────────────────────────────────────────
//
// Phase 1 has no stored per-trainer configuration.  Config is assembled from:
//   - trainerId: resolved from auth → ERP mapping
//   - timezone:  TRAINER_DEFAULT_TIMEZONE env var, fallback 'UTC'
//   - hours/buffer: constants matching the existing DEFAULT_AVAILABILITY

const PHASE1_WORKING_DAYS: TrainerConfig['workingDays'] = [
  'mon', 'tue', 'wed', 'thu', 'fri',
]
const PHASE1_START_TIME    = '09:00'
const PHASE1_END_TIME      = '20:00'
const PHASE1_BUFFER_MINUTES = 15

function deriveConfig(trainerId: string): TrainerConfig {
  return {
    trainerId,
    timezone:      process.env.TRAINER_DEFAULT_TIMEZONE ?? 'UTC',
    workingDays:   PHASE1_WORKING_DAYS,
    startTime:     PHASE1_START_TIME,
    endTime:       PHASE1_END_TIME,
    bufferMinutes: PHASE1_BUFFER_MINUTES,
  }
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveTrainer(): Promise<
  { ok: true; trainerId: string; config: TrainerConfig } |
  { ok: false; result: SchedulingResult<never> }
> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.id) {
    return { ok: false, result: { success: false, code: 'AUTH', message: 'Not authenticated' } }
  }

  try {
    const trainerId = await getTrainerId(session.user.id)
    return { ok: true, trainerId, config: deriveConfig(trainerId) }
  } catch (err) {
    return {
      ok: false,
      result: {
        success: false,
        code: 'ERR',
        message: err instanceof Error ? err.message : 'Could not resolve trainer',
      },
    }
  }
}

// ─── Error mapper ─────────────────────────────────────────────────────────────

function mapError<T>(err: unknown): SchedulingResult<T> {
  if (err instanceof ConflictError) {
    return {
      success: false,
      code: 'CONFLICT',
      message: `${err.conflicts.length} session(s) conflict with existing bookings`,
    }
  }
  if (err instanceof OutOfHoursError) {
    return {
      success: false,
      code: 'OUT_OF_HOURS',
      message: err.violations[0]?.reason ?? 'Session falls outside working hours',
    }
  }
  if (err instanceof VersionConflictError) {
    return {
      success: false,
      code: 'VERSION_CONFLICT',
      message: 'Session was modified by another request — reload and try again',
    }
  }
  if (err instanceof ImmutableSessionError) {
    return {
      success: false,
      code: 'IMMUTABLE_STATUS',
      message: err.message,
    }
  }
  return {
    success: false,
    code: 'ERR',
    message: err instanceof Error ? err.message : 'An unexpected error occurred',
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Return the Phase 1 TrainerConfig for the authenticated trainer.
 * UI uses this for the calendar's working-hours highlight and for
 * constructing booking plan inputs.
 */
export async function getSchedulerConfig(): Promise<SchedulingResult<TrainerConfig>> {
  const auth = await resolveTrainer()
  if (!auth.ok) return auth.result

  return { success: true, data: auth.config }
}

/**
 * Build a BookingPlan for the selected slots and return it to the client.
 *
 * This is a read-only preview action — nothing is persisted.  The plan is
 * built server-side so conflict detection uses fresh session data.
 *
 * @param selectedSlots  Calendar cells the trainer has clicked.
 * @param clientId       ERPNext Customer docname.
 * @param durationMinutes Session length in minutes.
 * @param recurrenceWeeks null = one-off; positive int = repeat for N weeks.
 */
export async function buildPlanAction(input: {
  selectedSlots:    Array<{ localDate: string; localTime: string }>
  clientId:         string
  durationMinutes:  number
  recurrenceWeeks:  number | null
}): Promise<SchedulingResult<BookingPlan>> {
  const trainer = await resolveTrainer()
  if (!trainer.ok) return trainer.result

  const { trainerId, config } = trainer

  if (input.selectedSlots.length === 0) {
    return { success: false, code: 'EMPTY_PLAN', message: 'No slots selected' }
  }

  try {
    // Derive fetch window from the earliest slot + MAX_SERIES_WEEKS coverage.
    // Use the trainer's timezone so the window starts at midnight *local* time,
    // not UTC midnight — otherwise sessions in the morning of UTC+ zones are
    // excluded from conflict detection (their UTC timestamps are on the prior day).
    const sortedDates = [...input.selectedSlots].map(s => s.localDate).sort()
    const windowStart = DateTime.fromISO(sortedDates[0], { zone: config.timezone })
      .startOf('day')
      .toUTC()
      .toJSDate()
    // 12 weeks (MAX_SERIES_WEEKS) + 1 day to cover the inclusive end date.
    const windowEnd   = new Date(windowStart.getTime() + (12 * 7 + 1) * 86_400_000)

    const existingSessions = await findSessionsInRange(trainerId, windowStart, windowEnd)
    const existingIntervals = existingSessions.map(s => ({
      startAt: s.startAt,
      endAt:   s.endAt,
    }))

    const plan = buildBookingPlan({
      selectedSlots:    input.selectedSlots,
      trainerId,
      clientId:         input.clientId,
      durationMinutes:  input.durationMinutes,
      timezone:         config.timezone,
      recurrenceWeeks:  input.recurrenceWeeks,
      config,
      existingSessions: existingIntervals,
    })

    return { success: true, data: plan }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Book a plan produced by buildPlanAction (or buildBookingPlan on the client).
 *
 * The service re-verifies the plan server-side against a fresh narrow-window
 * fetch — the client-computed plan is not trusted for authorization.
 *
 * @param plan        BookingPlan from buildPlanAction / buildBookingPlan.
 * @param rate        Session fee per occurrence (not stored on the plan itself).
 * @param sessionType Optional session type label (e.g. 'Strength').
 * @param notes       Optional free-text notes for all occurrences.
 */
export async function bookPlanAction(
  plan:         BookingPlan,
  rate:         number,
  sessionType?: string | null,
  notes?:       string | null,
): Promise<SchedulingResult<BookFromPlanResult>> {
  const trainer = await resolveTrainer()
  if (!trainer.ok) return trainer.result

  if (plan.occurrences.length === 0) {
    return { success: false, code: 'EMPTY_PLAN', message: 'Plan has no occurrences' }
  }

  try {
    const result = await bookFromPlan(plan, trainer.config, rate, sessionType, notes)
    return { success: true, data: result }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Move a single FD Session to a new local date and time, optionally updating
 * the session rate.
 *
 * @param id              FD Session docname.
 * @param newDate         New date (YYYY-MM-DD) in the trainer's timezone.
 * @param newTime         New time (HH:mm) in the trainer's timezone.
 * @param expectedVersion Caller's snapshot of session.version (optimistic lock).
 * @param newRate         If provided, update the session fee.
 */
export async function rescheduleSessionAction(
  id: string,
  input: {
    newDate:         string
    newTime:         string
    expectedVersion: number
    newRate?:        number
  },
): Promise<SchedulingResult<FDSession>> {
  const trainer = await resolveTrainer()
  if (!trainer.ok) return trainer.result

  try {
    const updated = await rescheduleOne(id, input, trainer.config)
    return { success: true, data: updated }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Cancel a scheduled or confirmed FD Session.
 *
 * @param id              FD Session docname.
 * @param expectedVersion Caller's snapshot of session.version (optimistic lock).
 */
export async function cancelSessionAction(
  id: string,
  expectedVersion: number,
): Promise<SchedulingResult<FDSession>> {
  const trainer = await resolveTrainer()
  if (!trainer.ok) return trainer.result

  try {
    const cancelled = await svcCancelSession(id, expectedVersion)
    return { success: true, data: cancelled }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Mark a scheduled or confirmed FD Session as completed.
 *
 * Phase A: status flip only — no invoice / WhatsApp / package side effects.
 *
 * @param id              FD Session docname.
 * @param expectedVersion Caller's snapshot of session.version (optimistic lock).
 */
export async function completeSessionAction(
  id: string,
  expectedVersion: number,
): Promise<SchedulingResult<FDSession>> {
  const trainer = await resolveTrainer()
  if (!trainer.ok) return trainer.result

  try {
    const updated = await svcCompleteSession(id, expectedVersion)
    return { success: true, data: updated }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Mark a scheduled or confirmed FD Session as no-show (client did not attend).
 *
 * @param id              FD Session docname.
 * @param expectedVersion Caller's snapshot of session.version (optimistic lock).
 */
export async function markNoShowAction(
  id: string,
  expectedVersion: number,
): Promise<SchedulingResult<FDSession>> {
  const trainer = await resolveTrainer()
  if (!trainer.ok) return trainer.result

  try {
    const updated = await svcMarkNoShow(id, expectedVersion)
    return { success: true, data: updated }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * List non-cancelled FD Sessions for the authenticated trainer
 * in a rolling window: 7 days ago → 90 days from now (UTC).
 *
 * Used by the schedule page and ScheduleView reconcile to hydrate the calendar.
 */
export async function listFDSessionsAction(): Promise<SchedulingResult<FDSession[]>> {
  const trainer = await resolveTrainer()
  if (!trainer.ok) return trainer.result

  try {
    const now      = new Date()
    const startAt  = new Date(now.getTime() -  7 * 86_400_000)
    const endAt    = new Date(now.getTime() + 90 * 86_400_000)
    const sessions = await findSessionsInRange(trainer.trainerId, startAt, endAt)
    return { success: true, data: sessions }
  } catch (err) {
    return mapError(err)
  }
}
