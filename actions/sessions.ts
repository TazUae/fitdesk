'use server'

// fetchSessions / bookSession only. The no-show, cancel/reschedule, and
// completion transitions live on the FD Session path
// (actions/schedulingActions.ts + lib/scheduling/sessionCompletionService.ts).
// The former ORPHANED completeSession/cancelSession/noShowSession stubs here
// (which targeted the dead PT Session ERP path and always 404/503'd) were
// removed 2026-07-11 — rebuild no-show and cancel/reschedule as US-017/US-039
// on the FD Session path, not here.

import { createSession, getSessions } from '@/lib/business-data/erp-adapter'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import type { ActionResult, Session } from '@/types'
import type { CreateSessionPayload } from '@/lib/erpnext/types'

// ─── Types ────────────────────────────────────────────────────────────────────

// Used by ScheduleView tabs. The page fetches all sessions; ScheduleView
// does client-side filtering so tab switches need no extra network request.
export type SessionFilter = 'upcoming' | 'completed' | 'all'

/**
 * Input for bookSession. trainer is omitted — injected server-side from
 * the auth session to prevent a client from booking under another trainer's ID.
 */
export type BookSessionInput = Omit<CreateSessionPayload, 'trainer'>

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Fetch sessions scoped to the authenticated trainer.
 * Optionally narrow by clientId or status tab.
 */
export async function fetchSessions(opts: {
  clientId?: string
  filter?: SessionFilter
} = {}): Promise<ActionResult<Session[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const erpStatus =
      opts.filter === 'upcoming'  ? 'Scheduled' :
      opts.filter === 'completed' ? 'Completed'  :
      undefined // 'all' → no status filter

    const data = await getSessions({
      trainerId: resolved.trainerId,
      clientId:  opts.clientId,
      status:    erpStatus,
    })
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch sessions' }
  }
}

/**
 * Book a new session.
 * The trainer field is injected server-side from the auth session.
 */
export async function bookSession(
  payload: BookSessionInput,
): Promise<ActionResult<Session>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await createSession({ ...payload, trainer: resolved.trainerId })
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to book session' }
  }
}
