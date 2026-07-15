/**
 * Pure helper — resolves the initial Progress goal-link selection for
 * ClientHubPanel. No I/O, no side effects.
 */

import type { ClientGoalSummary } from '@/types/clients'

/**
 * Rules:
 *  - zero goals             → '' ("No goal link")
 *  - exactly one goal       → that goal's goalId
 *  - multiple goals, one primary → the primary goal's goalId
 *  - multiple goals, no primary  → '' (fail safe — do not guess)
 */
export function resolveInitialProgressGoalId(goals: ClientGoalSummary[]): string {
  if (goals.length === 0) return ''
  if (goals.length === 1) return goals[0].goalId

  const primaries = goals.filter(g => g.isPrimary)
  return primaries.length === 1 ? primaries[0].goalId : ''
}
