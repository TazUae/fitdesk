import { describe, expect, it } from 'vitest'
import { buildPackageInvoicePayload } from '@/lib/billing/package-invoice-builder'
import type { PackageTemplateSnapshot } from '@/types/billing'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<PackageTemplateSnapshot> = {}): PackageTemplateSnapshot {
  return {
    schemaVersion:        1,
    templateId:           'tpl-001',
    name:                 '10-Session Block',
    description:          null,
    templateType:         'standard_block',
    sessionCount:         10,
    priceAmount:          50000,  // USD minor units ($500.00)
    currency:             'USD',
    expiryDays:           null,
    erpItemCode:          'SVC-10',
    supersedesTemplateId: null,
    templateStatus:       'active',
    capturedAtUtc:        '2026-06-26T00:00:00.000Z',
    ...overrides,
  }
}

const BASE_CUSTOMER = 'CUST-0001'
const BASE_DATE     = '2026-06-26'

// ─── buildPackageInvoicePayload ───────────────────────────────────────────────

describe('buildPackageInvoicePayload', () => {
  describe('USD invoice — happy path', () => {
    it('sets customer from erpCustomerId', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot(),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.customer).toBe(BASE_CUSTOMER)
    })

    it('sets posting_date to postingDate', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot(),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.posting_date).toBe(BASE_DATE)
    })

    it('sets due_date equal to posting_date (MVP)', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot(),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.due_date).toBe(BASE_DATE)
    })

    it('sets currency from snapshot (uppercase)', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot({ currency: 'usd' }),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.currency).toBe('USD')
    })

    it('creates exactly one item', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot(),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.items).toHaveLength(1)
    })

    it('sets item_code from snapshot.erpItemCode', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot({ erpItemCode: 'SVC-10' }),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.items[0]!.item_code).toBe('SVC-10')
    })

    it('sets qty to 1', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot(),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.items[0]!.qty).toBe(1)
    })

    it('converts 50000 USD minor units to rate 500', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot({ priceAmount: 50000, currency: 'USD' }),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.items[0]!.rate).toBe(500)
    })

    it('includes package name and session count in item description', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot({ name: '10-Session Block', sessionCount: 10 }),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      const desc = payload.items[0]!.description ?? ''
      expect(desc).toContain('10-Session Block')
      expect(desc).toContain('10')
    })

    it('includes package assignment in remarks', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot({ name: '10-Session Block' }),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.remarks).toContain('assignment')
    })
  })

  describe('LBP invoice — no subunit conversion', () => {
    it('passes 150000 LBP minor units as rate 150000', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot({ priceAmount: 150000, currency: 'LBP' }),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.items[0]!.rate).toBe(150000)
      expect(payload.currency).toBe('LBP')
    })
  })

  describe('SAR invoice', () => {
    it('converts 1000 SAR minor units to rate 10', () => {
      const payload = buildPackageInvoicePayload({
        snapshot:      makeSnapshot({ priceAmount: 1000, currency: 'SAR' }),
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(payload.items[0]!.rate).toBe(10)
      expect(payload.currency).toBe('SAR')
    })
  })

  describe('validation — missing ERP item code', () => {
    it('throws when erpItemCode is null', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot({ erpItemCode: null }),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   BASE_DATE,
        }),
      ).toThrow('erpItemCode')
    })

    it('throws when erpItemCode is blank string', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot({ erpItemCode: '   ' }),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   BASE_DATE,
        }),
      ).toThrow('erpItemCode')
    })
  })

  describe('validation — blank ERP customer id', () => {
    it('throws for empty erpCustomerId', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot(),
          erpCustomerId: '',
          postingDate:   BASE_DATE,
        }),
      ).toThrow('erpCustomerId')
    })

    it('throws for blank-only erpCustomerId', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot(),
          erpCustomerId: '   ',
          postingDate:   BASE_DATE,
        }),
      ).toThrow('erpCustomerId')
    })
  })

  describe('validation — invalid posting date', () => {
    it('throws for wrong format (MM/DD/YYYY)', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot(),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   '06/26/2026',
        }),
      ).toThrow('YYYY-MM-DD')
    })

    it('throws for empty posting date', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot(),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   '',
        }),
      ).toThrow('YYYY-MM-DD')
    })

    it('throws for partial date string', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot(),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   '2026-06',
        }),
      ).toThrow('YYYY-MM-DD')
    })

    it('throws for ISO datetime string (not date-only)', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot(),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   '2026-06-26T00:00:00.000Z',
        }),
      ).toThrow('YYYY-MM-DD')
    })
  })

  describe('validation — unsupported currency', () => {
    it('throws for an unsupported currency before returning payload', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot({ priceAmount: 1000, currency: 'XYZ' }),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   BASE_DATE,
        }),
      ).toThrow('unsupported currency')
    })
  })

  describe('validation — zero price package', () => {
    it('throws for priceAmount === 0', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot({ priceAmount: 0 }),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   BASE_DATE,
        }),
      ).toThrow('priceAmount')
    })
  })

  describe('validation — negative price package', () => {
    it('throws for negative priceAmount', () => {
      expect(() =>
        buildPackageInvoicePayload({
          snapshot:      makeSnapshot({ priceAmount: -100 }),
          erpCustomerId: BASE_CUSTOMER,
          postingDate:   BASE_DATE,
        }),
      ).toThrow()
    })
  })

  describe('immutability — snapshot is not mutated', () => {
    it('does not modify the snapshot object', () => {
      const snapshot = makeSnapshot({ currency: 'usd' })
      const before = JSON.stringify(snapshot)
      buildPackageInvoicePayload({
        snapshot,
        erpCustomerId: BASE_CUSTOMER,
        postingDate:   BASE_DATE,
      })
      expect(JSON.stringify(snapshot)).toBe(before)
    })
  })
})
