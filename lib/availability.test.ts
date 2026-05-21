import { describe, expect, it } from 'vitest'
import {
  ALL_WEEKDAYS,
  buildWorkingDaysRows,
  DEFAULT_ENABLED_DAYS,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  isValidHHmm,
  isWeekday,
  validateAvailabilityInput,
  type Weekday,
} from './availability'

describe('availability defaults', () => {
  it('defaults to Mon–Fri', () => {
    expect([...DEFAULT_ENABLED_DAYS].sort()).toEqual(['fri', 'mon', 'thu', 'tue', 'wed'])
  })

  it('defaults to 09:00–20:00', () => {
    expect(DEFAULT_START_TIME).toBe('09:00')
    expect(DEFAULT_END_TIME).toBe('20:00')
  })
})

describe('isWeekday / isValidHHmm', () => {
  it('accepts all canonical weekday codes', () => {
    for (const d of ALL_WEEKDAYS) expect(isWeekday(d)).toBe(true)
  })
  it('rejects junk weekday values', () => {
    expect(isWeekday('Monday')).toBe(false)
    expect(isWeekday('')).toBe(false)
    expect(isWeekday(null)).toBe(false)
  })
  it('accepts HH:MM only', () => {
    expect(isValidHHmm('09:00')).toBe(true)
    expect(isValidHHmm('23:59')).toBe(true)
    expect(isValidHHmm('24:00')).toBe(false)
    expect(isValidHHmm('9:00')).toBe(false)
    expect(isValidHHmm('09:00:00')).toBe(false)
  })
})

describe('validateAvailabilityInput', () => {
  it('accepts a normal Mon–Fri 09:00–20:00 payload', () => {
    const res = validateAvailabilityInput({
      enabledDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      startTime:   '09:00',
      endTime:     '20:00',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.days).toHaveLength(5)
  })

  it('rejects empty day selection', () => {
    const res = validateAvailabilityInput({ enabledDays: [], startTime: '09:00', endTime: '20:00' })
    expect(res).toEqual({ ok: false, error: 'Pick at least one working day.' })
  })

  it('strips bogus weekday values silently', () => {
    const res = validateAvailabilityInput({
      enabledDays: ['mon', 'Monday' as unknown as Weekday, 'fri'],
      startTime: '09:00',
      endTime: '20:00',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect([...res.days].sort()).toEqual(['fri', 'mon'])
  })

  it('rejects malformed start/end time', () => {
    expect(
      validateAvailabilityInput({ enabledDays: ['mon'], startTime: '9:00', endTime: '20:00' }),
    ).toEqual({ ok: false, error: 'Start time must be in HH:MM format.' })

    expect(
      validateAvailabilityInput({ enabledDays: ['mon'], startTime: '09:00', endTime: 'noon' }),
    ).toEqual({ ok: false, error: 'End time must be in HH:MM format.' })
  })

  it('rejects end <= start', () => {
    expect(
      validateAvailabilityInput({ enabledDays: ['mon'], startTime: '20:00', endTime: '09:00' }),
    ).toEqual({ ok: false, error: 'End time must be after start time.' })

    expect(
      validateAvailabilityInput({ enabledDays: ['mon'], startTime: '09:00', endTime: '09:00' }),
    ).toEqual({ ok: false, error: 'End time must be after start time.' })
  })
})

describe('buildWorkingDaysRows', () => {
  it('always returns 7 rows in canonical order', () => {
    const rows = buildWorkingDaysRows(['mon'], '09:00', '20:00')
    expect(rows).toHaveLength(7)
    expect(rows.map(r => r.weekday)).toEqual([...ALL_WEEKDAYS])
  })

  it('flags only the requested days as enabled=1', () => {
    const rows = buildWorkingDaysRows(['mon', 'wed', 'fri'], '09:00', '20:00')
    const enabled = rows.filter(r => r.enabled === 1).map(r => r.weekday)
    expect(enabled).toEqual(['mon', 'wed', 'fri'])
    const disabled = rows.filter(r => r.enabled === 0).map(r => r.weekday)
    expect(disabled).toEqual(['sun', 'tue', 'thu', 'sat'])
  })

  it('writes the shared HH:MM:00 range to every row (including disabled ones)', () => {
    const rows = buildWorkingDaysRows(['mon'], '07:30', '21:45')
    for (const row of rows) {
      expect(row.start_time).toBe('07:30:00')
      expect(row.end_time).toBe('21:45:00')
    }
  })
})
