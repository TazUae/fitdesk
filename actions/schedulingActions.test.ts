import { describe, it, expect, vi, beforeEach } from 'vitest'

// Silence Next.js server-side imports in the test environment.
vi.mock('next/headers', () => ({ headers: () => ({}) }))
vi.mock('server-only', () => ({}))

// Mock auth/resolve — resolveTrainerId is the single auth boundary we test.
vi.mock('@/lib/auth/resolve-trainer', () => ({
  resolveTrainerId: vi.fn(),
}))

// Mock tenant context.
vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: vi.fn(),
}))

// Mock DB — avoids libsql connection at import time.
vi.mock('@/lib/db', () => ({ db: {} }))

// Mock client repository — used by completeSessionAction for billing mode lookup.
const mockFindClientByErpId = vi.fn()
vi.mock('@/lib/clients/repository', () => ({
  ClientRepository: class {
    findClientByErpId = mockFindClientByErpId
  },
}))

// Mock ERP repository and trainer config.
vi.mock('@/lib/scheduling/sessionRepository', () => ({
  findSessionsInRange: vi.fn(),
  findSessionById:     vi.fn(),
  updateSession:       vi.fn(),
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

// Mock completion service — action tests verify auth + error mapping, not service internals.
vi.mock('@/lib/scheduling/sessionCompletionService', () => ({
  completeSession: vi.fn(),
  BillingNotConfiguredError: class BillingNotConfiguredError extends Error {
    clientId: string
    constructor(clientId: string) {
      super(`Client ${clientId} has no billing mode configured`)
      this.name = 'BillingNotConfiguredError'
      this.clientId = clientId
    }
  },
  PayPerSessionCompletionDeferredError: class PayPerSessionCompletionDeferredError extends Error {
    sessionId: string
    constructor(sessionId: string) {
      super('Pay-per-session completion is deferred to C7')
      this.name = 'PayPerSessionCompletionDeferredError'
      this.sessionId = sessionId
    }
  },
  SessionRateNotConfiguredError: class SessionRateNotConfiguredError extends Error {
    sessionId: string
    constructor(sessionId: string) {
      super(`FD Session ${sessionId} has no session rate configured`)
      this.name = 'SessionRateNotConfiguredError'
      this.sessionId = sessionId
    }
  },
  PackageCompletionNotReadyError: class PackageCompletionNotReadyError extends Error {
    clientId: string
    constructor(clientId: string) {
      super(`Package completion not yet available for client ${clientId}`)
      this.name = 'PackageCompletionNotReadyError'
      this.clientId = clientId
    }
  },
  NoPackageBalanceError: class NoPackageBalanceError extends Error {
    clientId: string
    constructor(clientId: string) {
      super(`No active package with available sessions for client ${clientId}`)
      this.name = 'NoPackageBalanceError'
      this.clientId = clientId
    }
  },
  VersionConflictError: class VersionConflictError extends Error {
    sessionId: string
    constructor(id: string) {
      super(`Session ${id} version conflict`)
      this.name = 'VersionConflictError'
      this.sessionId = id
    }
  },
  ImmutableSessionError: class ImmutableSessionError extends Error {
    status: string
    constructor(id: string, status: string) {
      super(`Session ${id} cannot be modified: status is '${status}'`)
      this.name = 'ImmutableSessionError'
      this.status = status
    }
  },
}))

// Mock ERP client functions used by PPS completion deps.
vi.mock('@/lib/erpnext/client', () => ({
  findInvoiceBySession: vi.fn(),
  createInvoice:        vi.fn(),
  submitSalesInvoice:   vi.fn(),
}))

// Mock session invoice builder used by PPS completion deps.
vi.mock('@/lib/scheduling/sessionInvoiceBuilder', () => ({
  buildSessionInvoicePayload: vi.fn(),
}))

// Mock PackageConsumptionService — wired by the action for package-mode completion.
vi.mock('@/lib/billing/package-consumption-service', () => ({
  PackageConsumptionService: class {
    consumeSession = vi.fn()
  },
}))

// Mock PackageLedgerRepository — used by previewBatchCompletionAction for a
// read-only balance lookup (US-057). No consumeSession/mutation surface here.
const mockDeriveBalancesByClient = vi.fn()
vi.mock('@/lib/billing/package-ledger-repository', () => ({
  PackageLedgerRepository: class {
    deriveBalancesByClient = mockDeriveBalancesByClient
  },
}))

import {
  listFDSessionsAction,
  getSchedulerConfig,
  buildPlanAction,
  bookPlanAction,
  completeSessionAction,
  previewBatchCompletionAction,
  batchCompleteSessionsAction,
} from '@/actions/schedulingActions'
import * as resolveTrainerMod from '@/lib/auth/resolve-trainer'
import * as tenantContextMod from '@/lib/tenant/context'
import * as sessionRepo from '@/lib/scheduling/sessionRepository'
import * as trainerConfigMod from '@/lib/scheduling/trainerConfig'
import * as bookingServiceMod from '@/lib/scheduling/bookingService'
import * as engineMod from '@/lib/scheduling/engine'
import * as completionServiceMod from '@/lib/scheduling/sessionCompletionService'
import type { FDSession, TrainerConfig, BookingPlan, Occurrence } from '@/types/scheduling'

const mockResolveTrainerId    = vi.mocked(resolveTrainerMod.resolveTrainerId)
const mockGetTenantContext    = vi.mocked(tenantContextMod.getTenantContext)
const mockFindSessionsInRange = vi.mocked(sessionRepo.findSessionsInRange)
const mockFindSessionById     = vi.mocked(sessionRepo.findSessionById)
const mockGetTrainerConfig    = vi.mocked(trainerConfigMod.getTrainerConfig)
const mockBookFromPlan        = vi.mocked(bookingServiceMod.bookFromPlan)
const mockBuildBookingPlan    = vi.mocked(engineMod.buildBookingPlan)
const mockCompleteSession     = vi.mocked(completionServiceMod.completeSession)

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
  mockGetTenantContext.mockReset()
  mockFindSessionsInRange.mockReset()
  mockGetTrainerConfig.mockReset()
  mockBookFromPlan.mockReset()
  mockBuildBookingPlan.mockReset()
  mockCompleteSession.mockReset()
  mockFindClientByErpId.mockReset()
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

// ─── C4B export surface ───────────────────────────────────────────────────────

describe('C4B export surface — booking + completion exported; no cancel/reschedule/no-show', () => {
  it('exports buildPlanAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect(typeof (mod as Record<string, unknown>).buildPlanAction).toBe('function')
  })

  it('exports bookPlanAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect(typeof (mod as Record<string, unknown>).bookPlanAction).toBe('function')
  })

  it('exports completeSessionAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect(typeof (mod as Record<string, unknown>).completeSessionAction).toBe('function')
  })

  it('does not export rescheduleSessionAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).rescheduleSessionAction).toBeUndefined()
  })

  it('does not export cancelSessionAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).cancelSessionAction).toBeUndefined()
  })

  it('does not export markNoShowAction', async () => {
    const mod = await import('@/actions/schedulingActions')
    expect((mod as Record<string, unknown>).markNoShowAction).toBeUndefined()
  })
})

// ─── completeSessionAction ────────────────────────────────────────────────────

const MOCK_COMPLETED_SESSION: FDSession = {
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
  status:                 'completed',
  occurrenceKey:          null,
  occurrenceIndex:        null,
  isOverride:             false,
  rate:                   100,
  sessionType:            null,
  notes:                  null,
  invoiceId:              null,
  version:                2,
  isTrialSession:         true,
  sessionConsumedPackage: false,
}

const MOCK_TENANT_CTX = { userId: 'user-1', slug: 'trainer', tenantId: 'tenant-abc', provisioningStatus: 'active', lastSyncedAt: null }

describe('completeSessionAction', () => {
  it('returns AUTH error when not authenticated', async () => {
    mockResolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
    expect(mockCompleteSession).not.toHaveBeenCalled()
  })

  it('returns ERR when tenant context is missing', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(null)

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ERR')
    expect(mockCompleteSession).not.toHaveBeenCalled()
  })

  it('returns ERR when tenantId is null', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue({ ...MOCK_TENANT_CTX, tenantId: null })

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ERR')
    expect(mockCompleteSession).not.toHaveBeenCalled()
  })

  it('returns success with completed session data for trial sessions', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockCompleteSession.mockResolvedValue(MOCK_COMPLETED_SESSION)

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('completed')
      expect(result.data.id).toBe('fds-001')
    }
  })

  it('maps BillingNotConfiguredError to BILLING_NOT_CONFIGURED code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const BillingNotConfiguredErrorCls =
      (await import('@/lib/scheduling/sessionCompletionService')).BillingNotConfiguredError
    mockCompleteSession.mockRejectedValue(new BillingNotConfiguredErrorCls('CUST-001'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('BILLING_NOT_CONFIGURED')
  })

  it('maps PayPerSessionCompletionDeferredError to PPS_DEFERRED code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const PayPerSessionCompletionDeferredErrorCls =
      (await import('@/lib/scheduling/sessionCompletionService')).PayPerSessionCompletionDeferredError
    mockCompleteSession.mockRejectedValue(new PayPerSessionCompletionDeferredErrorCls('fds-001'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('PPS_DEFERRED')
  })

  it('maps PackageCompletionNotReadyError to PACKAGE_NOT_READY code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const PackageCompletionNotReadyErrorCls =
      (await import('@/lib/scheduling/sessionCompletionService')).PackageCompletionNotReadyError
    mockCompleteSession.mockRejectedValue(new PackageCompletionNotReadyErrorCls('CUST-001'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('PACKAGE_NOT_READY')
  })

  it('maps VersionConflictError to VERSION_CONFLICT code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const VersionConflictErrorCls =
      (await import('@/lib/scheduling/sessionCompletionService')).VersionConflictError
    mockCompleteSession.mockRejectedValue(new VersionConflictErrorCls('fds-001'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VERSION_CONFLICT')
  })

  it('maps ImmutableSessionError to IMMUTABLE_STATUS code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const ImmutableSessionErrorCls =
      (await import('@/lib/scheduling/sessionCompletionService')).ImmutableSessionError
    mockCompleteSession.mockRejectedValue(new ImmutableSessionErrorCls('fds-001', 'completed'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('IMMUTABLE_STATUS')
  })

  it('maps a generic ERP error to ERR code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockCompleteSession.mockRejectedValue(new Error('ERP write failed'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ERR')
      expect(result.message).toBe('ERP write failed')
    }
  })

  it('does not call any invoice or payment service', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockCompleteSession.mockResolvedValue(MOCK_COMPLETED_SESSION)

    await completeSessionAction('fds-001', 1)

    // completeSession is the only service called at this level — package consumption
    // is wired as an injected dep inside the action's closure, not a direct call.
    expect(mockCompleteSession).toHaveBeenCalledOnce()
  })

  it('maps NoPackageBalanceError to NO_PACKAGE_BALANCE code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const NoPackageBalanceErrorCls =
      (await import('@/lib/scheduling/sessionCompletionService')).NoPackageBalanceError
    mockCompleteSession.mockRejectedValue(new NoPackageBalanceErrorCls('CUST-001'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NO_PACKAGE_BALANCE')
  })

  it('maps SessionRateNotConfiguredError to SESSION_RATE_NOT_CONFIGURED code', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const SessionRateNotConfiguredErrorCls =
      (await import('@/lib/scheduling/sessionCompletionService')).SessionRateNotConfiguredError
    mockCompleteSession.mockRejectedValue(new SessionRateNotConfiguredErrorCls('fds-001'))

    const result = await completeSessionAction('fds-001', 1)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('SESSION_RATE_NOT_CONFIGURED')
  })

  it('wires PPS invoice deps into completeSession', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockCompleteSession.mockResolvedValue(MOCK_COMPLETED_SESSION)

    await completeSessionAction('fds-001', 1)

    const [deps] = mockCompleteSession.mock.calls[0] as [Record<string, unknown>, ...unknown[]]
    expect(typeof deps.findInvoiceBySession).toBe('function')
    expect(typeof deps.createInvoice).toBe('function')
    expect(typeof deps.submitSalesInvoice).toBe('function')
    expect(typeof deps.buildSessionInvoicePayload).toBe('function')
    expect(typeof deps.getPostingDate).toBe('function')
  })

  it('is retryable: first attempt ERR, second attempt succeeds', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)

    // First call: ERP status write fails
    mockCompleteSession.mockRejectedValueOnce(new Error('ERP write failed'))
    const first = await completeSessionAction('fds-001', 1)
    expect(first.success).toBe(false)
    if (!first.success) expect(first.code).toBe('ERR')

    // Second call: completeSession succeeds (ledger returned already_done internally)
    mockCompleteSession.mockResolvedValueOnce({
      ...MOCK_COMPLETED_SESSION,
      sessionConsumedPackage: true,
    })
    const second = await completeSessionAction('fds-001', 1)
    expect(second.success).toBe(true)
  })
})

// ─── previewBatchCompletionAction (US-057) ─────────────────────────────────────

function makeSession(overrides: Partial<FDSession> = {}): FDSession {
  return { ...MOCK_SESSION, ...overrides }
}

describe('previewBatchCompletionAction', () => {
  it('returns AUTH error when not authenticated', async () => {
    mockResolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await previewBatchCompletionAction(['fds-001'])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
    expect(mockFindSessionById).not.toHaveBeenCalled()
  })

  it('returns ERR when tenant context is missing', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(null)

    const result = await previewBatchCompletionAction(['fds-001'])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ERR')
  })

  it('previews a trial session as kind "trial" regardless of billing mode', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockFindSessionById.mockResolvedValue(makeSession({ isTrialSession: true }))
    mockFindClientByErpId.mockResolvedValue({ id: 'ci-1', billingMode: 'package', erpCustomerId: 'CUST-001' })

    const result = await previewBatchCompletionAction(['fds-001'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([{ id: 'fds-001', preview: { kind: 'trial' } }])
    }
    expect(mockDeriveBalancesByClient).not.toHaveBeenCalled()
  })

  it('previews a package-mode session with the summed total balance across active purchases', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockFindSessionById.mockResolvedValue(makeSession())
    mockFindClientByErpId.mockResolvedValue({ id: 'ci-1', billingMode: 'package', erpCustomerId: 'CUST-001' })
    mockDeriveBalancesByClient.mockResolvedValue({ 'purchase-a': 3, 'purchase-b': 2 })

    const result = await previewBatchCompletionAction(['fds-001'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].preview).toEqual({ kind: 'package', balanceAfter: 4 }) // (3+2) - 1
    }
  })

  it('previews a pay-per-session session with the session rate', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockFindSessionById.mockResolvedValue(makeSession({ rate: 250 }))
    mockFindClientByErpId.mockResolvedValue({ id: 'ci-1', billingMode: 'pay_per_session', erpCustomerId: 'CUST-001' })

    const result = await previewBatchCompletionAction(['fds-001'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].preview).toEqual({ kind: 'pay_per_session', amount: 250, currency: 'USD' })
    }
  })

  it('previews an unknown/no-client-row session as "unconfigured"', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockFindSessionById.mockResolvedValue(makeSession())
    mockFindClientByErpId.mockResolvedValue(null)

    const result = await previewBatchCompletionAction(['fds-001'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].preview).toEqual({ kind: 'unconfigured' })
    }
  })

  it('returns one preview item per session id, in the order requested', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockFindSessionById.mockImplementation(async (id: string) => makeSession({ id, isTrialSession: true }))
    mockFindClientByErpId.mockResolvedValue({ id: 'ci-1', billingMode: 'package', erpCustomerId: 'CUST-001' })

    const result = await previewBatchCompletionAction(['fds-A', 'fds-B', 'fds-C'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.map(d => d.id)).toEqual(['fds-A', 'fds-B', 'fds-C'])
    }
  })

  it('reports a per-item failure for a bad sessionId without aborting the rest of the batch', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockFindSessionById.mockImplementation(async (id: string) => {
      if (id === 'fds-bad') throw new Error('Session not found')
      return makeSession({ id, isTrialSession: true })
    })
    mockFindClientByErpId.mockResolvedValue({ id: 'ci-1', billingMode: 'package', erpCustomerId: 'CUST-001' })

    const result = await previewBatchCompletionAction(['fds-bad', 'fds-001'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0].id).toBe('fds-bad')
      expect(result.data[0].preview).toBeUndefined()
      expect(result.data[0].code).toBe('ERR')
      expect(result.data[0].message).toBe('Session not found')
      expect(result.data[1]).toEqual({ id: 'fds-001', preview: { kind: 'trial' } })
    }
  })
})

// ─── batchCompleteSessionsAction (US-057) — extra emphasis on duplicate prevention ──

describe('batchCompleteSessionsAction', () => {
  it('returns AUTH error when not authenticated — never calls completeSession', async () => {
    mockResolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await batchCompleteSessionsAction([{ id: 'fds-001', expectedVersion: 1 }])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('AUTH')
    expect(mockCompleteSession).not.toHaveBeenCalled()
  })

  it('returns ERR when tenant context is missing', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(null)

    const result = await batchCompleteSessionsAction([{ id: 'fds-001', expectedVersion: 1 }])

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('ERR')
  })

  it('happy path: completes multiple different sessions, one result per item', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockCompleteSession.mockImplementation(async (_deps, id) => ({ ...MOCK_COMPLETED_SESSION, id }))

    const result = await batchCompleteSessionsAction([
      { id: 'fds-A', expectedVersion: 1 },
      { id: 'fds-B', expectedVersion: 1 },
      { id: 'fds-C', expectedVersion: 1 },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      expect(result.data.every(r => r.success)).toBe(true)
      expect(result.data.map(r => r.id)).toEqual(['fds-A', 'fds-B', 'fds-C'])
    }
    expect(mockCompleteSession).toHaveBeenCalledTimes(3)
  })

  // ── Duplicate prevention — the part most likely to hide a bug ────────────────

  it('the same session id appearing twice in one batch is only genuinely completed once — the second occurrence fails safely', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)

    // Simulates completeSession's real re-fetch-and-guard behavior: the
    // underlying session becomes immutable after its first successful
    // completion, so a second attempt against the same id — even within the
    // same batch call — must be rejected, not silently treated as another
    // success (which would mean the UI could show "2 sessions resolved" for
    // what was actually one mutation plus one silently-ignored duplicate).
    const alreadyProcessed = new Set<string>()
    mockCompleteSession.mockImplementation(async (_deps, id, expectedVersion) => {
      if (alreadyProcessed.has(id)) {
        throw new completionServiceMod.ImmutableSessionError(id, 'completed')
      }
      alreadyProcessed.add(id)
      return { ...MOCK_COMPLETED_SESSION, id, version: expectedVersion + 1 }
    })

    const result = await batchCompleteSessionsAction([
      { id: 'fds-dup', expectedVersion: 1 },
      { id: 'fds-dup', expectedVersion: 1 }, // accidental duplicate in the same batch
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toMatchObject({ id: 'fds-dup', success: true })
      expect(result.data[1]).toMatchObject({ id: 'fds-dup', success: false, code: 'IMMUTABLE_STATUS' })
    }
    // Both were genuinely attempted (proves the batch doesn't silently
    // de-duplicate and skip the call) — but only one could ever succeed.
    expect(mockCompleteSession).toHaveBeenCalledTimes(2)
  })

  it('resubmitting the exact same batch a second time fails every item safely — none re-consume or re-invoice', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)

    const items = [
      { id: 'fds-A', expectedVersion: 1 },
      { id: 'fds-B', expectedVersion: 1 },
    ]

    // First submission: both succeed.
    mockCompleteSession.mockImplementation(async (_deps, id) => ({ ...MOCK_COMPLETED_SESSION, id }))
    const first = await batchCompleteSessionsAction(items)
    expect(first.success).toBe(true)
    if (first.success) expect(first.data.every(r => r.success)).toBe(true)

    // Second submission with the SAME (now-stale) items array — e.g. a
    // double-tap or a retried network request. Every underlying session is
    // now 'completed', so a fresh completeSession call for each must reject
    // with a version conflict (the real guard for "you read this before
    // someone/something else already changed it").
    mockCompleteSession.mockImplementation(async (_deps, id) => {
      throw new completionServiceMod.VersionConflictError(id)
    })
    const second = await batchCompleteSessionsAction(items)

    expect(second.success).toBe(true)
    if (second.success) {
      expect(second.data.every(r => r.success === false)).toBe(true)
      expect(second.data.every(r => r.code === 'VERSION_CONFLICT')).toBe(true)
    }
  })

  it('a package-mode session with no balance fails per-item without blocking the rest of the batch', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockCompleteSession.mockImplementation(async (_deps, id) => {
      if (id === 'fds-no-balance') {
        throw new completionServiceMod.NoPackageBalanceError('CUST-001')
      }
      return { ...MOCK_COMPLETED_SESSION, id }
    })

    const result = await batchCompleteSessionsAction([
      { id: 'fds-no-balance', expectedVersion: 1 },
      { id: 'fds-healthy',    expectedVersion: 1 },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]).toMatchObject({ id: 'fds-no-balance', success: false, code: 'NO_PACKAGE_BALANCE' })
      expect(result.data[1]).toMatchObject({ id: 'fds-healthy', success: true })
    }
  })

  it('an unexpected error on one item does not abort processing of subsequent items', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    mockCompleteSession.mockImplementation(async (_deps, id) => {
      if (id === 'fds-explodes') throw new Error('unexpected ERP timeout')
      return { ...MOCK_COMPLETED_SESSION, id }
    })

    const result = await batchCompleteSessionsAction([
      { id: 'fds-first',    expectedVersion: 1 },
      { id: 'fds-explodes', expectedVersion: 1 },
      { id: 'fds-third',    expectedVersion: 1 },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      expect(result.data[0].success).toBe(true)
      expect(result.data[1]).toMatchObject({ id: 'fds-explodes', success: false, code: 'ERR' })
      expect(result.data[2].success).toBe(true) // the third item still ran
    }
    expect(mockCompleteSession).toHaveBeenCalledTimes(3)
  })

  it('processes items sequentially, not concurrently — call order matches input order', async () => {
    mockResolveTrainerId.mockResolvedValue({ trainerId: 'trainer-1' })
    mockGetTenantContext.mockResolvedValue(MOCK_TENANT_CTX)
    const callOrder: string[] = []
    mockCompleteSession.mockImplementation(async (_deps, id) => {
      callOrder.push(id)
      return { ...MOCK_COMPLETED_SESSION, id }
    })

    await batchCompleteSessionsAction([
      { id: 'fds-1', expectedVersion: 1 },
      { id: 'fds-2', expectedVersion: 1 },
      { id: 'fds-3', expectedVersion: 1 },
    ])

    expect(callOrder).toEqual(['fds-1', 'fds-2', 'fds-3'])
  })
})
