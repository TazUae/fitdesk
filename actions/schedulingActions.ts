'use server'

/**
 * Server actions for FD Session scheduling — C2: read-only listing.
 *
 * C2 scope: list + config only. No booking, reschedule, cancel, complete,
 * or no-show. Those actions are deferred to C3–C5.
 *
 * Auth: uses resolveTrainerId() from lib/auth/resolve-trainer (same pattern
 * as other FitDesk server actions) so all ERP queries are automatically
 * scoped to the authenticated trainer's ERP tenant.
 */

import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { findSessionsInRange } from '@/lib/scheduling/sessionRepository'
import { getTrainerConfig } from '@/lib/scheduling/trainerConfig'
import type { FDSession, TrainerConfig } from '@/types/scheduling'

// ─── Result types ─────────────────────────────────────────────────────────────

export type SchedulingErrorCode = 'AUTH' | 'ERR'

export type SchedulingResult<T> =
  | { success: true;  data: T }
  | { success: false; code: SchedulingErrorCode; message: string }

// ─── Error mapper ─────────────────────────────────────────────────────────────

function mapError<T>(err: unknown): SchedulingResult<T> {
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
 * calendar and by future C3 booking actions for availability checking.
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
