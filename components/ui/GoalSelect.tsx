'use client'

import { ChevronDown } from 'lucide-react'
import { normalizeGoalId } from '@/lib/goals/taxonomy'
import { formatGoalLabel } from '@/lib/goals/format'

// ─── Options ──────────────────────────────────────────────────────────────────
//
// VALUES are the 7 legacy underscore IDs written to ERP custom_fitness_goals.
// LABELS are derived from the canonical taxonomy via normalizeGoalId + formatGoalLabel.
// Backward compat: LEGACY_GOAL_ALIASES in taxonomy.ts maps these to canonical IDs.

const LEGACY_GOAL_IDS = [
  'fat_loss',
  'muscle_gain',
  'strength',
  'general_fitness',
  'rehabilitation',
  'sports_performance',
  'mobility',
] as const

export type GoalValue = typeof LEGACY_GOAL_IDS[number]

export const GOALS: readonly { label: string; value: GoalValue }[] =
  LEGACY_GOAL_IDS.map(legacyId => {
    const canonical = normalizeGoalId(legacyId)
    return {
      value: legacyId,
      label: canonical ? formatGoalLabel(canonical) : legacyId,
    }
  })

// ─── Component ────────────────────────────────────────────────────────────────

interface GoalSelectProps {
  value?:   string
  onChange: (value: GoalValue) => void
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
