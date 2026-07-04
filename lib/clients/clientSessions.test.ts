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

import { getClientSessions } from '@/lib/clients/clientSessions'
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
