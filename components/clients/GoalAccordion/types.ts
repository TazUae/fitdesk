import type { GoalSection, IntakeGoalId } from '@/lib/goals/taxonomy'
import type { GoalUrgency, SelectedGoalDraft } from '@/types/clients'

export interface SelectedGoalConfig {
  goalId:            IntakeGoalId
  primarySubGoalIds: string[]
  trainerSubGoalIds: string[]
  urgency:           GoalUrgency
  notes:             string | null
}

export interface GoalSelectionState {
  selected:      SelectedGoalConfig[]
  primaryGoalId: IntakeGoalId | null
}

export interface GoalAccordionProps {
  value:    GoalSelectionState
  onChange: (next: GoalSelectionState) => void
}

// ─── Pure state update helpers (exported for testing) ─────────────────────────

export function emptyGoalState(): GoalSelectionState {
  return { selected: [], primaryGoalId: null }
}

export function addGoal(state: GoalSelectionState, goalId: IntakeGoalId): GoalSelectionState {
  if (state.selected.some(s => s.goalId === goalId)) return state
  return {
    ...state,
    selected: [
      ...state.selected,
      { goalId, primarySubGoalIds: [], trainerSubGoalIds: [], urgency: 'active_focus', notes: null },
    ],
  }
}

export function removeGoal(state: GoalSelectionState, goalId: IntakeGoalId): GoalSelectionState {
  return {
    selected:      state.selected.filter(s => s.goalId !== goalId),
    primaryGoalId: state.primaryGoalId === goalId ? null : state.primaryGoalId,
  }
}

export function setPrimaryGoal(state: GoalSelectionState, goalId: IntakeGoalId): GoalSelectionState {
  return { ...state, primaryGoalId: goalId }
}

export function togglePrimarySubGoal(
  state:     GoalSelectionState,
  goalId:    IntakeGoalId,
  subGoalId: string,
): GoalSelectionState {
  return {
    ...state,
    selected: state.selected.map(s => {
      if (s.goalId !== goalId) return s
      const has = s.primarySubGoalIds.includes(subGoalId)
      return {
        ...s,
        primarySubGoalIds: has
          ? s.primarySubGoalIds.filter(id => id !== subGoalId)
          : [...s.primarySubGoalIds, subGoalId],
      }
    }),
  }
}

export function toggleTrainerSubGoal(
  state:     GoalSelectionState,
  goalId:    IntakeGoalId,
  subGoalId: string,
): GoalSelectionState {
  return {
    ...state,
    selected: state.selected.map(s => {
      if (s.goalId !== goalId) return s
      const has = s.trainerSubGoalIds.includes(subGoalId)
      return {
        ...s,
        trainerSubGoalIds: has
          ? s.trainerSubGoalIds.filter(id => id !== subGoalId)
          : [...s.trainerSubGoalIds, subGoalId],
      }
    }),
  }
}

export function setGoalUrgency(
  state:   GoalSelectionState,
  goalId:  IntakeGoalId,
  urgency: GoalUrgency,
): GoalSelectionState {
  return {
    ...state,
    selected: state.selected.map(s => {
      if (s.goalId !== goalId) return s
      return { ...s, urgency }
    }),
  }
}

export function setGoalNotes(
  state:   GoalSelectionState,
  goalId:  IntakeGoalId,
  notes:   string | null,
): GoalSelectionState {
  return {
    ...state,
    selected: state.selected.map(s => {
      if (s.goalId !== goalId) return s
      // Trim and clear whitespace-only strings to null (binding domain rule D8)
      const trimmed = typeof notes === 'string' ? notes.trim() : null
      return { ...s, notes: trimmed || null }
    }),
  }
}

// ─── Section-level progressive disclosure (Phase 9C) ──────────────────────────
//
// Core goals render eagerly; Specialist and Emerging are collapsed behind an
// explicit toggle to reduce mobile cognitive load (FITDESK_GOAL_SYSTEM.md
// Smart Accordion UX contract). Pure helpers exported for testing, same
// pattern as the goal-selection state above — no DOM rendering required.

export type SectionExpansionState = Record<GoalSection, boolean>

export function defaultSectionExpansion(): SectionExpansionState {
  return { core: true, specialist: false, emerging: false }
}

export function toggleSectionExpansion(
  state:   SectionExpansionState,
  section: GoalSection,
): SectionExpansionState {
  return { ...state, [section]: !state[section] }
}

// ─── Mapping to SelectedGoalDraft (Phase 1) ───────────────────────────────────
//
// Pure mapper: GoalSelectionState → SelectedGoalDraft[] for server action.
// Mirrors the GoalWorkspace/selectors.ts toSelectedGoalDrafts contract so both
// selector paths emit an equivalent SelectedGoalDraft[] (binding domain rule D4).

export function toSelectedGoalDrafts(state: GoalSelectionState): SelectedGoalDraft[] {
  return state.selected.map(config => ({
    goalId:             config.goalId,
    isPrimary:          state.primaryGoalId === config.goalId,
    urgency:            config.urgency,
    clientSubGoalIds:   config.primarySubGoalIds,
    trainerSubGoalIds:  config.trainerSubGoalIds,
    trainerNotes:       config.notes,
  }))
}
