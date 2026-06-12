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
})
