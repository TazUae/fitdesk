import type { IntakeGoalId } from './taxonomy'

export type ConflictType = 'soft' | 'hard'

export type GoalConflictActionType =
  | 'suggest_goal_bundle'
  | 'suggest_primary_goal_change'
  | 'show_warning'
  | 'block_combination'

export interface GoalConflictResolution {
  actionType:              GoalConflictActionType
  message:                 string
  suggestedPrimaryGoalId?: IntakeGoalId
  suggestedGoalIds?:       IntakeGoalId[]
  suggestedSubGoalIds?:    string[]
}

export interface GoalConflictRule {
  pair:       [IntakeGoalId, IntakeGoalId]
  type:       ConflictType
  message:    string
  resolution: GoalConflictResolution
}

export interface ConflictResult {
  type:       ConflictType
  goals:      [IntakeGoalId, IntakeGoalId]
  message:    string
  resolution: GoalConflictResolution
}

export const GOAL_CONFLICT_RULES: readonly GoalConflictRule[] = [
  {
    pair:    ['fat-loss', 'muscle'],
    type:    'soft',
    message: 'Body recomposition requires a precise nutrition balance. Confirm both goals are intentional or use the primary goal to set the training direction.',
    resolution: {
      actionType:          'suggest_goal_bundle',
      message:             'Consider a body recomposition approach: moderate caloric deficit, ≥2.0 g/kg/day protein, progressive overload.',
      suggestedGoalIds:    ['fat-loss', 'muscle'],
      suggestedSubGoalIds: ['reduce_total_body_fat', 'build_lean_muscle_mass'],
    },
  },
  {
    pair:    ['fat-loss', 'aesthetics'],
    type:    'soft',
    message: 'Fat Loss and Aesthetics overlap. Consider whether one drives the program or both are intentional.',
    resolution: {
      actionType: 'show_warning',
      message:    'Fat Loss and Aesthetics overlap significantly. Consider using one as the primary goal to set a clear training direction.',
    },
  },
  {
    pair:    ['weight-mgmt', 'muscle'],
    type:    'soft',
    message: 'Weight management paired with muscle gain may require a caloric surplus strategy. Confirm direction with client.',
    resolution: {
      actionType:             'suggest_primary_goal_change',
      message:                'Muscle gain requires a caloric surplus. Confirm which goal drives the program phase.',
      suggestedPrimaryGoalId: 'muscle',
    },
  },
  {
    pair:    ['underweight', 'fat-loss'],
    type:    'hard',
    message: 'Underweight and Fat Loss are contraindicated. Choose one direction: remove Fat Loss (client is underweight) or remove Safe Weight Gain (client is not in the underweight population).',
    resolution: {
      actionType:             'block_combination',
      message:                'Remove either "fat-loss" or "underweight" before continuing.',
      suggestedPrimaryGoalId: 'underweight',
    },
  },
]

export function detectConflicts(goalIds: IntakeGoalId[]): ConflictResult[] {
  const goalSet = new Set(goalIds)
  const results: ConflictResult[] = []

  for (const rule of GOAL_CONFLICT_RULES) {
    if (goalSet.has(rule.pair[0]) && goalSet.has(rule.pair[1])) {
      results.push({
        type:       rule.type,
        goals:      [rule.pair[0], rule.pair[1]],
        message:    rule.message,
        resolution: rule.resolution,
      })
    }
  }

  return results
}

export function hasUnresolvedHardConflict(goalIds: IntakeGoalId[]): boolean {
  return detectConflicts(goalIds).some(c => c.type === 'hard')
}
