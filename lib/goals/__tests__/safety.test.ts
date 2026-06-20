import { describe, it, expect } from 'vitest'
import { computeSafetyFlags, deriveSafetyState } from '../safety'

describe('computeSafetyFlags', () => {
  it('rehab goal produces injury_risk flag', () => {
    const flags = computeSafetyFlags(['rehab'])
    expect(flags).toHaveLength(1)
    expect(flags[0].id).toBe('injury_risk')
    expect(flags[0].goalId).toBe('rehab')
  })

  it('postnatal goal produces prenatal_postnatal flag', () => {
    const flags = computeSafetyFlags(['postnatal'])
    expect(flags).toHaveLength(1)
    expect(flags[0].id).toBe('prenatal_postnatal')
    expect(flags[0].goalId).toBe('postnatal')
  })

  it('neuro goal produces neurological flag', () => {
    const flags = computeSafetyFlags(['neuro'])
    expect(flags).toHaveLength(1)
    expect(flags[0].id).toBe('neurological')
    expect(flags[0].goalId).toBe('neuro')
  })

  it('youth goal produces youth_client flag', () => {
    const flags = computeSafetyFlags(['youth'])
    expect(flags).toHaveLength(1)
    expect(flags[0].id).toBe('youth_client')
    expect(flags[0].goalId).toBe('youth')
  })

  it('glp1 goal produces glp1_medication flag', () => {
    const flags = computeSafetyFlags(['glp1'])
    expect(flags).toHaveLength(1)
    expect(flags[0].id).toBe('glp1_medication')
    expect(flags[0].goalId).toBe('glp1')
  })

  it('safe goals produce no safety flags', () => {
    expect(computeSafetyFlags(['fat-loss'])).toHaveLength(0)
    expect(computeSafetyFlags(['muscle'])).toHaveLength(0)
    expect(computeSafetyFlags(['strength', 'cardio', 'general'])).toHaveLength(0)
    expect(computeSafetyFlags(['mobility', 'mental', 'aesthetics', 'aging', 'functional', 'weight-mgmt', 'underweight'])).toHaveLength(0)
    expect(computeSafetyFlags([])).toHaveLength(0)
  })

  it('multiple flagged goals produce one flag each', () => {
    const flags = computeSafetyFlags(['rehab', 'postnatal'])
    expect(flags).toHaveLength(2)
    const flagIds = flags.map(f => f.id)
    expect(flagIds).toContain('injury_risk')
    expect(flagIds).toContain('prenatal_postnatal')
  })

  it('all 5 safety-sensitive goals together produce 5 flags', () => {
    const flags = computeSafetyFlags(['rehab', 'postnatal', 'neuro', 'youth', 'glp1'])
    expect(flags).toHaveLength(5)
  })

  it('does not produce duplicate flags', () => {
    const flags = computeSafetyFlags(['rehab', 'fat-loss', 'muscle', 'rehab'])
    const flagIds = flags.map(f => f.id)
    expect(new Set(flagIds).size).toBe(flagIds.length)
  })

  it('every flag has a non-empty meaning string', () => {
    const flags = computeSafetyFlags(['rehab', 'postnatal', 'neuro', 'youth', 'glp1'])
    for (const flag of flags) {
      expect(flag.meaning.length).toBeGreaterThan(0)
    }
  })
})

describe('deriveSafetyState', () => {
  it("returns 'clear' when no flags", () => {
    expect(deriveSafetyState([])).toBe('clear')
  })

  it("returns 'needs_review' when any flag is present", () => {
    const flags = computeSafetyFlags(['rehab'])
    expect(deriveSafetyState(flags)).toBe('needs_review')
  })

  it("returns 'needs_review' for each individual safety-sensitive goal", () => {
    expect(deriveSafetyState(computeSafetyFlags(['postnatal']))).toBe('needs_review')
    expect(deriveSafetyState(computeSafetyFlags(['neuro']))).toBe('needs_review')
    expect(deriveSafetyState(computeSafetyFlags(['youth']))).toBe('needs_review')
    expect(deriveSafetyState(computeSafetyFlags(['glp1']))).toBe('needs_review')
  })

  it("never returns 'blocked_downstream' in Phase 4A", () => {
    const allFlaggedGoals = computeSafetyFlags(['rehab', 'postnatal', 'neuro', 'youth', 'glp1'])
    expect(deriveSafetyState(allFlaggedGoals)).not.toBe('blocked_downstream')
  })

  it("safe goals lead to 'clear' state", () => {
    const flags = computeSafetyFlags(['fat-loss', 'muscle', 'strength', 'general'])
    expect(deriveSafetyState(flags)).toBe('clear')
  })
})
