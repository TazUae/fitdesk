import { describe, expect, it } from 'vitest'
import {
  countActiveClients,
  countSessionsCompletedThisWeek,
  findLowBalanceClients,
  startOfWeekUTC,
} from './metrics'
import type { Client } from '@/types'
import type { FDSession } from '@/types/scheduling'

// Friday, 2026-05-08 12:00 UTC — week of Mon 2026-05-04 → Sun 2026-05-10
const NOW    = new Date('2026-05-08T12:00:00.000Z')
const NOW_MS = NOW.getTime()
const DAY    = 86_400_000

function session(opts: Partial<FDSession>): FDSession {
  return {
    id:              'fd-' + Math.random(),
    tenantId:        '',
    trainerId:       't1',
    clientId:        'c1',
    clientName:      'X',
    seriesId:        null,
    startAt:         NOW,
    endAt:           NOW,
    durationMinutes: 60,
    timezone:        'UTC',
    status:          'scheduled',
    occurrenceKey:   null,
    occurrenceIndex: null,
    isOverride:      false,
    rate:            0,
    sessionType:     null,
    notes:           null,
    invoiceId:       null,
    version:         1,
    ...opts,
  }
}

describe('countActiveClients', () => {
  it('counts clients with upcoming scheduled or confirmed sessions', () => {
    const sessions = [
      session({ clientId: 'a', status: 'scheduled', startAt: new Date(NOW_MS + DAY) }),
      session({ clientId: 'b', status: 'confirmed', startAt: new Date(NOW_MS + 2 * DAY) }),
    ]
    expect(countActiveClients(sessions, NOW_MS)).toBe(2)
  })

  it('counts clients with completions in the last 30 days', () => {
    const sessions = [
      session({ clientId: 'a', status: 'completed', startAt: new Date(NOW_MS -  5 * DAY) }),
      session({ clientId: 'b', status: 'completed', startAt: new Date(NOW_MS - 25 * DAY) }),
    ]
    expect(countActiveClients(sessions, NOW_MS)).toBe(2)
  })

  it('excludes completions older than 30 days', () => {
    const sessions = [
      session({ clientId: 'a', status: 'completed', startAt: new Date(NOW_MS - 60 * DAY) }),
    ]
    expect(countActiveClients(sessions, NOW_MS)).toBe(0)
  })

  it('excludes past scheduled sessions', () => {
    const sessions = [
      session({ clientId: 'a', status: 'scheduled', startAt: new Date(NOW_MS - DAY) }),
    ]
    expect(countActiveClients(sessions, NOW_MS)).toBe(0)
  })

  it('excludes cancelled and no_show sessions', () => {
    const sessions = [
      session({ clientId: 'a', status: 'cancelled', startAt: new Date(NOW_MS + DAY) }),
      session({ clientId: 'b', status: 'no_show',   startAt: new Date(NOW_MS - DAY) }),
    ]
    expect(countActiveClients(sessions, NOW_MS)).toBe(0)
  })

  it('deduplicates clients across multiple sessions', () => {
    const sessions = [
      session({ clientId: 'a', status: 'scheduled', startAt: new Date(NOW_MS +     DAY) }),
      session({ clientId: 'a', status: 'completed', startAt: new Date(NOW_MS -     DAY) }),
      session({ clientId: 'a', status: 'confirmed', startAt: new Date(NOW_MS + 2 * DAY) }),
    ]
    expect(countActiveClients(sessions, NOW_MS)).toBe(1)
  })

  it('returns 0 for empty input', () => {
    expect(countActiveClients([], NOW_MS)).toBe(0)
  })
})

describe('startOfWeekUTC', () => {
  it('returns the Monday 00:00 UTC of a Friday', () => {
    expect(
      startOfWeekUTC(new Date('2026-05-08T12:34:56.000Z')).toISOString(),
    ).toBe('2026-05-04T00:00:00.000Z')
  })

  it('returns the same day at 00:00 when input is already Monday', () => {
    expect(
      startOfWeekUTC(new Date('2026-05-04T15:00:00.000Z')).toISOString(),
    ).toBe('2026-05-04T00:00:00.000Z')
  })

  it('rolls back 6 days for Sunday', () => {
    expect(
      startOfWeekUTC(new Date('2026-05-10T01:00:00.000Z')).toISOString(),
    ).toBe('2026-05-04T00:00:00.000Z')
  })
})

describe('findLowBalanceClients', () => {
  function client(id: string, remainingSessions: number | undefined): Client {
    return { id, name: id, createdAt: '2026-01-01' as never, remainingSessions } as Client
  }

  it('selects clients with 1-3 sessions remaining (default threshold)', () => {
    const result = findLowBalanceClients([
      client('a', 1),
      client('b', 3),
      client('c', 4),
      client('d', undefined),
    ])
    expect(result.map(c => c.id)).toEqual(['a', 'b'])
  })

  it('excludes clients with 0 sessions remaining (no package to renew)', () => {
    expect(findLowBalanceClients([client('a', 0)])).toHaveLength(0)
  })

  it('excludes clients without a tracked balance', () => {
    expect(findLowBalanceClients([client('a', undefined)])).toHaveLength(0)
  })

  it('respects custom threshold', () => {
    const result = findLowBalanceClients([
      client('a', 5),
      client('b', 6),
    ], 5)
    expect(result.map(c => c.id)).toEqual(['a'])
  })
})

describe('countSessionsCompletedThisWeek', () => {
  it('counts only completed sessions since Monday 00:00 UTC', () => {
    const sessions = [
      session({ status: 'completed', startAt: new Date('2026-05-04T08:00:00.000Z') }), // Mon
      session({ status: 'completed', startAt: new Date('2026-05-06T10:00:00.000Z') }), // Wed
      session({ status: 'completed', startAt: new Date('2026-05-03T08:00:00.000Z') }), // Sun (prev week)
      session({ status: 'scheduled', startAt: new Date('2026-05-08T08:00:00.000Z') }), // Fri scheduled
    ]
    expect(countSessionsCompletedThisWeek(sessions, NOW_MS)).toBe(2)
  })

  it('returns 0 for empty input', () => {
    expect(countSessionsCompletedThisWeek([], NOW_MS)).toBe(0)
  })
})
