/**
 * Integration tests for PackageVoidService.
 *
 * Uses a unique temp-file SQLite database per test. No ERP dependency.
 * Covers: happy path, ledger invariant, eligibility guards, idempotency, tenant isolation.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import { PackageVoidService, type TenantCtx } from '@/lib/billing/package-void-service'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import type { VoidPackageInput } from '@/types/billing'

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
  `CREATE INDEX IF NOT EXISTS "client_package_purchase_tenant_idempotency_uq"
    ON "client_package_purchase" ("tenant_id", "idempotency_key")`,

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
  `CREATE UNIQUE INDEX IF NOT EXISTS "package_ledger_tenant_idempotency_uq"
    ON "package_ledger" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,
]

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT         = 'tenant-pvs'
const OTHER_TENANT   = 'tenant-pvs-other'
const CTX: TenantCtx = { tenantId: TENANT }

const CLIENT_ID       = 'ci-pvs-1'
const ERP_CUSTOMER_ID = 'CUST-PVS-001'

const COMP_TEMPLATE_ID = 'tpl-pvs-comp'   // complimentary, 5 sessions
const PAID_TEMPLATE_ID = 'tpl-pvs-paid'   // paid, 10 sessions

const VOID_KEY = 'void-key-pvs-1'

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tempDir:      string
let dbClient:     ReturnType<typeof createClient>
let service:      PackageVoidService
let purchaseRepo: ClientPackagePurchaseRepository
let ledgerRepo:   PackageLedgerRepository

beforeEach(async () => {
  tempDir  = mkdtempSync(join(tmpdir(), 'fitdesk-pvs-test-'))
  dbClient = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  for (const stmt of SETUP_DDL) {
    await dbClient.execute(stmt)
  }
  const db = drizzle(dbClient, { schema })

  service      = new PackageVoidService(db)
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

  // Seed complimentary template (active, zero-value, 5 sessions)
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "status","created_at_utc","updated_at_utc")
    VALUES
      ('${COMP_TEMPLATE_ID}','${TENANT}','QA Comp 5','complimentary',5,0,'USD',
       'active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Seed paid template (active, non-zero, 10 sessions)
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${PAID_TEMPLATE_ID}','${TENANT}','Paid 10','standard_block',10,50000,'USD',
       'SVC-10','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop on Windows EPERM */ }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseVoidInput(overrides: Partial<VoidPackageInput> = {}): VoidPackageInput {
  return {
    packagePurchaseId:  '',       // set per test
    reason:             'Duplicate added during QA',
    voidIdempotencyKey: VOID_KEY,
    ...overrides,
  }
}

async function seedActivePurchase(
  templateId = COMP_TEMPLATE_ID,
  idempotencyKey = 'ikey-seed-1',
): Promise<{ purchaseId: string }> {
  // Create purchase
  const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
    clientIndexId:     CLIENT_ID,
    erpCustomerId:     ERP_CUSTOMER_ID,
    packageTemplateId: templateId,
    idempotencyKey,
  })
  // Activate (complimentary path)
  await purchaseRepo.activateComplimentary(CTX, purchase.id)
  // Append activation ledger event
  await ledgerRepo.appendEvent(CTX, {
    clientIndexId:     CLIENT_ID,
    erpCustomerId:     ERP_CUSTOMER_ID,
    packagePurchaseId: purchase.id,
    eventType:         'bonus_granted',
    deltaUnits:        purchase.templateSnapshot.sessionCount,
    idempotencyKey:    idempotencyKey + ':bonus',
  })
  return { purchaseId: purchase.id }
}

// ─── 1. Happy path — void active unused complimentary package ─────────────────

describe('void active unused complimentary package', () => {
  it('marks purchase cancelled and writes refund_credit ledger event', async () => {
    const { purchaseId } = await seedActivePurchase()

    const result = await service.voidComplimentaryPackage(
      CTX,
      baseVoidInput({ packagePurchaseId: purchaseId }),
    )

    expect(result.isIdempotentReplay).toBe(false)
    expect(result.purchase.packageStatus).toBe('cancelled')
    expect(result.purchase.id).toBe(purchaseId)
    expect(result.ledgerEvent.eventType).toBe('refund_credit')
    expect(result.ledgerEvent.deltaUnits).toBe(-5)
    expect(result.ledgerEvent.reason).toBe('Duplicate added during QA')
    expect(result.ledgerEvent.idempotencyKey).toBe(VOID_KEY)
  })

  it('original purchase row remains — no hard delete', async () => {
    const { purchaseId } = await seedActivePurchase()
    await service.voidComplimentaryPackage(CTX, baseVoidInput({ packagePurchaseId: purchaseId }))

    const purchase = await purchaseRepo.findPurchaseById(CTX, purchaseId)
    expect(purchase).not.toBeNull()
    expect(purchase!.id).toBe(purchaseId)
    expect(purchase!.packageStatus).toBe('cancelled')
    // Original snapshot and dates preserved
    expect(purchase!.templateSnapshot.sessionCount).toBe(5)
    expect(purchase!.purchasedAtUtc).toBeTruthy()
    expect(purchase!.activatedAtUtc).toBeTruthy()
  })

  it('balance becomes 0 after void — grant + reversal = 0', async () => {
    const { purchaseId } = await seedActivePurchase()
    await service.voidComplimentaryPackage(CTX, baseVoidInput({ packagePurchaseId: purchaseId }))

    const balance = await ledgerRepo.deriveBalanceByPurchase(CTX, purchaseId)
    expect(balance).toBe(0)
  })

  it('does not delete any ledger rows — original grant event still present', async () => {
    const { purchaseId } = await seedActivePurchase()
    const eventsBefore = await ledgerRepo.listEventsByPurchase(CTX, purchaseId)
    expect(eventsBefore).toHaveLength(1)

    await service.voidComplimentaryPackage(CTX, baseVoidInput({ packagePurchaseId: purchaseId }))

    const eventsAfter = await ledgerRepo.listEventsByPurchase(CTX, purchaseId)
    expect(eventsAfter).toHaveLength(2)
    expect(eventsAfter[0]!.eventType).toBe('bonus_granted')
    expect(eventsAfter[1]!.eventType).toBe('refund_credit')
  })

  it('stores voidedByUserId in ledger event created_by_user_id', async () => {
    const { purchaseId } = await seedActivePurchase()
    const result = await service.voidComplimentaryPackage(CTX, baseVoidInput({
      packagePurchaseId: purchaseId,
      voidedByUserId:    'trainer-user-123',
    }))
    expect(result.ledgerEvent.createdByUserId).toBe('trainer-user-123')
  })
})

// ─── 2. Eligibility guards ────────────────────────────────────────────────────

describe('eligibility — rejects paid/non-complimentary package', () => {
  it('throws when template type is standard_block (paid)', async () => {
    const { purchaseId } = await seedActivePurchase(PAID_TEMPLATE_ID, 'ikey-paid-1')

    await expect(
      service.voidComplimentaryPackage(CTX, baseVoidInput({ packagePurchaseId: purchaseId })),
    ).rejects.toThrow('only complimentary packages can be voided')
  })
})

describe('eligibility — rejects non-active purchase', () => {
  it('throws when purchase is pending_activation', async () => {
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: COMP_TEMPLATE_ID,
      idempotencyKey:    'ikey-pend-1',
    })

    await expect(
      service.voidComplimentaryPackage(CTX, baseVoidInput({ packagePurchaseId: purchase.id })),
    ).rejects.toThrow('cannot void purchase with status "pending_activation"')
  })

  it('throws when purchase is already cancelled', async () => {
    const { purchaseId } = await seedActivePurchase()
    await service.voidComplimentaryPackage(CTX, baseVoidInput({
      packagePurchaseId: purchaseId,
      voidIdempotencyKey: 'void-key-first',
    }))

    // Now try a fresh void with a new key — purchase is cancelled
    await expect(
      service.voidComplimentaryPackage(CTX, baseVoidInput({
        packagePurchaseId:  purchaseId,
        voidIdempotencyKey: 'void-key-second',
      })),
    ).rejects.toThrow('cannot void purchase with status "cancelled"')
  })
})

describe('eligibility — rejects package with ERP invoice id', () => {
  it('throws when erpSalesInvoiceId is set on an active purchase', async () => {
    const purchase = await purchaseRepo.createPurchaseFromTemplate(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packageTemplateId: COMP_TEMPLATE_ID,
      idempotencyKey:    'ikey-inv-1',
    })
    // Activate with a fake invoice (status → active, erpSalesInvoiceId set)
    await purchaseRepo.attachInvoiceAndActivate(CTX, purchase.id, {
      erpSalesInvoiceId: 'ACC-SINV-FAKE-001',
      paymentStatus:     'paid',
    })

    await expect(
      service.voidComplimentaryPackage(CTX, baseVoidInput({ packagePurchaseId: purchase.id })),
    ).rejects.toThrow('linked to ERP invoice')
  })
})

describe('eligibility — rejects partially-used package', () => {
  it('throws when remaining balance does not equal session count', async () => {
    const { purchaseId } = await seedActivePurchase()

    // Consume one session (balance becomes 4, sessionCount = 5)
    await ledgerRepo.appendEvent(CTX, {
      clientIndexId:     CLIENT_ID,
      erpCustomerId:     ERP_CUSTOMER_ID,
      packagePurchaseId: purchaseId,
      eventType:         'session_consumed',
      deltaUnits:        -1,
      idempotencyKey:    'consume-1',
    })

    await expect(
      service.voidComplimentaryPackage(CTX, baseVoidInput({ packagePurchaseId: purchaseId })),
    ).rejects.toThrow('partially-used package')
  })
})

describe('eligibility — rejects missing or blank reason', () => {
  it('throws when reason is empty string', async () => {
    const { purchaseId } = await seedActivePurchase()

    await expect(
      service.voidComplimentaryPackage(CTX, baseVoidInput({
        packagePurchaseId: purchaseId,
        reason:            '',
      })),
    ).rejects.toThrow('reason must not be blank')
  })

  it('throws when reason is whitespace only', async () => {
    const { purchaseId } = await seedActivePurchase()

    await expect(
      service.voidComplimentaryPackage(CTX, baseVoidInput({
        packagePurchaseId: purchaseId,
        reason:            '   ',
      })),
    ).rejects.toThrow('reason must not be blank')
  })
})

// ─── 3. Idempotency ───────────────────────────────────────────────────────────

describe('idempotent retry with same void key', () => {
  it('returns isIdempotentReplay=true and does not double-reverse', async () => {
    const { purchaseId } = await seedActivePurchase()

    const first = await service.voidComplimentaryPackage(
      CTX,
      baseVoidInput({ packagePurchaseId: purchaseId }),
    )
    expect(first.isIdempotentReplay).toBe(false)

    const second = await service.voidComplimentaryPackage(
      CTX,
      baseVoidInput({ packagePurchaseId: purchaseId }),
    )
    expect(second.isIdempotentReplay).toBe(true)
    expect(second.purchase.packageStatus).toBe('cancelled')

    // Still only 2 ledger events (grant + one reversal)
    const events = await ledgerRepo.listEventsByPurchase(CTX, purchaseId)
    expect(events).toHaveLength(2)

    const balance = await ledgerRepo.deriveBalanceByPurchase(CTX, purchaseId)
    expect(balance).toBe(0)
  })
})

// ─── 4. Tenant isolation ──────────────────────────────────────────────────────

describe('tenant isolation', () => {
  it('cannot void another tenant purchase (findPurchaseById returns null cross-tenant)', async () => {
    const { purchaseId } = await seedActivePurchase()

    const OTHER_CTX: TenantCtx = { tenantId: OTHER_TENANT }
    await expect(
      service.voidComplimentaryPackage(OTHER_CTX, baseVoidInput({ packagePurchaseId: purchaseId })),
    ).rejects.toThrow('purchase not found')
  })
})

// ─── 5. Static invariants ─────────────────────────────────────────────────────

describe('service file invariants', () => {
  it('void service source contains no forbidden patterns', () => {
    const src = readFileSync(
      join(__dirname, '..', 'package-void-service.ts'),
      'utf-8',
    )
    expect(src).not.toMatch(/^\s*['"]use server['"]\s*;?\s*$/m)
    expect(src).not.toContain('erpnext/client')
    expect(src).not.toContain('business-data/erp-adapter')
    expect(src).not.toContain("from '@/actions/")
    expect(src).not.toContain('from "@/actions/')
    expect(src).not.toContain('erpFetch(')
    expect(src).not.toMatch(/(?<![A-Za-z])fetch\s*\(/)
    expect(src).not.toContain('hard delete')
    expect(src).not.toContain('session_consumed')
    expect(src).not.toContain('createInvoice')
    expect(src).not.toContain('submitSalesInvoice')
    expect(src).not.toContain('Payment Entry')
  })
})
