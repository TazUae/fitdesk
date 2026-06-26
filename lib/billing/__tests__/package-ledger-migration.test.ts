/**
 * Migration DDL tests for Phase C1:
 *   - client_package_purchase.idempotency_key column + partial unique index
 *   - package_ledger table (append-only, CHECK constraints, indexes)
 *
 * Uses ':memory:' — safe here because all operations go through the same
 * libsql client (no Drizzle transaction isolation needed for DDL-only tests).
 *
 * DDL kept in sync with scripts/migrate-app.mjs manually.
 */

import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

// ─── client_package_purchase base DDL (mirrors B3a) ──────────────────────────

const CPP_BASE_DDL = [
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
]

// ─── C1 additive DDL: idempotency_key column + partial unique index ───────────

const CPP_IDEMPOTENCY_DDL = [
  `ALTER TABLE "client_package_purchase" ADD COLUMN "idempotency_key" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_package_purchase_tenant_idempotency_uq"
    ON "client_package_purchase" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,
]

// ─── package_ledger DDL ───────────────────────────────────────────────────────

const LEDGER_DDL = [
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
  `CREATE INDEX IF NOT EXISTS "package_ledger_tenant_event_idx"
    ON "package_ledger" ("tenant_id", "event_type")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "package_ledger_tenant_idempotency_uq"
    ON "package_ledger" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runDdl(
  client: ReturnType<typeof createClient>,
  statements: string[],
) {
  for (const sql of statements) {
    await client.execute(sql)
  }
}

/** Simulates the PRAGMA-guarded ALTER TABLE in migrate-app.mjs. */
async function runCppIdempotencyDdl(client: ReturnType<typeof createClient>) {
  const { rows } = await client.execute(`PRAGMA table_info("client_package_purchase")`)
  const hasColumn = rows.some((r) => r.name === 'idempotency_key')
  if (!hasColumn) {
    await client.execute(CPP_IDEMPOTENCY_DDL[0]) // ALTER TABLE
  }
  await client.execute(CPP_IDEMPOTENCY_DDL[1]) // CREATE UNIQUE INDEX IF NOT EXISTS
}

/** Sets up client_package_purchase with the C1 idempotency_key column. */
async function setupCpp(client: ReturnType<typeof createClient>) {
  await runDdl(client, CPP_BASE_DDL)
  await runCppIdempotencyDdl(client)
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

function cppRow(
  id: string,
  tenantId: string,
  idempotencyKey: string | null = null,
): string {
  const ikVal = idempotencyKey === null ? 'NULL' : `'${idempotencyKey}'`
  return `INSERT INTO "client_package_purchase" (
    "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
    "template_snapshot_json","payment_status","package_status",
    "purchased_at_utc","created_at_utc","updated_at_utc","idempotency_key"
  ) VALUES (
    '${id}','${tenantId}','ci-1','CUST-001','pt-1',
    '${VALID_SNAPSHOT}','pending','pending_activation',
    '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',${ikVal}
  )`
}

function ledgerRow(
  id: string,
  tenantId: string,
  eventType = 'purchase_activation',
  deltaUnits = 10,
  idempotencyKey: string | null = null,
): string {
  const ikVal = idempotencyKey === null ? 'NULL' : `'${idempotencyKey}'`
  return `INSERT INTO "package_ledger" (
    "id","tenant_id","client_index_id","erp_customer_id",
    "package_purchase_id","event_type","delta_units","idempotency_key","created_at_utc"
  ) VALUES (
    '${id}','${tenantId}','ci-1','CUST-001',
    'cpp-1','${eventType}',${deltaUnits},${ikVal},'2026-01-01T00:00:00Z'
  )`
}

// ─── client_package_purchase — idempotency_key tests ─────────────────────────

describe('client_package_purchase.idempotency_key column', () => {
  it('column exists after C1 migration', async () => {
    const client = createClient({ url: ':memory:' })
    await setupCpp(client)

    const { rows } = await client.execute(`PRAGMA table_info("client_package_purchase")`)
    const cols = rows.map((r) => r.name as string)
    expect(cols).toContain('idempotency_key')
    client.close()
  })

  it('allows multiple rows with NULL idempotency_key', async () => {
    const client = createClient({ url: ':memory:' })
    await setupCpp(client)

    await client.execute(cppRow('cpp-1', 'tenant-a', null))
    await expect(client.execute(cppRow('cpp-2', 'tenant-a', null))).resolves.not.toThrow()
    client.close()
  })

  it('rejects duplicate non-null idempotency_key in same tenant', async () => {
    const client = createClient({ url: ':memory:' })
    await setupCpp(client)

    await client.execute(cppRow('cpp-1', 'tenant-a', 'ikey-abc'))
    await expect(
      client.execute(cppRow('cpp-2', 'tenant-a', 'ikey-abc')),
    ).rejects.toThrow()
    client.close()
  })

  it('allows same non-null idempotency_key across different tenants', async () => {
    const client = createClient({ url: ':memory:' })
    await setupCpp(client)

    await client.execute(cppRow('cpp-1', 'tenant-a', 'ikey-abc'))
    await expect(
      client.execute(cppRow('cpp-2', 'tenant-b', 'ikey-abc')),
    ).resolves.not.toThrow()
    client.close()
  })

  it('migration is idempotent — running DDL twice does not throw', async () => {
    const client = createClient({ url: ':memory:' })
    await setupCpp(client)
    // Running again must not throw (PRAGMA guard skips ALTER TABLE, IF NOT EXISTS skips index)
    await expect(runCppIdempotencyDdl(client)).resolves.not.toThrow()
    client.close()
  })
})

// ─── package_ledger table tests ───────────────────────────────────────────────

describe('package_ledger DDL migration', () => {
  it('table exists after migration', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='package_ledger'`,
    )
    expect(rows).toHaveLength(1)
    client.close()
  })

  it('has all required columns', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    const { rows } = await client.execute(`PRAGMA table_info("package_ledger")`)
    const cols = rows.map((r) => r.name as string)

    const expected = [
      'id',
      'tenant_id',
      'client_index_id',
      'erp_customer_id',
      'package_purchase_id',
      'event_type',
      'delta_units',
      'reason',
      'idempotency_key',
      'erp_reference',
      'created_by_user_id',
      'created_at_utc',
    ]
    for (const col of expected) {
      expect(cols).toContain(col)
    }
    client.close()
  })

  it('has all required indexes (3 regular + 1 partial unique)', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='package_ledger'`,
    )
    const names = rows.map((r) => r.name as string)
    expect(names).toContain('package_ledger_tenant_purchase_idx')
    expect(names).toContain('package_ledger_tenant_client_idx')
    expect(names).toContain('package_ledger_tenant_event_idx')
    expect(names).toContain('package_ledger_tenant_idempotency_uq')
    client.close()
  })

  it('accepts a valid row insert', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)
    await expect(
      client.execute(ledgerRow('led-1', 'tenant-a', 'purchase_activation', 10)),
    ).resolves.not.toThrow()
    client.close()
  })
})

describe('package_ledger CHECK constraints', () => {
  it('rejects invalid event_type', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)
    await expect(
      client.execute(ledgerRow('led-x', 'tenant-a', 'invalid_event', 10)),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects delta_units = 0', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)
    await expect(
      client.execute(ledgerRow('led-x', 'tenant-a', 'purchase_activation', 0)),
    ).rejects.toThrow()
    client.close()
  })

  it('accepts all canonical event_type values', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    const validTypes = [
      'purchase_activation',
      'bonus_granted',
      'refund_credit',
      'session_consumed',
      'late_cancel_penalty',
      'expiration_sweep',
    ]
    for (let i = 0; i < validTypes.length; i++) {
      await expect(
        client.execute(ledgerRow(`led-${i}`, 'tenant-a', validTypes[i], i % 2 === 0 ? 1 : -1)),
      ).resolves.not.toThrow()
    }
    client.close()
  })

  it('accepts negative delta_units (debit event)', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)
    await expect(
      client.execute(ledgerRow('led-1', 'tenant-a', 'session_consumed', -1)),
    ).resolves.not.toThrow()
    client.close()
  })
})

describe('package_ledger idempotency_key partial unique index', () => {
  it('allows multiple rows with NULL idempotency_key', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    await client.execute(ledgerRow('led-1', 'tenant-a', 'purchase_activation', 10, null))
    await expect(
      client.execute(ledgerRow('led-2', 'tenant-a', 'bonus_granted', 5, null)),
    ).resolves.not.toThrow()
    client.close()
  })

  it('rejects duplicate non-null idempotency_key in same tenant', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    await client.execute(ledgerRow('led-1', 'tenant-a', 'purchase_activation', 10, 'lkey-xyz'))
    await expect(
      client.execute(ledgerRow('led-2', 'tenant-a', 'bonus_granted', 5, 'lkey-xyz')),
    ).rejects.toThrow()
    client.close()
  })

  it('allows same non-null idempotency_key across different tenants', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    await client.execute(ledgerRow('led-1', 'tenant-a', 'purchase_activation', 10, 'lkey-xyz'))
    await expect(
      client.execute(ledgerRow('led-2', 'tenant-b', 'purchase_activation', 10, 'lkey-xyz')),
    ).resolves.not.toThrow()
    client.close()
  })
})

describe('package_ledger append-only invariants', () => {
  it('does not have an updated_at_utc column', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client, LEDGER_DDL)

    const { rows } = await client.execute(`PRAGMA table_info("package_ledger")`)
    const cols = rows.map((r) => r.name as string)
    expect(cols).not.toContain('updated_at_utc')
    client.close()
  })
})
