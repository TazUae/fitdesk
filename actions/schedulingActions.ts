'use server'

/**
 * Server actions for FD Session scheduling.
 *
 * C2 scope: list + config.
 * C3 scope: +buildPlanAction (server-side plan preview), +bookPlanAction (create sessions).
 * C4B scope: +completeSessionAction (trial + billing dispatch shell).
 *
 * Not included (deferred to C4C–C5):
 *   cancelSessionAction, rescheduleSessionAction, markNoShowAction
 *   Package ledger integration (C4C), pay-per-session invoice (C7).
 *
 * Auth: uses resolveTrainerId() from lib/auth/resolve-trainer (same pattern
 * as other FitDesk server actions) so all ERP queries are automatically
 * scoped to the authenticated trainer's ERP tenant.
 */

import { DateTime } from 'luxon'
import { db } from '@/lib/db'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { getTenantContext } from '@/lib/tenant/context'
import { ClientRepository } from '@/lib/clients/repository'
import { buildBookingPlan } from '@/lib/scheduling/engine'
import {
  findSessionsInRange,
  findSessionById,
  updateSession,
} from '@/lib/scheduling/sessionRepository'
import { getTrainerConfig } from '@/lib/scheduling/trainerConfig'
import {
  bookFromPlan,
  ConflictError,
  OutOfHoursError,
  type BookFromPlanResult,
} from '@/lib/scheduling/bookingService'
import {
  completeSession,
  BillingNotConfiguredError,
  PayPerSessionCompletionDeferredError,
  PackageCompletionNotReadyError,
  VersionConflictError,
  ImmutableSessionError,
} from '@/lib/scheduling/sessionCompletionService'
import type { BookingPlan, FDSession, TrainerConfig } from '@/types/scheduling'

// ─── Result types ─────────────────────────────────────────────────────────────

export type SchedulingErrorCode =
  | 'AUTH'
  | 'CONFLICT'
  | 'OUT_OF_HOURS'
  | 'EMPTY_PLAN'
  | 'BILLING_NOT_CONFIGURED'
  | 'VERSION_CONFLICT'
  | 'IMMUTABLE_STATUS'
  | 'PPS_DEFERRED'
  | 'PACKAGE_NOT_READY'
  | 'ERR'

export type SchedulingResult<T> =
  | { success: true;  data: T }
  | { success: false; code: SchedulingErrorCode; message: string }

// ─── Error mapper ─────────────────────────────────────────────────────────────

function mapError<T>(err: unknown): SchedulingResult<T> {
  if (err instanceof ConflictError) {
    return {
      success: false,
      code:    'CONFLICT',
      message: `${err.conflicts.length} session(s) conflict with existing bookings`,
    }
  }
  if (err instanceof OutOfHoursError) {
    return {
      success: false,
      code:    'OUT_OF_HOURS',
      message: err.violations[0]?.reason ?? 'Session falls outside working hours',
    }
  }
  if (err instanceof BillingNotConfiguredError) {
    return { success: false, code: 'BILLING_NOT_CONFIGURED', message: err.message }
  }
  if (err instanceof PayPerSessionCompletionDeferredError) {
    return { success: false, code: 'PPS_DEFERRED', message: err.message }
  }
  if (err instanceof PackageCompletionNotReadyError) {
    return { success: false, code: 'PACKAGE_NOT_READY', message: err.message }
  }
  if (err instanceof VersionConflictError) {
    return { success: false, code: 'VERSION_CONFLICT', message: err.message }
  }
  if (err instanceof ImmutableSessionError) {
    return { success: false, code: 'IMMUTABLE_STATUS', message: err.message }
  }
  return {
    success: false,
    code:    'ERR',
    message: err instanceof Error ? err.message : 'An unexpected error occurred',
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Return the FitDesk Trainer Settings (working hours, timezone, buffer) for
 * the authenticated trainer. Used by the schedule page to pass timezone to the
 * calendar and by booking actions for availability checking.
 */
export async function getSchedulerConfig(): Promise<SchedulingResult<TrainerConfig>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }
  try {
    const config = await getTrainerConfig(resolved.trainerId)
    return { success: true, data: config }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * List non-cancelled FD Sessions for the authenticated trainer in a rolling
 * window: 7 days ago → 90 days from now (UTC).
 *
 * Used by the schedule page on initial load and by ScheduleView.reconcile()
 * after a booking mutation.
 *
 * Trainer ownership is enforced at the ERP proxy layer: the Frappe filter
 * includes `trainer_id = <trainerId>` and every ERP call is signed with a
 * tenant JWT that scopes it to this trainer's workspace.
 */
export async function listFDSessionsAction(): Promise<SchedulingResult<FDSession[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }
  try {
    const now     = new Date()
    const startAt = new Date(now.getTime() -  7 * 86_400_000)
    const endAt   = new Date(now.getTime() + 90 * 86_400_000)
    const sessions = await findSessionsInRange(resolved.trainerId, startAt, endAt)
    return { success: true, data: sessions }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Build a BookingPlan for the selected slots and return it to the client.
 *
 * This is a read-only preview action — nothing is persisted.  The plan is
 * built server-side so conflict detection uses fresh session data from ERP.
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
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  if (input.selectedSlots.length === 0) {
    return { success: false, code: 'EMPTY_PLAN', message: 'No slots selected' }
  }

  try {
    const config = await getTrainerConfig(resolved.trainerId)

    // Derive fetch window from the earliest slot with timezone-aware start-of-day.
    // Using the trainer's timezone ensures morning sessions in UTC+ zones are
    // not excluded from conflict detection due to UTC date boundary crossings.
    const sortedDates = [...input.selectedSlots].map(s => s.localDate).sort()
    const windowStart = DateTime.fromISO(sortedDates[0], { zone: config.timezone })
      .startOf('day')
      .toUTC()
      .toJSDate()
    // 12 weeks + 1 day covers the full recurrence window
    const windowEnd = new Date(windowStart.getTime() + (12 * 7 + 1) * 86_400_000)

    const existingSessions = await findSessionsInRange(resolved.trainerId, windowStart, windowEnd)
    const existingIntervals = existingSessions.map(s => ({
      startAt: s.startAt,
      endAt:   s.endAt,
    }))

    const plan = buildBookingPlan({
      selectedSlots:    input.selectedSlots,
      trainerId:        resolved.trainerId,
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
 * No package consumption, no invoice creation, no payment. Those are C4/C7.
 *
 * @param plan        BookingPlan from buildPlanAction / buildBookingPlan.
 * @param rate        Session fee per occurrence (stored on each FD Session doc).
 * @param sessionType Optional session type label (e.g. 'Strength').
 * @param notes       Optional free-text notes for all occurrences.
 */
export async function bookPlanAction(
  plan:         BookingPlan,
  rate:         number,
  sessionType?: string | null,
  notes?:       string | null,
): Promise<SchedulingResult<BookFromPlanResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  if (plan.occurrences.length === 0) {
    return { success: false, code: 'EMPTY_PLAN', message: 'Plan has no occurrences' }
  }

  try {
    const config = await getTrainerConfig(resolved.trainerId)
    const result = await bookFromPlan(plan, config, rate, sessionType, notes)
    return { success: true, data: result }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Mark an FD Session as completed.
 *
 * C4B dispatch:
 *   - Trial (isTrialSession=true): status flip only — no billing, no ledger.
 *   - Package: blocked (PackageCompletionNotReadyError → PACKAGE_NOT_READY).
 *     Package ledger integration arrives in C4C.
 *   - Pay-per-session: blocked (PayPerSessionCompletionDeferredError → PPS_DEFERRED).
 *     Invoice creation is deferred to C7.
 *   - Unset or missing billing mode: blocked (BillingNotConfiguredError → BILLING_NOT_CONFIGURED).
 *
 * Guards: version check (VERSION_CONFLICT) + mutable-state check (IMMUTABLE_STATUS).
 *
 * No package ledger mutations. No invoice creation. No payment writes.
 */
export async function completeSessionAction(
  id:              string,
  expectedVersion: number,
): Promise<SchedulingResult<FDSession>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, code: 'ERR', message: 'Workspace not provisioned' }
  }

  const tenantCtx = { tenantId: ctx.tenantId }

  try {
    const result = await completeSession(
      {
        findSessionById,
        updateSession,
        resolveBillingMode: async (clientId) => {
          const client = await new ClientRepository(db).findClientByErpId(tenantCtx, clientId)
          return client?.billingMode ?? null
        },
      },
      id,
      expectedVersion,
    )
    return { success: true, data: result }
  } catch (err) {
    return mapError(err)
  }
}
