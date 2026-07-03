import { describe, expect, it } from 'vitest'
import {
  localDateString,
  localTimeString,
  todayInTimezone,
  localHourInTimezone,
  fdSessionToSession,
} from './fdSessionAdapter'
import type { FDSession } from '@/types/scheduling'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// 2024-06-08T07:00:00Z
//   Asia/Riyadh (UTC+3):  10:00, same day (Jun 8)
//   Asia/Dubai  (UTC+4):  11:00, same day (Jun 8)
const JUN8_07UTC = new Date('2024-06-08T07:00:00Z')

// 2024-06-08T21:30:00Z
//   Asia/Riyadh (UTC+3):  00:30 on Jun 9
const JUN8_2130UTC = new Date('2024-06-08T21:30:00Z')

function makeFDSession(partial?: Partial<FDSession>): FDSession {
  return {
    id:                    'FDS-001',
    tenantId:              'tenant1',
    trainerId:             'T1',
    clientId:              'C1',
    clientName:            'Alice',
    seriesId:              null,
    startAt:               JUN8_07UTC,
    endAt:                 new Date('2024-06-08T08:00:00Z'),
    durationMinutes:       60,
    timezone:              'Asia/Riyadh',
    status:                'scheduled',
    occurrenceKey:         null,
    occurrenceIndex:       null,
    isOverride:            false,
    rate:                  100,
    sessionType:           null,
    notes:                 null,
    invoiceId:             null,
    version:               1,
    isTrialSession:        false,
    sessionConsumedPackage: false,
    ...partial,
  }
}

// ─── localDateString ──────────────────────────────────────────────────────────

describe('localDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(localDateString(JUN8_07UTC, 'Asia/Riyadh')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('07:00 UTC → 2024-06-08 in Asia/Riyadh (UTC+3)', () => {
    expect(localDateString(JUN8_07UTC, 'Asia/Riyadh')).toBe('2024-06-08')
  })

  it('07:00 UTC → 2024-06-08 in Asia/Dubai (UTC+4)', () => {
    expect(localDateString(JUN8_07UTC, 'Asia/Dubai')).toBe('2024-06-08')
  })

  it('rolls over to next day when UTC time crosses local midnight', () => {
    // 21:30 UTC = 00:30 Jun 9 in Asia/Riyadh
    expect(localDateString(JUN8_2130UTC, 'Asia/Riyadh')).toBe('2024-06-09')
  })
})

// ─── localTimeString ──────────────────────────────────────────────────────────

describe('localTimeString', () => {
  it('returns HH:mm format', () => {
    expect(localTimeString(JUN8_07UTC, 'Asia/Riyadh')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('07:00 UTC → 10:00 in Asia/Riyadh (UTC+3)', () => {
    expect(localTimeString(JUN8_07UTC, 'Asia/Riyadh')).toBe('10:00')
  })

  it('07:00 UTC → 11:00 in Asia/Dubai (UTC+4)', () => {
    expect(localTimeString(JUN8_07UTC, 'Asia/Dubai')).toBe('11:00')
  })

  it('21:30 UTC → 00:30 in Asia/Riyadh', () => {
    expect(localTimeString(JUN8_2130UTC, 'Asia/Riyadh')).toBe('00:30')
  })
})

// ─── todayInTimezone ──────────────────────────────────────────────────────────

describe('todayInTimezone', () => {
  it('returns a YYYY-MM-DD string for a valid timezone', () => {
    expect(todayInTimezone('Asia/Riyadh')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('falls back to a YYYY-MM-DD string for an invalid timezone', () => {
    expect(todayInTimezone('Invalid/TZ')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─── localHourInTimezone ──────────────────────────────────────────────────────

describe('localHourInTimezone', () => {
  it('returns 10 for 07:00 UTC in Asia/Riyadh (UTC+3)', () => {
    expect(localHourInTimezone(JUN8_07UTC, 'Asia/Riyadh')).toBe(10)
  })

  it('returns 11 for 07:00 UTC in Asia/Dubai (UTC+4)', () => {
    expect(localHourInTimezone(JUN8_07UTC, 'Asia/Dubai')).toBe(11)
  })

  it('returns a number in [0, 23]', () => {
    const h = localHourInTimezone(new Date(), 'Asia/Riyadh')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(23)
  })

  it('falls back to UTC hour for an invalid timezone', () => {
    const now = new Date()
    expect(localHourInTimezone(now, 'Invalid/TZ')).toBe(now.getUTCHours())
  })
})

// ─── fdSessionToSession ───────────────────────────────────────────────────────

describe('fdSessionToSession', () => {
  it('copies id, clientId, clientName, trainerId', () => {
    const s = fdSessionToSession(makeFDSession(), 'Asia/Riyadh')
    expect(s.id).toBe('FDS-001')
    expect(s.clientId).toBe('C1')
    expect(s.clientName).toBe('Alice')
    expect(s.trainerId).toBe('T1')
  })

  it('sets date to local date in the given timezone (not FDSession.timezone)', () => {
    // startAt = 07:00 UTC; Asia/Riyadh = UTC+3 → 10:00, still Jun 8
    const s = fdSessionToSession(makeFDSession(), 'Asia/Riyadh')
    expect(s.date).toBe('2024-06-08')
  })

  it('uses the passed timezone, not FDSession.timezone, for localisation', () => {
    // FDSession.timezone = 'Asia/Riyadh' but we pass 'Asia/Dubai' (UTC+4)
    const s = fdSessionToSession(makeFDSession(), 'Asia/Dubai')
    expect(s.time).toBe('11:00')   // 07:00 UTC + 4h
  })

  it('sets time to local HH:mm in the given timezone', () => {
    const s = fdSessionToSession(makeFDSession(), 'Asia/Riyadh')
    expect(s.time).toBe('10:00')   // 07:00 UTC + 3h
  })

  it('sets durationMinutes', () => {
    const s = fdSessionToSession(makeFDSession({ durationMinutes: 90 }), 'Asia/Riyadh')
    expect(s.durationMinutes).toBe(90)
  })

  // ── status mapping ─────────────────────────────────────────────────────────

  it('maps scheduled → scheduled', () => {
    expect(fdSessionToSession(makeFDSession({ status: 'scheduled' }), 'Asia/Riyadh').status).toBe('scheduled')
  })

  it('maps confirmed → scheduled', () => {
    expect(fdSessionToSession(makeFDSession({ status: 'confirmed' }), 'Asia/Riyadh').status).toBe('scheduled')
  })

  it('maps completed → completed', () => {
    expect(fdSessionToSession(makeFDSession({ status: 'completed' }), 'Asia/Riyadh').status).toBe('completed')
  })

  it('maps no_show → missed', () => {
    expect(fdSessionToSession(makeFDSession({ status: 'no_show' }), 'Asia/Riyadh').status).toBe('missed')
  })

  it('maps cancelled → cancelled', () => {
    expect(fdSessionToSession(makeFDSession({ status: 'cancelled' }), 'Asia/Riyadh').status).toBe('cancelled')
  })

  it('maps skipped → cancelled', () => {
    expect(fdSessionToSession(makeFDSession({ status: 'skipped' }), 'Asia/Riyadh').status).toBe('cancelled')
  })

  // ── rate / sessionFee ──────────────────────────────────────────────────────

  it('sets sessionFee from rate when rate > 0', () => {
    const s = fdSessionToSession(makeFDSession({ rate: 150 }), 'Asia/Riyadh')
    expect(s.sessionFee).toBe(150)
  })

  it('omits sessionFee when rate is 0', () => {
    const s = fdSessionToSession(makeFDSession({ rate: 0 }), 'Asia/Riyadh')
    expect(s.sessionFee).toBeUndefined()
  })

  // ── notes ──────────────────────────────────────────────────────────────────

  it('sets notes from FDSession.notes', () => {
    const s = fdSessionToSession(makeFDSession({ notes: 'focus on legs' }), 'Asia/Riyadh')
    expect(s.notes).toBe('focus on legs')
  })

  it('omits notes when FDSession.notes is null', () => {
    const s = fdSessionToSession(makeFDSession({ notes: null }), 'Asia/Riyadh')
    expect(s.notes).toBeUndefined()
  })
})
