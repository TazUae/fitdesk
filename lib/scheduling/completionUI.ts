/**
 * Pure UI helpers for FD Session completion.
 *
 * Extracted from SessionCompletionSheet so they can be unit-tested in the
 * vitest node environment (which cannot transform JSX).
 */

import type { FDSession } from '@/types/scheduling'

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

// ─── Eligibility check ────────────────────────────────────────────────────────

export function canComplete(session: FDSession): boolean {
  const isEligibleStatus = session.status === 'scheduled' || session.status === 'confirmed'
  const isPast = session.startAt.getTime() <= Date.now()
  return isEligibleStatus && isPast
}
