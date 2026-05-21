'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { confirmAvailability } from '@/actions/confirmAvailability'
import {
  ALL_WEEKDAYS,
  DEFAULT_ENABLED_DAYS,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  type Weekday,
} from '@/lib/availability'

const DAY_LABELS: { id: Weekday; short: string }[] = [
  { id: 'mon', short: 'Mon' },
  { id: 'tue', short: 'Tue' },
  { id: 'wed', short: 'Wed' },
  { id: 'thu', short: 'Thu' },
  { id: 'fri', short: 'Fri' },
  { id: 'sat', short: 'Sat' },
  { id: 'sun', short: 'Sun' },
]

interface Props {
  onDone: () => void
}

export function AvailabilityStep({ onDone }: Props) {
  const [selected, setSelected] = useState<Set<Weekday>>(new Set(DEFAULT_ENABLED_DAYS))
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME)
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function toggle(day: Weekday) {
    setError(null)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  function clientValidate(): string | null {
    if (selected.size === 0)         return 'Pick at least one working day.'
    if (!/^\d{2}:\d{2}$/.test(startTime)) return 'Start time must be in HH:MM format.'
    if (!/^\d{2}:\d{2}$/.test(endTime))   return 'End time must be in HH:MM format.'
    if (endTime <= startTime)        return 'End time must be after start time.'
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return

    const issue = clientValidate()
    if (issue) { setError(issue); return }

    setError(null)
    startTransition(async () => {
      // ALL_WEEKDAYS ordering keeps the payload deterministic.
      const enabledDays = ALL_WEEKDAYS.filter(d => selected.has(d))
      const result = await confirmAvailability({ enabledDays, startTime, endTime })
      if (!result.success) {
        setError(result.error)
        return
      }
      setDone(true)
      // Brief moment of confirmation before continuing to the dashboard.
      setTimeout(onDone, 900)
    })
  }

  return (
    <div className="space-y-6">
      <StepHeader
        title="When do you usually train clients?"
        subtitle="Set your working days and hours so we can show the right slots on your schedule."
      />

      <form onSubmit={handleSubmit}>
        <div
          className="rounded-2xl border p-5 space-y-5"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          {error && (
            <p
              role="alert"
              className="text-sm rounded-xl px-3 py-2"
              style={{
                color: 'var(--fd-red)',
                backgroundColor: 'rgba(232,92,106,0.08)',
                border: '1px solid rgba(232,92,106,0.2)',
              }}
            >
              {error}
            </p>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              Working days
            </label>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map(({ id, short }) => {
                const active = selected.has(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    disabled={pending || done}
                    aria-pressed={active}
                    className="min-w-[3rem] rounded-full px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: active ? 'var(--fd-accent)' : 'var(--fd-card)',
                      color:           active ? 'var(--fd-bg)'     : 'var(--fd-muted)',
                      border: active ? 'none' : '1px solid var(--fd-border)',
                    }}
                  >
                    {short}
                  </button>
                )
              })}
            </div>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Tap a day to toggle it. You can change this later in Settings.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="availability-start" className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                Start time
              </label>
              <div
                className="flex items-center rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
              >
                <span className="px-3 py-3 border-r" style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}>
                  <Clock className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
                </span>
                <input
                  id="availability-start"
                  type="time"
                  value={startTime}
                  onChange={e => { setStartTime(e.target.value); setError(null) }}
                  disabled={pending || done}
                  className="flex-1 bg-transparent px-3 py-3 text-sm outline-none"
                  style={{ color: 'var(--fd-text)' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="availability-end" className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                End time
              </label>
              <div
                className="flex items-center rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
              >
                <span className="px-3 py-3 border-r" style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}>
                  <Clock className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
                </span>
                <input
                  id="availability-end"
                  type="time"
                  value={endTime}
                  onChange={e => { setEndTime(e.target.value); setError(null) }}
                  disabled={pending || done}
                  className="flex-1 bg-transparent px-3 py-3 text-sm outline-none"
                  style={{ color: 'var(--fd-text)' }}
                />
              </div>
            </div>
          </div>

          {done ? (
            <div
              className="rounded-xl border p-3 flex items-center gap-2"
              style={{ backgroundColor: 'rgba(78,203,160,0.08)', borderColor: 'rgba(78,203,160,0.3)' }}
            >
              <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-green)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--fd-green)' }}>
                Availability saved — opening your dashboard…
              </p>
            </div>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
            >
              {pending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <>Confirm availability →</>
              }
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--fd-accent)' }}>
        Final step
      </p>
      <h1 className="text-2xl font-bold" style={{ color: 'var(--fd-text)' }}>{title}</h1>
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>{subtitle}</p>
    </div>
  )
}
