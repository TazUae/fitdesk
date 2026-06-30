import { describe, it, expect, vi, beforeEach } from 'vitest'

// Silence Next.js server-side imports in the test environment.
vi.mock('next/headers', () => ({ headers: () => ({}) }))
vi.mock('server-only', () => ({}))

// Mock auth/resolve — resolveTrainerId is the single auth boundary we test.
vi.mock('@/lib/auth/resolve-trainer', () => ({
  resolveTrainerId: vi.fn(),
}))

// Mock ERP repository and trainer config.
vi.mock('@/lib/scheduling/sessionRepository', () => ({
  findSessionsInRange: vi.fn(),
}))
vi.mock('@/lib/scheduling/trainerConfig', () => ({
  getTrainerConfig: vi.fn(),
}))

import { listFDSessionsAction, getSchedulerConfig } from '@/actions/schedulingActions'
import * as resolveTrainerMod from '@/lib/auth/resolve-trainer'
import * as sessionRepo from '@/lib/scheduling/sessionRepository'
import * as trainerConfigMod from '@/lib/scheduling/trainerConfig'
import type { FDSession, TrainerConfig } from '@/types/scheduling'

const mockResolveTrainerId   = vi.mocked(resolveTrainerMod.resolveTrainerId)
const mockFindSessionsInRange = vi.mocked(sessionRepo.findSessionsInRange)
const mockGetTrainerConfig    = vi.mocked(trainerConfigMod.getTrainerConfig)

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_CONFIG: TrainerConfig = {
  trainerId:     'trainer-1',
  timezone:      'Asia/Riyadh',
  workingDays:   ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime:     '09:00',
  endTime:       '20:00',
  bufferMinutes: 15,
}

const MOCK_SESSION: FDSession = {
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
}

beforeEach(() => {
  mockResolveTrainerId.mockReset()
  mockFindSessionsInRange.mockReset()
  mockGetTrainerConfig.mockReset()
})

// ─── listFDSessionsAction ──────────────────────────────────────────────────────

describe('listFDSessionsAction', () => {
  it('returns sessions from ERP on success', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockFindSessionsInRange.mockResolvedValue([MOCK_SESSION])

    const result = await listFDSessionsAction()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('fds-001')
    }
  })

  it('scopes the ERP query to the authenticated trainer', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockFindSessionsInRange.mockResolvedValue([])

    await listFDSessionsAction()

    expect(mockFindSessionsInRange).toHaveBeenCalledOnce()
    const [trainerId] = mockFindSessionsInRange.mock.calls[0]
    expect(trainerId).toBe('trainer-1')
  })

  it('passes a rolling window starting 7 days ago and ending 90 days from now', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockFindSessionsInRange.mockResolvedValue([])

    const before = Date.now()
    await listFDSessionsAction()
    const after  = Date.now()

    const [, startAt, endAt] = mockFindSessionsInRange.mock.calls[0]
    // startAt should be ~7 days before "now"
    const startDelta = before - startAt.getTime()
    expect(startDelta).toBeGreaterThanOrEqual(7 * 86_400_000 - 500)
    expect(startDelta).toBeLessThanOrEqual(7 * 86_400_000 + after - before + 500)
    // endAt should be ~90 days after "now"
    const endDelta = endAt.getTime() - before
    expect(endDelta).toBeGreaterThanOrEqual(90 * 86_400_000 - 500)
    expect(endDelta).toBeLessThanOrEqual(90 * 86_400_000 + after - before + 500)
  })

  it('returns AUTH error when not authenticated', async () => {
    mockResolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await listFDSessionsAction()

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
    expect(mockFindSessionsInRange).not.toHaveBeenCalled()
  })

  it('maps ERP fetch errors to a structured ERR result', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockFindSessionsInRange.mockRejectedValue(new Error('ERP not reachable'))

    const result = await listFDSessionsAction()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ERR')
      expect(result.message).toBe('ERP not reachable')
    }
  })

  it('returns empty array when ERP has no sessions in range', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockFindSessionsInRange.mockResolvedValue([])

    const result = await listFDSessionsAction()

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual([])
  })
})

// ─── getSchedulerConfig ────────────────────────────────────────────────────────

describe('getSchedulerConfig', () => {
  it('returns trainer config on success', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)

    const result = await getSchedulerConfig()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.timezone).toBe('Asia/Riyadh')
      expect(result.data.trainerId).toBe('trainer-1')
    }
  })

  it('passes the resolved trainerId to getTrainerConfig', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)

    await getSchedulerConfig()

    expect(mockGetTrainerConfig).toHaveBeenCalledWith('trainer-1')
  })

  it('returns AUTH error when not authenticated', async () => {
    mockResolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await getSchedulerConfig()

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('maps config fetch errors to a structured ERR result', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockRejectedValue(new Error('ERP unavailable'))

    const result = await getSchedulerConfig()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ERR')
      expect(result.message).toBe('ERP unavailable')
    }
  })
})

// ─── C2 export surface — no mutation actions ──────────────────────────────────

describe('C2 export surface — mutation actions are absent', () => {
  it('does not export bookPlanAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).bookPlanAction).toBeUndefined()
  })

  it('does not export buildPlanAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).buildPlanAction).toBeUndefined()
  })

  it('does not export rescheduleSessionAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).rescheduleSessionAction).toBeUndefined()
  })

  it('does not export cancelSessionAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).cancelSessionAction).toBeUndefined()
  })

  it('does not export completeSessionAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).completeSessionAction).toBeUndefined()
  })

  it('does not export markNoShowAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).markNoShowAction).toBeUndefined()
  })
})
