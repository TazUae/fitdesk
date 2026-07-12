/**
 * Integration tests for PackageAssignmentService.
 *
 * Uses a unique temp-file SQLite database per test. ERP dependency is mocked
 * via vi.fn() — no real ERP calls. Tests cover happy paths, idempotency/replay,
 * error paths, and static invariants.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import {
  PackageAssignmentService,
  type PackageAssignmentErpAdapter,
  type TenantCtx,
} from '@/lib/billing/package-assignment-service'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
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

const TENANT     = 'tenant-pas'
const CTX: TenantCtx = { tenantId: TENANT }

const CLIENT_ID       = 'ci-pas-1'
const ERP_CUSTOMER_ID = 'CUST-PAS-001'

const TEMPLATE_ID      = 'tpl-pas-paid'       // non-zero, USD, 10 sessions
const COMP_TEMPLATE_ID = 'tpl-pas-comp'       // zero-value, USD, 5 sessions
const DRAFT_TPL_ID     = 'tpl-pas-draft'      // status=draft
const NO_ITEM_TPL_ID   = 'tpl-pas-noitem'     // active, non-zero, no erpItemCode

const INVOICE_ID  = 'ACC-SINV-2026-PAS-001'
const IDEM_KEY    = 'ikey-pas-happy'
const COMP_KEY    = 'ikey-pas-comp'

// ─── Mock invoice factory ─────────────────────────────────────────────────────

function makeMockInvoice(
  id: string,
  status: Invoice['status'] = 'sent',
): Invoice {
  return {
    id,
    clientId:          ERP_CUSTOMER_ID,
    clientName:        'Test Client',
    trainerId:         '',
    amount:            500,
    outstandingAmount: 500,
    currency:          'USD',
    status,
    dueDate:           '2026-06-27',
    issuedAt:          '2026-06-27',
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tempDir:      string
let dbClient:     ReturnType<typeof createClient>
let mockErp:      { [K in keyof PackageAssignmentErpAdapter]: ReturnType<typeof vi.fn> } & PackageAssignmentErpAdapter
let service:      PackageAssignmentService
let purchaseRepo: ClientPackagePurchaseRepository
let ledgerRepo:   PackageLedgerRepository

beforeEach(async () => {
  tempDir  = mkdtempSync(join(tmpdir(), 'fitdesk-pas-test-'))
  dbClient = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  for (const stmt of SETUP_DDL) {
    await dbClient.execute(stmt)
  }
  const db = drizzle(dbClient, { schema })

  mockErp = {
    createInvoice:      vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID)),
    submitSalesInvoice: vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent')),
    getInvoiceById:     vi.fn().mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent')),
  }

  service      = new PackageAssignmentService(db, mockErp)
  purchaseRepo = new ClientPackagePurchaseRepository(db)
  ledgerRepo   = new PackageLedgerRepository(db)

  // Seed client
  await dbClient.execute(`
    INSERT INTO "client_index"
      ("id","tenant_id","erp_customer_id","full_name","phone_e164","billing_mode","created_at_utc","updated_at_utc")
    VALUES
      ('${CLIENT_ID}','${TENANT}','${ERP_CUSTOMER_ID}','Test Client','+96170000001','package',
       '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Seed paid template (active, non-zero, with erpItemCode)
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${TEMPLATE_ID}','${TENANT}','10-Session Block','standard_block',10,50000,'USD',
       'SVC-10','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Seed complimentary template (active, zero-value)
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${COMP_TEMPLATE_ID}','${TENANT}','5-Session Comp','complimentary',5,0,'USD',
       NULL,'active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Seed draft template (not yet active)
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${DRAFT_TPL_ID}','${TENANT}','Draft Package','standard_block',10,50000,'USD',
       'SVC-10','draft','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Seed no-item template (active, non-zero, no erpItemCode)
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${NO_ITEM_TPL_ID}','${TENANT}','No-Item Package','standard_block',10,50000,'USD',
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

// ─── 1. Non-zero Pay Later happy path ────────────────────────────────────────

describe('non-zero Pay Later happy path', () => {
  it('creates local purchase, calls ERP once each, activates with correct statuses', async () => {
    const result = await service.assignPackage(CTX, baseInput())

    // Purchase created and active
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('unpaid')
    expect(result.purchase.clientIndexId).toBe(CLIENT_ID)
    expect(result.purchase.erpCustomerId).toBe(ERP_CUSTOMER_ID)
    expect(result.purchase.packageTemplateId).toBe(TEMPLATE_ID)

    // ERP calls
    expect(mockErp.createInvoice).toHaveBeenCalledTimes(1)
    expect(mockErp.submitSalesInvoice).toHaveBeenCalledTimes(1)
    expect(mockErp.getInvoiceById).not.toHaveBeenCalled()

    // Invoice payload correctness
    const payload = mockErp.createInvoice.mock.calls[0]![0] as unknown
    expect((payload as { customer: string }).customer).toBe(ERP_CUSTOMER_ID)
    expect((payload as { items: Array<{ item_code: string; qty: number; rate: number }> }).items[0]!.item_code).toBe('SVC-10')
    expect((payload as { items: Array<{ item_code: string; qty: number; rate: number }> }).items[0]!.qty).toBe(1)
    expect((payload as { items: Array<{ item_code: string; qty: number; rate: number }> }).items[0]!.rate).toBe(500) // 50000 cents / 100

    // Invoice result
    expect(result.erpInvoiceId).toBe(INVOICE_ID)
    expect(result.invoice?.id).toBe(INVOICE_ID)
    expect(result.isIdempotentReplay).toBe(false)

    // Ledger event
    expect(result.ledgerEvent?.eventType).toBe('purchase_activation')
    expect(result.ledgerEvent?.deltaUnits).toBe(10)
    expect(result.ledgerEvent?.erpReference).toBe(INVOICE_ID)

    // Balance
    const balance = await ledgerRepo.deriveBalanceByPurchase(CTX, result.purchase.id)
    expect(balance).toBe(10)
  })

  it('persists invoice id on purchase before submitSalesInvoice is called', async () => {
    // Intercept submitSalesInvoice to capture state at that point
    let purchaseIdAtSubmit: string | null = null
    let invoiceIdAtSubmit:  string | null = null

    mockErp.submitSalesInvoice.mockImplementation(async (id: string) => {
      // At submit time, find all purchases for the client
      const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
      if (purchases.length > 0) {
        purchaseIdAtSubmit = purchases[0]!.id
        invoiceIdAtSubmit  = purchases[0]!.erpSalesInvoiceId
      }
      return makeMockInvoice(id, 'sent')
    })

    await service.assignPackage(CTX, baseInput())

    expect(purchaseIdAtSubmit).not.toBeNull()
    expect(invoiceIdAtSubmit).toBe(INVOICE_ID)
  })
})

// ─── 2. Zero-value complimentary happy path ───────────────────────────────────

describe('zero-value complimentary happy path', () => {
  it('activates without ERP calls, sets paymentStatus paid, appends bonus_granted', async () => {
    const result = await service.assignPackage(CTX, baseInput({
      packageTemplateId: COMP_TEMPLATE_ID,
      idempotencyKey:    COMP_KEY,
    }))

    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('paid')
    expect(result.erpInvoiceId).toBeNull()
    expect(result.invoice).toBeNull()
    expect(result.isIdempotentReplay).toBe(false)

    expect(result.ledgerEvent?.eventType).toBe('bonus_granted')
    expect(result.ledgerEvent?.deltaUnits).toBe(5)
    expect(result.ledgerEvent?.erpReference).toBeNull()

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(mockErp.getInvoiceById).not.toHaveBeenCalled()

    const balance = await ledgerRepo.deriveBalanceByPurchase(CTX, result.purchase.id)
    expect(balance).toBe(5)
  })
})

// ─── 3. Duplicate same key after full success ─────────────────────────────────

describe('duplicate same key after full success (active replay)', () => {
  it('returns existing result without creating second purchase or ERP call', async () => {
    const first  = await service.assignPackage(CTX, baseInput())
    expect(mockErp.createInvoice).toHaveBeenCalledTimes(1)

    // Reset call counts
    mockErp.createInvoice.mockClear()
    mockErp.submitSalesInvoice.mockClear()
    mockErp.getInvoiceById.mockClear()

    const second = await service.assignPackage(CTX, baseInput())

    expect(second.isIdempotentReplay).toBe(true)
    expect(second.purchase.id).toBe(first.purchase.id)
    expect(second.ledgerEvent?.id).toBe(first.ledgerEvent?.id)
    expect(second.erpInvoiceId).toBe(INVOICE_ID)

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()

    // Only one purchase row in DB
    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(1)

    // Only one ledger event
    const ledger = await ledgerRepo.listEventsByPurchase(CTX, first.purchase.id)
    expect(ledger).toHaveLength(1)
  })
})

// ─── 4. Duplicate same key while pending with no invoice id ───────────────────

describe('duplicate same key while pending with no invoice id', () => {
  it('returns pending replay without calling ERP', async () => {
    // Seed a purchase with idempotency key set, still pending_activation, no invoice
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: TEMPLATE_ID,
      idempotencyKey:    IDEM_KEY,
    })
    expect(purchase.packageStatus).toBe('pending_activation')
    expect(purchase.erpSalesInvoiceId).toBeNull()

    const result = await service.assignPackage(CTX, baseInput())

    expect(result.isIdempotentReplay).toBe(true)
    expect(result.purchase.id).toBe(purchase.id)
    expect(result.purchase.packageStatus).toBe('pending_activation')
    expect(result.ledgerEvent).toBeNull()
    expect(result.erpInvoiceId).toBeNull()
    expect(result.invoice).toBeNull()

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(mockErp.getInvoiceById).not.toHaveBeenCalled()
  })
})

// ─── 5. Retry after invoice created but before submit (draft invoice) ─────────

describe('retry after invoice created but before submit — draft invoice', () => {
  it('calls getInvoiceById and submitSalesInvoice, finalizes locally, no createInvoice', async () => {
    // Seed a pending purchase with invoice already anchored (simulate crash after recordInvoiceCreated)
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: TEMPLATE_ID,
      idempotencyKey:    IDEM_KEY,
    })
    await purchaseRepo.recordInvoiceCreated(CTX, purchase.id, { erpSalesInvoiceId: INVOICE_ID })

    // ERP returns draft → should trigger submit
    mockErp.getInvoiceById.mockResolvedValue(makeMockInvoice(INVOICE_ID, 'draft'))
    mockErp.submitSalesInvoice.mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent'))

    const result = await service.assignPackage(CTX, baseInput())

    expect(result.isIdempotentReplay).toBe(true)
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.purchase.paymentStatus).toBe('unpaid')
    expect(result.erpInvoiceId).toBe(INVOICE_ID)
    expect(result.ledgerEvent?.eventType).toBe('purchase_activation')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.getInvoiceById).toHaveBeenCalledOnce()
    expect(mockErp.submitSalesInvoice).toHaveBeenCalledOnce()
  })
})

// ─── 6. Retry after invoice submitted but local finalize missing ───────────────

describe('retry after invoice submitted but local finalize missing — non-draft invoice', () => {
  it('does not call submitSalesInvoice again, finalizes locally', async () => {
    // Seed pending purchase with invoice anchored
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: TEMPLATE_ID,
      idempotencyKey:    IDEM_KEY,
    })
    await purchaseRepo.recordInvoiceCreated(CTX, purchase.id, { erpSalesInvoiceId: INVOICE_ID })

    // ERP already shows submitted (non-draft)
    mockErp.getInvoiceById.mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent'))
    mockErp.submitSalesInvoice.mockClear()

    const result = await service.assignPackage(CTX, baseInput())

    expect(result.isIdempotentReplay).toBe(true)
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.ledgerEvent?.eventType).toBe('purchase_activation')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.getInvoiceById).toHaveBeenCalledOnce()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
  })
})

// ─── 7. Idempotency key reuse with different payload ──────────────────────────

describe('idempotency key reuse with different payload', () => {
  it('throws conflict and makes no ERP calls', async () => {
    // Create a successful assignment first
    await service.assignPackage(CTX, baseInput())

    mockErp.createInvoice.mockClear()
    mockErp.submitSalesInvoice.mockClear()
    mockErp.getInvoiceById.mockClear()

    // Attempt same key with different packageTemplateId
    await expect(
      service.assignPackage(CTX, baseInput({ packageTemplateId: COMP_TEMPLATE_ID })),
    ).rejects.toThrow('idempotency key reuse with different payload')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(mockErp.getInvoiceById).not.toHaveBeenCalled()
  })
})

// ─── 8. Non-zero active template with missing erpItemCode ─────────────────────

describe('non-zero active template with missing erpItemCode', () => {
  it('throws before purchase creation and before ERP', async () => {
    await expect(
      service.assignPackage(CTX, baseInput({ packageTemplateId: NO_ITEM_TPL_ID })),
    ).rejects.toThrow('erpItemCode')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()

    // No purchase created
    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(0)
  })
})

// ─── 9. Unsupported currency ──────────────────────────────────────────────────

describe('unsupported currency throws before ERP call', () => {
  it('throws on buildPackageInvoicePayload and does not call createInvoice', async () => {
    // Seed an active non-zero template with an unsupported currency
    const XYZ_TPL_ID = 'tpl-pas-xyz'
    await dbClient.execute(`
      INSERT INTO "package_template"
        ("id","tenant_id","name","template_type","session_count","price_amount","currency",
         "erp_item_code","status","created_at_utc","updated_at_utc")
      VALUES
        ('${XYZ_TPL_ID}','${TENANT}','XYZ Package','standard_block',10,50000,'XYZ',
         'SVC-XYZ','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
    `)

    await expect(
      service.assignPackage(CTX, baseInput({
        packageTemplateId: XYZ_TPL_ID,
        idempotencyKey:    'ikey-pas-xyz',
      })),
    ).rejects.toThrow('unsupported currency')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
  })
})

// ─── 10. ERP createInvoice failure ───────────────────────────────────────────

describe('ERP createInvoice failure', () => {
  it('leaves purchase pending_activation with no invoice id', async () => {
    mockErp.createInvoice.mockRejectedValue(new Error('ERP 503'))

    await expect(service.assignPackage(CTX, baseInput())).rejects.toThrow('ERP 503')

    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(1)
    expect(purchases[0]!.packageStatus).toBe('pending_activation')
    expect(purchases[0]!.erpSalesInvoiceId).toBeNull()
  })
})

// ─── 11. ERP submitSalesInvoice failure ───────────────────────────────────────

describe('ERP submitSalesInvoice failure', () => {
  it('leaves purchase pending_activation with invoice id recorded', async () => {
    mockErp.submitSalesInvoice.mockRejectedValue(new Error('ERP submit 503'))

    await expect(service.assignPackage(CTX, baseInput())).rejects.toThrow('ERP submit 503')

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(1)
    expect(purchases[0]!.packageStatus).toBe('pending_activation')
    expect(purchases[0]!.erpSalesInvoiceId).toBe(INVOICE_ID)
    expect(mockErp.createInvoice).toHaveBeenCalledTimes(1)
  })
})

// ─── 12. Active replay with missing ledger event ──────────────────────────────

describe('active replay with missing ledger event', () => {
  it('throws a clear data-integrity error', async () => {
    // Seed a purchase that is already active but has no ledger event
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: TEMPLATE_ID,
      idempotencyKey:    IDEM_KEY,
    })
    // Directly activate via repo (skips ledger)
    await purchaseRepo.attachInvoiceAndActivate(CTX, purchase.id, {
      erpSalesInvoiceId: INVOICE_ID,
      paymentStatus:     'unpaid',
    })

    mockErp.getInvoiceById.mockResolvedValue(makeMockInvoice(INVOICE_ID, 'sent'))

    await expect(
      service.assignPackage(CTX, baseInput()),
    ).rejects.toThrow('data integrity error')

    // Verify no second ERP write
    expect(mockErp.createInvoice).not.toHaveBeenCalled()
    expect(mockErp.submitSalesInvoice).not.toHaveBeenCalled()
  })
})

// ─── 13. Wrong client/customer mismatch ──────────────────────────────────────

describe('wrong client/customer mismatch', () => {
  it('is rejected through existing repo validation', async () => {
    // Provide an erpCustomerId that does not match the client's stored ERP customer
    await expect(
      service.assignPackage(CTX, baseInput({ erpCustomerId: 'CUST-WRONG-999' })),
    ).rejects.toThrow('erpCustomerId mismatch')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
  })
})

// ─── 14. Template not active ──────────────────────────────────────────────────

describe('template not active', () => {
  it('is rejected before ERP when template is draft', async () => {
    await expect(
      service.assignPackage(CTX, baseInput({
        packageTemplateId: DRAFT_TPL_ID,
        idempotencyKey:    'ikey-pas-draft',
      })),
    ).rejects.toThrow(/template must be active/)

    expect(mockErp.createInvoice).not.toHaveBeenCalled()

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(0)
  })
})

// ─── 15. Blank idempotency key ────────────────────────────────────────────────

describe('blank idempotency key', () => {
  it('is rejected before DB/ERP', async () => {
    await expect(
      service.assignPackage(CTX, baseInput({ idempotencyKey: '' })),
    ).rejects.toThrow('idempotencyKey must not be blank')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
  })

  it('whitespace-only key is also rejected', async () => {
    await expect(
      service.assignPackage(CTX, baseInput({ idempotencyKey: '   ' })),
    ).rejects.toThrow('idempotencyKey must not be blank')
  })
})

// ─── 16. Duplicate active package guard ──────────────────────────────────────

function baseCompInput(overrides: Partial<AssignPackageInput> = {}): AssignPackageInput {
  return {
    clientIndexId:     CLIENT_ID,
    erpCustomerId:     ERP_CUSTOMER_ID,
    packageTemplateId: COMP_TEMPLATE_ID,
    idempotencyKey:    COMP_KEY,
    ...overrides,
  }
}

describe('duplicate active package guard', () => {
  it('throws DuplicateActivePackageError when same template already active and no override', async () => {
    // First assignment succeeds
    await service.assignPackage(CTX, baseCompInput())

    // Fresh key, same template — blocked by duplicate guard
    await expect(
      service.assignPackage(CTX, baseCompInput({ idempotencyKey: 'ikey-dup-blocked' })),
    ).rejects.toThrow('DuplicateActivePackageError')
  })

  it('includes template name in the duplicate error message', async () => {
    await service.assignPackage(CTX, baseCompInput())

    const err = await service
      .assignPackage(CTX, baseCompInput({ idempotencyKey: 'ikey-dup-name' }))
      .catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('5-Session Comp')
  })

  it('allows assignment when allowDuplicateActivePackage is true', async () => {
    await service.assignPackage(CTX, baseCompInput())

    const result = await service.assignPackage(CTX, baseCompInput({
      idempotencyKey:             'ikey-dup-override',
      allowDuplicateActivePackage: true,
    }))
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.isIdempotentReplay).toBe(false)

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(2)
  })

  it('idempotent replay with same key is not blocked by duplicate guard', async () => {
    await service.assignPackage(CTX, baseCompInput())

    // Same key = replay path — must bypass duplicate guard entirely
    const result = await service.assignPackage(CTX, baseCompInput())
    expect(result.isIdempotentReplay).toBe(true)

    const purchases = await purchaseRepo.listPurchasesByClient(CTX, CLIENT_ID)
    expect(purchases).toHaveLength(1)
  })

  it('does not fire guard for a first assignment with no prior active purchase', async () => {
    // No prior purchase — fresh assignment must succeed without override
    const result = await service.assignPackage(CTX, baseCompInput())
    expect(result.purchase.packageStatus).toBe('active')
    expect(result.isIdempotentReplay).toBe(false)
  })
})

// ─── 17. Tenant isolation (US-025) ───────────────────────────────────────────
//
// package-assignment-service.test.ts previously used a single tenant fixture
// throughout. PackageAssignmentService.assignPackage() does not itself query
// client_index/package_template — it delegates to templateRepo.findById(ctx, ...)
// and purchaseRepo.createPurchaseFromTemplate(ctx, ...), both of which are already
// tenant-isolation-tested at the repository layer (see
// client-package-purchase-repository.test.ts "rejects cross-tenant template
// access" / "rejects purchase when client does not exist in this tenant").
// These two tests prove the *service* correctly threads ctx through to those
// calls end-to-end via its own public API, closing the "repository AND
// server-action boundaries are covered" gap for this service specifically.

const TENANT_B = 'tenant-pas-b'
const CTX_B: TenantCtx = { tenantId: TENANT_B }

describe('assignPackage — tenant isolation', () => {
  it('rejects a packageTemplateId that belongs to another tenant', async () => {
    // TEMPLATE_ID exists under TENANT (the default fixture tenant) — calling
    // under TENANT_B's context must not find it.
    await dbClient.execute(`
      INSERT INTO "client_index"
        ("id","tenant_id","erp_customer_id","full_name","phone_e164","billing_mode","created_at_utc","updated_at_utc")
      VALUES
        ('ci-pas-b1','${TENANT_B}','CUST-PAS-B1','Tenant B Client','+96170000002','package',
         '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
    `)

    await expect(
      service.assignPackage(CTX_B, {
        clientIndexId:     'ci-pas-b1',
        erpCustomerId:     'CUST-PAS-B1',
        packageTemplateId: TEMPLATE_ID, // belongs to TENANT, not TENANT_B
        idempotencyKey:    'ikey-pas-b-cross-template',
      }),
    ).rejects.toThrow('package template not found')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
  })

  it('rejects a clientIndexId that belongs to another tenant', async () => {
    // Give TENANT_B its own active template so the failure is unambiguously
    // about the client, not the template.
    await dbClient.execute(`
      INSERT INTO "package_template"
        ("id","tenant_id","name","template_type","session_count","price_amount","currency",
         "erp_item_code","status","created_at_utc","updated_at_utc")
      VALUES
        ('tpl-pas-b','${TENANT_B}','B Tenant Block','standard_block',10,50000,'USD',
         'SVC-10','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
    `)

    await expect(
      service.assignPackage(CTX_B, {
        clientIndexId:     CLIENT_ID, // belongs to TENANT, not TENANT_B
        erpCustomerId:     ERP_CUSTOMER_ID,
        packageTemplateId: 'tpl-pas-b',
        idempotencyKey:    'ikey-pas-b-cross-client',
      }),
    ).rejects.toThrow('client not found')

    expect(mockErp.createInvoice).not.toHaveBeenCalled()
  })

  it('does not leak TENANT purchases into a TENANT_B listPurchasesByClient call', async () => {
    await service.assignPackage(CTX, baseInput())

    const purchasesB = await purchaseRepo.listPurchasesByClient(CTX_B, CLIENT_ID)
    expect(purchasesB).toHaveLength(0)
  })
})

// ─── 18. Static invariants ───────────────────────────────────────────────────

describe('service file invariants', () => {
  it('service source contains no forbidden patterns', () => {
    const src = readFileSync(
      join(__dirname, '..', 'package-assignment-service.ts'),
      'utf-8',
    )
    // 'use server' directive only — match as a standalone line, not in comments
    expect(src).not.toMatch(/^\s*['"]use server['"]\s*;?\s*$/m)
    expect(src).not.toContain('erpnext/client')
    expect(src).not.toContain('business-data/erp-adapter')
    expect(src).not.toContain("from '@/actions/")
    expect(src).not.toContain('from "@/actions/')
    expect(src).not.toContain('erpFetch(')
    // guard the standalone fetch() call pattern — not method names like erpFetch
    expect(src).not.toMatch(/(?<![A-Za-z])fetch\s*\(/)
  })

})
