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
  ClientPackageBalanceSummary,
  ClientProgressEntrySummary,
} from '@/types/clients'
import type { PackagePurchaseWithBalance } from '@/types/billing'

const MAX_RECENT_NOTES = 10
const MAX_PROGRESS_ENTRIES = 10

/**
 * Derives a compact package balance summary from active purchases that have a
 * positive remaining session balance. Returns null when no qualifying purchases
 * exist (empty state). Pure — no I/O.
 */
export function derivePackageBalance(
  purchases: PackagePurchaseWithBalance[],
): ClientPackageBalanceSummary | null {
  const active = purchases.filter(p => p.packageStatus === 'active' && p.remainingBalance > 0)
  if (active.length === 0) return null
  return {
    totalAvailableSessions: active.reduce((sum, p) => sum + p.remainingBalance, 0),
    activePurchaseCount:    active.length,
    displayTemplateName:    active[0]?.templateSnapshot?.name ?? null,
  }
}

export function mapToClientHubOverview(
  index:          ClientIndex,
  goals:          ClientGoal[],
  pendingActions: ClientActionIntent[],
  events:         ClientEvent[],
  purchases:      PackagePurchaseWithBalance[] = [],
  hasGoalHistory: boolean = goals.length > 0,
): ClientHubOverview {
  const goalSummaries: ClientGoalSummary[] = goals.map(g => ({
    id:               g.id,
    goalId:           g.goalId,
    urgency:          g.urgency,
    confidence:       g.confidence,
    primaryGoalLabel: g.goalId === index.primaryGoalId ? index.primaryGoalLabel : null,
    status:           g.status,
    isPrimary:        g.isPrimary,
    subGoalIds:       g.subGoalIds,
    trainerSubGoalIds: g.trainerSubGoalIds,
    notes:            g.notes,
    safetyFlags:      g.safetyFlags,
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
      text:         e.type === 'client.note' && typeof e.payloadJson.text === 'string' ? e.payloadJson.text : null,
    }))

  const progressEntries: ClientProgressEntrySummary[] = events
    .filter(e => e.type === 'client.progress')
    .slice(0, MAX_PROGRESS_ENTRIES)
    .map(e => ({
      id:           e.id,
      text:         typeof e.payloadJson.text === 'string' ? e.payloadJson.text : '',
      goalId:       typeof e.payloadJson.goalId === 'string' ? e.payloadJson.goalId : null,
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
    hasGoalHistory,
    pendingActions: actionSummaries,
    recentNotes:    noteSummaries,
    progressEntries,
    packageBalance: derivePackageBalance(purchases),
    placeholders: {
      trainingProgram: { status: 'not_started', label: 'Training program coming soon' },
      progress:        { status: 'not_started', label: 'Progress tracking coming soon' },
    },
  }
}
