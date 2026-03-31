'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import {
  cancelSession as erpCancelSession,
  createSession,
  getSessions,
  markSessionComplete,
} from '@/lib/business-data/erp-adapter'
import { ensureTrainerIdForUser } from '@/lib/trainer'
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTrainerId(): Promise<{ trainerId: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { error: 'Not authenticated.' }
  const sessionPhone =
    typeof (session.user as { phone?: string | null }).phone === 'string'
      ? (session.user as { phone?: string | null }).phone
      : undefined
  try {
    const trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: sessionPhone,
    })
    return { trainerId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }
}

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
 */
export async function completeSession(
  sessionId: string,
  notes?: string,
): Promise<ActionResult<Session>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  try {
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
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  try {
    const data = await erpCancelSession(sessionId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to cancel session' }
  }
}

// ─── Legacy aliases ───────────────────────────────────────────────────────────
// Kept so existing components (SessionActions.tsx) keep compiling.
// Remove once SessionActions is deleted.

/** @deprecated use bookSession */
export const addSession = bookSession
/** @deprecated use cancelSession */
export const removeSession = cancelSession
