/**
 * Billing domain types — Package Template layer.
 *
 * These types describe the FitDesk local billing model.
 * ERP accounting documents (Sales Invoice, Payment Entry) remain authoritative
 * for all financial truth (ADR FITDESK_BILLING_PACKAGE_ERP_DECISION §1).
 *
 * price_amount is stored in minor currency units (e.g. USD cents = 1/100 USD).
 */

import type {
  TemplateType,
  PackageTemplateStatus,
  PackagePaymentStatus,
  PackagePurchaseStatus,
  LedgerEventType,
} from '@/lib/billing/taxonomy'
import type { Invoice } from '@/types'
import type { PaymentMethod } from '@/lib/payments/methods'

/**
 * Trainer-facing reusable package template.
 *
 * Once first_sold_at_utc is set, priced/service fields are frozen.
 * Archiving is always permitted (lifecycle metadata, not financial mutation).
 */
export type PackageTemplate = {
  id: string
  tenantId: string
  name: string
  description: string | null
  templateType: TemplateType
  sessionCount: number
  priceAmount: number
  currency: string
  expiryDays: number | null
  erpItemCode: string | null
  status: PackageTemplateStatus
  firstSoldAtUtc: string | null
  supersedesTemplateId: string | null
  archivedAtUtc: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

/**
 * Input for creating a new package template.
 *
 * Always creates as status='draft'. templateType defaults to 'standard_block'.
 * priceAmount defaults to 0 (minor units — use 0 for complimentary templates).
 */
export type PackageTemplateDraft = {
  name: string
  description?: string | null
  templateType?: TemplateType
  sessionCount: number
  priceAmount?: number
  currency: string
  expiryDays?: number | null
  erpItemCode?: string | null
  supersedesTemplateId?: string | null
}

/**
 * Partial update for an unused (first_sold_at_utc IS NULL) package template.
 *
 * All fields are optional. Only provided keys are updated.
 * Rejected if first_sold_at_utc is set (immutability rule, ADR §7).
 * Rejected if status is 'archived'.
 */
export type PackageTemplateUpdate = {
  name?: string
  description?: string | null
  templateType?: TemplateType
  sessionCount?: number
  priceAmount?: number
  currency?: string
  expiryDays?: number | null
  erpItemCode?: string | null
  supersedesTemplateId?: string | null
}

/**
 * Immutable snapshot of a PackageTemplate captured at the moment of purchase.
 * Written once on purchase creation; never rewritten. schemaVersion = 1.
 */
export type PackageTemplateSnapshot = {
  schemaVersion: 1
  templateId: string
  name: string
  description: string | null
  templateType: TemplateType
  sessionCount: number
  priceAmount: number
  currency: string
  expiryDays: number | null
  erpItemCode: string | null
  supersedesTemplateId: string | null
  templateStatus: PackageTemplateStatus
  capturedAtUtc: string
}

/**
 * One row per package sold to a client.
 * Carries both local (clientIndexId) and ERP (erpCustomerId) identity.
 * templateSnapshot is the parsed PackageTemplateSnapshot from template_snapshot_json.
 */
export type ClientPackagePurchase = {
  id: string
  tenantId: string
  clientIndexId: string
  erpCustomerId: string
  packageTemplateId: string
  templateSnapshot: PackageTemplateSnapshot
  erpSalesInvoiceId: string | null
  idempotencyKey?: string | null
  paymentStatus: PackagePaymentStatus
  packageStatus: PackagePurchaseStatus
  purchasedAtUtc: string
  activatedAtUtc: string | null
  expiresAtUtc: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

/**
 * Minimal input required to create a new ClientPackagePurchase.
 * Repository resolves the template, builds the snapshot, and sets defaults.
 * idempotencyKey: optional; blank/null is normalised to null before storage.
 * The partial unique index (tenant_id, idempotency_key) rejects duplicates.
 */
export type CreatePackagePurchaseInput = {
  clientIndexId:    string
  erpCustomerId:    string
  packageTemplateId: string
  idempotencyKey?:  string | null
}

/**
 * One append-only row in the package_ledger table.
 * No updatedAtUtc — this table is never mutated after insert.
 * Balance is derived from SUM(deltaUnits) per packagePurchaseId.
 */
export type PackageLedgerEvent = {
  id: string
  tenantId: string
  clientIndexId: string
  erpCustomerId: string
  packagePurchaseId: string
  eventType: LedgerEventType
  deltaUnits: number
  reason: string | null
  idempotencyKey: string | null
  erpReference: string | null
  createdByUserId: string | null
  createdAtUtc: string
  // No updatedAtUtc — append-only table
}

/**
 * Input for attaching an ERP Sales Invoice docname to a pending purchase.
 * The invoice must already exist in ERPNext — this type is local-side only.
 * erpSalesInvoiceId = ERPNext Sales Invoice name (e.g. "ACC-SINV-2026-00001").
 * paymentStatus: optional override; omit to leave existing payment_status unchanged.
 */
export type AttachInvoiceInput = {
  erpSalesInvoiceId: string
  activatedAtUtc?:   string
  paymentStatus?:    PackagePaymentStatus
}

/**
 * Input for recording an ERP Sales Invoice docname after invoice creation but
 * before invoice submission (§15.2 step 3 — recovery anchor).
 * Only erpSalesInvoiceId is recorded; no status transitions occur.
 */
export type RecordPackageInvoiceInput = {
  erpSalesInvoiceId: string
}

/**
 * Input for appending a new ledger event via PackageLedgerRepository.appendEvent.
 * tenantId is derived from ctx by the repository; do not include here.
 */
export type AppendLedgerEventInput = {
  clientIndexId:     string
  erpCustomerId:     string
  packagePurchaseId: string
  eventType:         LedgerEventType
  deltaUnits:        number
  reason?:           string | null
  idempotencyKey?:   string | null
  erpReference?:     string | null
  createdByUserId?:  string | null
}

/**
 * Payment option for an assignment. method is the internal FitDesk PaymentMethod only —
 * never an ERP mode-of-payment string, never a client-supplied amount or currency.
 */
export type AssignPackagePaymentInput = {
  method: PaymentMethod
}

/**
 * Input for PackageAssignmentService.assignPackage.
 * idempotencyKey must be unique per assignment attempt (UI-generated UUIDv4).
 * assignmentDate: YYYY-MM-DD; defaults to current UTC date if omitted.
 * payment: absent = Pay Later; present = Paid Now (C4+).
 */
export type AssignPackageInput = {
  clientIndexId:              string
  erpCustomerId:              string
  packageTemplateId:          string
  idempotencyKey:             string
  assignedByUserId?:          string | null
  assignmentDate?:            string | null
  payment?:                   AssignPackagePaymentInput | null
  allowDuplicateActivePackage?: boolean
}

/**
 * Result from PackageAssignmentService.assignPackage.
 * ledgerEvent is null only during a pending replay (purchase in-flight, no ledger yet).
 * invoice is null for complimentary (zero-value) assignments.
 * paymentWarning: set when Paid Now was requested but the Payment Entry failed —
 *   the package still activated as unpaid; trainer collects later via Record Payment.
 */
export type AssignPackageResult = {
  purchase:           ClientPackagePurchase
  ledgerEvent:        PackageLedgerEvent | null
  erpInvoiceId:       string | null
  invoice:            Invoice | null
  isIdempotentReplay: boolean
  paymentWarning?:    string | null
}

/** Picker-safe view of an active package template for the assignment UI. */
export type AssignablePackageTemplate = {
  id:           string
  name:         string
  description:  string | null
  templateType: TemplateType
  sessionCount: number
  priceAmount:  number
  currency:     string
  expiryDays:   number | null
  erpItemCode:  string | null
}

/** A purchase with its ledger-derived remaining session balance. */
export type PackagePurchaseWithBalance = ClientPackagePurchase & {
  remainingBalance: number
}

/** Summary of all package purchases for a client with session balances. */
export type ClientPackageSummary = {
  clientIndexId: string
  purchases:     PackagePurchaseWithBalance[]
}
