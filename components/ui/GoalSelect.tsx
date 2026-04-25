'use client'

import { ChevronDown } from 'lucide-react'

// ─── Options ──────────────────────────────────────────────────────────────────

export const GOALS = [
  { label: 'Fat Loss',            value: 'fat_loss' },
  { label: 'Muscle Gain',         value: 'muscle_gain' },
  { label: 'Strength',            value: 'strength' },
  { label: 'General Fitness',     value: 'general_fitness' },
  { label: 'Rehabilitation',      value: 'rehabilitation' },
  { label: 'Sports Performance',  value: 'sports_performance' },
  { label: 'Mobility & Flexibility', value: 'mobility' },
] as const

export type GoalValue = (typeof GOALS)[number]['value']

// ─── Component ────────────────────────────────────────────────────────────────

interface GoalSelectProps {
  value?:    string
  onChange:  (value: GoalValue) => void
}

export function GoalSelect({ value, onChange }: GoalSelectProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        Goal
        <span className="ml-0.5" style={{ color: 'var(--fd-red)' }}>*</span>
      </label>

      <div className="relative">
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value as GoalValue)}
          className="w-full appearance-none rounded-xl border px-3 py-3 pr-9 text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'var(--fd-card)',
            borderColor:     'var(--fd-border)',
            color:           value ? 'var(--fd-text)' : 'var(--fd-muted)',
          }}
        >
          <option value="" disabled>Select goal</option>
          {GOALS.map(g => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>

        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--fd-muted)' }}
        />
      </div>
    </div>
  )
}
