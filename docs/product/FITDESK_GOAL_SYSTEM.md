# FitDesk Goal System 2.0 — Canonical Specification

```
Status: Source-backed v2.0 — sub-goals from docs/research/FITDESK_GOAL_SYSTEM_FULL_SOURCE.md — requires product owner confirmation
Version: 2.0-draft
Date: 2026-06-16
Replaces: 7-goal flat taxonomy in components/ui/GoalSelect.tsx
```

---

## Overview

The Goal System is the spine of the FitDesk client record. It drives:

- Add Client intake form (goal selection + sub-goal refinement)
- Client Hub display (primary goal card, secondary goals)
- Program recommendation (`intake_goal_program_mapping`)
- AI parse targeting (allowed goals for free-text extraction)
- Safety gating (certain goals trigger safety checks at goal-save time — not at program generation)
- Reporting (goal distribution, completion signals)

**Single design rule:** Every client has exactly one primary goal and zero or more secondary goals. The primary goal drives program recommendation. Secondary goals inform session design but do not trigger a second program selection.

---

## 1. Canonical 19-Goal Taxonomy

Goal IDs are stable and must not change once written — changing an ID is a breaking migration requiring a coordinated backfill. The `label` is the display string shown to trainers and clients. `category` determines rendering order and grouping in the UI.

### Category: Core

> High-volume goals that every PT serves. Shown first in all selectors.

| ID | Label | Safety flags |
|---|---|---|
| `fat-loss` | Fat Loss | — |
| `muscle` | Muscle Gain | — |
| `strength` | Strength & Power | — |
| `general` | General Fitness | — |
| `rehab` | Rehabilitation & Recovery | `injury_risk` |
| `sports` | Sports Performance | — |
| `mobility` | Mobility & Flexibility | — |
| `mental` | Mental Performance & Focus | — |

### Category: Specialist

> Targeted populations or clinical adjacencies. Shown after Core in selectors. May carry safety flags.

| ID | Label | Safety flags |
|---|---|---|
| `cardio` | Cardiovascular Fitness | — |
| `aesthetics` | Aesthetics & Body Composition | — |
| `aging` | Healthy Aging | — |
| `functional` | Functional Fitness | — |
| `weight-mgmt` | Weight Management | — |
| `postnatal` | Pre & Postnatal Fitness | `prenatal_postnatal` |
| `youth` | Youth Physical Literacy | `youth_client` |
| `underweight` | Safe Weight Gain | — |

### Category: Emerging

> Newer or niche modalities. Shown last in selectors. Growing in demand; may be hidden behind a feature flag until sufficient PT coverage exists.

| ID | Label | Safety flags |
|---|---|---|
| `glp1` | GLP-1 Support & Muscle Preservation | `glp1_medication` |
| `longevity` | Longevity & Healthspan | — |
| `neuro` | Neuro-Centric Movement | `neurological` |

**Total: 19 goals** (8 Core + 8 Specialist + 3 Emerging)

---

## 2. Sub-Goal Lists

Source: `docs/research/FITDESK_GOAL_SYSTEM_FULL_SOURCE.md`

Sub-goals refine what the client actually wants within a top-level goal. They are optional — a client may select a goal with no sub-goal. Sub-goal rows are stored in the `client_sub_goal` table (`client_goal_id`, `sub_goal_key`, `layer`).

Two sub-goal layers:

- **Primary (client-stated)** — what the client articulates during Add Client intake. `layer = 'primary'` in `client_sub_goal`.
- **Secondary (trainer-assessed)** — what the trainer identifies through screening and assessment. `layer = 'secondary'` in `client_sub_goal`.

### Core goal sub-goals

#### fat-loss

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `reduce_total_body_fat` | Reduce total body fat |
| `improve_visible_muscle_definition` | Improve visible muscle definition |
| `increase_daily_activity_level` | Increase daily activity level |
| `improve_nutrition_habits` | Improve nutrition habits |
| `boost_daily_energy_levels` | Boost daily energy levels |
| `track_visceral_fat_reduction` | Track visceral fat reduction |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `preserve_skeletal_muscle_mass` | Preserve skeletal muscle mass (SMMI ≥ 7.5 kg/m² M / 6.7 kg/m² F) |
| `improve_insulin_sensitivity` | Improve insulin sensitivity |
| `manage_cortisol_stress_eating` | Manage cortisol and stress eating |
| `regulate_postprandial_glucose` | Regulate postprandial glucose |
| `maintain_resting_metabolic_rate` | Maintain resting metabolic rate |

#### muscle

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `build_lean_muscle_mass` | Build lean muscle mass |
| `improve_overall_body_shape` | Improve overall body shape |
| `increase_training_volume` | Increase training volume |
| `target_lagging_muscle_groups` | Target lagging muscle groups |
| `improve_body_symmetry` | Improve body symmetry |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `accelerate_muscle_protein_synthesis` | Accelerate muscle protein synthesis |
| `improve_mind_muscle_connection` | Improve mind-muscle connection |
| `reduce_junk_volume` | Reduce junk volume |
| `optimise_myofibrillar_density` | Optimise myofibrillar density |
| `optimise_sleep_for_recovery` | Optimise sleep for recovery |

#### strength

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `increase_1rm_compound_lifts` | Increase 1RM on compound lifts |
| `feel_physically_stronger` | Feel physically stronger |
| `improve_bar_technique` | Improve bar technique |
| `build_core_strength` | Build core strength |
| `improve_grip_strength` | Improve grip strength |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_rate_of_force_development` | Improve rate of force development |
| `improve_motor_unit_synchronisation` | Improve motor unit synchronisation |
| `build_unilateral_strength_balance` | Build unilateral strength balance |
| `strengthen_tendons_ligaments` | Strengthen tendons and ligaments |
| `improve_bar_velocity_tracking` | Improve bar velocity tracking |

#### general

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `improve_daily_energy_levels` | Improve daily energy levels |
| `build_consistent_routine` | Build a consistent routine |
| `reduce_physical_stiffness` | Reduce physical stiffness |
| `improve_overall_health_markers` | Improve overall health markers |
| `manage_body_weight` | Manage body weight |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_heart_rate_recovery` | Improve heart rate recovery (≥12 bpm drop, 1 min post-exercise) |
| `hit_weekly_activity_guidelines` | Hit weekly activity guidelines (≥150 min/week) |
| `reduce_sedentary_hours_daily` | Reduce sedentary hours daily |
| `develop_fundamental_movement_patterns` | Develop fundamental movement patterns |
| `build_metabolic_flexibility` | Build metabolic flexibility |
| `improve_daily_step_target` | Improve daily step target (7,000–10,000/day) |

#### rehab

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `return_to_sport_or_daily_activity` | Return to sport or daily activity |
| `reduce_movement_related_pain` | Reduce movement-related pain |
| `rebuild_physical_confidence` | Rebuild physical confidence |
| `restore_full_range_of_motion` | Restore full range of motion |
| `improve_balance_and_stability` | Improve balance and stability |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `achieve_limb_symmetry_index` | Achieve limb symmetry index ≥90% |
| `overcome_kinesiophobia` | Overcome kinesiophobia |
| `rebuild_joint_proprioception` | Rebuild joint proprioception |
| `correct_muscular_compensation` | Correct muscular compensation patterns |
| `desensitise_cns_movement_threats` | Desensitise CNS to movement threats |

#### sports

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `improve_sprint_speed` | Improve sprint speed |
| `increase_explosive_power` | Increase explosive power |
| `improve_multi_directional_agility` | Improve multi-directional agility |
| `improve_sport_specific_endurance` | Improve sport-specific endurance |
| `improve_vertical_jump` | Improve vertical jump |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_reaction_time_decision_speed` | Improve reaction time and decision speed |
| `improve_deceleration_mechanics` | Improve deceleration mechanics |
| `improve_cognitive_physical_coordination` | Improve cognitive-physical coordination |
| `build_unilateral_dynamic_balance` | Build unilateral dynamic balance |
| `maximise_rate_of_force_development` | Maximise rate of force development |

#### mobility

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `improve_overall_flexibility` | Improve overall flexibility |
| `reduce_joint_tightness` | Reduce joint tightness |
| `improve_posture` | Improve posture |
| `move_with_less_discomfort` | Move with less discomfort |
| `expand_active_range_of_motion` | Expand active range of motion |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_thoracic_spine_rotation` | Improve thoracic spine rotation |
| `improve_hip_flexor_length` | Improve hip flexor length |
| `improve_ankle_dorsiflexion` | Improve ankle dorsiflexion |
| `balance_length_tension_relationships` | Balance length-tension relationships |
| `resolve_positional_muscle_hypertonicity` | Resolve positional muscle hypertonicity |

#### mental

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `reduce_daily_stress` | Reduce daily stress |
| `improve_mood_and_outlook` | Improve mood and outlook |
| `improve_sleep_quality` | Improve sleep quality |
| `build_exercise_consistency` | Build exercise consistency |
| `increase_self_confidence` | Increase self-confidence |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `stimulate_bdnf_through_movement` | Stimulate BDNF through movement |
| `improve_hrv_trends` | Improve HRV trends |
| `regulate_cortisol_through_training` | Regulate cortisol through training |
| `shift_parasympathetic_balance` | Shift parasympathetic balance |
| `improve_post_workout_cognitive_clarity` | Improve post-workout cognitive clarity |

### Specialist goal sub-goals

#### cardio

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `improve_stamina_and_endurance` | Improve stamina and endurance |
| `run_or_cycle_longer_distances` | Run or cycle longer distances |
| `feel_less_breathless_daily` | Feel less breathless daily |
| `improve_cardiorespiratory_health` | Improve cardiorespiratory health |
| `increase_daily_step_count` | Increase daily step count |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_vo2_max_score` | Improve VO2 max score |
| `improve_zone2_aerobic_threshold` | Improve Zone 2 aerobic threshold |
| `increase_cardiac_stroke_volume` | Increase cardiac stroke volume |
| `drive_mitochondrial_biogenesis` | Drive mitochondrial biogenesis |
| `reduce_exercise_induced_arterial_stiffness` | Reduce exercise-induced arterial stiffness |

#### aesthetics

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `improve_muscle_definition_separation` | Improve muscle definition and separation |
| `achieve_low_target_body_fat_pct` | Achieve low target body fat percentage |
| `balance_muscle_symmetry` | Balance muscle symmetry |
| `achieve_competition_physique` | Achieve competition physique |
| `improve_visual_body_proportions` | Improve visual body proportions |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `correct_postural_imbalance_visual_lines` | Correct postural imbalance for visual lines |
| `manage_subcutaneous_fluid_retention` | Manage subcutaneous fluid retention |
| `selectively_hypertrophy_target_groups` | Selectively hypertrophy target muscle groups |
| `monitor_muscle_dysmorphia_signs` | Monitor for muscle dysmorphia signs |
| `maintain_hormonal_health_during_deficit` | Maintain hormonal health during deficit |

#### aging

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `maintain_physical_independence` | Maintain physical independence |
| `improve_balance_and_stability` | Improve balance and stability |
| `keep_muscle_mass_long_term` | Keep muscle mass long-term |
| `stay_active_and_mobile` | Stay active and mobile |
| `reduce_fall_risk` | Reduce fall risk |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_single_leg_balance_time` | Improve single-leg balance time (≥30s eyes-closed) |
| `track_gait_speed_improvement` | Track gait speed improvement (>1.0 m/s) |
| `maintain_grip_strength_benchmarks` | Maintain grip strength benchmarks |
| `support_bone_mineral_density` | Support bone mineral density |
| `prevent_age_related_sarcopenia` | Prevent age-related sarcopenia |

#### functional

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `lift_and_carry_without_pain` | Lift and carry without pain |
| `climb_stairs_with_ease` | Climb stairs with ease |
| `reduce_back_pain` | Reduce back pain |
| `improve_walking_endurance` | Improve walking endurance |
| `build_floor_to_stand_strength` | Build floor-to-stand strength |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_timed_up_and_go_score` | Improve Timed Up and Go (TUG) score (<12s) |
| `build_unilateral_carry_capacity` | Build unilateral carry capacity |
| `improve_3d_balance_under_fatigue` | Improve 3D balance under fatigue |
| `develop_multi_planar_core_stability` | Develop multi-planar core stability |
| `optimise_joint_biomechanics` | Optimise joint biomechanics |

#### weight-mgmt

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `maintain_stable_healthy_weight` | Maintain a stable healthy weight |
| `avoid_weight_regain` | Avoid weight regain |
| `build_sustainable_habits` | Build sustainable habits |
| `improve_metabolic_health` | Improve metabolic health |
| `reduce_emotional_eating` | Reduce emotional eating |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `normalise_leptin_ghrelin_levels` | Normalise leptin and ghrelin levels |
| `break_yo_yo_weight_cycling` | Break yo-yo weight cycling |
| `build_neat_activity_habits` | Build NEAT activity habits |
| `preserve_resting_metabolic_rate` | Preserve resting metabolic rate |
| `support_long_term_hormonal_balance` | Support long-term hormonal balance |

#### postnatal

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `stay_active_during_pregnancy` | Stay active and fit during pregnancy |
| `prepare_body_for_labour_and_birth` | Prepare body for labour and birth |
| `execute_safe_postpartum_return` | Execute safe postpartum return |
| `rebuild_core_strength_after_birth` | Rebuild core strength after birth |
| `reduce_discomfort_during_pregnancy` | Reduce discomfort during pregnancy |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `strengthen_transverse_abdominis` | Strengthen transverse abdominis |
| `manage_prevent_diastasis_recti` | Manage and prevent Diastasis Recti |
| `rehabilitate_pelvic_floor_dysfunction` | Rehabilitate pelvic floor dysfunction |
| `manage_si_joint_pelvic_girdle_pain` | Manage SI joint and pelvic girdle pain |
| `avoid_loaded_oblique_twisting` | Avoid loaded oblique twisting exercises |

#### youth

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `build_physical_strength_safely` | Build physical strength safely |
| `improve_speed_and_agility` | Improve speed and agility |
| `develop_sport_skills` | Develop sport skills |
| `build_movement_confidence` | Build movement confidence |
| `improve_athletic_performance` | Improve athletic performance |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `progress_through_ltad_stage_model` | Progress through LTAD stage model |
| `build_multi_sport_motor_coordination` | Build multi-sport motor coordination |
| `increase_bone_mineral_density` | Increase bone mineral density |
| `avoid_early_sports_specialisation` | Avoid early sports specialisation |
| `develop_psychosocial_self_efficacy` | Develop psychosocial self-efficacy |

#### underweight

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `increase_total_body_mass` | Increase total body mass |
| `build_lean_muscle_tissue` | Build lean muscle tissue |
| `improve_physical_presence` | Improve physical presence |
| `gain_weight_healthily_and_steadily` | Gain weight healthily and steadily |
| `improve_appetite_consistency` | Improve appetite consistency |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `maintain_positive_caloric_surplus` | Maintain positive caloric surplus (+250–500 kcal/day) |
| `optimise_testosterone_cortisol_ratio` | Optimise testosterone-to-cortisol ratio |
| `improve_gut_nutrient_absorption` | Improve gut nutrient absorption |
| `shorten_overnight_fasting_window` | Shorten overnight fasting window |
| `target_lean_mass_gain_per_week` | Target 0.5–1 lb/week lean mass gain |

### Emerging goal sub-goals

#### glp1

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `preserve_lean_muscle_during_weight_loss` | Preserve lean muscle during weight loss |
| `maintain_physical_strength` | Maintain physical strength |
| `protect_bone_density` | Protect bone density |
| `keep_energy_levels_stable` | Keep energy levels stable |
| `build_safe_exercise_habit` | Build a safe exercise habit |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `achieve_80pct_fat_to_muscle_ratio` | Achieve ≥80% fat-to-muscle loss ratio (Preservation Index ≤20%) |
| `prevent_medication_induced_muscle_crisis` | Prevent medication-induced muscle crisis |
| `manage_nausea_fatigue_around_sessions` | Manage nausea and fatigue around sessions |
| `ensure_adequate_protein_hydration` | Ensure adequate protein and hydration |
| `monitor_dxa_skeletal_mass_regularly` | Monitor DXA skeletal mass regularly |

#### longevity

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `slow_biological_aging_process` | Slow biological aging process |
| `preserve_cognitive_sharpness` | Preserve cognitive sharpness |
| `extend_healthy_active_years` | Extend healthy active years |
| `maintain_long_term_physical_independence` | Maintain long-term physical independence |
| `improve_energy_and_vitality` | Improve energy and vitality |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_mitochondrial_health` | Improve mitochondrial health |
| `reduce_dunedinpace_biological_age_rate` | Reduce DunedinPACE biological age rate |
| `build_autonomic_nervous_system_resilience` | Build autonomic nervous system resilience |
| `improve_gut_microbiome_through_exercise` | Improve gut microbiome through exercise |
| `support_deep_sleep_architecture` | Support deep sleep architecture |

#### neuro

**Primary (client-stated)**

| Sub-goal ID | Label |
|---|---|
| `reduce_chronic_movement_pain` | Reduce chronic movement pain |
| `improve_balance_and_coordination` | Improve balance and coordination |
| `improve_physical_confidence` | Improve physical confidence |
| `restore_full_movement_patterns` | Restore full movement patterns |
| `reduce_dizziness_spatial_instability` | Reduce dizziness or spatial instability |

**Secondary (trainer-assessed)**

| Sub-goal ID | Label |
|---|---|
| `improve_vor_gaze_stabilisation` | Improve VOR gaze stabilisation |
| `reduce_brain_threat_perception_movement` | Reduce brain threat perception of movement |
| `reintegrate_sensory_triad` | Re-integrate visual-vestibular-proprioceptive sensory triad |
| `improve_executive_attentional_control` | Improve executive attentional control |
| `complete_calm_activate_prime_routines` | Complete Calm-Activate-Prime routines |

---

## 3. Urgency Model

Each goal row has a single urgency value. Urgency affects display priority in the Client Hub.

| Value | Aliases | Meaning | Default |
|---|---|---|---|
| `urgent` | — | Time-sensitive (pre-competition, post-surgery window, event date) | — |
| `active_focus` | `warm` | Current primary training focus | ✓ (default for primary goal) |
| `background` | — | A goal the trainer notes but is not actively training toward | ✓ (default for secondary goals) |

**Rule:** The primary goal's urgency defaults to `active_focus`. Secondary goals default to `background`. The trainer may override either. The alias `warm` maps to `active_focus` in any legacy or external context that uses it.

---

## 4. Single-Primary Goal Rule

Every client record must have **exactly one primary goal** at all times after the intake form is submitted.

- Stored as `client_index.primary_goal_id` (references the `client_goal.id` of the primary row).
- The primary goal also has `client_goal.is_primary = 1`.
- If a trainer changes the primary goal, the old primary's `is_primary` is set to `0`.
- There is no "no primary goal" state for an active client.

**Enforcement levels:**
1. UI: The first goal selected in the multi-select is designated primary. The UI makes this visible and allows the trainer to change which goal is primary before submitting.
2. Server action: `addClient()` always writes exactly one `client_goal` row with `is_primary = 1`.
3. Repository: `createClientRow()` asserts that exactly one goal in the draft is marked primary. Throws if zero or multiple.
4. Database: `is_primary = 1` constraint enforced via application logic (not a SQL unique index because historical rows may have `is_primary = 0`).

---

## 5. Conflict Rules

Some goal combinations signal a potential mismatch that the trainer must acknowledge before saving.

### Soft conflicts (advisory — non-blocking)

Shown as an informational tip in the goal section. The trainer can keep both goals as-is; no checkbox required.

| Conflict pair | Trigger condition | Advisory message |
|---|---|---|
| `fat-loss` + `muscle` | Both selected simultaneously | "Body recomposition requires a precise nutrition balance. Confirm both goals are intentional or use the primary goal to set the training direction." |
| `fat-loss` + `aesthetics` | Both selected | "Fat Loss and Aesthetics overlap. Consider whether one drives the program or both are intentional." |
| `weight-mgmt` + `muscle` | Both selected | "Weight management paired with muscle gain may require a caloric surplus strategy. Confirm direction with client." |

The trainer may keep both goals selected by explicitly setting a primary goal. No form block.

### Hard conflicts (blocking — trainer must resolve before save)

Shown as a blocking banner. The trainer **must** choose one direction or explicitly acknowledge the incompatibility before the form can be submitted. The server also validates and rejects if an unresolved hard conflict is detected at submit time.

| Conflict pair | Trigger condition | Required resolution |
|---|---|---|
| `underweight` + `fat-loss` | Both selected simultaneously | Trainer must choose one direction: either remove `fat-loss` (client is underweight — fat loss is contraindicated) or remove `underweight` (client is not in the underweight population). System forces the choice before save. |

**Intercept type summary:**
- `soft` — informational tip, non-blocking, no acknowledgement required
- `hard` — blocking banner, trainer must remove one of the conflicting goals or explicitly choose a direction before the form submits

---

## 6. Safety Flags

### Trigger rules

Safety flags are computed server-side from the selected goal IDs and written atomically with the `client_goal` rows **at goal-save time** — not deferred to program generation.

**Safety checks must not be delayed until program generation.** Program generation must also respect `safetyState` and must not recommend programs that conflict with active safety flags.

| Safety flag ID | Trigger goal | Meaning | safety_state outcome |
|---|---|---|---|
| `injury_risk` | `rehab` | Client has or had an injury requiring rehabilitation | `needs_review` |
| `prenatal_postnatal` | `postnatal` | Client is pregnant or recently postpartum | `needs_review` |
| `neurological` | `neuro` | Client has a neurological condition | `needs_review` |
| `youth_client` | `youth` | Client is under 16; parental consent required | `needs_review` |
| `glp1_medication` | `glp1` | Client is on a GLP-1 medication (e.g. Ozempic, Wegovy) | `needs_review` |

### safety_state values

| Value | Meaning |
|---|---|
| `clear` | No safety flags; standard onboarding proceeds |
| `needs_review` | At least one safety flag present; trainer must review and log a safety note before the client's first session |
| `blocked_downstream` | Safety review completed; a downstream action is blocked pending further clearance (e.g. payment link on hold, high-intensity program suppressed) |

### Severity-based transitions

**Rehab goal (`injury_risk` flag):**
- At intake: `safetyState` transitions to `needs_review`.
- After trainer logs a safety note: if the note indicates acute or unstable injury, a senior trainer or the trainer themselves may escalate to `blocked_downstream`, which suppresses high-intensity program recommendations and blocks certain downstream actions until cleared.
- If the note indicates managed or resolved condition: status may transition to `clear`.

**Postnatal goal (`prenatal_postnatal` flag):**
- At intake: `safetyState` transitions to `needs_review`.
- The system enforces a **postnatal hard check**: the trainer must explicitly confirm the phase (prenatal / postnatal), weeks postpartum if applicable, and whether medical clearance has been obtained. This confirmation is required before any program is recommended.
- Programs recommended for `postnatal` goal must only draw from `postnatal_core_reconditioning` program template. No high-intensity or strength-focused templates may be auto-recommended while `prenatal_postnatal` flag is active.

### Safety note requirement

When `safety_state = 'needs_review'`, the Client Hub renders a safety review panel. The trainer must write a free-text safety note and mark it acknowledged before status transitions. This note is stored as a `client_event` of type `safety.reviewed`.

### At Add Client time

Safety flags are computed server-side from selected goal IDs and written atomically with the `client_goal` rows in the same database transaction. The trainer sees a summary of flags in the Add Client success state. The `safety_state` is written to `client_index` in the same transaction.

**Safety checks do not block the Add Client form.** They are informational at intake. The gate is enforced in the Client Hub review flow before program assignment.

---

## 7. ProgramGoal Mapping (`intake_goal_program_mapping`)

`intake_goal_program_mapping` is the **future queryable, data-driven source of truth** that maps intake goal IDs to recommended training program templates.

It must **not** be implemented as scattered inline conditionals inside UI components or the program builder. All goal-to-program mapping logic must live in a single location: `lib/goals/mapping.ts` in MVP, and a database table queried at runtime in the long-term architecture.

The long-term architecture enables:
- Per-tenant program customization
- A/B testing of program recommendations
- Dynamic addition of new program templates without a code deployment

### Approved ProgramGoal values (12 total)

`ProgramGoal` is a separate type from intake goal IDs. A single intake goal maps to one ProgramGoal (with possible sub-goal-driven alternates).

| ProgramGoal ID | Label |
|---|---|
| `powerlifting_strength` | Strength & Powerlifting Program |
| `hypertrophy` | Hypertrophy & Muscle Building Program |
| `fat_loss` | Fat Loss Program |
| `rehab_return_to_training` | Rehabilitation & Return to Training |
| `postnatal_core_reconditioning` | Pre & Postnatal Core Reconditioning |
| `sports_performance` | Sports Performance Program |
| `general_fitness` | General Fitness Program |
| `mobility` | Mobility & Flexibility Program |
| `longevity` | Longevity & Healthspan Program |
| `glp1_muscle_preservation` | GLP-1 Muscle Preservation Program |
| `youth_physical_literacy` | Youth Physical Literacy Program |
| `neuro_centric_movement` | Neuro-Centric Movement Program |

### Mapping summary

| Category | Count | Notes |
|---|---|---|
| Direct (1:1 to an existing ProgramGoal) | 10 | Single canonical mapping |
| Approximate / shared (maps to an existing ProgramGoal also used by another goal) | 7 | Shared template; sub-goals may refine |
| Missing (no ProgramGoal until new values added) | 2 | `youth` and `neuro` — resolved by adding `youth_physical_literacy` and `neuro_centric_movement` |

### Intake → ProgramGoal mapping (MVP static version)

```
Direct mappings (10):
  fat-loss     → fat_loss
  muscle       → hypertrophy
  strength     → powerlifting_strength
  rehab        → rehab_return_to_training
  sports       → sports_performance
  mobility     → mobility
  general      → general_fitness
  postnatal    → postnatal_core_reconditioning
  glp1         → glp1_muscle_preservation
  longevity    → longevity

Approximate / shared mappings (7):
  cardio       → general_fitness          (shared with general)
  aesthetics   → hypertrophy              (shared with muscle; fat_loss if cut-focused)
  aging        → longevity                (shared with longevity)
  functional   → general_fitness          (shared with general)
  weight-mgmt  → fat_loss                 (shared with fat-loss; weight maintenance direction)
  mental       → general_fitness          (approximate; no dedicated mental program yet)
  underweight  → hypertrophy              (approximate; safe weight gain follows hypertrophy pattern)

Missing mappings (resolved by adding new ProgramGoal values):
  youth        → youth_physical_literacy  (NEW ProgramGoal added in Goal System 2.0)
  neuro        → neuro_centric_movement   (NEW ProgramGoal added in Goal System 2.0)
```

**Sub-goal refinement:** Sub-goals may shift the recommended program template within a ProgramGoal. For example, `rehab` with `return_to_sport_or_daily_activity` sub-goal recommends a return-to-training variant within `rehab_return_to_training`. This refinement logic lives in `lib/goals/mapping.ts`.

**Safety gate on program generation:** When `client_index.safety_state` is `needs_review` or `blocked_downstream`, program generation must:
- Skip auto-recommendation until the safety note is logged
- Suppress high-intensity program templates for clients with `prenatal_postnatal` or `injury_risk` flags
- Surface the safety state clearly in any program recommendation UI

---

## 8. AI Parsing Rules

The AI parse system (`lib/clients/ai-parse.ts`) extracts structured goal data from free-form trainer text. These rules govern what the AI may and may not do.

### Allowed

- Extract one or more goal IDs from the canonical 19-goal list
- Assign a single confidence level to the extracted goal set
- Return `null` for goals if the text does not mention fitness objectives

### Not allowed

- Invent goal IDs not in the canonical 19-goal list
- Extract sub-goals (sub-goal selection is trainer-directed only)
- Extract urgency (urgency is trainer-set, not AI-inferred)
- Extract safety flags (safety flag derivation is system-computed from goal selection, not AI-inferred)
- Pre-fill medical, injury, or billing information

### Canonical allowed list

`AI_PARSE_ALLOWED_GOALS` in `lib/clients/ai-parse.ts` must be **derived** from the single canonical source in `lib/goals/taxonomy.ts` — not a manual copy. The drift-guard test in `lib/clients/__tests__/ai-parse.test.ts` is the safety net during the transition period before the derivation is wired.

### Confidence handling

Each goal extraction returns a single confidence level for the entire goals array:
- `high` — goals clearly stated in the text ("she wants to lose weight and build muscle")
- `medium` — goals reasonably inferred ("she mentioned she's training for a 5K")
- `low` — goals weakly suggested
- `unknown` — no usable goal signal

### Fallback

If the AI cannot identify any canonical goal ID, `goals.value = []` and `goals.confidence = 'unknown'`. The form remains fully editable. The trainer selects goals manually.

---

## 9. Add Client UX Rules

### Goal selection step

- Use a multi-select chip grid showing all 19 goals, grouped by category (Core first, then Specialist, then Emerging)
- Trainer selects at least one goal before proceeding (not strictly required in MVP — can submit with no goal; `primary_goal_id` will be null)
- First selected goal is automatically designated as primary; primary designation is visible (e.g. "Primary" badge on the first chip)
- Trainer may tap a secondary goal chip to promote it to primary
- Sub-goals appear below a goal chip when that goal has sub-options and is selected
- Sub-goal selection is optional

### Conflict intercepts

- Soft conflict tips are shown inline in the goal section (non-blocking; no acknowledgement required)
- Hard conflicts block the form submit. The trainer must remove one conflicting goal or explicitly choose a direction before submitting. Hard conflict resolution is validated both client-side and server-side.
- Conflict checks run client-side when goals change; server-side validation is the safety net

### Safety flag preview

When a goal with safety flags is selected, a safety notice appears below the goal section:

> "This goal includes a safety check. You'll be prompted to log a safety note in the Client Hub after the client is added."

This is informational only — it does not block the Add Client form. Safety review happens in the Client Hub after the client is created.

### Goals in the AI quick-add flow

- AI parse may prefill goal chips; pre-filled chips show a confidence indicator (solid chip = high/medium; dashed chip = low)
- Trainer reviews and modifies prefilled goals before submitting
- Sub-goals are never prefilled by AI

---

## 10. Client Hub Rendering Rules

### Primary goal card

The primary goal is rendered prominently in the Client Hub:
- Goal label (e.g. "Muscle Gain")
- Urgency badge (Urgent / Active Focus / Background)
- Primary sub-goals (up to 3 displayed)
- Recommended program badge (from `intake_goal_program_mapping`) — suppressed if `safetyState = 'needs_review'` or `'blocked_downstream'`
- Safety flag indicator if present

### Secondary goals

Secondary goals are listed below the primary goal card:
- Compact row per goal
- Label + urgency badge
- No sub-goal expansion in the summary view

### Safety review panel

Shown when `client_index.safety_state = 'needs_review'`:
- Prominent banner at top of Client Hub
- Lists active safety flags with plain-language explanations
- "Log safety note" action → opens a text input
- Once submitted, records a `client_event` of type `safety.reviewed` and transitions `safety_state` based on trainer assessment
- Panel dismisses when the trainer acknowledges

---

## 11. Acceptance Criteria

Goal System 2.0 is complete when:

- [ ] `lib/goals/taxonomy.ts` exports `GOALS` (19 entries), `IntakeGoalId`, `GoalSection`, `SubGoalLayer`, `SUB_GOALS`, `GOAL_SAFETY_FLAGS`, `LEGACY_GOAL_ALIASES`, `LEGACY_SUBGOAL_ALIASES`
- [ ] `lib/goals/mapping.ts` exports `ProgramGoal`, `INTAKE_GOAL_PROGRAM_MAP`, `resolveProgramGoal`
- [ ] `components/ui/GoalSelect.tsx` and `GoalMultiSelect.tsx` import from `lib/goals/taxonomy.ts` (no self-defined constants)
- [ ] `AI_PARSE_ALLOWED_GOALS` is derived from `lib/goals/taxonomy.ts`, not a manual copy
- [ ] `client_goal` table has `is_primary INTEGER NOT NULL DEFAULT 0` column
- [ ] `client_goal` table has `trainer_sub_goal_ids_json TEXT NOT NULL DEFAULT '[]'` column
- [ ] `createClientRow()` creates one `client_goal` row per selected goal, with exactly one `is_primary = 1`
- [ ] Sub-goals from the Add Client form are written to `client_goal.sub_goal_ids_json`
- [ ] Safety flags are computed at goal-save time from selected goals and written to `client_goal.safety_flags_json`
- [ ] `client_index.safety_state` is set at create time based on safety flags (never deferred to program generation)
- [ ] Soft conflict tips render inline in the Add Client goal section (non-blocking)
- [ ] Hard conflicts (`underweight` + `fat-loss`) block submit until trainer resolves direction
- [ ] Server-side hard conflict validation in `addClient()` rejects unresolved hard conflicts
- [ ] `intake_goal_program_mapping` static version in `lib/goals/mapping.ts` covers all 19 goals with the 10+7+2 mapping split
- [ ] `ProgramGoal` type has exactly 12 values including `youth_physical_literacy` and `neuro_centric_movement`
- [ ] Program generation respects `safetyState`: suppresses high-intensity templates for `prenatal_postnatal` and `injury_risk` flags
- [ ] Postnatal hard check: trainer must confirm prenatal/postnatal phase and medical clearance before program is recommended
- [ ] Client Hub renders primary goal card, secondary goals list, and safety review panel
- [ ] Safety review panel triggers `safety.reviewed` event and transitions `safety_state`
- [ ] All 19 canonical goal IDs appear in the AI parse allowed list
- [ ] AI parse drift-guard test passes with all 19 goal IDs
- [ ] All existing 406+ tests continue to pass
- [ ] `npm run build:verify` passes clean
