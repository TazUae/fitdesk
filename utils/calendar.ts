/** ICS (iCalendar RFC 5545) helpers — client-side only, no Node APIs required. */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id:           string
  title:        string
  description?: string
  start:        Date
  end:          Date
  location?:    string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Format a Date to ICS UTC timestamp: YYYYMMDDTHHmmssZ */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Render a single VEVENT block (no outer VCALENDAR wrapper). */
function eventBlock(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@fitdesk`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${event.title}`,
    ...(event.description ? [`DESCRIPTION:${event.description}`] : []),
    ...(event.location    ? [`LOCATION:${event.location}`]       : []),
    'END:VEVENT',
  ]
  return lines.join('\r\n')
}

/** Wrap one or more VEVENT blocks in a VCALENDAR envelope. */
function wrapCalendar(blocks: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FitDesk//EN',
    ...blocks,
    'END:VCALENDAR',
  ].join('\r\n')
}

// ─── ICS generation ───────────────────────────────────────────────────────────

/**
 * Generate a valid RFC 5545 VCALENDAR string for a single event.
 * Uses CRLF line endings as required by the spec.
 */
export function generateICS(event: CalendarEvent): string {
  return wrapCalendar([eventBlock(event)])
}

/**
 * Generate a single ICS file containing multiple VEVENTs.
 * Used for recurring / multi-slot bookings so the user gets one file
 * that adds all sessions to their calendar at once.
 */
export function generateMultiICS(events: CalendarEvent[]): string {
  if (events.length === 0) return ''
  return wrapCalendar(events.map(eventBlock))
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Trigger a browser download of an .ics file via a temporary Blob URL.
 *
 * Works on: Chrome (desktop + Android), Firefox, Edge, desktop Safari.
 * Does NOT reliably trigger a download on iOS Safari — use `icsDataUri`
 * to render a fallback <a> link the user can tap manually.
 *
 * Must be called from a client component.
 */
export function downloadICS(event: CalendarEvent, filename = 'session.ics'): void {
  _triggerDownload(generateICS(event), filename)
}

/**
 * Download an ICS file containing multiple events.
 * Same device limitations as `downloadICS` — pair with `multiIcsDataUri`
 * for an iOS-safe fallback link.
 */
export function downloadMultiICS(events: CalendarEvent[], filename = 'sessions.ics'): void {
  if (events.length === 0) return
  _triggerDownload(generateMultiICS(events), filename)
}

function _triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Fallback data URIs (iOS Safari safe) ────────────────────────────────────

/**
 * Return a `data:text/calendar` URI for a single event.
 *
 * Use as the `href` of a visible <a> tag — the user taps it manually.
 * This is the reliable cross-device fallback; iOS Safari honours it
 * even though it ignores programmatic `.click()` on a download link.
 *
 * @example
 *   <a href={icsDataUri(event)} download="session.ics">Save to Calendar</a>
 */
export function icsDataUri(event: CalendarEvent): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(generateICS(event))}`
}

/**
 * Return a `data:text/calendar` URI for multiple events in one file.
 *
 * @example
 *   <a href={multiIcsDataUri(events)} download="sessions.ics">Save all to Calendar</a>
 */
export function multiIcsDataUri(events: CalendarEvent[]): string {
  if (events.length === 0) return '#'
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(generateMultiICS(events))}`
}

// ─── Device detection ────────────────────────────────────────────────────────

/**
 * Returns true when running on iOS.
 * Used to proactively show the fallback download link instead of (or
 * alongside) the auto-download button, since iOS Safari silently
 * ignores programmatic anchor clicks for blob: URLs.
 *
 * Safe to call server-side — returns false in non-browser environments.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

// ─── Google Calendar ──────────────────────────────────────────────────────────

/**
 * Build a Google Calendar "add event" URL for a single event.
 * Open in a new tab to pre-fill the event form — works on all devices.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text:   event.title,
    dates:  `${icsDate(event.start)}/${icsDate(event.end)}`,
  })
  if (event.description) params.set('details',  event.description)
  if (event.location)    params.set('location', event.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
