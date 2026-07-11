import 'server-only'

import { findSessionsInRange } from '@/lib/scheduling/sessionRepository'
import { fdSessionToSession } from '@/lib/dashboard/fdSessionAdapter'
import type { Session } from '@/types'

/**
 * Fetch FD Sessions for the Home Dashboard and map them to the legacy
 * Session type that all dashboard derive functions expect.
 *
 * Window: 14 days ago → 90 days ahead (UTC). The 14-day lookback (widened
 * from 7 for US-045's "sessions this week vs. last week" trend comparison —
 * a rolling 7-day window needs a full prior 7-day window behind it to
 * compare against) also ensures today's completed sessions are captured
 * even in UTC+ zones where the local day starts ahead of UTC midnight.
 *
 * Returns [] on error so the dashboard degrades gracefully rather than
 * throwing a 500. Errors are silently swallowed here because session data
 * is non-critical for the dashboard (invoices are the primary data source).
 */
export async function getDashboardSessions(
  trainerId: string,
  timezone: string,
): Promise<Session[]> {
  try {
    const now     = new Date()
    const startAt = new Date(now.getTime() - 14 * 86_400_000)
    const endAt   = new Date(now.getTime() + 90 * 86_400_000)
    const fdSessions = await findSessionsInRange(trainerId, startAt, endAt)
    return fdSessions.map(s => fdSessionToSession(s, timezone))
  } catch {
    return []
  }
}
