/**
 * Pure mapper: local tables → ClientHubOverview.
 *
 * No I/O, no side effects — takes hydrated rows and returns a serializable
 * overview shape. Called only from lib/clients/hub.ts (server-only).
 *
 * Payment/billing/next-session fields are sourced from the local read model only
 * (placeholder values for MVP). Real receivables remain in the separate ERP-backed
 * Invoices section on the detail page and are NEVER duplicated here.
 */

import type {
  ClientActionIntent,
  ClientActionIntentSummary,
  ClientEvent,
  ClientGoal,
  ClientGoalSummary,
  ClientHubOverview,
  ClientIndex,
  ClientNoteSummary,
} from '@/types/clients'

const MAX_RECENT_NOTES = 10

export function mapToClientHubOverview(
  index:          ClientIndex,
  goals:          ClientGoal[],
  pendingActions: ClientActionIntent[],
  events:         ClientEvent[],
): ClientHubOverview {
  const goalSummaries: ClientGoalSummary[] = goals.map(g => ({
    id:               g.id,
    goalId:           g.goalId,
    urgency:          g.urgency,
    confidence:       g.confidence,
    primaryGoalLabel: g.goalId === index.primaryGoalId ? index.primaryGoalLabel : null,
    status:           g.status,
  }))

  const actionSummaries: ClientActionIntentSummary[] = pendingActions.map(a => ({
    id:       a.id,
    type:     a.type,
    status:   a.status,
    priority: a.priority,
    reason:   a.reason,
    dueAtUtc: a.dueAtUtc,
  }))

  const noteSummaries: ClientNoteSummary[] = events
    .slice(0, MAX_RECENT_NOTES)
    .map(e => ({
      id:           e.id,
      type:         e.type,
      createdAtUtc: e.createdAtUtc,
    }))

  return {
    client: {
      clientIndexId:     index.id,
      erpCustomerId:     index.erpCustomerId,
      fullName:          index.fullName,
      phoneE164:         index.phoneE164,
      whatsappEnabled:   index.whatsappEnabled,
      status:            index.status,
      safetyState:       index.safetyState,
      onboardingState:   index.onboardingState,
      billingMode:       index.billingMode,
      paymentSummary:    index.paymentSummary,
      primaryGoalLabel:  index.primaryGoalLabel,
      nextSessionAtUtc:  index.nextSessionAtUtc,
      lastActivityAtUtc: index.lastActivityAtUtc,
    },
    goals:          goalSummaries,
    pendingActions: actionSummaries,
    recentNotes:    noteSummaries,
    placeholders: {
      trainingProgram: { status: 'not_started', label: 'Training program coming soon' },
      progress:        { status: 'not_started', label: 'Progress tracking coming soon' },
    },
  }
}
