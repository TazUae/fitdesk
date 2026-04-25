/**
 * Unit tests for lib/scheduling/sessionService.ts
 *
 * Covers rescheduleOne and cancelSession with mocked repository.
 * All time-related assertions use Asia/Riyadh (UTC+3, no DST) for clarity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/scheduling/sessionRepository', () => ({
  findSessionById:     vi.fn(),
  findSessionsInRange: vi.fn(),
  updateSession:       vi.fn(),
  cancelSession:       vi.fn(),
}))

import {
  rescheduleOne,
  cancelSession,
  VersionConflictError,
  ImmutableSessionError,
} from '@/lib/scheduling/sessionService'
import { ConflictError, OutOfHoursError } from '@/lib/scheduling/bookingService'
import * as repo from '@/lib/scheduling/sessionRepository'
import type { FDSession, TrainerConfig } from '@/types/scheduling'

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
const BASE_SESSION: FDSession = {
  id:              'fd-1',
  tenantId:        '',
  trainerId:       'trainer-1',
  clientId:        'client-1',
  clientName:      'John Doe',
  seriesId:        null,
  startAt:         new Date('2026-01-05T06:00:00.000Z'),
  endAt:           new Date('2026-01-05T07:00:00.000Z'),
  durationMinutes: 60,
  timezone:        'Asia/Riyadh',
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

const mockFindById   = vi.mocked(repo.findSessionById)
const mockFindRange  = vi.mocked(repo.findSessionsInRange)
const mockUpdate     = vi.mocked(repo.updateSession)
const mockRepoCancel = vi.mocked(repo.cancelSession)

function clearMocks() {
  mockFindById.mockReset()
  mockFindRange.mockReset()
  mockUpdate.mockReset()
  mockRepoCancel.mockReset()
}

beforeEach(clearMocks)

// ─── rescheduleOne ────────────────────────────────────────────────────────────

describe('rescheduleOne', () => {
  const INPUT_CLEAR = {
    newDate:         '2026-01-06',  // Tuesday
    newTime:         '10:00',       // 10:00 Riyadh = 07:00 UTC
    expectedVersion: 1,
  }

  it('happy path: fetches session, checks conflicts, updates', async () => {
    const updated = { ...BASE_SESSION, startAt: new Date('2026-01-06T07:00:00.000Z'), endAt: new Date('2026-01-06T08:00:00.000Z'), version: 2 }
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([])
    mockUpdate.mockResolvedValue(updated)

    const result = await rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)

    expect(mockFindById).toHaveBeenCalledWith('fd-1')
    expect(mockFindRange).toHaveBeenCalledOnce()
    expect(mockUpdate).toHaveBeenCalledOnce()
    expect(result.version).toBe(2)
  })

  it('throws VersionConflictError when stored version differs from expectedVersion', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, version: 2 })

    await expect(
      rescheduleOne('fd-1', { ...INPUT_CLEAR, expectedVersion: 1 }, CONFIG)
    ).rejects.toBeInstanceOf(VersionConflictError)

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('throws ImmutableSessionError for status = completed', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, status: 'completed' })

    await expect(rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)).rejects.toBeInstanceOf(ImmutableSessionError)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('throws ImmutableSessionError for status = cancelled', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, status: 'cancelled' })

    await expect(rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for status = no_show', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, status: 'no_show' })

    await expect(rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('allows reschedule when status = confirmed', async () => {
    const confirmed = { ...BASE_SESSION, status: 'confirmed' as const }
    const updated   = { ...confirmed, startAt: new Date('2026-01-06T07:00:00.000Z'), endAt: new Date('2026-01-06T08:00:00.000Z'), version: 2 }
    mockFindById.mockResolvedValue(confirmed)
    mockFindRange.mockResolvedValue([])
    mockUpdate.mockResolvedValue(updated)

    const result = await rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)
    expect(result.version).toBe(2)
  })

  it('excludes the current session from conflict candidates', async () => {
    mockFindById.mockResolvedValue(BASE_SESSION)
    // findSessionsInRange returns the session itself — it must be excluded
    mockFindRange.mockResolvedValue([BASE_SESSION])
    mockUpdate.mockResolvedValue({ ...BASE_SESSION, version: 2 })

    await expect(rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)).resolves.toBeDefined()
  })

  it('throws ConflictError when new time conflicts with another session', async () => {
    const blocker: FDSession = {
      ...BASE_SESSION,
      id:      'fd-other',
      startAt: new Date('2026-01-06T07:30:00.000Z'),  // 10:30 Riyadh
      endAt:   new Date('2026-01-06T08:30:00.000Z'),
    }
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([blocker])

    await expect(rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)).rejects.toBeInstanceOf(ConflictError)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('throws ConflictError (buffer) when gap < bufferMinutes', async () => {
    // New session: 10:00 Riyadh (07:00 UTC); blocker ends at 09:50 Riyadh (06:50 UTC) — gap = 10 min < 15 min
    const blocker: FDSession = {
      ...BASE_SESSION,
      id:      'fd-other',
      startAt: new Date('2026-01-06T06:00:00.000Z'),  // 09:00 Riyadh
      endAt:   new Date('2026-01-06T06:50:00.000Z'),  // 09:50 Riyadh
    }
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([blocker])

    let caught: ConflictError | null = null
    try {
      await rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)
    } catch (e) {
      caught = e as ConflictError
    }
    expect(caught).toBeInstanceOf(ConflictError)
    expect(caught!.conflicts[0].kind).toBe('buffer')
  })

  it('throws OutOfHoursError when moving to a Saturday', async () => {
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([])

    await expect(
      rescheduleOne('fd-1', { ...INPUT_CLEAR, newDate: '2026-01-10' }, CONFIG)  // Saturday
    ).rejects.toBeInstanceOf(OutOfHoursError)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('throws OutOfHoursError when new time ends after working hours', async () => {
    // 19:30 + 60 min = 20:30 Riyadh — end exceeds 20:00
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([])

    await expect(
      rescheduleOne('fd-1', { ...INPUT_CLEAR, newDate: '2026-01-06', newTime: '19:30' }, CONFIG)
    ).rejects.toBeInstanceOf(OutOfHoursError)
  })

  it('throws a DST error for a spring-forward gap time (NY 2026-03-08 02:30)', async () => {
    const nyConfig: TrainerConfig = { ...CONFIG, timezone: 'America/New_York' }
    mockFindById.mockResolvedValue({ ...BASE_SESSION, timezone: 'America/New_York' })

    await expect(
      rescheduleOne('fd-1', { newDate: '2026-03-08', newTime: '02:30', expectedVersion: 1 }, nyConfig)
    ).rejects.toThrow('DST')
  })

  it('calls updateSession with isOverride = true and incremented version', async () => {
    const updated = { ...BASE_SESSION, version: 2, isOverride: true }
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([])
    mockUpdate.mockResolvedValue(updated)

    await rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)

    const patch = mockUpdate.mock.calls[0][1]
    expect(patch.isOverride).toBe(true)
    expect(patch.version).toBe(2)  // expectedVersion + 1
  })

  it('includes newRate in the update patch when provided', async () => {
    const updated = { ...BASE_SESSION, rate: 200, version: 2 }
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([])
    mockUpdate.mockResolvedValue(updated)

    await rescheduleOne('fd-1', { ...INPUT_CLEAR, newRate: 200 }, CONFIG)

    const patch = mockUpdate.mock.calls[0][1]
    expect(patch.rate).toBe(200)
  })

  it('does not include rate in patch when newRate is not provided', async () => {
    const updated = { ...BASE_SESSION, version: 2 }
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockFindRange.mockResolvedValue([])
    mockUpdate.mockResolvedValue(updated)

    await rescheduleOne('fd-1', INPUT_CLEAR, CONFIG)

    const patch = mockUpdate.mock.calls[0][1]
    expect(patch.rate).toBeUndefined()
  })
})

// ─── cancelSession ────────────────────────────────────────────────────────────

describe('cancelSession', () => {
  it('happy path: fetches session and calls repository cancelSession', async () => {
    const cancelled = { ...BASE_SESSION, status: 'cancelled' as const }
    mockFindById.mockResolvedValue(BASE_SESSION)
    mockRepoCancel.mockResolvedValue(cancelled)

    const result = await cancelSession('fd-1', 1)

    expect(mockFindById).toHaveBeenCalledWith('fd-1')
    expect(mockRepoCancel).toHaveBeenCalledWith('fd-1')
    expect(result.status).toBe('cancelled')
  })

  it('throws VersionConflictError when version does not match', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, version: 3 })

    await expect(cancelSession('fd-1', 1)).rejects.toBeInstanceOf(VersionConflictError)
    expect(mockRepoCancel).not.toHaveBeenCalled()
  })

  it('throws ImmutableSessionError when status = completed', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, status: 'completed' })

    await expect(cancelSession('fd-1', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
    expect(mockRepoCancel).not.toHaveBeenCalled()
  })

  it('throws ImmutableSessionError when status = cancelled (already cancelled)', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, status: 'cancelled' })

    await expect(cancelSession('fd-1', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError when status = skipped', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, status: 'skipped' })

    await expect(cancelSession('fd-1', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('allows cancelling a confirmed session', async () => {
    const confirmed  = { ...BASE_SESSION, status: 'confirmed' as const }
    const cancelled  = { ...confirmed, status: 'cancelled' as const }
    mockFindById.mockResolvedValue(confirmed)
    mockRepoCancel.mockResolvedValue(cancelled)

    const result = await cancelSession('fd-1', 1)
    expect(result.status).toBe('cancelled')
  })

  it('does not call repository cancelSession when version check fails', async () => {
    mockFindById.mockResolvedValue({ ...BASE_SESSION, version: 99 })

    await expect(cancelSession('fd-1', 1)).rejects.toBeInstanceOf(VersionConflictError)
    expect(mockRepoCancel).not.toHaveBeenCalled()
  })
})
