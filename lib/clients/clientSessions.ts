import 'server-only'

import { findSessionsForClient } from '@/lib/scheduling/sessionRepository'
import { fdSessionToSession } from '@/lib/dashboard/fdSessionAdapter'
import { getSessionOutcomeCounts } from '@/lib/scheduling/attendance'
import type { Session } from '@/types'
import type { SessionOutcomeCounts } from '@/lib/scheduling/attendance'

/**
 * Fetch a client's FD Session history for the client detail page, mapped to
 * the legacy Session type the page already renders.
 *
 * Replaces the dead getSessions() (PT Session stub — always returns []) with
 * the shipped FD Session read path, following the same pattern already used
 * by the Home Dashboard (lib/dashboard/dashboardDataService.ts).
 *
 * Returns [] on error so the page degrades to the existing empty state
 * rather than throwing — session history is secondary to client profile data.
 */
export async function getClientSessions(
  trainerId: string,
  clientId: string,
  timezone: string,
): Promise<Session[]> {
  try {
    const fdSessions = await findSessionsForClient(trainerId, clientId)
    return fdSessions.map(s => fdSessionToSession(s, timezone))
  } catch {
    return []
  }
}

/**
 * Attendance/outcome-count summary for the client detail page (US-049).
 *
 * A separate read from getClientSessions (one extra findSessionsForClient
 * call) rather than widening getClientSessions's return shape — that
 * function already has passing tests and two callers asserting it returns
 * Session[] directly; see docs/execution/us-049-attendance-truth-plan.md.
 *
 * Operates on the raw FDSession[] (via getSessionOutcomeCounts) so no_show/
 * cancelled/skipped stay distinct — the legacy Session adapter folds some of
 * those together. Returns an all-zero summary on error, same fail-soft
 * contract as getClientSessions.
 */
export async function getClientAttendanceCounts(
  trainerId: string,
  clientId: string,
): Promise<SessionOutcomeCounts> {
  try {
    const fdSessions = await findSessionsForClient(trainerId, clientId)
    return getSessionOutcomeCounts(fdSessions)
  } catch {
    return getSessionOutcomeCounts([])
  }
}
