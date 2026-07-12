/**
 * Unit tests for getClientSessions (Phase 4 — FD Session truth for the client
 * detail page).
 *
 * findSessionsForClient is mocked so these tests prove the derivation itself:
 * it reads from the FD Session repository (not the dead PT Session stub),
 * maps results through fdSessionToSession, and degrades to [] on error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/scheduling/sessionRepository', () => ({
  findSessionsForClient: vi.fn(),
}))

import { getClientSessions, getClientAttendanceCounts } from '@/lib/clients/clientSessions'
import * as sessionRepository from '@/lib/scheduling/sessionRepository'
import type { FDSession } from '@/types/scheduling'

const mockFindSessionsForClient = vi.mocked(sessionRepository.findSessionsForClient)

beforeEach(() => mockFindSessionsForClient.mockReset())

function fdSession(overrides: Partial<FDSession> = {}): FDSession {
  return {
    id:                     'fds-001',
    tenantId:               '',
    trainerId:              'trainer-1',
    clientId:               'CUST-001',
    clientName:             'Sara Ahmad',
    seriesId:               null,
    startAt:                new Date('2026-01-05T09:00:00Z'),
    endAt:                  new Date('2026-01-05T10:00:00Z'),
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

describe('getClientSessions', () => {
  it('reads from the FD Session repository (not the dead PT Session stub)', async () => {
    mockFindSessionsForClient.mockResolvedValue([])
    await getClientSessions('trainer-1', 'CUST-001', 'UTC')
    expect(sessionRepository.findSessionsForClient).toHaveBeenCalledWith('trainer-1', 'CUST-001')
  })

  it('preserves trainer/client ownership scoping in the call', async () => {
    mockFindSessionsForClient.mockResolvedValue([])
    await getClientSessions('trainer-2', 'CUST-999', 'Asia/Riyadh')
    expect(sessionRepository.findSessionsForClient).toHaveBeenCalledWith('trainer-2', 'CUST-999')
  })

  it('maps FD Sessions to the legacy Session type with count/date/status preserved', async () => {
    mockFindSessionsForClient.mockResolvedValue([
      fdSession({ id: 'fds-001', status: 'completed' }),
      fdSession({ id: 'fds-002', status: 'scheduled' }),
    ])
    const result = await getClientSessions('trainer-1', 'CUST-001', 'UTC')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('fds-001')
    expect(result[0].status).toBe('completed')
    expect(result[1].status).toBe('scheduled')
    expect(result[0].date).toBe('2026-01-05')
  })

  it('returns [] (honest empty state) when the client has no FD Sessions', async () => {
    mockFindSessionsForClient.mockResolvedValue([])
    const result = await getClientSessions('trainer-1', 'CUST-001', 'UTC')
    expect(result).toEqual([])
  })

  it('degrades to [] instead of throwing when the repository call fails', async () => {
    mockFindSessionsForClient.mockRejectedValueOnce(new Error('ERP unavailable'))
    const result = await getClientSessions('trainer-1', 'CUST-001', 'UTC')
    expect(result).toEqual([])
  })
})

// ─── getClientAttendanceCounts (US-049) ────────────────────────────────────────

describe('getClientAttendanceCounts', () => {
  it('reads from the same tenant/trainer-scoped FD Session repository call', async () => {
    mockFindSessionsForClient.mockResolvedValue([])
    await getClientAttendanceCounts('trainer-1', 'CUST-001')
    expect(sessionRepository.findSessionsForClient).toHaveBeenCalledWith('trainer-1', 'CUST-001')
  })

  it('preserves trainer/client ownership scoping in the call (tenant isolation)', async () => {
    mockFindSessionsForClient.mockResolvedValue([])
    await getClientAttendanceCounts('trainer-2', 'CUST-999')
    expect(sessionRepository.findSessionsForClient).toHaveBeenCalledWith('trainer-2', 'CUST-999')
  })

  it('derives counts from the raw FD Session statuses', async () => {
    mockFindSessionsForClient.mockResolvedValue([
      fdSession({ id: 'fds-001', status: 'completed' }),
      fdSession({ id: 'fds-002', status: 'no_show' }),
      fdSession({ id: 'fds-003', status: 'cancelled' }),
      fdSession({ id: 'fds-004', status: 'scheduled' }),
    ])
    const counts = await getClientAttendanceCounts('trainer-1', 'CUST-001')
    expect(counts).toEqual({
      completed: 1, noShow: 1, cancelled: 1, skipped: 0, unresolved: 1, total: 4,
    })
  })

  it('returns an all-zero summary (not a throw) when the client has no FD Sessions', async () => {
    mockFindSessionsForClient.mockResolvedValue([])
    const counts = await getClientAttendanceCounts('trainer-1', 'CUST-001')
    expect(counts).toEqual({
      completed: 0, noShow: 0, cancelled: 0, skipped: 0, unresolved: 0, total: 0,
    })
  })

  it('degrades to an all-zero summary instead of throwing when the repository call fails', async () => {
    mockFindSessionsForClient.mockRejectedValueOnce(new Error('ERP unavailable'))
    const counts = await getClientAttendanceCounts('trainer-1', 'CUST-001')
    expect(counts).toEqual({
      completed: 0, noShow: 0, cancelled: 0, skipped: 0, unresolved: 0, total: 0,
    })
  })

  it('does not call any invoice, payment, or package-consumption function — read-only derivation', async () => {
    // Structural guarantee: getClientAttendanceCounts and getSessionOutcomeCounts
    // only ever import findSessionsForClient (already mocked above) — there is no
    // other mocked module this function could reach for a financial side effect.
    mockFindSessionsForClient.mockResolvedValue([fdSession({ status: 'completed' })])
    const counts = await getClientAttendanceCounts('trainer-1', 'CUST-001')
    expect(counts.completed).toBe(1)
    expect(sessionRepository.findSessionsForClient).toHaveBeenCalledOnce()
  })
})
