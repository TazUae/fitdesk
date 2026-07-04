/**
 * Pure derivation of a client's projected next-session timestamp from FD
 * Session records. No I/O — callers fetch sessions (e.g. via
 * findSessionsForClient) and pass them in.
 *
 * "Next session" = the earliest FD Session strictly after `now` whose status
 * is 'scheduled' or 'confirmed'. Past sessions, and non-open statuses
 * (completed, cancelled, no_show, skipped), never qualify.
 */
import type { FDSession } from '@/types/scheduling'

const OPEN_FUTURE_STATUSES = new Set(['scheduled', 'confirmed'])

export function deriveNextSessionAtUtc(
  sessions: readonly FDSession[],
  now: Date,
): string | null {
  let nearest: Date | null = null

  for (const session of sessions) {
    if (!OPEN_FUTURE_STATUSES.has(session.status)) continue
    if (session.startAt.getTime() <= now.getTime()) continue
    if (nearest === null || session.startAt.getTime() < nearest.getTime()) {
      nearest = session.startAt
    }
  }

  return nearest ? nearest.toISOString() : null
}
