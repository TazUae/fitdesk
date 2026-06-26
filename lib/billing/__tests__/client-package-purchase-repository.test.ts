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
import type { CreatePackagePurchaseInput } from '@/types/billing'

// ─── DDL (kept in sync with scripts/migrate-app.mjs) ─────────────────────────

const SETUP_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id"                          TEXT NOT NULL PRIMARY KEY,
    "tenant_id"                   TEXT NOT NULL,
    "erp_customer_id"             TEXT NOT NULL,
    "full_name"                   TEXT NOT NULL,
    "phone_e164"                  TEXT NOT NULL,
    "whatsapp_enabled"            INTEGER NOT NULL DEFAULT 0,
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
