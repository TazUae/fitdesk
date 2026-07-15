import type { GoalWorkspaceState } from './state'
import { INITIAL_WORKSPACE_STATE, DEFAULT_GOAL_DATA } from './state'
import type { IntakeGoalId } from '@/lib/goals/taxonomy'
import type { GoalUrgency } from '@/types/clients'

export type GoalWorkspaceAction =
  | { type: 'ADD_GOAL'; goalId: IntakeGoalId }
  | { type: 'REMOVE_GOAL'; goalId: IntakeGoalId }
  | { type: 'SET_ACTIVE'; goalId: IntakeGoalId }
  | { type: 'SET_PRIMARY'; goalId: IntakeGoalId }
  | { type: 'SET_URGENCY'; goalId: IntakeGoalId; urgency: GoalUrgency }
  | { type: 'TOGGLE_CLIENT_SUB_GOAL'; goalId: IntakeGoalId; subGoalId: string }
  | { type: 'TOGGLE_TRAINER_SUB_GOAL'; goalId: IntakeGoalId; subGoalId: string }
  | { type: 'SET_CLIENT_SUB_GOALS'; goalId: IntakeGoalId; subGoalIds: string[] }
  | { type: 'SET_TRAINER_SUB_GOALS'; goalId: IntakeGoalId; subGoalIds: string[] }
  | { type: 'SET_TRAINER_NOTES'; goalId: IntakeGoalId; notes: string }
  | { type: 'OPEN_COMMAND' }
  | { type: 'CLOSE_COMMAND' }
  | { type: 'SET_COMMAND_QUERY'; query: string }
  | { type: 'HYDRATE'; state: GoalWorkspaceState }
  | { type: 'RESET' }

export function workspaceReducer(
  state: GoalWorkspaceState,
  action: GoalWorkspaceAction,
): GoalWorkspaceState {
  switch (action.type) {
    case 'ADD_GOAL': {
      if (state.selectedGoalIds.includes(action.goalId)) return state
      const isFirst = state.selectedGoalIds.length === 0
      return {
        ...state,
        selectedGoalIds: [...state.selectedGoalIds, action.goalId],
        activeGoalId: action.goalId,
        primaryGoalId: isFirst ? action.goalId : state.primaryGoalId,
        goalsById: {
          ...state.goalsById,
          [action.goalId]: { ...DEFAULT_GOAL_DATA },
        },
      }
    }

    case 'REMOVE_GOAL': {
      const remaining = state.selectedGoalIds.filter(id => id !== action.goalId)
      const newGoalsById = { ...state.goalsById }
      delete newGoalsById[action.goalId]
      return {
        ...state,
        selectedGoalIds: remaining,
        activeGoalId:
          state.activeGoalId === action.goalId ? (remaining[0] ?? null) : state.activeGoalId,
        primaryGoalId:
          state.primaryGoalId === action.goalId ? (remaining[0] ?? null) : state.primaryGoalId,
        goalsById: newGoalsById,
      }
    }

    case 'SET_ACTIVE':
      if (!state.selectedGoalIds.includes(action.goalId)) return state
      return { ...state, activeGoalId: action.goalId }

    case 'SET_PRIMARY':
      if (!state.selectedGoalIds.includes(action.goalId)) return state
      return { ...state, primaryGoalId: action.goalId }

    case 'SET_URGENCY': {
      const existing = state.goalsById[action.goalId]
      if (!existing) return state
      return {
        ...state,
        goalsById: { ...state.goalsById, [action.goalId]: { ...existing, urgency: action.urgency } },
      }
    }

    case 'TOGGLE_CLIENT_SUB_GOAL': {
      const existing = state.goalsById[action.goalId]
      if (!existing) return state
      const has = existing.clientSubGoalIds.includes(action.subGoalId)
      return {
        ...state,
        goalsById: {
          ...state.goalsById,
          [action.goalId]: {
            ...existing,
            clientSubGoalIds: has
              ? existing.clientSubGoalIds.filter(id => id !== action.subGoalId)
              : [...existing.clientSubGoalIds, action.subGoalId],
          },
        },
      }
    }

    case 'TOGGLE_TRAINER_SUB_GOAL': {
      const existing = state.goalsById[action.goalId]
      if (!existing) return state
      const has = existing.trainerSubGoalIds.includes(action.subGoalId)
      return {
        ...state,
        goalsById: {
          ...state.goalsById,
          [action.goalId]: {
            ...existing,
            trainerSubGoalIds: has
              ? existing.trainerSubGoalIds.filter(id => id !== action.subGoalId)
              : [...existing.trainerSubGoalIds, action.subGoalId],
          },
        },
      }
    }

    case 'SET_CLIENT_SUB_GOALS': {
      const existing = state.goalsById[action.goalId]
      if (!existing) return state
      return {
        ...state,
        goalsById: {
          ...state.goalsById,
          [action.goalId]: { ...existing, clientSubGoalIds: action.subGoalIds },
        },
      }
    }

    case 'SET_TRAINER_SUB_GOALS': {
      const existing = state.goalsById[action.goalId]
      if (!existing) return state
      return {
        ...state,
        goalsById: {
          ...state.goalsById,
          [action.goalId]: { ...existing, trainerSubGoalIds: action.subGoalIds },
        },
      }
    }

    case 'SET_TRAINER_NOTES': {
      const existing = state.goalsById[action.goalId]
      if (!existing) return state
      return {
        ...state,
        goalsById: {
          ...state.goalsById,
          [action.goalId]: { ...existing, trainerNotes: action.notes },
        },
      }
    }

    case 'OPEN_COMMAND':
      return { ...state, commandOpen: true }

    case 'CLOSE_COMMAND':
      return { ...state, commandOpen: false }

    case 'SET_COMMAND_QUERY':
      return { ...state, commandQuery: action.query }

    case 'HYDRATE':
      return { ...action.state }

    case 'RESET':
      return { ...INITIAL_WORKSPACE_STATE }

    default:
      return state
  }
}
