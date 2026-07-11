import { describe, it, expect, vi } from 'vitest'
import {
  rescheduleSession,
  DstInvalidError,
  RescheduleConflictError,
  RescheduleOutOfHoursError,
  type RescheduleDeps,
} from '@/lib/scheduling/sessionRescheduleService'
import {
  VersionConflictError,
  ImmutableSessionError,
} from '@/lib/scheduling/sessionCompletionService'
import type { FDSession, TrainerConfig } from '@/types/scheduling'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// 2026-01-05 is a Monday; 2026-01-06 a Tuesday — both within MOCK_CONFIG's
// working days/hours in Asia/Riyadh.
const BASE_SESSION: FDSession = {
  id:                     'fds-001',
  tenantId:               '',
  trainerId:              'trainer-1',
  clientId:               'CUST-001',
  clientName:             'Alice',
  seriesId:               null,
  startAt:                new Date('2026-01-05T06:00:00Z'), // 09:00 Asia/Riyadh (+3)
  endAt:                  new Date('2026-01-05T07:00:00Z'),
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

const MOCK_CONFIG: TrainerConfig = {
  trainerId:     'trainer-1',
  timezone:      'Asia/Riyadh',
  workingDays:   ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime:     '09:00',
  endTime:       '20:00',
  bufferMinutes: 15,
}

// Proven DST spring-forward gap (US 2026-03-08, America/New_York): 02:30 does
// not exist that day. Reused from lib/scheduling/__tests__/engine.test.ts.
const NY_TZ = 'America/New_York'

function makeDeps(opts: {
  session?:             Partial<FDSession>
  existingSessions?:    FDSession[]
  updateSessionResult?: FDSession
} = {}): RescheduleDeps {
  const session = { ...BASE_SESSION, ...opts.session }
  const updated = opts.updateSessionResult ?? { ...session, version: session.version + 1 }
  return {
    findSessionById:     vi.fn().mockResolvedValue(session),
    findSessionsInRange: vi.fn().mockResolvedValue(opts.existingSessions ?? []),
    updateSession:       vi.fn().mockResolvedValue(updated),
  }
}

// ─── Version and immutable-state guards ──────────────────────────────────────

describe('rescheduleSession — version guard', () => {
  it('throws VersionConflictError when expectedVersion does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
    ).rejects.toBeInstanceOf(VersionConflictError)
  })

  it('does not call updateSession when version does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
    ).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not call findSessionsInRange when version does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
    ).rejects.toThrow()
    expect(deps.findSessionsInRange).not.toHaveBeenCalled()
  })
})

describe('rescheduleSession — immutable-state guard', () => {
  for (const status of ['completed', 'cancelled', 'no_show', 'skipped'] as const) {
    it(`throws ImmutableSessionError for status = ${status}`, async () => {
      const deps = makeDeps({ session: { status } })
      await expect(
        rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
      ).rejects.toBeInstanceOf(ImmutableSessionError)
    })
  }

  it('does not call updateSession for terminal statuses', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
    ).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('allows scheduled to proceed', async () => {
    const deps = makeDeps({ session: { status: 'scheduled' } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    expect(deps.updateSession).toHaveBeenCalledOnce()
  })

  it('allows confirmed to proceed', async () => {
    const deps = makeDeps({ session: { status: 'confirmed' } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    expect(deps.updateSession).toHaveBeenCalledOnce()
  })
})

// ─── Happy path — moves start/end, preserves duration ─────────────────────────

describe('rescheduleSession — happy path', () => {
  it('moves startAt/endAt to the new local date/time and increments version', async () => {
    const deps = makeDeps({ session: { version: 3 } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 3, '2026-01-06', '10:00')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch.startAt.toISOString()).toBe('2026-01-06T07:00:00.000Z') // 10:00 Riyadh (+3)
    expect(patch.version).toBe(4)
  })

  it('preserves the session durationMinutes when computing the new endAt', async () => {
    const deps = makeDeps({ session: { durationMinutes: 90 } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    const durationMs = patch.endAt.getTime() - patch.startAt.getTime()
    expect(durationMs).toBe(90 * 60_000)
  })

  it('interprets the new date/time in the session\'s own recorded timezone, not the trainer config timezone', async () => {
    // Session recorded in America/New_York; config (trainer's current settings) is Asia/Riyadh.
    // 10:00 New York on 2026-01-06 (EST, UTC-5) → 15:00 UTC.
    const deps = makeDeps({ session: { timezone: NY_TZ } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch.startAt.toISOString()).toBe('2026-01-06T15:00:00.000Z')
  })
})

// ─── DST guard ─────────────────────────────────────────────────────────────────

describe('rescheduleSession — DST guard', () => {
  it('throws DstInvalidError for a spring-forward gap time', async () => {
    const deps = makeDeps({ session: { timezone: NY_TZ } })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-03-08', '02:30'),
    ).rejects.toBeInstanceOf(DstInvalidError)
  })

  it('does not call findSessionsInRange or updateSession for a DST gap', async () => {
    const deps = makeDeps({ session: { timezone: NY_TZ } })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-03-08', '02:30'),
    ).rejects.toThrow()
    expect(deps.findSessionsInRange).not.toHaveBeenCalled()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not throw for a valid time on the same DST transition day', async () => {
    // 2026-03-08 is a Sunday — use a config that includes it as a working day so
    // this test isolates the DST guard from the (separately tested) out-of-hours guard.
    const sundayConfig: TrainerConfig = { ...MOCK_CONFIG, workingDays: [...MOCK_CONFIG.workingDays, 'sun'] }
    const deps = makeDeps({ session: { timezone: NY_TZ } })
    await expect(
      rescheduleSession(deps, sundayConfig, 'fds-001', 1, '2026-03-08', '10:00'),
    ).resolves.toBeDefined()
  })
})

// ─── Conflict guard — including self-exclusion ────────────────────────────────

describe('rescheduleSession — conflict guard', () => {
  it('throws RescheduleConflictError on overlap with another session', async () => {
    const other: FDSession = {
      ...BASE_SESSION,
      id:      'fds-OTHER',
      startAt: new Date('2026-01-06T07:00:00Z'),
      endAt:   new Date('2026-01-06T08:00:00Z'),
    }
    const deps = makeDeps({ existingSessions: [other] })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
    ).rejects.toBeInstanceOf(RescheduleConflictError)
  })

  it('throws with kind "overlap" for a direct time clash', async () => {
    const other: FDSession = {
      ...BASE_SESSION,
      id:      'fds-OTHER',
      startAt: new Date('2026-01-06T07:00:00Z'),
      endAt:   new Date('2026-01-06T08:00:00Z'),
    }
    const deps = makeDeps({ existingSessions: [other] })
    try {
      await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
      expect.fail('expected rescheduleSession to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RescheduleConflictError)
      expect((err as RescheduleConflictError).kind).toBe('overlap')
    }
  })

  it('throws with kind "buffer" for a too-close (non-overlapping) time', async () => {
    // New slot: 10:00-11:00 Riyadh. Other session: 11:05-12:00 Riyadh (5 min gap,
    // within the 15-min buffer, no direct overlap).
    const other: FDSession = {
      ...BASE_SESSION,
      id:      'fds-OTHER',
      startAt: new Date('2026-01-06T08:05:00Z'),
      endAt:   new Date('2026-01-06T09:00:00Z'),
    }
    const deps = makeDeps({ existingSessions: [other] })
    try {
      await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
      expect.fail('expected rescheduleSession to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RescheduleConflictError)
      expect((err as RescheduleConflictError).kind).toBe('buffer')
    }
  })

  it('does not call updateSession when a conflict is found', async () => {
    const other: FDSession = {
      ...BASE_SESSION,
      id:      'fds-OTHER',
      startAt: new Date('2026-01-06T07:00:00Z'),
      endAt:   new Date('2026-01-06T08:00:00Z'),
    }
    const deps = makeDeps({ existingSessions: [other] })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
    ).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('excludes the session\'s own id from the conflict window — rescheduling to the exact same slot does not conflict with itself', async () => {
    // findSessionsInRange (mocked) returns the session's OWN current row as
    // part of "existing sessions in range" — a real ERP query would include
    // it since it's in the fetch window. Without self-exclusion this would
    // incorrectly report an overlap against its own prior slot.
    const self = { ...BASE_SESSION }
    const deps = makeDeps({ existingSessions: [self] })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-05', '09:00'),
    ).resolves.toBeDefined()
    expect(deps.updateSession).toHaveBeenCalledOnce()
  })

  it('still detects a conflict against a different session even when self is also in range', async () => {
    const self = { ...BASE_SESSION }
    const other: FDSession = {
      ...BASE_SESSION,
      id:      'fds-OTHER',
      startAt: new Date('2026-01-06T07:00:00Z'),
      endAt:   new Date('2026-01-06T08:00:00Z'),
    }
    const deps = makeDeps({ existingSessions: [self, other] })
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00'),
    ).rejects.toBeInstanceOf(RescheduleConflictError)
  })
})

// ─── Out-of-hours guard ────────────────────────────────────────────────────────

describe('rescheduleSession — out-of-hours guard', () => {
  it('throws RescheduleOutOfHoursError before working hours', async () => {
    const deps = makeDeps()
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '07:00'),
    ).rejects.toBeInstanceOf(RescheduleOutOfHoursError)
  })

  it('throws RescheduleOutOfHoursError after working hours', async () => {
    const deps = makeDeps()
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '19:30'),
    ).rejects.toBeInstanceOf(RescheduleOutOfHoursError)
  })

  it('throws RescheduleOutOfHoursError on a non-working day', async () => {
    // 2026-01-10 is a Saturday — not in MOCK_CONFIG.workingDays.
    const deps = makeDeps()
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-10', '10:00'),
    ).rejects.toBeInstanceOf(RescheduleOutOfHoursError)
  })

  it('does not call updateSession when out of hours', async () => {
    const deps = makeDeps()
    await expect(
      rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '07:00'),
    ).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })
})

// ─── Series member — isOverride ────────────────────────────────────────────────

describe('rescheduleSession — series member sets isOverride', () => {
  it('sets isOverride: true when the session has a seriesId', async () => {
    const deps = makeDeps({ session: { seriesId: 'series-1' } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      isOverride: true,
    }))
  })

  it('does not include isOverride in the patch for a standalone (non-series) session', async () => {
    const deps = makeDeps({ session: { seriesId: null } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('isOverride')
  })
})

// ─── Financial inertness ────────────────────────────────────────────────────────

describe('rescheduleSession — never has a financial side effect', () => {
  it('does not include invoiceId in the update patch', async () => {
    const deps = makeDeps({ session: { invoiceId: null } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('invoiceId')
  })

  it('does not include sessionConsumedPackage in the update patch', async () => {
    const deps = makeDeps({ session: { sessionConsumedPackage: true } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('sessionConsumedPackage')
  })

  it('the RescheduleDeps type has no invoice or package-consumption method at all', () => {
    // Structural: unlike CompletionDeps, RescheduleDeps only declares
    // findSessionById/findSessionsInRange/updateSession — there is nothing to
    // call even if the logic wanted to.
    const deps = makeDeps()
    expect(Object.keys(deps).sort()).toEqual(['findSessionById', 'findSessionsInRange', 'updateSession'])
  })
})

// ─── Reason/notes capture ───────────────────────────────────────────────────────

describe('rescheduleSession — reason capture on notes', () => {
  it('appends the reason to notes when the session has no prior notes', async () => {
    const deps = makeDeps({ session: { notes: null } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00', 'client asked to move to Tuesday')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      notes: 'Rescheduled: client asked to move to Tuesday',
    }))
  })

  it('appends the reason to existing notes, preserving prior content', async () => {
    const deps = makeDeps({ session: { notes: 'Prefers evening sessions' } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00', 'trainer conflict')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      notes: 'Prefers evening sessions\nRescheduled: trainer conflict',
    }))
  })

  it('does not touch notes at all when no reason is supplied', async () => {
    const deps = makeDeps({ session: { notes: 'Prefers evening sessions' } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('notes')
  })

  it('does not touch notes when reason is an empty/whitespace-only string', async () => {
    const deps = makeDeps({ session: { notes: null } })
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00', '   ')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('notes')
  })
})

// ─── Buffer-window fetch ────────────────────────────────────────────────────────

describe('rescheduleSession — conflict window is buffer-expanded around the new time', () => {
  it('passes trainerId and a buffer-expanded window to findSessionsInRange', async () => {
    const deps = makeDeps()
    await rescheduleSession(deps, MOCK_CONFIG, 'fds-001', 1, '2026-01-06', '10:00')
    expect(deps.findSessionsInRange).toHaveBeenCalledOnce()
    const [trainerId, winStart, winEnd] = (deps.findSessionsInRange as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(trainerId).toBe('trainer-1')
    // New slot: 10:00-11:00 Riyadh = 2026-01-06T07:00:00Z–08:00:00Z; buffer = 15 min.
    expect(winStart.toISOString()).toBe('2026-01-06T06:45:00.000Z')
    expect(winEnd.toISOString()).toBe('2026-01-06T08:15:00.000Z')
  })
})
