/**
 * Pure "what will happen if this session completes" preview (US-057).
 *
 * No DB access, no ERP calls — takes already-fetched data (billing mode,
 * package balance, session rate/trial flag) and shapes it into a preview
 * result for the trainer to see before confirming a batch resolution.
 *
 * Deliberately does NOT replicate PackageConsumptionService's internal
 * purchase-selection logic (which purchase row would be debited). Showing
 * the client's total package balance across all active purchases is honest
 * and accurate without risking silent drift between this preview and the
 * real consumption algorithm in lib/billing/package-consumption-service.ts —
 * see docs/execution/sprint-2-us-057-plan.md for the full reasoning.
 *
 * Mirrors the exact same guard/dispatch order as
 * sessionCompletionService.ts's completeSession, so a session this preview
 * calls "unconfigured" or "already consumed" won't surprise the trainer with
 * a different real outcome:
 *   1. isTrialSession wins over everything — no charge.
 *   2. billingMode null/'unset' → cannot preview, billing must be configured first.
 *   3. 'pay_per_session' → will invoice for the session's rate (or is blocked
 *      if no rate is configured).
 *   4. 'package' → will consume one unit from the client's balance (or is
 *      blocked if the balance is already zero), unless this specific session
 *      already recorded its package consumption (sessionConsumedPackage),
 *      in which case completion is a status-only flip — no new mutation.
 */
import type { BillingMode } from '@/types/clients'

export interface SessionCompletionPreviewInput {
  isTrialSession:         boolean
  billingMode:            BillingMode | null
  /** The session's own rate (used for pay-per-session invoicing). */
  rate:                   number
  currency:                string
  /** True when this specific session already recorded its package debit (retry-safe). */
  sessionConsumedPackage: boolean
  /** Client's total package balance across all active purchases, summed. Only meaningful for billingMode 'package'. */
  totalPackageBalance:    number
}

export type SessionCompletionPreview =
  | { kind: 'trial' }
  | { kind: 'unconfigured' }
  | { kind: 'pay_per_session'; amount: number; currency: string }
  | { kind: 'pay_per_session_rate_missing' }
  | { kind: 'package'; balanceAfter: number }
  | { kind: 'package_already_consumed' }
  | { kind: 'package_no_balance' }

export function previewSessionCompletion(
  input: SessionCompletionPreviewInput,
): SessionCompletionPreview {
  if (input.isTrialSession) {
    return { kind: 'trial' }
  }

  if (!input.billingMode || input.billingMode === 'unset') {
    return { kind: 'unconfigured' }
  }

  if (input.billingMode === 'pay_per_session') {
    if (!input.rate || input.rate <= 0) {
      return { kind: 'pay_per_session_rate_missing' }
    }
    return { kind: 'pay_per_session', amount: input.rate, currency: input.currency }
  }

  // billingMode === 'package'
  if (input.sessionConsumedPackage) {
    return { kind: 'package_already_consumed' }
  }
  if (input.totalPackageBalance <= 0) {
    return { kind: 'package_no_balance' }
  }
  return { kind: 'package', balanceAfter: input.totalPackageBalance - 1 }
}
