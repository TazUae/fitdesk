'use client'

import { clientPastel } from '@/lib/ui/clientColor'
import { scheduleTokens } from '@/lib/ui/scheduleDesignTokens'

/**
 * Custom Schedule-X event renderer (`customComponents.timeGridEvent`).
 *
 * The `calendarEvent` prop is loosely typed because Schedule-X's React
 * generic uses `Record<string, unknown>` for custom events; we narrow what
 * we use at point-of-read.
 */

interface SessionCardProps {
  calendarEvent?: Record<string, unknown>
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTimeRange(
  s: { hour?: number; minute?: number } | null,
  e: { hour?: number; minute?: number } | null,
): string | null {
  if (s?.hour == null || e?.hour == null) return null
  const sMin = s.hour * 60 + (s.minute ?? 0)
  const eMin = e.hour * 60 + (e.minute ?? 0)
  return `${pad2(Math.floor(sMin / 60))}:${pad2(sMin % 60)}–${pad2(Math.floor(eMin / 60))}:${pad2(eMin % 60)}`
}

/** Status-driven palette overrides. Falls back to the per-client hash for live sessions. */
function resolvePalette(status: string, clientSeed: string): { fill: string; text: string; leftBorder?: string; outline?: boolean } {
  switch (status) {
    case 'completed':
      return { fill: scheduleTokens.pastels.gray.fill, text: scheduleTokens.pastels.gray.text }
    case 'cancelled':
      return { fill: scheduleTokens.pastels.gray.fill, text: scheduleTokens.pastels.gray.text }
    case 'no_show':
      return { fill: scheduleTokens.pastels.yellow.fill, text: scheduleTokens.pastels.yellow.text, outline: true }
    case 'skipped':
      return { fill: scheduleTokens.pastels.gray.fill, text: scheduleTokens.pastels.gray.text }
    case 'confirmed': {
      const p = clientPastel(clientSeed)
      return { ...p, leftBorder: scheduleTokens.statusSuccess }
    }
    default: // 'scheduled' or unknown
      return clientPastel(clientSeed)
  }
}

export function SessionCard({ calendarEvent }: SessionCardProps) {
  if (!calendarEvent) return null

  const status = typeof calendarEvent.calendarId === 'string' ? calendarEvent.calendarId : 'scheduled'
  const title  = typeof calendarEvent.title === 'string' ? calendarEvent.title : ''
  const clientSeed = title || (typeof calendarEvent.id === 'string' ? calendarEvent.id : '')
  const palette = resolvePalette(status, clientSeed)

  const s = calendarEvent.start as { hour?: number; minute?: number } | null
  const e = calendarEvent.end   as { hour?: number; minute?: number } | null
  const timeRange = formatTimeRange(s, e)

  const sMin = s?.hour != null ? s.hour * 60 + (s.minute ?? 0) : null
  const eMin = e?.hour != null ? e.hour * 60 + (e.minute ?? 0) : null
  const heightMin = sMin != null && eMin != null ? eMin - sMin : 60
  const isCompact = heightMin < 40
  const isCancelled = status === 'cancelled'

  return (
    <div
      className="flex h-full flex-col overflow-hidden px-2 py-1"
      style={{
        backgroundColor: palette.fill,
        color: palette.text,
        borderRadius: scheduleTokens.radiusSm,
        border: palette.outline ? `1px solid ${palette.text}` : 'none',
        borderLeft: palette.leftBorder ? `2px solid ${palette.leftBorder}` : palette.outline ? `1px solid ${palette.text}` : 'none',
      }}
    >
      <div className="flex min-h-0 items-center gap-1.5">
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
          style={{
            backgroundColor: 'rgba(255,255,255,0.55)',
            color: palette.text,
          }}
          aria-hidden="true"
        >
          {initials(title)}
        </span>
        <p
          className="truncate text-[12px] font-semibold leading-tight"
          style={{
            color: palette.text,
            textDecoration: isCancelled ? 'line-through' : 'none',
          }}
        >
          {title}
        </p>
      </div>
      {!isCompact && timeRange && (
        <p
          className="mt-0.5 text-[10px] leading-none"
          style={{
            color: palette.text,
            opacity: 0.8,
            textDecoration: isCancelled ? 'line-through' : 'none',
          }}
        >
          {timeRange}
        </p>
      )}
    </div>
  )
}
