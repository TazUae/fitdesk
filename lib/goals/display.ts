import { formatGoalLabel, formatSubGoalLabel } from './format'
import { isIntakeGoalId } from './taxonomy'

/**
 * Resolves a stored client_goal row's goalId to its canonical taxonomy label.
 * Unlike formatGoalLabel (which requires a typed IntakeGoalId), this accepts
 * a plain string — the shape everything reads from the DB/DTOs actually has —
 * and narrows it with isIntakeGoalId instead of casting. Falls back to a
 * readable space-cased version of the raw id for any legacy/unrecognized
 * value rather than throwing, so a stale or unmapped id never blanks the UI.
 */
export function resolveGoalDisplayLabel(goalId: string): string {
  return isIntakeGoalId(goalId) ? formatGoalLabel(goalId) : goalId.replace(/_/g, ' ')
}

/**
 * Resolves a sub-goal id to its taxonomy label, scoped to the parent goal's
 * sub-goal catalog. Falls back to a readable space-cased raw id when the
 * parent goalId itself isn't a recognized canonical id (formatSubGoalLabel
 * already falls back to the raw sub-goal id when only the sub-goal id is
 * unrecognized under an otherwise-valid parent goal).
 */
export function resolveSubGoalDisplayLabel(goalId: string, subGoalId: string): string {
  return isIntakeGoalId(goalId) ? formatSubGoalLabel(goalId, subGoalId) : subGoalId.replace(/_/g, ' ')
}
