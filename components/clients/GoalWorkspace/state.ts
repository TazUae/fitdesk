import type { IntakeGoalId } from '@/lib/goals/taxonomy'
import type { GoalUrgency } from '@/types/clients'

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
