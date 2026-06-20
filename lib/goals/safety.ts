import type { SafetyState } from '@/types/clients'
import { GOAL_SAFETY_FLAGS, type GoalSafetyFlagId, type IntakeGoalId } from './taxonomy'

export interface SafetyFlag {
  id:      GoalSafetyFlagId
  goalId:  IntakeGoalId
  meaning: string
}

const SAFETY_FLAG_MEANING: Record<GoalSafetyFlagId, string> = {
  injury_risk:        'Client has or had an injury requiring rehabilitation. A safety note is required before program assignment.',
  prenatal_postnatal: 'Client is pregnant or recently postpartum. Prenatal/postnatal phase and medical clearance must be confirmed before program recommendation.',
  neurological:       'Client has a neurological condition. Specialist program design required.',
  youth_client:       'Client is under 16. Parental consent required before first session.',
  glp1_medication:    'Client is on a GLP-1 medication (e.g. Ozempic, Wegovy). Muscle preservation protocols apply.',
}

export function computeSafetyFlags(goalIds: IntakeGoalId[]): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const seen = new Set<GoalSafetyFlagId>()

  for (const goalId of goalIds) {
    for (const flagId of GOAL_SAFETY_FLAGS[goalId]) {
      if (!seen.has(flagId)) {
        seen.add(flagId)
        flags.push({ id: flagId, goalId, meaning: SAFETY_FLAG_MEANING[flagId] })
      }
    }
  }

  return flags
}

// Returns 'needs_review' when any safety flag is present, 'clear' otherwise.
// 'blocked_downstream' is a Client Hub escalation state — not set at intake time.
export function deriveSafetyState(flags: SafetyFlag[]): SafetyState {
  return flags.length > 0 ? 'needs_review' : 'clear'
}
