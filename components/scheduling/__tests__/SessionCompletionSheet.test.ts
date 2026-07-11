/**
 * SessionCompletionSheet — unit tests.
 *
 * No DOM rendering (RTL not installed; vitest env = node).
 * Pure logic is extracted to lib/scheduling/completionUI.ts and tested here.
 * Source invariants for the sheet component use readFileSync.
 *
 * Covers:
 *   - canComplete() pure function (eligibility: tests 2, 3, 4)
 *   - mapCompletionError() pure function (error messages: test 7)
 *   - Source invariants: no billing/payment imports (test 9)
 *   - Source invariants: no cancel/reschedule behavior; no-show is implemented (US-017)
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { canComplete, mapCompletionError } from '@/lib/scheduling/completionUI'
import type { FDSession } from '@/types/scheduling'

// ─── Source text ──────────────────────────────────────────────────────────────

const SHEET_SRC = readFileSync(
  join(__dirname, '../SessionCompletionSheet.tsx'),
  'utf-8',
)

// ─── Fixture ─────────────────────────────────────────────────────────────────

const PAST_DATE   = new Date(Date.now() - 2 * 3_600_000)  // 2 h ago
const FUTURE_DATE = new Date(Date.now() + 2 * 3_600_000)  // 2 h from now

function makeSession(overrides: Partial<FDSession> = {}): FDSession {
  return {
    id:                     'fds-001',
    tenantId:               '',
    trainerId:              'trainer-1',
    clientId:               'CUST-001',
    clientName:             'Alice',
    seriesId:               null,
    startAt:                PAST_DATE,
    endAt:                  new Date(PAST_DATE.getTime() + 3_600_000),
    durationMinutes:        60,
    timezone:               'Asia/Riyadh',
    status:                 'scheduled',
    occurrenceKey:          null,
    occurrenceIndex:        null,
    isOverride:             false,
    rate:                   100,
    sessionType:            null,
    notes:                  null,
    invoiceId:              null,
    version:                1,
    isTrialSession:         false,
    sessionConsumedPackage: false,
    ...overrides,
  }
}

// ─── canComplete — eligible sessions (test 2) ─────────────────────────────────

describe('canComplete — eligible sessions show the Complete button', () => {
  it('returns true for a past scheduled session', () => {
    expect(canComplete(makeSession({ status: 'scheduled', startAt: PAST_DATE }))).toBe(true)
  })

  it('returns true for a past confirmed session', () => {
    expect(canComplete(makeSession({ status: 'confirmed', startAt: PAST_DATE }))).toBe(true)
  })

  it('returns true when startAt exactly equals now', () => {
    const now = new Date()
    expect(canComplete(makeSession({ status: 'scheduled', startAt: now }))).toBe(true)
  })
})

// ─── canComplete — future sessions (test 3) ───────────────────────────────────

describe('canComplete — future sessions cannot be completed', () => {
  it('returns false for a future scheduled session', () => {
    expect(canComplete(makeSession({ status: 'scheduled', startAt: FUTURE_DATE }))).toBe(false)
  })

  it('returns false for a future confirmed session', () => {
    expect(canComplete(makeSession({ status: 'confirmed', startAt: FUTURE_DATE }))).toBe(false)
  })
})

// ─── canComplete — terminal statuses (test 4) ────────────────────────────────

describe('canComplete — terminal sessions cannot be completed', () => {
  for (const status of ['completed', 'cancelled', 'no_show', 'skipped'] as const) {
    it(`returns false for status = ${status} (past session)`, () => {
      expect(canComplete(makeSession({ status, startAt: PAST_DATE }))).toBe(false)
    })
  }
})

// ─── mapCompletionError — exact message mapping (test 7) ─────────────────────

describe('mapCompletionError — error codes map to exact user-facing messages', () => {
  it('maps BILLING_NOT_CONFIGURED', () => {
    expect(mapCompletionError('BILLING_NOT_CONFIGURED')).toBe(
      'Billing setup is required before this session can be completed.',
    )
  })

  it('maps NO_PACKAGE_BALANCE', () => {
    expect(mapCompletionError('NO_PACKAGE_BALANCE')).toBe(
      'This client has no remaining package sessions.',
    )
  })

  it('maps PPS_DEFERRED', () => {
    expect(mapCompletionError('PPS_DEFERRED')).toBe(
      'Could not complete the session. Please try again.',
    )
  })

  it('maps VERSION_CONFLICT', () => {
    expect(mapCompletionError('VERSION_CONFLICT')).toBe(
      'This session changed. Refresh and try again.',
    )
  })

  it('maps IMMUTABLE_STATUS', () => {
    expect(mapCompletionError('IMMUTABLE_STATUS')).toBe(
      'This session is already finalized.',
    )
  })

  it('maps ERR and unknown codes to the generic fallback', () => {
    expect(mapCompletionError('ERR')).toBe(
      'Could not complete the session. Please try again.',
    )
    expect(mapCompletionError('UNKNOWN_CODE')).toBe(
      'Could not complete the session. Please try again.',
    )
  })
})

// ─── Source invariants — no billing/payment imports (test 9) ─────────────────

describe('SessionCompletionSheet source — no billing / payment imports', () => {
  it('does not import from lib/billing', () => {
    expect(SHEET_SRC).not.toContain('lib/billing')
  })

  it('does not import package-consumption modules', () => {
    expect(SHEET_SRC).not.toContain('package-consumption')
  })

  it('does not reference invoice creation', () => {
    expect(SHEET_SRC).not.toContain('createInvoice')
    expect(SHEET_SRC).not.toContain('invoiceAction')
  })

  it('does not reference payment writes', () => {
    expect(SHEET_SRC).not.toContain('createPayment')
    expect(SHEET_SRC).not.toContain('paymentAction')
  })

  it('does not import from lib/erpnext directly', () => {
    expect(SHEET_SRC).not.toContain('lib/erpnext')
  })
})

// ─── Source invariants — no reschedule yet; no-show + cancel are implemented ──

describe('SessionCompletionSheet source — no reschedule behavior yet', () => {
  it('does not call rescheduleSessionAction', () => {
    expect(SHEET_SRC).not.toContain('rescheduleSessionAction')
  })

  it('does not render a Reschedule control', () => {
    expect(SHEET_SRC).not.toMatch(/Reschedule|rescheduleSession/i)
  })
})

// ─── Source invariants — no-show UI is wired (US-017) ─────────────────────────

describe('SessionCompletionSheet source — no-show UI (US-017)', () => {
  it('imports markNoShowAction and previewBatchCompletionAction from actions/schedulingActions', () => {
    expect(SHEET_SRC).toContain('markNoShowAction')
    expect(SHEET_SRC).toContain('previewBatchCompletionAction')
    expect(SHEET_SRC).toContain("from '@/actions/schedulingActions'")
  })

  it('renders a "Mark as no-show" trigger gated on noShowEligible', () => {
    expect(SHEET_SRC).toContain('noShowEligible')
    expect(SHEET_SRC).toContain('Mark as no-show')
  })

  it('gates the no-show trigger using canMarkNoShow', () => {
    expect(SHEET_SRC).toContain('canMarkNoShow(session)')
  })

  it('fetches a billing-aware preview before showing financial options', () => {
    expect(SHEET_SRC).toContain('previewBatchCompletionAction([session.id])')
    expect(SHEET_SRC).toContain('getNoShowFinancialChoice')
  })

  it('calls markNoShowAction with session.id, session.version, the selected action, and reason', () => {
    expect(SHEET_SRC).toContain('markNoShowAction(')
    expect(SHEET_SRC).toContain('session.id,')
    expect(SHEET_SRC).toContain('session.version,')
    expect(SHEET_SRC).toContain('selectedAction,')
    expect(SHEET_SRC).toContain("noShowReason.trim() || undefined")
  })

  it('requires an explicit financial-option selection before a confirm control appears', () => {
    // Confirm is only rendered when selectedAction is set — not a single dangerous button.
    expect(SHEET_SRC).toContain('selectedAction && (')
    expect(SHEET_SRC).toContain('Confirm no-show')
  })

  it('does not create a package invoice or reference deduct for pay-per-session anywhere in this file', () => {
    // The financial-option copy itself lives in completionUI.ts, not duplicated here —
    // this just confirms the sheet does not hardcode any invoice/package-invoice wording.
    expect(SHEET_SRC).not.toContain('package invoice')
  })

  it('maps no-show errors via mapNoShowError, not the completion error mapper', () => {
    expect(SHEET_SRC).toContain('mapNoShowError(result.code)')
  })

  it('shows a loading state while the billing preview is being fetched', () => {
    expect(SHEET_SRC).toContain("previewStatus === 'loading'")
    expect(SHEET_SRC).toContain('Checking billing')
  })

  it('shows a retry path when the billing preview fails to load', () => {
    expect(SHEET_SRC).toContain("previewStatus === 'error'")
    expect(SHEET_SRC).toContain('Retry')
  })

  it('shows a success toast and refreshes via onCompleted on a successful no-show', () => {
    expect(SHEET_SRC).toContain("toast.success('Session marked as no-show')")
  })

  it('back button returns to the main view without closing the sheet or mutating', () => {
    expect(SHEET_SRC).toContain('handleBackFromNoShow')
    expect(SHEET_SRC).toContain('resetNoShow')
  })
})

// ─── Source invariants — cancel UI (US-039) ────────────────────────────────────

describe('SessionCompletionSheet source — cancel UI (US-039)', () => {
  it('imports cancelSessionAction from actions/schedulingActions', () => {
    expect(SHEET_SRC).toContain('cancelSessionAction')
    expect(SHEET_SRC).toContain("from '@/actions/schedulingActions'")
  })

  it('renders a "Cancel session" trigger gated on cancelEligible', () => {
    expect(SHEET_SRC).toContain('cancelEligible')
    expect(SHEET_SRC).toContain('Cancel session')
  })

  it('gates the cancel trigger using canCancel — hidden for terminal/immutable statuses', () => {
    expect(SHEET_SRC).toContain('canCancel(session)')
  })

  it('requires an explicit Confirm tap before calling cancelSessionAction — not a single dangerous button', () => {
    // handleOpenCancel only opens the explanatory sub-view; the mutation itself
    // is behind a distinctly-labeled "Confirm cancellation" button in a
    // separate handler (handleConfirmCancel), not fired directly from the trigger.
    expect(SHEET_SRC).toContain('handleOpenCancel')
    expect(SHEET_SRC).toContain('handleConfirmCancel')
    expect(SHEET_SRC).toContain('Confirm cancellation')
  })

  it('explains that cancellation preserves client history and has no billing effect', () => {
    expect(SHEET_SRC).toContain("stays in the client&apos;s history")
    expect(SHEET_SRC).toContain('No invoice is created, voided, refunded, or credited')
  })

  it('calls cancelSessionAction with session.id, session.version, and reason', () => {
    expect(SHEET_SRC).toContain('cancelSessionAction(')
    expect(SHEET_SRC).toContain('session.id,')
    expect(SHEET_SRC).toContain('session.version,')
    expect(SHEET_SRC).toContain('cancelReason.trim() || undefined')
  })

  it('maps cancel errors via mapCancelError, not the completion/no-show error mappers', () => {
    expect(SHEET_SRC).toContain('mapCancelError(result.code)')
  })

  it('shows a success toast and refreshes via onCompleted on a successful cancellation', () => {
    expect(SHEET_SRC).toContain("toast.success('Session cancelled')")
  })

  it('back button returns to the main view without closing the sheet or mutating', () => {
    expect(SHEET_SRC).toContain('handleBackFromCancel')
    expect(SHEET_SRC).toContain('resetCancel')
  })

  it('resets cancel sub-view state when the sheet is closed', () => {
    expect(SHEET_SRC).toContain('resetCancel()')
  })
})

// ─── Source invariants — sheet renders session summary (test 1) ───────────────

describe('SessionCompletionSheet source — renders session summary', () => {
  it('renders clientName', () => {
    expect(SHEET_SRC).toContain('session.clientName')
  })

  it('renders session status', () => {
    expect(SHEET_SRC).toContain('session.status')
  })

  it('renders session date/time via formatLocalDateTime', () => {
    expect(SHEET_SRC).toContain('formatLocalDateTime')
  })

  it('shows trial badge when isTrialSession', () => {
    expect(SHEET_SRC).toContain('isTrialSession')
    expect(SHEET_SRC).toContain('Trial')
  })

  it('shows ineligibility notice for future sessions', () => {
    expect(SHEET_SRC).toContain("hasn")
    expect(SHEET_SRC).toContain('isFuture')
  })

  it('shows finalized notice for terminal sessions', () => {
    expect(SHEET_SRC).toContain('isTerminal')
    expect(SHEET_SRC).toContain('already finalized')
  })
})

// ─── Source invariants — complete button eligibility gating (test 5 / 6) ──────

describe('SessionCompletionSheet source — complete button is eligibility-gated', () => {
  it('gates the Complete button on the eligible flag', () => {
    expect(SHEET_SRC).toContain('eligible')
    expect(SHEET_SRC).toContain('Complete session')
  })

  it('calls completeSessionAction with session.id and session.version', () => {
    expect(SHEET_SRC).toContain('completeSessionAction(session.id, session.version)')
  })

  it('calls onCompleted after a successful completion', () => {
    expect(SHEET_SRC).toContain('onCompleted()')
  })

  it('calls onClose after a successful completion', () => {
    expect(SHEET_SRC).toContain('onClose()')
  })
})
