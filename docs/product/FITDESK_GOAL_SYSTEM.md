# FitDesk Goal System 2.0 — Canonical Specification

```
Status: Draft restored from approved handover — requires product owner confirmation
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

Sub-goals refine what the client actually wants within a top-level goal. They are optional — a client may select a goal with no sub-goal.

There are two sub-goal layers:

- **Client-stated sub-goals** (`subGoalIds`) — what the client explicitly tells the trainer they want. Collected during Add Client intake. Stored in `client_goal.sub_goal_ids_json`.
- **Trainer-assessed sub-goals** (`trainerSubGoalIds`) — what the trainer identifies through assessment, intake form, or conversation. May differ from what the client stated. Stored in `client_goal.trainer_sub_goal_ids_json` (schema addition required — see Recovery Plan Phase 4.2).

### Core sub-goals

| Goal ID | Sub-goal ID | Label |
|---|---|---|
| `fat-loss` | `weight_loss_gradual` | Lose weight gradually |
| `fat-loss` | `fat_percentage_reduction` | Reduce body fat % |
| `fat-loss` | `improve_conditioning` | Improve conditioning |
| `muscle` | `hypertrophy` | Hypertrophy (size) |
| `muscle` | `lean_mass` | Lean muscle |
| `muscle` | `strength_and_size` | Strength + size |
| `strength` | `max_strength` | Increase max strength |
| `strength` | `powerlifting` | Powerlifting |
| `strength` | `functional_strength` | Functional strength |
| `general` | `overall_health` | Overall health & wellness |
| `general` | `energy_levels` | Boost daily energy |
| `general` | `stress_relief` | Reduce stress through exercise |
| `rehab` | `back_pain` | Back pain recovery |
| `rehab` | `knee_recovery` | Knee recovery |
| `rehab` | `shoulder_recovery` | Shoulder recovery |
| `rehab` | `post_surgery` | Post-surgery rehabilitation |
| `rehab` | `injury_prevention` | Injury prevention |
| `sports` | `speed_agility` | Speed & agility |
| `sports` | `sport_specific` | Sport-specific conditioning |
| `sports` | `explosive_power` | Explosive power |
| `mobility` | `flexibility` | General flexibility |
| `mobility` | `joint_health` | Joint health & range of motion |
| `mobility` | `yoga_pilates` | Yoga / Pilates integration |
| `mental` | `focus_concentration` | Focus & concentration |
| `mental` | `executive_performance` | Executive performance |
| `mental` | `sport_psychology` | Sport psychology |

### Specialist sub-goals

| Goal ID | Sub-goal ID | Label |
|---|---|---|
| `cardio` | `aerobic_base` | Build aerobic base |
| `cardio` | `race_prep` | Race / event preparation |
| `cardio` | `hiit` | HIIT & metabolic conditioning |
| `aesthetics` | `bodybuilding` | Natural bodybuilding |
| `aesthetics` | `physique_competition` | Physique competition |
| `aesthetics` | `photo_shoot_prep` | Photo shoot preparation |
| `aging` | `balance_fall_prevention` | Balance & fall prevention |
| `aging` | `bone_density` | Bone density & osteoporosis |
| `aging` | `active_aging` | Active aging & independence |
| `functional` | `daily_movement` | Better daily movement |
| `functional` | `carry_lift` | Carry & lift capacity |
| `functional` | `balance_coordination` | Balance & coordination |
| `weight-mgmt` | `weight_maintenance` | Long-term weight maintenance |
| `weight-mgmt` | `metabolic_health` | Metabolic health |
| `weight-mgmt` | `lifestyle_change` | Sustainable lifestyle change |
| `postnatal` | `prenatal_safe` | Prenatal safe exercise |
| `postnatal` | `postnatal_recovery` | Postnatal recovery |
| `postnatal` | `diastasis_recti` | Diastasis recti recovery |
| `youth` | `fundamental_movement` | Fundamental movement skills |
| `youth` | `sport_readiness` | Sport readiness |
| `youth` | `confidence_play` | Confidence through play |
| `underweight` | `healthy_weight_gain` | Healthy weight gain |
| `underweight` | `muscle_building_underweight` | Muscle building for underweight |
| `underweight` | `nutritional_recovery` | Nutritional recovery support |

### Emerging sub-goals

| Goal ID | Sub-goal ID | Label |
|---|---|---|
| `glp1` | `muscle_preservation` | Muscle preservation on GLP-1 |
| `glp1` | `metabolic_rate` | Maintain metabolic rate |
| `glp1` | `recomposition_support` | Recomposition support |
| `longevity` | `healthspan_extension` | Healthspan extension |
| `longevity` | `mobility_longevity` | Mobility for longevity |
| `longevity` | `cognitive_health` | Cognitive health through movement |
| `neuro` | `vestibular_training` | Vestibular & balance training |
| `neuro` | `proprioception` | Proprioception & body awareness |
| `neuro` | `neurological_rehab` | Neurological rehabilitation support |

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

It must **not** be implemented as scattered inline conditionals inside UI components or the program builder. All goal-to-program mapping logic must live in a single location: `lib/goals/program-map.ts` in MVP, and a database table queried at runtime in the long-term architecture.

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

**Sub-goal refinement:** Sub-goals may shift the recommended program template within a ProgramGoal. For example, `rehab` with `back_pain` sub-goal recommends a spine-focused program variant within `rehab_return_to_training`. This refinement logic lives in `lib/goals/program-map.ts`.

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

`AI_PARSE_ALLOWED_GOALS` in `lib/clients/ai-parse.ts` must be **derived** from the single canonical source in `lib/goals/constants.ts` — not a manual copy. The drift-guard test in `lib/clients/__tests__/ai-parse.test.ts` is the safety net during the transition period before the derivation is wired.

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

- [ ] `lib/goals/constants.ts` exports `GOALS` (19 entries with canonical IDs, labels, categories), `GoalValue`, `GOAL_CATEGORIES`, `SUB_GOALS`, `GOAL_SAFETY_FLAGS`
- [ ] `components/ui/GoalSelect.tsx` and `GoalMultiSelect.tsx` import from `lib/goals/constants.ts` (no self-defined constants)
- [ ] `AI_PARSE_ALLOWED_GOALS` is derived from `lib/goals/constants.ts`, not a manual copy
- [ ] `client_goal` table has `is_primary INTEGER NOT NULL DEFAULT 0` column
- [ ] `client_goal` table has `trainer_sub_goal_ids_json TEXT NOT NULL DEFAULT '[]'` column
- [ ] `createClientRow()` creates one `client_goal` row per selected goal, with exactly one `is_primary = 1`
- [ ] Sub-goals from the Add Client form are written to `client_goal.sub_goal_ids_json`
- [ ] Safety flags are computed at goal-save time from selected goals and written to `client_goal.safety_flags_json`
- [ ] `client_index.safety_state` is set at create time based on safety flags (never deferred to program generation)
- [ ] Soft conflict tips render inline in the Add Client goal section (non-blocking)
- [ ] Hard conflicts (`underweight` + `fat-loss`) block submit until trainer resolves direction
- [ ] Server-side hard conflict validation in `addClient()` rejects unresolved hard conflicts
- [ ] `intake_goal_program_mapping` static version in `lib/goals/program-map.ts` covers all 19 goals with the 10+7+2 mapping split
- [ ] `ProgramGoal` type has exactly 12 values including `youth_physical_literacy` and `neuro_centric_movement`
- [ ] Program generation respects `safetyState`: suppresses high-intensity templates for `prenatal_postnatal` and `injury_risk` flags
- [ ] Postnatal hard check: trainer must confirm prenatal/postnatal phase and medical clearance before program is recommended
- [ ] Client Hub renders primary goal card, secondary goals list, and safety review panel
- [ ] Safety review panel triggers `safety.reviewed` event and transitions `safety_state`
- [ ] All 19 canonical goal IDs appear in the AI parse allowed list
- [ ] AI parse drift-guard test passes with all 19 goal IDs
- [ ] All existing 406+ tests continue to pass
- [ ] `npm run build:verify` passes clean
