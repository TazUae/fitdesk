'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock } from 'lucide-react'
import { updateBusinessHours } from '@/actions/trainerSettings'
import {
  ALL_WEEKDAYS,
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
  initialEnabled: Weekday[]
  initialStartTime: string | null
  initialEndTime: string | null
}

export function BusinessHoursEditor({ initialEnabled, initialStartTime, initialEndTime }: Props) {
  const router = useRouter()
  const baselineSet = useMemo(() => new Set(initialEnabled), [initialEnabled])
  const baselineStart = initialStartTime ?? DEFAULT_START_TIME
  const baselineEnd = initialEndTime ?? DEFAULT_END_TIME

  const [selected, setSelected] = useState<Set<Weekday>>(baselineSet)
  const [startTime, setStartTime] = useState(baselineStart)
  const [endTime, setEndTime] = useState(baselineEnd)
  const [pending, startTransition] = useTransition()

  function toggle(day: Weekday) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const dirty =
    selected.size !== baselineSet.size ||
    Array.from(baselineSet).some(d => !selected.has(d)) ||
    startTime !== baselineStart ||
    endTime !== baselineEnd

  function save() {
    if (selected.size === 0)         { toast.error('Pick at least one working day.'); return }
    if (!/^\d{2}:\d{2}$/.test(startTime)) { toast.error('Start time must be in HH:MM format.'); return }
    if (!/^\d{2}:\d{2}$/.test(endTime))   { toast.error('End time must be in HH:MM format.'); return }
    if (endTime <= startTime)        { toast.error('End time must be after start time.'); return }

    const enabledDays = ALL_WEEKDAYS.filter(d => selected.has(d))

    startTransition(async () => {
      const result = await updateBusinessHours(enabledDays, startTime, endTime)
      if (result.success) {
        toast.success('Business hours saved')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map(({ id, short }) => {
            const active = selected.has(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                disabled={pending}
                aria-pressed={active}
                className="min-w-[3rem] rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="bh-start" className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Start time
          </label>
          <div
            className="flex items-center rounded-xl border overflow-hidden"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <span className="px-2.5 py-2 border-r" style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}>
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--fd-muted)' }} />
            </span>
            <input
              id="bh-start"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              disabled={pending}
              className="flex-1 bg-transparent px-2.5 py-2 text-sm outline-none"
              style={{ color: 'var(--fd-text)' }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="bh-end" className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            End time
          </label>
          <div
            className="flex items-center rounded-xl border overflow-hidden"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <span className="px-2.5 py-2 border-r" style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}>
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--fd-muted)' }} />
            </span>
            <input
              id="bh-end"
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              disabled={pending}
              className="flex-1 bg-transparent px-2.5 py-2 text-sm outline-none"
              style={{ color: 'var(--fd-text)' }}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="rounded-xl px-4 py-2 text-xs font-bold transition-opacity disabled:opacity-40"
        style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
      >
        {pending ? 'Saving…' : 'Save business hours'}
      </button>

      <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
        One shared range applies to every selected day. Per-day hours are coming later.
      </p>
    </div>
  )
}
