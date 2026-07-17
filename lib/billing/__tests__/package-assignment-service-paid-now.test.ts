/**
 * Integration tests for PackageAssignmentService — Paid Now path (C4b).
 *
 * Uses a unique temp-file SQLite database per test. ERP dependency is mocked
 * via vi.fn() — no real ERP calls. Tests cover the Paid Now happy path,
 * payment failure hardening, replay/recovery safety, and static invariants.
 *
 * The Payment Entry helper (createAndSubmitPaymentEntry) must:
 *  - be called exactly once on the fresh Paid Now path
 *  - never be called on replay, recovery, or complimentary paths
 *  - use the ERP invoice's outstandingAmount (not a client-supplied value)
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import {
  PackageAssignmentService,
  type PackageAssignmentErpAdapter,
  type TenantCtx,
} from '@/lib/billing/package-assignment-service'
import type { PaymentMethod } from '@/lib/payments/methods'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import { paymentMethodToErpMode } from '@/lib/payments/methods'
import type { AssignPackageInput } from '@/types/billing'
import type { Invoice } from '@/types'

// ─── DDL (kept in sync with scripts/migrate-app.mjs) ─────────────────────────

const SETUP_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id"                           TEXT NOT NULL PRIMARY KEY,
    "tenant_id"                    TEXT NOT NULL,
    "erp_customer_id"              TEXT NOT NULL,
    "full_name"                    TEXT NOT NULL,
    "phone_e164"                   TEXT NOT NULL,
    "whatsapp_enabled"             INTEGER NOT NULL DEFAULT 0,
    "whatsapp_consent_state"       TEXT NOT NULL DEFAULT 'unknown',
    "status"                       TEXT NOT NULL DEFAULT 'active',
    "primary_goal_label"           TEXT,
    "primary_goal_id"              TEXT,
    "safety_state"                 TEXT NOT NULL DEFAULT 'clear',
    "onboarding_state"             TEXT NOT NULL DEFAULT 'not_started',
    "billing_mode"                 TEXT NOT NULL DEFAULT 'unset',
    "payment_summary"              TEXT NOT NULL DEFAULT 'unset',
    "next_session_at_utc"          TEXT,
    "last_activity_at_utc"         TEXT,
    "possible_duplicate_client_id" TEXT,
    "duplicate_override_reason"    TEXT,
    "created_at_utc"               TEXT NOT NULL,
    "updated_at_utc"               TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_index_tenant_erp_idx"
    ON "client_index" ("tenant_id", "erp_customer_id")`,

  `CREATE TABLE IF NOT EXISTS "package_template" (
    "id"                     TEXT NOT NULL PRIMARY KEY,
    "tenant_id"              TEXT NOT NULL,
    "name"                   TEXT NOT NULL,
    "description"            TEXT,
    "template_type"          TEXT NOT NULL DEFAULT 'standard_block'
                               CHECK ("template_type" IN ('standard_block','complimentary','promotional')),
    "session_count"          INTEGER NOT NULL CHECK ("session_count" > 0),
    "price_amount"           INTEGER NOT NULL DEFAULT 0 CHECK ("price_amount" >= 0),
    "currency"               TEXT NOT NULL CHECK (length("currency") = 3),
    "expiry_days"            INTEGER CHECK ("expiry_days" IS NULL OR "expiry_days" > 0),
    "erp_item_code"          TEXT,
    "status"                 TEXT NOT NULL DEFAULT 'draft'
                               CHECK ("status" IN ('draft','active','archived')),
    "first_sold_at_utc"      TEXT,
    "supersedes_template_id" TEXT,
    "archived_at_utc"        TEXT,
    "created_at_utc"         TEXT NOT NULL,
    "updated_at_utc"         TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "package_template_tenant_status_idx"
    ON "package_template" ("tenant_id", "status")`,

  `CREATE TABLE IF NOT EXISTS "client_package_purchase" (
    "id"                     TEXT NOT NULL PRIMARY KEY,
    "tenant_id"              TEXT NOT NULL,
    "client_index_id"        TEXT NOT NULL,
    "erp_customer_id"        TEXT NOT NULL,
    "package_template_id"    TEXT NOT NULL,
    "template_snapshot_json" TEXT NOT NULL
                               CHECK (length("template_snapshot_json") > 0
                                      AND json_valid("template_snapshot_json")),
    "erp_sales_invoice_id"   TEXT,
    "idempotency_key"        TEXT,
    "payment_status"         TEXT NOT NULL DEFAULT 'pending'
                               CHECK ("payment_status" IN ('pending','unpaid','partially_paid','paid','refunded')),
    "package_status"         TEXT NOT NULL DEFAULT 'pending_activation'
                               CHECK ("package_status" IN ('pending_activation','active','expired','refunded','cancelled')),
    "purchased_at_utc"       TEXT NOT NULL,
    "activated_at_utc"       TEXT CHECK ("activated_at_utc" IS NULL OR "activated_at_utc" >= "purchased_at_utc"),
    "expires_at_utc"         TEXT CHECK ("expires_at_utc" IS NULL OR "expires_at_utc" >= "purchased_at_utc"),
    "created_at_utc"         TEXT NOT NULL,
    "updated_at_utc"         TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "client_package_purchase_tenant_client_idx"
    ON "client_package_purchase" ("tenant_id", "client_index_id")`,
  `CREATE INDEX IF NOT EXISTS "client_package_purchase_tenant_template_idx"
    ON "client_package_purchase" ("tenant_id", "package_template_id")`,
  `CREATE INDEX IF NOT EXISTS "client_package_purchase_tenant_status_idx"
    ON "client_package_purchase" ("tenant_id", "package_status")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_package_purchase_tenant_invoice_uq"
    ON "client_package_purchase" ("tenant_id", "erp_sales_invoice_id")
    WHERE "erp_sales_invoice_id" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_package_purchase_tenant_idempotency_uq"
    ON "client_package_purchase" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS "package_ledger" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "tenant_id"           TEXT NOT NULL,
    "client_index_id"     TEXT NOT NULL,
    "erp_customer_id"     TEXT NOT NULL,
    "package_purchase_id" TEXT NOT NULL,
    "event_type"          TEXT NOT NULL
                            CHECK ("event_type" IN (
                              'purchase_activation','bonus_granted','refund_credit',
                              'session_consumed','late_cancel_penalty','expiration_sweep'
                            )),
    "delta_units"         INTEGER NOT NULL CHECK ("delta_units" != 0),
    "reason"              TEXT,
    "idempotency_key"     TEXT,
    "erp_reference"       TEXT,
    "created_by_user_id"  TEXT,
    "created_at_utc"      TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "package_ledger_tenant_purchase_idx"
    ON "package_ledger" ("tenant_id", "package_purchase_id")`,
  `CREATE INDEX IF NOT EXISTS "package_ledger_tenant_client_idx"
    ON "package_ledger" ("tenant_id", "client_index_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "package_ledger_tenant_idempotency_uq"
    ON "package_ledger" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,
]

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT          = 'tenant-pnow'
const CTX: TenantCtx  = { tenantId: TENANT }

const CLIENT_ID        = 'ci-pnow-1'
const ERP_CUSTOMER_ID  = 'CUST-PNOW-001'

const TEMPLATE_ID      = 'tpl-pnow-paid'   // active, non-zero, USD, 10 sessions
const COMP_TEMPLATE_ID = 'tpl-pnow-comp'   // active, zero-value, 5 sessions

const INVOICE_ID = 'ACC-SINV-2026-PNOW-001'
const IDEM_KEY   = 'ikey-pnow-happy'
const COMP_KEY   = 'ikey-pnow-comp'

// ─── Mock invoice factory ─────────────────────────────────────────────────────

function makeMockInvoice(
  id: string,
  status: Invoice['status'] = 'sent',
  outstandingAmount?: number,
): Invoice {
  return {
    id,
    clientId:          ERP_CUSTOMER_ID,
    clientName:        'Paid Now Client',
    trainerId:         '',
    amount:            500,
    outstandingAmount: outstandingAmount ?? (status === 'paid' ? 0 : 500),
    currency:          'USD',
    status,
    dueDate:           '2026-06-27',
    issuedAt:          '2026-06-27',
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tempDir:      string
let dbClient:     ReturnType<typeof createClient>
let mockErp:      { [K in keyof Required<PackageAssignmentErpAdapter>]: ReturnType<typeof vi.fn> } & PackageAssignmentErpAdapter
let service:      PackageAssignmentService
let purchaseRepo: ClientPackagePurchaseRepository
let ledgerRepo:   PackageLedgerRepository

beforeEach(async () => {
  tempDir  = mkdtempSync(join(tmpdir(), 'fitdesk-pnow-test-'))
  dbClient = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  for (const stmt of SETUP_DDL) {
    await dbClient.execute(stmt)
  }
  const db = drizzle(dbClient, { schema })

  mockErp = {
    createInvoice:               vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID)),
    submitSalesInvoice:          vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent')),
    getInvoiceById:              vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent')),
    createAndSubmitPaymentEntry: vi.fn().mockResolvedValue({
      payment: {},
      invoice: makeMockInvoice(INVOICE_ID, 'paid'),
    }),
  }

  service      = new PackageAssignmentService(db, mockErp)
  purchaseRepo = new ClientPackagePurchaseRepository(db)
  ledgerRepo   = new PackageLedgerRepository(db)

  await dbClient.execute(`
    INSERT INTO "client_index"
      ("id","tenant_id","erp_customer_id","full_name","phone_e164","billing_mode","created_at_utc","updated_at_utc")
    VALUES
      ('${CLIENT_ID}','${TENANT}','${ERP_CUSTOMER_ID}','Paid Now Client','+96170000002','package',
       '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${TEMPLATE_ID}','${TENANT}','10-Session Block','standard_block',10,50000,'USD',
       'SVC-10','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${COMP_TEMPLATE_ID}','${TENANT}','5-Session Comp','complimentary',5,0,'USD',
       NULL,'active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop on Windows EPERM */ }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<AssignPackageInput> = {}): AssignPackageInput {
  return {
    clientIndexId:     CLIENT_ID,
    erpCustomerId:     ERP_CUSTOMER_ID,
    packageTemplateId: TEMPLATE_ID,
    idempotencyKey:    IDEM_KEY,
    ...overrides,
  }
}

function paidNowInput(overrides: Partial<AssignPackageInput> = {}): AssignPackageInput {
  return baseInput({ payment: { method: 'cash' }, ...overrides })
}

// ─── 1. Paid Now happy path ───────────────────────────────────────────────────

describe('Paid Now happy path', () => {
  it('calls ERP helpers exactly once each and activates purchase as paid', async () => {
    const result = await service.assignPackage(CTX, paidNowInput())

    // Purchase active with correct statuses
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('paid')
    expect(result.isIdempotentReplay).toBe(false)

    // ERP call counts
    expect(mockErp.createInvoice).toHaveBeenCalledTimes(1)
    expect(mockErp.submitSalesInvoice).toHaveBeenCalledTimes(1)
    expect(mockErp.createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
    expect(mockErp.getInvoiceById).not.toHaveBeenCalled()

    // One purchase_activation ledger event
    expect(result.ledgerEvent?.eventType).toBe('purchase_activation')
    expect(result.ledgerEvent?.deltaUnits).toBe(10)
    expect(result.ledgerEvent?.erpReference).toBe(INVOICE_ID)

    // No payment warning
    expect(result.paymentWarning == null).toBe(true)

    const balance = await ledgerRepo.deriveBalanceByPurchase(CTX, result.purchase.id)
    expect(balance).toBe(10)
  })

  it('passes correct modeOfPayment (server-resolved, not client-supplied ERP string)', async () => {
    await service.assignPackage(CTX, paidNowInput())

    const opts = mockErp.createAndSubmitPaymentEntry.mock.calls[0]![0] as {
      modeOfPayment: string
    }
    expect(opts.modeOfPayment).toBe(paymentMethodToErpMode('cash'))
    expect(opts.modeOfPayment).toBe('Cash')
  })
})

// ─── 2. PE amount = ERP outstanding amount (not client-supplied) ──────────────

describe('PE amount = submitted invoice outstandingAmount', () => {
  it('uses outstandingAmount from the submitted invoice, not the template price', async () => {
    // Invoice has partial credit applied — outstanding is 300, template price is 500
    mockErp.submitSalesInvoice = vi.fn().mockResolvedValue(
      makeMockInvoice(INVOICE_ID, 'sent', 300),
    )
    mockErp.createAndSubmitPaymentEntry = vi.fn().mockResolvedValue({
      payment: {},
      invoice: makeMockInvoice(INVOICE_ID, 'paid', 0),
    })

    await service.assignPackage(CTX, paidNowInput())

    const opts = mockErp.createAndSubmitPaymentEntry.mock.calls[0]![0] as { amount: number }
    expect(opts.amount).toBe(300)  // ERP outstanding, not 500 (template priceAmount in major units)
  })

  it('passes the invoice docname as invoiceId and ERP customer as clientId', async () => {
    await service.assignPackage(CTX, paidNowInput())

    const opts = mockErp.createAndSubmitPaymentEntry.mock.calls[0]![0] as {
      invoiceId: string
      clientId:  string
    }
    expect(opts.invoiceId).toBe(INVOICE_ID)
    expect(opts.clientId).toBe(ERP_CUSTOMER_ID)
  })
})

// ─── 3. PE fails but re-fetch shows invoice is already Paid ──────────────────

describe('PE fails but getInvoiceById re-fetch returns Paid', () => {
  it('activates as paid with no paymentWarning; PE not retried', async () => {
    mockErp.createAndSubmitPaymentEntry = vi.fn().mockRejectedValue(new Error('ERP PE 503'))
    mockErp.getInvoiceById = vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'paid', 0))

    const result = await service.assignPackage(CTX, paidNowInput())

    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('paid')
    expect(result.paymentWarning == null).toBe(true)

    // PE called once only — no retry
    expect(mockErp.createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
    // One re-fetch after the PE failure
    expect(mockErp.getInvoiceById).toHaveBeenCalledTimes(1)

    expect(result.ledgerEvent?.eventType).toBe('purchase_activation')
  })
})

// ─── 4. PE fails and invoice re-fetch returns still-unpaid ───────────────────

describe('PE fails and getInvoiceById re-fetch returns unpaid invoice', () => {
  it('activates as unpaid with paymentWarning; PE not retried', async () => {
    mockErp.createAndSubmitPaymentEntry = vi.fn().mockRejectedValue(new Error('ERP PE 503'))
    mockErp.getInvoiceById = vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent', 500))

    const result = await service.assignPackage(CTX, paidNowInput())

    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('unpaid')
    expect(typeof result.paymentWarning).toBe('string')
    expect(result.paymentWarning).toMatch(/payment/i)

    // No PE retry
    expect(mockErp.createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
    expect(mockErp.getInvoiceById).toHaveBeenCalledTimes(1)
  })
})

// ─── 5. PE fails and invoice re-fetch also fails ─────────────────────────────

describe('PE fails and getInvoiceById re-fetch also fails', () => {
  it('activates as unpaid with paymentWarning; no second PE attempt', async () => {
    mockErp.createAndSubmitPaymentEntry = vi.fn().mockRejectedValue(new Error('ERP PE 503'))
    mockErp.getInvoiceById = vi.fn().mockRejectedValue(new Error('ERP GET 503'))

    const result = await service.assignPackage(CTX, paidNowInput())

    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('unpaid')
    expect(typeof result.paymentWarning).toBe('string')

    expect(mockErp.createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
    expect(mockErp.getInvoiceById).toHaveBeenCalledTimes(1)

    // Ledger event still written despite payment failure
    expect(result.ledgerEvent?.eventType).toBe('purchase_activation')
  })
})

// ─── 6. Unsupported / disabled payment method ─────────────────────────────────

describe('unsupported or disabled payment method', () => {
  it('throws before purchase creation — no ERP call, no ledger', async () => {
    // usdt is intentionally not a PAYMENT_METHODS catalog entry (must stay unavailable)
    const input = baseInput({ payment: { method: 'usdt' as PaymentMethod } })

    await expect(service.assignPackage(CTX, input)).rejects.toThrow(
      /unsupported or disabled payment method/i,
    )

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(0)
  })

  it('rejects a Lebanon-only method for an unverified ctx (no market) — no ERP call, no ledger', async () => {
    const input = baseInput({ payment: { method: 'mymonty' }, idempotencyKey: 'ikey-pnow-lb-unverified' })

    await expect(service.assignPackage(CTX, input)).rejects.toThrow(
      /unsupported or disabled payment method/i,
    )
    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(0)
  })

  it('allows a Lebanon-only method through once ctx.market is "LB" — the gate lifts once authority is proven', async () => {
    const verifiedCtx: TenantCtx = { tenantId: TENANT, market: 'LB' }
    const input = baseInput({ payment: { method: 'mymonty' }, idempotencyKey: 'ikey-pnow-lb-verified' })

    const result = await service.assignPackage(verifiedCtx, input)

    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('paid')
    expect(mockErp.createAndSubmitPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ modeOfPayment: paymentMethodToErpMode('mymonty') }),
    )
  })
})

// ─── 7. Payment requested but adapter missing createAndSubmitPaymentEntry ──────

describe('adapter missing createAndSubmitPaymentEntry', () => {
  it('throws before purchase creation — no ERP call, no ledger', async () => {
    const adapterWithoutPE: PackageAssignmentErpAdapter = {
      createInvoice:      vi.fn(),
      submitSalesInvoice: vi.fn(),
      getInvoiceById:     vi.fn(),
      // createAndSubmitPaymentEntry intentionally absent
    }
    const svc = new PackageAssignmentService(
      drizzle(dbClient, { schema }),
      adapterWithoutPE,
    )

    await expect(
      svc.assignPackage(CTX, paidNowInput()),
    ).rejects.toThrow(/adapter is missing createAndSubmitPaymentEntry/i)

    expect(adapterWithoutPE.createInvoice).not.toHaveBeenCalled()
    expect(adapterWithoutPE.submitSalesInvoice).not.toHaveBeenCalled()

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(0)
  })
})

// ─── 8. Pay Later path unchanged when payment is absent ──────────────────────

describe('Pay Later path unchanged when input.payment is absent', () => {
  it('activates as unpaid with no PE call', async () => {
    const result = await service.assignPackage(CTX, baseInput())

    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('unpaid')
    expect(result.isIdempotentReplay).toBe(false)
    expect(result.paymentWarning == null).toBe(true)

    expect(mockErp.createInvoice).toHaveBeenCalledTimes(1)
    expect(mockErp.submitSalesInvoice).toHaveBeenCalledTimes(1)
    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(mockErp.getInvoiceById).not.toHaveBeenCalled()
  })
})

// ─── 9. Complimentary zero-value with payment field present ───────────────────

describe('complimentary zero-value with payment field', () => {
  it('ignores payment safely — no ERP invoice, no PE, paymentStatus paid', async () => {
    const result = await service.assignPackage(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: COMP_TEMPLATE_ID,
      idempotencyKey:    COMP_KEY,
      payment:           { method: 'cash' },
    })

    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('paid')
    expect(result.erpInvoiceId).toBeNull()
    expect(result.invoice).toBeNull()
    expect(result.paymentWarning == null).toBe(true)

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()

    expect(result.ledgerEvent?.eventType).toBe('bonus_granted')
  })
})

// ─── 10. Pending replay with no invoice id ────────────────────────────────────

describe('pending replay with no invoice id', () => {
  it('returns pending replay — no PE, no ERP call', async () => {
    // Seed a pending purchase (no invoice yet)
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: TEMPLATE_ID,
      idempotencyKey:    IDEM_KEY,
    })
    expect(purchase.erpSalesInvoiceId).toBeNull()

    const result = await service.assignPackage(CTX, paidNowInput())

    expect(result.isIdempotentReplay).toBe(true)
    expect(result.purchase.packageStatus).toBe('pending_activation')
    expect(result.ledgerEvent).toBeNull()

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })
})

// ─── 11. Recovery: pending with anchored invoice that ERP shows as Paid ───────

describe('recovery — pending with invoice, ERP shows Paid', () => {
  it('activates as paid without creating a Payment Entry', async () => {
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: TEMPLATE_ID,
      idempotencyKey:    IDEM_KEY,
    })
    await purchaseRepo.recordInvoiceCreated(CTX, purchase.id, { erpSalesInvoiceId: INVOICE_ID })

    // ERP already shows the invoice as paid (previous Paid Now succeeded at ERP, crashed locally)
    mockErp.getInvoiceById = vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'paid', 0))

    const result = await service.assignPackage(CTX, paidNowInput())

    expect(result.isIdempotentReplay).toBe(true)
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('paid')
    expect(result.paymentWarning == null).toBe(true)

    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(mockErp.getInvoiceById).toHaveBeenCalledOnce()
    expect(mockErp.createInvoice).not.toHaveBeenCalled()
  })
})

// ─── 12. Recovery: pending with anchored invoice still unpaid + Paid Now input ─

describe('recovery — pending with invoice, ERP shows unpaid, Paid Now input', () => {
  it('activates as unpaid and returns paymentWarning — no PE retry', async () => {
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: TEMPLATE_ID,
      idempotencyKey:    IDEM_KEY,
    })
    await purchaseRepo.recordInvoiceCreated(CTX, purchase.id, { erpSalesInvoiceId: INVOICE_ID })

    // ERP invoice is still unpaid (original PE never landed or was for a different assignment)
    mockErp.getInvoiceById = vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent', 500))

    const result = await service.assignPackage(CTX, paidNowInput())

    expect(result.isIdempotentReplay).toBe(true)
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('unpaid')
    expect(typeof result.paymentWarning).toBe('string')
    expect(result.paymentWarning).toMatch(/not retried/i)

    // Zero PE calls — never retry on recovery
    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(mockErp.createInvoice).not.toHaveBeenCalled()
  })
})

// ─── 13. Active replay — no PE ────────────────────────────────────────────────

describe('active replay', () => {
  it('returns existing result without PE call', async () => {
    // Successful first assignment
    const first = await service.assignPackage(CTX, paidNowInput())
    expect(first.purchase.packageStatus).toBe('active')
    expect(mockErp.createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)

    // Reset mocks
    vi.clearAllMocks()
    mockErp.getInvoiceById = vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'paid', 0))

    const second = await service.assignPackage(CTX, paidNowInput())

    expect(second.isIdempotentReplay).toBe(true)
    expect(second.purchase.id).toBe(first.purchase.id)
    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(mockErp.createInvoice).not.toHaveBeenCalled()

    // Only one purchase and one ledger event in DB
    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(1)
    const ledger = await ledgerRepo.listEventsByPurchase(CTX, first.purchase.id)
    expect(ledger).toHaveLength(1)
  })
})

// ─── 14. Payload mismatch — no PE ────────────────────────────────────────────

describe('payload mismatch on replay', () => {
  it('throws before PE and before ERP', async () => {
    await service.assignPackage(CTX, paidNowInput())

    vi.clearAllMocks()

    await expect(
      service.assignPackage(CTX, paidNowInput({ packageTemplateId: COMP_TEMPLATE_ID })),
    ).rejects.toThrow('idempotency key reuse with different payload')

    expect(mockErp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(mockErp.createInvoice).not.toHaveBeenCalled()
  })
})

// ─── 15. Service source invariants ───────────────────────────────────────────

describe('service source invariants', () => {
  const src = readFileSync(
    join(__dirname, '..', 'package-assignment-service.ts'),
    'utf-8',
  )

  it('does not contain a standalone "use server" directive', () => {
    expect(src).not.toMatch(/^\s*['"]use server['"]\s*;?\s*$/m)
  })

  it('does not import from @/lib/erpnext/client', () => {
    expect(src).not.toContain('erpnext/client')
  })

  it('does not import from @/lib/business-data/erp-adapter', () => {
    expect(src).not.toContain('business-data/erp-adapter')
  })

  it('does not import from actions/', () => {
    expect(src).not.toContain("from '@/actions/")
    expect(src).not.toContain('from "@/actions/')
  })

  it('does not contain erpFetch() calls', () => {
    expect(src).not.toContain('erpFetch(')
  })

  it('does not contain a standalone fetch() call', () => {
    expect(src).not.toMatch(/(?<![A-Za-z])fetch\s*\(/)
  })

  it('defines createAndSubmitPaymentEntry in the adapter interface (not imported from ERP client)', () => {
    // It must appear in source (adapter interface + call site)
    expect(src).toContain('createAndSubmitPaymentEntry')
    // But never as an import from the ERP client or adapter barrel
    expect(src).not.toContain("from '@/lib/erpnext/client'")
    expect(src).not.toContain("from '@/lib/business-data/erp-adapter'")
  })
})
