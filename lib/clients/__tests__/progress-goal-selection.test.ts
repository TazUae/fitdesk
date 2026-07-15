/**
 * Unit tests for resolveInitialProgressGoalId — pure helper, no I/O required.
 */

import { describe, expect, it } from 'vitest'
import { resolveInitialProgressGoalId } from '@/lib/clients/progress-goal-selection'
import type { ClientGoalSummary } from '@/types/clients'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeGoal(overrides: Partial<ClientGoalSummary> = {}): ClientGoalSummary {
  return {
    id:                'goal-1',
    goalId:             'fat_loss',
    urgency:            'active_focus',
    confidence:         'high',
    primaryGoalLabel:   null,
    status:             'active',
    isPrimary:          false,
    subGoalIds:         [],
    trainerSubGoalIds:  [],
    notes:              null,
    safetyFlags:        [],
    ...overrides,
  }
}

describe('resolveInitialProgressGoalId', () => {
  it('returns empty string for zero goals', () => {
    expect(resolveInitialProgressGoalId([])).toBe('')
  })

  it('returns the goalId for exactly one non-primary goal', () => {
    const goal = makeGoal({ id: 'goal-1', goalId: 'strength', isPrimary: false })
    expect(resolveInitialProgressGoalId([goal])).toBe('strength')
  })

  it('returns the primary goalId when multiple goals have exactly one primary', () => {
    const goals = [
      makeGoal({ id: 'goal-1', goalId: 'fat_loss', isPrimary: false }),
      makeGoal({ id: 'goal-2', goalId: 'strength', isPrimary: true }),
      makeGoal({ id: 'goal-3', goalId: 'mobility', isPrimary: false }),
    ]
    expect(resolveInitialProgressGoalId(goals)).toBe('strength')
  })

  it('returns empty string for multiple goals with no primary', () => {
    const goals = [
      makeGoal({ id: 'goal-1', goalId: 'fat_loss', isPrimary: false }),
      makeGoal({ id: 'goal-2', goalId: 'strength', isPrimary: false }),
    ]
    expect(resolveInitialProgressGoalId(goals)).toBe('')
  })

  it('returns empty string for multiple goals with more than one primary (defensive)', () => {
    const goals = [
      makeGoal({ id: 'goal-1', goalId: 'fat_loss', isPrimary: true }),
      makeGoal({ id: 'goal-2', goalId: 'strength', isPrimary: true }),
    ]
    expect(resolveInitialProgressGoalId(goals)).toBe('')
  })

  it('does not mutate the supplied goal array', () => {
    const goals = [
      makeGoal({ id: 'goal-1', goalId: 'fat_loss', isPrimary: false }),
      makeGoal({ id: 'goal-2', goalId: 'strength', isPrimary: true }),
    ]
    const snapshot = JSON.parse(JSON.stringify(goals))

    resolveInitialProgressGoalId(goals)

    expect(goals).toEqual(snapshot)
    expect(goals.length).toBe(2)
  })
})
