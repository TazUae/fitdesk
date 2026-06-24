'use client'

import { Plus } from 'lucide-react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { GOALS } from '@/lib/goals/taxonomy'
import type { IntakeGoalId } from '@/lib/goals/taxonomy'
import { SelectedGoalRow } from './SelectedGoalRow'
import type { GoalWorkspaceState } from './state'
import type { GoalWorkspaceAction } from './reducer'

interface SelectedGoalLedgerProps {
  state:    GoalWorkspaceState
  dispatch: React.Dispatch<GoalWorkspaceAction>
}

export function SelectedGoalLedger({ state, dispatch }: SelectedGoalLedgerProps) {
  const { selectedGoalIds, activeGoalId, primaryGoalId, goalsById } = state

  return (
    <div className="flex flex-col gap-2">
      {/* Goal rows */}
      <div role="listbox" aria-label="Selected goals" className="space-y-1.5">
        {selectedGoalIds.map(goalId => {
          const data = goalsById[goalId]
          return (
            <SelectedGoalRow
              key={goalId}
              goalId={goalId}
              isPrimary={primaryGoalId === goalId}
              urgency={data?.urgency ?? 'active_focus'}
              isActive={activeGoalId === goalId}
              onActivate={() => dispatch({ type: 'SET_ACTIVE', goalId })}
              onRemove={() => dispatch({ type: 'REMOVE_GOAL', goalId })}
            />
          )
        })}
      </div>

      {/* Primary goal radio — shown when ≥2 goals selected */}
      {selectedGoalIds.length >= 2 && (
        <div
          className="rounded-xl border p-3 space-y-2"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
            Primary program driver
          </p>
          <RadioGroup.Root
            value={primaryGoalId ?? ''}
            onValueChange={v => dispatch({ type: 'SET_PRIMARY', goalId: v as IntakeGoalId })}
            aria-label="Primary program driver"
            className="space-y-1.5"
          >
            {selectedGoalIds.map(goalId => {
              const goal = GOALS.find(g => g.id === goalId)
              if (!goal) return null
              return (
                <div key={goalId} className="flex items-center gap-2">
                  <RadioGroup.Item
                    value={goalId}
                    id={`primary-radio-${goalId}`}
                    className="h-4 w-4 shrink-0 rounded-full border-2 outline-none focus-visible:ring-1 data-[state=checked]:border-[var(--fd-green)]"
                    style={{ borderColor: primaryGoalId === goalId ? 'var(--fd-green)' : 'var(--fd-muted)' }}
                    aria-label={`Set ${goal.label} as primary`}
                  >
                    <RadioGroup.Indicator className="flex items-center justify-center">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: 'var(--fd-green)' }}
                      />
                    </RadioGroup.Indicator>
                  </RadioGroup.Item>
                  <label
                    htmlFor={`primary-radio-${goalId}`}
                    className="flex-1 text-xs font-medium cursor-pointer truncate"
                    style={{ color: primaryGoalId === goalId ? 'var(--fd-green)' : 'var(--fd-text)' }}
                  >
                    {goal.label}
                  </label>
                </div>
              )
            })}
          </RadioGroup.Root>
        </div>
      )}

      {/* Add more button */}
      <button
        type="button"
        onClick={() => dispatch({ type: 'OPEN_COMMAND' })}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-xs font-medium transition-opacity hover:opacity-70"
        style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
      >
        <Plus className="h-3.5 w-3.5" />
        Add another goal
        <kbd
          className="ml-1 rounded px-1 py-0.5 font-mono text-[10px]"
          style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
        >
          ⌘K
        </kbd>
      </button>
    </div>
  )
}
