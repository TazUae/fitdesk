/**
 * Date helpers — pure, UTC-safe string operations on YYYY-MM-DD / HH:mm.
 *
 * Main model's Session.date is YYYY-MM-DD; Session.time is HH:mm (optional).
 * All helpers operate on strings rather than Date objects to avoid timezone drift
 * in server components that run at UTC.
 */

/** Returns the YYYY-MM-DD string for the day after `todayYmd`. */
export function tomorrowYmd(todayYmd: string): string {
  const [y, m, d] = todayYmd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return dt.toISOString().slice(0, 10)
}

/**
 * Returns a short human label: "Today", "Tomorrow", or "Mon, Jun 8".
 * Safe for server rendering — always uses UTC timezone.
 */
export function fmtShortDate(dateYmd: string, todayYmd: string): string {
  if (dateYmd === todayYmd) return 'Today'
  if (dateYmd === tomorrowYmd(todayYmd)) return 'Tomorrow'
  const [y, m, d] = dateYmd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
  })
}

/**
 * Returns a long label for a date: "Saturday, June 8".
 * Used as the dashboard day header.
 */
export function fmtLongDate(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'long',
    month:    'long',
    day:      'numeric',
  })
}

/**
 * Converts HH:mm → "9:00 AM" display form.
 * Returns empty string if no time is provided.
 */
export function fmtTime(hhmm?: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/**
 * Formats a YYYY-MM-DD date as "Jun 8" (month + day only).
 * Used for compact invoice due-date display.
 */
export function fmtMonthDay(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month:    'short',
    day:      'numeric',
  })
}

/**
 * Formats a YYYY-MM-DD date as "Jun 8, 2025" (month + day + year).
 * Used for "Added {date}" on client detail pages.
 */
export function fmtMonthDayYear(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month:    'short',
    day:      'numeric',
    year:     'numeric',
  })
}
