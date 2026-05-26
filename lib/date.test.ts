import { describe, expect, it } from 'vitest'
import { ymdInTz, hourInTz, hhmInTz } from './date'

// ─── Test timezone fixtures ────────────────────────────────────────────────────
// Asia/Riyadh — fixed UTC+3, no DST. Good for predictable offset tests.
// America/New_York — observes DST; UTC-5 (EST) in winter, UTC-4 (EDT) in summer.

const RIYADH = 'Asia/Riyadh'
const NY     = 'America/New_York'

// ─── ymdInTz ─────────────────────────────────────────────────────────────────

describe('ymdInTz', () => {
  it('returns the UTC date unchanged for the UTC zone', () => {
    expect(ymdInTz(new Date('2026-05-27T00:00:00Z'), 'UTC')).toBe('2026-05-27')
    expect(ymdInTz(new Date('2026-05-27T23:59:59Z'), 'UTC')).toBe('2026-05-27')
  })

  it('advances to the next day when UTC+3 crosses midnight', () => {
    // 2026-05-26T23:00:00Z = 2026-05-27T02:00:00 Riyadh → date '2026-05-27'
    expect(ymdInTz(new Date('2026-05-26T23:00:00Z'), RIYADH)).toBe('2026-05-27')
  })

  it('stays on the same day before midnight in UTC+3', () => {
    // 2026-05-26T20:59:00Z = 2026-05-26T23:59:00 Riyadh → still '2026-05-26'
    expect(ymdInTz(new Date('2026-05-26T20:59:00Z'), RIYADH)).toBe('2026-05-26')
  })

  it('retreats to the prior day when UTC-4 (EDT) is behind UTC', () => {
    // 2026-05-27T02:00:00Z = 2026-05-26T22:00:00 New York (EDT, UTC-4) → '2026-05-26'
    expect(ymdInTz(new Date('2026-05-27T02:00:00Z'), NY)).toBe('2026-05-26')
  })

  it('handles UTC midnight exactly', () => {
    expect(ymdInTz(new Date('2026-01-15T00:00:00Z'), 'UTC')).toBe('2026-01-15')
  })

  it('handles month-end rollover', () => {
    // 2026-01-31T22:00:00Z = 2026-02-01T01:00:00 Riyadh → '2026-02-01'
    expect(ymdInTz(new Date('2026-01-31T22:00:00Z'), RIYADH)).toBe('2026-02-01')
  })
})

// ─── hourInTz ─────────────────────────────────────────────────────────────────

describe('hourInTz', () => {
  it('returns the UTC hour unchanged for the UTC zone', () => {
    expect(hourInTz(new Date('2026-05-27T14:30:00Z'), 'UTC')).toBe(14)
    expect(hourInTz(new Date('2026-05-27T00:00:00Z'), 'UTC')).toBe(0)
  })

  it('shifts hour forward for UTC+3', () => {
    // 09:00 UTC → 12:00 Riyadh
    expect(hourInTz(new Date('2026-05-27T09:00:00Z'), RIYADH)).toBe(12)
  })

  it('shifts hour backward for UTC-4 (EDT)', () => {
    // 14:00 UTC → 10:00 New York (EDT)
    expect(hourInTz(new Date('2026-05-27T14:00:00Z'), NY)).toBe(10)
  })

  it('returns 0 for UTC midnight, not 24', () => {
    // Guards against Intl impls that return '24' at midnight
    expect(hourInTz(new Date('2026-05-27T00:00:00Z'), 'UTC')).toBe(0)
  })

  it('returns 3 for UTC midnight in Asia/Riyadh (UTC+3)', () => {
    expect(hourInTz(new Date('2026-05-27T00:00:00Z'), RIYADH)).toBe(3)
  })
})

// ─── hhmInTz ──────────────────────────────────────────────────────────────────

describe('hhmInTz', () => {
  it('returns UTC time unchanged for the UTC zone', () => {
    expect(hhmInTz(new Date('2026-05-27T09:30:00Z'), 'UTC')).toBe('09:30')
  })

  it('shifts time for UTC+3', () => {
    // 09:30 UTC → 12:30 Riyadh
    expect(hhmInTz(new Date('2026-05-27T09:30:00Z'), RIYADH)).toBe('12:30')
  })

  it('shifts time for UTC-4 (EDT)', () => {
    // 14:00 UTC → 10:00 New York (EDT)
    expect(hhmInTz(new Date('2026-05-27T14:00:00Z'), NY)).toBe('10:00')
  })

  it('pads single-digit minutes with a leading zero', () => {
    // 10:05 UTC → 13:05 Riyadh
    expect(hhmInTz(new Date('2026-05-27T10:05:00Z'), RIYADH)).toBe('13:05')
  })

  it('returns 00:mm at UTC midnight (not 24:mm)', () => {
    // UTC midnight in UTC zone → '00:00'
    expect(hhmInTz(new Date('2026-05-27T00:00:00Z'), 'UTC')).toBe('00:00')
  })

  it('returns 03:00 for UTC midnight in Asia/Riyadh', () => {
    expect(hhmInTz(new Date('2026-05-27T00:00:00Z'), RIYADH)).toBe('03:00')
  })
})
