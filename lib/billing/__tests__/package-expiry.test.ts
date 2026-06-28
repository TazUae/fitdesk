/**
 * Tests for C5-D3 — package expiry persistence.
 *
 * Covers:
 *  - calculatePackageExpiryUtc pure helper (unit)
 *  - Complimentary path: expiryDays set → expires_at_utc persisted
 *  - Complimentary path: expiryDays null → expires_at_utc stays null
 *  - Paid Pay Later path: expires_at_utc persisted on activation
 *  - Paid Now path: expires_at_utc persisted on activation
 *  - Idempotent replay: same expires_at_utc returned, not recalculated
 *  - Void: expires_at_utc unchanged by void flow
 *
 * No ERP calls, no invoice/payment/session side effects.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import {
  calculatePackageExpiryUtc,
  ClientPackagePurchaseRepository,
} from '@/lib/billing/client-package-purchase-repository'
import {
  PackageAssignmentService,
  type PackageAssignmentErpAdapter,
  type TenantCtx,
} from '@/lib/billing/package-assignment-service'
import { PackageVoidService } from '@/lib/billing/package-void-service'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import type { AssignPackageInput } from '@/types/billing'
import type { Invoice } from '@/types'

// ─── DDL ──────────────────────────────────────────────────────────────────────

const SETUP_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id"                           TEXT NOT NULL PRIMARY KEY,
    "tenant_id"                    TEXT NOT NULL,
    "erp_customer_id"              TEXT NOT NULL,
    "full_name"                    TEXT NOT NULL,
    "phone_e164"                   TEXT NOT NULL,
    "whatsapp_enabled"             INTEGER NOT NULL DEFAULT 0,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "package_ledger_tenant_idempotency_uq"
    ON "package_ledger" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,
]

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT         = 'tenant-exp'
const CTX: TenantCtx = { tenantId: TENANT }

const CLIENT_ID       = 'ci-exp-1'
const ERP_CUSTOMER_ID = 'CUST-EXP-001'
const INVOICE_ID      = 'ACC-SINV-2026-EXP-001'

// Templates
const COMP_EXPIRY_TPL_ID    = 'tpl-exp-comp-expiry'    // complimentary, 30-day expiry
const COMP_NO_EXPIRY_TPL_ID = 'tpl-exp-comp-noexp'     // complimentary, no expiry
const PAID_EXPIRY_TPL_ID    = 'tpl-exp-paid-expiry'    // paid, 30-day expiry

const EXPIRY_DAYS = 30
const MS_PER_DAY  = 24 * 60 * 60 * 1000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockInvoice(id = INVOICE_ID): Invoice {
  return {
    id,
    clientId:          ERP_CUSTOMER_ID,
    clientName:        'Test Client',
    trainerId:         '',
    amount:            50000,
    outstandingAmount: 50000,
    currency:          'USD',
    status:            'sent',
    dueDate:           '2026-07-28',
    issuedAt:          '2026-06-28',
  }
}

function baseInput(
  templateId: string,
  idempotencyKey: string,
  extras: Partial<AssignPackageInput> = {},
): AssignPackageInput {
  return {
    clientIndexId:  CLIENT_ID,
    erpCustomerId:  ERP_CUSTOMER_ID,
    packageTemplateId: templateId,
    idempotencyKey,
    ...extras,
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tempDir:      string
let dbClient:     ReturnType<typeof createClient>
let service:      PackageAssignmentService
let voidService:  PackageVoidService
let purchaseRepo: ClientPackagePurchaseRepository
let mockErp:      { [K in keyof PackageAssignmentErpAdapter]: ReturnType<typeof vi.fn> } & PackageAssignmentErpAdapter

beforeEach(async () => {
  tempDir  = mkdtempSync(join(tmpdir(), 'fitdesk-exp-test-'))
  dbClient = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  for (const stmt of SETUP_DDL) {
    await dbClient.execute(stmt)
  }
  const db = drizzle(dbClient, { schema })

  mockErp = {
    createInvoice:               vi.fn().mockResolvedValue(makeMockInvoice()),
    submitSalesInvoice:          vi.fn().mockResolvedValue({ ...makeMockInvoice(), status: 'sent' }),
    getInvoiceById:              vi.fn().mockResolvedValue({ ...makeMockInvoice(), status: 'sent' }),
    createAndSubmitPaymentEntry: vi.fn().mockResolvedValue({
      payment: {},
      invoice: { ...makeMockInvoice(), status: 'paid', outstandingAmount: 0 },
    }),
  }

  service      = new PackageAssignmentService(db, mockErp)
  voidService  = new PackageVoidService(db)
  purchaseRepo = new ClientPackagePurchaseRepository(db)

  // Seed client
  await dbClient.execute(`
    INSERT INTO "client_index"
      ("id","tenant_id","erp_customer_id","full_name","phone_e164","billing_mode","created_at_utc","updated_at_utc")
    VALUES
      ('${CLIENT_ID}','${TENANT}','${ERP_CUSTOMER_ID}','Test Client','+96170000001','package',
       '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Complimentary template WITH expiry
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "expiry_days","status","created_at_utc","updated_at_utc")
    VALUES
      ('${COMP_EXPIRY_TPL_ID}','${TENANT}','Comp 5 (30d)','complimentary',5,0,'USD',
       ${EXPIRY_DAYS},'active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Complimentary template WITHOUT expiry
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "expiry_days","status","created_at_utc","updated_at_utc")
    VALUES
      ('${COMP_NO_EXPIRY_TPL_ID}','${TENANT}','Comp 5 (no exp)','complimentary',5,0,'USD',
       NULL,'active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)

  // Paid template WITH expiry
  await dbClient.execute(`
    INSERT INTO "package_template"
      ("id","tenant_id","name","template_type","session_count","price_amount","currency",
       "expiry_days","erp_item_code","status","created_at_utc","updated_at_utc")
    VALUES
      ('${PAID_EXPIRY_TPL_ID}','${TENANT}','Paid 10 (30d)','standard_block',10,50000,'USD',
       ${EXPIRY_DAYS},'SVC-10','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
  `)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop on Windows EPERM */ }
})

// ─── 1. Pure helper unit tests ────────────────────────────────────────────────

describe('calculatePackageExpiryUtc — pure helper', () => {
  it('returns null when expiryDays is null', () => {
    expect(calculatePackageExpiryUtc('2026-06-28T14:00:00.000Z', null)).toBeNull()
  })

  it('returns null when expiryDays is 0', () => {
    expect(calculatePackageExpiryUtc('2026-06-28T14:00:00.000Z', 0)).toBeNull()
  })

  it('returns null when expiryDays is negative', () => {
    expect(calculatePackageExpiryUtc('2026-06-28T14:00:00.000Z', -1)).toBeNull()
  })

  it('adds exactly 30 days in UTC milliseconds — known fixed timestamp', () => {
    const activated = '2026-06-28T14:00:00.000Z'
    const result    = calculatePackageExpiryUtc(activated, 30)
    const expected  = new Date(new Date(activated).getTime() + 30 * MS_PER_DAY).toISOString()
    expect(result).toBe(expected)
    expect(result).toBe('2026-07-28T14:00:00.000Z')
  })

  it('adds exactly 1 day in UTC milliseconds', () => {
    const activated = '2026-01-01T00:00:00.000Z'
    const result    = calculatePackageExpiryUtc(activated, 1)
    expect(result).toBe('2026-01-02T00:00:00.000Z')
  })

  it('produces a valid ISO-8601 string', () => {
    const result = calculatePackageExpiryUtc('2026-06-28T00:00:00.000Z', 30)
    expect(result).not.toBeNull()
    expect(() => new Date(result!)).not.toThrow()
    expect(new Date(result!).toISOString()).toBe(result)
  })

  it('handles leap year boundary correctly (Jan → Feb of leap year)', () => {
    const result = calculatePackageExpiryUtc('2024-01-31T00:00:00.000Z', 30)
    expect(result).toBe('2024-03-01T00:00:00.000Z')
  })

  it('returns null for invalid activated timestamp', () => {
    expect(calculatePackageExpiryUtc('not-a-date', 30)).toBeNull()
  })
})

// ─── 2. Complimentary path with expiry ───────────────────────────────────────

describe('complimentary activation — template with expiryDays', () => {
  it('persists expires_at_utc = activated_at_utc + 30 days', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(COMP_EXPIRY_TPL_ID, 'ikey-comp-exp-1'),
    )

    expect(result.purchase.activatedAtUtc).not.toBeNull()
    expect(result.purchase.expiresAtUtc).not.toBeNull()

    const activatedMs = new Date(result.purchase.activatedAtUtc!).getTime()
    const expiresMs   = new Date(result.purchase.expiresAtUtc!).getTime()
    expect(expiresMs - activatedMs).toBe(EXPIRY_DAYS * MS_PER_DAY)
  })

  it('persists the same expires_at_utc when re-read from DB', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(COMP_EXPIRY_TPL_ID, 'ikey-comp-exp-2'),
    )

    const fromDb = await purchaseRepo.findPurchaseById(CTX, result.purchase.id)
    expect(fromDb!.expiresAtUtc).toBe(result.purchase.expiresAtUtc)
  })

  it('expires_at_utc is strictly after activated_at_utc', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(COMP_EXPIRY_TPL_ID, 'ikey-comp-exp-3'),
    )

    const activated = new Date(result.purchase.activatedAtUtc!).getTime()
    const expires   = new Date(result.purchase.expiresAtUtc!).getTime()
    expect(expires).toBeGreaterThan(activated)
  })
})

// ─── 3. Complimentary path without expiry ────────────────────────────────────

describe('complimentary activation — template without expiryDays', () => {
  it('persists expires_at_utc = null', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(COMP_NO_EXPIRY_TPL_ID, 'ikey-comp-noexp-1'),
    )

    expect(result.purchase.activatedAtUtc).not.toBeNull()
    expect(result.purchase.expiresAtUtc).toBeNull()
  })

  it('DB row also has expires_at_utc = null', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(COMP_NO_EXPIRY_TPL_ID, 'ikey-comp-noexp-2'),
    )

    const fromDb = await purchaseRepo.findPurchaseById(CTX, result.purchase.id)
    expect(fromDb!.expiresAtUtc).toBeNull()
  })
})

// ─── 4. Paid Pay Later path with expiry ──────────────────────────────────────

describe('paid Pay Later activation — template with expiryDays', () => {
  it('persists expires_at_utc = activated_at_utc + 30 days', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(PAID_EXPIRY_TPL_ID, 'ikey-paid-exp-1'),
    )

    expect(result.purchase.activatedAtUtc).not.toBeNull()
    expect(result.purchase.expiresAtUtc).not.toBeNull()

    const activatedMs = new Date(result.purchase.activatedAtUtc!).getTime()
    const expiresMs   = new Date(result.purchase.expiresAtUtc!).getTime()
    expect(expiresMs - activatedMs).toBe(EXPIRY_DAYS * MS_PER_DAY)
  })

  it('expiry is based on activation timestamp, not purchase creation time', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(PAID_EXPIRY_TPL_ID, 'ikey-paid-exp-2'),
    )

    // activated_at_utc is set at activation, not at purchase creation.
    // Both are very close in test time, but we verify expiry tracks activated_at.
    const activatedMs = new Date(result.purchase.activatedAtUtc!).getTime()
    const expiresMs   = new Date(result.purchase.expiresAtUtc!).getTime()
    expect(expiresMs - activatedMs).toBe(EXPIRY_DAYS * MS_PER_DAY)
  })
})

// ─── 5. Paid Now path with expiry ────────────────────────────────────────────

describe('paid Now activation — template with expiryDays', () => {
  it('persists expires_at_utc = activated_at_utc + 30 days', async () => {
    const result = await service.assignPackage(
      CTX,
      baseInput(PAID_EXPIRY_TPL_ID, 'ikey-paidnow-exp-1', {
        payment: { method: 'cash' },
      }),
    )

    expect(result.purchase.activatedAtUtc).not.toBeNull()
    expect(result.purchase.expiresAtUtc).not.toBeNull()

    const activatedMs = new Date(result.purchase.activatedAtUtc!).getTime()
    const expiresMs   = new Date(result.purchase.expiresAtUtc!).getTime()
    expect(expiresMs - activatedMs).toBe(EXPIRY_DAYS * MS_PER_DAY)
  })
})

// ─── 6. Idempotent replay preserves expires_at_utc ───────────────────────────

describe('idempotent replay — expires_at_utc is not recalculated', () => {
  it('complimentary replay returns same expires_at_utc as original', async () => {
    const ikey = 'ikey-replay-comp-exp-1'

    const first  = await service.assignPackage(CTX, baseInput(COMP_EXPIRY_TPL_ID, ikey))
    const second = await service.assignPackage(CTX, baseInput(COMP_EXPIRY_TPL_ID, ikey))

    expect(second.isIdempotentReplay).toBe(true)
    expect(second.purchase.expiresAtUtc).toBe(first.purchase.expiresAtUtc)
  })

  it('paid replay returns same expires_at_utc as original', async () => {
    const ikey = 'ikey-replay-paid-exp-1'

    const first  = await service.assignPackage(CTX, baseInput(PAID_EXPIRY_TPL_ID, ikey))
    const second = await service.assignPackage(CTX, baseInput(PAID_EXPIRY_TPL_ID, ikey))

    expect(second.isIdempotentReplay).toBe(true)
    expect(second.purchase.expiresAtUtc).toBe(first.purchase.expiresAtUtc)
  })
})

// ─── 7. Void does not change expires_at_utc ──────────────────────────────────
// assignPackage already appends the bonus_granted ledger event internally,
// so remainingBalance === sessionCount after assignment. No extra ledger seeding needed.

describe('void flow — expires_at_utc is not modified', () => {
  it('voiding a complimentary package preserves expires_at_utc', async () => {
    const ikey = 'ikey-void-exp-1'

    // assignPackage writes the bonus_granted event internally (balance = sessionCount = 5)
    const assigned = await service.assignPackage(CTX, baseInput(COMP_EXPIRY_TPL_ID, ikey))
    const originalExpiry = assigned.purchase.expiresAtUtc
    expect(originalExpiry).not.toBeNull()

    const voidResult = await voidService.voidComplimentaryPackage(CTX, {
      packagePurchaseId:  assigned.purchase.id,
      reason:             'Duplicate package assigned by mistake',
      voidIdempotencyKey: 'void-exp-key-1',
    })

    expect(voidResult.purchase.packageStatus).toBe('cancelled')
    // cancelPurchase only sets packageStatus — expiresAtUtc must not change
    expect(voidResult.purchase.expiresAtUtc).toBe(originalExpiry)
  })

  it('void does not write session_consumed and only adds refund_credit', async () => {
    const ikey     = 'ikey-void-exp-2'
    const assigned = await service.assignPackage(CTX, baseInput(COMP_EXPIRY_TPL_ID, ikey))

    const ledgerRepo = new PackageLedgerRepository(drizzle(dbClient, { schema }))

    await voidService.voidComplimentaryPackage(CTX, {
      packagePurchaseId:  assigned.purchase.id,
      reason:             'Administrative correction',
      voidIdempotencyKey: 'void-exp-key-2',
    })

    const events = await ledgerRepo.listEventsByPurchase(CTX, assigned.purchase.id)
    const types  = events.map(e => e.eventType)
    expect(types).not.toContain('session_consumed')
    expect(types).toContain('bonus_granted')
    expect(types).toContain('refund_credit')
  })
})
