'use client'

import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { PatternSlot } from '@/types/scheduling'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface PerDayTimeEditorProps {
  patternSlots:    PatternSlot[]
  durationMinutes: number
  onChange:        (next: PatternSlot[]) => void
}

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Add `mins` minutes to an HH:mm clock string. */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = String(Math.floor((total + 24 * 60) / 60) % 24).padStart(2, '0')
  const mm = String(((total % 60) + 60) % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Per-weekday inline time editor for the recurrence pattern.
 *
 * Each row is one PatternSlot. Tapping the time control opens a native
 * time picker (best mobile UX). Trash icon removes the row; "Add day"
 * appends a new row defaulting to the first unused weekday.
 */
export function PerDayTimeEditor({ patternSlots, durationMinutes, onChange }: PerDayTimeEditorProps) {
  function updateSlot(idx: number, patch: Partial<PatternSlot>) {
    const next = patternSlots.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    onChange(next)
  }

  function removeSlot(idx: number) {
    onChange(patternSlots.filter((_, i) => i !== idx))
  }

  function addSlot() {
    const used = new Set(patternSlots.map(s => s.weekday))
    const next = ([1, 2, 3, 4, 5, 6, 0] as const).find(d => !used.has(d)) ?? 1
    const baseTime = patternSlots[0]?.localTime ?? '09:00'
    onChange([...patternSlots, { weekday: next, localTime: baseTime }])
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {patternSlots.map((slot, idx) => {
          const endTime = addMinutes(slot.localTime, durationMinutes)
          return (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-lg border p-2"
              style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
            >
              <select
                value={slot.weekday}
                onChange={e => updateSlot(idx, { weekday: Number(e.target.value) as PatternSlot['weekday'] })}
                className="h-9 rounded-md border px-2 text-sm"
                style={{
                  borderColor: 'var(--fd-border)',
                  backgroundColor: 'var(--fd-surface)',
                  color: 'var(--fd-text)',
                }}
                aria-label="Weekday"
              >
                {WEEKDAY_LABELS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>

              <ChevronRight className="h-3 w-3 shrink-0" style={{ color: 'var(--fd-muted)' }} aria-hidden="true" />

              <input
                type="time"
                value={slot.localTime}
                step={300}
                onChange={e => updateSlot(idx, { localTime: e.target.value })}
                className="h-9 flex-1 rounded-md border px-2 text-sm"
                style={{
                  borderColor: 'var(--fd-border)',
                  backgroundColor: 'var(--fd-surface)',
                  color: 'var(--fd-text)',
                }}
                aria-label={`${WEEKDAY_LABELS[slot.weekday]} time`}
              />

              <span className="hidden text-xs sm:inline" style={{ color: 'var(--fd-muted)' }}>
                → {formatClock(endTime)}
              </span>

              <button
                type="button"
                onClick={() => removeSlot(idx)}
                disabled={patternSlots.length === 1}
                aria-label={`Remove ${WEEKDAY_LABELS[slot.weekday]} slot`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)] disabled:opacity-30"
                style={{ color: 'var(--fd-muted)' }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          )
        })}
      </ul>
      {patternSlots.length < 5 && (
        <button
          type="button"
          onClick={addSlot}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--fd-blue-subtle)]"
          style={{ color: 'var(--fd-blue)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add a day
        </button>
      )}
    </div>
  )
}
