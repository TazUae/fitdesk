'use client'

import { Clock } from 'lucide-react'
import type { RepeatMode, TrainerConfig } from '@/types/scheduling'

const DURATION_OPTIONS = [30, 45, 60, 90] as const
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

interface BookingDateTimeStepProps {
  date:            string                 // 'YYYY-MM-DD'
  startTime:       string                 // 'HH:mm'
  durationMinutes: number
  /** Exposed here so single-tap users can opt into a weekly recurrence
   *  without first having to multi-tap the calendar. */
  repeatMode:      RepeatMode
  config:          TrainerConfig
  onChange: (next: {
    date?:            string
    startTime?:       string
    durationMinutes?: number
    repeatMode?:      RepeatMode
  }) => void
}

function dateWeekday(dateIso: string): typeof WEEKDAY_KEYS[number] | null {
  const [y, m, d] = dateIso.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, d)
  return WEEKDAY_KEYS[dt.getDay()]
}

/**
 * Step 2 — Date & Time.
 *
 * Native date + time inputs (best mobile UX on iOS/Android), duration chips,
 * and a working-hours indicator that uses the (Phase 5.0) collapsed global
 * window. Phase 5.1F will expand this to per-day windows.
 */
export function BookingDateTimeStep({
  date,
  startTime,
  durationMinutes,
  repeatMode,
  config,
  onChange,
}: BookingDateTimeStepProps) {
  const weekday = dateWeekday(date)
  const isWorkingDay = weekday ? config.workingDays.includes(weekday) : true

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          When?
        </h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--fd-muted)' }}>
          Pick a date, start time, and session length.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Date</span>
          <input
            type="date"
            value={date}
            onChange={e => onChange({ date: e.target.value })}
            className="input-base"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Start time</span>
          <input
            type="time"
            value={startTime}
            step={300}
            onChange={e => onChange({ startTime: e.target.value })}
            className="input-base"
          />
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Duration</p>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map(min => {
            const active = durationMinutes === min
            return (
              <button
                key={min}
                type="button"
                onClick={() => onChange({ durationMinutes: min })}
                className="flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--fd-blue-subtle)' : 'var(--fd-surface)',
                  borderColor:     active ? 'var(--fd-blue)' : 'var(--fd-border)',
                  color:           active ? 'var(--fd-blue)' : 'var(--fd-text)',
                }}
                aria-pressed={active}
              >
                {min} min
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Repeat</p>
        <div className="flex flex-wrap gap-2">
          {(['one_off', 'weekly'] as const).map(mode => {
            const active = repeatMode === mode
            const label = mode === 'one_off' ? 'One-time' : 'Weekly'
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ repeatMode: mode })}
                className="flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--fd-blue-subtle)' : 'var(--fd-surface)',
                  borderColor:     active ? 'var(--fd-blue)' : 'var(--fd-border)',
                  color:           active ? 'var(--fd-blue)' : 'var(--fd-text)',
                }}
                aria-pressed={active}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="flex items-center gap-2 rounded-lg p-2 text-xs"
        style={{
          backgroundColor: isWorkingDay
            ? 'color-mix(in srgb, var(--fd-green) 7%, transparent)'
            : 'color-mix(in srgb, var(--fd-warning) 8%, transparent)',
          color: isWorkingDay ? 'var(--fd-green)' : 'var(--fd-warning)',
          border: `1px solid ${isWorkingDay
            ? 'color-mix(in srgb, var(--fd-green) 25%, transparent)'
            : 'color-mix(in srgb, var(--fd-warning) 30%, transparent)'}`,
        }}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>
          {isWorkingDay
            ? `Inside working hours (${config.startTime}–${config.endTime}).`
            : `Heads up — this day is outside your working schedule.`}
        </span>
      </div>
    </section>
  )
}
