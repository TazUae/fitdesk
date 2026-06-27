import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { projectPackagePaymentStatus } from '@/lib/billing/payment-status'

// ─── Normalised internal InvoiceStatus values ─────────────────────────────────

describe('normalised internal values', () => {
  it('maps "paid" to "paid"', () => {
    expect(projectPackagePaymentStatus('paid')).toBe('paid')
  })

  it('maps "partially_paid" to "partially_paid"', () => {
    expect(projectPackagePaymentStatus('partially_paid')).toBe('partially_paid')
  })

  it('maps "sent" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('sent')).toBe('unpaid')
  })

  it('maps "overdue" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('overdue')).toBe('unpaid')
  })

  it('maps "draft" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('draft')).toBe('unpaid')
  })

  it('maps "cancelled" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('cancelled')).toBe('unpaid')
  })
})

// ─── Raw ERP / display-variant strings ───────────────────────────────────────

describe('raw ERP / display variants', () => {
  it('maps "Paid" to "paid"', () => {
    expect(projectPackagePaymentStatus('Paid')).toBe('paid')
  })

  it('maps "Partly Paid" to "partially_paid"', () => {
    expect(projectPackagePaymentStatus('Partly Paid')).toBe('partially_paid')
  })

  it('maps "Unpaid" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('Unpaid')).toBe('unpaid')
  })

  it('maps "Overdue" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('Overdue')).toBe('unpaid')
  })

  it('maps "Draft" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('Draft')).toBe('unpaid')
  })

  it('maps "Cancelled" to "unpaid"', () => {
    expect(projectPackagePaymentStatus('Cancelled')).toBe('unpaid')
  })
})

// ─── Unknown / edge values ────────────────────────────────────────────────────

describe('unknown and edge values', () => {
  it('maps an unknown string to "unpaid"', () => {
    expect(projectPackagePaymentStatus('something_random')).toBe('unpaid')
  })

  it('maps another unknown string to "unpaid"', () => {
    expect(projectPackagePaymentStatus('INVALID_STATUS_XYZ')).toBe('unpaid')
  })

  it('maps null to "unpaid"', () => {
    expect(projectPackagePaymentStatus(null)).toBe('unpaid')
  })

  it('maps undefined to "unpaid"', () => {
    expect(projectPackagePaymentStatus(undefined)).toBe('unpaid')
  })

  it('maps empty string to "unpaid"', () => {
    expect(projectPackagePaymentStatus('')).toBe('unpaid')
  })

  it('maps blank-only string to "unpaid"', () => {
    expect(projectPackagePaymentStatus('   ')).toBe('unpaid')
  })
})

// ─── Source purity guard ──────────────────────────────────────────────────────

describe('source purity', () => {
  const src = readFileSync(join(__dirname, '..', 'payment-status.ts'), 'utf-8')

  it('does not import from erpnext/client', () => {
    expect(src).not.toContain('erpnext/client')
  })

  it('does not import from business-data/erp-adapter', () => {
    expect(src).not.toContain('business-data/erp-adapter')
  })

  it('does not import from actions/', () => {
    expect(src).not.toMatch(/from ['"].*actions\//)
  })

  it('does not import from next/', () => {
    expect(src).not.toMatch(/from ['"]next\//)
  })

  it('does not contain fetch calls', () => {
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toMatch(/\berpFetch\s*\(/)
  })

  it('does not reference createAndSubmitPaymentEntry', () => {
    expect(src).not.toContain('createAndSubmitPaymentEntry')
  })
})
