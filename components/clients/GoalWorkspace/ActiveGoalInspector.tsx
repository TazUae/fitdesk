'use client'

import * as RadioGroup from '@radix-ui/react-radio-group'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Check } from 'lucide-react'
import { GOALS, getSubGoals } from '@/lib/goals/taxonomy'
import type { IntakeGoalId } from '@/lib/goals/taxonomy'
import { TrainerNotesTextarea } from './TrainerNotesTextarea'
import type { GoalWorkspaceState } from './state'
import type { GoalWorkspaceAction } from './reducer'

const SECTION_LABELS: Record<string, string> = {
  core:       'Core',
  specialist: 'Specialist',
  emerging:   'Emerging',
}

const URGENCY_OPTIONS = [
  { value: 'urgent'       as const, label: 'Urgent'       },
  { value: 'active_focus' as const, label: 'Active Focus' },
  { value: 'background'   as const, label: 'Background'   },
]

// Reserves the check icon's width whether or not it's shown, so toggling
// selection never shifts surrounding layout.
function ChipCheck({ selected }: { selected: boolean }) {
  return (
    <Check
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

interface ActiveGoalInspectorProps {
  goalId:   IntakeGoalId
  state:    GoalWorkspaceState
  dispatch: React.Dispatch<GoalWorkspaceAction>
}

export function ActiveGoalInspector({ goalId, state, dispatch }: ActiveGoalInspectorProps) {
  const goal = GOALS.find(g => g.id === goalId)
  const data = state.goalsById[goalId]
  if (!goal || !data) return null

  const isPrimary       = state.primaryGoalId === goalId
  const clientSubGoals  = getSubGoals(goalId, 'primary')
  const trainerSubGoals = getSubGoals(goalId, 'secondary')

  const activeChipClass =
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.96] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fd-accent)] ' +
    'data-[state=on]:border-[var(--fd-green)] data-[state=on]:text-[var(--fd-green)] data-[state=on]:bg-[rgba(78,203,160,0.12)] data-[state=on]:font-semibold'

  return (
    <div
      className="rounded-2xl border p-4 space-y-4"
      style={{ borderColor: isPrimary ? 'var(--fd-green)' : 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--fd-text)' }}>
            {goal.label}
          </p>
          <span
            className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: 'var(--fd-surface)', color: 'var(--fd-muted)' }}
          >
            {SECTION_LABELS[goal.section] ?? goal.section}
          </span>
        </div>
      </div>

      {/* Primary driver — radio group (Primary / Supporting) */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
          Goal role
        </p>
        <RadioGroup.Root
          value={isPrimary ? 'primary' : 'supporting'}
          onValueChange={v => {
            if (v === 'primary') dispatch({ type: 'SET_PRIMARY', goalId })
          }}
          aria-label={`Role for ${goal.label}`}
          className="flex gap-4"
        >
          {[
            { value: 'primary',   label: 'Primary driver' },
            { value: 'supporting', label: 'Supporting goal' },
          ].map(opt => (
            <div key={opt.value} className="flex items-center gap-1.5">
              <RadioGroup.Item
                value={opt.value}
                id={`inspector-role-${goalId}-${opt.value}`}
                className="h-4 w-4 shrink-0 rounded-full border-2 outline-none focus-visible:ring-1"
                style={{
                  borderColor:
                    (opt.value === 'primary' && isPrimary) || (opt.value === 'supporting' && !isPrimary)
                      ? 'var(--fd-green)'
                      : 'var(--fd-muted)',
                }}
              >
                <RadioGroup.Indicator className="flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--fd-green)' }} />
                </RadioGroup.Indicator>
              </RadioGroup.Item>
              <label
                htmlFor={`inspector-role-${goalId}-${opt.value}`}
                className="text-xs font-medium cursor-pointer"
                style={{ color: 'var(--fd-text)' }}
              >
                {opt.label}
              </label>
            </div>
          ))}
        </RadioGroup.Root>
      </div>

      {/* Urgency — ToggleGroup single */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
          Urgency
        </p>
        <ToggleGroup.Root
          type="single"
          value={data.urgency}
          onValueChange={v => {
            if (v) dispatch({ type: 'SET_URGENCY', goalId, urgency: v as typeof data.urgency })
          }}
          aria-label={`Urgency for ${goal.label}`}
          className="flex gap-1.5"
        >
          {URGENCY_OPTIONS.map(opt => (
            <ToggleGroup.Item
              key={opt.value}
              value={opt.value}
              className={
                'flex-1 rounded-lg border py-1.5 text-center text-xs font-medium transition-all ' +
                'data-[state=on]:border-[var(--fd-green)] data-[state=on]:text-[var(--fd-green)] data-[state=on]:bg-[rgba(78,203,160,0.12)]'
              }
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)', backgroundColor: 'var(--fd-surface)' }}
            >
              {opt.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      {/* Client focus — ToggleGroup multiple */}
      {clientSubGoals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
            Client focus
          </p>
          <ToggleGroup.Root
            type="multiple"
            value={data.clientSubGoalIds}
            onValueChange={ids => dispatch({ type: 'SET_CLIENT_SUB_GOALS', goalId, subGoalIds: ids })}
            aria-label={`Client focus for ${goal.label}`}
            className="flex flex-wrap gap-1.5"
          >
            {clientSubGoals.map(sg => {
              const isSelected = data.clientSubGoalIds.includes(sg.id)
              return (
                <ToggleGroup.Item
                  key={sg.id}
                  value={sg.id}
                  className={activeChipClass}
                  style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)', backgroundColor: 'var(--fd-surface)' }}
                >
                  <ChipCheck selected={isSelected} />
                  {sg.label}
                </ToggleGroup.Item>
              )
            })}
          </ToggleGroup.Root>
        </div>
      )}

      {/* Trainer assessment — ToggleGroup multiple */}
      {trainerSubGoals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
            Trainer assessment
          </p>
          <ToggleGroup.Root
            type="multiple"
            value={data.trainerSubGoalIds}
            onValueChange={ids => dispatch({ type: 'SET_TRAINER_SUB_GOALS', goalId, subGoalIds: ids })}
            aria-label={`Trainer assessment for ${goal.label}`}
            className="flex flex-wrap gap-1.5"
          >
            {trainerSubGoals.map(sg => {
              const isSelected = data.trainerSubGoalIds.includes(sg.id)
              return (
                <ToggleGroup.Item
                  key={sg.id}
                  value={sg.id}
                  className={activeChipClass}
                  style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)', backgroundColor: 'var(--fd-surface)' }}
                >
                  <ChipCheck selected={isSelected} />
                  {sg.label}
                </ToggleGroup.Item>
              )
            })}
          </ToggleGroup.Root>
        </div>
      )}

      {/* Trainer notes */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
          Notes for this goal
          <span className="ml-1 font-normal">(optional)</span>
        </p>
        {/* key resets local draft state when the active goal changes */}
        <TrainerNotesTextarea
          key={goalId}
          value={data.trainerNotes}
          onCommit={notes => dispatch({ type: 'SET_TRAINER_NOTES', goalId, notes })}
        />
      </div>
    </div>
  )
}
