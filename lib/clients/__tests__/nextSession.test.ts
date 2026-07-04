/**
 * Unit tests for deriveNextSessionAtUtc (Phase 5B — pure projection derivation).
 *
 * No I/O, no mocks needed: sessions are passed in directly.
 */
import { describe, it, expect } from 'vitest'
import { deriveNextSessionAtUtc } from '@/lib/clients/nextSession'
import type { FDSession } from '@/types/scheduling'

const NOW = new Date('2026-06-15T12:00:00Z')

function fdSession(overrides: Partial<FDSession> = {}): FDSession {
  return {
    id:                     'fds-001',
    tenantId:               '',
    trainerId:              'trainer-1',
    clientId:               'CUST-001',
    clientName:             'Sara Ahmad',
    seriesId:               null,
    startAt:                new Date('2026-06-20T09:00:00Z'),
    endAt:                  new Date('2026-06-20T10:00:00Z'),
    durationMinutes:        60,
    timezone:               'UTC',
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

describe('deriveNextSessionAtUtc', () => {
  it('returns null when there are no sessions', () => {
    expect(deriveNextSessionAtUtc([], NOW)).toBeNull()
  })

  it('returns null when only past sessions exist', () => {
    const sessions = [
      fdSession({ startAt: new Date('2026-06-01T09:00:00Z') }),
      fdSession({ id: 'fds-002', startAt: new Date('2026-06-10T09:00:00Z') }),
    ]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBeNull()
  })

  it('returns the timestamp of a single future session', () => {
    const sessions = [fdSession({ startAt: new Date('2026-06-20T09:00:00Z') })]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBe('2026-06-20T09:00:00.000Z')
  })

  it('returns the nearest of multiple future sessions', () => {
    const sessions = [
      fdSession({ id: 'fds-001', startAt: new Date('2026-07-01T09:00:00Z') }),
      fdSession({ id: 'fds-002', startAt: new Date('2026-06-18T09:00:00Z') }),
      fdSession({ id: 'fds-003', startAt: new Date('2026-06-25T09:00:00Z') }),
    ]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBe('2026-06-18T09:00:00.000Z')
  })

  it('ignores past sessions and returns the nearest future one', () => {
    const sessions = [
      fdSession({ id: 'fds-001', startAt: new Date('2026-06-01T09:00:00Z') }),
      fdSession({ id: 'fds-002', startAt: new Date('2026-06-30T09:00:00Z') }),
      fdSession({ id: 'fds-003', startAt: new Date('2026-06-22T09:00:00Z') }),
    ]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBe('2026-06-22T09:00:00.000Z')
  })

  it('ignores cancelled and skipped future sessions', () => {
    const sessions = [
      fdSession({ id: 'fds-001', status: 'cancelled', startAt: new Date('2026-06-16T09:00:00Z') }),
      fdSession({ id: 'fds-002', status: 'skipped', startAt: new Date('2026-06-17T09:00:00Z') }),
      fdSession({ id: 'fds-003', status: 'scheduled', startAt: new Date('2026-06-25T09:00:00Z') }),
    ]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBe('2026-06-25T09:00:00.000Z')
  })

  it('ignores completed and no_show future-dated rows', () => {
    const sessions = [
      fdSession({ id: 'fds-001', status: 'completed', startAt: new Date('2026-06-16T09:00:00Z') }),
      fdSession({ id: 'fds-002', status: 'no_show', startAt: new Date('2026-06-17T09:00:00Z') }),
    ]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBeNull()
  })

  it('treats a session starting exactly at now as not-future', () => {
    const sessions = [fdSession({ startAt: new Date(NOW) })]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBeNull()
  })

  it('accepts confirmed status as an open future session', () => {
    const sessions = [fdSession({ status: 'confirmed', startAt: new Date('2026-06-20T09:00:00Z') })]
    expect(deriveNextSessionAtUtc(sessions, NOW)).toBe('2026-06-20T09:00:00.000Z')
  })
})
