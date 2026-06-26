/**
 * Pure builder — converts an immutable PackageTemplateSnapshot into a
 * CreateInvoicePayload ready for submission to ERPNext via the approved
 * ERP proxy chain.
 *
 * Rules:
 *  1. No ERP calls. No network I/O. No server-side imports.
 *  2. Zero-value packages must NOT reach this builder — complimentary/zero
 *     packages skip the ERP invoice entirely (ADR §15.7) and use a local
 *     bonus_granted ledger event instead. This builder rejects priceAmount <= 0.
 *  3. erpItemCode must be non-empty; the ERP Item must pre-exist.
 *  4. Exactly one line item is created (one package sold as a unit).
 *  5. rate = toMajorUnits(priceAmount, currency) — never raw minor units.
 *  6. posting_date and due_date are both set to the provided postingDate (MVP).
 *  7. Does not mutate the snapshot.
 */

import { toMajorUnits } from '@/lib/billing/money'
import type { PackageTemplateSnapshot } from '@/types/billing'
import type { CreateInvoicePayload } from '@/lib/erpnext/types'

// ─── Validation helpers ───────────────────────────────────────────────────────

const POSTING_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidPostingDate(date: string): void {
  if (!POSTING_DATE_RE.test(date)) {
    throw new Error(
      `[package-invoice-builder] postingDate must be YYYY-MM-DD, got: "${date}"`,
    )
  }
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export function buildPackageInvoicePayload(params: {
  snapshot:      PackageTemplateSnapshot
  erpCustomerId: string
  postingDate:   string
}): CreateInvoicePayload {
  const { snapshot, erpCustomerId, postingDate } = params

  // Guard: non-empty customer
  if (!erpCustomerId || erpCustomerId.trim() === '') {
    throw new Error('[package-invoice-builder] erpCustomerId must not be blank')
  }

  // Guard: valid posting date
  assertValidPostingDate(postingDate)

  // Guard: non-empty ERP item code (Item must pre-exist in ERPNext)
  if (!snapshot.erpItemCode || snapshot.erpItemCode.trim() === '') {
    throw new Error(
      '[package-invoice-builder] snapshot.erpItemCode must not be blank — ' +
      'set erp_item_code on the package template before assigning it',
    )
  }

  // Guard: non-zero price (zero-value/complimentary packages skip ERP invoicing)
  if (snapshot.priceAmount <= 0) {
    throw new Error(
      `[package-invoice-builder] priceAmount must be > 0 for an ERP invoice ` +
      `(got ${snapshot.priceAmount}). ` +
      'Zero-value packages use a bonus_granted ledger event instead.',
    )
  }

  // Convert minor units → major units for ERP `rate` field.
  // getCurrencyMinorUnitFactor throws for unsupported currencies (fail-closed).
  const rate = toMajorUnits(snapshot.priceAmount, snapshot.currency)

  return {
    customer:     erpCustomerId,
    posting_date: postingDate,
    due_date:     postingDate,
    currency:     snapshot.currency.toUpperCase(),
    items: [
      {
        item_code:   snapshot.erpItemCode,
        qty:         1,
        rate,
        description: `${snapshot.name} — ${snapshot.sessionCount} sessions`,
      },
    ],
    remarks: `Package assignment: ${snapshot.name}`,
  }
}
