'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function weekStartMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const dow = x.getDay()
  const diff = (dow + 6) % 7
  x.setDate(x.getDate() - diff)
  return x
}

function weekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const y0 = weekStart.getFullYear()
  const y1 = end.getFullYear()
  const left = weekStart.toLocaleDateString('en-US', { ...opts, year: y0 !== y1 ? 'numeric' : undefined })
  const right = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${left} – ${right}`
}

function formatSessionLine(start: Date): string {
  return `${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

export interface PreviewRow {
  start: Date
}

export interface SessionPreviewByWeekProps {
  sessions:       PreviewRow[]
  /** start.getTime() for rows that conflict */
  conflictTimes:  Set<number>
  /** Tailwind max-height class, e.g. max-h-52 */
  maxHeightClass?: string
  className?:      string
}

/**
 * Full scrollable preview of generated booking sessions, grouped by calendar week (Mon–Sun).
 */
export function SessionPreviewByWeek({
  sessions,
  conflictTimes,
  maxHeightClass = 'max-h-52',
  className,
}: SessionPreviewByWeekProps) {
  const groups = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => a.start.getTime() - b.start.getTime())
    const map = new Map<number, PreviewRow[]>()
    for (const s of sorted) {
      const wk = weekStartMonday(s.start)
      const key = wk.getTime()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [sessions])

  if (sessions.length === 0) {
    return (
      <div
        className={cn('rounded-xl border p-4 text-center text-sm', className)}
        style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
      >
        No sessions in this plan yet.
      </div>
    )
  }

  return (
    <div
      className={cn('space-y-3 overflow-y-auto rounded-xl border p-3', maxHeightClass, className)}
      style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
    >
      {groups.map(([weekKey, rows]) => {
        const weekStart = new Date(weekKey)
        return (
          <div key={weekKey}>
            <p
              className="sticky top-0 z-[1] mb-2 border-b pb-1.5 text-[11px] font-bold uppercase tracking-wide"
              style={{
                borderColor: 'var(--fd-border)',
                color: 'var(--fd-accent)',
                backgroundColor: 'var(--fd-card)',
              }}
            >
              Week · {weekRangeLabel(weekStart)}
            </p>
            <ul className="space-y-1.5 pl-0.5">
              {rows.map(s => {
                const bad = conflictTimes.has(s.start.getTime())
                return (
                  <li
                    key={s.start.getTime()}
                    className="flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs"
                    style={{
                      borderColor: bad ? 'rgba(232,92,106,0.35)' : 'rgba(255,255,255,0.06)',
                      backgroundColor: bad ? 'rgba(232,92,106,0.06)' : 'rgba(0,0,0,0.12)',
                      color: bad ? 'var(--fd-red)' : 'var(--fd-text)',
                    }}
                  >
                    <span className="min-w-0 flex-1 leading-snug">{formatSessionLine(s.start)}</span>
                    {bad && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: 'rgba(232,92,106,0.15)' }}>
                        Blocked
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
