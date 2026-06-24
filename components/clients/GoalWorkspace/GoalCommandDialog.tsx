'use client'

import { useEffect } from 'react'
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from 'cmdk'
import { GOALS, GOAL_SECTIONS, type GoalSection } from '@/lib/goals/taxonomy'
import type { GoalWorkspaceState } from './state'
import type { GoalWorkspaceAction } from './reducer'

const SECTION_LABELS: Record<GoalSection, string> = {
  core:       'Core',
  specialist: 'Specialist',
  emerging:   'Emerging',
}

interface GoalCommandDialogProps {
  state:    GoalWorkspaceState
  dispatch: React.Dispatch<GoalWorkspaceAction>
}

export function GoalCommandDialog({ state, dispatch }: GoalCommandDialogProps) {
  // Esc closes palette (runs before sheet's Esc handler via capture phase)
  useEffect(() => {
    if (!state.commandOpen) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        dispatch({ type: 'CLOSE_COMMAND' })
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [state.commandOpen, dispatch])

  if (!state.commandOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={() => dispatch({ type: 'CLOSE_COMMAND' })}
        aria-hidden="true"
      />

      {/* Palette panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add goal"
        className="fixed left-1/2 top-[18%] z-50 w-full max-w-[520px] -translate-x-1/2 overflow-hidden rounded-2xl shadow-2xl"
        style={{ border: '1px solid var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
      >
        <Command shouldFilter>
          {/* Search input row */}
          <div
            className="flex items-center border-b px-3 gap-2"
            style={{ borderColor: 'var(--fd-border)' }}
          >
            <svg
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--fd-muted)' }}
              fill="none" stroke="currentColor" strokeWidth={2}
              viewBox="0 0 24 24" aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <CommandInput
              value={state.commandQuery}
              onValueChange={q => dispatch({ type: 'SET_COMMAND_QUERY', query: q })}
              placeholder="Search goals…"
              className="flex h-12 flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--fd-text)' }}
            />
          </div>

          {/* Results */}
          <CommandList className="max-h-[320px] overflow-y-auto p-1.5">
            <CommandEmpty
              className="py-6 text-center text-sm"
              style={{ color: 'var(--fd-muted)' }}
            >
              No goals found.
            </CommandEmpty>

            {GOAL_SECTIONS.map(section => {
              const sectionGoals = GOALS.filter(g => g.section === section)
              return (
                <CommandGroup key={section}>
                  <div
                    className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--fd-muted)' }}
                  >
                    {SECTION_LABELS[section]}
                  </div>

                  {sectionGoals.map(goal => {
                    const isSelected = state.selectedGoalIds.includes(goal.id)
                    return (
                      <CommandItem
                        key={goal.id}
                        value={goal.label}
                        onSelect={() => {
                          // Already selected → no-op (remove via ledger X button)
                          if (!isSelected) {
                            dispatch({ type: 'ADD_GOAL', goalId: goal.id })
                          }
                          // Keep palette open (no CLOSE_COMMAND dispatch)
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors"
                        style={{
                          color:           isSelected ? 'var(--fd-green)' : 'var(--fd-text)',
                          backgroundColor: 'transparent',
                        }}
                        data-disabled={isSelected ? 'false' : undefined}
                      >
                        <span className="font-medium">{goal.label}</span>
                        {isSelected && (
                          <span
                            className="ml-2 text-xs font-semibold"
                            style={{ color: 'var(--fd-green)' }}
                          >
                            Added ✓
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )
            })}
          </CommandList>

          {/* Footer hint */}
          <div
            className="flex items-center gap-3 border-t px-3 py-2.5"
            style={{ borderColor: 'var(--fd-border)' }}
          >
            <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              <kbd className="rounded px-1 py-0.5 font-mono text-[10px]" style={{ backgroundColor: 'var(--fd-card)' }}>↵</kbd>
              {' '}add
            </span>
            <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              <kbd className="rounded px-1 py-0.5 font-mono text-[10px]" style={{ backgroundColor: 'var(--fd-card)' }}>esc</kbd>
              {' '}close
            </span>
          </div>
        </Command>
      </div>
    </>
  )
}
