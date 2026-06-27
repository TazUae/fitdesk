import type { PackagePaymentStatus } from '@/lib/billing/taxonomy'

/**
 * Project an ERP invoice status into the local PackagePaymentStatus read-model.
 *
 * This is a pure read-model projection only — it does not compute financial truth.
 * ERPNext is authoritative for all payment state (ADR §1 rule 6). Unknown or
 * unrecognised values (including null/undefined/blank) safely floor to 'unpaid'.
 *
 * Handles both the normalised internal InvoiceStatus values ('paid', 'sent', …)
 * and common raw ERP display variants ('Paid', 'Partly Paid', 'Overdue', …).
 */
export function projectPackagePaymentStatus(
  invoiceStatus: string | null | undefined,
): PackagePaymentStatus {
  if (!invoiceStatus || invoiceStatus.trim() === '') return 'unpaid'

  const key = invoiceStatus.trim().toLowerCase().replace(/\s+/g, '_')

  switch (key) {
    case 'paid':          return 'paid'
    case 'partially_paid':
    case 'partly_paid':   return 'partially_paid'
    default:              return 'unpaid'
  }
}
