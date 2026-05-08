import { describe, expect, it, vi } from 'vitest'

// `client.ts` imports lib/tenant/context which has `import "server-only"` —
// that package is not available in vitest. Mock the module before any import
// runs (vitest hoists vi.mock calls automatically).
vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: vi.fn(),
}))

import { clientFields, mapInvoiceStatus, mapPaymentProvider, normalizeClient, normalizeInvoice } from './client'
import type { ERPClient, ERPInvoice } from './types'

describe('clientFields', () => {
  it('returns valid JSON array', () => {
    const parsed = JSON.parse(clientFields())
    expect(Array.isArray(parsed)).toBe(true)
  })

  it('includes required ERPNext fields', () => {
    const fields: string[] = JSON.parse(clientFields())
    expect(fields).toContain('name')
    expect(fields).toContain('customer_name')
    expect(fields).toContain('creation')
  })

  it('includes provisioned FitDesk custom fields', () => {
    const fields: string[] = JSON.parse(clientFields())
    // These four are provisioned by provisioning_api/api/fitdesk_setup.py.
    // Anything not in fitdesk_setup.py must NOT be requested — Frappe 417s.
    expect(fields).toContain('custom_fitness_goals')
    expect(fields).toContain('custom_trainer_notes')
    expect(fields).toContain('custom_package_type')
    expect(fields).toContain('custom_remaining_sessions')
  })

  it('does not request fields not provisioned in the target tenant', () => {
    const fields: string[] = JSON.parse(clientFields())
    // These are mapped by normalizeClient (forward-compat) but not provisioned;
    // requesting them would 417.
    expect(fields).not.toContain('custom_blood_type')
    expect(fields).not.toContain('custom_emergency_contact_name')
    expect(fields).not.toContain('custom_emergency_contact_phone')
  })

  it('does not contain server-rejected fields', () => {
    const fields: string[] = JSON.parse(clientFields())
    // Frappe permission_query_conditions rejects unknown or restricted fields with 417
    expect(fields).not.toContain('owner')        // not needed on Customer
    expect(fields).not.toContain('modified_by')
    expect(fields).not.toContain('docstatus')
  })
})

describe('normalizeClient', () => {
  const minimal: ERPClient = {
    name: 'CUST-0001',
    customer_name: 'Jane Doe',
    creation: '2026-01-15 10:00:00.000000',
    modified: '2026-01-15 10:00:00.000000',
  }

  it('maps required fields', () => {
    const client = normalizeClient(minimal)
    expect(client.id).toBe('CUST-0001')
    expect(client.name).toBe('Jane Doe')
    expect(client.createdAt).toBe('2026-01-15 10:00:00.000000')
  })

  it('omits undefined optional fields', () => {
    const client = normalizeClient(minimal)
    expect(client.mobile).toBeUndefined()
    expect(client.fitnessGoals).toBeUndefined()
    expect(client.trainerNotes).toBeUndefined()
    expect(client.packageType).toBeUndefined()
  })

  it('maps optional fields when present', () => {
    const full: ERPClient = {
      ...minimal,
      mobile_no: '+961-70-123456',
      custom_fitness_goals: 'Weight loss',
      custom_trainer_notes: 'Knee injury',
      custom_package_type: 'Monthly',
      custom_blood_type: 'O+',
      custom_emergency_contact_name: 'John Doe',
      custom_emergency_contact_phone: '+961-70-654321',
      custom_remaining_sessions: 8,
    }
    const client = normalizeClient(full)
    expect(client.mobile).toBe('+961-70-123456')
    expect(client.fitnessGoals).toBe('Weight loss')
    expect(client.trainerNotes).toBe('Knee injury')
    expect(client.packageType).toBe('Monthly')
    expect(client.bloodType).toBe('O+')
    expect(client.emergencyContactName).toBe('John Doe')
    expect(client.emergencyContactPhone).toBe('+961-70-654321')
    expect(client.remainingSessions).toBe(8)
  })

  it('leaves absent optional fields as undefined', () => {
    // ERPClient fields are optional (string | undefined) — absent fields must
    // not appear on the normalized Client shape.
    const sparse: ERPClient = {
      name: 'CUST-0002',
      customer_name: 'Sparse Client',
      creation: '2026-02-01 00:00:00.000000',
      modified: '2026-02-01 00:00:00.000000',
    }
    const client = normalizeClient(sparse)
    expect(client.mobile).toBeUndefined()
    expect(client.fitnessGoals).toBeUndefined()
    expect(client.remainingSessions).toBeUndefined()
  })
})

describe('mapInvoiceStatus', () => {
  it('maps known ERPNext statuses', () => {
    expect(mapInvoiceStatus('Draft')).toBe('draft')
    expect(mapInvoiceStatus('Submitted')).toBe('sent')
    expect(mapInvoiceStatus('Paid')).toBe('paid')
    expect(mapInvoiceStatus('Overdue')).toBe('overdue')
    expect(mapInvoiceStatus('Cancelled')).toBe('cancelled')
  })

  it('falls back to draft for unknown status', () => {
    expect(mapInvoiceStatus('Return')).toBe('draft')
    expect(mapInvoiceStatus('')).toBe('draft')
    expect(mapInvoiceStatus('UNKNOWN_STATUS')).toBe('draft')
  })
})

describe('normalizeInvoice', () => {
  const raw: ERPInvoice = {
    name: 'SINV-00001',
    customer: 'CUST-00001',
    customer_name: 'John Doe',
    posting_date: '2026-01-01',
    due_date: '2026-01-15',
    grand_total: 500,
    outstanding_amount: 500,
    currency: 'USD',
    status: 'Submitted',
    creation: '2026-01-01 10:00:00.000000',
    modified: '2026-01-01 10:00:00.000000',
  }

  it('maps required fields correctly', () => {
    const inv = normalizeInvoice(raw)
    expect(inv.id).toBe('SINV-00001')
    expect(inv.clientId).toBe('CUST-00001')
    expect(inv.clientName).toBe('John Doe')
    expect(inv.amount).toBe(500)
    expect(inv.outstandingAmount).toBe(500)
    expect(inv.currency).toBe('USD')
    expect(inv.dueDate).toBe('2026-01-15')
    expect(inv.issuedAt).toBe('2026-01-01')
  })

  it('trainerId is always empty string', () => {
    expect(normalizeInvoice(raw).trainerId).toBe('')
  })

  it('falls back clientName to docname when customer_name is absent', () => {
    const inv = normalizeInvoice({ ...raw, customer_name: undefined })
    expect(inv.clientName).toBe('CUST-00001')
  })

  it('defaults currency to USD when absent', () => {
    const inv = normalizeInvoice({ ...raw, currency: undefined as never })
    expect(inv.currency).toBe('USD')
  })

  it('maps status via mapInvoiceStatus', () => {
    expect(normalizeInvoice({ ...raw, status: 'Draft' }).status).toBe('draft')
    expect(normalizeInvoice({ ...raw, status: 'Submitted' }).status).toBe('sent')
    expect(normalizeInvoice({ ...raw, status: 'Paid' }).status).toBe('paid')
    expect(normalizeInvoice({ ...raw, status: 'Overdue' }).status).toBe('overdue')
    expect(normalizeInvoice({ ...raw, status: 'Cancelled' }).status).toBe('cancelled')
  })

  it('sets paidAt to modified date (YYYY-MM-DD) when status is Paid', () => {
    const inv = normalizeInvoice({
      ...raw,
      status: 'Paid',
      outstanding_amount: 0,
      modified: '2026-02-14 09:30:15.000000',
    })
    expect(inv.paidAt).toBe('2026-02-14')
  })

  it('sets paidAt when outstanding is 0 even if status mapping is unusual', () => {
    const inv = normalizeInvoice({
      ...raw,
      status: 'Submitted',
      outstanding_amount: 0,
      modified: '2026-02-14 09:30:15.000000',
    })
    expect(inv.paidAt).toBe('2026-02-14')
  })

  it('leaves paidAt undefined when invoice is not fully paid', () => {
    expect(normalizeInvoice({ ...raw, status: 'Submitted', outstanding_amount: 500 }).paidAt).toBeUndefined()
    expect(normalizeInvoice({ ...raw, status: 'Overdue',   outstanding_amount: 250 }).paidAt).toBeUndefined()
  })
})

describe('mapPaymentProvider', () => {
  it('detects whish', () => {
    expect(mapPaymentProvider('Whish Money')).toBe('whish')
    expect(mapPaymentProvider('whish')).toBe('whish')
    expect(mapPaymentProvider('WHISH TRANSFER')).toBe('whish')
  })

  it('detects bank transfer', () => {
    expect(mapPaymentProvider('Bank Transfer')).toBe('bank_transfer')
    expect(mapPaymentProvider('Wire Transfer')).toBe('bank_transfer')
    expect(mapPaymentProvider('bank')).toBe('bank_transfer')
  })

  it('defaults to cash', () => {
    expect(mapPaymentProvider('Cash')).toBe('cash')
    expect(mapPaymentProvider('card')).toBe('cash')
    expect(mapPaymentProvider('')).toBe('cash')
  })
})
