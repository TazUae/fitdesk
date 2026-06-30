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

// Mock booking service — C3 unit tests verify action logic, not service internals.
vi.mock('@/lib/scheduling/bookingService', () => ({
  bookFromPlan: vi.fn(),
  ConflictError: class ConflictError extends Error {
    conflicts: unknown[]
    constructor(conflicts: unknown[]) {
      super('conflict')
      this.name = 'ConflictError'
      this.conflicts = conflicts
    }
  },
  OutOfHoursError: class OutOfHoursError extends Error {
    violations: Array<{ occurrence: unknown; reason: string }>
    constructor(violations: Array<{ occurrence: unknown; reason: string }>) {
      super('out of hours')
      this.name = 'OutOfHoursError'
      this.violations = violations
    }
  },
}))

// Mock engine — buildBookingPlan is pure, but we mock it to control plan output.
vi.mock('@/lib/scheduling/engine', () => ({
  buildBookingPlan: vi.fn(),
}))

import {
  listFDSessionsAction,
  getSchedulerConfig,
  buildPlanAction,
  bookPlanAction,
} from '@/actions/schedulingActions'
import * as resolveTrainerMod from '@/lib/auth/resolve-trainer'
import * as sessionRepo from '@/lib/scheduling/sessionRepository'
import * as trainerConfigMod from '@/lib/scheduling/trainerConfig'
import * as bookingServiceMod from '@/lib/scheduling/bookingService'
import * as engineMod from '@/lib/scheduling/engine'
import type { FDSession, TrainerConfig, BookingPlan, Occurrence } from '@/types/scheduling'

const mockResolveTrainerId    = vi.mocked(resolveTrainerMod.resolveTrainerId)
const mockFindSessionsInRange = vi.mocked(sessionRepo.findSessionsInRange)
const mockGetTrainerConfig    = vi.mocked(trainerConfigMod.getTrainerConfig)
const mockBookFromPlan        = vi.mocked(bookingServiceMod.bookFromPlan)
const mockBuildBookingPlan    = vi.mocked(engineMod.buildBookingPlan)

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

const MOCK_OCCURRENCE: Occurrence = {
  occurrenceKey:   '2026-01-10:09:00',
  occurrenceIndex: 0,
  startAt:         new Date('2026-01-10T06:00:00Z'),
  endAt:           new Date('2026-01-10T07:00:00Z'),
  localDate:       '2026-01-10',
  localTime:       '09:00',
}

const MOCK_PLAN: BookingPlan = {
  kind:            'one_off',
  trainerId:       'trainer-1',
  clientId:        'CUST-001',
  durationMinutes: 60,
  timezone:        'Asia/Riyadh',
  occurrences:     [MOCK_OCCURRENCE],
  conflicts:       [],
  outOfHours:      [],
  valid:           true,
  summary:         { total: 1, conflicts: 0, outOfHours: 0 },
}

beforeEach(() => {
  mockResolveTrainerId.mockReset()
  mockFindSessionsInRange.mockReset()
  mockGetTrainerConfig.mockReset()
  mockBookFromPlan.mockReset()
  mockBuildBookingPlan.mockReset()
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
    const startDelta = before - startAt.getTime()
    expect(startDelta).toBeGreaterThanOrEqual(7 * 86_400_000 - 500)
    expect(startDelta).toBeLessThanOrEqual(7 * 86_400_000 + after - before + 500)
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

// ─── buildPlanAction ──────────────────────────────────────────────────────────

describe('buildPlanAction', () => {
  it('returns a BookingPlan on success', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    mockFindSessionsInRange.mockResolvedValue([])
    mockBuildBookingPlan.mockReturnValue(MOCK_PLAN)

    const result = await buildPlanAction({
      selectedSlots:   [{ localDate: '2026-01-10', localTime: '09:00' }],
      clientId:        'CUST-001',
      durationMinutes: 60,
      recurrenceWeeks: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.occurrences).toHaveLength(1)
      expect(result.data.valid).toBe(true)
    }
  })

  it('returns AUTH error when not authenticated', async () => {
    mockResolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await buildPlanAction({
      selectedSlots:   [{ localDate: '2026-01-10', localTime: '09:00' }],
      clientId:        'CUST-001',
      durationMinutes: 60,
      recurrenceWeeks: null,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
    expect(mockFindSessionsInRange).not.toHaveBeenCalled()
  })

  it('returns EMPTY_PLAN when no slots provided', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })

    const result = await buildPlanAction({
      selectedSlots:   [],
      clientId:        'CUST-001',
      durationMinutes: 60,
      recurrenceWeeks: null,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('EMPTY_PLAN')
  })

  it('fetches existing sessions using trainer-scoped window', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    mockFindSessionsInRange.mockResolvedValue([])
    mockBuildBookingPlan.mockReturnValue(MOCK_PLAN)

    await buildPlanAction({
      selectedSlots:   [{ localDate: '2026-01-10', localTime: '09:00' }],
      clientId:        'CUST-001',
      durationMinutes: 60,
      recurrenceWeeks: null,
    })

    expect(mockFindSessionsInRange).toHaveBeenCalledOnce()
    const [trainerId] = mockFindSessionsInRange.mock.calls[0]
    expect(trainerId).toBe('trainer-1')
  })

  it('maps ERP fetch errors to ERR result', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    mockFindSessionsInRange.mockRejectedValue(new Error('ERP timeout'))

    const result = await buildPlanAction({
      selectedSlots:   [{ localDate: '2026-01-10', localTime: '09:00' }],
      clientId:        'CUST-001',
      durationMinutes: 60,
      recurrenceWeeks: null,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ERR')
      expect(result.message).toBe('ERP timeout')
    }
  })
})

// ─── bookPlanAction ────────────────────────────────────────────────────────────

describe('bookPlanAction', () => {
  it('returns session IDs and seriesId on success', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    mockBookFromPlan.mockResolvedValue({ sessionIds: ['fds-aaa', 'fds-bbb'], seriesId: null })

    const result = await bookPlanAction(MOCK_PLAN, 100)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sessionIds).toEqual(['fds-aaa', 'fds-bbb'])
      expect(result.data.seriesId).toBeNull()
    }
  })

  it('returns AUTH error when not authenticated', async () => {
    mockResolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await bookPlanAction(MOCK_PLAN, 100)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
    expect(mockBookFromPlan).not.toHaveBeenCalled()
  })

  it('returns EMPTY_PLAN when plan has no occurrences', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })

    const emptyPlan: BookingPlan = { ...MOCK_PLAN, occurrences: [], valid: false }
    const result = await bookPlanAction(emptyPlan, 100)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('EMPTY_PLAN')
    expect(mockBookFromPlan).not.toHaveBeenCalled()
  })

  it('maps ConflictError from bookFromPlan to CONFLICT code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    const ConflictErrorCls = (await import('@/lib/scheduling/bookingService')).ConflictError
    mockBookFromPlan.mockRejectedValue(new ConflictErrorCls([{ occurrence: MOCK_OCCURRENCE, kind: 'overlap' }]))

    const result = await bookPlanAction(MOCK_PLAN, 100)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CONFLICT')
  })

  it('maps OutOfHoursError from bookFromPlan to OUT_OF_HOURS code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    const OutOfHoursErrorCls = (await import('@/lib/scheduling/bookingService')).OutOfHoursError
    mockBookFromPlan.mockRejectedValue(new OutOfHoursErrorCls([{ occurrence: MOCK_OCCURRENCE, reason: 'Before 09:00' }]))

    const result = await bookPlanAction(MOCK_PLAN, 100)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('OUT_OF_HOURS')
      expect(result.message).toBe('Before 09:00')
    }
  })

  it('maps generic ERP errors to ERR code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    mockBookFromPlan.mockRejectedValue(new Error('ERP write failed'))

    const result = await bookPlanAction(MOCK_PLAN, 100)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ERR')
      expect(result.message).toBe('ERP write failed')
    }
  })

  it('passes rate, sessionType, and notes to bookFromPlan', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    mockBookFromPlan.mockResolvedValue({ sessionIds: ['fds-xyz'], seriesId: null })

    await bookPlanAction(MOCK_PLAN, 150, 'Strength', 'Morning warm-up')

    expect(mockBookFromPlan).toHaveBeenCalledWith(
      MOCK_PLAN,
      MOCK_CONFIG,
      150,
      'Strength',
      'Morning warm-up',
    )
  })

  it('does not call any invoice, package, or payment service', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTrainerConfig.mockResolvedValue(MOCK_CONFIG)
    mockBookFromPlan.mockResolvedValue({ sessionIds: ['fds-abc'], seriesId: null })

    await bookPlanAction(MOCK_PLAN, 0)

    // bookFromPlan is the only service called — no invoice/package/payment mocks exist
    // and the test would throw if they were imported and called.
    expect(mockBookFromPlan).toHaveBeenCalledOnce()
  })
})

// ─── C3 export surface ────────────────────────────────────────────────────────

describe('C3 export surface — booking actions exported; no completion/cancel/reschedule/no-show', () => {
  it('exports buildPlanAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect(typeof (mod as Record<string, unknown>).buildPlanAction).toBe('function')
  })

  it('exports bookPlanAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect(typeof (mod as Record<string, unknown>).bookPlanAction).toBe('function')
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
