/**
 * Unit tests for lib/scheduling/bookingService.ts
 *
 * The repository layer is mocked — these tests cover only the booking
 * orchestration logic: conflict re-check, availability re-check, and persistence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only before any imports that transitively pull it in.
vi.mock('server-only', () => ({}))

// Mock the repository — must happen before bookingService is imported.
vi.mock('@/lib/scheduling/sessionRepository', () => ({
  findSessionsInRange: vi.fn(),
  bulkCreateSessions:  vi.fn(),
  createSeries:        vi.fn(),
}))

import {
  bookFromPlan,
  ConflictError,
  OutOfHoursError,
} from '@/lib/scheduling/bookingService'
import * as repo from '@/lib/scheduling/sessionRepository'
import type { BookingPlan, FDSession, FDSessionSeries, TrainerConfig } from '@/types/scheduling'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const CONFIG: TrainerConfig = {
  trainerId:     'trainer-1',
  timezone:      'Asia/Riyadh',  // UTC+3, no DST
  workingDays:   ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime:     '09:00',
  endTime:       '20:00',
  bufferMinutes: 15,
}

/** Mon 2026-01-05 09:00–10:00 Riyadh = 06:00–07:00 UTC */
const OCC_MON_09: BookingPlan['occurrences'][0] = {
  occurrenceKey:   '2026-01-05:09:00',
  occurrenceIndex: 0,
  startAt:  new Date('2026-01-05T06:00:00.000Z'),
  endAt:    new Date('2026-01-05T07:00:00.000Z'),
  localDate: '2026-01-05',
  localTime: '09:00',
}

const ONE_OFF_PLAN: BookingPlan = {
  kind:            'one_off',
  trainerId:       'trainer-1',
  clientId:        'client-1',
  durationMinutes: 60,
  timezone:        'Asia/Riyadh',
  occurrences:     [OCC_MON_09],
  conflicts:       [],
  outOfHours:      [],
  valid:           true,
  summary:         { total: 1, conflicts: 0, outOfHours: 0 },
}

const SERIES_PLAN: BookingPlan = {
  kind:            'series',
  trainerId:       'trainer-1',
  clientId:        'client-1',
  durationMinutes: 60,
  timezone:        'Asia/Riyadh',
  series: {
    pattern: {
      frequency: 'weekly',
      interval:  1,
      slots: [{ weekday: 1, localTime: '09:00' }],
      count: null,
      until: null,
    },
    startDate:       '2026-01-05',
    endDate:         '2026-01-25',
    durationMinutes: 60,
    timezone:        'Asia/Riyadh',
  },
  occurrences:  [OCC_MON_09],
  conflicts:    [],
  outOfHours:   [],
  valid:        true,
  summary:      { total: 1, conflicts: 0, outOfHours: 0 },
}

const MOCK_SERIES: FDSessionSeries = {
  id:              'series-1',
  tenantId:        '',
  trainerId:       'trainer-1',
  clientId:        'client-1',
  pattern:         SERIES_PLAN.series!.pattern,
  startDate:       '2026-01-05',
  endDate:         '2026-01-25',
  durationMinutes: 60,
  timezone:        'Asia/Riyadh',
  defaultRate:     100,
  status:          'active',
  version:         1,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockFindRange   = vi.mocked(repo.findSessionsInRange)
const mockBulkCreate  = vi.mocked(repo.bulkCreateSessions)
const mockCreateSeries = vi.mocked(repo.createSeries)

function clearMocks() {
  mockFindRange.mockReset()
  mockBulkCreate.mockReset()
  mockCreateSeries.mockReset()
}

beforeEach(clearMocks)

// ─── bookFromPlan — one-off ────────────────────────────────────────────────────

describe('bookFromPlan — one-off', () => {
  it('throws when plan has no occurrences', async () => {
    const empty: BookingPlan = { ...ONE_OFF_PLAN, occurrences: [] }
    await expect(bookFromPlan(empty, CONFIG, 100)).rejects.toThrow('no occurrences')
  })

  it('calls findSessionsInRange with expanded buffer window', async () => {
    mockFindRange.mockResolvedValue([])
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(ONE_OFF_PLAN, CONFIG, 100)

    expect(mockFindRange).toHaveBeenCalledOnce()
    const [trainerId, start, end] = mockFindRange.mock.calls[0]
    expect(trainerId).toBe('trainer-1')
    // Window must start before and end after the occurrence
    expect(start.getTime()).toBeLessThan(OCC_MON_09.startAt.getTime())
    expect(end.getTime()).toBeGreaterThan(OCC_MON_09.endAt.getTime())
  })

  it('returns sessionIds from bulkCreateSessions on success', async () => {
    mockFindRange.mockResolvedValue([])
    mockBulkCreate.mockResolvedValue(['fd-1'])

    const result = await bookFromPlan(ONE_OFF_PLAN, CONFIG, 100)
    expect(result.sessionIds).toEqual(['fd-1'])
    expect(result.seriesId).toBeNull()
  })

  it('passes rate to bulkCreateSessions', async () => {
    mockFindRange.mockResolvedValue([])
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(ONE_OFF_PLAN, CONFIG, 150)

    const sessions = mockBulkCreate.mock.calls[0][0]
    expect(sessions[0].rate).toBe(150)
  })

  it('passes sessionType and notes through to bulkCreateSessions', async () => {
    mockFindRange.mockResolvedValue([])
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(ONE_OFF_PLAN, CONFIG, 100, 'Strength', 'First session')

    const sessions = mockBulkCreate.mock.calls[0][0]
    expect(sessions[0].sessionType).toBe('Strength')
    expect(sessions[0].notes).toBe('First session')
  })

  it('passes null sessionType and notes when not provided', async () => {
    mockFindRange.mockResolvedValue([])
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(ONE_OFF_PLAN, CONFIG, 100)

    const sessions = mockBulkCreate.mock.calls[0][0]
    expect(sessions[0].sessionType).toBeNull()
    expect(sessions[0].notes).toBeNull()
  })

  it('throws ConflictError when fresh fetch reveals an overlap', async () => {
    const blocker: FDSession = {
      id: 'existing-1', tenantId: '', trainerId: 'trainer-1',
      clientId: 'other', clientName: 'Other',
      seriesId: null, isOverride: false,
      // Overlaps 06:00–07:00 UTC
      startAt: new Date('2026-01-05T06:30:00.000Z'),
      endAt:   new Date('2026-01-05T07:30:00.000Z'),
      durationMinutes: 60, timezone: 'Asia/Riyadh',
      status: 'scheduled', occurrenceKey: null, occurrenceIndex: null,
      rate: 100, sessionType: null, notes: null, invoiceId: null, version: 1,
    }
    mockFindRange.mockResolvedValue([blocker])

    await expect(bookFromPlan(ONE_OFF_PLAN, CONFIG, 100)).rejects.toBeInstanceOf(ConflictError)
  })

  it('throws ConflictError with the correct occurrence when there is a buffer violation', async () => {
    // Existing ends at 05:50 UTC (08:50 Riyadh), 10 min before candidate at 06:00 — buffer = 15 min
    const blocker: FDSession = {
      id: 'existing-2', tenantId: '', trainerId: 'trainer-1',
      clientId: 'other', clientName: 'Other',
      seriesId: null, isOverride: false,
      startAt: new Date('2026-01-05T05:00:00.000Z'),
      endAt:   new Date('2026-01-05T05:50:00.000Z'),
      durationMinutes: 50, timezone: 'Asia/Riyadh',
      status: 'scheduled', occurrenceKey: null, occurrenceIndex: null,
      rate: 100, sessionType: null, notes: null, invoiceId: null, version: 1,
    }
    mockFindRange.mockResolvedValue([blocker])

    let caught: ConflictError | null = null
    try {
      await bookFromPlan(ONE_OFF_PLAN, CONFIG, 100)
    } catch (e) {
      caught = e as ConflictError
    }
    expect(caught).toBeInstanceOf(ConflictError)
    expect(caught!.conflicts[0].kind).toBe('buffer')
    expect(caught!.conflicts[0].occurrence.localDate).toBe('2026-01-05')
  })

  it('throws OutOfHoursError when occurrence falls on a non-working day', async () => {
    // Saturday 2026-01-10 09:00 Riyadh
    const saturdayPlan: BookingPlan = {
      ...ONE_OFF_PLAN,
      occurrences: [{
        occurrenceKey:   '2026-01-10:09:00',
        occurrenceIndex: 0,
        startAt:  new Date('2026-01-10T06:00:00.000Z'),
        endAt:    new Date('2026-01-10T07:00:00.000Z'),
        localDate: '2026-01-10',
        localTime: '09:00',
      }],
    }
    mockFindRange.mockResolvedValue([])

    await expect(bookFromPlan(saturdayPlan, CONFIG, 100)).rejects.toBeInstanceOf(OutOfHoursError)
  })

  it('does not call createSeries for a one-off plan', async () => {
    mockFindRange.mockResolvedValue([])
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(ONE_OFF_PLAN, CONFIG, 100)
    expect(mockCreateSeries).not.toHaveBeenCalled()
  })
})

// ─── bookFromPlan — series ─────────────────────────────────────────────────────

describe('bookFromPlan — series', () => {
  it('calls createSeries before bulkCreateSessions', async () => {
    mockFindRange.mockResolvedValue([])
    mockCreateSeries.mockResolvedValue(MOCK_SERIES)
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(SERIES_PLAN, CONFIG, 100)

    expect(mockCreateSeries).toHaveBeenCalledOnce()
    expect(mockBulkCreate).toHaveBeenCalledOnce()
    // createSeries must be called before bulkCreateSessions
    expect(mockCreateSeries.mock.invocationCallOrder[0])
      .toBeLessThan(mockBulkCreate.mock.invocationCallOrder[0])
  })

  it('returns the seriesId from createSeries in the result', async () => {
    mockFindRange.mockResolvedValue([])
    mockCreateSeries.mockResolvedValue(MOCK_SERIES)
    mockBulkCreate.mockResolvedValue(['fd-1'])

    const result = await bookFromPlan(SERIES_PLAN, CONFIG, 100)
    expect(result.seriesId).toBe('series-1')
  })

  it('passes seriesId to each session in bulkCreateSessions', async () => {
    mockFindRange.mockResolvedValue([])
    mockCreateSeries.mockResolvedValue(MOCK_SERIES)
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(SERIES_PLAN, CONFIG, 100)

    const sessions = mockBulkCreate.mock.calls[0][0]
    expect(sessions[0].seriesId).toBe('series-1')
  })

  it('passes defaultRate to createSeries', async () => {
    mockFindRange.mockResolvedValue([])
    mockCreateSeries.mockResolvedValue(MOCK_SERIES)
    mockBulkCreate.mockResolvedValue(['fd-1'])

    await bookFromPlan(SERIES_PLAN, CONFIG, 200)

    const seriesInput = mockCreateSeries.mock.calls[0][0]
    expect(seriesInput.defaultRate).toBe(200)
  })

  it('does not call bulkCreateSessions if a conflict is found', async () => {
    const blocker: FDSession = {
      id: 'existing-1', tenantId: '', trainerId: 'trainer-1',
      clientId: 'other', clientName: 'Other', seriesId: null, isOverride: false,
      startAt: new Date('2026-01-05T06:30:00.000Z'),
      endAt:   new Date('2026-01-05T07:30:00.000Z'),
      durationMinutes: 60, timezone: 'Asia/Riyadh',
      status: 'scheduled', occurrenceKey: null, occurrenceIndex: null,
      rate: 100, sessionType: null, notes: null, invoiceId: null, version: 1,
    }
    mockFindRange.mockResolvedValue([blocker])

    await expect(bookFromPlan(SERIES_PLAN, CONFIG, 100)).rejects.toBeInstanceOf(ConflictError)
    expect(mockBulkCreate).not.toHaveBeenCalled()
    expect(mockCreateSeries).not.toHaveBeenCalled()
  })
})
