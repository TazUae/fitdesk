import { describe, expect, it, vi } from 'vitest'

// `client.ts` imports lib/tenant/context which has `import "server-only"` —
// that package is not available in vitest. Mock the module before any import
// runs (vitest hoists vi.mock calls automatically).
vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: vi.fn(),
}))

import { clientFields, mapInvoiceStatus, mapPaymentProvider, normalizeClient } from './client'
import type { ERPClient } from './types'

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
