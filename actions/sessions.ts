'use server'

import {
  cancelSession as erpCancelSession,
  createSession,
  getSessionById,
  getSessions,
  markSessionComplete,
  markSessionMissed,
} from '@/lib/business-data/erp-adapter'
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

/**
 * Mark a session as completed.
 *
 * P-A billing behavior (Option B — deferred PPS invoicing):
 *   All sessions currently complete with a status-only flip to Completed.
 *   No invoice is created on completion regardless of billing mode.
 *   No package balance is decremented.
 *   This is intentional: main's PT Session DocType does not carry billing-mode
 *   or invoice_id fields, so pay-per-session invoicing cannot be made idempotent
 *   at this layer without ERP DocType changes (deferred to Path-A reconciliation).
 *   ERP may fire its own server-side session-count hooks on status transition.
 *
 * TODO(P-C): once custom_billing_mode + invoice_id land on PT Session, add:
 *   - Pay Per Session → createInvoice + submitSalesInvoice, write invoice_id back
 *   - Package → P-C atomic consumption via session_consumed_package
 *   - Trial → status-only (no invoice, no decrement — same as current)
 */
export async function completeSession(
  sessionId: string,
  notes?: string,
): Promise<ActionResult<Session>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    // Ownership gate: only the session's own trainer may complete it (intra-tenant IDOR).
    await getSessionById(sessionId, resolved.trainerId)
    const data = await markSessionComplete(sessionId, notes)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to complete session' }
  }
}

/**
 * Cancel a scheduled session.
 */
export async function cancelSession(sessionId: string): Promise<ActionResult<Session>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    // Ownership gate: only the session's own trainer may cancel it (intra-tenant IDOR).
    await getSessionById(sessionId, resolved.trainerId)
    const data = await erpCancelSession(sessionId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to cancel session' }
  }
}

/**
 * Mark a session as no-show (client did not attend).
 */
export async function noShowSession(sessionId: string): Promise<ActionResult<Session>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    // Ownership gate: only the session's own trainer may mark it as missed (intra-tenant IDOR).
    await getSessionById(sessionId, resolved.trainerId)
    const data = await markSessionMissed(sessionId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to mark session as no-show' }
  }
}
