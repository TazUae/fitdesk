/**
 * Pure dashboard metric helpers.
 *
 * No I/O, no React, no ERP — just functions over an already-fetched
 * sessions array. Tested in metrics.test.ts.
 */

import type { FDSession } from '@/types/scheduling'

const ACTIVE_CLIENT_LOOKBACK_DAYS = 30

/**
 * Count clients with recent or upcoming activity.
 *
 * A client is "active" if they have at least one session that is either
 * upcoming (scheduled/confirmed and in the future) or a completion within
 * the last 30 days. The Customer DocType has no trainer-link field today,
 * so we can't ask ERP this question directly — it's derived from the
 * trainer's session list.
 */
export function countActiveClients(sessions: FDSession[], nowMs: number): number {
  const lookbackMs = nowMs - ACTIVE_CLIENT_LOOKBACK_DAYS * 86_400_000
  const ids = new Set<string>()
  for (const s of sessions) {
    const t = s.startAt.getTime()
    const upcoming   = (s.status === 'scheduled' || s.status === 'confirmed') && t >= nowMs
    const recentDone = s.status === 'completed' && t >= lookbackMs
    if (upcoming || recentDone) ids.add(s.clientId)
  }
  return ids.size
}

/** Returns Monday 00:00 UTC of the ISO week containing `now`. */
export function startOfWeekUTC(now: Date): Date {
  const day = now.getUTCDay()                // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offsetDays = day === 0 ? 6 : day - 1 // days since Monday
  const d = new Date(now)
  d.setUTCDate(now.getUTCDate() - offsetDays)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Count sessions completed since the start of the current ISO week
 * (Monday 00:00 UTC).
 */
export function countSessionsCompletedThisWeek(
  sessions: FDSession[],
  nowMs: number,
): number {
  const startMs = startOfWeekUTC(new Date(nowMs)).getTime()
  return sessions.filter(
    s => s.status === 'completed' && s.startAt.getTime() >= startMs,
  ).length
}
