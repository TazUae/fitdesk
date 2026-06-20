import type { GoalUrgency } from '@/types/clients'
import { GOALS, SUB_GOALS, type IntakeGoalId } from './taxonomy'

export function formatGoalLabel(id: IntakeGoalId): string {
  return GOALS.find(g => g.id === id)?.label ?? id
}

export function formatSubGoalLabel(goalId: IntakeGoalId, subGoalId: string): string {
  return SUB_GOALS[goalId]?.find(sg => sg.id === subGoalId)?.label ?? subGoalId
}

export function formatUrgency(urgency: GoalUrgency): string {
  const labels: Record<GoalUrgency, string> = {
    urgent:       'Urgent',
    active_focus: 'Active Focus',
    background:   'Background',
  }
  return labels[urgency]
}

// 'warm' is an inbound alias only — never persisted. Storage canonical is 'active_focus'.
export function normalizeUrgency(raw: string): GoalUrgency {
  if (raw === 'warm' || raw === 'active_focus') return 'active_focus'
  if (raw === 'urgent') return 'urgent'
  if (raw === 'background') return 'background'
  return 'active_focus'
}
