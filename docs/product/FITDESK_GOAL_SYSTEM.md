# FITDESK_GOAL_SYSTEM.md

> FitDesk Program Design & Training Logistics
> Spec Version: **v1.1**
> Status: **Source-backed taxonomy approved / Smart Accordion UX contract approved / runtime implementation pending**
> Doctrine: **Bad decisions avoided > Code produced**

## 1. Purpose

This file defines the client goal intake taxonomy for FitDesk — the 19 goal categories, their client-stated and trainer-assessed sub-goals, the Smart Accordion Card goal-selection UX contract, and the mapping between this taxonomy and the `ProgramGoal` enum defined in `API_REPOSITORY_CONTRACT.md`.

This document exists to close a gap identified during architecture review: the goal intake system and the program generation engine were built as two disconnected contracts. The intake form presents 19 goal categories. `ProgramGoal` in `API_REPOSITORY_CONTRACT.md` defines 10 values. Without an explicit mapping layer, a coach can save a client with a goal the program engine has no way to act on.

```text
Goal intake (19 categories)
  → IntakeGoal enum
  → GoalProgramMappingService
  → ProgramGoal (10 values, 2 pending additions)
  → program generation
```

## 2. Domain Boundary

```text
FitDesk Goal System
├─ intake goal taxonomy (19 categories)
├─ client-stated sub-goals (primary layer)
├─ trainer-assessed sub-goals (secondary layer)
├─ urgency classification
├─ goal conflict detection
├─ IntakeGoal -> ProgramGoal mapping table
└─ post-save goal profile (metrics, timeline, action availability)
```

This system sits upstream of `client_program`. It does not generate programs. It produces the `primaryGoalId` and goal metadata that `instantiateProgramFromTemplate` and the program builder UI consume.

## 3. Core Enum: `IntakeGoal`

```ts
export type IntakeGoal =
  | "fat-loss"
  | "muscle"
  | "strength"
  | "general"
  | "rehab"
  | "sports"
  | "mobility"
  | "mental"
  | "cardio"
  | "aesthetics"
  | "aging"
  | "functional"
  | "weight-mgmt"
  | "postnatal"
  | "youth"
  | "underweight"
  | "glp1"
  | "longevity"
  | "neuro";
```

```ts
export type GoalSection =
  | "core"        // goals 1-8, shown by default in Add Client form
  | "specialist"  // goals 9-16, behind "More Goals" expansion
  | "emerging";   // goals 17-19, GLP-1, Longevity, Neuro-Centric
```

```ts
export type GoalUrgency =
  | "urgent"      // primary driver of current program phase, tracked weekly
  | "active_focus" // actively programmed for, secondary to urgent goal
  | "background"; // acknowledged and supported, not current focus
```

```ts
export type SubGoalLayer =
  | "primary"    // client-stated, what the client says during intake
  | "secondary"; // trainer-assessed, what the trainer identifies via screening
```

## 4. Core Table Specs

### `client_goal`

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | UUID/Text | Yes | Primary key |
| `tenant_id` | UUID/Text | Yes | |
| `client_id` | UUID/Text | Yes | FK |
| `intake_goal` | Enum (`IntakeGoal`) | Yes | |
| `section` | Enum (`GoalSection`) | Yes | Derived from `intake_goal`, denormalized for query speed |
| `urgency` | Enum (`GoalUrgency`) | Yes | Default `active_focus` |
| `is_primary` | Boolean | Yes | Exactly one `true` per client at a time; enforced at repository level |
| `trainer_notes` | Text nullable | No | Free text, context/history/medical flags |
| `created_at` / `updated_at` | Timestamp UTC | Yes | |

Constraints:

| Constraint | Definition |
|---|---|
| Unique active goal per client | `unique (tenant_id, client_id, intake_goal)` where not soft-deleted |
| Single primary | Repository enforces only one `is_primary = true` row per `client_id` at write time |

### `client_sub_goal`

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | UUID/Text | Yes | |
| `tenant_id` | UUID/Text | Yes | |
| `client_goal_id` | UUID/Text | Yes | FK to `client_goal` |
| `sub_goal_key` | Text | Yes | Stable key, e.g. `reduce_total_body_fat` |
| `layer` | Enum (`SubGoalLayer`) | Yes | |
| `selected` | Boolean | Yes | |
| `created_at` | Timestamp UTC | Yes | |

### `intake_goal_program_mapping`

This is the table that closes the architecture gap. It is the canonical, queryable source of truth for `IntakeGoal -> ProgramGoal` resolution. It must not be reimplemented as inline conditionals in the program builder.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `intake_goal` | Enum (`IntakeGoal`) | Yes | Primary key |
| `program_goal` | Enum (`ProgramGoal`) nullable | No | `null` = no mapping exists yet |
| `mapping_status` | Enum | Yes | `direct`, `approximate`, `missing` |
| `notes` | Text | Yes | Engineering action required, if any |

## 5. The 19 Goal Categories

### Section: Core (shown by default in Add Client form)

#### 1. Fat Loss & Body Composition

```text
program_goal: fat_loss
mapping_status: direct
demographics: Sedentary corporate professionals, recreational athletes, post-GLP-1 clients
```

Primary (client-stated):
```text
reduce_total_body_fat              Reduce total body fat
improve_visible_muscle_definition  Improve visible muscle definition
increase_daily_activity_level      Increase daily activity level
improve_nutrition_habits           Improve nutrition habits
boost_daily_energy_levels          Boost daily energy levels
track_visceral_fat_reduction       Track visceral fat reduction
```

Secondary (trainer-assessed):
```text
preserve_skeletal_muscle_mass      Preserve skeletal muscle mass (SMMI >= 7.5 kg/m2 M / 6.7 kg/m2 F)
improve_insulin_sensitivity        Improve insulin sensitivity
manage_cortisol_stress_eating      Manage cortisol and stress eating
regulate_postprandial_glucose      Regulate postprandial glucose
maintain_resting_metabolic_rate    Maintain resting metabolic rate
```

Key metrics: SMMI via DXA; CGM glucose variability; RHR + HRV stability; body fat % via DXA/BIS.

#### 2. Muscle Gain (Hypertrophy)

```text
program_goal: hypertrophy
mapping_status: direct
demographics: Bodybuilders, recreational lifters, sarcopenia-prevention adults (40+)
```

Primary:
```text
build_lean_muscle_mass             Build lean muscle mass
improve_overall_body_shape         Improve overall body shape
increase_training_volume           Increase training volume
target_lagging_muscle_groups       Target lagging muscle groups
improve_body_symmetry              Improve body symmetry
```

Secondary:
```text
accelerate_muscle_protein_synthesis Accelerate muscle protein synthesis
improve_mind_muscle_connection      Improve mind-muscle connection
reduce_junk_volume                  Reduce junk volume
optimise_myofibrillar_density       Optimise myofibrillar density
optimise_sleep_for_recovery         Optimise sleep for recovery
```

Key metrics: 0–2 RIR on final sets; ~10 sets/muscle group/week; BIS/DXA cross-sectional area; weekly volume-load.

#### 3. Strength

```text
program_goal: powerlifting_strength
mapping_status: direct
demographics: Powerlifters, field sport athletes, manual labourers, aging adults for independence
```

Primary:
```text
increase_1rm_compound_lifts        Increase 1RM on compound lifts
feel_physically_stronger           Feel physically stronger
improve_bar_technique              Improve bar technique
build_core_strength                Build core strength
improve_grip_strength              Improve grip strength
```

Secondary:
```text
improve_rate_of_force_development  Improve rate of force development
improve_motor_unit_synchronisation Improve motor unit synchronisation
build_unilateral_strength_balance  Build unilateral strength balance
strengthen_tendons_ligaments       Strengthen tendons and ligaments
improve_bar_velocity_tracking      Improve bar velocity tracking
```

Key metrics: ≥80% 1RM load; 3–5 min rest intervals; mean concentric velocity (m/s) via VBT; 2–3 working sets/exercise.

#### 4. General Fitness & Health

```text
program_goal: general_fitness
mapping_status: direct
demographics: Desk-bound office workers, busy parents, health-conscious adults, beginners
```

Primary:
```text
improve_daily_energy_levels        Improve daily energy levels
build_consistent_routine           Build a consistent routine
reduce_physical_stiffness          Reduce physical stiffness
improve_overall_health_markers     Improve overall health markers
manage_body_weight                 Manage body weight
```

Secondary:
```text
improve_heart_rate_recovery        Improve heart rate recovery (>=12 bpm drop, 1 min post-exercise)
hit_weekly_activity_guidelines     Hit weekly activity guidelines (>=150 min/week)
reduce_sedentary_hours_daily       Reduce sedentary hours daily
develop_fundamental_movement_patterns Develop fundamental movement patterns
build_metabolic_flexibility        Build metabolic flexibility
improve_daily_step_target          Improve daily step target (7,000-10,000/day)
```

Key metrics: ≥150 min/week moderate activity; ≥12 bpm HRR drop; 7,000–10,000 steps/day.

#### 5. Rehabilitation & Injury Recovery

```text
program_goal: rehab_return_to_training
mapping_status: direct
demographics: Post-surgical patients, ACL/rotator cuff/disc injuries, chronic back/neck pain, returning athletes
safety_flag: triggers SAFETY_GATING.md signal matrix — "Rehab + pain note" rule applies
```

Primary:
```text
return_to_sport_or_daily_activity  Return to sport or daily activity
reduce_movement_related_pain       Reduce movement-related pain
rebuild_physical_confidence        Rebuild physical confidence
restore_full_range_of_motion       Restore full range of motion
improve_balance_and_stability      Improve balance and stability
```

Secondary:
```text
achieve_limb_symmetry_index        Achieve limb symmetry index >=90%
overcome_kinesiophobia             Overcome kinesiophobia
rebuild_joint_proprioception       Rebuild joint proprioception
correct_muscular_compensation      Correct muscular compensation patterns
desensitise_cns_movement_threats   Desensitise CNS to movement threats
```

Key metrics: limb symmetry index ≥90%; pain-free ROM documented each session; TSK-11 kinesiophobia scale.

#### 6. Sports Performance

```text
program_goal: sports_performance
mapping_status: direct
demographics: Competitive youth, collegiate, professional, and masters athletes across all sports
```

Primary:
```text
improve_sprint_speed               Improve sprint speed
increase_explosive_power           Increase explosive power
improve_multi_directional_agility  Improve multi-directional agility
improve_sport_specific_endurance   Improve sport-specific endurance
improve_vertical_jump              Improve vertical jump
```

Secondary:
```text
improve_reaction_time_decision_speed Improve reaction time and decision speed
improve_deceleration_mechanics       Improve deceleration mechanics
improve_cognitive_physical_coordination Improve cognitive-physical coordination
build_unilateral_dynamic_balance     Build unilateral dynamic balance
maximise_rate_of_force_development   Maximise rate of force development
```

Key metrics: watts at 30–70% 1RM; millisecond reaction time; GPS sprint splits; vertical jump RSI via force plate.

#### 7. Mobility & Flexibility

```text
program_goal: mobility
mapping_status: direct
demographics: Desk-bound workers with postural tightness, pre-rehab trainees, athletes improving mechanics
```

Primary:
```text
improve_overall_flexibility        Improve overall flexibility
reduce_joint_tightness              Reduce joint tightness
improve_posture                     Improve posture
move_with_less_discomfort           Move with less discomfort
expand_active_range_of_motion       Expand active range of motion
```

Secondary:
```text
improve_thoracic_spine_rotation     Improve thoracic spine rotation
improve_hip_flexor_length           Improve hip flexor length
improve_ankle_dorsiflexion          Improve ankle dorsiflexion
balance_length_tension_relationships Balance length-tension relationships
resolve_positional_muscle_hypertonicity Resolve positional muscle hypertonicity
```

Key metrics: digital goniometer joint angles; active vs passive ROM gap; overhead squat assessment; Thomas test / 90-90 hip test.

#### 8. Mental Wellness Through Exercise

```text
program_goal: general_fitness
mapping_status: approximate — no dedicated enum value yet
demographics: High-burnout professionals, anxiety/depression sufferers, screen-fatigue, corporate performance recovery
```

Primary:
```text
reduce_daily_stress                 Reduce daily stress
improve_mood_and_outlook            Improve mood and outlook
improve_sleep_quality                Improve sleep quality
build_exercise_consistency           Build exercise consistency
increase_self_confidence             Increase self-confidence
```

Secondary:
```text
stimulate_bdnf_through_movement     Stimulate BDNF through movement
improve_hrv_trends                  Improve HRV trends
regulate_cortisol_through_training  Regulate cortisol through training
shift_parasympathetic_balance       Shift parasympathetic balance
improve_post_workout_cognitive_clarity Improve post-workout cognitive clarity
```

Key metrics: nocturnal HRV trend; sleep efficiency ≥85%; PHQ-9/GAD-7 screening; daily desire-to-train score (1–10).

### Section: Specialist (behind "More Goals" expansion)

#### 9. Cardio & Endurance

```text
program_goal: general_fitness
mapping_status: approximate — no dedicated enum value yet
demographics: Recreational endurance athletes, cyclists, rowers, clinical cardioprotective patients
```

Primary:
```text
improve_stamina_and_endurance       Improve stamina and endurance
run_or_cycle_longer_distances        Run or cycle longer distances
feel_less_breathless_daily           Feel less breathless daily
improve_cardiorespiratory_health     Improve cardiorespiratory health
increase_daily_step_count            Increase daily step count
```

Secondary:
```text
improve_vo2_max_score               Improve VO2 max score
improve_zone2_aerobic_threshold     Improve Zone 2 aerobic threshold
increase_cardiac_stroke_volume      Increase cardiac stroke volume
drive_mitochondrial_biogenesis      Drive mitochondrial biogenesis
reduce_exercise_induced_arterial_stiffness Reduce exercise-induced arterial stiffness
```

Key metrics: VO2 max (ml/kg/min); Zone 2 HR boundary; HRR curve; resting HR trend; 5K/10K time benchmarks.

#### 10. Aesthetics & Physique

```text
program_goal: hypertrophy
mapping_status: approximate — shares enum with Muscle Gain
demographics: Physique competitors, actors, recreational aesthetic-driven lifters, pre-event clients
```

Primary:
```text
improve_muscle_definition_separation Improve muscle definition and separation
achieve_low_target_body_fat_pct     Achieve low target body fat percentage
balance_muscle_symmetry             Balance muscle symmetry
achieve_competition_physique        Achieve competition physique
improve_visual_body_proportions     Improve visual body proportions
```

Secondary:
```text
correct_postural_imbalance_visual_lines Correct postural imbalance for visual lines
manage_subcutaneous_fluid_retention     Manage subcutaneous fluid retention
selectively_hypertrophy_target_groups   Selectively hypertrophy target muscle groups
monitor_muscle_dysmorphia_signs         Monitor for muscle dysmorphia signs
maintain_hormonal_health_during_deficit Maintain hormonal health during deficit
```

Key metrics: 3D body scan proportions; DXA/BIS body fat %; skinfold measurements; anthropometric tracking.

#### 11. Healthy Aging & Active Longevity

```text
program_goal: longevity
mapping_status: approximate — shares enum with Longevity Coaching
demographics: Active older adults (>=65 years) preserving independence, cognitive function, and daily capacity
```

Primary:
```text
maintain_physical_independence      Maintain physical independence
improve_balance_and_stability       Improve balance and stability
keep_muscle_mass_long_term          Keep muscle mass long-term
stay_active_and_mobile              Stay active and mobile
reduce_fall_risk                    Reduce fall risk
```

Secondary:
```text
improve_single_leg_balance_time     Improve single-leg balance time (>=30s eyes-closed)
track_gait_speed_improvement        Track gait speed improvement (>1.0 m/s)
maintain_grip_strength_benchmarks   Maintain grip strength benchmarks
support_bone_mineral_density        Support bone mineral density
prevent_age_related_sarcopenia      Prevent age-related sarcopenia
```

Key metrics: single-leg balance (eyes closed) ≥30s; gait speed >1.0 m/s; grip strength vs age norms; 30s chair stand test.

#### 12. Functional Fitness

```text
program_goal: general_fitness
mapping_status: approximate — no dedicated enum value yet
demographics: Midlife adults, physical labourers, general trainees improving real-world movement
```

Primary:
```text
lift_and_carry_without_pain         Lift and carry without pain
climb_stairs_with_ease              Climb stairs with ease
reduce_back_pain                    Reduce back pain
improve_walking_endurance           Improve walking endurance
build_floor_to_stand_strength       Build floor-to-stand strength
```

Secondary:
```text
improve_timed_up_and_go_score       Improve Timed Up and Go (TUG) score (<12s)
build_unilateral_carry_capacity     Build unilateral carry capacity
improve_3d_balance_under_fatigue    Improve 3D balance under fatigue
develop_multi_planar_core_stability Develop multi-planar core stability
optimise_joint_biomechanics         Optimise joint biomechanics
```

Key metrics: TUG score <12s; force plate 3D balance; unilateral carry % of bodyweight; farmer carry distance.

#### 13. Weight Management

```text
program_goal: fat_loss
mapping_status: approximate — shares enum with Fat Loss
demographics: Overweight adults, metabolic syndrome patients, post-dieting clients seeking stability
```

Primary:
```text
maintain_stable_healthy_weight      Maintain a stable healthy weight
avoid_weight_regain                 Avoid weight regain
build_sustainable_habits            Build sustainable habits
improve_metabolic_health            Improve metabolic health
reduce_emotional_eating             Reduce emotional eating
```

Secondary:
```text
normalise_leptin_ghrelin_levels     Normalise leptin and ghrelin levels
break_yo_yo_weight_cycling          Break yo-yo weight cycling
build_neat_activity_habits          Build NEAT activity habits
preserve_resting_metabolic_rate     Preserve resting metabolic rate
support_long_term_hormonal_balance  Support long-term hormonal balance
```

Key metrics: waist-to-hip ratio <0.90 (M)/<0.85 (F); SMMI preservation %; RMR tracking; 12-week weight trend.

#### 14. Pre / Postnatal Fitness

```text
program_goal: postnatal_core_reconditioning
mapping_status: direct
demographics: Pregnant women (all trimesters), postpartum individuals, athletic mothers
safety_flag: SAFETY_GATING.md Section 7 (Postnatal Hard Checks) applies unconditionally
```

Primary:
```text
stay_active_during_pregnancy        Stay active and fit during pregnancy
prepare_body_for_labour_and_birth   Prepare body for labour and birth
execute_safe_postpartum_return      Execute safe postpartum return
rebuild_core_strength_after_birth   Rebuild core strength after birth
reduce_discomfort_during_pregnancy  Reduce discomfort during pregnancy
```

Secondary:
```text
strengthen_transverse_abdominis     Strengthen transverse abdominis
manage_prevent_diastasis_recti      Manage and prevent Diastasis Recti
rehabilitate_pelvic_floor_dysfunction Rehabilitate pelvic floor dysfunction
manage_si_joint_pelvic_girdle_pain  Manage SI joint and pelvic girdle pain
avoid_loaded_oblique_twisting       Avoid loaded oblique twisting exercises — HARD SAFETY RULE
```

Key metrics: DR gap measurement (<2 finger-widths); maternal HR guidelines; ACOG ≥150 min/week; pelvic floor screen at 6 weeks.

**Critical:** selecting this goal must enforce `SAFETY_GATING.md` Section 7 at the repository level — `percent_1rm` prescriptions, high-impact, heavy-axial-loading, and uncontrolled-bracing exercises are rejected regardless of UI state.

#### 15. Youth Performance & Physical Literacy

```text
program_goal: NULL
mapping_status: MISSING — no enum value exists, must be added before program builder ships
demographics: Children and adolescents in youth sports, physical education, recreational play
```

Primary:
```text
build_physical_strength_safely      Build physical strength safely
improve_speed_and_agility           Improve speed and agility
develop_sport_skills                Develop sport skills
build_movement_confidence           Build movement confidence
improve_athletic_performance        Improve athletic performance
```

Secondary:
```text
progress_through_ltad_stage_model   Progress through LTAD stage model
build_multi_sport_motor_coordination Build multi-sport motor coordination
increase_bone_mineral_density       Increase bone mineral density
avoid_early_sports_specialisation   Avoid early sports specialisation
develop_psychosocial_self_efficacy  Develop psychosocial self-efficacy
```

Key metrics: LTAD stage progression; coach-to-youth ratio 1:10 max; FMS screen; multi-sport participation (3+ sports under age 12).

**BLOCKING:** this goal has no `ProgramGoal` value. See Section 6 below.

#### 16. Underweight / Safe Weight Gain

```text
program_goal: hypertrophy
mapping_status: approximate — shares enum with Muscle Gain
demographics: Ectomorphic hardgainers, clinical muscle-wasting recovery, weight-class athletes moving up
```

Primary:
```text
increase_total_body_mass            Increase total body mass
build_lean_muscle_tissue            Build lean muscle tissue
improve_physical_presence           Improve physical presence
gain_weight_healthily_and_steadily  Gain weight healthily and steadily
improve_appetite_consistency        Improve appetite consistency
```

Secondary:
```text
maintain_positive_caloric_surplus   Maintain positive caloric surplus (+250-500 kcal/day)
optimise_testosterone_cortisol_ratio Optimise testosterone-to-cortisol ratio
improve_gut_nutrient_absorption     Improve gut nutrient absorption
shorten_overnight_fasting_window    Shorten overnight fasting window
target_lean_mass_gain_per_week      Target 0.5-1 lb/week lean mass gain
```

Key metrics: +250–500 kcal/day surplus; protein 1.2–2.2 g/kg/day; 0.5–1 lb/week weight gain trend; SMMI increase via BIS.

### Section: Emerging 2026

#### 17. GLP-1 Companion Fitness

```text
program_goal: glp1_muscle_preservation
mapping_status: direct
demographics: Patients on Wegovy, Mounjaro, Ozempic; first-time or returning gym-goers during medical weight loss
```

Primary:
```text
preserve_lean_muscle_during_weight_loss Preserve lean muscle during weight loss
maintain_physical_strength              Maintain physical strength
protect_bone_density                    Protect bone density
keep_energy_levels_stable               Keep energy levels stable
build_safe_exercise_habit               Build a safe exercise habit
```

Secondary:
```text
achieve_80pct_fat_to_muscle_ratio   Achieve >=80% fat-to-muscle loss ratio — PRESERVATION INDEX <= 20%
prevent_medication_induced_muscle_crisis Prevent medication-induced muscle crisis
manage_nausea_fatigue_around_sessions    Manage nausea and fatigue around sessions
ensure_adequate_protein_hydration        Ensure adequate protein and hydration
monitor_dxa_skeletal_mass_regularly      Monitor DXA skeletal mass regularly
```

Key metrics: Preservation Index = (ΔLean/ΔTotal) × 100%, target ≤20%; DXA scans every 6–8 weeks; protein ≥1.6 g/kg/day.

#### 18. Longevity & Healthspan Coaching

```text
program_goal: longevity
mapping_status: direct
demographics: Proactive midlife adults, corporate executives, retirees slowing biological aging
```

Primary:
```text
slow_biological_aging_process       Slow biological aging process
preserve_cognitive_sharpness        Preserve cognitive sharpness
extend_healthy_active_years         Extend healthy active years
maintain_long_term_physical_independence Maintain long-term physical independence
improve_energy_and_vitality         Improve energy and vitality
```

Secondary:
```text
improve_mitochondrial_health        Improve mitochondrial health
reduce_dunedinpace_biological_age_rate Reduce DunedinPACE biological age rate
build_autonomic_nervous_system_resilience Build autonomic nervous system resilience
improve_gut_microbiome_through_exercise   Improve gut microbiome through exercise
support_deep_sleep_architecture     Support deep sleep architecture
```

Key metrics: DunedinPACE methylation clock rate; multi-omic panel; VO2 max index; wearable HRV + sleep.

#### 19. Neuro-Centric Movement Training

```text
program_goal: NULL
mapping_status: MISSING — no enum value exists, must be added before program builder ships
demographics: Chronic pain sufferers, post-concussion athletes, desk workers with notification fatigue, balance patients
```

Primary:
```text
reduce_chronic_movement_pain        Reduce chronic movement pain
improve_balance_and_coordination    Improve balance and coordination
improve_physical_confidence         Improve physical confidence
restore_full_movement_patterns      Restore full movement patterns
reduce_dizziness_spatial_instability Reduce dizziness or spatial instability
```

Secondary:
```text
improve_vor_gaze_stabilisation      Improve VOR gaze stabilisation
reduce_brain_threat_perception_movement Reduce brain threat perception of movement
reintegrate_sensory_triad           Re-integrate visual-vestibular-proprioceptive triad
improve_executive_attentional_control Improve executive attentional control
complete_calm_activate_prime_routines Complete Calm-Activate-Prime routines
```

Key metrics: VOR gaze stabilisation duration (s); cognitive reaction speed (ms); EEG headband focus scores; TSK-11.

**BLOCKING:** this goal has no `ProgramGoal` value. See Section 6 below.

## 6. IntakeGoal → ProgramGoal Mapping Table

### MVP decision: hybrid mapping contract

The 7 approximate mappings are **accepted for MVP, but not as generic behavior**. Each approximate mapping must include `mappingConfidence: "approximate"`, `programmingBias`, and `generationNotes` so the program builder does not treat different client intents as identical.

`IntakeGoal` = trainer/client selected intent. `ProgramGoal` = base programming engine track. `programmingBias` / `generationNotes` = required metadata to preserve intent specificity within a shared program track.

### Mapping contract shape

```ts
type GoalProgramMapping = {
  intakeGoalId:       IntakeGoalId;
  programGoal:        ProgramGoal;
  mappingConfidence:  "direct" | "approximate" | "unsupported";
  programmingBias?:   string;
  generationNotes?:   string;
  futureUpgradePath?: string;
};
```

All mapping logic lives in `lib/goals/mapping.ts`. No inline conditionals in the program builder or UI components.

### Resolved mapping table (19 goals)

| `intake_goal` | `program_goal` | `mappingConfidence` | `programmingBias` |
|---|---|---|---|
| `fat-loss` | `fat_loss` | `direct` | — |
| `muscle` | `hypertrophy` | `direct` | — |
| `strength` | `powerlifting_strength` | `direct` | — |
| `general` | `general_fitness` | `direct` | — |
| `rehab` | `rehab_return_to_training` | `direct` | — |
| `sports` | `sports_performance` | `direct` | — |
| `mobility` | `mobility` | `direct` | — |
| `postnatal` | `postnatal_core_reconditioning` | `direct` | — |
| `glp1` | `glp1_muscle_preservation` | `direct` | — |
| `longevity` | `longevity` | `direct` | — |
| `youth` | `youth_physical_literacy` | `direct` | — |
| `neuro` | `neuro_centric_movement` | `direct` | — |
| `mental` | `general_fitness` | `approximate` | `stress_resilience_recovery_adherence` |
| `cardio` | `general_fitness` | `approximate` | `cardiovascular_endurance` |
| `functional` | `general_fitness` | `approximate` | `movement_quality_daily_function` |
| `aesthetics` | `hypertrophy` | `approximate` | `physique_definition_symmetry` |
| `weight-mgmt` | `fat_loss` | `approximate` | `weight_behavior_maintenance` |
| `aging` | `longevity` | `approximate` | `older_adult_function_independence` |
| `underweight` | `hypertrophy` | `approximate` | `healthy_weight_gain_strength_foundation` |

**Summary:** 12 direct / 7 approximate with explicit bias metadata / 0 unsupported / 0 missing.

### The 7 approximate mappings — resolved decisions

**`mental` → `general_fitness`**
- `programmingBias`: `stress_resilience_recovery_adherence`
- `generationNotes`: Sessions prioritize HRV-friendly intensity, endorphin-optimal cardio volume, and adherence consistency over peak output. No competitive lifting templates.
- `futureUpgradePath`: Dedicated `mental_wellness` program goal if coaching library develops a distinct session format.

**`cardio` → `general_fitness`**
- `programmingBias`: `cardiovascular_endurance`
- `generationNotes`: Sessions skew toward Zone 2 aerobic base, progressive distance/duration targets, and VO2 max tracking. Strength volume is secondary.
- `futureUpgradePath`: Dedicated `cardio_endurance` program goal if endurance programming becomes specialized enough to warrant a separate template library.

**`functional` → `general_fitness`**
- `programmingBias`: `movement_quality_daily_function`
- `generationNotes`: Sessions emphasize compound movement patterns, carry drills, floor-to-stand progressions, and gait-quality metrics. Aesthetic goals absent.
- `futureUpgradePath`: Dedicated `functional_fitness` program goal if templates diverge enough from general fitness to require a separate track.

**`aesthetics` → `hypertrophy`**
- `programmingBias`: `physique_definition_symmetry`
- `generationNotes`: Sessions emphasize visual body composition over raw strength numbers — higher volume, moderate intensity, pose-aware exercise selection. When `achieve_low_target_body_fat_pct` or `achieve_competition_physique` sub-goals are selected, the generator applies `fat_loss` intensity biasing within the hypertrophy track.
- `futureUpgradePath`: Dedicated `aesthetics_physique` program goal if competition-prep and visual workflows become distinct from muscle-gain programming.

**`weight-mgmt` → `fat_loss`**
- `programmingBias`: `weight_behavior_maintenance`
- `generationNotes`: Sessions target sustainable habit-building, NEAT increase, and metabolic flexibility rather than aggressive deficit phases. Session intensity is moderate; adherence and long-term weight stability are the primary success metrics.
- `futureUpgradePath`: Dedicated `weight_management` program goal if maintenance/recomposition templates diverge meaningfully from fat-loss templates.

**`aging` → `longevity`**
- `programmingBias`: `older_adult_function_independence`
- `generationNotes`: Sessions prioritize balance, fall prevention, functional strength, and bone density over power or aesthetic output. Intensity scaling must accommodate older-adult recovery rates.
- `futureUpgradePath`: Stay under `longevity` unless older-adult programming needs a completely separate template library.

**`underweight` → `hypertrophy`**
- `programmingBias`: `healthy_weight_gain_strength_foundation`
- `generationNotes`: Sessions skew toward progressive overload for structural hypertrophy, caloric surplus support, and conservative volume progression. The session generator must not prescribe deficit phases or fat-loss cardio for this bias.
- `futureUpgradePath`: Dedicated `healthy_weight_gain` program goal if nutrition-integrated programming or clinical muscle-wasting workflows become distinct.

### `ProgramGoal` enum (12 values — final for MVP)

```ts
export type ProgramGoal =
  | "powerlifting_strength"
  | "hypertrophy"
  | "fat_loss"
  | "rehab_return_to_training"
  | "postnatal_core_reconditioning"
  | "sports_performance"
  | "general_fitness"
  | "mobility"
  | "longevity"
  | "glp1_muscle_preservation"
  | "youth_physical_literacy"   // added in Goal System 2.0
  | "neuro_centric_movement";   // added in Goal System 2.0
```

**12 values. No new values are added to resolve the 7 approximate mappings. `programmingBias` carries intent specificity instead.**

### Enum scalability decision

**MVP:** Taxonomy remains TypeScript-code-backed in `lib/goals/taxonomy.ts` and `lib/goals/mapping.ts` for type safety, test coverage, and deploy predictability. No dynamic reads from the database for taxonomy resolution at runtime.

**Production hardening:** Add mapping versioning and migration/backfill rules. Any change to a canonical `IntakeGoalId` requires a coordinated backfill of all `client_goal` rows referencing the old ID. Backfill scripts live in `scripts/` and must be reviewed before deployment.

**Future platform:** Move taxonomy to database-backed, tenant-aware, versioned taxonomy tables only after MVP is stable and per-tenant customization is a validated product requirement. Do not add database-backed taxonomy in MVP — the deployment and testing cost is not justified at this stage.

## 7. Goal Conflict Detection

Some `intake_goal` pairs are physiologically contradictory at high intensity and must be flagged before save.

| Conflicting pair | Conflict type | Reason |
|---|---|---|
| `fat-loss` + `muscle` | `soft` (advisory) | Aggressive fat loss and maximum muscle gain conflict at high intensity |
| `fat-loss` + `aesthetics` | `soft` (advisory) | Fat Loss and Aesthetics overlap; one should drive the program direction |
| `weight-mgmt` + `muscle` | `soft` (advisory) | Muscle gain needs a caloric surplus; confirm which goal drives the phase |
| `underweight` + `fat-loss` | `hard` (blocking) | Directly contradictory body mass directions |

> **Source of truth.** [`lib/goals/conflicts.ts`](../../lib/goals/conflicts.ts) (`GOAL_CONFLICT_RULES`) is authoritative for current conflict behavior. This section mirrors the live rule set as of 2026-07-05; if the two ever differ, the **code wins** and this document must be re-synced. The `fat-loss` + `aesthetics` and `weight-mgmt` + `muscle` soft rules were present in the code before this spec was reconciled (Phase 9B). The illustrative block below is kept in step with the code but is documentation, not the runtime rule set.

### Conflict resolution contract shape

Frontend must not branch on opaque strings like `"switch_to_recomposition"`. The resolution object carries enough structured data for the UI to render the correct intercept without parsing strings.

```ts
type GoalConflictResolution = {
  actionType:
    | "suggest_goal_bundle"
    | "suggest_primary_goal_change"
    | "show_warning"
    | "block_combination";
  message: string;
  suggestedPrimaryGoalId?:  IntakeGoalId;
  suggestedGoalIds?:        IntakeGoalId[];
  suggestedSubGoalIds?:     string[];
};

type GoalConflictRule = {
  pair:       [IntakeGoalId, IntakeGoalId];
  type:       "soft" | "hard";
  message:    string;
  resolution: GoalConflictResolution;
};

const GOAL_CONFLICT_RULES: GoalConflictRule[] = [
  {
    pair:    ["fat-loss", "muscle"],
    type:    "soft",
    message: "Body recomposition requires a precise nutrition balance. Confirm both goals are intentional or use the primary goal to set the training direction.",
    resolution: {
      actionType:          "suggest_goal_bundle",
      message:             "Consider a body recomposition approach: moderate caloric deficit, ≥2.0 g/kg/day protein, progressive overload.",
      suggestedGoalIds:    ["fat-loss", "muscle"],
      suggestedSubGoalIds: ["reduce_total_body_fat", "build_lean_muscle_mass"],
    },
  },
  {
    pair:    ["fat-loss", "aesthetics"],
    type:    "soft",
    message: "Fat Loss and Aesthetics overlap. Consider whether one drives the program or both are intentional.",
    resolution: {
      actionType: "show_warning",
      message:    "Fat Loss and Aesthetics overlap significantly. Consider using one as the primary goal to set a clear training direction.",
    },
  },
  {
    pair:    ["weight-mgmt", "muscle"],
    type:    "soft",
    message: "Weight management paired with muscle gain may require a caloric surplus strategy. Confirm direction with client.",
    resolution: {
      actionType:             "suggest_primary_goal_change",
      message:                "Muscle gain requires a caloric surplus. Confirm which goal drives the program phase.",
      suggestedPrimaryGoalId: "muscle",
    },
  },
  {
    pair:    ["underweight", "fat-loss"],
    type:    "hard",
    message: "Underweight and Fat Loss are contraindicated. Choose one direction: remove Fat Loss (client is underweight) or remove Safe Weight Gain (client is not in the underweight population).",
    resolution: {
      actionType:             "block_combination",
      message:                "Remove either \"fat-loss\" or \"underweight\" before continuing.",
      suggestedPrimaryGoalId: "underweight",
    },
  },
];
```

**Conflict type behavior:**
- `soft` — advisory banner, informational, non-blocking. Trainer can keep both goals; no acknowledgement required. The resolution object provides suggested content for the banner.
- `hard` — blocking intercept. Trainer must resolve before the form submits. Server also rejects on submit if hard conflicts reach the server unresolved.

Conflict detection runs at goal-save time, not just in the UI. The repository write path for `addClientGoal` must check `GOAL_CONFLICT_RULES` against the client's current active goal set before writing.

> **Server-side safety unchanged (Phase 9B).** This reconciliation is documentation-only. Server-side enforcement is untouched: `addClient` (`actions/clients.ts`) still rejects hard conflicts before ERP Customer creation, and postnatal/rehab safety gating still fires at goal-save time, exactly as shipped. No runtime behavior changed.

## 8. Urgency Classification

Every saved `client_goal` carries exactly one `urgency` value. This drives the post-save profile, the program builder's phase weighting, and the Client Hub's metric prioritization.

```text
urgent       → primary driver of current program phase; metrics tracked weekly; surfaces in Client Hub alerts
active_focus → actively programmed for, secondary priority; metrics tracked at microcycle boundaries
background   → acknowledged in client profile, not driving current program phase; metrics tracked at mesocycle boundaries
```

Storage must use `active_focus`. The UI may explain this value in friendlier copy, but `warm` is not a canonical storage value.

Exactly one goal per client should also carry `is_primary = true`, independent of urgency — a client can have an `urgent` secondary goal (e.g. acute knee pain) alongside an `is_primary` goal (e.g. fat loss) that is the longer-term program driver. These are deliberately separate fields: `urgency` answers "how time-sensitive is this," `is_primary` answers "which goal does the program template key off."

## 9. Post-Save Goal Profile

After `client_goal` rows are written, the Client Hub training zone (per `UI_UX_SPEC.md` Section 3) must be able to render:

```text
Goal summary cards
  one card per active goal
  urgency pill, primary badge, client + trainer sub-goal pills, trainer notes

Key metrics dashboard
  auto-populated from the union of key_metrics across all active goals
  capped per UI_UX_SPEC.md cognitive load limits (max 4 primary metrics)

Onboarding timeline
  phase-by-phase roadmap derived from the is_primary goal's ProgramGoal mapping
  uses PhaseType enum from 01_RELATIONAL_SCHEMA_AND_TAXONOMY.md

Next action buttons
  schedule first session
  generate program template (disabled if safetyState = blocked_downstream)
  set progress benchmarks
  send client intake form
```

The "generate program template" action must call `TrainingActionAvailabilityService.getActionAvailability` per `API_REPOSITORY_CONTRACT.md` Section 4 — it must not independently re-derive availability from `safetyState`.

## 10. Safety Interactions

Two goals carry mandatory safety interactions with `SAFETY_GATING.md` and must not be treated as plain taxonomy entries:

```text
postnatal
  → SAFETY_GATING.md Section 7 (Postnatal Hard Checks) is enforced unconditionally
  → percent_1rm prescriptions rejected
  → high_impact, heavy_axial_loading, uncontrolled_bracing contraindication tags rejected
  → cannot be overridden by goal urgency or is_primary status

rehab
  → SAFETY_GATING.md Section 4 (Safety Signal Matrix) "Rehab + pain note" rule applies
  → if a pain/injury trainer_notes entry exists alongside this goal, client.safetyState
    must transition to needs_review or blocked_downstream per the matrix
  → this transition must happen at goal-save time, not deferred to first workout creation
```

Selecting either goal in the intake UI must trigger the relevant repository-level policy check immediately, not only when the program builder later attempts to generate a program. A client should never be able to reach `blocked_downstream` only after a coach has already attempted automated programming.


## 11. Smart Accordion Card UX Contract

### Product Decision

The **Smart Accordion Card** is the approved goal-selection interaction model for FitDesk. It replaces native dropdown-heavy goal and sub-goal selection with a premium, progressive-disclosure pattern suitable for the 19-goal / 192-sub-goal taxonomy.

This UX contract is approved for **Phase 4C** implementation, after the Phase 4A taxonomy foundation is committed and after the Add Client persistence contract is confirmed.

### UX Purpose

The Smart Accordion Card exists to:

```text
reduce cognitive load across 19 goals and 192 sub-goals
make selected goals configurable without long enterprise-style forms
separate client-stated goals from trainer-assessed findings
support fast mobile-first Add Client capture
preserve the exactly-one-primary rule
surface conflicts and safety flags before save
```

### Default State

Goal options should be grouped by section:

```text
Core        → shown first and easiest to access
Specialist  → progressively disclosed
Emerging    → progressively disclosed with clear advanced/2026 context
```

The default view may present goals as chips or compact cards. Tapping a goal selects it and expands its configuration card. Native `<select>` dropdowns must not be the primary goal-selection interaction.

### Expanded Selected-Goal Card Structure

```text
Smart Goal Card
├─ Goal header
│  ├─ goal label
│  ├─ section badge: Core / Specialist / Emerging
│  └─ remove action
│
├─ Client-stated focus
│  └─ primary/client-stated sub-goal pills
│
├─ Trainer assessment
│  └─ secondary/trainer-assessed sub-goal pills
│     collapsed by default unless trainer chooses advanced assessment
│
├─ Program driver
│  └─ Set as primary program driver
│     exactly one selected goal may be primary
│
├─ Urgency
│  └─ Urgent / Active Focus / Background
│
└─ Safety / conflict message area
   └─ shown only when needed
```

### Data Rules

```text
Use canonical IntakeGoal values from this document.
Use SubGoalLayer = primary | secondary.
Primary/client-stated pills map only to primary sub-goals.
Secondary/trainer-assessed pills map only to secondary sub-goals.
Do not flatten all 192 sub-goals into one list.
Do not store the old warm label.
Canonical urgency storage values are urgent, active_focus, background.
```

### Validation Rules

```text
At least one selected goal is required when goal capture is enabled.
Exactly one selected goal must be is_primary.
Each selected sub-goal must belong to the selected goal.
Each selected sub-goal must be from the correct layer.
Conflict warnings must use GOAL_CONFLICT_RULES.
Safety warnings must use the canonical safety flags and safety interaction rules.
Safety warnings do not block Add Client in MVP unless a later approved safety rule says so.
```

### Mobile-First Behavior

```text
Use bottom-sheet or stacked-card interaction on mobile.
Avoid desktop-heavy dropdown patterns on mobile.
Sub-goal pills must be large enough for touch.
Trainer-assessed secondary sub-goals should be collapsed by default.
The trainer should be able to save a simple goal without configuring every advanced detail.
```

### Desktop Behavior

Desktop may use inline cards, a drawer, or a right-side configuration panel. The desktop version may show more content at once, but must still preserve the same structure and data rules as mobile.

### Visual Design Rules

```text
Use existing FitDesk design tokens and components.
Do not hardcode demo colors such as bg-slate-800, text-white, or blue-600.
Keep the tone premium, calm, simple, and fast.
Avoid dense enterprise-form styling.
Prefer chips, pills, soft cards, progressive disclosure, and clear action hierarchy.
```

### Implementation Boundary

This document approves the UX contract only. Do not implement the Smart Accordion runtime component until:

```text
Phase 4A taxonomy is committed
Add Client goal data contract is confirmed
client_goal and client_sub_goal persistence writes are approved
repository validation is approved
conflict/safety handling is wired at save time
```

Runtime implementation belongs to **Phase 4C Add Client Goal UX**.

### UX Acceptance Criteria

```text
Smart Accordion is documented as the approved goal-selection UX pattern.
Primary and secondary sub-goals are visually and structurally separated.
Exactly-one-primary rule is visible and enforceable.
Urgency values align with canonical storage: urgent, active_focus, background.
Conflict and safety message area is documented.
Mobile bottom-sheet / stacked-card behavior is documented.
Existing FitDesk design tokens are required.
Native select dropdowns are not the primary interaction.
Runtime implementation is explicitly deferred until Phase 4C.
```

## 12. Acceptance Criteria

```text
Coach can select 1 or more of the 19 intake goals for a client.
Coach can select client-stated and trainer-assessed sub-goals per selected goal.
Coach can set urgency (`urgent` / `active_focus` / `background`) per selected goal.
Coach can set exactly one goal as is_primary.
System detects and surfaces known goal conflicts before save.
System resolves every saved intake_goal to a program_goal via intake_goal_program_mapping,
  or explicitly surfaces "no program mapping exists" if program_goal is null.
Selecting postnatal or rehab triggers the relevant SAFETY_GATING.md check at save time.
Post-save profile renders goal summary, metrics dashboard, timeline, and action buttons
  per UI_UX_SPEC.md cognitive load limits.
All client_goal and client_sub_goal queries are tenant-scoped.
Smart Accordion Card is the approved goal-selection UX pattern for Phase 4C.
Primary and secondary sub-goals remain visually separated in the UI.
Mobile implementation uses bottom-sheet or stacked-card behavior, not desktop-heavy dropdowns.
```

## 13. Explicit Exclusions (Phase 1)

```text
No AI-assisted goal recommendation from free-text client descriptions (defer to Phase 4 per 06_IMPLEMENTATION_ROADMAP.md)
No automatic re-prioritization of urgency based on training data
No youth or neuro-centric program generation until ProgramGoal enum additions ship
No goal-history versioning (goal changes overwrite, audit via training_system_event only)
```

## 14. Suggested Commit Sequence

```text
feat(goals): add IntakeGoal, GoalSection, GoalUrgency, SubGoalLayer enums
feat(goals): add client_goal and client_sub_goal schema
feat(goals): add intake_goal_program_mapping table and seed data
feat(goals): add goal conflict detection rules
feat(goals): add postnatal/rehab safety gate triggers at goal-save time
feat(goals): add post-save goal profile payload endpoint
feat(programs): add youth_physical_literacy and neuro_centric_movement to ProgramGoal enum
```

## 15. Verification Checklist Before Staging

```text
Run tests.
Run lint.
Run build.
Verify every client_goal write requires ctx.tenantId.
Verify intake_goal_program_mapping is read from the DB table, not hardcoded in the builder.
Verify postnatal goal selection triggers SAFETY_GATING.md Section 7 at save time, not first workout.
Verify rehab + pain note combination transitions safetyState per the Signal Matrix.
Verify goal conflict rules reject silently-incompatible combinations at the repository level, not only in the UI.
Verify exactly one is_primary goal exists per client at any time.
Verify youth and neuro goals surface "no program mapping" rather than failing silently if ProgramGoal additions have not shipped yet.
```

## 16. Final Recommendation

```text
Do not build the program builder UI against the 19-goal intake taxonomy
  until the 2 missing ProgramGoal enum values are resolved.
Ship intake_goal_program_mapping as queryable data on day one —
  this is what prevents the next version of this exact gap from recurring
  when goal #20 gets added.
```
