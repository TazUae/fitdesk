'use client'

import { Check, ChevronDown } from 'lucide-react'
import { GOALS, type GoalValue } from './GoalSelect'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SUB_GOALS: Partial<Record<GoalValue, { label: string; value: string }[]>> = {
  fat_loss: [
    { label: 'Lose weight gradually', value: 'weight_loss' },
    { label: 'Reduce body fat %',     value: 'fat_percentage' },
    { label: 'Improve conditioning',  value: 'conditioning' },
  ],
  muscle_gain: [
    { label: 'Hypertrophy', value: 'hypertrophy' },
    { label: 'Lean muscle', value: 'lean_mass' },
    { label: 'Bulking',     value: 'bulking' },
  ],
  strength: [
    { label: 'Increase max strength', value: 'max_strength' },
    { label: 'Powerlifting',          value: 'powerlifting' },
  ],
  rehabilitation: [
    { label: 'Back pain recovery', value: 'back_pain' },
    { label: 'Knee recovery',      value: 'knee_recovery' },
    { label: 'Post injury',        value: 'injury_recovery' },
  ],
}

const TARGET_LABEL: Partial<Record<GoalValue, string>> = {
  fat_loss:    'Target weight (kg)',
  muscle_gain: 'Target weight (kg)',
  strength:    'Target lift (kg)',
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Map of goalValue → selected subGoal value, e.g. { fat_loss: 'weight_loss' } */
export type SubGoalsMap = Record<string, string>

export interface GoalMultiSelectProps {
  goals:            string[]
  subGoals:         SubGoalsMap
  targetValue?:     number
  onGoalsChange:    (goals: string[]) => void
  onSubGoalsChange: (subGoals: SubGoalsMap) => void
  onTargetChange?:  (value: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalMultiSelect({
  goals,
  subGoals,
  targetValue,
  onGoalsChange,
  onSubGoalsChange,
  onTargetChange,
}: GoalMultiSelectProps) {
  // Goals that are selected AND have sub-options
  const goalsWithFocus = goals.filter(g => SUB_GOALS[g as GoalValue]?.length)

  // Target: only show when exactly one goal supports it
  const singleGoal  = goals.length === 1 ? (goals[0] as GoalValue) : null
  const targetLabel = singleGoal ? (TARGET_LABEL[singleGoal] ?? null) : null

  function toggleGoal(value: GoalValue) {
    const isRemoving = goals.includes(value)
    const next = isRemoving
      ? goals.filter(g => g !== value)
      : [...goals, value]

    onGoalsChange(next)

    // Drop the sub-goal entry for a deselected goal
    if (isRemoving && subGoals[value]) {
      const updated = { ...subGoals }
      delete updated[value]
      onSubGoalsChange(updated)
    }

    // Reset target when selection changes
    if (targetValue && onTargetChange) onTargetChange(0)
  }

  function handleSubGoalChange(goalValue: string, subGoalValue: string) {
    onSubGoalsChange({ ...subGoals, [goalValue]: subGoalValue })
  }

  return (
    <div className="space-y-4">

      {/* Label */}
      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        Goals
        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
          (select all that apply)
        </span>
      </label>

      {/* 2-column chip grid */}
      <div className="grid grid-cols-2 gap-2">
        {GOALS.map(({ label, value }) => {
          const selected = goals.includes(value)
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggleGoal(value)}
              className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all active:scale-[0.97]"
              style={selected ? {
                backgroundColor: 'rgba(78,203,160,0.12)',
                borderColor:     'var(--fd-green)',
                color:           'var(--fd-green)',
              } : {
                backgroundColor: 'var(--fd-surface)',
                borderColor:     'var(--fd-border)',
                color:           'var(--fd-muted)',
              }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors"
                style={selected ? {
                  backgroundColor: 'var(--fd-green)',
                } : {
                  backgroundColor: 'transparent',
                  border:          '1.5px solid var(--fd-border)',
                }}
              >
                {selected && <Check className="h-2.5 w-2.5" style={{ color: 'var(--fd-bg)' }} />}
              </span>
              <span className="truncate text-left leading-tight">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Focus dropdowns — one per selected goal that has sub-options */}
      {goalsWithFocus.length > 0 && (
        <div className="space-y-3">
          {goalsWithFocus.map(goalValue => {
            const goalLabel  = GOALS.find(g => g.value === goalValue)?.label ?? goalValue
            const subOptions = SUB_GOALS[goalValue as GoalValue] ?? []
            const current    = subGoals[goalValue] ?? ''

            return (
              <div key={goalValue} className="space-y-1.5">
                <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                  {goalLabel}
                  <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                    — focus
                  </span>
                </label>
                <div className="relative">
                  <select
                    value={current}
                    onChange={e => handleSubGoalChange(goalValue, e.target.value)}
                    className="w-full appearance-none rounded-xl border px-3 py-3 pr-9 text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--fd-card)',
                      borderColor:     'var(--fd-border)',
                      color:           current ? 'var(--fd-text)' : 'var(--fd-muted)',
                    }}
                  >
                    <option value="">Select focus</option>
                    {subOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: 'var(--fd-muted)' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Target — only when exactly one goal supports it */}
      {targetLabel && onTargetChange && (
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {targetLabel}
            <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>(optional)</span>
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={targetValue || ''}
            onChange={e => onTargetChange(e.target.value ? parseFloat(e.target.value) : 0)}
            placeholder="e.g. 75"
            className="input-base"
            style={{ colorScheme: 'dark' }}
          />
        </div>
      )}

    </div>
  )
}
