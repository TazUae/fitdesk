export interface GoalSelection {
  type:    string
  focuses: string[]
}

export function getPrimaryGoal(goals: GoalSelection[]): string | null {
  return goals.length > 0 ? goals[0].type : null
}

export function hasGoal(goals: GoalSelection[], type: string): boolean {
  return goals.some(g => g.type === type)
}
