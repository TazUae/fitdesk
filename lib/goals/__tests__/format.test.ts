import { describe, it, expect } from 'vitest'
import { formatGoalLabel, formatSubGoalLabel, formatUrgency, normalizeUrgency } from '../format'
import { resolveGoalDisplayLabel, resolveSubGoalDisplayLabel } from '../display'
import type { IntakeGoalId } from '../taxonomy'

describe('formatGoalLabel', () => {
  it('resolves canonical goal IDs to their full taxonomy label', () => {
    expect(formatGoalLabel('strength')).toBe('Strength & Power')
    expect(formatGoalLabel('mobility')).toBe('Mobility & Flexibility')
    expect(formatGoalLabel('general')).toBe('General Fitness')
  })

  it('falls back to the raw id for an unrecognized goal id', () => {
    // formatGoalLabel's own type signature requires IntakeGoalId; the runtime
    // fallback exists for defense-in-depth against stale/legacy stored values.
    expect(formatGoalLabel('not-a-real-goal' as IntakeGoalId)).toBe('not-a-real-goal')
  })
})

describe('formatSubGoalLabel', () => {
  it('resolves canonical sub-goal ids scoped to their parent goal', () => {
    expect(formatSubGoalLabel('strength', 'increase_1rm_compound_lifts')).toBe('Increase 1RM on compound lifts')
    expect(formatSubGoalLabel('mobility', 'improve_overall_flexibility')).toBe('Improve overall flexibility')
    expect(formatSubGoalLabel('general', 'improve_daily_energy_levels')).toBe('Improve daily energy levels')
  })

  it('falls back to the raw sub-goal id when unrecognized under the given goal', () => {
    expect(formatSubGoalLabel('strength', 'not_a_real_subgoal')).toBe('not_a_real_subgoal')
  })
})

describe('formatUrgency / normalizeUrgency', () => {
  it('formats all three urgency levels', () => {
    expect(formatUrgency('urgent')).toBe('Urgent')
    expect(formatUrgency('active_focus')).toBe('Active Focus')
    expect(formatUrgency('background')).toBe('Background')
  })

  it('normalizes the legacy "warm" alias to active_focus', () => {
    expect(normalizeUrgency('warm')).toBe('active_focus')
  })
})

/**
 * Regression coverage for the Client Hub goal-label defect: every canonical-
 * goal display surface (goal-card titles, client-focus/trainer-assessment
 * chips, the Progress goal-link dropdown, and saved Progress entry labels)
 * used to read a per-row `primaryGoalLabel` field that is null for any goal
 * that isn't the client's designated primary (see lib/clients/hub-map.ts —
 * that null-for-non-primary behavior is correct and intentional; the bug was
 * every consumer of it treating that null as "no label available" and
 * falling back to the raw stored goalId, e.g. "general", "mobility").
 *
 * components/modules/ClientHubPanel.tsx now imports and uses
 * resolveGoalDisplayLabel/resolveSubGoalDisplayLabel from lib/goals/display.ts
 * directly at every one of those surfaces — this suite tests those exact
 * exported functions (not a re-implementation of their expression), so a
 * regression in the shared resolver is caught here regardless of which
 * component consumes it.
 *
 * ClientHubPanel.tsx cannot be imported directly under vitest's node
 * environment (no jsdom/testing-library is installed in this repo, and a
 * probe import of the component module hangs on its transitive import
 * chain). Browser-level DOM rendering of ClientHubPanel remains the
 * acceptance gate for this fix — this suite proves the label-resolution
 * logic is correct, not that the component renders it.
 */
describe('resolveGoalDisplayLabel / resolveSubGoalDisplayLabel (QA Multi Goal fixture)', () => {
  const fixture = [
    {
      goalId:            'strength',
      isPrimary:         true,
      clientSubGoalId:   'increase_1rm_compound_lifts',
      trainerSubGoalId:  'improve_rate_of_force_development',
    },
    {
      goalId:            'mobility',
      isPrimary:         false,
      clientSubGoalId:   'improve_overall_flexibility',
      trainerSubGoalId:  'improve_thoracic_spine_rotation',
    },
    {
      goalId:            'general',
      isPrimary:         false,
      clientSubGoalId:   'improve_daily_energy_levels',
      trainerSubGoalId:  'improve_heart_rate_recovery',
    },
  ] as const

  it('renders the full taxonomy label for every goal, primary and supporting alike', () => {
    expect(resolveGoalDisplayLabel(fixture[0].goalId)).toBe('Strength & Power')
    expect(resolveGoalDisplayLabel(fixture[1].goalId)).toBe('Mobility & Flexibility')
    expect(resolveGoalDisplayLabel(fixture[2].goalId)).toBe('General Fitness')
  })

  it('never falls back to the raw canonical id for a recognized goal, regardless of primary status', () => {
    for (const goal of fixture) {
      expect(resolveGoalDisplayLabel(goal.goalId)).not.toBe(goal.goalId)
    }
  })

  it('renders full labels for client-stated and trainer-assessed sub-goal chips on every goal', () => {
    expect(resolveSubGoalDisplayLabel('strength', fixture[0].clientSubGoalId)).toBe('Increase 1RM on compound lifts')
    expect(resolveSubGoalDisplayLabel('strength', fixture[0].trainerSubGoalId)).toBe('Improve rate of force development')

    expect(resolveSubGoalDisplayLabel('mobility', fixture[1].clientSubGoalId)).toBe('Improve overall flexibility')
    expect(resolveSubGoalDisplayLabel('mobility', fixture[1].trainerSubGoalId)).toBe('Improve thoracic spine rotation')

    expect(resolveSubGoalDisplayLabel('general', fixture[2].clientSubGoalId)).toBe('Improve daily energy levels')
    expect(resolveSubGoalDisplayLabel('general', fixture[2].trainerSubGoalId)).toBe('Improve heart rate recovery')
  })

  it('gives an unknown goal id a readable fail-soft fallback instead of throwing', () => {
    expect(resolveGoalDisplayLabel('legacy_unmapped_goal')).toBe('legacy unmapped goal')
    expect(resolveSubGoalDisplayLabel('legacy_unmapped_goal', 'legacy_unmapped_subgoal')).toBe('legacy unmapped subgoal')
  })
})
