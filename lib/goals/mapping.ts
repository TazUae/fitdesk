import type { IntakeGoalId } from './taxonomy'

export type ProgramGoal =
  | 'powerlifting_strength'
  | 'hypertrophy'
  | 'fat_loss'
  | 'rehab_return_to_training'
  | 'postnatal_core_reconditioning'
  | 'sports_performance'
  | 'general_fitness'
  | 'mobility'
  | 'longevity'
  | 'glp1_muscle_preservation'
  | 'youth_physical_literacy'
  | 'neuro_centric_movement'

export type MappingConfidence = 'direct' | 'approximate' | 'unsupported'

export interface GoalProgramMapping {
  intakeGoalId:       IntakeGoalId
  programGoal:        ProgramGoal
  mappingConfidence:  MappingConfidence
  programmingBias?:   string
  generationNotes?:   string
  futureUpgradePath?: string
}

export const PROGRAM_GOALS: readonly ProgramGoal[] = [
  'powerlifting_strength',
  'hypertrophy',
  'fat_loss',
  'rehab_return_to_training',
  'postnatal_core_reconditioning',
  'sports_performance',
  'general_fitness',
  'mobility',
  'longevity',
  'glp1_muscle_preservation',
  'youth_physical_literacy',
  'neuro_centric_movement',
]

// All mapping logic lives here — no scattered inline conditionals elsewhere.
export const INTAKE_GOAL_PROGRAM_MAP: Record<IntakeGoalId, GoalProgramMapping> = {

  // ── Direct mappings (12) ──────────────────────────────────────────────────────
  'fat-loss':  { intakeGoalId: 'fat-loss',  programGoal: 'fat_loss',                     mappingConfidence: 'direct' },
  'muscle':    { intakeGoalId: 'muscle',    programGoal: 'hypertrophy',                  mappingConfidence: 'direct' },
  'strength':  { intakeGoalId: 'strength',  programGoal: 'powerlifting_strength',         mappingConfidence: 'direct' },
  'rehab':     { intakeGoalId: 'rehab',     programGoal: 'rehab_return_to_training',      mappingConfidence: 'direct' },
  'sports':    { intakeGoalId: 'sports',    programGoal: 'sports_performance',            mappingConfidence: 'direct' },
  'mobility':  { intakeGoalId: 'mobility',  programGoal: 'mobility',                     mappingConfidence: 'direct' },
  'general':   { intakeGoalId: 'general',   programGoal: 'general_fitness',               mappingConfidence: 'direct' },
  'postnatal': { intakeGoalId: 'postnatal', programGoal: 'postnatal_core_reconditioning', mappingConfidence: 'direct' },
  'glp1':      { intakeGoalId: 'glp1',      programGoal: 'glp1_muscle_preservation',      mappingConfidence: 'direct' },
  'longevity': { intakeGoalId: 'longevity', programGoal: 'longevity',                     mappingConfidence: 'direct' },
  'youth':     { intakeGoalId: 'youth',     programGoal: 'youth_physical_literacy',       mappingConfidence: 'direct' },
  'neuro':     { intakeGoalId: 'neuro',     programGoal: 'neuro_centric_movement',        mappingConfidence: 'direct' },

  // ── Approximate mappings (7) — no new ProgramGoal values; programmingBias carries intent ──

  'mental': {
    intakeGoalId:      'mental',
    programGoal:       'general_fitness',
    mappingConfidence: 'approximate',
    programmingBias:   'stress_resilience_recovery_adherence',
    generationNotes:   'Sessions prioritize HRV-friendly intensity, endorphin-optimal cardio volume, and adherence consistency over peak output. No competitive lifting templates.',
    futureUpgradePath: 'Dedicated mental_wellness program goal if coaching library develops a distinct session format.',
  },
  'cardio': {
    intakeGoalId:      'cardio',
    programGoal:       'general_fitness',
    mappingConfidence: 'approximate',
    programmingBias:   'cardiovascular_endurance',
    generationNotes:   'Sessions skew toward Zone 2 aerobic base, progressive distance/duration targets, and VO2 max tracking. Strength volume is secondary.',
    futureUpgradePath: 'Dedicated cardio_endurance program goal if endurance programming becomes specialized enough to warrant a separate template library.',
  },
  'functional': {
    intakeGoalId:      'functional',
    programGoal:       'general_fitness',
    mappingConfidence: 'approximate',
    programmingBias:   'movement_quality_daily_function',
    generationNotes:   'Sessions emphasize compound movement patterns, carry drills, floor-to-stand progressions, and gait-quality metrics. Aesthetic goals absent.',
    futureUpgradePath: 'Dedicated functional_fitness program goal if templates diverge enough from general fitness to require a separate track.',
  },
  'aesthetics': {
    intakeGoalId:      'aesthetics',
    programGoal:       'hypertrophy',
    mappingConfidence: 'approximate',
    programmingBias:   'physique_definition_symmetry',
    generationNotes:   'Sessions emphasize visual body composition over raw strength — higher volume, moderate intensity, pose-aware exercise selection. When achieve_low_target_body_fat_pct or achieve_competition_physique sub-goals are selected, the generator applies fat_loss intensity biasing.',
    futureUpgradePath: 'Dedicated aesthetics_physique program goal if competition-prep and visual workflows become distinct from muscle-gain programming.',
  },
  'weight-mgmt': {
    intakeGoalId:      'weight-mgmt',
    programGoal:       'fat_loss',
    mappingConfidence: 'approximate',
    programmingBias:   'weight_behavior_maintenance',
    generationNotes:   'Sessions target sustainable habit-building, NEAT increase, and metabolic flexibility rather than aggressive deficit phases. Intensity is moderate; adherence and long-term weight stability are the primary success metrics.',
    futureUpgradePath: 'Dedicated weight_management program goal if maintenance/recomposition templates diverge meaningfully from fat-loss templates.',
  },
  'aging': {
    intakeGoalId:      'aging',
    programGoal:       'longevity',
    mappingConfidence: 'approximate',
    programmingBias:   'older_adult_function_independence',
    generationNotes:   'Sessions prioritize balance, fall prevention, functional strength, and bone density over power or aesthetic output. Intensity scaling must accommodate older-adult recovery rates.',
    futureUpgradePath: 'Stay under longevity unless older-adult programming needs a completely separate template library.',
  },
  'underweight': {
    intakeGoalId:      'underweight',
    programGoal:       'hypertrophy',
    mappingConfidence: 'approximate',
    programmingBias:   'healthy_weight_gain_strength_foundation',
    generationNotes:   'Sessions skew toward progressive overload for structural hypertrophy, caloric surplus support, and conservative volume progression. The session generator must not prescribe deficit phases or fat-loss cardio for this bias.',
    futureUpgradePath: 'Dedicated healthy_weight_gain program goal if nutrition-integrated programming or clinical muscle-wasting workflows become distinct.',
  },
}

export function resolveProgramGoal(goalId: IntakeGoalId, subGoalIds: string[] = []): ProgramGoal {
  const base = INTAKE_GOAL_PROGRAM_MAP[goalId].programGoal

  // Aesthetics with a cut-focused sub-goal shifts to fat_loss program.
  // Canonical IDs: achieve_low_target_body_fat_pct, achieve_competition_physique.
  // Legacy alias retained for backward compat: photo_shoot_prep.
  if (goalId === 'aesthetics' && (
    subGoalIds.includes('achieve_low_target_body_fat_pct') ||
    subGoalIds.includes('achieve_competition_physique') ||
    subGoalIds.includes('photo_shoot_prep')
  )) {
    return 'fat_loss'
  }

  return base
}
