/**
 * Session outcome counts — pure derivation over FD Session statuses (US-049).
 *
 * Operates directly on FDSession[] (not the legacy-adapted Session[] the
 * client detail page renders) so no_show, cancelled, and skipped remain
 * fully distinct — the legacy adapter (lib/dashboard/fdSessionAdapter.ts)
 * folds both no_show and skipped into a narrower legacy vocabulary
 * ('missed'/'cancelled') for backward-compatible badge rendering, which
 * would lose exactly the distinction this helper exists to preserve.
 * See docs/execution/us-049-attendance-truth-plan.md for the full rationale.
 *
 * No reschedule count is reported. Reschedule (US-039) updates the existing
 * FD Session's start_at/end_at in place — there is no "rescheduled" status
 * and no reschedule-count field on the FD Session doctype today. Deriving one
 * from version increments would be indistinguishable from any other patch
 * (e.g. a notes edit) and would be a fabricated number, not a real count.
 *
 * Pure, no I/O — safe to import in both server and client code.
 */

import type { FDSession, FDSessionStatus } from '@/types/scheduling'

export interface SessionOutcomeCounts {
  completed:  number
  noShow:     number
  cancelled:  number
  skipped:    number
  /** scheduled + confirmed — not yet attended, not yet resolved either way. */
  unresolved: number
  /** Always equals completed + noShow + cancelled + skipped + unresolved. */
  total:      number
}

type CountableKey = Exclude<keyof SessionOutcomeCounts, 'unresolved' | 'total'>

const OUTCOME_KEY: Partial<Record<FDSessionStatus, CountableKey>> = {
  completed: 'completed',
  no_show:   'noShow',
  cancelled: 'cancelled',
  skipped:   'skipped',
}

/**
 * Counts sessions by final outcome. Every FDSessionStatus value maps to
 * exactly one bucket — scheduled/confirmed count as `unresolved` (not yet
 * attended and not yet given an outcome either way), everything else maps
 * via OUTCOME_KEY. `total` is always the sum of all buckets.
 */
export function getSessionOutcomeCounts(sessions: FDSession[]): SessionOutcomeCounts {
  const counts: SessionOutcomeCounts = {
    completed:  0,
    noShow:     0,
    cancelled:  0,
    skipped:    0,
    unresolved: 0,
    total:      sessions.length,
  }

  for (const session of sessions) {
    if (session.status === 'scheduled' || session.status === 'confirmed') {
      counts.unresolved += 1
      continue
    }
    const key = OUTCOME_KEY[session.status]
    if (key) counts[key] += 1
  }

  return counts
}

// ─── Missing-next-session predicates ────────────────────────────────────────
//
// Labeled "US-038" by the batch that requested this; the canonical backlog's
// actual US-038 is "Client Pulse" — this feature matches US-003/US-027's
// "missing next sessions where data exists" acceptance criterion instead.
// See docs/execution/us-038-missing-next-session-plan.md.

/**
 * True if the client has ANY FD Session row at all, regardless of status.
 * Mirrors lib/dashboard/derive.ts's getMissingNextSessionAttentionItems
 * exactly: a client with zero session history is excluded from this signal
 * on purpose — that's the Add Client / first-booking loop's job, not this
 * one's. Reused here, not redefined, so the persisted signal can never
 * silently drift from the existing dashboard card's product decision.
 */
export function hasSessionHistory(sessions: FDSession[]): boolean {
  return sessions.length > 0
}

/**
 * True if the client has at least one scheduled/confirmed session starting
 * strictly after `now`. Same criteria as getMissingNextSessionAttentionItems's
 * clientIdsWithFutureSession set.
 */
export function hasUpcomingSession(sessions: FDSession[], now: Date = new Date()): boolean {
  return sessions.some(
    s => (s.status === 'scheduled' || s.status === 'confirmed') && s.startAt.getTime() > now.getTime(),
  )
}
