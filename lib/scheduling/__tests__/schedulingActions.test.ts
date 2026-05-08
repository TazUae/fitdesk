/**
 * Unit tests for actions/schedulingActions.ts
 *
 * Covers auth guard, empty-plan guards, error-code mapping, and happy-path
 * delegation to the service / engine layers.  All scheduling service modules
 * are mocked — this tests the action layer only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: vi.fn().mockReturnValue(new Headers()) }))

// Error classes must be hoisted so the same constructors are used both inside
// the mock factories (where schedulingActions.ts imports them) and in the test
// body (where we throw instances to trigger mapError).
const errors = vi.hoisted(() => {
  class ConflictError extends Error {
    conflicts: Array<{ occurrence: unknown; kind: string }>
    constructor(conflicts: Array<{ occurrence: unknown; kind: string }>) {
      super('conflict')
      this.conflicts = conflicts
    }
  }
  class OutOfHoursError extends Error {
    violations: Array<{ occurrence: unknown; reason: string }>
    constructor(violations: Array<{ occurrence: unknown; reason: string }>) {
      super('out of hours')
      this.violations = violations
    }
  }
  class VersionConflictError extends Error {}
  class ImmutableSessionError extends Error {}
  return { ConflictError, OutOfHoursError, VersionConflictError, ImmutableSessionError }
})

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/trainer', () => ({ getTrainerId: vi.fn() }))

vi.mock('@/lib/scheduling/engine', () => ({ buildBookingPlan: vi.fn() }))

vi.mock('@/lib/scheduling/sessionRepository', () => ({
  findSessionsInRange: vi.fn(),
}))

vi.mock('@/lib/scheduling/bookingService', () => ({
  bookFromPlan:    vi.fn(),
  ConflictError:   errors.ConflictError,
  OutOfHoursError: errors.OutOfHoursError,
}))

vi.mock('@/lib/scheduling/sessionService', () => ({
  rescheduleOne:        vi.fn(),
  cancelSession:        vi.fn(),
  completeSession:      vi.fn(),
  markNoShow:           vi.fn(),
  VersionConflictError: errors.VersionConflictError,
  ImmutableSessionError: errors.ImmutableSessionError,
}))

import * as authModule    from '@/lib/auth'
import * as trainerModule from '@/lib/trainer'
import * as engine        from '@/lib/scheduling/engine'
import * as repo          from '@/lib/scheduling/sessionRepository'
import * as bookingSvc    from '@/lib/scheduling/bookingService'
import * as sessionSvc    from '@/lib/scheduling/sessionService'

import {
  getSchedulerConfig,
  listFDSessionsAction,
  buildPlanAction,
  bookPlanAction,
  cancelSessionAction,
  completeSessionAction,
  rescheduleSessionAction,
  markNoShowAction,
} from '@/actions/schedulingActions'

import type { FDSession } from '@/types/scheduling'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TRAINER_ID = 'trainer-abc'

const MOCK_SESSION: FDSession = {
  id:              'fd-1',
  tenantId:        '',
  trainerId:       TRAINER_ID,
  clientId:        'client-1',
  clientName:      'Jane Doe',
  seriesId:        null,
  startAt:         new Date('2026-01-05T06:00:00.000Z'),
  endAt:           new Date('2026-01-05T07:00:00.000Z'),
  durationMinutes: 60,
  timezone:        'UTC',
  status:          'scheduled',
  occurrenceKey:   null,
  occurrenceIndex: null,
  isOverride:      false,
  rate:            100,
  sessionType:     null,
  notes:           null,
  invoiceId:       null,
  version:         1,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockGetSession      = vi.mocked(authModule.auth.api.getSession)
const mockGetTrainerId    = vi.mocked(trainerModule.getTrainerId)
const mockBuildPlan       = vi.mocked(engine.buildBookingPlan)
const mockFindRange       = vi.mocked(repo.findSessionsInRange)
const mockBookFromPlan    = vi.mocked(bookingSvc.bookFromPlan)
const mockRescheduleOne   = vi.mocked(sessionSvc.rescheduleOne)
const mockCancelSession   = vi.mocked(sessionSvc.cancelSession)
const mockCompleteSession = vi.mocked(sessionSvc.completeSession)
const mockMarkNoShow      = vi.mocked(sessionSvc.markNoShow)

function setupAuth(authenticated = true) {
  if (authenticated) {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockGetTrainerId.mockResolvedValue(TRAINER_ID)
  } else {
    mockGetSession.mockResolvedValue(null)
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── getSchedulerConfig ───────────────────────────────────────────────────────

describe('getSchedulerConfig', () => {
  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await getSchedulerConfig()
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns TrainerConfig for authenticated trainer', async () => {
    setupAuth()
    const result = await getSchedulerConfig()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.trainerId).toBe(TRAINER_ID)
      expect(result.data.workingDays).toContain('mon')
      expect(result.data.startTime).toBe('09:00')
      expect(result.data.endTime).toBe('20:00')
      expect(result.data.bufferMinutes).toBe(15)
    }
  })

  it('returns ERR when getTrainerId throws', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockGetTrainerId.mockRejectedValue(new Error('trainer not found'))
    const result = await getSchedulerConfig()
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ERR')
  })
})

// ─── listFDSessionsAction ─────────────────────────────────────────────────────

describe('listFDSessionsAction', () => {
  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await listFDSessionsAction()
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns session list from repository', async () => {
    setupAuth()
    mockFindRange.mockResolvedValue([MOCK_SESSION])
    const result = await listFDSessionsAction()
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(1)
  })

  it('returns ERR when repository throws', async () => {
    setupAuth()
    mockFindRange.mockRejectedValue(new Error('ERP unavailable'))
    const result = await listFDSessionsAction()
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ERR')
  })

  it('passes a window of 7 days past to 90 days future to the repository', async () => {
    setupAuth()
    mockFindRange.mockResolvedValue([])
    await listFDSessionsAction()
    const [, start, end] = mockFindRange.mock.calls[0]
    const nowMs = Date.now()
    expect(start.getTime()).toBeLessThan(nowMs)
    expect(end.getTime()).toBeGreaterThan(nowMs + 89 * 86_400_000)
  })
})

// ─── buildPlanAction ──────────────────────────────────────────────────────────

describe('buildPlanAction', () => {
  const VALID_INPUT = {
    selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
    clientId:        'client-1',
    durationMinutes: 60,
    recurrenceWeeks: null,
  }

  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await buildPlanAction(VALID_INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns EMPTY_PLAN error when selectedSlots is empty', async () => {
    setupAuth()
    const result = await buildPlanAction({ ...VALID_INPUT, selectedSlots: [] })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('EMPTY_PLAN')
  })

  it('returns plan from buildBookingPlan on success', async () => {
    setupAuth()
    mockFindRange.mockResolvedValue([])
    const mockPlan = { occurrences: [{}], conflicts: [], violations: [] } as never
    mockBuildPlan.mockReturnValue(mockPlan)

    const result = await buildPlanAction(VALID_INPUT)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe(mockPlan)
  })

  it('calls findSessionsInRange with trainer id', async () => {
    setupAuth()
    mockFindRange.mockResolvedValue([])
    mockBuildPlan.mockReturnValue({ occurrences: [] } as never)

    await buildPlanAction(VALID_INPUT)

    expect(mockFindRange).toHaveBeenCalledOnce()
    expect(mockFindRange.mock.calls[0][0]).toBe(TRAINER_ID)
  })
})

// ─── bookPlanAction ───────────────────────────────────────────────────────────

describe('bookPlanAction', () => {
  const PLAN_WITH_OCCURRENCES = { occurrences: [{}] } as never
  const EMPTY_PLAN            = { occurrences: [] }   as never

  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await bookPlanAction(PLAN_WITH_OCCURRENCES, 100)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns EMPTY_PLAN when plan has no occurrences', async () => {
    setupAuth()
    const result = await bookPlanAction(EMPTY_PLAN, 100)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('EMPTY_PLAN')
  })

  it('returns CONFLICT when bookFromPlan throws ConflictError', async () => {
    setupAuth()
    mockBookFromPlan.mockRejectedValue(new errors.ConflictError([{ occurrence: {}, kind: 'overlap' }]))
    const result = await bookPlanAction(PLAN_WITH_OCCURRENCES, 100)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CONFLICT')
  })

  it('returns OUT_OF_HOURS when bookFromPlan throws OutOfHoursError', async () => {
    setupAuth()
    mockBookFromPlan.mockRejectedValue(new errors.OutOfHoursError([{ occurrence: {}, reason: 'outside working hours' }]))
    const result = await bookPlanAction(PLAN_WITH_OCCURRENCES, 100)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('OUT_OF_HOURS')
  })

  it('returns booking result on success', async () => {
    setupAuth()
    const mockResult = { seriesId: null, sessionIds: ['fd-1'] }
    mockBookFromPlan.mockResolvedValue(mockResult as never)
    const result = await bookPlanAction(PLAN_WITH_OCCURRENCES, 100)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe(mockResult)
  })
})

// ─── rescheduleSessionAction ──────────────────────────────────────────────────

describe('rescheduleSessionAction', () => {
  const INPUT = { newDate: '2026-01-06', newTime: '10:00', expectedVersion: 1 }

  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await rescheduleSessionAction('fd-1', INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns VERSION_CONFLICT when rescheduleOne throws VersionConflictError', async () => {
    setupAuth()
    mockRescheduleOne.mockRejectedValue(new errors.VersionConflictError())
    const result = await rescheduleSessionAction('fd-1', INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VERSION_CONFLICT')
  })

  it('returns updated session on success', async () => {
    setupAuth()
    const updated = { ...MOCK_SESSION, version: 2 }
    mockRescheduleOne.mockResolvedValue(updated)
    const result = await rescheduleSessionAction('fd-1', INPUT)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.version).toBe(2)
  })
})

// ─── cancelSessionAction ──────────────────────────────────────────────────────

describe('cancelSessionAction', () => {
  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await cancelSessionAction('fd-1', 1)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns IMMUTABLE_STATUS when cancelSession throws ImmutableSessionError', async () => {
    setupAuth()
    mockCancelSession.mockRejectedValue(new errors.ImmutableSessionError())
    const result = await cancelSessionAction('fd-1', 1)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('IMMUTABLE_STATUS')
  })

  it('returns cancelled session on success', async () => {
    setupAuth()
    const cancelled = { ...MOCK_SESSION, status: 'cancelled' as const }
    mockCancelSession.mockResolvedValue(cancelled)
    const result = await cancelSessionAction('fd-1', 1)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('cancelled')
  })
})

// ─── completeSessionAction ────────────────────────────────────────────────────

describe('completeSessionAction', () => {
  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await completeSessionAction('fd-1', 1)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns completed session on success', async () => {
    setupAuth()
    const completed = { ...MOCK_SESSION, status: 'completed' as const, invoiceId: 'SINV-001' }
    mockCompleteSession.mockResolvedValue(completed)
    const result = await completeSessionAction('fd-1', 1)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('completed')
      expect(result.data.invoiceId).toBe('SINV-001')
    }
  })

  it('returns VERSION_CONFLICT on stale version', async () => {
    setupAuth()
    mockCompleteSession.mockRejectedValue(new errors.VersionConflictError())
    const result = await completeSessionAction('fd-1', 1)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VERSION_CONFLICT')
  })
})

// ─── markNoShowAction ─────────────────────────────────────────────────────────

describe('markNoShowAction', () => {
  it('returns AUTH error when not authenticated', async () => {
    setupAuth(false)
    const result = await markNoShowAction('fd-1', 1)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
  })

  it('returns no_show session on success', async () => {
    setupAuth()
    const noShow = { ...MOCK_SESSION, status: 'no_show' as const }
    mockMarkNoShow.mockResolvedValue(noShow)
    const result = await markNoShowAction('fd-1', 1)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('no_show')
  })

  it('returns ERR on unexpected error', async () => {
    setupAuth()
    mockMarkNoShow.mockRejectedValue(new Error('unexpected'))
    const result = await markNoShowAction('fd-1', 1)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ERR')
  })
})
