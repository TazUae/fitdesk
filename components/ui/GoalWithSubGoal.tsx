'use client'

import { ChevronDown } from 'lucide-react'
import { GOALS, type GoalValue } from './GoalSelect'

// ─── Sub-goal data ────────────────────────────────────────────────────────────

const SUB_GOALS: Partial<Record<GoalValue, { label: string; value: string }[]>> = {
  fat_loss: [
    { label: 'Lose weight gradually', value: 'weight_loss' },
    { label: 'Reduce body fat %',     value: 'fat_percentage' },
    { label: 'Improve conditioning',  value: 'conditioning' },
  ],
  muscle_gain: [
    { label: 'Hypertrophy',   value: 'hypertrophy' },
    { label: 'Lean muscle',   value: 'lean_mass' },
    { label: 'Bulking',       value: 'bulking' },
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

// ─── Shared select shell ──────────────────────────────────────────────────────

function SelectField({
  label,
  required,
  value,
  placeholder,
  options,
  onChange,
}: {
  label:       string
  required?:   boolean
  value:       string
  placeholder: string
  options:     { label: string; value: string }[]
  onChange:    (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: 'var(--fd-red)' }}>*</span>}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border px-3 py-3 pr-9 text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'var(--fd-card)',
            borderColor:     'var(--fd-border)',
            color:           value ? 'var(--fd-text)' : 'var(--fd-muted)',
          }}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map(o => (
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
}

// ─── Target field config ─────────────────────────────────────────────────────

const TARGET_CONFIG: Partial<Record<GoalValue, string>> = {
  fat_loss:    'Target weight (kg)',
  muscle_gain: 'Target weight (kg)',
  strength:    'Target lift (kg)',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GoalWithSubGoalProps {
  goal:             string | null
  subGoal:          string | null
  targetValue?:     number
  onGoalChange:     (value: string) => void
  onSubGoalChange:  (value: string) => void
  onTargetChange?:  (value: number) => void
}

export function GoalWithSubGoal({
  goal,
  subGoal,
  targetValue,
  onGoalChange,
  onSubGoalChange,
  onTargetChange,
}: GoalWithSubGoalProps) {
  const subOptions   = goal ? (SUB_GOALS[goal as GoalValue] ?? []) : []
  const targetLabel  = goal ? (TARGET_CONFIG[goal as GoalValue] ?? null) : null

  function handleGoalChange(value: string) {
    onGoalChange(value)
    if (subGoal) onSubGoalChange('')
    if (targetValue !== undefined && onTargetChange) onTargetChange(0)
  }

  return (
    <div className="space-y-4">
      {/* Primary goal */}
      <SelectField
        label="Goal"
        required
        value={goal ?? ''}
        placeholder="Select goal"
        options={GOALS as unknown as { label: string; value: string }[]}
        onChange={handleGoalChange}
      />

      {/* Sub-goal — only for goals that have sub-options */}
      {subOptions.length > 0 && (
        <SelectField
          label="Focus"
          value={subGoal ?? ''}
          placeholder="Select focus"
          options={subOptions}
          onChange={onSubGoalChange}
        />
      )}

      {/* Target — only for goals where it's meaningful */}
      {targetLabel && onTargetChange && (
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {targetLabel}
            <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
              (optional)
            </span>
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
