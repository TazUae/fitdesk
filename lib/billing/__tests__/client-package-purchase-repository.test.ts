/**
 * Integration tests for ClientPackagePurchaseRepository.
 *
 * Uses a unique temp-file SQLite database per test so Drizzle transactions
 * and direct select/insert operations all share the same persistent connection.
 * (@libsql/client :memory: uses separate connections per request, so DDL applied
 * via client.execute() is not visible inside subsequent Drizzle transactions.)
 *
 * Covers: createPurchaseFromTemplate, read methods, snapshot immutability,
 * first_sold_at_utc stamping, tenant isolation, input validation.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import {
  ClientPackagePurchaseRepository,
  buildPackageTemplateSnapshot,
} from '@/lib/billing/client-package-purchase-repository'
import type { AttachInvoiceInput, CreatePackagePurchaseInput, RecordPackageInvoiceInput } from '@/types/billing'

// ─── DDL (kept in sync with scripts/migrate-app.mjs) ─────────────────────────

const SETUP_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id"                          TEXT NOT NULL PRIMARY KEY,
    "tenant_id"                   TEXT NOT NULL,
    "erp_customer_id"             TEXT NOT NULL,
    "full_name"                   TEXT NOT NULL,
    "phone_e164"                  TEXT NOT NULL,
    "whatsapp_enabled"            INTEGER NOT NULL DEFAULT 0,
    "whatsapp_consent_state"      TEXT NOT NULL DEFAULT 'unknown',
    "status"                      TEXT NOT NULL DEFAULT 'active',
    "primary_goal_label"          TEXT,
    "primary_goal_id"             TEXT,
    "safety_state"                TEXT NOT NULL DEFAULT 'clear',
    "onboarding_state"            TEXT NOT NULL DEFAULT 'not_started',
    "billing_mode"                TEXT NOT NULL DEFAULT 'unset',
    "payment_summary"             TEXT NOT NULL DEFAULT 'unset',
    "next_session_at_utc"         TEXT,
    "last_activity_at_utc"        TEXT,
    "possible_duplicate_client_id" TEXT,
    "duplicate_override_reason"   TEXT,
    "created_at_utc"              TEXT NOT NULL,
    "updated_at_utc"              TEXT NOT NULL
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

  // package_ledger — present so tests can assert no side-effect rows are created
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
]

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

const NOW = '2026-01-01T00:00:00.000Z'

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tempDir: string
let dbClient: ReturnType<typeof createClient>
let repo: ClientPackagePurchaseRepository

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-cpp-repo-test-'))
  const dbPath = join(tempDir, 'test.db')
  dbClient = createClient({ url: `file:${dbPath}` })
  for (const sql of SETUP_DDL) {
    await dbClient.execute(sql)
  }
  const db = drizzle(dbClient, { schema })
  repo = new ClientPackagePurchaseRepository(db)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedClient(opts: {
  tenantId: string
  id: string
  erpCustomerId: string
}) {
  await dbClient.execute(`
    INSERT INTO "client_index" (
      "id","tenant_id","erp_customer_id","full_name","phone_e164",
      "billing_mode","created_at_utc","updated_at_utc"
    ) VALUES (
      '${opts.id}','${opts.tenantId}','${opts.erpCustomerId}',
      'Test Client','+96170000001','package','${NOW}','${NOW}'
    )
  `)
}

async function seedTemplate(opts: {
  tenantId: string
  id: string
  status: 'draft' | 'active' | 'archived'
  firstSoldAtUtc?: string | null
  name?: string
  sessionCount?: number
  priceAmount?: number
  currency?: string
  expiryDays?: number | null
  erpItemCode?: string | null
}) {
  const sessionCount = opts.sessionCount ?? 10
  const priceAmount  = opts.priceAmount ?? 50000
  const currency     = opts.currency ?? 'USD'
  const name         = opts.name ?? '10-Session Block'
  const expiryDays   = opts.expiryDays !== undefined ? opts.expiryDays : null
  const erpItemCode  = opts.erpItemCode !== undefined ? opts.erpItemCode : 'SVC-10'
  const firstSold    = opts.firstSoldAtUtc !== undefined ? opts.firstSoldAtUtc : null

  const expiryPart   = expiryDays === null
    ? 'NULL'
    : String(expiryDays)
  const erpPart      = erpItemCode === null
    ? 'NULL'
    : `'${erpItemCode}'`
  const firstSoldPart = firstSold === null
    ? 'NULL'
    : `'${firstSold}'`

  await dbClient.execute(`
    INSERT INTO "package_template" (
      "id","tenant_id","name","template_type","session_count","price_amount",
      "currency","expiry_days","erp_item_code","status","first_sold_at_utc",
      "created_at_utc","updated_at_utc"
    ) VALUES (
      '${opts.id}','${opts.tenantId}','${name}','standard_block',
      ${sessionCount},${priceAmount},'${currency}',${expiryPart},${erpPart},
      '${opts.status}',${firstSoldPart},'${NOW}','${NOW}'
    )
  `)
}

// ─── 1. Creates a purchase from an active template ────────────────────────────

describe('createPurchaseFromTemplate', () => {
  it('creates a local purchase from an active template', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active' })

    const input: CreatePackagePurchaseInput = {
      clientIndexId:     'ci-1',
      erpCustomerId:     'CUST-001',
      packageTemplateId: 'pt-1',
    }
    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, input)

    expect(purchase.id).toBeTruthy()
    expect(purchase.tenantId).toBe(TENANT_A)
    expect(purchase.clientIndexId).toBe('ci-1')
    expect(purchase.erpCustomerId).toBe('CUST-001')
    expect(purchase.packageTemplateId).toBe('pt-1')
    expect(purchase.purchasedAtUtc).toBeTruthy()
    expect(purchase.createdAtUtc).toBeTruthy()
    expect(purchase.updatedAtUtc).toBeTruthy()
  })

  // ─── 2. Purchase defaults ────────────────────────────────────────────────

  it('sets correct defaults: paymentStatus, packageStatus, null fields', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active' })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
    })

    expect(purchase.paymentStatus).toBe('pending')
    expect(purchase.packageStatus).toBe('pending_activation')
    expect(purchase.erpSalesInvoiceId).toBeNull()
    expect(purchase.activatedAtUtc).toBeNull()
    expect(purchase.expiresAtUtc).toBeNull()
  })

  // ─── 3. Snapshot captures all required template fields ───────────────────

  it('snapshot captures all required template fields at purchase time', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({
      tenantId:     TENANT_A,
      id:           'pt-1',
      status:       'active',
      name:         'Gold Block',
      sessionCount: 12,
      priceAmount:  60000,
      currency:     'USD',
      expiryDays:   90,
      erpItemCode:  'SVC-GOLD',
    })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
    })

    const snap = purchase.templateSnapshot
    expect(snap.schemaVersion).toBe(1)
    expect(snap.templateId).toBe('pt-1')
    expect(snap.name).toBe('Gold Block')
    expect(snap.description).toBeNull()
    expect(snap.templateType).toBe('standard_block')
    expect(snap.sessionCount).toBe(12)
    expect(snap.priceAmount).toBe(60000)
    expect(snap.currency).toBe('USD')
    expect(snap.expiryDays).toBe(90)
    expect(snap.erpItemCode).toBe('SVC-GOLD')
    expect(snap.supersedesTemplateId).toBeNull()
    expect(snap.templateStatus).toBe('active')
    expect(snap.capturedAtUtc).toBeTruthy()
  })

  // ─── 4. Snapshot unchanged after template is archived ───────────────────

  it('snapshot remains unchanged when template is later archived', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({
      tenantId: TENANT_A, id: 'pt-1', status: 'active', name: 'Before Archive',
    })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
    })
    const originalSnapshot = { ...purchase.templateSnapshot }

    // Archive the template directly — simulating a later lifecycle event
    await dbClient.execute(
      `UPDATE "package_template" SET "status" = 'archived', "name" = 'After Archive' WHERE "id" = 'pt-1'`,
    )

    // Re-fetch the purchase — snapshot must be unchanged
    const refetched = await repo.findPurchaseById({ tenantId: TENANT_A }, purchase.id)
    expect(refetched).not.toBeNull()
    expect(refetched!.templateSnapshot.templateStatus).toBe(originalSnapshot.templateStatus)
    expect(refetched!.templateSnapshot.name).toBe(originalSnapshot.name)
    expect(refetched!.templateSnapshot.name).toBe('Before Archive')
  })

  // ─── 5. Sets first_sold_at_utc when null ─────────────────────────────────

  it('stamps package_template.first_sold_at_utc when it is null', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active', firstSoldAtUtc: null })

    const before = await dbClient.execute(
      `SELECT "first_sold_at_utc" FROM "package_template" WHERE "id" = 'pt-1'`,
    )
    expect(before.rows[0]?.first_sold_at_utc).toBeNull()

    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
    })

    const after = await dbClient.execute(
      `SELECT "first_sold_at_utc" FROM "package_template" WHERE "id" = 'pt-1'`,
    )
    expect(after.rows[0]?.first_sold_at_utc).toBeTruthy()
  })

  // ─── 6. Does not move first_sold_at_utc when already set ─────────────────

  it('does not overwrite first_sold_at_utc when already set', async () => {
    const originalFirstSold = '2026-01-01T00:00:00.000Z'
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedClient({ tenantId: TENANT_A, id: 'ci-2', erpCustomerId: 'CUST-002' })
    await seedTemplate({
      tenantId:       TENANT_A,
      id:             'pt-1',
      status:         'active',
      firstSoldAtUtc: originalFirstSold,
    })

    // Second purchase — first_sold_at_utc must remain unchanged
    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-2', erpCustomerId: 'CUST-002', packageTemplateId: 'pt-1',
    })

    const row = await dbClient.execute(
      `SELECT "first_sold_at_utc" FROM "package_template" WHERE "id" = 'pt-1'`,
    )
    expect(row.rows[0]?.first_sold_at_utc).toBe(originalFirstSold)
  })

  // ─── 7. Rejects draft template ───────────────────────────────────────────

  it('rejects purchase from a draft template', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-draft', status: 'draft' })

    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
        clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-draft',
      }),
    ).rejects.toThrow('template must be active')
  })

  // ─── 8. Rejects archived template ───────────────────────────────────────

  it('rejects purchase from an archived template', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-arch', status: 'archived' })

    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
        clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-arch',
      }),
    ).rejects.toThrow('template must be active')
  })

  // ─── 10. Tenant B cannot create purchase from tenant A template ──────────

  it('rejects cross-tenant template access', async () => {
    await seedClient({ tenantId: TENANT_B, id: 'ci-b1', erpCustomerId: 'CUST-B1' })
    // Template belongs to tenant-a only
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a1', status: 'active' })

    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_B }, {
        clientIndexId: 'ci-b1', erpCustomerId: 'CUST-B1', packageTemplateId: 'pt-a1',
      }),
    ).rejects.toThrow('package template not found')
  })

  // ─── 11. Missing client is rejected ─────────────────────────────────────

  it('rejects purchase when client does not exist in this tenant', async () => {
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active' })

    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
        clientIndexId: 'ci-missing', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
      }),
    ).rejects.toThrow('client not found')
  })

  // ─── 12. ERP customer ID mismatch is rejected ────────────────────────────

  it('rejects purchase when erpCustomerId does not match local client projection', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active' })

    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
        clientIndexId: 'ci-1', erpCustomerId: 'WRONG-CUST', packageTemplateId: 'pt-1',
      }),
    ).rejects.toThrow('erpCustomerId mismatch')
  })

  // ─── 15. Invalid inputs ──────────────────────────────────────────────────

  it('rejects blank clientIndexId', async () => {
    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
        clientIndexId: '', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
      }),
    ).rejects.toThrow('clientIndexId must not be blank')
  })

  it('rejects blank erpCustomerId', async () => {
    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
        clientIndexId: 'ci-1', erpCustomerId: '', packageTemplateId: 'pt-1',
      }),
    ).rejects.toThrow('erpCustomerId must not be blank')
  })

  it('rejects blank packageTemplateId', async () => {
    await expect(
      repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
        clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: '',
      }),
    ).rejects.toThrow('packageTemplateId must not be blank')
  })

  it('rejects empty tenantId', async () => {
    await expect(
      repo.createPurchaseFromTemplate({ tenantId: '' }, {
        clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
      }),
    ).rejects.toThrow('tenantId is required')
  })
})

// ─── 9. Tenant A cannot read tenant B purchase ───────────────────────────────

describe('findPurchaseById', () => {
  it('returns null for cross-tenant access (tenant isolation)', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-a1', erpCustomerId: 'CUST-A1' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a1', status: 'active' })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a1',
    })

    // Tenant B attempts to read tenant A's purchase by its ID
    const result = await repo.findPurchaseById({ tenantId: TENANT_B }, purchase.id)
    expect(result).toBeNull()
  })

  it('returns the purchase when queried with the correct tenant', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-a1', erpCustomerId: 'CUST-A1' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a1', status: 'active' })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a1',
    })

    const result = await repo.findPurchaseById({ tenantId: TENANT_A }, purchase.id)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(purchase.id)
  })
})

// ─── 13. listPurchasesByClient is tenant-scoped ───────────────────────────────

describe('listPurchasesByClient', () => {
  it('is tenant-scoped — does not return other tenant purchases', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-a1', erpCustomerId: 'CUST-A1' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a1', status: 'active' })
    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a1',
    })

    // Tenant B queries client ci-a1 — must get nothing (wrong tenant)
    const results = await repo.listPurchasesByClient({ tenantId: TENANT_B }, 'ci-a1')
    expect(results).toHaveLength(0)
  })

  it('returns all purchases for the correct tenant and client', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-a1', erpCustomerId: 'CUST-A1' })
    await seedClient({ tenantId: TENANT_A, id: 'ci-a2', erpCustomerId: 'CUST-A2' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a1', status: 'active' })

    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a1',
    })
    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a1',
    })
    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a2', erpCustomerId: 'CUST-A2', packageTemplateId: 'pt-a1',
    })

    const results = await repo.listPurchasesByClient({ tenantId: TENANT_A }, 'ci-a1')
    expect(results).toHaveLength(2)
    for (const p of results) {
      expect(p.clientIndexId).toBe('ci-a1')
      expect(p.tenantId).toBe(TENANT_A)
    }
  })
})

// ─── 14. listPurchasesByTemplate is tenant-scoped ────────────────────────────

describe('listPurchasesByTemplate', () => {
  it('is tenant-scoped — does not return other tenant purchases', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-a1', erpCustomerId: 'CUST-A1' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a1', status: 'active' })
    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a1',
    })

    // Tenant B queries template pt-a1 — must get nothing
    const results = await repo.listPurchasesByTemplate({ tenantId: TENANT_B }, 'pt-a1')
    expect(results).toHaveLength(0)
  })

  it('returns all purchases for the correct tenant and template', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-a1', erpCustomerId: 'CUST-A1' })
    await seedClient({ tenantId: TENANT_A, id: 'ci-a2', erpCustomerId: 'CUST-A2' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a1', status: 'active' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-a2', status: 'active' })

    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a1',
    })
    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a2', erpCustomerId: 'CUST-A2', packageTemplateId: 'pt-a1',
    })
    await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1', packageTemplateId: 'pt-a2',
    })

    const results = await repo.listPurchasesByTemplate({ tenantId: TENANT_A }, 'pt-a1')
    expect(results).toHaveLength(2)
    for (const p of results) {
      expect(p.packageTemplateId).toBe('pt-a1')
      expect(p.tenantId).toBe(TENANT_A)
    }
  })
})

// ─── Seed helper for direct purchase row insertion ───────────────────────────

const VALID_SNAPSHOT = JSON.stringify({
  schemaVersion: 1, templateId: 'pt-1', name: '10-Session Block',
  description: null, templateType: 'standard_block', sessionCount: 10,
  priceAmount: 50000, currency: 'USD', expiryDays: null, erpItemCode: 'SVC-10',
  supersedesTemplateId: null, templateStatus: 'active', capturedAtUtc: NOW,
})

async function seedPurchase(opts: {
  id:              string
  tenantId:        string
  clientIndexId:   string
  erpCustomerId:   string
  templateId?:     string
  idempotencyKey?: string | null
  invoiceId?:      string | null
  packageStatus?:  string
}) {
  const templateId    = opts.templateId     ?? 'pt-1'
  const idempKeyVal   = opts.idempotencyKey != null ? `'${opts.idempotencyKey}'` : 'NULL'
  const invoiceVal    = opts.invoiceId      != null ? `'${opts.invoiceId}'`      : 'NULL'
  const packageStatus = opts.packageStatus  ?? 'pending_activation'
  await dbClient.execute(`
    INSERT INTO "client_package_purchase" (
      "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
      "template_snapshot_json","erp_sales_invoice_id","payment_status","package_status",
      "purchased_at_utc","created_at_utc","updated_at_utc","idempotency_key"
    ) VALUES (
      '${opts.id}','${opts.tenantId}','${opts.clientIndexId}','${opts.erpCustomerId}',
      '${templateId}','${VALID_SNAPSHOT}',${invoiceVal},'pending','${packageStatus}',
      '${NOW}','${NOW}','${NOW}',${idempKeyVal}
    )
  `)
}

// ─── findPurchaseByIdempotencyKey ─────────────────────────────────────────────

describe('findPurchaseByIdempotencyKey', () => {
  it('returns the purchase when idempotency key exists in the same tenant', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
      idempotencyKey: 'assign-ikey-001',
    })

    const found = await repo.findPurchaseByIdempotencyKey(
      { tenantId: TENANT_A }, 'assign-ikey-001',
    )
    expect(found).not.toBeNull()
    expect(found!.id).toBe('cpp-1')
    expect(found!.tenantId).toBe(TENANT_A)
  })

  it('returns null for an unknown idempotency key', async () => {
    const result = await repo.findPurchaseByIdempotencyKey(
      { tenantId: TENANT_A }, 'nonexistent-key',
    )
    expect(result).toBeNull()
  })

  it('returns null for a blank idempotency key', async () => {
    const result = await repo.findPurchaseByIdempotencyKey({ tenantId: TENANT_A }, '')
    expect(result).toBeNull()
  })

  it('returns null for cross-tenant access (tenant isolation)', async () => {
    await seedPurchase({
      id: 'cpp-b1', tenantId: TENANT_B,
      clientIndexId: 'ci-b1', erpCustomerId: 'CUST-B1',
      idempotencyKey: 'b-only-key',
    })

    const result = await repo.findPurchaseByIdempotencyKey(
      { tenantId: TENANT_A }, 'b-only-key',
    )
    expect(result).toBeNull()
  })
})

// ─── attachInvoiceAndActivate ─────────────────────────────────────────────────

describe('attachInvoiceAndActivate', () => {
  it('sets erpSalesInvoiceId, packageStatus, activatedAtUtc, updatedAtUtc', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const input: AttachInvoiceInput = { erpSalesInvoiceId: 'ACC-SINV-2026-00001' }
    const result = await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-1', input,
    )

    expect(result.id).toBe('cpp-1')
    expect(result.erpSalesInvoiceId).toBe('ACC-SINV-2026-00001')
    expect(result.packageStatus).toBe('active')
    expect(result.activatedAtUtc).toBeTruthy()
    expect(result.updatedAtUtc).toBeTruthy()
    expect(result.updatedAtUtc >= result.activatedAtUtc!).toBe(true)

    // Verify persisted in DB
    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-1')
    expect(persisted!.erpSalesInvoiceId).toBe('ACC-SINV-2026-00001')
    expect(persisted!.packageStatus).toBe('active')
    expect(persisted!.activatedAtUtc).toBeTruthy()
  })

  it('uses provided activatedAtUtc when supplied', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const activatedAt = '2026-06-01T12:00:00.000Z'
    const result = await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-1',
      { erpSalesInvoiceId: 'ACC-SINV-2026-00002', activatedAtUtc: activatedAt },
    )

    expect(result.activatedAtUtc).toBe(activatedAt)
  })

  it('preserves immutable snapshot fields after activation', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const before = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-1')
    const result = await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-1',
      { erpSalesInvoiceId: 'ACC-SINV-2026-00003' },
    )

    // Immutable fields must be unchanged
    expect(result.clientIndexId).toBe(before!.clientIndexId)
    expect(result.erpCustomerId).toBe(before!.erpCustomerId)
    expect(result.packageTemplateId).toBe(before!.packageTemplateId)
    expect(result.purchasedAtUtc).toBe(before!.purchasedAtUtc)
    expect(result.createdAtUtc).toBe(before!.createdAtUtc)
    expect(result.templateSnapshot).toEqual(before!.templateSnapshot)
  })

  it('does not change paymentStatus', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-1',
      { erpSalesInvoiceId: 'ACC-SINV-2026-00004' },
    )

    expect(result.paymentStatus).toBe('pending')
  })

  it('rejects blank purchaseId', async () => {
    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_A }, '',
        { erpSalesInvoiceId: 'ACC-SINV-2026-00001' },
      ),
    ).rejects.toThrow('purchaseId must not be blank')
  })

  it('rejects blank erpSalesInvoiceId', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })
    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_A }, 'cpp-1',
        { erpSalesInvoiceId: '' },
      ),
    ).rejects.toThrow('erpSalesInvoiceId must not be blank')
  })

  it('throws when purchase does not exist', async () => {
    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_A }, 'cpp-nonexistent',
        { erpSalesInvoiceId: 'ACC-SINV-2026-00001' },
      ),
    ).rejects.toThrow('purchase not found')
  })

  it('wrong tenant cannot attach invoice to another tenant purchase', async () => {
    await seedPurchase({
      id: 'cpp-a1', tenantId: TENANT_A,
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1',
    })

    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_B }, 'cpp-a1',
        { erpSalesInvoiceId: 'ACC-SINV-2026-00001' },
      ),
    ).rejects.toThrow('purchase not found')

    // Verify tenant A's purchase remains unmodified
    const unmodified = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-a1')
    expect(unmodified!.packageStatus).toBe('pending_activation')
    expect(unmodified!.erpSalesInvoiceId).toBeNull()
  })

  it('duplicate invoice id in the same tenant is rejected by the partial unique index', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })
    await seedPurchase({
      id: 'cpp-2', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-1',
      { erpSalesInvoiceId: 'ACC-SINV-2026-DUPE' },
    )
    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_A }, 'cpp-2',
        { erpSalesInvoiceId: 'ACC-SINV-2026-DUPE' },
      ),
    ).rejects.toThrow()
  })

  it('same invoice id in different tenants is allowed', async () => {
    await seedPurchase({
      id: 'cpp-a1', tenantId: TENANT_A,
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1',
    })
    await seedPurchase({
      id: 'cpp-b1', tenantId: TENANT_B,
      clientIndexId: 'ci-b1', erpCustomerId: 'CUST-B1',
    })

    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_A }, 'cpp-a1',
        { erpSalesInvoiceId: 'ACC-SINV-2026-SHARED' },
      ),
    ).resolves.not.toThrow()
    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_B }, 'cpp-b1',
        { erpSalesInvoiceId: 'ACC-SINV-2026-SHARED' },
      ),
    ).resolves.not.toThrow()
  })

  it('does not create any package_ledger rows', async () => {
    await seedPurchase({
      id: 'cpp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-1',
      { erpSalesInvoiceId: 'ACC-SINV-2026-00099' },
    )

    const ledgerRows = await dbClient.execute(
      `SELECT COUNT(*) AS cnt FROM "package_ledger"`,
    )
    expect(Number(ledgerRows.rows[0]?.cnt)).toBe(0)
  })
})

// ─── createPurchaseFromTemplate — idempotency key ─────────────────────────────

describe('createPurchaseFromTemplate — idempotency key', () => {
  it('persists a provided idempotency key and hydrates it in the returned object', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active' })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
      idempotencyKey: 'assign-ikey-create-001',
    })

    expect(purchase.idempotencyKey).toBe('assign-ikey-create-001')
    const found = await repo.findPurchaseByIdempotencyKey(
      { tenantId: TENANT_A }, 'assign-ikey-create-001',
    )
    expect(found).not.toBeNull()
    expect(found!.id).toBe(purchase.id)
  })

  it('normalises blank idempotency key to null', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active' })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
      idempotencyKey: '',
    })

    expect(purchase.idempotencyKey).toBeNull()
    const row = await dbClient.execute(
      `SELECT "idempotency_key" FROM "client_package_purchase" WHERE "id" = '${purchase.id}'`,
    )
    expect(row.rows[0]?.idempotency_key).toBeNull()
  })

  it('normalises whitespace-only idempotency key to null', async () => {
    await seedClient({ tenantId: TENANT_A, id: 'ci-1', erpCustomerId: 'CUST-001' })
    await seedTemplate({ tenantId: TENANT_A, id: 'pt-1', status: 'active' })

    const purchase = await repo.createPurchaseFromTemplate({ tenantId: TENANT_A }, {
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001', packageTemplateId: 'pt-1',
      idempotencyKey: '   ',
    })

    expect(purchase.idempotencyKey).toBeNull()
  })

  it('duplicate non-null idempotency key in the same tenant is rejected (UNIQUE constraint)', async () => {
    await seedPurchase({
      id: 'cpp-dup-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
      idempotencyKey: 'dup-key-001',
    })

    await expect(
      seedPurchase({
        id: 'cpp-dup-2', tenantId: TENANT_A,
        clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
        idempotencyKey: 'dup-key-001',
      }),
    ).rejects.toThrow()
  })

  it('same idempotency key in different tenants is allowed', async () => {
    await seedPurchase({
      id: 'cpp-ta', tenantId: TENANT_A,
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1',
      idempotencyKey: 'shared-cross-tenant-key',
    })

    await expect(
      seedPurchase({
        id: 'cpp-tb', tenantId: TENANT_B,
        clientIndexId: 'ci-b1', erpCustomerId: 'CUST-B1',
        idempotencyKey: 'shared-cross-tenant-key',
      }),
    ).resolves.not.toThrow()
  })
})

// ─── attachInvoiceAndActivate — paymentStatus ─────────────────────────────────

describe('attachInvoiceAndActivate — paymentStatus', () => {
  it('sets paymentStatus to provided value and persists to DB', async () => {
    await seedPurchase({
      id: 'cpp-ps-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-ps-1',
      { erpSalesInvoiceId: 'ACC-SINV-2026-PS-001', paymentStatus: 'unpaid' },
    )

    expect(result.paymentStatus).toBe('unpaid')
    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ps-1')
    expect(persisted!.paymentStatus).toBe('unpaid')
  })

  it('leaves paymentStatus unchanged in DB when paymentStatus is omitted', async () => {
    await seedPurchase({
      id: 'cpp-ps-2', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await repo.attachInvoiceAndActivate(
      { tenantId: TENANT_A }, 'cpp-ps-2',
      { erpSalesInvoiceId: 'ACC-SINV-2026-PS-002' },
    )

    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ps-2')
    expect(persisted!.paymentStatus).toBe('pending')
  })

  it('rejects an unrecognised paymentStatus value before touching the DB', async () => {
    await seedPurchase({
      id: 'cpp-ps-3', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await expect(
      repo.attachInvoiceAndActivate(
        { tenantId: TENANT_A }, 'cpp-ps-3',
        { erpSalesInvoiceId: 'ACC-SINV-2026-PS-003', paymentStatus: 'INVALID' as 'unpaid' },
      ),
    ).rejects.toThrow('invalid paymentStatus')
  })
})

// ─── activateComplimentary ────────────────────────────────────────────────────

describe('activateComplimentary', () => {
  it('sets packageStatus to active', async () => {
    await seedPurchase({
      id: 'cpp-comp-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.activateComplimentary({ tenantId: TENANT_A }, 'cpp-comp-1')
    expect(result.packageStatus).toBe('active')
  })

  it('sets paymentStatus to paid', async () => {
    await seedPurchase({
      id: 'cpp-comp-2', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.activateComplimentary({ tenantId: TENANT_A }, 'cpp-comp-2')
    expect(result.paymentStatus).toBe('paid')
  })

  it('sets activatedAtUtc and updatedAtUtc', async () => {
    await seedPurchase({
      id: 'cpp-comp-3', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.activateComplimentary({ tenantId: TENANT_A }, 'cpp-comp-3')
    expect(result.activatedAtUtc).toBeTruthy()
    expect(result.updatedAtUtc).toBeTruthy()
    expect(result.updatedAtUtc >= result.activatedAtUtc!).toBe(true)
  })

  it('leaves erpSalesInvoiceId null', async () => {
    await seedPurchase({
      id: 'cpp-comp-4', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.activateComplimentary({ tenantId: TENANT_A }, 'cpp-comp-4')
    expect(result.erpSalesInvoiceId).toBeNull()
  })

  it('preserves immutable fields after activation', async () => {
    await seedPurchase({
      id: 'cpp-comp-5', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const before = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-comp-5')
    const result = await repo.activateComplimentary({ tenantId: TENANT_A }, 'cpp-comp-5')

    expect(result.clientIndexId).toBe(before!.clientIndexId)
    expect(result.erpCustomerId).toBe(before!.erpCustomerId)
    expect(result.packageTemplateId).toBe(before!.packageTemplateId)
    expect(result.purchasedAtUtc).toBe(before!.purchasedAtUtc)
    expect(result.createdAtUtc).toBe(before!.createdAtUtc)
    expect(result.templateSnapshot).toEqual(before!.templateSnapshot)
  })

  it('accepts and uses a provided activatedAtUtc', async () => {
    await seedPurchase({
      id: 'cpp-comp-6', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const activatedAt = '2026-06-01T08:00:00.000Z'
    const result = await repo.activateComplimentary(
      { tenantId: TENANT_A }, 'cpp-comp-6',
      { activatedAtUtc: activatedAt },
    )
    expect(result.activatedAtUtc).toBe(activatedAt)
  })

  it('persists changes to the database', async () => {
    await seedPurchase({
      id: 'cpp-comp-7', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await repo.activateComplimentary({ tenantId: TENANT_A }, 'cpp-comp-7')

    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-comp-7')
    expect(persisted!.packageStatus).toBe('active')
    expect(persisted!.paymentStatus).toBe('paid')
    expect(persisted!.activatedAtUtc).toBeTruthy()
    expect(persisted!.erpSalesInvoiceId).toBeNull()
  })

  it('wrong tenant cannot activate another tenant purchase', async () => {
    await seedPurchase({
      id: 'cpp-comp-a', tenantId: TENANT_A,
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1',
    })

    await expect(
      repo.activateComplimentary({ tenantId: TENANT_B }, 'cpp-comp-a'),
    ).rejects.toThrow('purchase not found')

    const unmodified = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-comp-a')
    expect(unmodified!.packageStatus).toBe('pending_activation')
  })

  it('rejects blank purchaseId', async () => {
    await expect(
      repo.activateComplimentary({ tenantId: TENANT_A }, ''),
    ).rejects.toThrow('purchaseId must not be blank')
  })

  it('throws when purchase does not exist', async () => {
    await expect(
      repo.activateComplimentary({ tenantId: TENANT_A }, 'cpp-nonexistent'),
    ).rejects.toThrow('purchase not found')
  })
})

// ─── recordInvoiceCreated ─────────────────────────────────────────────────────

describe('recordInvoiceCreated', () => {
  it('sets erpSalesInvoiceId and persists it to the DB', async () => {
    await seedPurchase({
      id: 'cpp-ri-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const input: RecordPackageInvoiceInput = { erpSalesInvoiceId: 'ACC-SINV-2026-RI-001' }
    const result = await repo.recordInvoiceCreated({ tenantId: TENANT_A }, 'cpp-ri-1', input)

    expect(result.erpSalesInvoiceId).toBe('ACC-SINV-2026-RI-001')
    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-1')
    expect(persisted!.erpSalesInvoiceId).toBe('ACC-SINV-2026-RI-001')
  })

  it('keeps packageStatus = pending_activation', async () => {
    await seedPurchase({
      id: 'cpp-ri-2', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-2',
      { erpSalesInvoiceId: 'ACC-SINV-2026-RI-002' },
    )

    expect(result.packageStatus).toBe('pending_activation')
    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-2')
    expect(persisted!.packageStatus).toBe('pending_activation')
  })

  it('keeps paymentStatus = pending', async () => {
    await seedPurchase({
      id: 'cpp-ri-3', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-3',
      { erpSalesInvoiceId: 'ACC-SINV-2026-RI-003' },
    )

    expect(result.paymentStatus).toBe('pending')
    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-3')
    expect(persisted!.paymentStatus).toBe('pending')
  })

  it('keeps activatedAtUtc = null', async () => {
    await seedPurchase({
      id: 'cpp-ri-4', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const result = await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-4',
      { erpSalesInvoiceId: 'ACC-SINV-2026-RI-004' },
    )

    expect(result.activatedAtUtc).toBeNull()
    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-4')
    expect(persisted!.activatedAtUtc).toBeNull()
  })

  it('updates updatedAtUtc and persists the new value', async () => {
    await seedPurchase({
      id: 'cpp-ri-5', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const before = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-5')
    const result = await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-5',
      { erpSalesInvoiceId: 'ACC-SINV-2026-RI-005' },
    )

    expect(result.updatedAtUtc >= before!.updatedAtUtc).toBe(true)
    const persisted = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-5')
    expect(persisted!.updatedAtUtc).toBe(result.updatedAtUtc)
  })

  it('preserves immutable snapshot, client, and template fields', async () => {
    await seedPurchase({
      id: 'cpp-ri-6', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const before = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-6')
    const result = await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-6',
      { erpSalesInvoiceId: 'ACC-SINV-2026-RI-006' },
    )

    expect(result.clientIndexId).toBe(before!.clientIndexId)
    expect(result.erpCustomerId).toBe(before!.erpCustomerId)
    expect(result.packageTemplateId).toBe(before!.packageTemplateId)
    expect(result.purchasedAtUtc).toBe(before!.purchasedAtUtc)
    expect(result.createdAtUtc).toBe(before!.createdAtUtc)
    expect(result.templateSnapshot).toEqual(before!.templateSnapshot)
  })

  it('is idempotent: calling again with the same invoice id returns safely without mutation', async () => {
    await seedPurchase({
      id: 'cpp-ri-7', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    const invoiceId = 'ACC-SINV-2026-RI-007'
    const first = await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-7', { erpSalesInvoiceId: invoiceId },
    )
    const second = await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-7', { erpSalesInvoiceId: invoiceId },
    )

    expect(second.erpSalesInvoiceId).toBe(invoiceId)
    expect(second.packageStatus).toBe(first.packageStatus)
    expect(second.paymentStatus).toBe(first.paymentStatus)
    expect(second.activatedAtUtc).toBeNull()
  })

  it('throws a conflict error when a different invoice id is already anchored', async () => {
    await seedPurchase({
      id: 'cpp-ri-8', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
      invoiceId: 'ACC-SINV-2026-RI-EXISTING',
    })

    await expect(
      repo.recordInvoiceCreated(
        { tenantId: TENANT_A }, 'cpp-ri-8',
        { erpSalesInvoiceId: 'ACC-SINV-2026-RI-DIFFERENT' },
      ),
    ).rejects.toThrow('already has')
  })

  it('rejects blank purchaseId', async () => {
    await expect(
      repo.recordInvoiceCreated(
        { tenantId: TENANT_A }, '',
        { erpSalesInvoiceId: 'ACC-SINV-2026-RI-001' },
      ),
    ).rejects.toThrow('purchaseId must not be blank')
  })

  it('rejects blank erpSalesInvoiceId', async () => {
    await seedPurchase({
      id: 'cpp-ri-9', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await expect(
      repo.recordInvoiceCreated(
        { tenantId: TENANT_A }, 'cpp-ri-9',
        { erpSalesInvoiceId: '' },
      ),
    ).rejects.toThrow('erpSalesInvoiceId must not be blank')
  })

  it('wrong tenant cannot record invoice on another tenant purchase', async () => {
    await seedPurchase({
      id: 'cpp-ri-a', tenantId: TENANT_A,
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1',
    })

    await expect(
      repo.recordInvoiceCreated(
        { tenantId: TENANT_B }, 'cpp-ri-a',
        { erpSalesInvoiceId: 'ACC-SINV-2026-RI-XTENANT' },
      ),
    ).rejects.toThrow('purchase not found')

    const unmodified = await repo.findPurchaseById({ tenantId: TENANT_A }, 'cpp-ri-a')
    expect(unmodified!.erpSalesInvoiceId).toBeNull()
  })

  it('duplicate invoice id on a different purchase in the same tenant is rejected', async () => {
    await seedPurchase({
      id: 'cpp-ri-dup-1', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })
    await seedPurchase({
      id: 'cpp-ri-dup-2', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-dup-1',
      { erpSalesInvoiceId: 'ACC-SINV-2026-RI-DUP' },
    )

    await expect(
      repo.recordInvoiceCreated(
        { tenantId: TENANT_A }, 'cpp-ri-dup-2',
        { erpSalesInvoiceId: 'ACC-SINV-2026-RI-DUP' },
      ),
    ).rejects.toThrow()
  })

  it('same invoice id in different tenants is allowed', async () => {
    await seedPurchase({
      id: 'cpp-ri-ta', tenantId: TENANT_A,
      clientIndexId: 'ci-a1', erpCustomerId: 'CUST-A1',
    })
    await seedPurchase({
      id: 'cpp-ri-tb', tenantId: TENANT_B,
      clientIndexId: 'ci-b1', erpCustomerId: 'CUST-B1',
    })

    await expect(
      repo.recordInvoiceCreated(
        { tenantId: TENANT_A }, 'cpp-ri-ta',
        { erpSalesInvoiceId: 'ACC-SINV-2026-RI-SHARED' },
      ),
    ).resolves.not.toThrow()

    await expect(
      repo.recordInvoiceCreated(
        { tenantId: TENANT_B }, 'cpp-ri-tb',
        { erpSalesInvoiceId: 'ACC-SINV-2026-RI-SHARED' },
      ),
    ).resolves.not.toThrow()
  })

  it('does not create any package_ledger rows', async () => {
    await seedPurchase({
      id: 'cpp-ri-ledger', tenantId: TENANT_A,
      clientIndexId: 'ci-1', erpCustomerId: 'CUST-001',
    })

    await repo.recordInvoiceCreated(
      { tenantId: TENANT_A }, 'cpp-ri-ledger',
      { erpSalesInvoiceId: 'ACC-SINV-2026-RI-LEDGER' },
    )

    const ledgerRows = await dbClient.execute(
      `SELECT COUNT(*) AS cnt FROM "package_ledger"`,
    )
    expect(Number(ledgerRows.rows[0]?.cnt)).toBe(0)
  })
})

// ─── buildPackageTemplateSnapshot (pure helper) ───────────────────────────────

describe('buildPackageTemplateSnapshot', () => {
  it('builds a valid snapshot from a PackageTemplate', () => {
    const template = {
      id:                   'pt-x',
      tenantId:             TENANT_A,
      name:                 'Test Block',
      description:          'A test',
      templateType:         'standard_block' as const,
      sessionCount:         8,
      priceAmount:          40000,
      currency:             'USD',
      expiryDays:           60,
      erpItemCode:          'SVC-8',
      status:               'active' as const,
      firstSoldAtUtc:       null,
      supersedesTemplateId: null,
      archivedAtUtc:        null,
      createdAtUtc:         NOW,
      updatedAtUtc:         NOW,
    }
    const snap = buildPackageTemplateSnapshot(template, NOW)

    expect(snap.schemaVersion).toBe(1)
    expect(snap.templateId).toBe('pt-x')
    expect(snap.name).toBe('Test Block')
    expect(snap.description).toBe('A test')
    expect(snap.templateType).toBe('standard_block')
    expect(snap.sessionCount).toBe(8)
    expect(snap.priceAmount).toBe(40000)
    expect(snap.currency).toBe('USD')
    expect(snap.expiryDays).toBe(60)
    expect(snap.erpItemCode).toBe('SVC-8')
    expect(snap.supersedesTemplateId).toBeNull()
    expect(snap.templateStatus).toBe('active')
    expect(snap.capturedAtUtc).toBe(NOW)
  })
})

// ─── findBestEligiblePackageForClient ────────────────────────────────────────

async function seedEligiblePurchase(opts: {
  id:              string
  tenantId:        string
  clientIndexId:   string
  erpCustomerId:   string
  packageStatus?:  string
  activatedAtUtc?: string | null
  expiresAtUtc?:   string | null
}) {
  const status      = opts.packageStatus  ?? 'active'
  const activated   = opts.activatedAtUtc !== undefined ? opts.activatedAtUtc : '2026-01-02T00:00:00.000Z'
  const expires     = opts.expiresAtUtc   !== undefined ? opts.expiresAtUtc   : null
  const activPart   = activated === null ? 'NULL' : `'${activated}'`
  const expiresPart = expires   === null ? 'NULL' : `'${expires}'`

  await dbClient.execute(`
    INSERT INTO "client_package_purchase" (
      "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
      "template_snapshot_json","payment_status","package_status",
      "purchased_at_utc","activated_at_utc","expires_at_utc",
      "created_at_utc","updated_at_utc"
    ) VALUES (
      '${opts.id}','${opts.tenantId}','${opts.clientIndexId}','${opts.erpCustomerId}',
      'pt-1','${VALID_SNAPSHOT}','paid','${status}',
      '2026-01-01T00:00:00.000Z',${activPart},${expiresPart},
      '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'
    )
  `)
}

const NOW_QUERY = '2026-06-01T00:00:00.000Z'

describe('findBestEligiblePackageForClient', () => {
  it('returns null when client has no packages', async () => {
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-no-packages', NOW_QUERY,
    )
    expect(result).toBeNull()
  })

  it('returns null when all active packages are expired', async () => {
    await seedEligiblePurchase({
      id: 'cpp-exp-only', tenantId: TENANT_A,
      clientIndexId: 'ci-exponly', erpCustomerId: 'CUST-EXPONLY',
      expiresAtUtc: '2026-05-31T00:00:00.000Z', // before NOW_QUERY
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-exponly', NOW_QUERY,
    )
    expect(result).toBeNull()
  })

  it('excludes package whose expiresAtUtc equals nowUtc (strict greater-than)', async () => {
    await seedEligiblePurchase({
      id: 'cpp-exact-now', tenantId: TENANT_A,
      clientIndexId: 'ci-exact', erpCustomerId: 'CUST-EXACT',
      expiresAtUtc: NOW_QUERY, // exactly equal — must be excluded
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-exact', NOW_QUERY,
    )
    expect(result).toBeNull()
  })

  it('returns null when no package has packageStatus=active', async () => {
    await seedEligiblePurchase({
      id: 'cpp-pend-1', tenantId: TENANT_A,
      clientIndexId: 'ci-inactive', erpCustomerId: 'CUST-INACTIVE',
      packageStatus: 'pending_activation',
    })
    await seedEligiblePurchase({
      id: 'cpp-canc-1', tenantId: TENANT_A,
      clientIndexId: 'ci-inactive', erpCustomerId: 'CUST-INACTIVE',
      packageStatus: 'cancelled',
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-inactive', NOW_QUERY,
    )
    expect(result).toBeNull()
  })

  it('returns the single active non-expired package', async () => {
    await seedEligiblePurchase({
      id: 'cpp-solo-1', tenantId: TENANT_A,
      clientIndexId: 'ci-solo', erpCustomerId: 'CUST-SOLO',
      expiresAtUtc: '2026-07-01T00:00:00.000Z',
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-solo', NOW_QUERY,
    )
    expect(result).not.toBeNull()
    expect(result!.id).toBe('cpp-solo-1')
  })

  it('NULL ordering regression: dated-expiry package sorts before no-expiry package', async () => {
    // Insert no-expiry first — insertion order must not determine result
    await seedEligiblePurchase({
      id: 'cpp-no-exp-reg', tenantId: TENANT_A,
      clientIndexId: 'ci-nullreg', erpCustomerId: 'CUST-NULLREG',
      expiresAtUtc: null, // no-expiry — must sort LAST
    })
    await seedEligiblePurchase({
      id: 'cpp-dated-reg', tenantId: TENANT_A,
      clientIndexId: 'ci-nullreg', erpCustomerId: 'CUST-NULLREG',
      expiresAtUtc: '2026-07-01T00:00:00.000Z', // dated expiry — must sort FIRST
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-nullreg', NOW_QUERY,
    )
    expect(result).not.toBeNull()
    expect(result!.id).toBe('cpp-dated-reg')
  })

  it('chooses earliest expiry when multiple dated packages exist', async () => {
    await seedEligiblePurchase({
      id: 'cpp-aug', tenantId: TENANT_A,
      clientIndexId: 'ci-multiexp', erpCustomerId: 'CUST-MULTIEXP',
      expiresAtUtc: '2026-09-01T00:00:00.000Z',
    })
    await seedEligiblePurchase({
      id: 'cpp-jul', tenantId: TENANT_A,
      clientIndexId: 'ci-multiexp', erpCustomerId: 'CUST-MULTIEXP',
      expiresAtUtc: '2026-07-01T00:00:00.000Z', // earlier — must win
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-multiexp', NOW_QUERY,
    )
    expect(result).not.toBeNull()
    expect(result!.id).toBe('cpp-jul')
  })

  it('tie-breaks by oldest activatedAtUtc when expiry dates are equal', async () => {
    const sameExpiry = '2026-07-01T00:00:00.000Z'
    await seedEligiblePurchase({
      id: 'cpp-newer-act', tenantId: TENANT_A,
      clientIndexId: 'ci-tieact', erpCustomerId: 'CUST-TIEACT',
      expiresAtUtc:   sameExpiry,
      activatedAtUtc: '2026-01-10T00:00:00.000Z', // newer
    })
    await seedEligiblePurchase({
      id: 'cpp-older-act', tenantId: TENANT_A,
      clientIndexId: 'ci-tieact', erpCustomerId: 'CUST-TIEACT',
      expiresAtUtc:   sameExpiry,
      activatedAtUtc: '2026-01-02T00:00:00.000Z', // older — must win
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-tieact', NOW_QUERY,
    )
    expect(result).not.toBeNull()
    expect(result!.id).toBe('cpp-older-act')
  })

  it('final tie-break by id when expiry and activatedAtUtc both match', async () => {
    const sameExpiry    = '2026-07-01T00:00:00.000Z'
    const sameActivated = '2026-01-02T00:00:00.000Z'
    await seedEligiblePurchase({
      id: 'zzz-cpp-tie', tenantId: TENANT_A,
      clientIndexId: 'ci-tieid', erpCustomerId: 'CUST-TIEID',
      expiresAtUtc: sameExpiry, activatedAtUtc: sameActivated,
    })
    await seedEligiblePurchase({
      id: 'aaa-cpp-tie', tenantId: TENANT_A,
      clientIndexId: 'ci-tieid', erpCustomerId: 'CUST-TIEID',
      expiresAtUtc: sameExpiry, activatedAtUtc: sameActivated,
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-tieid', NOW_QUERY,
    )
    expect(result).not.toBeNull()
    expect(result!.id).toBe('aaa-cpp-tie') // lexicographically first
  })

  it('no-expiry packages tie-break by id when activatedAtUtc also matches', async () => {
    const sameActivated = '2026-01-02T00:00:00.000Z'
    await seedEligiblePurchase({
      id: 'zzz-noexp', tenantId: TENANT_A,
      clientIndexId: 'ci-noexptie', erpCustomerId: 'CUST-NOEXPTIE',
      expiresAtUtc: null, activatedAtUtc: sameActivated,
    })
    await seedEligiblePurchase({
      id: 'aaa-noexp', tenantId: TENANT_A,
      clientIndexId: 'ci-noexptie', erpCustomerId: 'CUST-NOEXPTIE',
      expiresAtUtc: null, activatedAtUtc: sameActivated,
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_A }, 'ci-noexptie', NOW_QUERY,
    )
    expect(result).not.toBeNull()
    expect(result!.id).toBe('aaa-noexp')
  })

  it('does not return packages from a different tenant', async () => {
    await seedEligiblePurchase({
      id: 'cpp-iso-only', tenantId: TENANT_A,
      clientIndexId: 'ci-iso', erpCustomerId: 'CUST-ISO',
    })
    const result = await repo.findBestEligiblePackageForClient(
      { tenantId: TENANT_B }, 'ci-iso', NOW_QUERY,
    )
    expect(result).toBeNull()
  })
})
