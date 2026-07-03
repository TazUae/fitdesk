/**
 * Pure helpers for mapping FD Sessions (new scheduling model) to the
 * legacy Session type consumed by dashboard derive functions.
 *
 * No server-only, no ERP calls — safe to import and test anywhere.
 */

import type { FDSession, FDSessionStatus } from '@/types/scheduling'
import type { Session, SessionStatus } from '@/types'

// ─── Date/time helpers ────────────────────────────────────────────────────────

/**
 * Format a UTC Date as YYYY-MM-DD in the given IANA timezone.
 * Uses formatToParts so the output is locale-independent.
 */
export function localDateString(utcDate: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).formatToParts(utcDate)
  const y = parts.find(p => p.type === 'year')?.value  ?? '0000'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  const d = parts.find(p => p.type === 'day')?.value   ?? '01'
  return `${y}-${m}-${d}`
}

/**
 * Format a UTC Date as HH:mm (24-hour) in the given IANA timezone.
 * Normalises the "24" value some V8 Intl builds emit at midnight → "00".
 */
export function localTimeString(utcDate: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).formatToParts(utcDate)
  const rawHour = parts.find(p => p.type === 'hour')?.value   ?? '00'
  const min     = parts.find(p => p.type === 'minute')?.value ?? '00'
  const hour    = rawHour === '24' ? '00' : rawHour.padStart(2, '0')
  return `${hour}:${min.padStart(2, '0')}`
}

/**
 * Today's date as YYYY-MM-DD in the given IANA timezone.
 * Falls back to UTC on an invalid timezone string.
 */
export function todayInTimezone(timezone: string): string {
  try {
    return localDateString(new Date(), timezone)
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * The current hour (0–23) in the given IANA timezone.
 * Used to drive the dashboard greeting. Falls back to UTC hour on error.
 */
export function localHourInTimezone(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      hour:     '2-digit',
      hour12:   false,
    }).formatToParts(now)
    const raw = parts.find(p => p.type === 'hour')?.value ?? '12'
    return parseInt(raw, 10) % 24   // normalise "24" (midnight) → 0
  } catch {
    return now.getUTCHours()
  }
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapFDStatus(status: FDSessionStatus): SessionStatus {
  switch (status) {
    case 'scheduled':  return 'scheduled'
    case 'confirmed':  return 'scheduled'  // confirmed = client acknowledged; still upcoming
    case 'completed':  return 'completed'
    case 'no_show':    return 'missed'
    case 'cancelled':  return 'cancelled'
    case 'skipped':    return 'cancelled'
    default:           return 'scheduled'
  }
}

// ─── Session mapper ───────────────────────────────────────────────────────────

/**
 * Map an FDSession to the legacy Session type used by dashboard derive
 * functions and dashboard widgets.
 *
 * @param fds      The FD Session to map.
 * @param timezone IANA timezone for localising startAt → date + time.
 *                 Pass the trainer's configured timezone so session.date
 *                 is always consistent with the dashboard `today` value.
 */
export function fdSessionToSession(fds: FDSession, timezone: string): Session {
  return {
    id:              fds.id,
    clientId:        fds.clientId,
    clientName:      fds.clientName,
    trainerId:       fds.trainerId,
    date:            localDateString(fds.startAt, timezone),
    time:            localTimeString(fds.startAt, timezone),
    durationMinutes: fds.durationMinutes,
    status:          mapFDStatus(fds.status),
    sessionFee:      fds.rate > 0 ? fds.rate : undefined,
    notes:           fds.notes ?? undefined,
    createdAt:       fds.startAt.toISOString().slice(0, 10),
  }
}
