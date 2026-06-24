import type { GoalWorkspaceState } from './state'
import { detectConflicts, hasUnresolvedHardConflict } from '@/lib/goals/conflicts'
import { computeSafetyFlags } from '@/lib/goals/safety'
import type { ConflictResult } from '@/lib/goals/conflicts'
import type { SafetyFlag } from '@/lib/goals/safety'
import type { SelectedGoalDraft } from '@/types/clients'

export function toSelectedGoalDrafts(state: GoalWorkspaceState): SelectedGoalDraft[] {
  return state.selectedGoalIds.map(goalId => {
    const data = state.goalsById[goalId]
    return {
      goalId,
      isPrimary: state.primaryGoalId === goalId,
      urgency: data?.urgency ?? 'active_focus',
      clientSubGoalIds: data?.clientSubGoalIds ?? [],
      trainerSubGoalIds: data?.trainerSubGoalIds ?? [],
      trainerNotes: data?.trainerNotes?.trim() || null,
    }
  })
}

export function getWorkspaceConflicts(state: GoalWorkspaceState): ConflictResult[] {
  return detectConflicts(state.selectedGoalIds)
}

export function getWorkspaceSafetyFlags(state: GoalWorkspaceState): SafetyFlag[] {
  return computeSafetyFlags(state.selectedGoalIds)
}

export function hasWorkspaceHardConflict(state: GoalWorkspaceState): boolean {
  return hasUnresolvedHardConflict(state.selectedGoalIds)
}
