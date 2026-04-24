/**
 * Unit tests for lib/scheduling/engine.ts
 *
 * Timezone notes:
 *   RIYADH_TZ  = 'Asia/Riyadh'       UTC+3, NO DST (safe for most tests)
 *   NY_TZ      = 'America/New_York'   UTC-5 / UTC-4, has DST (for DST edge cases)
 *
 * Verified anchor dates:
 *   2026-01-05 = Monday   (Jan 1 2026 = Thursday → +4 days = Monday)
 *   2026-03-08 = Sunday   (US spring-forward 2026: second Sunday of March)
 *   2026-11-01 = Sunday   (US fall-back 2026: first Sunday of November)
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_SERIES_WEEKS,
  buildBookingPlan,
  checkAvailability,
  detectConflict,
  detectConflictsBatch,
  expandPattern,
  resolveToUtc,
  toZonedParts,
} from '@/lib/scheduling/engine'
import type {
  Interval,
  SeriesPattern,
  TrainerConfig,
} from '@/types/scheduling'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const RIYADH_TZ = 'Asia/Riyadh'
const NY_TZ     = 'America/New_York'

/** Mon–Fri 09:00–20:00 in Riyadh, 15-min buffer. */
const DEFAULT_CONFIG: TrainerConfig = {
  trainerId:    'trainer-1',
  timezone:     RIYADH_TZ,
  workingDays:  ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime:    '09:00',
  endTime:      '20:00',
  bufferMinutes: 15,
}

/**
 * Build a UTC Date from an ISO string — typed helper to keep tests readable.
 * Always use a full ISO-8601 Z string so the result is deterministic.
 */
function utc(iso: string): Date {
  return new Date(iso)
}

/**
 * Build a simple half-hour interval starting at the given UTC ISO string.
 */
function interval30(startIso: string): Interval {
  const s = utc(startIso)
  return { startAt: s, endAt: new Date(s.getTime() + 30 * 60_000) }
}

/**
 * Build an interval of arbitrary length (minutes) from a UTC ISO string.
 */
function intervalMin(startIso: string, minutes: number): Interval {
  const s = utc(startIso)
  return { startAt: s, endAt: new Date(s.getTime() + minutes * 60_000) }
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveToUtc
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveToUtc', () => {
  it('converts Riyadh 09:00 to 06:00 UTC (UTC+3, no DST)', () => {
    const result = resolveToUtc('2026-01-05', '09:00', RIYADH_TZ)
    expect(result.toISOString()).toBe('2026-01-05T06:00:00.000Z')
  })

  it('converts Riyadh 20:00 to 17:00 UTC', () => {
    const result = resolveToUtc('2026-01-05', '20:00', RIYADH_TZ)
    expect(result.toISOString()).toBe('2026-01-05T17:00:00.000Z')
  })

  it('converts Riyadh midnight 00:00 to 21:00 UTC the previous day', () => {
    const result = resolveToUtc('2026-01-06', '00:00', RIYADH_TZ)
    expect(result.toISOString()).toBe('2026-01-05T21:00:00.000Z')
  })

  it('throws on an invalid date string', () => {
    expect(() => resolveToUtc('not-a-date', '09:00', RIYADH_TZ)).toThrow()
  })

  it('throws on an invalid time string', () => {
    expect(() => resolveToUtc('2026-01-05', '25:99', RIYADH_TZ)).toThrow()
  })

  it('throws on an invalid timezone identifier', () => {
    expect(() => resolveToUtc('2026-01-05', '09:00', 'Mars/Olympus')).toThrow()
  })

  it('throws DST_SKIP for a spring-forward gap time (NY 2026-03-08 02:30)', () => {
    // US clocks spring from 02:00 → 03:00 on March 8, 2026.
    // 02:30 does not exist in America/New_York that day.
    expect(() => resolveToUtc('2026-03-08', '02:30', NY_TZ)).toThrow('DST_SKIP')
  })

  it('throws DST_SKIP for 02:00 itself on the spring-forward day', () => {
    expect(() => resolveToUtc('2026-03-08', '02:00', NY_TZ)).toThrow('DST_SKIP')
  })

  it('does NOT throw for 01:59 (just before the spring-forward gap)', () => {
    expect(() => resolveToUtc('2026-03-08', '01:59', NY_TZ)).not.toThrow()
  })

  it('does NOT throw for 03:00 (first valid time after the spring-forward)', () => {
    expect(() => resolveToUtc('2026-03-08', '03:00', NY_TZ)).not.toThrow()
  })

  it('succeeds for a fall-back ambiguous time (NY 2026-11-01 01:30, picks earlier offset)', () => {
    // Clocks fall back from 02:00 → 01:00 on Nov 1, 2026 — 01:30 occurs twice.
    // Luxon picks the earlier UTC offset (EDT = UTC-4) → 05:30 UTC.
    const result = resolveToUtc('2026-11-01', '01:30', NY_TZ)
    expect(result.toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// toZonedParts
// ─────────────────────────────────────────────────────────────────────────────

describe('toZonedParts', () => {
  it('converts 06:00 UTC → 09:00 Riyadh on the same date', () => {
    const parts = toZonedParts(utc('2026-01-05T06:00:00.000Z'), RIYADH_TZ)
    expect(parts).toEqual({ date: '2026-01-05', time: '09:00', weekday: 1 })
  })

  it('reports weekday 1 for Monday', () => {
    // 2026-01-05 = Monday
    const parts = toZonedParts(utc('2026-01-05T06:00:00.000Z'), RIYADH_TZ)
    expect(parts.weekday).toBe(1)
  })

  it('reports weekday 0 for Sunday', () => {
    // 2026-01-11 = Sunday (Jan 5 + 6 days)
    const parts = toZonedParts(utc('2026-01-11T06:00:00.000Z'), RIYADH_TZ)
    expect(parts.weekday).toBe(0)
  })

  it('reports weekday 6 for Saturday', () => {
    // 2026-01-10 = Saturday
    const parts = toZonedParts(utc('2026-01-10T06:00:00.000Z'), RIYADH_TZ)
    expect(parts.weekday).toBe(6)
  })

  it('crosses midnight: 21:00 UTC Saturday → 00:00 Riyadh Sunday', () => {
    // 2026-01-10 21:00 UTC = 2026-01-11 00:00 Riyadh (Sunday)
    const parts = toZonedParts(utc('2026-01-10T21:00:00.000Z'), RIYADH_TZ)
    expect(parts).toEqual({ date: '2026-01-11', time: '00:00', weekday: 0 })
  })

  it('is the inverse of resolveToUtc for a valid time', () => {
    const startUtc = resolveToUtc('2026-01-05', '14:30', RIYADH_TZ)
    const parts    = toZonedParts(startUtc, RIYADH_TZ)
    expect(parts.date).toBe('2026-01-05')
    expect(parts.time).toBe('14:30')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// expandPattern
// ─────────────────────────────────────────────────────────────────────────────

describe('expandPattern', () => {
  /** Standard Mon+Wed 09:00 weekly pattern, no caps. */
  const monWed: SeriesPattern = {
    frequency: 'weekly', interval: 1,
    slots: [
      { weekday: 1, localTime: '09:00' }, // Monday
      { weekday: 3, localTime: '09:00' }, // Wednesday
    ],
    count: null, until: null,
  }

  it('generates 2 occurrences for 1 week (Mon+Wed from 2026-01-05)', () => {
    // startDate = 2026-01-05 (Monday), endDate = 2026-01-11 (Sunday, 1 week)
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-11',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(2)
  })

  it('generates 4 occurrences for 2 weeks (Mon+Wed)', () => {
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-18',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(4)
  })

  it('produces correct UTC startAt for Mon 2026-01-05 09:00 Riyadh', () => {
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-11',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs[0].startAt.toISOString()).toBe('2026-01-05T06:00:00.000Z')
  })

  it('produces correct UTC startAt for Wed 2026-01-07 09:00 Riyadh', () => {
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-11',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs[1].startAt.toISOString()).toBe('2026-01-07T06:00:00.000Z')
  })

  it('applies durationMinutes correctly to endAt', () => {
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-11',
      durationMinutes: 90, timezone: RIYADH_TZ,
    })
    const diffMs = occs[0].endAt.getTime() - occs[0].startAt.getTime()
    expect(diffMs).toBe(90 * 60_000)
  })

  it('sets occurrenceKey as "YYYY-MM-DD:HH:mm"', () => {
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-11',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs[0].occurrenceKey).toBe('2026-01-05:09:00')
    expect(occs[1].occurrenceKey).toBe('2026-01-07:09:00')
  })

  it('sets occurrenceIndex as sequential 0-based integers', () => {
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-18',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    occs.forEach((o, i) => expect(o.occurrenceIndex).toBe(i))
  })

  it('sorts slots in chronological order within the week (Wed then Fri)', () => {
    const wedFri: SeriesPattern = {
      frequency: 'weekly', interval: 1,
      slots: [
        { weekday: 5, localTime: '10:00' }, // Friday (intentionally listed first)
        { weekday: 3, localTime: '09:00' }, // Wednesday
      ],
      count: null, until: null,
    }
    const occs = expandPattern({
      seriesId: 'S1', pattern: wedFri,
      startDate: '2026-01-05', endDate: '2026-01-11',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs[0].localDate).toBe('2026-01-07') // Wednesday
    expect(occs[1].localDate).toBe('2026-01-09') // Friday
  })

  it('excludes slots before startDate', () => {
    // startDate = Wednesday; Monday is before start → only Wednesday is included
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-07', endDate: '2026-01-11',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(1)
    expect(occs[0].localDate).toBe('2026-01-07')
  })

  it('excludes slots after endDate', () => {
    // endDate = Tuesday; Wednesday is after end → only Monday is included
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-05', endDate: '2026-01-06',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(1)
    expect(occs[0].localDate).toBe('2026-01-05')
  })

  it('respects pattern.count cap', () => {
    const capped: SeriesPattern = { ...monWed, count: 3 }
    const occs = expandPattern({
      seriesId: 'S1', pattern: capped,
      startDate: '2026-01-05', endDate: '2026-02-28',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(3)
  })

  it('respects pattern.until date cap', () => {
    // until = Wednesday Jan 7; week 2 onwards skipped
    const capped: SeriesPattern = { ...monWed, until: '2026-01-07' }
    const occs = expandPattern({
      seriesId: 'S1', pattern: capped,
      startDate: '2026-01-05', endDate: '2026-01-25',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(2)
    expect(occs[1].localDate).toBe('2026-01-07')
  })

  it(`caps at MAX_SERIES_WEEKS (${MAX_SERIES_WEEKS}) even when endDate is further`, () => {
    // 1 slot per week × 13 weeks requested — only MAX_SERIES_WEEKS returned
    const mon: SeriesPattern = {
      frequency: 'weekly', interval: 1,
      slots: [{ weekday: 1, localTime: '09:00' }],
      count: null, until: null,
    }
    const occs = expandPattern({
      seriesId: 'S1', pattern: mon,
      startDate: '2026-01-05',
      endDate:   '2026-05-01', // well beyond 12 weeks
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs.length).toBeLessThanOrEqual(MAX_SERIES_WEEKS)
  })

  it('returns empty array when startDate > endDate', () => {
    const occs = expandPattern({
      seriesId: 'S1', pattern: monWed,
      startDate: '2026-01-12', endDate: '2026-01-05',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(0)
  })

  it('handles bi-weekly pattern (interval = 2)', () => {
    const biWeekly: SeriesPattern = {
      frequency: 'weekly', interval: 2,
      slots: [{ weekday: 1, localTime: '09:00' }],
      count: null, until: null,
    }
    // 4-week span with bi-weekly → 2 occurrences (week 1 and week 3)
    const occs = expandPattern({
      seriesId: 'S1', pattern: biWeekly,
      startDate: '2026-01-05', endDate: '2026-02-01',
      durationMinutes: 60, timezone: RIYADH_TZ,
    })
    expect(occs).toHaveLength(2)
    expect(occs[0].localDate).toBe('2026-01-05')
    expect(occs[1].localDate).toBe('2026-01-19') // skip week 2, take week 3
  })

  it('skips a DST spring-forward occurrence without throwing or stopping', () => {
    // NY 2026-03-08: 02:30 does not exist (spring forward)
    const dstPattern: SeriesPattern = {
      frequency: 'weekly', interval: 1,
      slots: [
        { weekday: 0, localTime: '02:30' }, // Sunday at 02:30 — will hit DST gap on Mar 8
        { weekday: 1, localTime: '09:00' }, // Monday at 09:00 — always valid
      ],
      count: null, until: null,
    }
    // Week covering 2026-03-08 (Sun) and 2026-03-09 (Mon)
    const occs = expandPattern({
      seriesId: 'S1', pattern: dstPattern,
      startDate: '2026-03-08', endDate: '2026-03-09',
      durationMinutes: 60, timezone: NY_TZ,
    })
    // Sunday 02:30 is skipped; Monday 09:00 is included
    expect(occs).toHaveLength(1)
    expect(occs[0].localDate).toBe('2026-03-09')
    expect(occs[0].localTime).toBe('09:00')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// detectConflict
// ─────────────────────────────────────────────────────────────────────────────

describe('detectConflict', () => {
  const BUFFER = 15 * 60_000 // 15 minutes in ms

  // Candidate: 10:00–11:00 UTC
  const candidate = intervalMin('2026-01-05T07:00:00.000Z', 60)

  it('returns null when existing list is empty', () => {
    expect(detectConflict(candidate, [], BUFFER)).toBeNull()
  })

  it('returns "overlap" when sessions directly overlap (same time)', () => {
    // Existing: 10:30–11:30 — overlaps candidate 10:00–11:00
    const existing = intervalMin('2026-01-05T07:30:00.000Z', 60)
    expect(detectConflict(candidate, [existing], BUFFER)).toBe('overlap')
  })

  it('returns "overlap" when existing session fully contains candidate', () => {
    // Existing: 09:30–11:30 contains 10:00–11:00
    const existing = intervalMin('2026-01-05T06:30:00.000Z', 120)
    expect(detectConflict(candidate, [existing], BUFFER)).toBe('overlap')
  })

  it('returns "overlap" when candidate fully contains existing session', () => {
    // Existing: 10:15–10:45 — inside candidate 10:00–11:00
    const existing = intervalMin('2026-01-05T07:15:00.000Z', 30)
    expect(detectConflict(candidate, [existing], BUFFER)).toBe('overlap')
  })

  it('returns "buffer" when gap < bufferMinutes (gap = 10 min, buffer = 15 min)', () => {
    // Existing ends at 09:50 (before candidate starts at 10:00, gap = 10 min)
    const existing = intervalMin('2026-01-05T06:00:00.000Z', 50) // 09:00–09:50
    expect(detectConflict(candidate, [existing], BUFFER)).toBe('buffer')
  })

  it('returns "buffer" when gap < bufferMinutes on the trailing side', () => {
    // Candidate ends at 11:00; existing starts at 11:10 (gap = 10 min)
    const existing = intervalMin('2026-01-05T08:10:00.000Z', 60) // 11:10–12:10
    expect(detectConflict(candidate, [existing], BUFFER)).toBe('buffer')
  })

  it('returns null when gap = exactly bufferMinutes (15 min)', () => {
    // Candidate ends at 11:00; existing starts at 11:15 — exactly the buffer
    const existing = intervalMin('2026-01-05T08:15:00.000Z', 60)
    expect(detectConflict(candidate, [existing], BUFFER)).toBeNull()
  })

  it('returns null when gap > bufferMinutes (16 min)', () => {
    const existing = intervalMin('2026-01-05T08:16:00.000Z', 60)
    expect(detectConflict(candidate, [existing], BUFFER)).toBeNull()
  })

  it('returns null with bufferMs = 0 for adjacent sessions (no gap required)', () => {
    // Existing ends exactly when candidate starts
    const existing = intervalMin('2026-01-05T06:00:00.000Z', 60) // ends at 07:00 = candidate start
    expect(detectConflict(candidate, [existing], 0)).toBeNull()
  })

  it('returns "overlap" with bufferMs = 0 for actual overlap', () => {
    const existing = intervalMin('2026-01-05T07:30:00.000Z', 60)
    expect(detectConflict(candidate, [existing], 0)).toBe('overlap')
  })

  it('evaluates all existing sessions — returns "overlap" even if first is clear', () => {
    const clear    = intervalMin('2026-01-05T03:00:00.000Z', 60) // no conflict
    const conflict = intervalMin('2026-01-05T07:30:00.000Z', 60) // overlap
    expect(detectConflict(candidate, [clear, conflict], BUFFER)).toBe('overlap')
  })

  it('"overlap" takes priority over "buffer" in the same pass', () => {
    const bufferOnly = intervalMin('2026-01-05T06:00:00.000Z', 50) // buffer hit
    const overlap    = intervalMin('2026-01-05T07:30:00.000Z', 60) // overlap
    expect(detectConflict(candidate, [bufferOnly, overlap], BUFFER)).toBe('overlap')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// detectConflictsBatch
// ─────────────────────────────────────────────────────────────────────────────

describe('detectConflictsBatch', () => {
  const BUFFER = 15 * 60_000

  it('returns empty array when no candidates', () => {
    expect(detectConflictsBatch([], [], BUFFER)).toHaveLength(0)
  })

  it('returns empty array when all candidates are clear', () => {
    const a = intervalMin('2026-01-05T06:00:00.000Z', 60) // 09:00–10:00 Riyadh
    const b = intervalMin('2026-01-05T08:00:00.000Z', 60) // 11:00–12:00 Riyadh
    const result = detectConflictsBatch([a, b], [], BUFFER)
    expect(result).toHaveLength(0)
  })

  it('detects a conflict against existing sessions', () => {
    const existing   = intervalMin('2026-01-05T06:00:00.000Z', 60)
    const conflicting = intervalMin('2026-01-05T06:30:00.000Z', 60)
    const result = detectConflictsBatch([conflicting], [existing], BUFFER)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('overlap')
  })

  it('returns all conflicts — not just the first', () => {
    const existing = intervalMin('2026-01-05T06:00:00.000Z', 60)
    const c1 = intervalMin('2026-01-05T06:30:00.000Z', 30) // overlaps existing
    const c2 = intervalMin('2026-01-05T06:45:00.000Z', 30) // overlaps existing
    const result = detectConflictsBatch([c1, c2], [existing], BUFFER)
    expect(result).toHaveLength(2)
  })

  it('detects intra-batch self-conflict (two new sessions that overlap each other)', () => {
    // Both new sessions overlap — no existing sessions at all
    const c1 = intervalMin('2026-01-05T06:00:00.000Z', 60)
    const c2 = intervalMin('2026-01-05T06:30:00.000Z', 60)
    const result = detectConflictsBatch([c1, c2], [], BUFFER)
    // c1 is accepted; c2 conflicts with accepted c1
    expect(result).toHaveLength(1)
    expect(result[0].interval.startAt.toISOString()).toBe(c2.startAt.toISOString())
  })

  it('accepted candidates block subsequent candidates in the batch', () => {
    // c1 clear → accepted; c2 conflicts with c1 (not existing); c3 clear
    const c1 = intervalMin('2026-01-05T06:00:00.000Z', 60)  // 09:00–10:00
    const c2 = intervalMin('2026-01-05T06:30:00.000Z', 60)  // 09:30–10:30 — conflicts c1
    const c3 = intervalMin('2026-01-05T09:00:00.000Z', 60)  // 12:00–13:00 — clear
    const result = detectConflictsBatch([c1, c2, c3], [], BUFFER)
    expect(result).toHaveLength(1)
    expect(result[0].interval.startAt.toISOString()).toBe(c2.startAt.toISOString())
  })

  it('reports the correct interval reference in the result', () => {
    const existing  = intervalMin('2026-01-05T06:00:00.000Z', 60)
    const candidate = intervalMin('2026-01-05T06:30:00.000Z', 60)
    const result = detectConflictsBatch([candidate], [existing], BUFFER)
    expect(result[0].interval).toBe(candidate)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkAvailability
// ─────────────────────────────────────────────────────────────────────────────

describe('checkAvailability', () => {
  /**
   * Helper: build a session candidate in Riyadh time, fully UTC-aware.
   * startHour / endHour are local Riyadh hours.
   */
  function riyadhSession(
    date:      string,
    startHour: number,
    endHour:   number,
    startMin = 0,
    endMin   = 0,
  ): { startAt: Date; endAt: Date } {
    const utcOffset = 3 * 60  // Riyadh is UTC+3, no DST
    const toUtc = (h: number, m: number) =>
      new Date(Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)),
        h - 3, m,
      ))
    return { startAt: toUtc(startHour, startMin), endAt: toUtc(endHour, endMin) }
    void utcOffset
  }

  it('returns null for a session fully within working hours (Mon 09:00–10:00)', () => {
    const sess = riyadhSession('2026-01-05', 9, 10)  // Monday
    expect(checkAvailability(sess, DEFAULT_CONFIG)).toBeNull()
  })

  it('returns null for a session exactly spanning the full working window (09:00–20:00)', () => {
    const sess = riyadhSession('2026-01-05', 9, 20)
    expect(checkAvailability(sess, DEFAULT_CONFIG)).toBeNull()
  })

  it('returns a reason when the day is not a working day (Saturday)', () => {
    // 2026-01-10 = Saturday
    const sess = riyadhSession('2026-01-10', 9, 10)
    const result = checkAvailability(sess, DEFAULT_CONFIG)
    expect(result).toBeTruthy()
    expect(result).toContain('sat')
  })

  it('returns a reason when the day is not a working day (Sunday)', () => {
    // 2026-01-11 = Sunday
    const sess = riyadhSession('2026-01-11', 9, 10)
    const result = checkAvailability(sess, DEFAULT_CONFIG)
    expect(result).toBeTruthy()
    expect(result).toContain('sun')
  })

  it('returns a reason when session starts before working hours (07:00)', () => {
    const sess = riyadhSession('2026-01-05', 7, 8)
    const result = checkAvailability(sess, DEFAULT_CONFIG)
    expect(result).toBeTruthy()
    expect(result).toContain('09:00')
  })

  it('returns a reason when session ends after working hours (20:30)', () => {
    const sess = riyadhSession('2026-01-05', 19, 20, 30, 30)
    const result = checkAvailability(sess, DEFAULT_CONFIG)
    expect(result).toBeTruthy()
    expect(result).toContain('20:00')
  })

  it('returns a reason when session spans from inside to outside hours', () => {
    // Starts at 19:30, ends at 20:30 — end exceeds 20:00
    const sess = riyadhSession('2026-01-05', 19, 20, 30, 30)
    expect(checkAvailability(sess, DEFAULT_CONFIG)).toBeTruthy()
  })

  it('works when the trainer config includes Sunday as a working day', () => {
    const sundayConfig: TrainerConfig = {
      ...DEFAULT_CONFIG,
      workingDays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'],
    }
    // 2026-01-11 = Sunday
    const sess = riyadhSession('2026-01-11', 9, 10)
    expect(checkAvailability(sess, sundayConfig)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildBookingPlan
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBookingPlan', () => {
  const BASE = {
    trainerId:       'trainer-1',
    clientId:        'client-1',
    durationMinutes: 60,
    timezone:        RIYADH_TZ,
    config:          DEFAULT_CONFIG,
    existingSessions: [] as Interval[],
  }

  // ── Kind classification ────────────────────────────────────────────────────

  it('kind = one_off for a single slot with no recurrenceWeeks', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: null,
    })
    expect(plan.kind).toBe('one_off')
  })

  it('kind = series for a single slot with recurrenceWeeks set', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: 4,
    })
    expect(plan.kind).toBe('series')
  })

  it('kind = series for multiple slots even with no recurrenceWeeks', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots: [
        { localDate: '2026-01-05', localTime: '09:00' }, // Mon
        { localDate: '2026-01-07', localTime: '09:00' }, // Wed
      ],
      recurrenceWeeks: null,
    })
    expect(plan.kind).toBe('series')
  })

  // ── One-off occurrence count ───────────────────────────────────────────────

  it('produces exactly 1 occurrence for a one-off booking', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: null,
    })
    expect(plan.occurrences).toHaveLength(1)
    expect(plan.occurrences[0].localDate).toBe('2026-01-05')
  })

  it('sets series = undefined for a one-off plan', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: null,
    })
    expect(plan.series).toBeUndefined()
  })

  // ── Series occurrence count ────────────────────────────────────────────────

  it('produces 4 occurrences for 1 slot × 4 weeks', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: 4,
    })
    expect(plan.occurrences).toHaveLength(4)
  })

  it('produces 8 occurrences for Mon+Wed × 4 weeks', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots: [
        { localDate: '2026-01-05', localTime: '09:00' }, // Mon
        { localDate: '2026-01-07', localTime: '09:00' }, // Wed
      ],
      recurrenceWeeks: 4,
    })
    expect(plan.occurrences).toHaveLength(8)
  })

  it('produces 2 occurrences for 2 slots with no recurrenceWeeks (1-week series)', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots: [
        { localDate: '2026-01-05', localTime: '09:00' }, // Mon
        { localDate: '2026-01-07', localTime: '09:00' }, // Wed
      ],
      recurrenceWeeks: null,
    })
    expect(plan.occurrences).toHaveLength(2)
  })

  // ── Conflict detection ────────────────────────────────────────────────────

  it('valid = true when no conflicts and all slots in working hours', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: null,
    })
    expect(plan.valid).toBe(true)
    expect(plan.summary.conflicts).toBe(0)
  })

  it('valid = false when a proposed slot overlaps an existing session', () => {
    // Existing: Mon Jan 5 09:30–10:30 Riyadh (06:30–07:30 UTC)
    const existing: Interval = {
      startAt: utc('2026-01-05T06:30:00.000Z'),
      endAt:   utc('2026-01-05T07:30:00.000Z'),
    }
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:     [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks:   null,
      existingSessions:  [existing],
    })
    expect(plan.valid).toBe(false)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0].kind).toBe('overlap')
    expect(plan.summary.conflicts).toBe(1)
  })

  it('valid = false on a buffer conflict (existing ends 10 min before new starts)', () => {
    // New session: 09:00 Riyadh = 06:00 UTC; existing ends at 08:50 Riyadh = 05:50 UTC
    const existing: Interval = {
      startAt: utc('2026-01-05T05:00:00.000Z'),
      endAt:   utc('2026-01-05T05:50:00.000Z'), // ends 10 min before 06:00, gap < 15 min
    }
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:    [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks:  null,
      existingSessions: [existing],
    })
    expect(plan.valid).toBe(false)
    expect(plan.conflicts[0].kind).toBe('buffer')
  })

  it('reports conflict on the correct occurrence in a series', () => {
    // Week 2 Monday conflicts; week 1 Monday is clear
    const existing: Interval = {
      startAt: utc('2026-01-12T06:30:00.000Z'), // Mon Jan 12 09:30 Riyadh
      endAt:   utc('2026-01-12T07:30:00.000Z'),
    }
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:    [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks:  4,
      existingSessions: [existing],
    })
    expect(plan.valid).toBe(false)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0].occurrence.localDate).toBe('2026-01-12')
  })

  // ── Out-of-hours ──────────────────────────────────────────────────────────

  it('valid = false when the slot is outside working hours', () => {
    // Saturday is not a working day
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-10', localTime: '09:00' }],
      recurrenceWeeks: null,
    })
    expect(plan.valid).toBe(false)
    expect(plan.outOfHours).toHaveLength(1)
    expect(plan.summary.outOfHours).toBe(1)
  })

  // ── Summary ───────────────────────────────────────────────────────────────

  it('summary.total matches occurrences.length', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: 4,
    })
    expect(plan.summary.total).toBe(plan.occurrences.length)
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('returns a valid=false empty plan for zero selected slots', () => {
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots:   [],
      recurrenceWeeks: null,
    })
    expect(plan.valid).toBe(false)
    expect(plan.occurrences).toHaveLength(0)
    expect(plan.summary.total).toBe(0)
  })

  it('deduplicates slots with identical weekday+time across different dates', () => {
    // Two Mondays at 09:00 should produce a single Mon-09:00 slot in the pattern
    const plan = buildBookingPlan({
      ...BASE,
      selectedSlots: [
        { localDate: '2026-01-05', localTime: '09:00' }, // Mon week 1
        { localDate: '2026-01-12', localTime: '09:00' }, // Mon week 2 — same weekday+time
      ],
      recurrenceWeeks: 1,
    })
    // Pattern has 1 unique slot → 1 occurrence per week
    expect(plan.series?.pattern.slots).toHaveLength(1)
  })

  it('passes trainerId and clientId through to the plan unchanged', () => {
    const plan = buildBookingPlan({
      ...BASE,
      trainerId: 'trainer-xyz',
      clientId:  'client-abc',
      selectedSlots:   [{ localDate: '2026-01-05', localTime: '09:00' }],
      recurrenceWeeks: null,
    })
    expect(plan.trainerId).toBe('trainer-xyz')
    expect(plan.clientId).toBe('client-abc')
  })
})
