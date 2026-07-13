import { describe, it, expect } from 'vitest'
import { workspaceReducer } from '@/components/clients/GoalWorkspace/reducer'
import { INITIAL_WORKSPACE_STATE, workspaceStateFromGoals } from '@/components/clients/GoalWorkspace/state'
import {
  toSelectedGoalDrafts,
  hasWorkspaceHardConflict,
  getWorkspaceConflicts,
} from '@/components/clients/GoalWorkspace/selectors'
import type { GoalWorkspaceState } from '@/components/clients/GoalWorkspace/state'
import type { ClientGoalSummary } from '@/types/clients'

// ─── Phase 4: Hub editor hydration (workspaceStateFromGoals) ──────────────────

function summary(over: Partial<ClientGoalSummary> & { goalId: string }): ClientGoalSummary {
  return {
    id:                over.id ?? `row-${over.goalId}`,
    goalId:            over.goalId,
    urgency:           over.urgency ?? 'active_focus',
    confidence:        over.confidence ?? 'high',
    primaryGoalLabel:  over.primaryGoalLabel ?? null,
    status:            over.status ?? 'active',
    isPrimary:         over.isPrimary ?? false,
    subGoalIds:        over.subGoalIds ?? [],
    trainerSubGoalIds: over.trainerSubGoalIds ?? [],
    notes:             'notes' in over ? (over.notes ?? null) : null,
    safetyFlags:       over.safetyFlags ?? [],
  }
}

describe('workspaceStateFromGoals — Hub editor hydration', () => {
  it('empty goals → INITIAL-like empty state', () => {
    const s = workspaceStateFromGoals([])
    expect(s.selectedGoalIds).toEqual([])
    expect(s.primaryGoalId).toBeNull()
    expect(s.activeGoalId).toBeNull()
  })

  it('loads every field from each goal summary', () => {
    const s = workspaceStateFromGoals([
      summary({
        goalId: 'fat-loss', isPrimary: true, urgency: 'urgent',
        subGoalIds: ['reduce_total_body_fat'],
        trainerSubGoalIds: ['preserve_skeletal_muscle_mass'],
        notes: 'Careful with knees',
      }),
      summary({ goalId: 'cardio', urgency: 'background' }),
    ])
    expect(s.selectedGoalIds).toEqual(['fat-loss', 'cardio'])
    expect(s.primaryGoalId).toBe('fat-loss')
    expect(s.goalsById['fat-loss']).toEqual({
      urgency: 'urgent',
      clientSubGoalIds: ['reduce_total_body_fat'],
      trainerSubGoalIds: ['preserve_skeletal_muscle_mass'],
      trainerNotes: 'Careful with knees',
    })
    expect(s.goalsById['cardio']?.urgency).toBe('background')
    expect(s.goalsById['cardio']?.trainerNotes).toBe('') // null notes → '' for the textarea
  })

  it('skips non-taxonomy (legacy) goalIds defensively', () => {
    const s = workspaceStateFromGoals([
      summary({ goalId: 'goal-wl', isPrimary: true }), // legacy, not an IntakeGoalId
      summary({ goalId: 'strength' }),
    ])
    expect(s.selectedGoalIds).toEqual(['strength'])
  })

  it('falls back to first goal as primary when none is marked primary', () => {
    const s = workspaceStateFromGoals([
      summary({ goalId: 'strength' }),
      summary({ goalId: 'cardio' }),
    ])
    expect(s.primaryGoalId).toBe('strength')
  })
})

describe('workspaceReducer — HYDRATE', () => {
  it('replaces the whole state with the provided seed', () => {
    const seed = workspaceStateFromGoals([summary({ goalId: 'fat-loss', isPrimary: true })])
    const next = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'HYDRATE', state: seed })
    expect(next.selectedGoalIds).toEqual(['fat-loss'])
    expect(next.primaryGoalId).toBe('fat-loss')
  })

  it('discards prior edits when re-hydrating', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'muscle' })
    s = workspaceReducer(s, { type: 'SET_TRAINER_NOTES', goalId: 'muscle', notes: 'unsaved edit' })
    const seed = workspaceStateFromGoals([summary({ goalId: 'strength', isPrimary: true })])
    s = workspaceReducer(s, { type: 'HYDRATE', state: seed })
    expect(s.selectedGoalIds).toEqual(['strength'])
    expect(s.goalsById['muscle']).toBeUndefined()
  })
})

describe('Phase 4 round-trip: hydrate → edit → toSelectedGoalDrafts', () => {
  it('produces a complete replacement payload after editing', () => {
    const seed = workspaceStateFromGoals([
      summary({ goalId: 'fat-loss', isPrimary: true, notes: 'old note' }),
    ])
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'HYDRATE', state: seed })
    // Trainer edits: change urgency, add a goal, edit notes, change primary.
    s = workspaceReducer(s, { type: 'SET_URGENCY', goalId: 'fat-loss', urgency: 'urgent' })
    s = workspaceReducer(s, { type: 'SET_TRAINER_NOTES', goalId: 'fat-loss', notes: 'new note' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'cardio' })
    s = workspaceReducer(s, { type: 'SET_PRIMARY', goalId: 'cardio' })

    const drafts = toSelectedGoalDrafts(s)
    expect(drafts).toHaveLength(2)
    // Exactly one primary.
    expect(drafts.filter(d => d.isPrimary)).toHaveLength(1)
    expect(drafts.find(d => d.isPrimary)?.goalId).toBe('cardio')
    // Every draft carries trainerNotes (present, string|null) — required by strict validation.
    drafts.forEach(d => expect(d).toHaveProperty('trainerNotes'))
    const fatLoss = drafts.find(d => d.goalId === 'fat-loss')!
    expect(fatLoss.urgency).toBe('urgent')
    expect(fatLoss.trainerNotes).toBe('new note')
  })

  it('reducing to zero goals yields an empty replacement set (valid — D7)', () => {
    const seed = workspaceStateFromGoals([summary({ goalId: 'fat-loss', isPrimary: true })])
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'HYDRATE', state: seed })
    s = workspaceReducer(s, { type: 'REMOVE_GOAL', goalId: 'fat-loss' })
    expect(toSelectedGoalDrafts(s)).toEqual([])
  })
})

// ─── Reducer: ADD_GOAL ────────────────────────────────────────────────────────

describe('workspaceReducer — ADD_GOAL', () => {
  it('adds a goal to selectedGoalIds', () => {
    const next = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    expect(next.selectedGoalIds).toContain('fat-loss')
  })

  it('first added goal becomes primary automatically', () => {
    const next = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    expect(next.primaryGoalId).toBe('fat-loss')
  })

  it('first added goal becomes active automatically', () => {
    const next = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    expect(next.activeGoalId).toBe('fat-loss')
  })

  it('second goal does not override primaryGoalId', () => {
    const s1 = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    const s2 = workspaceReducer(s1, { type: 'ADD_GOAL', goalId: 'muscle' })
    expect(s2.primaryGoalId).toBe('fat-loss')
  })

  it('second goal becomes the new active goal', () => {
    const s1 = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    const s2 = workspaceReducer(s1, { type: 'ADD_GOAL', goalId: 'muscle' })
    expect(s2.activeGoalId).toBe('muscle')
  })

  it('is idempotent — adding the same goal twice is a no-op', () => {
    const s1 = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    const s2 = workspaceReducer(s1, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    expect(s2.selectedGoalIds.filter(id => id === 'fat-loss')).toHaveLength(1)
  })

  it('initializes goalsById with default urgency active_focus', () => {
    const next = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'strength' })
    expect(next.goalsById['strength']?.urgency).toBe('active_focus')
  })

  it('initializes goalsById with empty sub-goal arrays', () => {
    const next = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'strength' })
    expect(next.goalsById['strength']?.clientSubGoalIds).toEqual([])
    expect(next.goalsById['strength']?.trainerSubGoalIds).toEqual([])
  })
})

// ─── Reducer: REMOVE_GOAL ─────────────────────────────────────────────────────

describe('workspaceReducer — REMOVE_GOAL', () => {
  function stateWith2Goals(): GoalWorkspaceState {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    return s
  }

  it('removes the goal from selectedGoalIds', () => {
    const next = workspaceReducer(stateWith2Goals(), { type: 'REMOVE_GOAL', goalId: 'muscle' })
    expect(next.selectedGoalIds).not.toContain('muscle')
  })

  it('removes the goal from goalsById', () => {
    const next = workspaceReducer(stateWith2Goals(), { type: 'REMOVE_GOAL', goalId: 'muscle' })
    expect(next.goalsById['muscle']).toBeUndefined()
  })

  it('reassigns primaryGoalId to first remaining goal when primary is removed', () => {
    const s = stateWith2Goals()
    // fat-loss is primary (first added)
    const next = workspaceReducer(s, { type: 'REMOVE_GOAL', goalId: 'fat-loss' })
    expect(next.primaryGoalId).toBe('muscle')
  })

  it('keeps primaryGoalId when a non-primary goal is removed', () => {
    const s = stateWith2Goals()
    const next = workspaceReducer(s, { type: 'REMOVE_GOAL', goalId: 'muscle' })
    expect(next.primaryGoalId).toBe('fat-loss')
  })

  it('sets primaryGoalId to null when the last goal is removed', () => {
    const s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    const next = workspaceReducer(s, { type: 'REMOVE_GOAL', goalId: 'fat-loss' })
    expect(next.primaryGoalId).toBeNull()
    expect(next.activeGoalId).toBeNull()
    expect(next.selectedGoalIds).toHaveLength(0)
  })
})

// ─── Reducer: SET_PRIMARY ─────────────────────────────────────────────────────

describe('workspaceReducer — SET_PRIMARY', () => {
  it('changes primaryGoalId', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    s = workspaceReducer(s, { type: 'SET_PRIMARY', goalId: 'muscle' })
    expect(s.primaryGoalId).toBe('muscle')
  })

  it('at most one goal is primary after SET_PRIMARY', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'strength' })
    s = workspaceReducer(s, { type: 'SET_PRIMARY', goalId: 'strength' })
    const primaries = toSelectedGoalDrafts(s).filter(d => d.isPrimary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0].goalId).toBe('strength')
  })

  it('is a no-op when goalId is not in selectedGoalIds', () => {
    const s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    const next = workspaceReducer(s, { type: 'SET_PRIMARY', goalId: 'muscle' })
    expect(next.primaryGoalId).toBe('fat-loss')
  })
})

// ─── Reducer: SET_URGENCY ─────────────────────────────────────────────────────

describe('workspaceReducer — SET_URGENCY', () => {
  it('updates urgency per goal', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    s = workspaceReducer(s, { type: 'SET_URGENCY', goalId: 'fat-loss', urgency: 'urgent' })
    s = workspaceReducer(s, { type: 'SET_URGENCY', goalId: 'muscle', urgency: 'background' })
    expect(s.goalsById['fat-loss']?.urgency).toBe('urgent')
    expect(s.goalsById['muscle']?.urgency).toBe('background')
  })

  it('does not affect other goals', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    s = workspaceReducer(s, { type: 'SET_URGENCY', goalId: 'fat-loss', urgency: 'urgent' })
    expect(s.goalsById['muscle']?.urgency).toBe('active_focus')
  })
})

// ─── Reducer: sub-goal toggles ────────────────────────────────────────────────

describe('workspaceReducer — sub-goal toggles', () => {
  it('TOGGLE_CLIENT_SUB_GOAL adds a clientSubGoalId', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'TOGGLE_CLIENT_SUB_GOAL', goalId: 'fat-loss', subGoalId: 'reduce_total_body_fat' })
    expect(s.goalsById['fat-loss']?.clientSubGoalIds).toContain('reduce_total_body_fat')
  })

  it('TOGGLE_CLIENT_SUB_GOAL removes an existing clientSubGoalId', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'TOGGLE_CLIENT_SUB_GOAL', goalId: 'fat-loss', subGoalId: 'reduce_total_body_fat' })
    s = workspaceReducer(s, { type: 'TOGGLE_CLIENT_SUB_GOAL', goalId: 'fat-loss', subGoalId: 'reduce_total_body_fat' })
    expect(s.goalsById['fat-loss']?.clientSubGoalIds).not.toContain('reduce_total_body_fat')
  })

  it('client and trainer sub-goals remain separate', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'TOGGLE_CLIENT_SUB_GOAL', goalId: 'fat-loss', subGoalId: 'reduce_total_body_fat' })
    s = workspaceReducer(s, { type: 'TOGGLE_TRAINER_SUB_GOAL', goalId: 'fat-loss', subGoalId: 'preserve_skeletal_muscle_mass' })
    const data = s.goalsById['fat-loss']!
    expect(data.clientSubGoalIds).toContain('reduce_total_body_fat')
    expect(data.clientSubGoalIds).not.toContain('preserve_skeletal_muscle_mass')
    expect(data.trainerSubGoalIds).toContain('preserve_skeletal_muscle_mass')
    expect(data.trainerSubGoalIds).not.toContain('reduce_total_body_fat')
  })

  it('SET_CLIENT_SUB_GOALS replaces the full array (ToggleGroup integration)', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'TOGGLE_CLIENT_SUB_GOAL', goalId: 'fat-loss', subGoalId: 'reduce_total_body_fat' })
    s = workspaceReducer(s, {
      type: 'SET_CLIENT_SUB_GOALS',
      goalId: 'fat-loss',
      subGoalIds: ['improve_nutrition_habits', 'boost_daily_energy_levels'],
    })
    expect(s.goalsById['fat-loss']?.clientSubGoalIds).toEqual(['improve_nutrition_habits', 'boost_daily_energy_levels'])
  })
})

// ─── Reducer: RESET ───────────────────────────────────────────────────────────

describe('workspaceReducer — RESET', () => {
  it('clears all state', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    s = workspaceReducer(s, { type: 'SET_URGENCY', goalId: 'fat-loss', urgency: 'urgent' })
    s = workspaceReducer(s, { type: 'RESET' })
    expect(s.selectedGoalIds).toHaveLength(0)
    expect(s.primaryGoalId).toBeNull()
    expect(s.activeGoalId).toBeNull()
    expect(Object.keys(s.goalsById)).toHaveLength(0)
  })
})

// ─── Reducer: command query ───────────────────────────────────────────────────

describe('workspaceReducer — command query', () => {
  it('SET_COMMAND_QUERY retains the query (controlled, no unexpected reset)', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'SET_COMMAND_QUERY', query: 'fat' })
    // Adding a goal should NOT reset the query
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    expect(s.commandQuery).toBe('fat')
  })

  it('OPEN_COMMAND does not reset commandQuery', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'SET_COMMAND_QUERY', query: 'muscle' })
    s = workspaceReducer(s, { type: 'OPEN_COMMAND' })
    expect(s.commandQuery).toBe('muscle')
  })
})

// ─── Selectors ────────────────────────────────────────────────────────────────

describe('toSelectedGoalDrafts', () => {
  it('maps each goal to a SelectedGoalDraft with correct shape', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    const drafts = toSelectedGoalDrafts(s)
    expect(drafts).toHaveLength(2)
    for (const d of drafts) {
      expect(d).toHaveProperty('goalId')
      expect(d).toHaveProperty('isPrimary')
      expect(d).toHaveProperty('urgency')
      expect(d).toHaveProperty('clientSubGoalIds')
      expect(d).toHaveProperty('trainerSubGoalIds')
      expect(d).toHaveProperty('trainerNotes')
    }
  })

  it('exactly one draft has isPrimary === true', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'strength' })
    const drafts = toSelectedGoalDrafts(s)
    expect(drafts.filter(d => d.isPrimary)).toHaveLength(1)
  })

  it('the first added goal is primary by default', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    const drafts = toSelectedGoalDrafts(s)
    expect(drafts.find(d => d.goalId === 'fat-loss')?.isPrimary).toBe(true)
    expect(drafts.find(d => d.goalId === 'muscle')?.isPrimary).toBe(false)
  })

  it('reflects updated urgency per goal', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'SET_URGENCY', goalId: 'fat-loss', urgency: 'urgent' })
    const drafts = toSelectedGoalDrafts(s)
    expect(drafts[0].urgency).toBe('urgent')
  })

  it('trainerNotes is null when blank', () => {
    const s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    const drafts = toSelectedGoalDrafts(s)
    expect(drafts[0].trainerNotes).toBeNull()
  })

  it('trainerNotes is the trimmed string when non-empty', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'SET_TRAINER_NOTES', goalId: 'fat-loss', notes: '  Needs kneerehab  ' })
    const drafts = toSelectedGoalDrafts(s)
    expect(drafts[0].trainerNotes).toBe('Needs kneerehab')
  })

  it('clientSubGoalIds and trainerSubGoalIds are independent per goal', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, {
      type: 'SET_CLIENT_SUB_GOALS',
      goalId: 'fat-loss',
      subGoalIds: ['reduce_total_body_fat'],
    })
    s = workspaceReducer(s, {
      type: 'SET_TRAINER_SUB_GOALS',
      goalId: 'fat-loss',
      subGoalIds: ['preserve_skeletal_muscle_mass'],
    })
    const draft = toSelectedGoalDrafts(s)[0]
    expect(draft.clientSubGoalIds).toEqual(['reduce_total_body_fat'])
    expect(draft.trainerSubGoalIds).toEqual(['preserve_skeletal_muscle_mass'])
  })

  it('returns empty array when no goals are selected', () => {
    expect(toSelectedGoalDrafts(INITIAL_WORKSPACE_STATE)).toEqual([])
  })
})

// ─── Conflict / safety integration ───────────────────────────────────────────

describe('hasWorkspaceHardConflict', () => {
  it('returns false with no goals', () => {
    expect(hasWorkspaceHardConflict(INITIAL_WORKSPACE_STATE)).toBe(false)
  })

  it('returns false for non-conflicting goals', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'strength' })
    expect(hasWorkspaceHardConflict(s)).toBe(false)
  })

  it('returns true for underweight + fat-loss (hard conflict)', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'underweight' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    expect(hasWorkspaceHardConflict(s)).toBe(true)
  })

  it('returns soft conflict for fat-loss + muscle (recomposition warning)', () => {
    let s = workspaceReducer(INITIAL_WORKSPACE_STATE, { type: 'ADD_GOAL', goalId: 'fat-loss' })
    s = workspaceReducer(s, { type: 'ADD_GOAL', goalId: 'muscle' })
    const conflicts = getWorkspaceConflicts(s)
    expect(conflicts.some(c => c.type === 'soft')).toBe(true)
    expect(hasWorkspaceHardConflict(s)).toBe(false)
  })
})
