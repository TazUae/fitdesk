/**
 * IANA-timezone date helpers.
 *
 * Pure functions — no I/O, no external dependencies.
 * Uses Intl.DateTimeFormat with the en-CA locale (ISO YYYY-MM-DD part order)
 * and formatToParts for reliable field extraction.
 *
 * Safe to import in both server components and client components.
 */

/**
 * Return the local date as 'YYYY-MM-DD' in the given IANA timezone.
 *
 * Example: ymdInTz(new Date('2026-05-26T23:00:00Z'), 'Asia/Riyadh') → '2026-05-27'
 */
export function ymdInTz(d: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  })
  const parts = dtf.formatToParts(d)
  const get   = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Return the local hour (0–23) in the given IANA timezone.
 *
 * Some Intl implementations return '24' at midnight instead of '0' — the
 * `% 24` guard normalises this to 0.
 *
 * Example: hourInTz(new Date('2026-05-27T00:30:00Z'), 'Asia/Riyadh') → 3
 */
export function hourInTz(d: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour:     'numeric',
    hour12:   false,
  })
  const parts = dtf.formatToParts(d)
  const h     = parts.find(p => p.type === 'hour')?.value ?? '0'
  return Number(h) % 24
}

/**
 * Return the local time as 'HH:mm' in the given IANA timezone.
 *
 * The '24:00' midnight edge case (some Intl impls) is normalised to '00:mm'.
 *
 * Example: hhmInTz(new Date('2026-05-27T09:30:00Z'), 'Asia/Riyadh') → '12:30'
 */
export function hhmInTz(d: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  })
  const parts = dtf.formatToParts(d)
  const get   = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${get('hour').replace('24', '00')}:${get('minute')}`
}
