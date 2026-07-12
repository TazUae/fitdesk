/**
 * Unit tests for lib/scheduling/attendance.ts (US-049).
 *
 * Pure function — no I/O, no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { getSessionOutcomeCounts, hasSessionHistory, hasUpcomingSession } from '@/lib/scheduling/attendance'
import type { FDSession, FDSessionStatus } from '@/types/scheduling'

function makeSession(overrides: Partial<FDSession> = {}): FDSession {
  return {
    id:                     'fds-001',
    tenantId:               '',
    trainerId:              'trainer-1',
    clientId:               'CUST-001',
    clientName:             'Alice',
    seriesId:               null,
    startAt:                new Date('2026-01-05T09:00:00Z'),
    endAt:                  new Date('2026-01-05T10:00:00Z'),
    durationMinutes:        60,
    timezone:               'Asia/Riyadh',
    status:                 'scheduled',
    occurrenceKey:          null,
    occurrenceIndex:        null,
    isOverride:             false,
    rate:                   100,
    sessionType:            null,
    notes:                  null,
    invoiceId:              null,
    version:                1,
    isTrialSession:         false,
    sessionConsumedPackage: false,
    ...overrides,
  }
}

describe('getSessionOutcomeCounts — empty input', () => {
  it('returns all-zero counts for an empty session list', () => {
    expect(getSessionOutcomeCounts([])).toEqual({
      completed: 0, noShow: 0, cancelled: 0, skipped: 0, unresolved: 0, total: 0,
    })
  })
})

describe('getSessionOutcomeCounts — completed', () => {
  it('increments completed for a completed session', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'completed' })])
    expect(counts.completed).toBe(1)
  })

  it('increments completed once per completed session', () => {
    const sessions = [
      makeSession({ id: 'a', status: 'completed' }),
      makeSession({ id: 'b', status: 'completed' }),
      makeSession({ id: 'c', status: 'completed' }),
    ]
    expect(getSessionOutcomeCounts(sessions).completed).toBe(3)
  })
})

describe('getSessionOutcomeCounts — no_show', () => {
  it('increments noShow for a no_show session', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'no_show' })])
    expect(counts.noShow).toBe(1)
  })

  it('does not conflate no_show with cancelled or skipped', () => {
    const sessions = [
      makeSession({ id: 'a', status: 'no_show' }),
      makeSession({ id: 'b', status: 'cancelled' }),
      makeSession({ id: 'c', status: 'skipped' }),
    ]
    const counts = getSessionOutcomeCounts(sessions)
    expect(counts.noShow).toBe(1)
    expect(counts.cancelled).toBe(1)
    expect(counts.skipped).toBe(1)
  })
})

describe('getSessionOutcomeCounts — cancelled', () => {
  it('increments cancelled for a cancelled session', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'cancelled' })])
    expect(counts.cancelled).toBe(1)
  })
})

describe('getSessionOutcomeCounts — skipped (explicit, distinct bucket)', () => {
  it('increments skipped for a skipped session — not folded into cancelled', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'skipped' })])
    expect(counts.skipped).toBe(1)
    expect(counts.cancelled).toBe(0)
  })
})

describe('getSessionOutcomeCounts — scheduled/confirmed are not attended', () => {
  it('counts a scheduled session as unresolved, not completed', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'scheduled' })])
    expect(counts.unresolved).toBe(1)
    expect(counts.completed).toBe(0)
  })

  it('counts a confirmed session as unresolved, not completed', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'confirmed' })])
    expect(counts.unresolved).toBe(1)
    expect(counts.completed).toBe(0)
  })

  it('scheduled/confirmed never contribute to completed, noShow, cancelled, or skipped', () => {
    const sessions = [
      makeSession({ id: 'a', status: 'scheduled' }),
      makeSession({ id: 'b', status: 'confirmed' }),
    ]
    const counts = getSessionOutcomeCounts(sessions)
    expect(counts.completed).toBe(0)
    expect(counts.noShow).toBe(0)
    expect(counts.cancelled).toBe(0)
    expect(counts.skipped).toBe(0)
    expect(counts.unresolved).toBe(2)
  })
})

describe('getSessionOutcomeCounts — reschedule does not fabricate a status', () => {
  it('has no rescheduled field on the returned shape', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'scheduled', isOverride: true })])
    expect(counts).not.toHaveProperty('rescheduled')
  })

  it('a rescheduled session (isOverride=true, still scheduled) counts as unresolved like any other scheduled session — reschedule is a time update, not a new outcome', () => {
    const rescheduled = makeSession({ status: 'scheduled', isOverride: true, seriesId: 'series-1' })
    const plain       = makeSession({ status: 'scheduled', isOverride: false, seriesId: null })
    const counts = getSessionOutcomeCounts([rescheduled, plain])
    expect(counts.unresolved).toBe(2)
    expect(counts.completed).toBe(0)
  })

  it('a session that was rescheduled and later completed counts as completed — the reschedule leaves no separate trace in this summary', () => {
    const counts = getSessionOutcomeCounts([makeSession({ status: 'completed', isOverride: true })])
    expect(counts.completed).toBe(1)
    expect(counts).not.toHaveProperty('rescheduled')
  })
})

describe('getSessionOutcomeCounts — total is exhaustive', () => {
  it('total always equals the sum of every bucket, for a mixed list', () => {
    const sessions = [
      makeSession({ id: 'a', status: 'completed' }),
      makeSession({ id: 'b', status: 'completed' }),
      makeSession({ id: 'c', status: 'no_show' }),
      makeSession({ id: 'd', status: 'cancelled' }),
      makeSession({ id: 'e', status: 'skipped' }),
      makeSession({ id: 'f', status: 'scheduled' }),
      makeSession({ id: 'g', status: 'confirmed' }),
    ]
    const counts = getSessionOutcomeCounts(sessions)
    expect(counts.total).toBe(7)
    expect(
      counts.completed + counts.noShow + counts.cancelled + counts.skipped + counts.unresolved,
    ).toBe(counts.total)
  })

  it('every FDSessionStatus value is handled — none silently dropped', () => {
    const allStatuses: FDSessionStatus[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'skipped']
    const sessions = allStatuses.map((status, i) => makeSession({ id: `fds-${i}`, status }))
    const counts = getSessionOutcomeCounts(sessions)
    expect(counts.total).toBe(6)
    expect(
      counts.completed + counts.noShow + counts.cancelled + counts.skipped + counts.unresolved,
    ).toBe(6)
  })
})

describe('getSessionOutcomeCounts — no side effects', () => {
  it('is pure — does not mutate the input array', () => {
    const sessions = [makeSession({ status: 'completed' })]
    const snapshot = JSON.stringify(sessions)
    getSessionOutcomeCounts(sessions)
    expect(JSON.stringify(sessions)).toBe(snapshot)
  })
})

// ─── hasSessionHistory / hasUpcomingSession ("US-038" per the batch label) ────

describe('hasSessionHistory', () => {
  it('returns false for an empty session list — a brand new client', () => {
    expect(hasSessionHistory([])).toBe(false)
  })

  it('returns true when any session row exists, regardless of status', () => {
    expect(hasSessionHistory([makeSession({ status: 'cancelled' })])).toBe(true)
    expect(hasSessionHistory([makeSession({ status: 'scheduled' })])).toBe(true)
  })
})

describe('hasUpcomingSession', () => {
  const NOW = new Date('2026-06-15T12:00:00Z')

  it('returns false when there are no sessions at all', () => {
    expect(hasUpcomingSession([], NOW)).toBe(false)
  })

  it('returns false when all sessions are in the past', () => {
    const sessions = [makeSession({ status: 'completed', startAt: new Date('2026-06-01T09:00:00Z') })]
    expect(hasUpcomingSession(sessions, NOW)).toBe(false)
  })

  it('returns true for a future scheduled session', () => {
    const sessions = [makeSession({ status: 'scheduled', startAt: new Date('2026-06-20T09:00:00Z') })]
    expect(hasUpcomingSession(sessions, NOW)).toBe(true)
  })

  it('returns true for a future confirmed session', () => {
    const sessions = [makeSession({ status: 'confirmed', startAt: new Date('2026-06-20T09:00:00Z') })]
    expect(hasUpcomingSession(sessions, NOW)).toBe(true)
  })

  it('returns false for a future session that is cancelled/completed/no_show/skipped — only scheduled/confirmed count', () => {
    for (const status of ['cancelled', 'completed', 'no_show', 'skipped'] as const) {
      const sessions = [makeSession({ status, startAt: new Date('2026-06-20T09:00:00Z') })]
      expect(hasUpcomingSession(sessions, NOW)).toBe(false)
    }
  })

  it('defaults to the real current time when now is omitted', () => {
    const farFuture = [makeSession({ status: 'scheduled', startAt: new Date(Date.now() + 86_400_000) })]
    expect(hasUpcomingSession(farFuture)).toBe(true)
  })
})
