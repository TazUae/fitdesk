/**
 * FitDesk app schema migration script.
 *
 * Run with: node scripts/migrate-app.mjs
 *
 * This script is intentionally separate from Better Auth migration logic.
 * It creates app-level tables used by FitDesk runtime provisioning flows.
 *
 * Safe to re-run — all statements use CREATE TABLE/INDEX IF NOT EXISTS.
 */

import { createClient } from '@libsql/client'

const DATABASE_URL = process.env.DATABASE_URL ?? 'file:./auth.db'
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN

console.log(`\nConnecting to: ${DATABASE_URL}`)

const client = createClient({
  url: DATABASE_URL,
  authToken: DATABASE_AUTH_TOKEN,
})

const statements = [
  // ── WorkspaceProvisioning (existing) ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "WorkspaceProvisioning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tenantId" TEXT,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "lastSyncedAt" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "WorkspaceProvisioning_userId_idx" ON "WorkspaceProvisioning"("userId")`,
  `CREATE INDEX IF NOT EXISTS "WorkspaceProvisioning_jobId_idx" ON "WorkspaceProvisioning"("jobId")`,

  // ── Client Management v1.2.1 — additive enrichment tables ──────────────────
  // All new tables are additive. No ALTER, DROP, or data deletion allowed.
  // Every table enforces tenant isolation via tenant_id.
  // Timestamps: ISO-8601 UTC TEXT. Arrays: *_json TEXT columns.
  // See: docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md

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

  // ── Billing Phase B1 — package_template ────────────────────────────────────
  // Trainer-facing reusable package template (the "catalog" concept).
  // Immutable once first_sold_at_utc is set.
  // price_amount in minor currency units (e.g. cents).
  // CHECK constraints enforce the canonical taxonomy vocabulary.
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

  // ── Billing Phase B3a — client_package_purchase ──────────────────────────
  // One row per package sold to a client.
  // template_snapshot_json is written once at purchase and never rewritten.
  // Two orthogonal status axes: payment_status (financial) + package_status (lifecycle).
  // json_valid() requires SQLite JSON1 extension (compiled in libsql by default).
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

for (const sql of statements) {
  try {
    await client.execute(sql)
  } catch (err) {
    console.error('[app-migration] statement failed:', err.message)
    process.exit(1)
  }
}

// ── Phase 4.2 — additive column migrations (PRAGMA-guarded) ────────────────
//
// SQLite has no ADD COLUMN IF NOT EXISTS.
// We use PRAGMA table_info to check for column existence before each ALTER.
// Safe to re-run: the check prevents duplicate-column errors.

async function columnExists(columnName) {
  const { rows } = await client.execute(`PRAGMA table_info("client_goal")`)
  return rows.some(r => r.name === columnName)
}

if (!(await columnExists('is_primary'))) {
  try {
    await client.execute(
      `ALTER TABLE "client_goal" ADD COLUMN "is_primary" INTEGER NOT NULL DEFAULT 0`
    )
    console.log('✓ client_goal.is_primary column added')
  } catch (err) {
    console.error('[app-migration] ALTER client_goal (is_primary) failed:', err.message)
    process.exit(1)
  }
} else {
  console.log('✓ client_goal.is_primary already present')
}

if (!(await columnExists('trainer_sub_goal_ids_json'))) {
  try {
    await client.execute(
      `ALTER TABLE "client_goal" ADD COLUMN "trainer_sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]'`
    )
    console.log('✓ client_goal.trainer_sub_goal_ids_json column added')
  } catch (err) {
    console.error('[app-migration] ALTER client_goal (trainer_sub_goal_ids_json) failed:', err.message)
    process.exit(1)
  }
} else {
  console.log('✓ client_goal.trainer_sub_goal_ids_json already present')
}

// Backfill: mark existing client_goal rows as primary when goal_id matches
// client_index.primary_goal_id. Tenant-correlated, idempotent (WHERE is_primary = 0).
try {
  await client.execute(`
    UPDATE "client_goal"
    SET "is_primary" = 1,
        "updated_at_utc" = datetime('now')
    WHERE "is_primary" = 0
      AND EXISTS (
        SELECT 1 FROM "client_index" ci
        WHERE ci."id"              = "client_goal"."client_index_id"
          AND ci."tenant_id"       = "client_goal"."tenant_id"
          AND ci."primary_goal_id" = "client_goal"."goal_id"
      )
  `)
  console.log('✓ client_goal.is_primary backfill complete')
} catch (err) {
  console.error('[app-migration] is_primary backfill failed:', err.message)
  process.exit(1)
}

console.log('\nVerifying app tables...')
const { rows } = await client.execute(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
)
const tables = rows.map((r) => r.name)

const requiredTables = [
  'WorkspaceProvisioning',
  'client_index',
  'client_goal',
  'client_action_intent',
  'client_event',
  'package_template',
  'client_package_purchase',
]

const missing = requiredTables.filter((t) => !tables.includes(t))
if (missing.length > 0) {
  console.error('\n[app-migration] missing required tables:', missing.join(', '))
  process.exit(1)
}

for (const t of requiredTables) {
  console.log(`✓ ${t} table is present`)
}
console.log('✓ App migration complete.\n')
client.close()
