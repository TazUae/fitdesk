'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { updateWorkingDays } from '@/actions/trainerSettings'

const ALL_DAYS = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
] as const

type Weekday = typeof ALL_DAYS[number]['id']

interface Props {
  /** Day names already enabled per the current Trainer Settings doc. */
  initialEnabled: Weekday[]
}

export function WorkingDaysEditor({ initialEnabled }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<Weekday>>(new Set(initialEnabled))
  const [pending, startTransition] = useTransition()

  function toggle(day: Weekday) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  function save() {
    startTransition(async () => {
      const result = await updateWorkingDays(Array.from(selected))
      if (result.success) {
        toast.success('Working days saved')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const dirty =
    selected.size !== initialEnabled.length ||
    initialEnabled.some(d => !selected.has(d))

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {ALL_DAYS.map(({ id, label }) => {
          const active = selected.has(id)
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              disabled={pending}
              className="rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: active ? 'var(--fd-accent)' : 'var(--fd-card)',
                color:           active ? 'var(--fd-bg)'     : 'var(--fd-muted)',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="rounded-xl px-4 py-2 text-xs font-bold transition-opacity disabled:opacity-40"
        style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
      >
        {pending ? 'Saving…' : 'Save working days'}
      </button>
    </div>
  )
}
