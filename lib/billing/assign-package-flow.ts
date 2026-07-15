/**
 * Pure decision helpers for AssignPackageForm's deferred-payment flow.
 *
 * AssignPackageForm never selects a payment method, company, or account
 * before an invoice exists — there is no invoice-independent, safe source
 * for a tenant's ERP company (see
 * docs/execution/TENANT_AWARE_PAYMENT_SLICE_1_CHECKPOINT.md). "Paid Now" and
 * "Pay Later" both create the package + invoice through the exact same path
 * (assignPackage() called WITHOUT a `payment` field — no Payment Entry is
 * ever attempted at assignment time). The only difference is what happens
 * after a successful assignment:
 *   - Pay Later (or a complimentary/zero-price package) → the existing
 *     success screen, unchanged.
 *   - Paid Now, once a real invoice exists → transition into the existing,
 *     ERP-preflighted invoice payment flow (getAvailablePaymentMethods +
 *     recordPayment) for THAT invoice — its real tenant/company/currency
 *     drive the preflight there, never guessed here.
 *
 * No React, no DOM, no server-only import — extracted so this decision is
 * independently testable. This repo has no RTL/jsdom installed (see
 * components/clients/GoalAccordion/tests/GoalAccordion.test.tsx), so this
 * follows the same established pattern: test the pure logic a component
 * wires to its render branches instead of the DOM itself.
 */

import type { AssignPackageInput } from '@/types/billing'

export type PackageAssignPayMode = 'pay_later' | 'paid_now'

/**
 * Build the payload sent to assignPackage(). NEVER includes a `payment`
 * field, regardless of payMode — payment-method selection is deferred
 * entirely to the invoice payment flow, which only exists once the invoice
 * itself exists.
 */
export function buildAssignPackagePayload(params: {
  clientIndexId:       string
  erpCustomerId:       string
  packageTemplateId:   string
  idempotencyKey:      string
  hasDuplicateWarning: boolean
  duplicateConfirmed:  boolean
}): AssignPackageInput {
  const {
    clientIndexId, erpCustomerId, packageTemplateId, idempotencyKey,
    hasDuplicateWarning, duplicateConfirmed,
  } = params
  return {
    clientIndexId,
    erpCustomerId,
    packageTemplateId,
    idempotencyKey,
    ...(hasDuplicateWarning ? { allowDuplicateActivePackage: duplicateConfirmed } : {}),
  }
}

export type PostAssignmentAction =
  | { type: 'show_success' }
  | { type: 'collect_payment'; invoiceId: string }

/**
 * Decide what happens right after a successful package assignment.
 *
 * - payMode !== 'paid_now' (Pay Later, or paid_now was never reachable for a
 *   complimentary package) → 'show_success', unconditionally. Preserves the
 *   existing Pay Later behavior exactly.
 * - payMode === 'paid_now' with a real created invoice id → 'collect_payment'
 *   for that invoice. This can only ever be reached with a REAL invoice id
 *   already in hand — there is no code path that transitions to payment
 *   collection before the invoice exists.
 * - payMode === 'paid_now' but erpInvoiceId is null (defensive — should not
 *   happen for a non-zero, non-complimentary template, since assignPackage
 *   always creates an invoice in that case) → falls back to 'show_success'
 *   rather than navigating to an invalid path.
 */
export function decidePostAssignmentAction(params: {
  payMode:      PackageAssignPayMode
  erpInvoiceId: string | null
}): PostAssignmentAction {
  if (params.payMode === 'paid_now' && params.erpInvoiceId) {
    return { type: 'collect_payment', invoiceId: params.erpInvoiceId }
  }
  return { type: 'show_success' }
}

/** Path to the existing, ERP-preflighted invoice payment flow for one invoice. */
export function invoicePaymentPath(invoiceId: string): string {
  return `/dashboard/invoices/${invoiceId}/pay`
}
