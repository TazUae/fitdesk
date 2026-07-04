import 'server-only'

import { findSessionsForClient } from '@/lib/scheduling/sessionRepository'
import { fdSessionToSession } from '@/lib/dashboard/fdSessionAdapter'
import type { Session } from '@/types'

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
