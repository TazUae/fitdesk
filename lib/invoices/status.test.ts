import { describe, expect, it } from 'vitest'

import { invoiceStatusLabel, isOutstandingInvoiceStatus } from './status'

describe('invoiceStatusLabel', () => {
  it('returns trainer-facing labels for every status', () => {
    expect(invoiceStatusLabel('draft')).toBe('Preparing')
    expect(invoiceStatusLabel('sent')).toBe('To collect')
    expect(invoiceStatusLabel('partially_paid')).toBe('Partly paid')
    expect(invoiceStatusLabel('overdue')).toBe('Overdue')
    expect(invoiceStatusLabel('paid')).toBe('Paid')
    expect(invoiceStatusLabel('cancelled')).toBe('Cancelled')
  })
})

describe('isOutstandingInvoiceStatus', () => {
  it('is true for statuses that still owe money', () => {
    expect(isOutstandingInvoiceStatus('sent')).toBe(true)
    expect(isOutstandingInvoiceStatus('overdue')).toBe(true)
    expect(isOutstandingInvoiceStatus('partially_paid')).toBe(true)
  })

  it('is false for draft, paid, and cancelled', () => {
    expect(isOutstandingInvoiceStatus('draft')).toBe(false)
    expect(isOutstandingInvoiceStatus('paid')).toBe(false)
    expect(isOutstandingInvoiceStatus('cancelled')).toBe(false)
  })
})
