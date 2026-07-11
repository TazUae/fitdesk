/**
 * Pure UI helpers for FD Session completion and no-show (US-017).
 *
 * Extracted from SessionCompletionSheet so they can be unit-tested in the
 * vitest node environment (which cannot transform JSX).
 */

import type { FDSession } from '@/types/scheduling'
import type { SessionCompletionPreview } from '@/lib/scheduling/sessionCompletionPreview'
import type { NoShowFinancialAction } from '@/lib/scheduling/sessionCompletionService'

export type { NoShowFinancialAction }

// ─── Error code → user-facing message ─────────────────────────────────────────

const ERROR_CODE_MESSAGES: Record<string, string> = {
  BILLING_NOT_CONFIGURED:      'Billing setup is required before this session can be completed.',
  NO_PACKAGE_BALANCE:          'This client has no remaining package sessions.',
  SESSION_RATE_NOT_CONFIGURED: 'No session rate is set — add a rate to this session before completing.',
  VERSION_CONFLICT:            'This session changed. Refresh and try again.',
  IMMUTABLE_STATUS:            'This session is already finalized.',
  // Kept as a fallback; the service no longer issues this code on the PPS path.
  PPS_DEFERRED:                'Could not complete the session. Please try again.',
}

export function mapCompletionError(code: string): string {
  return ERROR_CODE_MESSAGES[code] ?? 'Could not complete the session. Please try again.'
}

// ─── No-show error code → user-facing message (US-017) ───────────────────────

const NO_SHOW_ERROR_MESSAGES: Record<string, string> = {
  BILLING_NOT_CONFIGURED:      'Billing setup is required before this session can be marked no-show.',
  NO_PACKAGE_BALANCE:          'This client has no remaining package sessions.',
  SESSION_RATE_NOT_CONFIGURED: 'No session rate is set — add a rate to this session before charging for a no-show.',
  INVALID_NO_SHOW_ACTION:      "That option isn't available for this client's billing setup.",
  VERSION_CONFLICT:            'This session changed. Refresh and try again.',
  IMMUTABLE_STATUS:            'This session is already finalized.',
}

export function mapNoShowError(code: string): string {
  return NO_SHOW_ERROR_MESSAGES[code] ?? 'Could not mark this session as no-show. Please try again.'
}

// ─── Cancel error code → user-facing message (US-039) ─────────────────────────

// cancelSession only ever throws VersionConflictError or ImmutableSessionError —
// it never resolves billing mode, so none of the billing-related codes apply here.
const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  VERSION_CONFLICT: 'This session changed. Refresh and try again.',
  IMMUTABLE_STATUS: 'This session is already finalized.',
}

export function mapCancelError(code: string): string {
  return CANCEL_ERROR_MESSAGES[code] ?? 'Could not cancel this session. Please try again.'
}

// ─── Reschedule error code → user-facing message (US-039) ─────────────────────

const RESCHEDULE_ERROR_MESSAGES: Record<string, string> = {
  VERSION_CONFLICT: 'This session changed. Refresh and try again.',
  IMMUTABLE_STATUS: 'This session is already finalized.',
  DST_INVALID:      'That time does not exist in this timezone (daylight saving change) — pick a different time.',
  CONFLICT:         'That time conflicts with another session on your calendar.',
  OUT_OF_HOURS:     'That time is outside your working hours.',
}

export function mapRescheduleError(code: string): string {
  return RESCHEDULE_ERROR_MESSAGES[code] ?? 'Could not reschedule this session. Please try again.'
}

// ─── Eligibility checks ────────────────────────────────────────────────────────

export function canComplete(session: FDSession): boolean {
  const isEligibleStatus = session.status === 'scheduled' || session.status === 'confirmed'
  const isPast = session.startAt.getTime() <= Date.now()
  return isEligibleStatus && isPast
}

/**
 * Currently identical to canComplete — no-show, like completion, only makes
 * sense for a session whose start time has already passed (marking a future
 * session "no-show" before it happens isn't a real outcome). Kept as its own
 * named function since the two concepts are semantically distinct and could
 * diverge later (e.g. a policy allowing pre-emptive no-show marking for
 * last-minute cancellations) — see docs/execution/phase-1-plus-safe-run-plan.md
 * for the approved US-017 design.
 */
export function canMarkNoShow(session: FDSession): boolean {
  const isEligibleStatus = session.status === 'scheduled' || session.status === 'confirmed'
  const isPast = session.startAt.getTime() <= Date.now()
  return isEligibleStatus && isPast
}

/**
 * Unlike canComplete/canMarkNoShow, cancellation has no time constraint — a
 * session is normally cancelled BEFORE it happens, not after, so a future
 * scheduled session is exactly the common case this must allow. Only the
 * terminal-status guard applies, matching cancelSession's own MUTABLE_STATUSES
 * check (see docs/execution/phase-1-plus-safe-run-plan.md, US-039).
 */
export function canCancel(session: FDSession): boolean {
  return session.status === 'scheduled' || session.status === 'confirmed'
}

/**
 * Same reasoning and logic as canCancel — a session can be rescheduled at any
 * point before it reaches a terminal outcome, regardless of whether its
 * original start time has already passed (e.g. an unresolved past session can
 * still be moved forward). Kept as its own named function for the same
 * future-divergence reason as canCancel/canMarkNoShow.
 */
export function canReschedule(session: FDSession): boolean {
  return session.status === 'scheduled' || session.status === 'confirmed'
}

// ─── No-show financial choice (US-017) ────────────────────────────────────────

export interface NoShowFinancialOption {
  action:      NoShowFinancialAction
  label:       string
  description: string
}

export interface NoShowFinancialChoice {
  /**
   * True when no financial action can be offered at all (e.g. billing not
   * configured) — the UI must not render any option or confirm button, only
   * `blockedReason`.
   */
  blocked:        boolean
  blockedReason?: string
  /** Non-blocking heads-up shown above the options (e.g. no package balance left, but waive is still safe). */
  note?:          string
  options:        NoShowFinancialOption[]
}

/**
 * Maps a billing-aware completion preview (from previewBatchCompletionAction,
 * the same US-057 preview used by batch resolution) to the no-show financial
 * options the trainer may choose from. Reused rather than duplicated so the
 * no-show UI can never drift from the same billing-mode read the rest of the
 * app already trusts.
 *
 * Per the approved US-017 design (docs/execution/phase-1-plus-safe-run-plan.md):
 *   - Trial: a single no-financial-effect option.
 *   - Pay-per-session: 'charge' or 'waive' only — never 'deduct'.
 *   - Package: 'deduct' or 'waive' only — never 'charge' (no package invoice, ever).
 *   - Unconfigured billing: blocked — no option can succeed (the service rejects
 *     every financialAction, including 'waive', when billing mode is unset).
 *   - Rate-missing / no-balance: the one option that would predictably fail
 *     (charge / deduct) is omitted rather than offered and left to error.
 */
export function getNoShowFinancialChoice(preview: SessionCompletionPreview): NoShowFinancialChoice {
  switch (preview.kind) {
    case 'trial':
      return {
        blocked: false,
        options: [
          {
            action:      'waive',
            label:       'Mark as no-show',
            description: 'Trial session — no charge, no package session used.',
          },
        ],
      }

    case 'unconfigured':
      return {
        blocked:       true,
        blockedReason: 'Billing setup is required before this session can be marked no-show.',
        options:       [],
      }

    case 'pay_per_session':
      return {
        blocked: false,
        options: [
          {
            action:      'charge',
            label:       'Charge client',
            description: `Issues an invoice for ${preview.amount} ${preview.currency}, the same as completing the session.`,
          },
          {
            action:      'waive',
            label:       'Waive charge',
            description: 'Records the no-show. No invoice is created.',
          },
        ],
      }

    case 'pay_per_session_rate_missing':
      return {
        blocked: false,
        note:    'No session rate is set, so this client cannot be charged — you can still waive.',
        options: [
          {
            action:      'waive',
            label:       'Waive charge',
            description: 'Records the no-show. No invoice is created.',
          },
        ],
      }

    case 'package':
      return {
        blocked: false,
        options: [
          {
            action:      'deduct',
            label:       'Deduct 1 session',
            description: `Uses 1 session from the package (balance after: ${preview.balanceAfter}).`,
          },
          {
            action:      'waive',
            label:       'Waive deduction',
            description: 'Records the no-show. No package session is used.',
          },
        ],
      }

    case 'package_already_consumed':
      return {
        blocked: false,
        note:    'This session already used a package spot.',
        options: [
          {
            action:      'deduct',
            label:       'Deduct 1 session',
            description: 'Already used a package spot — this just records the no-show.',
          },
          {
            action:      'waive',
            label:       'Waive deduction',
            description: 'Records the no-show. No package session is used.',
          },
        ],
      }

    case 'package_no_balance':
      return {
        blocked: false,
        note:    'This client has no remaining package sessions — you can still waive.',
        options: [
          {
            action:      'waive',
            label:       'Waive deduction',
            description: 'Records the no-show. No package session is used.',
          },
        ],
      }
  }
}
