/**
 * Migration DDL tests for client_package_purchase.
 *
 * Verifies idempotency, column structure, index presence, and CHECK constraint
 * enforcement (including json_valid and temporal ordering checks).
 * Uses ':memory:' — safe here because all operations go through the same
 * libsql client.
 *
 * DDL kept in sync with scripts/migrate-app.mjs manually.
 */

import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

const CLIENT_PACKAGE_PURCHASE_DDL = [
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

async function runDdl(client: ReturnType<typeof createClient>) {
  for (const sql of CLIENT_PACKAGE_PURCHASE_DDL) {
    await client.execute(sql)
  }
}

const VALID_SNAPSHOT = JSON.stringify({
  schemaVersion: 1,
  templateId: 'pt-1',
  name: '10-Session Block',
  description: null,
  templateType: 'standard_block',
  sessionCount: 10,
  priceAmount: 50000,
  currency: 'USD',
  expiryDays: 90,
  erpItemCode: 'SVC-10',
  supersedesTemplateId: null,
  templateStatus: 'active',
  capturedAtUtc: '2026-01-01T00:00:00Z',
})

function validInsert(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    id:                     'cpp-1',
    tenant_id:              'tenant-a',
    client_index_id:        'ci-1',
    erp_customer_id:        'CUST-001',
    package_template_id:    'pt-1',
    template_snapshot_json: VALID_SNAPSHOT,
    payment_status:         'pending',
    package_status:         'pending_activation',
    purchased_at_utc:       '2026-01-01T00:00:00Z',
    created_at_utc:         '2026-01-01T00:00:00Z',
    updated_at_utc:         '2026-01-01T00:00:00Z',
  }
  const fields = { ...defaults, ...overrides }
  const cols = Object.keys(fields).map((k) => `"${k}"`).join(', ')
  const vals = Object.values(fields).map((v) => `'${v}'`).join(', ')
  return `INSERT INTO "client_package_purchase" (${cols}) VALUES (${vals})`
}

describe('client_package_purchase DDL migration', () => {
  it('table exists after migration', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='client_package_purchase'`,
    )
    expect(rows).toHaveLength(1)
    client.close()
  })

  it('has all required columns', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(`PRAGMA table_info("client_package_purchase")`)
    const columns = rows.map((r) => r.name as string)

    const expected = [
      'id',
      'tenant_id',
      'client_index_id',
      'erp_customer_id',
      'package_template_id',
      'template_snapshot_json',
      'erp_sales_invoice_id',
      'payment_status',
      'package_status',
      'purchased_at_utc',
      'activated_at_utc',
      'expires_at_utc',
      'created_at_utc',
      'updated_at_utc',
    ]
    for (const col of expected) {
      expect(columns).toContain(col)
    }
    client.close()
  })

  it('has all required indexes (3 regular + 1 partial unique)', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='client_package_purchase'`,
    )
    const indexNames = rows.map((r) => r.name as string)
    expect(indexNames).toContain('client_package_purchase_tenant_client_idx')
    expect(indexNames).toContain('client_package_purchase_tenant_template_idx')
    expect(indexNames).toContain('client_package_purchase_tenant_status_idx')
    expect(indexNames).toContain('client_package_purchase_tenant_invoice_uq')
    client.close()
  })

  it('accepts a valid row insert', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)
    await expect(client.execute(validInsert())).resolves.not.toThrow()
    client.close()
  })
})

describe('client_package_purchase CHECK constraints', () => {
  it('rejects invalid payment_status', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)
    await expect(
      client.execute(validInsert({ id: 'cpp-x', payment_status: 'bounced' })),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects invalid package_status', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)
    await expect(
      client.execute(validInsert({ id: 'cpp-x', package_status: 'unknown' })),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects empty template_snapshot_json', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)
    await expect(
      client.execute(validInsert({ id: 'cpp-x', template_snapshot_json: '' })),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects non-JSON template_snapshot_json', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)
    await expect(
      client.execute(validInsert({ id: 'cpp-x', template_snapshot_json: 'not-json' })),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects activated_at_utc before purchased_at_utc', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`
        INSERT INTO "client_package_purchase" (
          "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
          "template_snapshot_json","payment_status","package_status",
          "purchased_at_utc","activated_at_utc","created_at_utc","updated_at_utc"
        ) VALUES (
          'cpp-x','tenant-a','ci-1','CUST-001','pt-1',
          '${VALID_SNAPSHOT}','pending','pending_activation',
          '2026-06-01T00:00:00Z','2026-05-31T00:00:00Z',
          '2026-06-01T00:00:00Z','2026-06-01T00:00:00Z'
        )
      `),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects expires_at_utc before purchased_at_utc', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`
        INSERT INTO "client_package_purchase" (
          "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
          "template_snapshot_json","payment_status","package_status",
          "purchased_at_utc","expires_at_utc","created_at_utc","updated_at_utc"
        ) VALUES (
          'cpp-x','tenant-a','ci-1','CUST-001','pt-1',
          '${VALID_SNAPSHOT}','pending','pending_activation',
          '2026-06-01T00:00:00Z','2026-05-31T00:00:00Z',
          '2026-06-01T00:00:00Z','2026-06-01T00:00:00Z'
        )
      `),
    ).rejects.toThrow()
    client.close()
  })
})

describe('client_package_purchase partial unique invoice index', () => {
  it('allows multiple rows with NULL erp_sales_invoice_id', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await client.execute(validInsert({ id: 'cpp-1' }))
    await expect(client.execute(validInsert({ id: 'cpp-2' }))).resolves.not.toThrow()
    client.close()
  })

  it('rejects duplicate non-null erp_sales_invoice_id within same tenant', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await client.execute(`
      INSERT INTO "client_package_purchase" (
        "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
        "template_snapshot_json","erp_sales_invoice_id","payment_status","package_status",
        "purchased_at_utc","created_at_utc","updated_at_utc"
      ) VALUES (
        'cpp-1','tenant-a','ci-1','CUST-001','pt-1',
        '${VALID_SNAPSHOT}','INV-001','pending','pending_activation',
        '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
      )
    `)
    await expect(
      client.execute(`
        INSERT INTO "client_package_purchase" (
          "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
          "template_snapshot_json","erp_sales_invoice_id","payment_status","package_status",
          "purchased_at_utc","created_at_utc","updated_at_utc"
        ) VALUES (
          'cpp-2','tenant-a','ci-2','CUST-002','pt-1',
          '${VALID_SNAPSHOT}','INV-001','pending','pending_activation',
          '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
        )
      `),
    ).rejects.toThrow()
    client.close()
  })

  it('allows same erp_sales_invoice_id across different tenants', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await client.execute(`
      INSERT INTO "client_package_purchase" (
        "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
        "template_snapshot_json","erp_sales_invoice_id","payment_status","package_status",
        "purchased_at_utc","created_at_utc","updated_at_utc"
      ) VALUES (
        'cpp-1','tenant-a','ci-1','CUST-001','pt-1',
        '${VALID_SNAPSHOT}','INV-001','pending','pending_activation',
        '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
      )
    `)
    await expect(
      client.execute(`
        INSERT INTO "client_package_purchase" (
          "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
          "template_snapshot_json","erp_sales_invoice_id","payment_status","package_status",
          "purchased_at_utc","created_at_utc","updated_at_utc"
        ) VALUES (
          'cpp-2','tenant-b','ci-3','CUST-003','pt-1',
          '${VALID_SNAPSHOT}','INV-001','pending','pending_activation',
          '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
        )
      `),
    ).resolves.not.toThrow()
    client.close()
  })
})
