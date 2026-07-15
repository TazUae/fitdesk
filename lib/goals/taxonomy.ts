export type GoalSection = 'core' | 'specialist' | 'emerging'

export type GoalSafetyFlagId =
  | 'injury_risk'
  | 'prenatal_postnatal'
  | 'neurological'
  | 'youth_client'
  | 'glp1_medication'

export type IntakeGoalId =
  | 'fat-loss' | 'muscle' | 'strength' | 'general' | 'rehab' | 'sports'
  | 'mobility' | 'mental' | 'cardio' | 'aesthetics' | 'aging' | 'functional'
  | 'weight-mgmt' | 'postnatal' | 'youth' | 'underweight'
  | 'glp1' | 'longevity' | 'neuro'

/**
 * Sub-goal layer distinguishes how a sub-goal enters the client record.
 *   primary   — client-stated during Add Client intake (stored in sub_goal_ids_json)
 *   secondary — trainer-assessed during consultation / assessment (stored in trainer_sub_goal_ids_json)
 */
export type SubGoalLayer = 'primary' | 'secondary'

export interface Goal {
  id:          IntakeGoalId
  label:       string
  section:     GoalSection
  safetyFlags: GoalSafetyFlagId[]
}

export interface SubGoal {
  id:     string
  goalId: IntakeGoalId
  label:  string
  layer:  SubGoalLayer
}

export const GOALS: readonly Goal[] = [
  // Core (8)
  { id: 'fat-loss',    label: 'Fat Loss',                          section: 'core',       safetyFlags: [] },
  { id: 'muscle',      label: 'Muscle Gain',                       section: 'core',       safetyFlags: [] },
  { id: 'strength',    label: 'Strength & Power',                  section: 'core',       safetyFlags: [] },
  { id: 'general',     label: 'General Fitness',                   section: 'core',       safetyFlags: [] },
  { id: 'rehab',       label: 'Rehabilitation & Recovery',         section: 'core',       safetyFlags: ['injury_risk'] },
  { id: 'sports',      label: 'Sports Performance',                section: 'core',       safetyFlags: [] },
  { id: 'mobility',    label: 'Mobility & Flexibility',            section: 'core',       safetyFlags: [] },
  { id: 'mental',      label: 'Mental Performance & Focus',        section: 'core',       safetyFlags: [] },
  // Specialist (8)
  { id: 'cardio',      label: 'Cardiovascular Fitness',            section: 'specialist', safetyFlags: [] },
  { id: 'aesthetics',  label: 'Aesthetics & Body Composition',     section: 'specialist', safetyFlags: [] },
  { id: 'aging',       label: 'Healthy Aging',                     section: 'specialist', safetyFlags: [] },
  { id: 'functional',  label: 'Functional Fitness',                section: 'specialist', safetyFlags: [] },
  { id: 'weight-mgmt', label: 'Weight Management',                 section: 'specialist', safetyFlags: [] },
  { id: 'postnatal',   label: 'Pre & Postnatal Fitness',           section: 'specialist', safetyFlags: ['prenatal_postnatal'] },
  { id: 'youth',       label: 'Youth Physical Literacy',           section: 'specialist', safetyFlags: ['youth_client'] },
  { id: 'underweight', label: 'Safe Weight Gain',                  section: 'specialist', safetyFlags: [] },
  // Emerging (3)
  { id: 'glp1',        label: 'GLP-1 Support & Muscle Preservation', section: 'emerging', safetyFlags: ['glp1_medication'] },
  { id: 'longevity',   label: 'Longevity & Healthspan',              section: 'emerging', safetyFlags: [] },
  { id: 'neuro',       label: 'Neuro-Centric Movement',              section: 'emerging', safetyFlags: ['neurological'] },
]

export const GOAL_SECTIONS: readonly GoalSection[] = ['core', 'specialist', 'emerging']

// ─── Sub-goal catalog ─────────────────────────────────────────────────────────
//
// Source: docs/research/FITDESK_GOAL_SYSTEM_FULL_SOURCE.md
//   primary   = 96  (fat-loss: 6; all others: 5 each)
//   secondary = 96  (general: 6; all others: 5 each)
//   total     = 192

export const SUB_GOALS: Record<IntakeGoalId, SubGoal[]> = {

  // ── Core ──────────────────────────────────────────────────────────────────

  'fat-loss': [
    // primary (client-stated) — 6 entries
    { id: 'reduce_total_body_fat',              goalId: 'fat-loss', label: 'Reduce total body fat',                         layer: 'primary'   },
    { id: 'improve_visible_muscle_definition',  goalId: 'fat-loss', label: 'Improve visible muscle definition',             layer: 'primary'   },
    { id: 'increase_daily_activity_level',      goalId: 'fat-loss', label: 'Increase daily activity level',                 layer: 'primary'   },
    { id: 'improve_nutrition_habits',           goalId: 'fat-loss', label: 'Improve nutrition habits',                      layer: 'primary'   },
    { id: 'boost_daily_energy_levels',          goalId: 'fat-loss', label: 'Boost daily energy levels',                     layer: 'primary'   },
    { id: 'track_visceral_fat_reduction',       goalId: 'fat-loss', label: 'Track visceral fat reduction',                  layer: 'primary'   },
    // secondary (trainer-assessed) — 5 entries
    { id: 'preserve_skeletal_muscle_mass',      goalId: 'fat-loss', label: 'Preserve skeletal muscle mass',                 layer: 'secondary' },
    { id: 'improve_insulin_sensitivity',        goalId: 'fat-loss', label: 'Improve insulin sensitivity',                   layer: 'secondary' },
    { id: 'manage_cortisol_stress_eating',      goalId: 'fat-loss', label: 'Manage cortisol and stress eating',             layer: 'secondary' },
    { id: 'regulate_postprandial_glucose',      goalId: 'fat-loss', label: 'Regulate postprandial glucose',                 layer: 'secondary' },
    { id: 'maintain_resting_metabolic_rate',    goalId: 'fat-loss', label: 'Maintain resting metabolic rate',               layer: 'secondary' },
  ],

  'muscle': [
    // primary — 5 entries
    { id: 'build_lean_muscle_mass',             goalId: 'muscle', label: 'Build lean muscle mass',                          layer: 'primary'   },
    { id: 'improve_overall_body_shape',         goalId: 'muscle', label: 'Improve overall body shape',                      layer: 'primary'   },
    { id: 'increase_training_volume',           goalId: 'muscle', label: 'Increase training volume',                        layer: 'primary'   },
    { id: 'target_lagging_muscle_groups',       goalId: 'muscle', label: 'Target lagging muscle groups',                    layer: 'primary'   },
    { id: 'improve_body_symmetry',              goalId: 'muscle', label: 'Improve body symmetry',                           layer: 'primary'   },
    // secondary — 5 entries
    { id: 'accelerate_muscle_protein_synthesis', goalId: 'muscle', label: 'Accelerate muscle protein synthesis',           layer: 'secondary' },
    { id: 'improve_mind_muscle_connection',     goalId: 'muscle', label: 'Improve mind-muscle connection',                  layer: 'secondary' },
    { id: 'reduce_junk_volume',                 goalId: 'muscle', label: 'Reduce junk volume',                              layer: 'secondary' },
    { id: 'optimise_myofibrillar_density',      goalId: 'muscle', label: 'Optimise myofibrillar density',                   layer: 'secondary' },
    { id: 'optimise_sleep_for_recovery',        goalId: 'muscle', label: 'Optimise sleep for recovery',                     layer: 'secondary' },
  ],

  'strength': [
    // primary — 5 entries
    { id: 'increase_1rm_compound_lifts',        goalId: 'strength', label: 'Increase 1RM on compound lifts',               layer: 'primary'   },
    { id: 'feel_physically_stronger',           goalId: 'strength', label: 'Feel physically stronger',                     layer: 'primary'   },
    { id: 'improve_bar_technique',              goalId: 'strength', label: 'Improve bar technique',                        layer: 'primary'   },
    { id: 'build_core_strength',                goalId: 'strength', label: 'Build core strength',                          layer: 'primary'   },
    { id: 'improve_grip_strength',              goalId: 'strength', label: 'Improve grip strength',                        layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_rate_of_force_development',  goalId: 'strength', label: 'Improve rate of force development',            layer: 'secondary' },
    { id: 'improve_motor_unit_synchronisation', goalId: 'strength', label: 'Improve motor unit synchronisation',           layer: 'secondary' },
    { id: 'build_unilateral_strength_balance',  goalId: 'strength', label: 'Build unilateral strength balance',            layer: 'secondary' },
    { id: 'strengthen_tendons_ligaments',       goalId: 'strength', label: 'Strengthen tendons and ligaments',             layer: 'secondary' },
    { id: 'improve_bar_velocity_tracking',      goalId: 'strength', label: 'Improve bar velocity tracking',                layer: 'secondary' },
  ],

  'general': [
    // primary — 5 entries
    { id: 'improve_daily_energy_levels',        goalId: 'general', label: 'Improve daily energy levels',                   layer: 'primary'   },
    { id: 'build_consistent_routine',           goalId: 'general', label: 'Build a consistent routine',                    layer: 'primary'   },
    { id: 'reduce_physical_stiffness',          goalId: 'general', label: 'Reduce physical stiffness',                     layer: 'primary'   },
    { id: 'improve_overall_health_markers',     goalId: 'general', label: 'Improve overall health markers',                layer: 'primary'   },
    { id: 'manage_body_weight',                 goalId: 'general', label: 'Manage body weight',                            layer: 'primary'   },
    // secondary (trainer-assessed) — 6 entries
    { id: 'improve_heart_rate_recovery',        goalId: 'general', label: 'Improve heart rate recovery',                   layer: 'secondary' },
    { id: 'hit_weekly_activity_guidelines',     goalId: 'general', label: 'Hit weekly activity guidelines',                layer: 'secondary' },
    { id: 'reduce_sedentary_hours_daily',       goalId: 'general', label: 'Reduce sedentary hours daily',                  layer: 'secondary' },
    { id: 'develop_fundamental_movement_patterns', goalId: 'general', label: 'Develop fundamental movement patterns',     layer: 'secondary' },
    { id: 'build_metabolic_flexibility',        goalId: 'general', label: 'Build metabolic flexibility',                   layer: 'secondary' },
    { id: 'improve_daily_step_target',          goalId: 'general', label: 'Improve daily step target',                     layer: 'secondary' },
  ],

  'rehab': [
    // primary — 5 entries
    { id: 'return_to_sport_or_daily_activity',  goalId: 'rehab', label: 'Return to sport or daily activity',              layer: 'primary'   },
    { id: 'reduce_movement_related_pain',       goalId: 'rehab', label: 'Reduce movement-related pain',                   layer: 'primary'   },
    { id: 'rebuild_physical_confidence',        goalId: 'rehab', label: 'Rebuild physical confidence',                    layer: 'primary'   },
    { id: 'restore_full_range_of_motion',       goalId: 'rehab', label: 'Restore full range of motion',                   layer: 'primary'   },
    { id: 'improve_balance_and_stability',      goalId: 'rehab', label: 'Improve balance and stability',                  layer: 'primary'   },
    // secondary — 5 entries
    { id: 'achieve_limb_symmetry_index',        goalId: 'rehab', label: 'Achieve limb symmetry index ≥90%',               layer: 'secondary' },
    { id: 'overcome_kinesiophobia',             goalId: 'rehab', label: 'Overcome kinesiophobia',                         layer: 'secondary' },
    { id: 'rebuild_joint_proprioception',       goalId: 'rehab', label: 'Rebuild joint proprioception',                   layer: 'secondary' },
    { id: 'correct_muscular_compensation',      goalId: 'rehab', label: 'Correct muscular compensation patterns',         layer: 'secondary' },
    { id: 'desensitise_cns_movement_threats',   goalId: 'rehab', label: 'Desensitise CNS to movement threats',            layer: 'secondary' },
  ],

  'sports': [
    // primary — 5 entries
    { id: 'improve_sprint_speed',               goalId: 'sports', label: 'Improve sprint speed',                          layer: 'primary'   },
    { id: 'increase_explosive_power',           goalId: 'sports', label: 'Increase explosive power',                      layer: 'primary'   },
    { id: 'improve_multi_directional_agility',  goalId: 'sports', label: 'Improve multi-directional agility',             layer: 'primary'   },
    { id: 'improve_sport_specific_endurance',   goalId: 'sports', label: 'Improve sport-specific endurance',              layer: 'primary'   },
    { id: 'improve_vertical_jump',              goalId: 'sports', label: 'Improve vertical jump',                         layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_reaction_time_decision_speed', goalId: 'sports', label: 'Improve reaction time and decision speed',   layer: 'secondary' },
    { id: 'improve_deceleration_mechanics',     goalId: 'sports', label: 'Improve deceleration mechanics',                layer: 'secondary' },
    { id: 'improve_cognitive_physical_coordination', goalId: 'sports', label: 'Improve cognitive-physical coordination', layer: 'secondary' },
    { id: 'build_unilateral_dynamic_balance',   goalId: 'sports', label: 'Build unilateral dynamic balance',              layer: 'secondary' },
    { id: 'maximise_rate_of_force_development', goalId: 'sports', label: 'Maximise rate of force development',            layer: 'secondary' },
  ],

  'mobility': [
    // primary — 5 entries
    { id: 'improve_overall_flexibility',        goalId: 'mobility', label: 'Improve overall flexibility',                 layer: 'primary'   },
    { id: 'reduce_joint_tightness',             goalId: 'mobility', label: 'Reduce joint tightness',                      layer: 'primary'   },
    { id: 'improve_posture',                    goalId: 'mobility', label: 'Improve posture',                             layer: 'primary'   },
    { id: 'move_with_less_discomfort',          goalId: 'mobility', label: 'Move with less discomfort',                   layer: 'primary'   },
    { id: 'expand_active_range_of_motion',      goalId: 'mobility', label: 'Expand active range of motion',               layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_thoracic_spine_rotation',    goalId: 'mobility', label: 'Improve thoracic spine rotation',             layer: 'secondary' },
    { id: 'improve_hip_flexor_length',          goalId: 'mobility', label: 'Improve hip flexor length',                   layer: 'secondary' },
    { id: 'improve_ankle_dorsiflexion',         goalId: 'mobility', label: 'Improve ankle dorsiflexion',                  layer: 'secondary' },
    { id: 'balance_length_tension_relationships', goalId: 'mobility', label: 'Balance length-tension relationships',     layer: 'secondary' },
    { id: 'resolve_positional_muscle_hypertonicity', goalId: 'mobility', label: 'Resolve positional muscle hypertonicity', layer: 'secondary' },
  ],

  'mental': [
    // primary — 5 entries
    { id: 'reduce_daily_stress',                goalId: 'mental', label: 'Reduce daily stress',                           layer: 'primary'   },
    { id: 'improve_mood_and_outlook',           goalId: 'mental', label: 'Improve mood and outlook',                      layer: 'primary'   },
    { id: 'improve_sleep_quality',              goalId: 'mental', label: 'Improve sleep quality',                         layer: 'primary'   },
    { id: 'build_exercise_consistency',         goalId: 'mental', label: 'Build exercise consistency',                    layer: 'primary'   },
    { id: 'increase_self_confidence',           goalId: 'mental', label: 'Increase self-confidence',                      layer: 'primary'   },
    // secondary — 5 entries
    { id: 'stimulate_bdnf_through_movement',    goalId: 'mental', label: 'Stimulate BDNF through movement',               layer: 'secondary' },
    { id: 'improve_hrv_trends',                 goalId: 'mental', label: 'Improve HRV trends',                            layer: 'secondary' },
    { id: 'regulate_cortisol_through_training', goalId: 'mental', label: 'Regulate cortisol through training',            layer: 'secondary' },
    { id: 'shift_parasympathetic_balance',      goalId: 'mental', label: 'Shift parasympathetic balance',                 layer: 'secondary' },
    { id: 'improve_post_workout_cognitive_clarity', goalId: 'mental', label: 'Improve post-workout cognitive clarity',   layer: 'secondary' },
  ],

  // ── Specialist ────────────────────────────────────────────────────────────

  'cardio': [
    // primary — 5 entries
    { id: 'improve_stamina_and_endurance',      goalId: 'cardio', label: 'Improve stamina and endurance',                 layer: 'primary'   },
    { id: 'run_or_cycle_longer_distances',      goalId: 'cardio', label: 'Run or cycle longer distances',                 layer: 'primary'   },
    { id: 'feel_less_breathless_daily',         goalId: 'cardio', label: 'Feel less breathless daily',                    layer: 'primary'   },
    { id: 'improve_cardiorespiratory_health',   goalId: 'cardio', label: 'Improve cardiorespiratory health',              layer: 'primary'   },
    { id: 'increase_daily_step_count',          goalId: 'cardio', label: 'Increase daily step count',                     layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_vo2_max_score',              goalId: 'cardio', label: 'Improve VO2 max score',                         layer: 'secondary' },
    { id: 'improve_zone2_aerobic_threshold',    goalId: 'cardio', label: 'Improve Zone 2 aerobic threshold',              layer: 'secondary' },
    { id: 'increase_cardiac_stroke_volume',     goalId: 'cardio', label: 'Increase cardiac stroke volume',                layer: 'secondary' },
    { id: 'drive_mitochondrial_biogenesis',     goalId: 'cardio', label: 'Drive mitochondrial biogenesis',                layer: 'secondary' },
    { id: 'reduce_exercise_induced_arterial_stiffness', goalId: 'cardio', label: 'Reduce exercise-induced arterial stiffness', layer: 'secondary' },
  ],

  'aesthetics': [
    // primary — 5 entries
    { id: 'improve_muscle_definition_separation', goalId: 'aesthetics', label: 'Improve muscle definition and separation', layer: 'primary'  },
    { id: 'achieve_low_target_body_fat_pct',    goalId: 'aesthetics', label: 'Achieve low target body fat percentage',     layer: 'primary'   },
    { id: 'balance_muscle_symmetry',            goalId: 'aesthetics', label: 'Balance muscle symmetry',                   layer: 'primary'   },
    { id: 'achieve_competition_physique',       goalId: 'aesthetics', label: 'Achieve competition physique',               layer: 'primary'   },
    { id: 'improve_visual_body_proportions',    goalId: 'aesthetics', label: 'Improve visual body proportions',            layer: 'primary'   },
    // secondary — 5 entries
    { id: 'correct_postural_imbalance_visual_lines', goalId: 'aesthetics', label: 'Correct postural imbalance for visual lines', layer: 'secondary' },
    { id: 'manage_subcutaneous_fluid_retention', goalId: 'aesthetics', label: 'Manage subcutaneous fluid retention',      layer: 'secondary' },
    { id: 'selectively_hypertrophy_target_groups', goalId: 'aesthetics', label: 'Selectively hypertrophy target muscle groups', layer: 'secondary' },
    { id: 'monitor_muscle_dysmorphia_signs',    goalId: 'aesthetics', label: 'Monitor for muscle dysmorphia signs',        layer: 'secondary' },
    { id: 'maintain_hormonal_health_during_deficit', goalId: 'aesthetics', label: 'Maintain hormonal health during deficit', layer: 'secondary' },
  ],

  'aging': [
    // primary — 5 entries
    { id: 'maintain_physical_independence',     goalId: 'aging', label: 'Maintain physical independence',                  layer: 'primary'   },
    { id: 'improve_balance_and_stability',      goalId: 'aging', label: 'Improve balance and stability',                   layer: 'primary'   },
    { id: 'keep_muscle_mass_long_term',         goalId: 'aging', label: 'Keep muscle mass long-term',                      layer: 'primary'   },
    { id: 'stay_active_and_mobile',             goalId: 'aging', label: 'Stay active and mobile',                          layer: 'primary'   },
    { id: 'reduce_fall_risk',                   goalId: 'aging', label: 'Reduce fall risk',                                layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_single_leg_balance_time',    goalId: 'aging', label: 'Improve single-leg balance time',                 layer: 'secondary' },
    { id: 'track_gait_speed_improvement',       goalId: 'aging', label: 'Track gait speed improvement',                    layer: 'secondary' },
    { id: 'maintain_grip_strength_benchmarks',  goalId: 'aging', label: 'Maintain grip strength benchmarks',               layer: 'secondary' },
    { id: 'support_bone_mineral_density',       goalId: 'aging', label: 'Support bone mineral density',                    layer: 'secondary' },
    { id: 'prevent_age_related_sarcopenia',     goalId: 'aging', label: 'Prevent age-related sarcopenia',                  layer: 'secondary' },
  ],

  'functional': [
    // primary — 5 entries
    { id: 'lift_and_carry_without_pain',        goalId: 'functional', label: 'Lift and carry without pain',               layer: 'primary'   },
    { id: 'climb_stairs_with_ease',             goalId: 'functional', label: 'Climb stairs with ease',                    layer: 'primary'   },
    { id: 'reduce_back_pain',                   goalId: 'functional', label: 'Reduce back pain',                          layer: 'primary'   },
    { id: 'improve_walking_endurance',          goalId: 'functional', label: 'Improve walking endurance',                 layer: 'primary'   },
    { id: 'build_floor_to_stand_strength',      goalId: 'functional', label: 'Build floor-to-stand strength',             layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_timed_up_and_go_score',      goalId: 'functional', label: 'Improve Timed Up and Go (TUG) score',       layer: 'secondary' },
    { id: 'build_unilateral_carry_capacity',    goalId: 'functional', label: 'Build unilateral carry capacity',           layer: 'secondary' },
    { id: 'improve_3d_balance_under_fatigue',   goalId: 'functional', label: 'Improve 3D balance under fatigue',          layer: 'secondary' },
    { id: 'develop_multi_planar_core_stability', goalId: 'functional', label: 'Develop multi-planar core stability',      layer: 'secondary' },
    { id: 'optimise_joint_biomechanics',        goalId: 'functional', label: 'Optimise joint biomechanics',               layer: 'secondary' },
  ],

  'weight-mgmt': [
    // primary — 5 entries
    { id: 'maintain_stable_healthy_weight',     goalId: 'weight-mgmt', label: 'Maintain a stable healthy weight',        layer: 'primary'   },
    { id: 'avoid_weight_regain',                goalId: 'weight-mgmt', label: 'Avoid weight regain',                     layer: 'primary'   },
    { id: 'build_sustainable_habits',           goalId: 'weight-mgmt', label: 'Build sustainable habits',                layer: 'primary'   },
    { id: 'improve_metabolic_health',           goalId: 'weight-mgmt', label: 'Improve metabolic health',                layer: 'primary'   },
    { id: 'reduce_emotional_eating',            goalId: 'weight-mgmt', label: 'Reduce emotional eating',                 layer: 'primary'   },
    // secondary — 5 entries
    { id: 'normalise_leptin_ghrelin_levels',    goalId: 'weight-mgmt', label: 'Normalise leptin and ghrelin levels',     layer: 'secondary' },
    { id: 'break_yo_yo_weight_cycling',         goalId: 'weight-mgmt', label: 'Break yo-yo weight cycling',              layer: 'secondary' },
    { id: 'build_neat_activity_habits',         goalId: 'weight-mgmt', label: 'Build NEAT activity habits',              layer: 'secondary' },
    { id: 'preserve_resting_metabolic_rate',    goalId: 'weight-mgmt', label: 'Preserve resting metabolic rate',         layer: 'secondary' },
    { id: 'support_long_term_hormonal_balance', goalId: 'weight-mgmt', label: 'Support long-term hormonal balance',      layer: 'secondary' },
  ],

  'postnatal': [
    // primary — 5 entries
    { id: 'stay_active_during_pregnancy',       goalId: 'postnatal', label: 'Stay active and fit during pregnancy',      layer: 'primary'   },
    { id: 'prepare_body_for_labour_and_birth',  goalId: 'postnatal', label: 'Prepare body for labour and birth',         layer: 'primary'   },
    { id: 'execute_safe_postpartum_return',     goalId: 'postnatal', label: 'Execute safe postpartum return',            layer: 'primary'   },
    { id: 'rebuild_core_strength_after_birth',  goalId: 'postnatal', label: 'Rebuild core strength after birth',         layer: 'primary'   },
    { id: 'reduce_discomfort_during_pregnancy', goalId: 'postnatal', label: 'Reduce discomfort during pregnancy',        layer: 'primary'   },
    // secondary — 5 entries
    { id: 'strengthen_transverse_abdominis',    goalId: 'postnatal', label: 'Strengthen transverse abdominis',           layer: 'secondary' },
    { id: 'manage_prevent_diastasis_recti',     goalId: 'postnatal', label: 'Manage and prevent Diastasis Recti',        layer: 'secondary' },
    { id: 'rehabilitate_pelvic_floor_dysfunction', goalId: 'postnatal', label: 'Rehabilitate pelvic floor dysfunction', layer: 'secondary' },
    { id: 'manage_si_joint_pelvic_girdle_pain', goalId: 'postnatal', label: 'Manage SI joint and pelvic girdle pain',    layer: 'secondary' },
    { id: 'avoid_loaded_oblique_twisting',      goalId: 'postnatal', label: 'Avoid loaded oblique twisting exercises',   layer: 'secondary' },
  ],

  'youth': [
    // primary — 5 entries
    { id: 'build_physical_strength_safely',     goalId: 'youth', label: 'Build physical strength safely',                layer: 'primary'   },
    { id: 'improve_speed_and_agility',          goalId: 'youth', label: 'Improve speed and agility',                     layer: 'primary'   },
    { id: 'develop_sport_skills',               goalId: 'youth', label: 'Develop sport skills',                          layer: 'primary'   },
    { id: 'build_movement_confidence',          goalId: 'youth', label: 'Build movement confidence',                     layer: 'primary'   },
    { id: 'improve_athletic_performance',       goalId: 'youth', label: 'Improve athletic performance',                  layer: 'primary'   },
    // secondary — 5 entries
    { id: 'progress_through_ltad_stage_model',  goalId: 'youth', label: 'Progress through LTAD stage model',             layer: 'secondary' },
    { id: 'build_multi_sport_motor_coordination', goalId: 'youth', label: 'Build multi-sport motor coordination',        layer: 'secondary' },
    { id: 'increase_bone_mineral_density',      goalId: 'youth', label: 'Increase bone mineral density',                 layer: 'secondary' },
    { id: 'avoid_early_sports_specialisation',  goalId: 'youth', label: 'Avoid early sports specialisation',             layer: 'secondary' },
    { id: 'develop_psychosocial_self_efficacy', goalId: 'youth', label: 'Develop psychosocial self-efficacy',            layer: 'secondary' },
  ],

  'underweight': [
    // primary — 5 entries
    { id: 'increase_total_body_mass',           goalId: 'underweight', label: 'Increase total body mass',                layer: 'primary'   },
    { id: 'build_lean_muscle_tissue',           goalId: 'underweight', label: 'Build lean muscle tissue',                layer: 'primary'   },
    { id: 'improve_physical_presence',          goalId: 'underweight', label: 'Improve physical presence',               layer: 'primary'   },
    { id: 'gain_weight_healthily_and_steadily', goalId: 'underweight', label: 'Gain weight healthily and steadily',      layer: 'primary'   },
    { id: 'improve_appetite_consistency',       goalId: 'underweight', label: 'Improve appetite consistency',            layer: 'primary'   },
    // secondary — 5 entries
    { id: 'maintain_positive_caloric_surplus',  goalId: 'underweight', label: 'Maintain positive caloric surplus',       layer: 'secondary' },
    { id: 'optimise_testosterone_cortisol_ratio', goalId: 'underweight', label: 'Optimise testosterone-to-cortisol ratio', layer: 'secondary' },
    { id: 'improve_gut_nutrient_absorption',    goalId: 'underweight', label: 'Improve gut nutrient absorption',         layer: 'secondary' },
    { id: 'shorten_overnight_fasting_window',   goalId: 'underweight', label: 'Shorten overnight fasting window',        layer: 'secondary' },
    { id: 'target_lean_mass_gain_per_week',     goalId: 'underweight', label: 'Target 0.5–1 lb/week lean mass gain',     layer: 'secondary' },
  ],

  // ── Emerging ──────────────────────────────────────────────────────────────

  'glp1': [
    // primary — 5 entries
    { id: 'preserve_lean_muscle_during_weight_loss', goalId: 'glp1', label: 'Preserve lean muscle during weight loss',  layer: 'primary'   },
    { id: 'maintain_physical_strength',         goalId: 'glp1', label: 'Maintain physical strength',                    layer: 'primary'   },
    { id: 'protect_bone_density',               goalId: 'glp1', label: 'Protect bone density',                          layer: 'primary'   },
    { id: 'keep_energy_levels_stable',          goalId: 'glp1', label: 'Keep energy levels stable',                     layer: 'primary'   },
    { id: 'build_safe_exercise_habit',          goalId: 'glp1', label: 'Build a safe exercise habit',                   layer: 'primary'   },
    // secondary — 5 entries
    { id: 'achieve_80pct_fat_to_muscle_ratio',  goalId: 'glp1', label: 'Achieve ≥80% fat-to-muscle loss ratio',         layer: 'secondary' },
    { id: 'prevent_medication_induced_muscle_crisis', goalId: 'glp1', label: 'Prevent medication-induced muscle crisis', layer: 'secondary' },
    { id: 'manage_nausea_fatigue_around_sessions', goalId: 'glp1', label: 'Manage nausea and fatigue around sessions',  layer: 'secondary' },
    { id: 'ensure_adequate_protein_hydration',  goalId: 'glp1', label: 'Ensure adequate protein and hydration',         layer: 'secondary' },
    { id: 'monitor_dxa_skeletal_mass_regularly', goalId: 'glp1', label: 'Monitor DXA skeletal mass regularly',          layer: 'secondary' },
  ],

  'longevity': [
    // primary — 5 entries
    { id: 'slow_biological_aging_process',      goalId: 'longevity', label: 'Slow biological aging process',            layer: 'primary'   },
    { id: 'preserve_cognitive_sharpness',       goalId: 'longevity', label: 'Preserve cognitive sharpness',             layer: 'primary'   },
    { id: 'extend_healthy_active_years',        goalId: 'longevity', label: 'Extend healthy active years',              layer: 'primary'   },
    { id: 'maintain_long_term_physical_independence', goalId: 'longevity', label: 'Maintain long-term physical independence', layer: 'primary' },
    { id: 'improve_energy_and_vitality',        goalId: 'longevity', label: 'Improve energy and vitality',              layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_mitochondrial_health',       goalId: 'longevity', label: 'Improve mitochondrial health',             layer: 'secondary' },
    { id: 'reduce_dunedinpace_biological_age_rate', goalId: 'longevity', label: 'Reduce DunedinPACE biological age rate', layer: 'secondary' },
    { id: 'build_autonomic_nervous_system_resilience', goalId: 'longevity', label: 'Build autonomic nervous system resilience', layer: 'secondary' },
    { id: 'improve_gut_microbiome_through_exercise', goalId: 'longevity', label: 'Improve gut microbiome through exercise', layer: 'secondary' },
    { id: 'support_deep_sleep_architecture',    goalId: 'longevity', label: 'Support deep sleep architecture',          layer: 'secondary' },
  ],

  'neuro': [
    // primary — 5 entries
    { id: 'reduce_chronic_movement_pain',       goalId: 'neuro', label: 'Reduce chronic movement pain',                 layer: 'primary'   },
    { id: 'improve_balance_and_coordination',   goalId: 'neuro', label: 'Improve balance and coordination',             layer: 'primary'   },
    { id: 'improve_physical_confidence',        goalId: 'neuro', label: 'Improve physical confidence',                  layer: 'primary'   },
    { id: 'restore_full_movement_patterns',     goalId: 'neuro', label: 'Restore full movement patterns',               layer: 'primary'   },
    { id: 'reduce_dizziness_spatial_instability', goalId: 'neuro', label: 'Reduce dizziness or spatial instability',   layer: 'primary'   },
    // secondary — 5 entries
    { id: 'improve_vor_gaze_stabilisation',     goalId: 'neuro', label: 'Improve VOR gaze stabilisation',               layer: 'secondary' },
    { id: 'reduce_brain_threat_perception_movement', goalId: 'neuro', label: 'Reduce brain threat perception of movement', layer: 'secondary' },
    { id: 'reintegrate_sensory_triad',          goalId: 'neuro', label: 'Re-integrate visual-vestibular-proprioceptive sensory triad', layer: 'secondary' },
    { id: 'improve_executive_attentional_control', goalId: 'neuro', label: 'Improve executive attentional control',    layer: 'secondary' },
    { id: 'complete_calm_activate_prime_routines', goalId: 'neuro', label: 'Complete Calm-Activate-Prime routines',    layer: 'secondary' },
  ],

}

export const GOAL_SAFETY_FLAGS: Record<IntakeGoalId, GoalSafetyFlagId[]> = {
  'fat-loss':    [],
  'muscle':      [],
  'strength':    [],
  'general':     [],
  'rehab':       ['injury_risk'],
  'sports':      [],
  'mobility':    [],
  'mental':      [],
  'cardio':      [],
  'aesthetics':  [],
  'aging':       [],
  'functional':  [],
  'weight-mgmt': [],
  'postnatal':   ['prenatal_postnatal'],
  'youth':       ['youth_client'],
  'underweight': [],
  'glp1':        ['glp1_medication'],
  'longevity':   [],
  'neuro':       ['neurological'],
}

// Legacy 7-goal aliases: live underscore IDs → canonical hyphenated IDs
export const LEGACY_GOAL_ALIASES: Record<string, IntakeGoalId> = {
  fat_loss:           'fat-loss',
  muscle_gain:        'muscle',
  strength:           'strength',
  general_fitness:    'general',
  rehabilitation:     'rehab',
  sports_performance: 'sports',
  mobility:           'mobility',
}

// Legacy sub-goal aliases per canonical goal ID.
// Maps: legacy sub-goal ID → canonical sub-goal ID.
// Covers all sub-goals from the legacy 7-goal multi-select taxonomy (now removed).
export const LEGACY_SUBGOAL_ALIASES: Record<IntakeGoalId, Record<string, string>> = {
  'fat-loss':    {
    weight_loss:    'reduce_total_body_fat',
    fat_percentage: 'reduce_total_body_fat',
    conditioning:   'increase_daily_activity_level',
  },
  'muscle':      {
    hypertrophy: 'build_lean_muscle_mass',
    lean_mass:   'build_lean_muscle_mass',
    bulking:     'build_lean_muscle_mass',
  },
  'strength':    {
    max_strength: 'increase_1rm_compound_lifts',
    powerlifting: 'increase_1rm_compound_lifts',
  },
  'general':     {},
  'rehab':       {
    back_pain:       'reduce_movement_related_pain',
    knee_recovery:   'return_to_sport_or_daily_activity',
    injury_recovery: 'return_to_sport_or_daily_activity',
  },
  'sports':      {},
  'mobility':    {},
  'mental':      {},
  'cardio':      {},
  'aesthetics':  {},
  'aging':       {},
  'functional':  {},
  'weight-mgmt': {},
  'postnatal':   {},
  'youth':       {},
  'underweight': {},
  'glp1':        {},
  'longevity':   {},
  'neuro':       {},
}

export function normalizeGoalId(raw: string): IntakeGoalId | null {
  if (isIntakeGoalId(raw)) return raw
  return LEGACY_GOAL_ALIASES[raw] ?? null
}

// Returns the canonical sub-goal ID (applying legacy alias if needed),
// or null if the resolved ID is not a known canonical sub-goal for this goal.
export function normalizeSubGoalId(goalId: IntakeGoalId, raw: string): string | null {
  const aliased  = LEGACY_SUBGOAL_ALIASES[goalId][raw]
  const resolved = aliased ?? raw
  return SUB_GOALS[goalId].some(sg => sg.id === resolved) ? resolved : null
}

export function isIntakeGoalId(raw: string): raw is IntakeGoalId {
  return GOALS.some(g => g.id === raw)
}

export function getGoal(id: IntakeGoalId): Goal {
  const goal = GOALS.find(g => g.id === id)
  if (!goal) throw new Error(`Unknown IntakeGoalId: ${id}`)
  return goal
}

export function getGoalsBySection(section: GoalSection): Goal[] {
  return GOALS.filter(g => g.section === section)
}

// Returns sub-goals for a goal, optionally filtered by layer.
// No layer argument → returns all sub-goals for both layers.
export function getSubGoals(goalId: IntakeGoalId, layer?: SubGoalLayer): readonly SubGoal[] {
  const all = SUB_GOALS[goalId]
  return layer === undefined ? all : all.filter(sg => sg.layer === layer)
}
