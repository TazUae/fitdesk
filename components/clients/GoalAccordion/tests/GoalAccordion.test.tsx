/**
 * Phase 4C-A — GoalAccordion behavioral tests.
 *
 * Tests the pure state update functions and the taxonomy/conflict/safety data
 * contracts that drive the component's behavior. No DOM rendering (RTL not
 * installed). All component behaviors that map to state transitions are covered.
 * Trainer assessment expand/collapse is local UI state — tested via aria contract only.
 */

import { describe, expect, it } from 'vitest'
import { GOALS, GOAL_SECTIONS, getSubGoals } from '@/lib/goals/taxonomy'
import { detectConflicts, hasUnresolvedHardConflict } from '@/lib/goals/conflicts'
import { computeSafetyFlags } from '@/lib/goals/safety'
import {
  emptyGoalState,
  addGoal,
  removeGoal,
  setPrimaryGoal,
  togglePrimarySubGoal,
  toggleTrainerSubGoal,
  setGoalUrgency,
  setGoalNotes,
  defaultSectionExpansion,
  toggleSectionExpansion,
  toSelectedGoalDrafts,
  type GoalSelectionState,
} from '../types'

// ─── Taxonomy: goal groupings ─────────────────────────────────────────────────

describe('Goal taxonomy — groupings rendered by GoalAccordion', () => {
  it('renders all 3 sections: Core, Specialist, Emerging', () => {
    expect(GOAL_SECTIONS).toEqual(['core', 'specialist', 'emerging'])
  })

  it('renders all 19 canonical goals', () => {
    expect(GOALS).toHaveLength(19)
  })

  it('groups Core goals (8)', () => {
    const core = GOALS.filter(g => g.section === 'core')
    expect(core).toHaveLength(8)
    const ids = core.map(g => g.id)
    expect(ids).toContain('fat-loss')
    expect(ids).toContain('muscle')
    expect(ids).toContain('strength')
    expect(ids).toContain('general')
    expect(ids).toContain('rehab')
    expect(ids).toContain('sports')
    expect(ids).toContain('mobility')
    expect(ids).toContain('mental')
  })

  it('groups Specialist goals (8)', () => {
    const specialist = GOALS.filter(g => g.section === 'specialist')
    expect(specialist).toHaveLength(8)
    const ids = specialist.map(g => g.id)
    expect(ids).toContain('cardio')
    expect(ids).toContain('aesthetics')
    expect(ids).toContain('aging')
    expect(ids).toContain('functional')
    expect(ids).toContain('weight-mgmt')
    expect(ids).toContain('postnatal')
    expect(ids).toContain('youth')
    expect(ids).toContain('underweight')
  })

  it('groups Emerging goals (3)', () => {
    const emerging = GOALS.filter(g => g.section === 'emerging')
    expect(emerging).toHaveLength(3)
    const ids = emerging.map(g => g.id)
    expect(ids).toContain('glp1')
    expect(ids).toContain('longevity')
    expect(ids).toContain('neuro')
  })
})

// ─── State: selecting and deselecting goals ───────────────────────────────────

describe('Selecting a goal adds it to selected[] (card expands)', () => {
  it('adds a new SelectedGoalConfig when goal is not yet selected', () => {
    const state = addGoal(emptyGoalState(), 'fat-loss')
    expect(state.selected).toHaveLength(1)
    expect(state.selected[0].goalId).toBe('fat-loss')
  })

  it('is idempotent — selecting the same goal twice does not duplicate it', () => {
    const once  = addGoal(emptyGoalState(), 'fat-loss')
    const twice = addGoal(once, 'fat-loss')
    expect(twice.selected).toHaveLength(1)
  })

  it('new goal defaults: primarySubGoalIds=[], trainerSubGoalIds=[], urgency=active_focus', () => {
    const state = addGoal(emptyGoalState(), 'muscle')
    const config = state.selected[0]
    expect(config.primarySubGoalIds).toEqual([])
    expect(config.trainerSubGoalIds).toEqual([])
    expect(config.urgency).toBe('active_focus')
  })

  it('multiple goals can be selected', () => {
    let state = emptyGoalState()
    state = addGoal(state, 'fat-loss')
    state = addGoal(state, 'strength')
    state = addGoal(state, 'cardio')
    expect(state.selected).toHaveLength(3)
  })
})

describe('Removing a selected goal removes its card', () => {
  it('removes the goal from selected[]', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = removeGoal(state, 'fat-loss')
    expect(state.selected).toHaveLength(0)
  })

  it('removing a non-selected goal is a no-op', () => {
    const state = addGoal(emptyGoalState(), 'fat-loss')
    const same  = removeGoal(state, 'muscle')
    expect(same.selected).toHaveLength(1)
  })

  it('preserves other selected goals', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    state = removeGoal(state, 'fat-loss')
    expect(state.selected).toHaveLength(1)
    expect(state.selected[0].goalId).toBe('strength')
  })
})

// ─── State: primary goal (exactly-one-primary) ────────────────────────────────

describe('Exactly-one-primary goal behavior', () => {
  it('setPrimaryGoal sets primaryGoalId', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setPrimaryGoal(state, 'fat-loss')
    expect(state.primaryGoalId).toBe('fat-loss')
  })

  it('setPrimaryGoal replaces any previous primary', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    state = setPrimaryGoal(state, 'fat-loss')
    state = setPrimaryGoal(state, 'strength')
    expect(state.primaryGoalId).toBe('strength')
  })

  it('deselecting the current primary clears primaryGoalId to null', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setPrimaryGoal(state, 'fat-loss')
    state = removeGoal(state, 'fat-loss')
    expect(state.primaryGoalId).toBeNull()
  })

  it('deselecting a non-primary goal does not change primaryGoalId', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'muscle')
    state = setPrimaryGoal(state, 'fat-loss')
    state = removeGoal(state, 'muscle')
    expect(state.primaryGoalId).toBe('fat-loss')
  })

  it('initially primaryGoalId is null', () => {
    expect(emptyGoalState().primaryGoalId).toBeNull()
  })
})

// ─── State: sub-goals — primary (client-stated) layer ────────────────────────

describe('Primary sub-goal pills come only from layer=primary', () => {
  it('getSubGoals returns only primary-layer sub-goals when layer=primary', () => {
    const primary = getSubGoals('fat-loss', 'primary')
    expect(primary.length).toBeGreaterThan(0)
    expect(primary.every(sg => sg.layer === 'primary')).toBe(true)
  })

  it('togglePrimarySubGoal adds a sub-goal to primarySubGoalIds', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    expect(state.selected[0].primarySubGoalIds).toContain('reduce_total_body_fat')
  })

  it('togglePrimarySubGoal removes a sub-goal when already selected (toggle off)', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    expect(state.selected[0].primarySubGoalIds).not.toContain('reduce_total_body_fat')
  })

  it('multiple primary sub-goals can be selected for the same goal', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    state = togglePrimarySubGoal(state, 'fat-loss', 'boost_daily_energy_levels')
    expect(state.selected[0].primarySubGoalIds).toHaveLength(2)
  })

  it('togglePrimarySubGoal does not affect trainerSubGoalIds', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    expect(state.selected[0].trainerSubGoalIds).toEqual([])
  })

  it('primary sub-goals do NOT appear in secondary layer', () => {
    const primaryIds = getSubGoals('fat-loss', 'primary').map(sg => sg.id)
    const secondary  = getSubGoals('fat-loss', 'secondary')
    const overlap    = secondary.filter(sg => primaryIds.includes(sg.id))
    expect(overlap).toHaveLength(0)
  })
})

// ─── State: sub-goals — secondary (trainer-assessed) layer ───────────────────

describe('Trainer-assessed sub-goal pills come only from layer=secondary', () => {
  it('getSubGoals returns only secondary-layer sub-goals when layer=secondary', () => {
    const secondary = getSubGoals('fat-loss', 'secondary')
    expect(secondary.length).toBeGreaterThan(0)
    expect(secondary.every(sg => sg.layer === 'secondary')).toBe(true)
  })

  it('toggleTrainerSubGoal adds a sub-goal to trainerSubGoalIds', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = toggleTrainerSubGoal(state, 'fat-loss', 'preserve_skeletal_muscle_mass')
    expect(state.selected[0].trainerSubGoalIds).toContain('preserve_skeletal_muscle_mass')
  })

  it('toggleTrainerSubGoal removes a sub-goal when already selected (toggle off)', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = toggleTrainerSubGoal(state, 'fat-loss', 'preserve_skeletal_muscle_mass')
    state = toggleTrainerSubGoal(state, 'fat-loss', 'preserve_skeletal_muscle_mass')
    expect(state.selected[0].trainerSubGoalIds).not.toContain('preserve_skeletal_muscle_mass')
  })

  it('toggleTrainerSubGoal does not affect primarySubGoalIds', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = toggleTrainerSubGoal(state, 'fat-loss', 'preserve_skeletal_muscle_mass')
    expect(state.selected[0].primarySubGoalIds).toEqual([])
  })

  it('trainer sub-goals do NOT appear in primary layer', () => {
    const secondaryIds = getSubGoals('fat-loss', 'secondary').map(sg => sg.id)
    const primary      = getSubGoals('fat-loss', 'primary')
    const overlap      = primary.filter(sg => secondaryIds.includes(sg.id))
    expect(overlap).toHaveLength(0)
  })

  it('trainer assessment section is collapsed by default (trainerSubGoalIds starts empty)', () => {
    const state = addGoal(emptyGoalState(), 'fat-loss')
    expect(state.selected[0].trainerSubGoalIds).toEqual([])
  })
})

// ─── State: urgency ───────────────────────────────────────────────────────────

describe('Urgency per selected goal', () => {
  it('defaults to active_focus on add', () => {
    const state = addGoal(emptyGoalState(), 'fat-loss')
    expect(state.selected[0].urgency).toBe('active_focus')
  })

  it('can be changed to urgent', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalUrgency(state, 'fat-loss', 'urgent')
    expect(state.selected[0].urgency).toBe('urgent')
  })

  it('can be changed to background', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalUrgency(state, 'fat-loss', 'background')
    expect(state.selected[0].urgency).toBe('background')
  })

  it('changing urgency on one goal does not affect other goals', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    state = setGoalUrgency(state, 'fat-loss', 'urgent')
    const strength = state.selected.find(s => s.goalId === 'strength')
    expect(strength?.urgency).toBe('active_focus')
  })
})

// ─── Conflicts: soft and hard ─────────────────────────────────────────────────

describe('Conflict detection — soft conflicts (non-blocking)', () => {
  it('fat-loss + muscle generates a soft conflict', () => {
    const conflicts = detectConflicts(['fat-loss', 'muscle'])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].type).toBe('soft')
  })

  it('fat-loss + aesthetics generates a soft conflict', () => {
    const conflicts = detectConflicts(['fat-loss', 'aesthetics'])
    const soft = conflicts.find(c => c.type === 'soft')
    expect(soft).toBeDefined()
  })

  it('weight-mgmt + muscle generates a soft conflict', () => {
    const conflicts = detectConflicts(['weight-mgmt', 'muscle'])
    const soft = conflicts.find(c => c.type === 'soft')
    expect(soft).toBeDefined()
  })

  it('soft conflicts do NOT block combination', () => {
    expect(hasUnresolvedHardConflict(['fat-loss', 'muscle'])).toBe(false)
  })

  it('no conflicts for a single goal', () => {
    expect(detectConflicts(['fat-loss'])).toHaveLength(0)
  })

  it('no conflicts for compatible goals', () => {
    expect(detectConflicts(['strength', 'cardio'])).toHaveLength(0)
  })
})

describe('Conflict detection — hard conflict (blocking)', () => {
  it('underweight + fat-loss generates a hard conflict', () => {
    const conflicts = detectConflicts(['underweight', 'fat-loss'])
    const hard = conflicts.find(c => c.type === 'hard')
    expect(hard).toBeDefined()
  })

  it('hasUnresolvedHardConflict returns true for underweight + fat-loss', () => {
    expect(hasUnresolvedHardConflict(['underweight', 'fat-loss'])).toBe(true)
  })

  it('hasUnresolvedHardConflict returns false when hard conflict is removed', () => {
    expect(hasUnresolvedHardConflict(['underweight'])).toBe(false)
    expect(hasUnresolvedHardConflict(['fat-loss'])).toBe(false)
  })

  it('hard conflict has block_combination resolution action type', () => {
    const conflicts = detectConflicts(['underweight', 'fat-loss'])
    const hard = conflicts.find(c => c.type === 'hard')
    expect(hard?.resolution.actionType).toBe('block_combination')
  })
})

// ─── Safety advisories ────────────────────────────────────────────────────────

describe('Safety advisories — display-only, non-blocking', () => {
  it('rehab goal triggers injury_risk safety flag', () => {
    const flags = computeSafetyFlags(['rehab'])
    expect(flags.some(f => f.id === 'injury_risk')).toBe(true)
  })

  it('postnatal goal triggers prenatal_postnatal safety flag', () => {
    const flags = computeSafetyFlags(['postnatal'])
    expect(flags.some(f => f.id === 'prenatal_postnatal')).toBe(true)
  })

  it('youth goal triggers youth_client safety flag', () => {
    const flags = computeSafetyFlags(['youth'])
    expect(flags.some(f => f.id === 'youth_client')).toBe(true)
  })

  it('glp1 goal triggers glp1_medication safety flag', () => {
    const flags = computeSafetyFlags(['glp1'])
    expect(flags.some(f => f.id === 'glp1_medication')).toBe(true)
  })

  it('neuro goal triggers neurological safety flag', () => {
    const flags = computeSafetyFlags(['neuro'])
    expect(flags.some(f => f.id === 'neurological')).toBe(true)
  })

  it('safety flags do NOT set hasUnresolvedHardConflict', () => {
    expect(hasUnresolvedHardConflict(['rehab', 'postnatal', 'youth'])).toBe(false)
  })

  it('no safety flags for standard goals', () => {
    const flags = computeSafetyFlags(['fat-loss', 'muscle', 'strength'])
    expect(flags).toHaveLength(0)
  })

  it('each safety flag has a non-empty meaning string', () => {
    const flags = computeSafetyFlags(['rehab', 'postnatal', 'youth', 'glp1', 'neuro'])
    flags.forEach(f => {
      expect(typeof f.meaning).toBe('string')
      expect(f.meaning.length).toBeGreaterThan(0)
    })
  })

  it('duplicate goals do not generate duplicate safety flags', () => {
    const flags = computeSafetyFlags(['rehab', 'rehab'])
    const injuryFlags = flags.filter(f => f.id === 'injury_risk')
    expect(injuryFlags).toHaveLength(1)
  })
})

// ─── Section-level progressive disclosure (Phase 9C) ─────────────────────────
//
// Specialist and Emerging goal sections render behind a collapse toggle to
// reduce mobile cognitive load; Core renders eagerly. The component wires
// these pure state transitions to aria-expanded/aria-controls toggle buttons
// (verified by reading GoalAccordion.tsx — no RTL/jsdom is installed, so DOM
// interaction is tested via the underlying state contract, same as the
// existing Trainer assessment collapse above).

describe('Section-level progressive disclosure', () => {
  it('Core is expanded by default', () => {
    expect(defaultSectionExpansion().core).toBe(true)
  })

  it('Specialist is collapsed by default', () => {
    expect(defaultSectionExpansion().specialist).toBe(false)
  })

  it('Emerging is collapsed by default', () => {
    expect(defaultSectionExpansion().emerging).toBe(false)
  })

  it('clicking the Specialist toggle reveals Specialist goals', () => {
    const next = toggleSectionExpansion(defaultSectionExpansion(), 'specialist')
    expect(next.specialist).toBe(true)
  })

  it('clicking the Emerging toggle reveals Emerging goals', () => {
    const next = toggleSectionExpansion(defaultSectionExpansion(), 'emerging')
    expect(next.emerging).toBe(true)
  })

  it('toggling Specialist does not affect Core or Emerging', () => {
    const next = toggleSectionExpansion(defaultSectionExpansion(), 'specialist')
    expect(next.core).toBe(true)
    expect(next.emerging).toBe(false)
  })

  it('toggling a section twice returns it to collapsed', () => {
    let state = defaultSectionExpansion()
    state = toggleSectionExpansion(state, 'emerging')
    state = toggleSectionExpansion(state, 'emerging')
    expect(state.emerging).toBe(false)
  })

  it('toggling section expansion does not mutate the previous state', () => {
    const initial = defaultSectionExpansion()
    const after    = toggleSectionExpansion(initial, 'specialist')
    expect(after).not.toBe(initial)
    expect(initial.specialist).toBe(false)
  })

  it('selecting a goal from a revealed section still adds it to selected[] (independent of expansion state)', () => {
    // 'cardio' is a Specialist goal — collapsed by default, but goal selection
    // (addGoal) is decoupled from section-expansion UI state entirely.
    const state = addGoal(emptyGoalState(), 'cardio')
    expect(state.selected).toHaveLength(1)
    expect(state.selected[0].goalId).toBe('cardio')
  })

  it('selecting a goal from the Emerging section still adds it to selected[]', () => {
    // 'longevity' is an Emerging goal — collapsed by default.
    const state = addGoal(emptyGoalState(), 'longevity')
    expect(state.selected).toHaveLength(1)
    expect(state.selected[0].goalId).toBe('longevity')
  })
})

// ─── onChange contract: emits valid GoalSelectionState ───────────────────────

describe('onChange emits a valid GoalSelectionState', () => {
  it('emptyGoalState() has the correct shape', () => {
    const state = emptyGoalState()
    expect(Array.isArray(state.selected)).toBe(true)
    expect(state.primaryGoalId).toBeNull()
  })

  it('addGoal result has the correct GoalSelectionState shape', () => {
    const state = addGoal(emptyGoalState(), 'fat-loss')
    expect(typeof state).toBe('object')
    expect(Array.isArray(state.selected)).toBe(true)
    const config = state.selected[0]
    expect(typeof config.goalId).toBe('string')
    expect(Array.isArray(config.primarySubGoalIds)).toBe(true)
    expect(Array.isArray(config.trainerSubGoalIds)).toBe(true)
    expect(typeof config.urgency).toBe('string')
  })

  it('state is never mutated — each update returns a new object', () => {
    const initial = emptyGoalState()
    const after   = addGoal(initial, 'fat-loss')
    expect(after).not.toBe(initial)
    expect(initial.selected).toHaveLength(0)
  })

  it('sub-goal toggles do not mutate previous state arrays', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    const beforeIds = state.selected[0].primarySubGoalIds
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    expect(beforeIds).toHaveLength(0)
    expect(state.selected[0].primarySubGoalIds).toHaveLength(1)
  })

  it('update to one selected goal does not change other goals', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    const fatLossRef = state.selected.find(s => s.goalId === 'fat-loss')
    state = setGoalUrgency(state, 'strength', 'urgent')
    const fatLossAfter = state.selected.find(s => s.goalId === 'fat-loss')
    expect(fatLossAfter?.urgency).toBe('active_focus')
    expect(fatLossRef).toStrictEqual(fatLossAfter)
  })
})

// ─── Per-goal trainer notes (Phase 1) ──────────────────────────────────────────

describe('Per-goal trainer notes', () => {
  it('new goal defaults to notes=null', () => {
    const state = addGoal(emptyGoalState(), 'fat-loss')
    expect(state.selected[0].notes).toBeNull()
  })

  it('setGoalNotes sets notes on the specified goal', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalNotes(state, 'fat-loss', 'Client has lower-back issues, start slowly')
    expect(state.selected[0].notes).toBe('Client has lower-back issues, start slowly')
  })

  it('setGoalNotes can clear notes to null', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalNotes(state, 'fat-loss', 'Some note')
    state = setGoalNotes(state, 'fat-loss', null)
    expect(state.selected[0].notes).toBeNull()
  })

  it('setGoalNotes trims whitespace', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalNotes(state, 'fat-loss', '  Trimmed note  ')
    expect(state.selected[0].notes).toBe('Trimmed note')
  })

  it('setGoalNotes clears whitespace-only strings to null', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalNotes(state, 'fat-loss', '   ')
    expect(state.selected[0].notes).toBeNull()
  })

  it('per-goal notes do not affect other goals', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    state = setGoalNotes(state, 'fat-loss', 'Note for fat-loss')
    const strength = state.selected.find(s => s.goalId === 'strength')
    expect(strength?.notes).toBeNull()
  })

  it('setting notes on non-existent goal is a no-op', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalNotes(state, 'muscle', 'Note')
    expect(state.selected[0].notes).toBeNull()
  })
})

// ─── Mapping to SelectedGoalDraft (Phase 1 persistence) ──────────────────────────

describe('toSelectedGoalDrafts: map GoalSelectionState to SelectedGoalDraft[]', () => {
  it('empty state produces empty array', () => {
    const state = emptyGoalState()
    const drafts = toSelectedGoalDrafts(state)
    expect(drafts).toEqual([])
  })

  it('single goal produces one draft', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setPrimaryGoal(state, 'fat-loss')
    const drafts = toSelectedGoalDrafts(state)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].goalId).toBe('fat-loss')
    expect(drafts[0].isPrimary).toBe(true)
  })

  it('multiple goals produce multiple drafts', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    state = addGoal(state, 'cardio')
    state = setPrimaryGoal(state, 'fat-loss')
    const drafts = toSelectedGoalDrafts(state)
    expect(drafts).toHaveLength(3)
  })

  it('exactly one draft has isPrimary=true when primary is set', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    state = setPrimaryGoal(state, 'strength')
    const drafts = toSelectedGoalDrafts(state)
    const primaries = drafts.filter(d => d.isPrimary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0].goalId).toBe('strength')
  })

  it('all drafted goals have isPrimary=false when no primary is set', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = addGoal(state, 'strength')
    const drafts = toSelectedGoalDrafts(state)
    expect(drafts.every(d => d.isPrimary === false)).toBe(true)
  })

  it('draft includes all required fields from SelectedGoalConfig', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    state = toggleTrainerSubGoal(state, 'fat-loss', 'preserve_skeletal_muscle_mass')
    state = setGoalUrgency(state, 'fat-loss', 'urgent')
    state = setGoalNotes(state, 'fat-loss', 'Test note')
    state = setPrimaryGoal(state, 'fat-loss')
    const [draft] = toSelectedGoalDrafts(state)
    expect(draft.goalId).toBe('fat-loss')
    expect(draft.isPrimary).toBe(true)
    expect(draft.urgency).toBe('urgent')
    expect(draft.clientSubGoalIds).toContain('reduce_total_body_fat')
    expect(draft.trainerSubGoalIds).toContain('preserve_skeletal_muscle_mass')
    expect(draft.trainerNotes).toBe('Test note')
  })

  it('trainerNotes is null when notes is null', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    const [draft] = toSelectedGoalDrafts(state)
    expect(draft.trainerNotes).toBeNull()
  })

  it('trainerNotes is trimmed and never empty string', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = setGoalNotes(state, 'fat-loss', '  Trimmed  ')
    const [draft] = toSelectedGoalDrafts(state)
    expect(draft.trainerNotes).toBe('Trimmed')
    expect(draft.trainerNotes).not.toBe('')
  })

  it('sub-goal arrays are passed through unchanged (pre-validated)', () => {
    let state = addGoal(emptyGoalState(), 'fat-loss')
    state = togglePrimarySubGoal(state, 'fat-loss', 'reduce_total_body_fat')
    state = togglePrimarySubGoal(state, 'fat-loss', 'boost_daily_energy_levels')
    const [draft] = toSelectedGoalDrafts(state)
    expect(draft.clientSubGoalIds).toHaveLength(2)
    expect(draft.clientSubGoalIds).toContain('reduce_total_body_fat')
    expect(draft.clientSubGoalIds).toContain('boost_daily_energy_levels')
  })

  it('result is a valid SelectedGoalDraft[] ready for server action', () => {
    let state = emptyGoalState()
    state = addGoal(state, 'fat-loss')
    state = addGoal(state, 'strength')
    state = setPrimaryGoal(state, 'fat-loss')
    state = setGoalNotes(state, 'fat-loss', 'Primary goal note')
    state = setGoalNotes(state, 'strength', 'Secondary goal note')
    const drafts = toSelectedGoalDrafts(state)
    expect(drafts).toHaveLength(2)
    drafts.forEach(d => {
      expect(typeof d.goalId).toBe('string')
      expect(typeof d.isPrimary).toBe('boolean')
      expect(typeof d.urgency).toBe('string')
      expect(Array.isArray(d.clientSubGoalIds)).toBe(true)
      expect(Array.isArray(d.trainerSubGoalIds)).toBe(true)
      expect(d.trainerNotes === null || typeof d.trainerNotes === 'string').toBe(true)
    })
    expect(drafts.filter(d => d.isPrimary)).toHaveLength(1)
  })
})
