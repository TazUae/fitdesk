/**
 * Pure builder — converts FD Session completion params into a
 * CreateInvoicePayload ready for submission to ERPNext via the approved
 * ERP proxy chain.
 *
 * Rules:
 *  1. No ERP calls. No network I/O. No server-side imports.
 *  2. rate must be > 0. Zero-rate sessions must not create invoices.
 *  3. sessionId is written as custom_fd_session — the durable idempotency anchor.
 *  4. item_code is always 'TRAINING-SESSION' (pre-provisioned in fitdesk_setup.py).
 *  5. posting_date and due_date are both set to the provided postingDate (MVP).
 *  6. rate is in major units (FD Session stores it as a Frappe Currency float).
 */

import type { CreateInvoicePayload } from '@/lib/erpnext/types'

// Pre-provisioned ERPNext Item docname for per-session billing.
// Must match the Item created by fitdesk_setup.py.
const SESSION_ITEM_CODE = 'TRAINING-SESSION'

const POSTING_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidPostingDate(date: string): void {
  if (!POSTING_DATE_RE.test(date)) {
    throw new Error(
      `[session-invoice-builder] postingDate must be YYYY-MM-DD, got: "${date}"`,
    )
  }
}

export function buildSessionInvoicePayload(params: {
  sessionId:     string   // FD Session docname → custom_fd_session (idempotency anchor)
  erpCustomerId: string   // ERPNext Customer docname
  rate:          number   // Per-session fee in major units (Frappe Currency float)
  postingDate:   string   // YYYY-MM-DD
}): CreateInvoicePayload {
  const { sessionId, erpCustomerId, rate, postingDate } = params

  if (!sessionId || sessionId.trim() === '') {
    throw new Error('[session-invoice-builder] sessionId must not be blank')
  }

  if (!erpCustomerId || erpCustomerId.trim() === '') {
    throw new Error('[session-invoice-builder] erpCustomerId must not be blank')
  }

  assertValidPostingDate(postingDate)

  if (rate <= 0) {
    throw new Error(
      `[session-invoice-builder] rate must be > 0 for an ERP invoice (got ${rate}). ` +
      'Set a session fee before completing a pay-per-session booking.',
    )
  }

  return {
    customer:            erpCustomerId,
    posting_date:        postingDate,
    due_date:            postingDate,
    custom_fd_session:   sessionId,
    custom_invoice_kind: 'Session',
    items: [
      {
        item_code: SESSION_ITEM_CODE,
        qty:       1,
        rate,
      },
    ],
  }
}
