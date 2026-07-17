/**
 * Phase 5 — isolated verification of the goal-system defense-in-depth partial
 * unique indexes (schema.ts / scripts/migrate-app.mjs).
 *
 * Runs entirely against a throwaway temp-file libSQL database (the ACTUAL
 * installed @libsql/client runtime), never a shared or production DB. Proves:
 *   1. the deployed engine supports partial (WHERE ...) unique indexes;
 *   2. the migration DDL is idempotent (IF NOT EXISTS, safe to re-run);
 *   3. the indexes enforce the intended active-goal invariants;
 *   4. archived rows do NOT block active reuse / reactivation.
 */

import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const CLIENT_GOAL_DDL = `CREATE TABLE IF NOT EXISTS "client_goal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "client_index_id" TEXT NOT NULL,
  "erp_customer_id" TEXT NOT NULL,
  "goal_id" TEXT NOT NULL,
  "is_primary" INTEGER NOT NULL DEFAULT 0,
  "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
  "trainer_sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
  "urgency" TEXT NOT NULL DEFAULT 'active_focus',
  "confidence" TEXT NOT NULL DEFAULT 'unknown',
  "source" TEXT NOT NULL DEFAULT 'system_inferred',
  "safety_flags_json" TEXT NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at_utc" TEXT NOT NULL,
  "updated_at_utc" TEXT NOT NULL
)`

// Exactly as declared in scripts/migrate-app.mjs.
const IDX_UNIQUENESS = `CREATE UNIQUE INDEX IF NOT EXISTS "client_goal_active_uniqueness"
  ON "client_goal" ("tenant_id", "client_index_id", "goal_id")
  WHERE "status" = 'active'`
const IDX_PRIMARY = `CREATE UNIQUE INDEX IF NOT EXISTS "client_goal_active_primary"
  ON "client_goal" ("tenant_id", "client_index_id")
  WHERE "status" = 'active' AND "is_primary" = 1`

let tempDir: string
let dbClient: ReturnType<typeof createClient>

async function insertGoal(over: Record<string, string | number>) {
  const row = {
    id: crypto.randomUUID(),
    tenant_id: 'T', client_index_id: 'C', erp_customer_id: 'E',
    goal_id: 'fat-loss', is_primary: 0, status: 'active',
    created_at_utc: 'now', updated_at_utc: 'now',
    ...over,
  }
  await dbClient.execute({
    sql: `INSERT INTO "client_goal"
      ("id","tenant_id","client_index_id","erp_customer_id","goal_id","is_primary","status","created_at_utc","updated_at_utc")
      VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [row.id, row.tenant_id, row.client_index_id, row.erp_customer_id, row.goal_id, row.is_primary, row.status, row.created_at_utc, row.updated_at_utc],
  })
  return row.id
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-idx-test-'))
  dbClient = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  await dbClient.execute(CLIENT_GOAL_DDL)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

describe('client_goal partial unique indexes — isolated engine verification', () => {
  it('the installed libSQL engine supports partial (WHERE) unique indexes', async () => {
    await expect(dbClient.execute(IDX_UNIQUENESS)).resolves.toBeDefined()
    await expect(dbClient.execute(IDX_PRIMARY)).resolves.toBeDefined()
  })

  it('migration DDL is idempotent (safe to re-run — IF NOT EXISTS)', async () => {
    await dbClient.execute(IDX_UNIQUENESS)
    await dbClient.execute(IDX_PRIMARY)
    // Re-running must not throw.
    await expect(dbClient.execute(IDX_UNIQUENESS)).resolves.toBeDefined()
    await expect(dbClient.execute(IDX_PRIMARY)).resolves.toBeDefined()
  })

  it('blocks a duplicate ACTIVE (tenant, client, goal)', async () => {
    await dbClient.execute(IDX_UNIQUENESS)
    await insertGoal({ goal_id: 'fat-loss', status: 'active', is_primary: 1 })
    await expect(insertGoal({ goal_id: 'fat-loss', status: 'active' })).rejects.toThrow()
  })

  it('ALLOWS multiple ARCHIVED rows for the same (tenant, client, goal)', async () => {
    await dbClient.execute(IDX_UNIQUENESS)
    await insertGoal({ goal_id: 'fat-loss', status: 'archived' })
    await expect(insertGoal({ goal_id: 'fat-loss', status: 'archived' })).resolves.toBeDefined()
  })

  it('archived history does NOT block a new active row for the same goal (reactivation/reuse)', async () => {
    await dbClient.execute(IDX_UNIQUENESS)
    await insertGoal({ goal_id: 'fat-loss', status: 'archived' })
    // A single active row alongside archived history is allowed.
    await expect(insertGoal({ goal_id: 'fat-loss', status: 'active', is_primary: 1 })).resolves.toBeDefined()
  })

  it('blocks a second ACTIVE PRIMARY for the same (tenant, client)', async () => {
    await dbClient.execute(IDX_PRIMARY)
    await insertGoal({ goal_id: 'fat-loss', status: 'active', is_primary: 1 })
    await expect(insertGoal({ goal_id: 'strength', status: 'active', is_primary: 1 })).rejects.toThrow()
  })

  it('allows an active primary alongside archived primaries', async () => {
    await dbClient.execute(IDX_PRIMARY)
    await insertGoal({ goal_id: 'fat-loss', status: 'archived', is_primary: 1 })
    await expect(insertGoal({ goal_id: 'strength', status: 'active', is_primary: 1 })).resolves.toBeDefined()
  })
})
