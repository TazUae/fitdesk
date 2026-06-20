import { describe, it, expect } from 'vitest'
import {
  GOALS,
  GOAL_SECTIONS,
  SUB_GOALS,
  GOAL_SAFETY_FLAGS,
  LEGACY_GOAL_ALIASES,
  LEGACY_SUBGOAL_ALIASES,
  normalizeGoalId,
  normalizeSubGoalId,
  isIntakeGoalId,
  getGoal,
  getGoalsBySection,
  getSubGoals,
  type SubGoalLayer,
} from '../taxonomy'
import { normalizeUrgency } from '../format'

// ─── Total sub-goal counts ─────────────────────────────────────────────────────
//   primary   = 96  (fat-loss: 6; all others: 5 each — source: FITDESK_GOAL_SYSTEM_FULL_SOURCE.md)
//   secondary = 96  (general: 6; all others: 5 each — source: FITDESK_GOAL_SYSTEM_FULL_SOURCE.md)
//   total     = 192

const EXPECTED_PRIMARY_COUNT   = 96
const EXPECTED_SECONDARY_COUNT = 96
const EXPECTED_TOTAL_COUNT     = 192

describe('GOALS taxonomy', () => {
  it('has exactly 19 goals', () => {
    expect(GOALS).toHaveLength(19)
  })

  it('all goal IDs are unique', () => {
    const ids = GOALS.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no goal ID contains an underscore', () => {
    for (const goal of GOALS) {
      expect(goal.id).not.toContain('_')
    }
  })

  it('section split is exactly 8 core / 8 specialist / 3 emerging', () => {
    const core       = GOALS.filter(g => g.section === 'core')
    const specialist = GOALS.filter(g => g.section === 'specialist')
    const emerging   = GOALS.filter(g => g.section === 'emerging')
    expect(core).toHaveLength(8)
    expect(specialist).toHaveLength(8)
    expect(emerging).toHaveLength(3)
  })

  it('every goal has a non-empty label', () => {
    for (const goal of GOALS) {
      expect(goal.label.length).toBeGreaterThan(0)
    }
  })

  it('GOAL_SECTIONS contains the 3 section values', () => {
    expect([...GOAL_SECTIONS].sort()).toEqual(['core', 'emerging', 'specialist'])
  })
})

describe('SUB_GOALS', () => {
  it('has an entry for all 19 goals', () => {
    for (const goal of GOALS) {
      expect(SUB_GOALS[goal.id]).toBeDefined()
    }
  })

  it('SUB_GOALS keys contain no underscores (parent goal IDs are hyphenated)', () => {
    for (const key of Object.keys(SUB_GOALS)) {
      expect(key).not.toContain('_')
    }
  })

  it('every sub-goal has a non-empty id, label, and goalId matching the parent', () => {
    for (const [goalId, subGoals] of Object.entries(SUB_GOALS)) {
      for (const sg of subGoals) {
        expect(sg.id.length, `${goalId}: empty id`).toBeGreaterThan(0)
        expect(sg.label.length, `${goalId}: empty label`).toBeGreaterThan(0)
        expect(sg.goalId, `${goalId}: goalId mismatch`).toBe(goalId)
      }
    }
  })

  it('every sub-goal has a layer field of "primary" or "secondary"', () => {
    const validLayers: SubGoalLayer[] = ['primary', 'secondary']
    for (const [goalId, subGoals] of Object.entries(SUB_GOALS)) {
      for (const sg of subGoals) {
        expect(validLayers, `${goalId}.${sg.id}: invalid layer "${sg.layer}"`).toContain(sg.layer)
      }
    }
  })

  it('every goal has at least one primary sub-goal', () => {
    for (const goal of GOALS) {
      const primaryCount = SUB_GOALS[goal.id].filter(sg => sg.layer === 'primary').length
      expect(primaryCount, `${goal.id}: no primary sub-goals`).toBeGreaterThan(0)
    }
  })

  it('every goal has at least one secondary sub-goal', () => {
    for (const goal of GOALS) {
      const secondaryCount = SUB_GOALS[goal.id].filter(sg => sg.layer === 'secondary').length
      expect(secondaryCount, `${goal.id}: no secondary sub-goals`).toBeGreaterThan(0)
    }
  })

  it(`total sub-goal count is ${EXPECTED_TOTAL_COUNT} (${EXPECTED_PRIMARY_COUNT} primary + ${EXPECTED_SECONDARY_COUNT} secondary)`, () => {
    const allSubGoals = Object.values(SUB_GOALS).flat()
    const primary     = allSubGoals.filter(sg => sg.layer === 'primary')
    const secondary   = allSubGoals.filter(sg => sg.layer === 'secondary')
    expect(allSubGoals).toHaveLength(EXPECTED_TOTAL_COUNT)
    expect(primary).toHaveLength(EXPECTED_PRIMARY_COUNT)
    expect(secondary).toHaveLength(EXPECTED_SECONDARY_COUNT)
  })

  it('sub-goal IDs are unique within each goal', () => {
    for (const [goalId, subGoals] of Object.entries(SUB_GOALS)) {
      const ids = subGoals.map(sg => sg.id)
      expect(new Set(ids).size, `${goalId}: duplicate sub-goal IDs`).toBe(ids.length)
    }
  })

  it('no goal has only sample or placeholder sub-goals (each has both primary and secondary)', () => {
    for (const goal of GOALS) {
      const layers = new Set(SUB_GOALS[goal.id].map(sg => sg.layer))
      expect(layers.has('primary'), `${goal.id}: missing primary layer`).toBe(true)
      expect(layers.has('secondary'), `${goal.id}: missing secondary layer`).toBe(true)
    }
  })
})

describe('getSubGoals', () => {
  it('with no layer arg returns all sub-goals for the goal', () => {
    const all = getSubGoals('fat-loss')
    expect(all).toHaveLength(SUB_GOALS['fat-loss'].length)
  })

  it("with layer='primary' returns only primary sub-goals", () => {
    for (const goal of GOALS) {
      const primary = getSubGoals(goal.id, 'primary')
      expect(primary.every(sg => sg.layer === 'primary'), `${goal.id}: non-primary in primary result`).toBe(true)
      expect(primary.length).toBeGreaterThan(0)
    }
  })

  it("with layer='secondary' returns only secondary sub-goals", () => {
    for (const goal of GOALS) {
      const secondary = getSubGoals(goal.id, 'secondary')
      expect(secondary.every(sg => sg.layer === 'secondary'), `${goal.id}: non-secondary in secondary result`).toBe(true)
      expect(secondary.length).toBeGreaterThan(0)
    }
  })

  it('primary + secondary counts sum to total for every goal', () => {
    for (const goal of GOALS) {
      const total     = getSubGoals(goal.id).length
      const primary   = getSubGoals(goal.id, 'primary').length
      const secondary = getSubGoals(goal.id, 'secondary').length
      expect(primary + secondary).toBe(total)
    }
  })

  it('rehab has 5 primary and 5 secondary sub-goals', () => {
    expect(getSubGoals('rehab', 'primary')).toHaveLength(5)
    expect(getSubGoals('rehab', 'secondary')).toHaveLength(5)
  })

  it('fat-loss has 6 primary and 5 secondary sub-goals', () => {
    expect(getSubGoals('fat-loss', 'primary')).toHaveLength(6)
    expect(getSubGoals('fat-loss', 'secondary')).toHaveLength(5)
  })

  it('general has 5 primary and 6 secondary sub-goals', () => {
    expect(getSubGoals('general', 'primary')).toHaveLength(5)
    expect(getSubGoals('general', 'secondary')).toHaveLength(6)
  })

  it('all other goals (17) have exactly 5 primary and 5 secondary sub-goals', () => {
    const exceptionalGoals = ['fat-loss', 'general']
    for (const goal of GOALS.filter(g => !exceptionalGoals.includes(g.id))) {
      expect(getSubGoals(goal.id, 'primary'), `${goal.id}: expected 5 primary`).toHaveLength(5)
      expect(getSubGoals(goal.id, 'secondary'), `${goal.id}: expected 5 secondary`).toHaveLength(5)
    }
  })
})

describe('GOAL_SAFETY_FLAGS', () => {
  it('has an entry for all 19 goals', () => {
    for (const goal of GOALS) {
      expect(GOAL_SAFETY_FLAGS[goal.id]).toBeDefined()
    }
  })

  it('GOAL_SAFETY_FLAGS entries match the inline goal.safetyFlags', () => {
    for (const goal of GOALS) {
      expect(GOAL_SAFETY_FLAGS[goal.id]).toEqual(goal.safetyFlags)
    }
  })
})

describe('LEGACY_GOAL_ALIASES', () => {
  it('covers all 7 legacy live goal IDs', () => {
    const legacyIds = [
      'fat_loss', 'muscle_gain', 'strength', 'general_fitness',
      'rehabilitation', 'sports_performance', 'mobility',
    ]
    for (const id of legacyIds) {
      expect(LEGACY_GOAL_ALIASES[id]).toBeDefined()
    }
  })

  it('every alias target is a real canonical goal ID', () => {
    const canonicalIds = new Set(GOALS.map(g => g.id))
    for (const target of Object.values(LEGACY_GOAL_ALIASES)) {
      expect(canonicalIds.has(target)).toBe(true)
    }
  })
})

describe('LEGACY_SUBGOAL_ALIASES', () => {
  it('covers the legacy fat_loss sub-goals from GoalMultiSelect.tsx', () => {
    expect(LEGACY_SUBGOAL_ALIASES['fat-loss']).toMatchObject({
      weight_loss:    'reduce_total_body_fat',
      fat_percentage: 'reduce_total_body_fat',
      conditioning:   'increase_daily_activity_level',
    })
  })

  it('covers the legacy muscle_gain sub-goals from GoalMultiSelect.tsx', () => {
    expect(LEGACY_SUBGOAL_ALIASES['muscle']).toMatchObject({
      hypertrophy: 'build_lean_muscle_mass',
      lean_mass:   'build_lean_muscle_mass',
      bulking:     'build_lean_muscle_mass',
    })
  })

  it('covers the legacy strength sub-goals from GoalMultiSelect.tsx', () => {
    expect(LEGACY_SUBGOAL_ALIASES['strength']).toMatchObject({
      max_strength: 'increase_1rm_compound_lifts',
      powerlifting: 'increase_1rm_compound_lifts',
    })
  })

  it('covers the legacy rehabilitation sub-goals from GoalMultiSelect.tsx', () => {
    expect(LEGACY_SUBGOAL_ALIASES['rehab']).toMatchObject({
      back_pain:       'reduce_movement_related_pain',
      knee_recovery:   'return_to_sport_or_daily_activity',
      injury_recovery: 'return_to_sport_or_daily_activity',
    })
  })

  it('all alias targets are real canonical sub-goal IDs for the correct goal', () => {
    for (const [goalId, aliases] of Object.entries(LEGACY_SUBGOAL_ALIASES)) {
      for (const [_legacy, canonical] of Object.entries(aliases)) {
        const canonicalIds = SUB_GOALS[goalId as keyof typeof SUB_GOALS].map(sg => sg.id)
        expect(canonicalIds, `${goalId}: alias target "${canonical}" is not a canonical sub-goal`).toContain(canonical)
      }
    }
  })
})

describe('normalizeGoalId', () => {
  it('returns canonical ID unchanged', () => {
    expect(normalizeGoalId('fat-loss')).toBe('fat-loss')
    expect(normalizeGoalId('muscle')).toBe('muscle')
    expect(normalizeGoalId('neuro')).toBe('neuro')
    expect(normalizeGoalId('weight-mgmt')).toBe('weight-mgmt')
  })

  it('normalizes all 7 legacy underscore IDs', () => {
    expect(normalizeGoalId('fat_loss')).toBe('fat-loss')
    expect(normalizeGoalId('muscle_gain')).toBe('muscle')
    expect(normalizeGoalId('rehabilitation')).toBe('rehab')
    expect(normalizeGoalId('sports_performance')).toBe('sports')
    expect(normalizeGoalId('general_fitness')).toBe('general')
    expect(normalizeGoalId('strength')).toBe('strength')
    expect(normalizeGoalId('mobility')).toBe('mobility')
  })

  it('returns null for garbage input', () => {
    expect(normalizeGoalId('not_a_goal')).toBeNull()
    expect(normalizeGoalId('')).toBeNull()
    expect(normalizeGoalId('FAT_LOSS')).toBeNull()
    expect(normalizeGoalId('fat-Loss')).toBeNull()
  })
})

describe('normalizeSubGoalId', () => {
  it('returns canonical sub-goal IDs for known primary IDs', () => {
    expect(normalizeSubGoalId('fat-loss', 'reduce_total_body_fat')).toBe('reduce_total_body_fat')
    expect(normalizeSubGoalId('muscle', 'build_lean_muscle_mass')).toBe('build_lean_muscle_mass')
    expect(normalizeSubGoalId('strength', 'increase_1rm_compound_lifts')).toBe('increase_1rm_compound_lifts')
    expect(normalizeSubGoalId('sports', 'improve_sprint_speed')).toBe('improve_sprint_speed')
  })

  it('returns canonical sub-goal IDs for known secondary IDs', () => {
    expect(normalizeSubGoalId('fat-loss', 'preserve_skeletal_muscle_mass')).toBe('preserve_skeletal_muscle_mass')
    expect(normalizeSubGoalId('muscle', 'accelerate_muscle_protein_synthesis')).toBe('accelerate_muscle_protein_synthesis')
    expect(normalizeSubGoalId('rehab', 'overcome_kinesiophobia')).toBe('overcome_kinesiophobia')
  })

  it('normalizes legacy sub-goal IDs via alias table', () => {
    expect(normalizeSubGoalId('fat-loss', 'weight_loss')).toBe('reduce_total_body_fat')
    expect(normalizeSubGoalId('fat-loss', 'fat_percentage')).toBe('reduce_total_body_fat')
    expect(normalizeSubGoalId('fat-loss', 'conditioning')).toBe('increase_daily_activity_level')
    expect(normalizeSubGoalId('muscle', 'bulking')).toBe('build_lean_muscle_mass')
    expect(normalizeSubGoalId('rehab', 'injury_recovery')).toBe('return_to_sport_or_daily_activity')
  })

  it('returns null for unknown / invalid sub-goal IDs', () => {
    expect(normalizeSubGoalId('aging', 'unknown_sub')).toBeNull()
    expect(normalizeSubGoalId('sports', 'nonexistent')).toBeNull()
    expect(normalizeSubGoalId('fat-loss', '')).toBeNull()
  })
})

describe('isIntakeGoalId', () => {
  it('returns true for all 19 canonical IDs', () => {
    for (const goal of GOALS) {
      expect(isIntakeGoalId(goal.id)).toBe(true)
    }
  })

  it('returns false for legacy IDs and garbage', () => {
    expect(isIntakeGoalId('fat_loss')).toBe(false)
    expect(isIntakeGoalId('rehabilitation')).toBe(false)
    expect(isIntakeGoalId('muscle_gain')).toBe(false)
    expect(isIntakeGoalId('garbage')).toBe(false)
    expect(isIntakeGoalId('')).toBe(false)
  })
})

describe('getGoal', () => {
  it('returns the correct goal for a valid ID', () => {
    const goal = getGoal('fat-loss')
    expect(goal.id).toBe('fat-loss')
    expect(goal.label).toBe('Fat Loss')
    expect(goal.section).toBe('core')
  })

  it('throws for an unknown ID', () => {
    // @ts-expect-error intentional invalid input for test coverage
    expect(() => getGoal('not_a_goal')).toThrow()
  })
})

describe('getGoalsBySection', () => {
  it('returns 8 core goals', () => {
    expect(getGoalsBySection('core')).toHaveLength(8)
  })

  it('returns 8 specialist goals', () => {
    expect(getGoalsBySection('specialist')).toHaveLength(8)
  })

  it('returns 3 emerging goals', () => {
    expect(getGoalsBySection('emerging')).toHaveLength(3)
  })
})

describe('normalizeUrgency', () => {
  it("'warm' normalizes to 'active_focus'", () => {
    expect(normalizeUrgency('warm')).toBe('active_focus')
  })

  it("canonical values pass through unchanged", () => {
    expect(normalizeUrgency('urgent')).toBe('urgent')
    expect(normalizeUrgency('active_focus')).toBe('active_focus')
    expect(normalizeUrgency('background')).toBe('background')
  })

  it("unknown values default to 'active_focus'", () => {
    expect(normalizeUrgency('HIGH')).toBe('active_focus')
    expect(normalizeUrgency('')).toBe('active_focus')
    expect(normalizeUrgency('focus')).toBe('active_focus')
  })
})
