import type { GoalSection, IntakeGoalId } from '@/lib/goals/taxonomy'
import type { GoalUrgency } from '@/types/clients'

export interface SelectedGoalConfig {
  goalId:            IntakeGoalId
  primarySubGoalIds: string[]
  trainerSubGoalIds: string[]
  urgency:           GoalUrgency
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
      { goalId, primarySubGoalIds: [], trainerSubGoalIds: [], urgency: 'active_focus' },
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
