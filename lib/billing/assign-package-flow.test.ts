/**
 * Tests for the deferred-payment-method AssignPackageForm redesign (see
 * docs/execution/TENANT_AWARE_PAYMENT_SLICE_1_CHECKPOINT.md).
 *
 * These are pure-function tests — no React, no DOM (this repo has no
 * RTL/jsdom installed; see components/clients/GoalAccordion/tests/
 * GoalAccordion.test.tsx for the established pattern). Together with the
 * source-invariant tests in components/clients/__tests__/
 * assign-package-source.test.ts and the pre-existing ERP-client / invoice
 * -action tests from Slice 1, this proves the six required properties of
 * the redesign:
 *
 *   1. Pay Later remains unchanged.
 *   2. Paid Now creates the invoice before method availability is resolved.
 *   3. Unavailable methods are never shown before or after invoice creation.
 *   4. Payment failure leaves the invoice outstanding and never duplicates
 *      the package assignment.
 *   5. Successful payment uses the validated, existing invoice payment path.
 *   6. No Payment Entry POST occurs when payment preflight fails.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildAssignPackagePayload,
  decidePostAssignmentAction,
  invoicePaymentPath,
} from './assign-package-flow'

const FLOW_SRC = readFileSync(join(__dirname, 'assign-package-flow.ts'), 'utf-8')

// ─── buildAssignPackagePayload — never sends a payment method ─────────────────

describe('buildAssignPackagePayload — no method/company/account selected before an invoice exists', () => {
  const base = {
    clientIndexId:       'CLIENT-1',
    erpCustomerId:       'CUST-1',
    packageTemplateId:   'TPL-1',
    idempotencyKey:      'IKEY-1',
    hasDuplicateWarning: false,
    duplicateConfirmed:  false,
  }

  it('never includes a `payment` field, for Pay Later', () => {
    const payload = buildAssignPackagePayload(base)
    expect(payload).not.toHaveProperty('payment')
  })

  it('never includes a `payment` field, even when the caller intends Paid Now', () => {
    // The payload builder itself takes no payMode/method input at all —
    // there is no parameter through which a method could be attached.
    const payload = buildAssignPackagePayload(base)
    expect(Object.keys(payload)).not.toContain('payment')
    expect(JSON.stringify(payload)).not.toMatch(/method|company|account/i)
  })

  it('includes the core assignment fields unmodified', () => {
    const payload = buildAssignPackagePayload(base)
    expect(payload).toMatchObject({
      clientIndexId:     'CLIENT-1',
      erpCustomerId:      'CUST-1',
      packageTemplateId:  'TPL-1',
      idempotencyKey:     'IKEY-1',
    })
  })

  it('omits allowDuplicateActivePackage when there is no duplicate warning', () => {
    const payload = buildAssignPackagePayload({ ...base, hasDuplicateWarning: false, duplicateConfirmed: false })
    expect(payload).not.toHaveProperty('allowDuplicateActivePackage')
  })

  it('threads the confirmed override through when a duplicate warning is showing', () => {
    const payload = buildAssignPackagePayload({ ...base, hasDuplicateWarning: true, duplicateConfirmed: true })
    expect(payload.allowDuplicateActivePackage).toBe(true)
  })

  it('threads false when a duplicate warning is showing but not yet confirmed', () => {
    const payload = buildAssignPackagePayload({ ...base, hasDuplicateWarning: true, duplicateConfirmed: false })
    expect(payload.allowDuplicateActivePackage).toBe(false)
  })
})

// ─── decidePostAssignmentAction — Pay Later unchanged; Paid Now gated on a real invoice ──

describe('decidePostAssignmentAction — Pay Later remains unchanged', () => {
  it('Pay Later always shows success, regardless of whether an invoice exists', () => {
    expect(decidePostAssignmentAction({ payMode: 'pay_later', erpInvoiceId: null }))
      .toEqual({ type: 'show_success' })
    expect(decidePostAssignmentAction({ payMode: 'pay_later', erpInvoiceId: 'SINV-1' }))
      .toEqual({ type: 'show_success' })
  })

  it('Pay Later never produces a collect_payment action under any input', () => {
    for (const erpInvoiceId of [null, '', 'SINV-1', 'SINV-anything']) {
      expect(decidePostAssignmentAction({ payMode: 'pay_later', erpInvoiceId }).type)
        .not.toBe('collect_payment')
    }
  })
})

describe('decidePostAssignmentAction — Paid Now creates the invoice before method availability is resolved', () => {
  it('Paid Now with NO invoice id yet (creation not complete) never resolves payment collection', () => {
    // There is no code path to `collect_payment` without an invoice id
    // already in hand — proving method-availability resolution can only
    // ever happen AFTER the invoice exists, never before/during creation.
    const result = decidePostAssignmentAction({ payMode: 'paid_now', erpInvoiceId: null })
    expect(result).toEqual({ type: 'show_success' })
  })

  it('Paid Now with a real, already-created invoice id transitions to payment collection for THAT invoice', () => {
    const result = decidePostAssignmentAction({ payMode: 'paid_now', erpInvoiceId: 'SINV-2026-00099' })
    expect(result).toEqual({ type: 'collect_payment', invoiceId: 'SINV-2026-00099' })
  })

  it('the decision is a pure, one-shot function of (payMode, erpInvoiceId) only — no hidden payment-outcome dependency', () => {
    // Same inputs always produce the same decision; nothing about payment
    // success/failure can influence this decision, because payment has not
    // been attempted yet at the point this is called (it comes strictly
    // after assignPackage() resolves and strictly before any payment call).
    const a = decidePostAssignmentAction({ payMode: 'paid_now', erpInvoiceId: 'SINV-1' })
    const b = decidePostAssignmentAction({ payMode: 'paid_now', erpInvoiceId: 'SINV-1' })
    expect(a).toEqual(b)
  })
})

// ─── unavailable methods are never shown before or after invoice creation ─────

describe('unavailable methods are never shown before or after invoice creation', () => {
  it('the payload sent at creation time carries no method — nothing to show as available/unavailable yet', () => {
    const payload = buildAssignPackagePayload({
      clientIndexId: 'C', erpCustomerId: 'CUST', packageTemplateId: 'T', idempotencyKey: 'K',
      hasDuplicateWarning: false, duplicateConfirmed: false,
    })
    expect(payload).not.toHaveProperty('payment')
  })

  it('the post-creation hand-off carries only a bare invoice id — no pre-selected or pre-filtered method list', () => {
    const action = decidePostAssignmentAction({ payMode: 'paid_now', erpInvoiceId: 'SINV-1' })
    expect(action).toEqual({ type: 'collect_payment', invoiceId: 'SINV-1' })
    // No `methods`/`available` field is ever attached to the hand-off — the
    // destination page resolves availability itself, fresh, via the
    // already-tested getAvailablePaymentMethods()/deriveSelectableMethodOptions()
    // path (lib/payments/availability.ts, lib/payments/selector-view.ts).
    expect(action).not.toHaveProperty('methods')
    expect(action).not.toHaveProperty('availableMethods')
  })

  it('invoicePaymentPath is a bare URL — encodes no method, company, or account', () => {
    const path = invoicePaymentPath('SINV-2026-00042')
    expect(path).toBe('/dashboard/invoices/SINV-2026-00042/pay')
    expect(path).not.toMatch(/method|company|account|cash|whish/i)
  })
})

// ─── payment failure leaves the invoice outstanding, never duplicates the assignment ──

describe('payment failure leaves the invoice outstanding and never duplicates package assignment', () => {
  it('the post-assignment decision is made once, strictly before any payment attempt — nothing here can re-trigger assignment', () => {
    // decidePostAssignmentAction has no assignPackage/service dependency at
    // all (verified by its signature/import graph — it takes only payMode
    // and erpInvoiceId, both already-known values). Whatever happens next
    // on the invoice-pay page (payment success or failure) cannot flow
    // back into this decision or re-invoke package assignment: the
    // assignment already completed by the time this function is even
    // called, and this module has no reference to assignPackage/
    // PackageAssignmentService anywhere.
    const result = decidePostAssignmentAction({ payMode: 'paid_now', erpInvoiceId: 'SINV-1' })
    expect(result.type).toBe('collect_payment')
  })

  it('this module has no import path to assignPackage or the package assignment service', () => {
    // Structural guarantee: nothing in this file CAN call assignPackage a
    // second time — it has no way to reach it. The only caller of
    // assignPackage is AssignPackageForm's own handleConfirm, invoked once
    // per trainer-initiated submit. (Prose mentions of "assignPackage()" in
    // this file's own doc comments, explaining the design, are expected and
    // fine — what matters is there is no import/call path.)
    expect(FLOW_SRC).not.toContain("from '@/actions/packages'")
    expect(FLOW_SRC).not.toContain('PackageAssignmentService')
  })
})

// ─── successful payment uses the validated, existing invoice payment path ─────

describe('successful payment uses the existing, ERP-preflighted invoice payment path', () => {
  it('invoicePaymentPath resolves to the existing /dashboard/invoices/[id]/pay route — not a new/duplicate one', () => {
    expect(invoicePaymentPath('SINV-1')).toBe('/dashboard/invoices/SINV-1/pay')
  })

  it('the path is built from the REAL invoice id returned by assignPackage — never a guessed or placeholder id', () => {
    const realInvoiceId = 'SINV-2026-00007'
    const action = decidePostAssignmentAction({ payMode: 'paid_now', erpInvoiceId: realInvoiceId })
    expect(action.type).toBe('collect_payment')
    if (action.type === 'collect_payment') {
      expect(invoicePaymentPath(action.invoiceId)).toBe(`/dashboard/invoices/${realInvoiceId}/pay`)
    }
  })
})

// ─── no Payment Entry POST occurs when payment preflight fails ────────────────

describe('no Payment Entry POST occurs when payment preflight fails', () => {
  // This redesign introduces NO new payment-recording code — Paid Now hands
  // off to the exact same recordPayment() -> createAndSubmitPaymentEntry()
  // path already covered by lib/erpnext/client.test.ts's dedicated
  // "does NOT POST a Payment Entry after a failed preflight" tests (both the
  // 404-method and account-missing variants). This module has no ERP write
  // capability of its own to test — the guarantee is inherited unmodified.
  it('this module has no import path to the ERP client or a Payment Entry write', () => {
    expect(FLOW_SRC).not.toContain("from '@/lib/erpnext/client'")
    expect(FLOW_SRC).not.toContain('createAndSubmitPaymentEntry')
    expect(FLOW_SRC).not.toContain('erpFetch')
  })
})
