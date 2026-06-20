import { describe, it, expect } from 'vitest'
import {
  PROGRAM_GOALS,
  INTAKE_GOAL_PROGRAM_MAP,
  resolveProgramGoal,
} from '../mapping'
import { GOALS } from '../taxonomy'

describe('PROGRAM_GOALS', () => {
  it('has exactly 12 values', () => {
    expect(PROGRAM_GOALS).toHaveLength(12)
  })

  it('all ProgramGoal values are unique', () => {
    expect(new Set(PROGRAM_GOALS).size).toBe(PROGRAM_GOALS.length)
  })

  it('includes youth_physical_literacy', () => {
    expect(PROGRAM_GOALS).toContain('youth_physical_literacy')
  })

  it('includes neuro_centric_movement', () => {
    expect(PROGRAM_GOALS).toContain('neuro_centric_movement')
  })
})

describe('INTAKE_GOAL_PROGRAM_MAP', () => {
  it('covers all 19 intake goals', () => {
    for (const goal of GOALS) {
      expect(INTAKE_GOAL_PROGRAM_MAP[goal.id]).toBeDefined()
    }
  })

  it('mapping confidence counts are exactly 12 direct / 7 approximate / 0 unsupported', () => {
    const mappings    = Object.values(INTAKE_GOAL_PROGRAM_MAP)
    const direct      = mappings.filter(m => m.mappingConfidence === 'direct').length
    const approximate = mappings.filter(m => m.mappingConfidence === 'approximate').length
    const unsupported = mappings.filter(m => m.mappingConfidence === 'unsupported').length
    expect(direct).toBe(12)
    expect(approximate).toBe(7)
    expect(unsupported).toBe(0)
  })

  it('all programGoal values are valid ProgramGoal values', () => {
    const validSet = new Set(PROGRAM_GOALS)
    for (const mapping of Object.values(INTAKE_GOAL_PROGRAM_MAP)) {
      expect(validSet.has(mapping.programGoal)).toBe(true)
    }
  })

  it('every mapping has intakeGoalId matching its map key', () => {
    for (const [key, mapping] of Object.entries(INTAKE_GOAL_PROGRAM_MAP)) {
      expect(mapping.intakeGoalId).toBe(key)
    }
  })

  it('youth maps to youth_physical_literacy with direct confidence', () => {
    expect(INTAKE_GOAL_PROGRAM_MAP['youth'].programGoal).toBe('youth_physical_literacy')
    expect(INTAKE_GOAL_PROGRAM_MAP['youth'].mappingConfidence).toBe('direct')
  })

  it('neuro maps to neuro_centric_movement with direct confidence', () => {
    expect(INTAKE_GOAL_PROGRAM_MAP['neuro'].programGoal).toBe('neuro_centric_movement')
    expect(INTAKE_GOAL_PROGRAM_MAP['neuro'].mappingConfidence).toBe('direct')
  })

  it('the 7 approximate goals are: mental, cardio, functional, aesthetics, weight-mgmt, aging, underweight', () => {
    const approxIds = Object.values(INTAKE_GOAL_PROGRAM_MAP)
      .filter(m => m.mappingConfidence === 'approximate')
      .map(m => m.intakeGoalId)
      .sort()
    expect(approxIds).toEqual(['aesthetics', 'aging', 'cardio', 'functional', 'mental', 'underweight', 'weight-mgmt'])
  })

  it('every approximate mapping has a non-empty programmingBias', () => {
    for (const mapping of Object.values(INTAKE_GOAL_PROGRAM_MAP)) {
      if (mapping.mappingConfidence === 'approximate') {
        expect(mapping.programmingBias, `${mapping.intakeGoalId}: missing programmingBias`).toBeDefined()
        expect(mapping.programmingBias!.length, `${mapping.intakeGoalId}: empty programmingBias`).toBeGreaterThan(0)
      }
    }
  })

  it('every approximate mapping has a non-empty generationNotes', () => {
    for (const mapping of Object.values(INTAKE_GOAL_PROGRAM_MAP)) {
      if (mapping.mappingConfidence === 'approximate') {
        expect(mapping.generationNotes, `${mapping.intakeGoalId}: missing generationNotes`).toBeDefined()
        expect(mapping.generationNotes!.length, `${mapping.intakeGoalId}: empty generationNotes`).toBeGreaterThan(0)
      }
    }
  })

  it('every approximate mapping has a non-empty futureUpgradePath', () => {
    for (const mapping of Object.values(INTAKE_GOAL_PROGRAM_MAP)) {
      if (mapping.mappingConfidence === 'approximate') {
        expect(mapping.futureUpgradePath, `${mapping.intakeGoalId}: missing futureUpgradePath`).toBeDefined()
        expect(mapping.futureUpgradePath!.length, `${mapping.intakeGoalId}: empty futureUpgradePath`).toBeGreaterThan(0)
      }
    }
  })

  it('no new ProgramGoal enum values were added for the 7 approximate mappings — they share existing direct values', () => {
    const directProgramGoals = new Set(
      Object.values(INTAKE_GOAL_PROGRAM_MAP)
        .filter(m => m.mappingConfidence === 'direct')
        .map(m => m.programGoal)
    )
    for (const mapping of Object.values(INTAKE_GOAL_PROGRAM_MAP)) {
      if (mapping.mappingConfidence === 'approximate') {
        expect(
          directProgramGoals.has(mapping.programGoal),
          `${mapping.intakeGoalId}: approximate mapping uses ProgramGoal "${mapping.programGoal}" not found in direct mappings`
        ).toBe(true)
      }
    }
  })

  it('direct mappings have no programmingBias (they are unambiguous)', () => {
    for (const mapping of Object.values(INTAKE_GOAL_PROGRAM_MAP)) {
      if (mapping.mappingConfidence === 'direct') {
        expect(mapping.programmingBias).toBeUndefined()
      }
    }
  })
})

describe('resolveProgramGoal', () => {
  it('returns base program goal for direct mappings', () => {
    expect(resolveProgramGoal('fat-loss')).toBe('fat_loss')
    expect(resolveProgramGoal('muscle')).toBe('hypertrophy')
    expect(resolveProgramGoal('strength')).toBe('powerlifting_strength')
    expect(resolveProgramGoal('rehab')).toBe('rehab_return_to_training')
    expect(resolveProgramGoal('sports')).toBe('sports_performance')
    expect(resolveProgramGoal('mobility')).toBe('mobility')
    expect(resolveProgramGoal('general')).toBe('general_fitness')
    expect(resolveProgramGoal('postnatal')).toBe('postnatal_core_reconditioning')
    expect(resolveProgramGoal('glp1')).toBe('glp1_muscle_preservation')
    expect(resolveProgramGoal('longevity')).toBe('longevity')
  })

  it('returns base program goal for approximate mappings', () => {
    expect(resolveProgramGoal('cardio')).toBe('general_fitness')
    expect(resolveProgramGoal('aging')).toBe('longevity')
    expect(resolveProgramGoal('functional')).toBe('general_fitness')
    expect(resolveProgramGoal('weight-mgmt')).toBe('fat_loss')
    expect(resolveProgramGoal('mental')).toBe('general_fitness')
    expect(resolveProgramGoal('underweight')).toBe('hypertrophy')
  })

  it('returns dedicated ProgramGoal values for youth and neuro', () => {
    expect(resolveProgramGoal('youth')).toBe('youth_physical_literacy')
    expect(resolveProgramGoal('neuro')).toBe('neuro_centric_movement')
  })

  it('sub-goal refinement: aesthetics + achieve_low_target_body_fat_pct → fat_loss (canonical)', () => {
    expect(resolveProgramGoal('aesthetics', ['achieve_low_target_body_fat_pct'])).toBe('fat_loss')
  })

  it('sub-goal refinement: aesthetics + achieve_competition_physique → fat_loss (canonical)', () => {
    expect(resolveProgramGoal('aesthetics', ['achieve_competition_physique'])).toBe('fat_loss')
  })

  it('sub-goal refinement: aesthetics + photo_shoot_prep → fat_loss (legacy backward compat)', () => {
    expect(resolveProgramGoal('aesthetics', ['photo_shoot_prep'])).toBe('fat_loss')
  })

  it('aesthetics without cut-focused sub-goal → hypertrophy', () => {
    expect(resolveProgramGoal('aesthetics')).toBe('hypertrophy')
    expect(resolveProgramGoal('aesthetics', [])).toBe('hypertrophy')
    expect(resolveProgramGoal('aesthetics', ['bodybuilding'])).toBe('hypertrophy')
    expect(resolveProgramGoal('aesthetics', ['physique_competition'])).toBe('hypertrophy')
  })
})
