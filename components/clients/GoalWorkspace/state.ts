import { isIntakeGoalId, type IntakeGoalId } from '@/lib/goals/taxonomy'
import type { ClientGoalSummary, GoalUrgency } from '@/types/clients'

export type GoalWorkspaceGoalData = {
  urgency: GoalUrgency
  clientSubGoalIds: string[]
  trainerSubGoalIds: string[]
  trainerNotes: string
}

export type GoalWorkspaceState = {
  selectedGoalIds: IntakeGoalId[]
  activeGoalId: IntakeGoalId | null
  primaryGoalId: IntakeGoalId | null
  goalsById: Partial<Record<IntakeGoalId, GoalWorkspaceGoalData>>
  commandQuery: string
  commandOpen: boolean
}

export const DEFAULT_GOAL_DATA: GoalWorkspaceGoalData = {
  urgency: 'active_focus',
  clientSubGoalIds: [],
  trainerSubGoalIds: [],
  trainerNotes: '',
}

export const INITIAL_WORKSPACE_STATE: GoalWorkspaceState = {
  selectedGoalIds: [],
  activeGoalId: null,
  primaryGoalId: null,
  goalsById: {},
  commandQuery: '',
  commandOpen: false,
}

/**
 * Pure builder: seed a GoalWorkspaceState from a client's existing active goal
 * summaries (Phase 4 Hub editor hydration). Only canonical IntakeGoalIds are
 * loaded — legacy/non-taxonomy goalIds are skipped (defensive, not editable here).
 */
export function workspaceStateFromGoals(goals: ClientGoalSummary[]): GoalWorkspaceState {
  const editable = goals.filter(g => isIntakeGoalId(g.goalId))
  const selectedGoalIds = editable.map(g => g.goalId as IntakeGoalId)
  const goalsById: Partial<Record<IntakeGoalId, GoalWorkspaceGoalData>> = {}
  for (const g of editable) {
    goalsById[g.goalId as IntakeGoalId] = {
      urgency:           g.urgency,
      clientSubGoalIds:  [...g.subGoalIds],
      trainerSubGoalIds: [...g.trainerSubGoalIds],
      trainerNotes:      g.notes ?? '',
    }
  }
  const primary = editable.find(g => g.isPrimary)
  return {
    selectedGoalIds,
    activeGoalId:  selectedGoalIds[0] ?? null,
    primaryGoalId: primary ? (primary.goalId as IntakeGoalId) : (selectedGoalIds[0] ?? null),
    goalsById,
    commandQuery:  '',
    commandOpen:   false,
  }
}
