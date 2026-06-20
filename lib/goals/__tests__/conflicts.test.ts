import { describe, it, expect } from 'vitest'
import {
  detectConflicts,
  hasUnresolvedHardConflict,
  GOAL_CONFLICT_RULES,
} from '../conflicts'
import { isIntakeGoalId } from '../taxonomy'
import type { IntakeGoalId } from '../taxonomy'

describe('GOAL_CONFLICT_RULES structure', () => {
  it('every rule has a pair of two valid IntakeGoalIds', () => {
    for (const rule of GOAL_CONFLICT_RULES) {
      expect(rule.pair).toHaveLength(2)
      expect(isIntakeGoalId(rule.pair[0]), `"${rule.pair[0]}" is not a valid IntakeGoalId`).toBe(true)
      expect(isIntakeGoalId(rule.pair[1]), `"${rule.pair[1]}" is not a valid IntakeGoalId`).toBe(true)
    }
  })

  it('every rule has a non-empty message', () => {
    for (const rule of GOAL_CONFLICT_RULES) {
      expect(rule.message.length).toBeGreaterThan(0)
    }
  })

  it('every rule has a structured resolution object (not opaque string)', () => {
    for (const rule of GOAL_CONFLICT_RULES) {
      expect(rule.resolution, `rule ${rule.pair}: missing resolution`).toBeDefined()
      expect(typeof rule.resolution).toBe('object')
    }
  })

  it('no rule uses opaque string-only resolutionAction', () => {
    for (const rule of GOAL_CONFLICT_RULES) {
      expect('resolutionAction' in rule.resolution).toBe(false)
    }
  })

  it('every resolution has an actionType from the allowed union', () => {
    const allowed = ['suggest_goal_bundle', 'suggest_primary_goal_change', 'show_warning', 'block_combination']
    for (const rule of GOAL_CONFLICT_RULES) {
      expect(allowed, `rule ${rule.pair}: invalid actionType "${rule.resolution.actionType}"`).toContain(rule.resolution.actionType)
    }
  })

  it('every resolution has a non-empty message', () => {
    for (const rule of GOAL_CONFLICT_RULES) {
      expect(rule.resolution.message.length, `rule ${rule.pair}: empty resolution message`).toBeGreaterThan(0)
    }
  })

  it('soft conflicts use non-blocking actionTypes', () => {
    const softAllowed = ['suggest_goal_bundle', 'suggest_primary_goal_change', 'show_warning']
    for (const rule of GOAL_CONFLICT_RULES.filter(r => r.type === 'soft')) {
      expect(softAllowed, `soft rule ${rule.pair}: unexpected actionType "${rule.resolution.actionType}"`).toContain(rule.resolution.actionType)
    }
  })

  it('hard conflicts use block_combination', () => {
    for (const rule of GOAL_CONFLICT_RULES.filter(r => r.type === 'hard')) {
      expect(rule.resolution.actionType).toBe('block_combination')
    }
  })

  it('suggestedGoalIds entries are all valid IntakeGoalIds', () => {
    for (const rule of GOAL_CONFLICT_RULES) {
      for (const goalId of rule.resolution.suggestedGoalIds ?? []) {
        expect(isIntakeGoalId(goalId), `"${goalId}" in suggestedGoalIds is not a valid IntakeGoalId`).toBe(true)
      }
    }
  })

  it('suggestedPrimaryGoalId, when present, is a valid IntakeGoalId', () => {
    for (const rule of GOAL_CONFLICT_RULES) {
      if (rule.resolution.suggestedPrimaryGoalId !== undefined) {
        expect(
          isIntakeGoalId(rule.resolution.suggestedPrimaryGoalId),
          `"${rule.resolution.suggestedPrimaryGoalId}" is not a valid IntakeGoalId`
        ).toBe(true)
      }
    }
  })
})

describe('detectConflicts', () => {
  it('detects soft conflict: fat-loss + muscle', () => {
    const results = detectConflicts(['fat-loss', 'muscle'])
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('soft')
    expect(results[0].goals).toContain('fat-loss')
    expect(results[0].goals).toContain('muscle')
  })

  it('detects soft conflict: fat-loss + aesthetics', () => {
    const results = detectConflicts(['fat-loss', 'aesthetics'])
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('soft')
    expect(results[0].goals).toContain('fat-loss')
    expect(results[0].goals).toContain('aesthetics')
  })

  it('detects soft conflict: weight-mgmt + muscle', () => {
    const results = detectConflicts(['weight-mgmt', 'muscle'])
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('soft')
    expect(results[0].goals).toContain('weight-mgmt')
    expect(results[0].goals).toContain('muscle')
  })

  it('detects hard conflict: underweight + fat-loss', () => {
    const results = detectConflicts(['underweight', 'fat-loss'])
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('hard')
    expect(results[0].goals).toContain('underweight')
    expect(results[0].goals).toContain('fat-loss')
  })

  it('detects 3 soft + 1 hard when all conflict pairs are present', () => {
    const goalIds: IntakeGoalId[] = ['fat-loss', 'muscle', 'aesthetics', 'weight-mgmt', 'underweight']
    const results = detectConflicts(goalIds)
    const soft = results.filter(r => r.type === 'soft')
    const hard = results.filter(r => r.type === 'hard')
    expect(soft).toHaveLength(3)
    expect(hard).toHaveLength(1)
  })

  it('is order-independent', () => {
    const fwd = detectConflicts(['fat-loss', 'muscle'])
    const rev = detectConflicts(['muscle', 'fat-loss'])
    expect(fwd).toHaveLength(rev.length)
    expect(fwd[0].type).toBe(rev[0].type)
    expect(new Set(fwd[0].goals)).toEqual(new Set(rev[0].goals))
  })

  it('returns empty array for safe combinations', () => {
    expect(detectConflicts(['fat-loss', 'cardio'])).toHaveLength(0)
    expect(detectConflicts(['strength', 'sports'])).toHaveLength(0)
    expect(detectConflicts(['mobility', 'general'])).toHaveLength(0)
    expect(detectConflicts(['fat-loss'])).toHaveLength(0)
    expect(detectConflicts([])).toHaveLength(0)
  })

  it('every conflict result has a non-empty message', () => {
    const goalIds: IntakeGoalId[] = ['fat-loss', 'muscle', 'aesthetics', 'weight-mgmt', 'underweight']
    for (const result of detectConflicts(goalIds)) {
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it('every conflict result has a structured resolution propagated from the rule', () => {
    const goalIds: IntakeGoalId[] = ['fat-loss', 'muscle', 'aesthetics', 'weight-mgmt', 'underweight']
    for (const result of detectConflicts(goalIds)) {
      expect(result.resolution).toBeDefined()
      expect(typeof result.resolution.actionType).toBe('string')
      expect(result.resolution.message.length).toBeGreaterThan(0)
    }
  })
})

describe('hasUnresolvedHardConflict', () => {
  it('returns true when underweight + fat-loss are both present', () => {
    expect(hasUnresolvedHardConflict(['underweight', 'fat-loss'])).toBe(true)
    expect(hasUnresolvedHardConflict(['fat-loss', 'underweight'])).toBe(true)
  })

  it('returns false for soft-only conflicts', () => {
    expect(hasUnresolvedHardConflict(['fat-loss', 'muscle'])).toBe(false)
    expect(hasUnresolvedHardConflict(['fat-loss', 'aesthetics'])).toBe(false)
    expect(hasUnresolvedHardConflict(['weight-mgmt', 'muscle'])).toBe(false)
  })

  it('returns false for safe combinations and empty arrays', () => {
    expect(hasUnresolvedHardConflict(['strength', 'sports'])).toBe(false)
    expect(hasUnresolvedHardConflict(['mobility'])).toBe(false)
    expect(hasUnresolvedHardConflict([])).toBe(false)
  })
})
