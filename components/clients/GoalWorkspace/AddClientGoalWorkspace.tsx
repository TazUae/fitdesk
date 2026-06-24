'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { GoalSystemAlerts } from './GoalSystemAlerts'
import { GoalCommandDialog } from './GoalCommandDialog'
import { SelectedGoalLedger } from './SelectedGoalLedger'
import { ActiveGoalInspector } from './ActiveGoalInspector'
import { getWorkspaceConflicts, getWorkspaceSafetyFlags } from './selectors'
import type { GoalWorkspaceState } from './state'
import type { GoalWorkspaceAction } from './reducer'

interface AddClientGoalWorkspaceProps {
  state:    GoalWorkspaceState
  dispatch: React.Dispatch<GoalWorkspaceAction>
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

export function AddClientGoalWorkspace({ state, dispatch }: AddClientGoalWorkspaceProps) {
  const isDesktop = useIsDesktop()
  const conflicts  = getWorkspaceConflicts(state)
  const safetyFlags = getWorkspaceSafetyFlags(state)

  // Cmd/Ctrl+K opens the command palette while workspace is mounted
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        dispatch({ type: 'OPEN_COMMAND' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dispatch])

  const hasGoals = state.selectedGoalIds.length > 0

  return (
    <div className="space-y-3">
      {/* Section label */}
      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        Goals
        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
          (select all that apply)
        </span>
      </label>

      {/* System alerts — centralized above ledger/inspector */}
      <GoalSystemAlerts conflicts={conflicts} safetyFlags={safetyFlags} />

      {/* Workspace content */}
      {hasGoals ? (
        isDesktop ? (
          /* Desktop: side-by-side split */
          <div className="flex gap-4 items-start">
            <div className="w-[38%] shrink-0">
              <SelectedGoalLedger state={state} dispatch={dispatch} />
            </div>
            {state.activeGoalId && (
              <div className="flex-1 min-w-0">
                <ActiveGoalInspector
                  goalId={state.activeGoalId}
                  state={state}
                  dispatch={dispatch}
                />
              </div>
            )}
          </div>
        ) : (
          /* Tablet / mobile: stacked */
          <div className="space-y-3">
            <SelectedGoalLedger state={state} dispatch={dispatch} />
            {state.activeGoalId && (
              <ActiveGoalInspector
                goalId={state.activeGoalId}
                state={state}
                dispatch={dispatch}
              />
            )}
          </div>
        )
      ) : (
        /* Empty state — "+ Add Client Goal" entry point */
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_COMMAND' })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-6 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
          aria-label="Add client goal"
        >
          <Plus className="h-4 w-4" />
          Add Client Goal
        </button>
      )}

      {/* Command palette — portal-like, fixed-positioned */}
      <GoalCommandDialog state={state} dispatch={dispatch} />
    </div>
  )
}
