/**
 * Migration idempotency tests.
 *
 * Verifies that running the DDL statements from scripts/migrate-app.mjs twice
 * against an in-memory database succeeds without error (CREATE TABLE IF NOT EXISTS).
 */

import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

// The same DDL statements that migrate-app.mjs runs — kept in sync manually.
// If migrate-app.mjs changes its DDL, update these too.
const CLIENT_DDL = [
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
  `CREATE INDEX IF NOT EXISTS "client_index_tenant_phone_idx"
    ON "client_index" ("tenant_id", "phone_e164")`,
  `CREATE INDEX IF NOT EXISTS "client_index_tenant_status_idx"
    ON "client_index" ("tenant_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "client_index_tenant_updated_idx"
    ON "client_index" ("tenant_id", "updated_at_utc")`,

  `CREATE TABLE IF NOT EXISTS "client_goal" (
    "id"                          TEXT NOT NULL PRIMARY KEY,
    "tenant_id"                   TEXT NOT NULL,
    "client_index_id"             TEXT NOT NULL,
    "erp_customer_id"             TEXT NOT NULL,
    "goal_id"                     TEXT NOT NULL,
    "is_primary"                  INTEGER NOT NULL DEFAULT 0,
    "sub_goal_ids_json"           TEXT NOT NULL DEFAULT '[]',
    "trainer_sub_goal_ids_json"   TEXT NOT NULL DEFAULT '[]',
    "urgency"                     TEXT NOT NULL DEFAULT 'active_focus',
    "confidence"                  TEXT NOT NULL DEFAULT 'unknown',
    "source"                      TEXT NOT NULL DEFAULT 'system_inferred',
    "safety_flags_json"           TEXT NOT NULL DEFAULT '[]',
    "notes"                       TEXT,
    "status"                      TEXT NOT NULL DEFAULT 'active',
    "created_at_utc"              TEXT NOT NULL,
    "updated_at_utc"              TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "client_goal_tenant_client_idx"
    ON "client_goal" ("tenant_id", "client_index_id")`,

  `CREATE TABLE IF NOT EXISTS "client_action_intent" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "tenant_id"        TEXT NOT NULL,
    "client_index_id"  TEXT NOT NULL,
    "erp_customer_id"  TEXT NOT NULL,
    "type"             TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "priority"         TEXT NOT NULL DEFAULT 'normal',
    "source"           TEXT NOT NULL DEFAULT 'system',
    "reason"           TEXT,
    "due_at_utc"       TEXT,
    "completed_at_utc" TEXT,
    "dismissed_at_utc" TEXT,
    "expires_at_utc"   TEXT,
    "created_at_utc"   TEXT NOT NULL,
    "updated_at_utc"   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "client_action_intent_tenant_client_idx"
    ON "client_action_intent" ("tenant_id", "client_index_id")`,
  `CREATE INDEX IF NOT EXISTS "client_action_intent_tenant_status_idx"
    ON "client_action_intent" ("tenant_id", "status")`,

  `CREATE TABLE IF NOT EXISTS "client_event" (
    "id"                TEXT NOT NULL PRIMARY KEY,
    "tenant_id"         TEXT NOT NULL,
    "client_index_id"   TEXT,
    "erp_customer_id"   TEXT,
    "type"              TEXT NOT NULL,
    "payload_json"      TEXT NOT NULL DEFAULT '{}',
    "created_by_user_id" TEXT,
    "created_at_utc"    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "client_event_tenant_client_idx"
    ON "client_event" ("tenant_id", "client_index_id")`,
]

async function runDdl(client: ReturnType<typeof createClient>) {
  for (const sql of CLIENT_DDL) {
    await client.execute(sql)
  }
}

describe('client management DDL migration', () => {
  it('creates all four client tables without error', async () => {
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

  it('confirms all four tables exist after migration', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    )
    const tableNames = rows.map((r) => r.name as string)

    expect(tableNames).toContain('client_index')
    expect(tableNames).toContain('client_goal')
    expect(tableNames).toContain('client_action_intent')
    expect(tableNames).toContain('client_event')
    client.close()
  })

  it('confirms the unique (tenant_id, erp_customer_id) index exists on client_index', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='client_index'`,
    )
    const indexNames = rows.map((r) => r.name as string)
    expect(indexNames).toContain('client_index_tenant_erp_idx')
    client.close()
  })

  it('client_goal table has is_primary column', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(`PRAGMA table_info("client_goal")`)
    const columnNames = rows.map((r) => r.name as string)
    expect(columnNames).toContain('is_primary')
    client.close()
  })

  it('client_goal table has trainer_sub_goal_ids_json column', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(`PRAGMA table_info("client_goal")`)
    const columnNames = rows.map((r) => r.name as string)
    expect(columnNames).toContain('trainer_sub_goal_ids_json')
    client.close()
  })

  it('client_index table has whatsapp_consent_state column (US-059)', async () => {
    const client = createClient({ url: ':memory:' })
    await runDdl(client)

    const { rows } = await client.execute(`PRAGMA table_info("client_index")`)
    const columnNames = rows.map((r) => r.name as string)
    expect(columnNames).toContain('whatsapp_consent_state')
    client.close()
  })
})

// ─── Phase 4.2 — additive ALTER migration ─────────────────────────────────────

// Old schema: client_goal WITHOUT the Phase 4.2 columns (mirrors the shipped v1 DDL).
const OLD_CLIENT_GOAL_DDL = `CREATE TABLE IF NOT EXISTS "client_goal" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "tenant_id"         TEXT NOT NULL,
  "client_index_id"   TEXT NOT NULL,
  "erp_customer_id"   TEXT NOT NULL,
  "goal_id"           TEXT NOT NULL,
  "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
  "urgency"           TEXT NOT NULL DEFAULT 'active_focus',
  "confidence"        TEXT NOT NULL DEFAULT 'unknown',
  "source"            TEXT NOT NULL DEFAULT 'system_inferred',
  "safety_flags_json" TEXT NOT NULL DEFAULT '[]',
  "notes"             TEXT,
  "status"            TEXT NOT NULL DEFAULT 'active',
  "created_at_utc"    TEXT NOT NULL,
  "updated_at_utc"    TEXT NOT NULL
)`

// Helper mirrors the PRAGMA-guard logic in scripts/migrate-app.mjs.
async function addColumnIfNotExists(
  client: ReturnType<typeof createClient>,
  table: string,
  column: string,
  columnDef: string,
) {
  const { rows } = await client.execute(`PRAGMA table_info("${table}")`)
  if (!rows.some((r) => r.name === column)) {
    await client.execute(`ALTER TABLE "${table}" ADD COLUMN ${column} ${columnDef}`)
  }
}

describe('Phase 4.2 additive ALTER migration', () => {
  it('adds is_primary column to an old-schema client_goal table', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(OLD_CLIENT_GOAL_DDL)

    await addColumnIfNotExists(client, 'client_goal', 'is_primary', 'INTEGER NOT NULL DEFAULT 0')

    const { rows } = await client.execute(`PRAGMA table_info("client_goal")`)
    const names = rows.map((r) => r.name as string)
    expect(names).toContain('is_primary')
    client.close()
  })

  it('adds trainer_sub_goal_ids_json column to an old-schema client_goal table', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(OLD_CLIENT_GOAL_DDL)

    await addColumnIfNotExists(client, 'client_goal', 'trainer_sub_goal_ids_json', `TEXT NOT NULL DEFAULT '[]'`)

    const { rows } = await client.execute(`PRAGMA table_info("client_goal")`)
    const names = rows.map((r) => r.name as string)
    expect(names).toContain('trainer_sub_goal_ids_json')
    client.close()
  })

  it('is idempotent — adding columns twice does not throw', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(OLD_CLIENT_GOAL_DDL)

    await addColumnIfNotExists(client, 'client_goal', 'is_primary', 'INTEGER NOT NULL DEFAULT 0')
    await addColumnIfNotExists(client, 'client_goal', 'trainer_sub_goal_ids_json', `TEXT NOT NULL DEFAULT '[]'`)
    // second run — guard should prevent errors
    await expect(
      (async () => {
        await addColumnIfNotExists(client, 'client_goal', 'is_primary', 'INTEGER NOT NULL DEFAULT 0')
        await addColumnIfNotExists(client, 'client_goal', 'trainer_sub_goal_ids_json', `TEXT NOT NULL DEFAULT '[]'`)
      })()
    ).resolves.not.toThrow()
    client.close()
  })

  it('backfill UPDATE sets is_primary=1 when goal_id matches client_index.primary_goal_id', async () => {
    const client = createClient({ url: ':memory:' })
    // Bootstrap minimal schema (new columns already present for simplicity)
    await client.execute(`CREATE TABLE "client_index" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenant_id" TEXT NOT NULL,
      "erp_customer_id" TEXT NOT NULL,
      "primary_goal_id" TEXT
    )`)
    await client.execute(`CREATE TABLE "client_goal" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenant_id" TEXT NOT NULL,
      "client_index_id" TEXT NOT NULL,
      "goal_id" TEXT NOT NULL,
      "is_primary" INTEGER NOT NULL DEFAULT 0,
      "updated_at_utc" TEXT NOT NULL DEFAULT ''
    )`)

    // Seed: one client_index with primary_goal_id = 'fat_loss'
    await client.execute(
      `INSERT INTO client_index (id, tenant_id, erp_customer_id, primary_goal_id)
       VALUES ('ci-1', 'tenant-a', 'ERP-1', 'fat_loss')`
    )
    // Seed: matching client_goal row (is_primary = 0)
    await client.execute(
      `INSERT INTO client_goal (id, tenant_id, client_index_id, goal_id, is_primary, updated_at_utc)
       VALUES ('cg-1', 'tenant-a', 'ci-1', 'fat_loss', 0, '2026-01-01T00:00:00')`
    )

    // Run the backfill UPDATE
    await client.execute(`
      UPDATE "client_goal"
      SET "is_primary" = 1, "updated_at_utc" = datetime('now')
      WHERE "is_primary" = 0
        AND EXISTS (
          SELECT 1 FROM "client_index" ci
          WHERE ci."id"              = "client_goal"."client_index_id"
            AND ci."tenant_id"       = "client_goal"."tenant_id"
            AND ci."primary_goal_id" = "client_goal"."goal_id"
        )
    `)

    const { rows } = await client.execute(
      `SELECT is_primary FROM client_goal WHERE id = 'cg-1'`
    )
    expect(rows[0].is_primary).toBe(1)
    client.close()
  })

  it('backfill UPDATE does not set is_primary=1 for a different tenant', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(`CREATE TABLE "client_index" (
      "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
      "erp_customer_id" TEXT NOT NULL, "primary_goal_id" TEXT
    )`)
    await client.execute(`CREATE TABLE "client_goal" (
      "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
      "client_index_id" TEXT NOT NULL, "goal_id" TEXT NOT NULL,
      "is_primary" INTEGER NOT NULL DEFAULT 0, "updated_at_utc" TEXT NOT NULL DEFAULT ''
    )`)

    // Tenant A owns the client_index row
    await client.execute(
      `INSERT INTO client_index (id, tenant_id, erp_customer_id, primary_goal_id)
       VALUES ('ci-a', 'tenant-a', 'ERP-1', 'fat_loss')`
    )
    // Tenant B has a goal row referencing ci-a (cross-tenant scenario that must NOT match)
    await client.execute(
      `INSERT INTO client_goal (id, tenant_id, client_index_id, goal_id, is_primary, updated_at_utc)
       VALUES ('cg-b', 'tenant-b', 'ci-a', 'fat_loss', 0, '2026-01-01T00:00:00')`
    )

    await client.execute(`
      UPDATE "client_goal"
      SET "is_primary" = 1, "updated_at_utc" = datetime('now')
      WHERE "is_primary" = 0
        AND EXISTS (
          SELECT 1 FROM "client_index" ci
          WHERE ci."id"              = "client_goal"."client_index_id"
            AND ci."tenant_id"       = "client_goal"."tenant_id"
            AND ci."primary_goal_id" = "client_goal"."goal_id"
        )
    `)

    const { rows } = await client.execute(
      `SELECT is_primary FROM client_goal WHERE id = 'cg-b'`
    )
    // tenant_id mismatch → backfill must not have touched this row
    expect(rows[0].is_primary).toBe(0)
    client.close()
  })

  it('backfill UPDATE is idempotent — running it twice does not error', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(`CREATE TABLE "client_index" (
      "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
      "erp_customer_id" TEXT NOT NULL, "primary_goal_id" TEXT
    )`)
    await client.execute(`CREATE TABLE "client_goal" (
      "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
      "client_index_id" TEXT NOT NULL, "goal_id" TEXT NOT NULL,
      "is_primary" INTEGER NOT NULL DEFAULT 0, "updated_at_utc" TEXT NOT NULL DEFAULT ''
    )`)
    await client.execute(
      `INSERT INTO client_index (id, tenant_id, erp_customer_id, primary_goal_id)
       VALUES ('ci-1', 'tenant-a', 'ERP-1', 'fat_loss')`
    )
    await client.execute(
      `INSERT INTO client_goal (id, tenant_id, client_index_id, goal_id, is_primary, updated_at_utc)
       VALUES ('cg-1', 'tenant-a', 'ci-1', 'fat_loss', 0, '2026-01-01T00:00:00')`
    )

    const backfillSql = `
      UPDATE "client_goal"
      SET "is_primary" = 1, "updated_at_utc" = datetime('now')
      WHERE "is_primary" = 0
        AND EXISTS (
          SELECT 1 FROM "client_index" ci
          WHERE ci."id"              = "client_goal"."client_index_id"
            AND ci."tenant_id"       = "client_goal"."tenant_id"
            AND ci."primary_goal_id" = "client_goal"."goal_id"
        )
    `
    await client.execute(backfillSql)
    await expect(client.execute(backfillSql)).resolves.not.toThrow()

    const { rows } = await client.execute(`SELECT is_primary FROM client_goal WHERE id = 'cg-1'`)
    expect(rows[0].is_primary).toBe(1)
    client.close()
  })
})

// ─── US-059 — additive ALTER migration (client_index.whatsapp_consent_state) ──

// Old schema: client_index WITHOUT the US-059 consent column (mirrors the
// shipped pre-US-059 DDL, minus unrelated columns not needed for this test).
const OLD_CLIENT_INDEX_DDL = `CREATE TABLE IF NOT EXISTS "client_index" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "tenant_id"       TEXT NOT NULL,
  "erp_customer_id" TEXT NOT NULL,
  "full_name"       TEXT NOT NULL,
  "phone_e164"      TEXT NOT NULL,
  "whatsapp_enabled" INTEGER NOT NULL DEFAULT 0,
  "status"          TEXT NOT NULL DEFAULT 'active',
  "created_at_utc"  TEXT NOT NULL,
  "updated_at_utc"  TEXT NOT NULL
)`

describe('US-059 additive ALTER migration', () => {
  it('adds whatsapp_consent_state column to an old-schema client_index table', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(OLD_CLIENT_INDEX_DDL)

    await addColumnIfNotExists(client, 'client_index', 'whatsapp_consent_state', `TEXT NOT NULL DEFAULT 'unknown'`)

    const { rows } = await client.execute(`PRAGMA table_info("client_index")`)
    const names = rows.map((r) => r.name as string)
    expect(names).toContain('whatsapp_consent_state')
    client.close()
  })

  it('is idempotent — adding the column twice does not throw', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(OLD_CLIENT_INDEX_DDL)

    await addColumnIfNotExists(client, 'client_index', 'whatsapp_consent_state', `TEXT NOT NULL DEFAULT 'unknown'`)
    await expect(
      addColumnIfNotExists(client, 'client_index', 'whatsapp_consent_state', `TEXT NOT NULL DEFAULT 'unknown'`),
    ).resolves.not.toThrow()
    client.close()
  })

  it('every existing row defaults to unknown — no separate backfill needed', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(OLD_CLIENT_INDEX_DDL)
    await client.execute(
      `INSERT INTO client_index (id, tenant_id, erp_customer_id, full_name, phone_e164, created_at_utc, updated_at_utc)
       VALUES ('ci-1', 'tenant-a', 'ERP-1', 'Ali Hassan', '+96170000001', '2026-01-01T00:00:00', '2026-01-01T00:00:00')`,
    )

    await addColumnIfNotExists(client, 'client_index', 'whatsapp_consent_state', `TEXT NOT NULL DEFAULT 'unknown'`)

    const { rows } = await client.execute(`SELECT whatsapp_consent_state FROM client_index WHERE id = 'ci-1'`)
    expect(rows[0].whatsapp_consent_state).toBe('unknown')
    client.close()
  })
})
