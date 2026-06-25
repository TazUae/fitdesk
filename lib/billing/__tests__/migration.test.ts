/**
 * Migration DDL tests for package_template.
 *
 * Verifies idempotency, column structure, index presence, and CHECK constraint
 * enforcement. Uses ':memory:' — safe here because all operations go through
 * the same libsql client (no Drizzle transaction isolation needed).
 *
 * DDL kept in sync with scripts/migrate-app.mjs manually.
 */

import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

const PACKAGE_TEMPLATE_DDL = [
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
  `CREATE INDEX IF NOT EXISTS "package_template_tenant_type_idx"
    ON "package_template" ("tenant_id", "template_type")`,
]

async function runDdl(client: ReturnType<typeof createClient>) {
  for (const sql of PACKAGE_TEMPLATE_DDL) {
    await client.execute(sql)
  }
}

const VALID_ROW = `INSERT INTO "package_template" (
  "id", "tenant_id", "name", "template_type", "session_count",
  "price_amount", "currency", "status", "created_at_utc", "updated_at_utc"
) VALUES (
  'pt-1', 'tenant-a', '10-Session Block', 'standard_block', 10,
  50000, 'USD', 'draft', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
)`

describe('package_template DDL migration', () => {
  it('creates the table without error', async () => {
    const client = createClient({ url: ':memory:' })
    await expect(runDdl(client)).resolves.not.toThrow()
    client.close()
  })

  it('is idempotent — running DDL twice does not throw', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)
    await expect(runDdl(client)).resolves.not.toThrow()
    client.close()
  })

  it('table exists after migration', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='package_template'`,
    )
    expect(rows).toHaveLength(1)
    client.close()
  })

  it('has all required columns', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(`PRAGMA table_info("package_template")`)
    const columns = rows.map((r) => r.name as string)

    const expected = [
      'id', 'tenant_id', 'name', 'description', 'template_type',
      'session_count', 'price_amount', 'currency', 'expiry_days', 'erp_item_code',
      'status', 'first_sold_at_utc', 'supersedes_template_id', 'archived_at_utc',
      'created_at_utc', 'updated_at_utc',
    ]
    for (const col of expected) {
      expect(columns).toContain(col)
    }
    client.close()
  })

  it('has both tenant indexes', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='package_template'`,
    )
    const indexNames = rows.map((r) => r.name as string)
    expect(indexNames).toContain('package_template_tenant_status_idx')
    expect(indexNames).toContain('package_template_tenant_type_idx')
    client.close()
  })

  it('accepts a valid row insert', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)
    await expect(client.execute(VALID_ROW)).resolves.not.toThrow()
    client.close()
  })
})

describe('package_template CHECK constraints', () => {
  it('rejects invalid template_type', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','invalid_type',10,0,'USD','draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects invalid status', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,0,'USD','unknown','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects session_count = 0', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',0,0,'USD','draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects session_count < 0', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',-1,0,'USD','draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects price_amount < 0', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,-1,'USD','draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('accepts price_amount = 0 (complimentary)', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','Comp','complimentary',5,0,'USD','draft','2026-01-01Z','2026-01-01Z')`),
    ).resolves.not.toThrow()
    client.close()
  })

  it('rejects currency length != 3', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,0,'US','draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects currency length > 3', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,0,'USDD','draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('accepts expiry_days = NULL', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","expiry_days","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,0,'USD',NULL,'draft','2026-01-01Z','2026-01-01Z')`),
    ).resolves.not.toThrow()
    client.close()
  })

  it('rejects expiry_days = 0', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","expiry_days","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,0,'USD',0,'draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('rejects expiry_days < 0', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","expiry_days","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,0,'USD',-30,'draft','2026-01-01Z','2026-01-01Z')`),
    ).rejects.toThrow()
    client.close()
  })

  it('accepts valid expiry_days > 0', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    await expect(
      client.execute(`INSERT INTO "package_template" (
        "id","tenant_id","name","template_type","session_count",
        "price_amount","currency","expiry_days","status","created_at_utc","updated_at_utc"
      ) VALUES ('pt-x','t','N','standard_block',10,0,'USD',90,'draft','2026-01-01Z','2026-01-01Z')`),
    ).resolves.not.toThrow()
    client.close()
  })
})
