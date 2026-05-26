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

// ─── Invalid timezone fallback (safeTimeZone guard) ───────────────────────────
//
// ERP Trainer Settings may contain a non-empty but unrecognised IANA value
// (e.g. 'Beirut' instead of 'Asia/Beirut', or 'GMT+3'). All three helpers must
// silently fall back to UTC rather than throw a RangeError.

describe('invalid timezone fallback', () => {
  // Anchor: UTC midnight on 2026-05-27 — a day boundary where UTC and UTC+3
  // give different dates, making any accidental non-UTC behaviour detectable.
  const MIDNIGHT_UTC = new Date('2026-05-27T00:00:00Z')
  // Midday UTC — safe for hour/time tests with unambiguous UTC values.
  const MIDDAY_UTC   = new Date('2026-05-27T14:00:00Z')

  describe('ymdInTz', () => {
    it('does not throw for an unrecognised timezone', () => {
      expect(() => ymdInTz(MIDNIGHT_UTC, 'Not/A_Timezone')).not.toThrow()
    })

    it('falls back to UTC date for an unrecognised timezone', () => {
      // UTC date at midnight is '2026-05-27'; Asia/Riyadh would give '2026-05-27'
      // too (03:00 local), but any offset timezone would differ near midnight.
      // The assertion intentionally matches UTC to confirm fallback behaviour.
      expect(ymdInTz(MIDNIGHT_UTC, 'Not/A_Timezone')).toBe(ymdInTz(MIDNIGHT_UTC, 'UTC'))
      expect(ymdInTz(MIDNIGHT_UTC, 'Beirut')).toBe(ymdInTz(MIDNIGHT_UTC, 'UTC'))
    })
  })

  describe('hourInTz', () => {
    it('does not throw for an unrecognised timezone', () => {
      expect(() => hourInTz(MIDDAY_UTC, 'Not/A_Timezone')).not.toThrow()
    })

    it('falls back to UTC hour for an unrecognised timezone', () => {
      // 14:00 UTC → UTC hour = 14
      expect(hourInTz(MIDDAY_UTC, 'Not/A_Timezone')).toBe(hourInTz(MIDDAY_UTC, 'UTC'))
      expect(hourInTz(MIDDAY_UTC, 'Beirut')).toBe(hourInTz(MIDDAY_UTC, 'UTC'))
    })
  })

  describe('hhmInTz', () => {
    it('does not throw for an unrecognised timezone', () => {
      expect(() => hhmInTz(MIDDAY_UTC, 'Not/A_Timezone')).not.toThrow()
    })

    it('falls back to UTC time for an unrecognised timezone', () => {
      // 14:00 UTC → '14:00'
      expect(hhmInTz(MIDDAY_UTC, 'Not/A_Timezone')).toBe(hhmInTz(MIDDAY_UTC, 'UTC'))
      expect(hhmInTz(MIDDAY_UTC, 'Beirut')).toBe(hhmInTz(MIDDAY_UTC, 'UTC'))
    })
  })
})
