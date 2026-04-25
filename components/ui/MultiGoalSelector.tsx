'use client'

import { Check } from 'lucide-react'
import type { GoalSelection } from '@/utils/goalHelpers'

// ─── Data ─────────────────────────────────────────────────────────────────────

const GOALS = {
  fat_loss: {
    label: 'Fat Loss', icon: '🔥',
    focuses: [
      { label: 'Lose weight gradually', value: 'weight_loss' },
      { label: 'Reduce body fat %',     value: 'fat_percentage' },
      { label: 'Improve conditioning',  value: 'conditioning' },
    ],
  },
  muscle_gain: {
    label: 'Muscle Gain', icon: '💪',
    focuses: [
      { label: 'Hypertrophy', value: 'hypertrophy' },
      { label: 'Lean muscle', value: 'lean_mass' },
      { label: 'Bulking',     value: 'bulking' },
    ],
  },
  strength: {
    label: 'Strength', icon: '🏋️',
    focuses: [
      { label: 'Max strength',  value: 'max_strength' },
      { label: 'Powerlifting', value: 'powerlifting' },
    ],
  },
  mobility: {
    label: 'Mobility', icon: '🧘',
    focuses: [
      { label: 'Flexibility',      value: 'flexibility' },
      { label: 'Joint health',     value: 'joint_health' },
      { label: 'Posture & balance', value: 'posture' },
    ],
  },
  rehabilitation: {
    label: 'Rehabilitation', icon: '🩺',
    focuses: [
      { label: 'Back pain recovery', value: 'back_pain' },
      { label: 'Knee recovery',      value: 'knee_recovery' },
      { label: 'Post injury',        value: 'injury_recovery' },
    ],
  },
  conditioning: {
    label: 'Conditioning', icon: '⚡',
    focuses: [
      { label: 'Cardio endurance', value: 'cardio' },
      { label: 'HIIT',             value: 'hiit' },
      { label: 'Athletic stamina', value: 'stamina' },
    ],
  },
} as const

type GoalType = keyof typeof GOALS

// ─── Props ────────────────────────────────────────────────────────────────────

interface MultiGoalSelectorProps {
  value:    GoalSelection[]
  onChange: (goals: GoalSelection[]) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MultiGoalSelector({ value, onChange }: MultiGoalSelectorProps) {

  function toggleGoal(type: GoalType) {
    const exists = value.find(g => g.type === type)
    if (exists) {
      onChange(value.filter(g => g.type !== type))
    } else {
      onChange([...value, { type, focuses: [] }])
    }
  }

  function toggleFocus(goalType: GoalType, focusValue: string) {
    onChange(value.map(g => {
      if (g.type !== goalType) return g
      const hasFocus = g.focuses.includes(focusValue)
      return {
        ...g,
        focuses: hasFocus
          ? g.focuses.filter(f => f !== focusValue)
          : [...g.focuses, focusValue],
      }
    }))
  }

  const selectedGoals = value.map(g => g.type)

  return (
    <div className="space-y-4">

      {/* Label */}
      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        Goals
        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
          (select all that apply)
        </span>
      </label>

      {/* Goal chips — 2-column grid */}
      <div className="grid grid-cols-2 gap-2">
        {(Object.entries(GOALS) as [GoalType, typeof GOALS[GoalType]][]).map(([type, goal]) => {
          const selected = selectedGoals.includes(type)
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleGoal(type)}
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
              <span className="text-base leading-none">{goal.icon}</span>
              <span className="truncate text-left leading-tight">{goal.label}</span>
              {selected && (
                <span
                  className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--fd-green)' }}
                >
                  <Check className="h-2.5 w-2.5" style={{ color: 'var(--fd-bg)' }} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Focus chips — one section per selected goal that has focuses */}
      {value.map(selection => {
        const goal = GOALS[selection.type as GoalType]
        if (!goal || !goal.focuses.length) return null

        return (
          <div key={selection.type} className="space-y-2 rounded-2xl border p-3.5"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <p className="text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
              {goal.icon} {goal.label} — focus
            </p>
            <div className="flex flex-wrap gap-2">
              {goal.focuses.map(focus => {
                const active = selection.focuses.includes(focus.value)
                return (
                  <button
                    key={focus.value}
                    type="button"
                    onClick={() => toggleFocus(selection.type as GoalType, focus.value)}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.96]"
                    style={active ? {
                      backgroundColor: 'rgba(78,203,160,0.15)',
                      borderColor:     'var(--fd-green)',
                      color:           'var(--fd-green)',
                    } : {
                      backgroundColor: 'var(--fd-surface)',
                      borderColor:     'var(--fd-border)',
                      color:           'var(--fd-muted)',
                    }}
                  >
                    {focus.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

    </div>
  )
}
