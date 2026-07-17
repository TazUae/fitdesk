/**
 * Production-representative migration tests for scripts/migrate-app.mjs.
 *
 * Unlike client-goal-indexes.test.ts (which pre-creates client_goal WITH
 * is_primary and can only prove the indexes work in isolation), these tests
 * spawn the ACTUAL migrate-app.mjs as a child process end-to-end, so they
 * exercise real statement ORDERING — the class of defect where the goal-system
 * partial unique indexes were created before the is_primary column existed.
 *
 * Every run targets a throwaway file: database created under the OS temp
 * directory, with synthetic local env only (file: URL + empty auth token), so
 * no network connection is attempted, no remote/Turso DB is contacted, and no
 * existing FitDesk database (/app/data, the repo, a Docker volume) is opened.
 */

import { createClient } from '@libsql/client'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const PROJECT_ROOT     = join(__dirname, '..', '..', '..')
const MIGRATION_SCRIPT  = join(PROJECT_ROOT, 'scripts', 'migrate-app.mjs')
const TMP_ROOT          = normalize(tmpdir())

let tempDir: string
let dbPath: string
let dbUrl: string

beforeEach(() => {
  tempDir = mkdtempSync(join(TMP_ROOT, 'fitdesk-migrate-test-'))
  dbPath  = join(tempDir, 'app.db')
  dbUrl   = `file:${dbPath}`
})

afterEach(() => {
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

interface MigrationResult { code: number | null; stdout: string; stderr: string }

/** Spawn the REAL migration script against this test's throwaway file DB. */
function runMigration(): Promise<MigrationResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MIGRATION_SCRIPT], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        // Synthetic, local-only. Explicitly override any inherited real values
        // so no remote URL or auth token is ever used and no network is attempted.
        DATABASE_URL:        dbUrl,
        DATABASE_AUTH_TOKEN: '',
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('exit', code => resolve({ code, stdout, stderr }))
  })
}

function openDb() { return createClient({ url: dbUrl }) }

async function clientGoalColumns(db: ReturnType<typeof createClient>): Promise<string[]> {
  const { rows } = await db.execute(`PRAGMA table_info("client_goal")`)
  return rows.map(r => String(r.name))
}

async function clientGoalIndexes(
  db: ReturnType<typeof createClient>,
): Promise<Record<string, string>> {
  const { rows } = await db.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='client_goal'`,
  )
  const out: Record<string, string> = {}
  for (const r of rows) out[String(r.name)] = r.sql === null ? '' : normSql(String(r.sql))
  return out
}

/** Collapse whitespace so index-SQL assertions are resilient to formatting. */
function normSql(sql: string): string { return sql.replace(/\s+/g, ' ').trim() }

async function count(db: ReturnType<typeof createClient>, table: string): Promise<number> {
  const { rows } = await db.execute(`SELECT COUNT(*) AS c FROM "${table}"`)
  return Number(rows[0].c)
}

// Old-shape client_goal exactly as migrate-app.mjs's own CREATE TABLE declares it —
// no is_primary, no trainer_sub_goal_ids_json (the legacy pre-upgrade state).
const LEGACY_CLIENT_GOAL_DDL = `CREATE TABLE "client_goal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "client_index_id" TEXT NOT NULL,
  "erp_customer_id" TEXT NOT NULL,
  "goal_id" TEXT NOT NULL,
  "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
  "urgency" TEXT NOT NULL DEFAULT 'active_focus',
  "confidence" TEXT NOT NULL DEFAULT 'unknown',
  "source" TEXT NOT NULL DEFAULT 'system_inferred',
  "safety_flags_json" TEXT NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at_utc" TEXT NOT NULL,
  "updated_at_utc" TEXT NOT NULL
)`

// Conflict fixtures need is_primary present up front so the ordering is not the
// variable under test — only the DATA conflict is. (trainer_sub_goal_ids_json is
// intentionally omitted so the migration's ALTER still runs against the fixture.)
const CONFLICT_CLIENT_GOAL_DDL = `CREATE TABLE "client_goal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "client_index_id" TEXT NOT NULL,
  "erp_customer_id" TEXT NOT NULL,
  "goal_id" TEXT NOT NULL,
  "is_primary" INTEGER NOT NULL DEFAULT 0,
  "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
  "urgency" TEXT NOT NULL DEFAULT 'active_focus',
  "confidence" TEXT NOT NULL DEFAULT 'unknown',
  "source" TEXT NOT NULL DEFAULT 'system_inferred',
  "safety_flags_json" TEXT NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at_utc" TEXT NOT NULL,
  "updated_at_utc" TEXT NOT NULL
)`

// Minimal client_index — the columns the is_primary backfill JOIN reads
// (id, tenant_id, primary_goal_id) PLUS the columns the migration's own
// client_index indexes reference (erp_customer_id, phone_e164, status,
// updated_at_utc), so that migrate-app.mjs's CREATE INDEX IF NOT EXISTS
// statements on client_index succeed against this pre-existing fixture table.
const MINIMAL_CLIENT_INDEX_DDL = `CREATE TABLE "client_index" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "erp_customer_id" TEXT,
  "phone_e164" TEXT,
  "status" TEXT,
  "primary_goal_id" TEXT,
  "updated_at_utc" TEXT
)`

async function insertLegacyGoal(
  db: ReturnType<typeof createClient>,
  over: { id: string; goalId: string; status?: string },
) {
  await db.execute({
    sql: `INSERT INTO "client_goal"
      ("id","tenant_id","client_index_id","erp_customer_id","goal_id","status","created_at_utc","updated_at_utc")
      VALUES (?,?,?,?,?,?,?,?)`,
    args: [over.id, 'T1', 'C1', 'CUST-1', over.goalId, over.status ?? 'active', 'now', 'now'],
  })
}

async function insertConflictGoal(
  db: ReturnType<typeof createClient>,
  over: { id: string; goalId: string; isPrimary: number; status?: string },
) {
  await db.execute({
    sql: `INSERT INTO "client_goal"
      ("id","tenant_id","client_index_id","erp_customer_id","goal_id","is_primary","status","created_at_utc","updated_at_utc")
      VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [over.id, 'T1', 'C1', 'CUST-1', over.goalId, over.isPrimary, over.status ?? 'active', 'now', 'now'],
  })
}

describe('migrate-app.mjs — end-to-end ordering & idempotency (real child process)', () => {
  it('A. fresh empty database: migrates clean and creates both goal indexes after is_primary', async () => {
    const res = await runMigration()

    // The exact defect this reordering fixes must not occur.
    expect(res.stderr).not.toMatch(/no such column: is_primary/i)
    expect(res.code).toBe(0)

    const db = openDb()
    try {
      const cols = await clientGoalColumns(db)
      expect(cols).toContain('is_primary')
      expect(cols).toContain('trainer_sub_goal_ids_json')
      expect(cols).toContain('sub_goal_ids_json')

      const idx = await clientGoalIndexes(db)
      expect(Object.keys(idx)).toContain('client_goal_active_uniqueness')
      expect(Object.keys(idx)).toContain('client_goal_active_primary')

      // Exact names, columns, predicates (whitespace-normalized; UNIQUE preserved;
      // IF NOT EXISTS is not retained by SQLite in sqlite_master.sql).
      expect(idx['client_goal_active_uniqueness']).toContain('UNIQUE INDEX "client_goal_active_uniqueness"')
      expect(idx['client_goal_active_uniqueness']).toContain('("tenant_id", "client_index_id", "goal_id")')
      expect(idx['client_goal_active_uniqueness']).toContain(`WHERE "status" = 'active'`)

      expect(idx['client_goal_active_primary']).toContain('UNIQUE INDEX "client_goal_active_primary"')
      expect(idx['client_goal_active_primary']).toContain('("tenant_id", "client_index_id")')
      expect(idx['client_goal_active_primary']).toContain(`WHERE "status" = 'active' AND "is_primary" = 1`)
    } finally {
      db.close()
    }
  }, 30000)

  it('B. idempotent second run: exit 0, each target index present exactly once, no duplicate errors', async () => {
    const first = await runMigration()
    expect(first.code).toBe(0)

    const second = await runMigration()
    expect(second.code).toBe(0)
    expect(second.stderr).not.toMatch(/already exists|duplicate column|failed/i)

    const db = openDb()
    try {
      const { rows } = await db.execute(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='client_goal'`,
      )
      const names = rows.map(r => String(r.name))
      expect(names.filter(n => n === 'client_goal_active_uniqueness')).toHaveLength(1)
      expect(names.filter(n => n === 'client_goal_active_primary')).toHaveLength(1)
    } finally {
      db.close()
    }
  }, 30000)

  it('C. legacy upgrade: columns added, is_primary backfilled, indexes created, valid rows preserved', async () => {
    const seed = openDb()
    try {
      await seed.execute(LEGACY_CLIENT_GOAL_DDL)
      await seed.execute(MINIMAL_CLIENT_INDEX_DDL)
      await seed.execute({
        sql: `INSERT INTO "client_index" ("id","tenant_id","primary_goal_id") VALUES (?,?,?)`,
        args: ['C1', 'T1', 'fat-loss'],
      })
      // One row matches the client's primary_goal_id (should become is_primary=1
      // after backfill); one supporting goal (should stay is_primary=0). Both valid.
      await insertLegacyGoal(seed, { id: 'g-primary', goalId: 'fat-loss' })
      await insertLegacyGoal(seed, { id: 'g-support', goalId: 'strength' })
    } finally {
      seed.close()
    }

    const res = await runMigration()
    expect(res.stderr).not.toMatch(/no such column/i)
    expect(res.code).toBe(0)

    const db = openDb()
    try {
      const cols = await clientGoalColumns(db)
      expect(cols).toContain('is_primary')
      expect(cols).toContain('trainer_sub_goal_ids_json')

      // No rows removed by the upgrade.
      expect(await count(db, 'client_goal')).toBe(2)

      // Backfill applied deterministically: the primary-matching row is now primary.
      const { rows } = await db.execute(
        `SELECT goal_id, is_primary FROM "client_goal" ORDER BY goal_id`,
      )
      const primaryByGoal = Object.fromEntries(rows.map(r => [String(r.goal_id), Number(r.is_primary)]))
      expect(primaryByGoal['fat-loss']).toBe(1)
      expect(primaryByGoal['strength']).toBe(0)

      const idx = await clientGoalIndexes(db)
      expect(Object.keys(idx)).toContain('client_goal_active_uniqueness')
      expect(Object.keys(idx)).toContain('client_goal_active_primary')
    } finally {
      db.close()
    }
  }, 30000)

  it('D. duplicate active goal conflict: non-zero exit, no repair/deletion, uniqueness index not created', async () => {
    const seed = openDb()
    try {
      await seed.execute(CONFLICT_CLIENT_GOAL_DDL)
      // Two ACTIVE rows for the same (tenant, client, goal) — violates uniqueness.
      await insertConflictGoal(seed, { id: 'dup-1', goalId: 'fat-loss', isPrimary: 0 })
      await insertConflictGoal(seed, { id: 'dup-2', goalId: 'fat-loss', isPrimary: 0 })
    } finally {
      seed.close()
    }

    const res = await runMigration()
    expect(res.code).not.toBe(0)
    expect(res.stderr).toMatch(/goal-system index creation failed/i)

    const db = openDb()
    try {
      // No silent repair or deletion: both conflicting rows remain.
      expect(await count(db, 'client_goal')).toBe(2)
      const { rows } = await db.execute(
        `SELECT COUNT(*) AS c FROM "client_goal" WHERE goal_id='fat-loss' AND status='active'`,
      )
      expect(Number(rows[0].c)).toBe(2)

      // The uniqueness index must NOT have been (falsely) created.
      const idx = await clientGoalIndexes(db)
      expect(Object.keys(idx)).not.toContain('client_goal_active_uniqueness')
    } finally {
      db.close()
    }
  }, 30000)

  it('E. multiple active primary conflict: non-zero exit, no repair/deletion, primary index not created', async () => {
    const seed = openDb()
    try {
      await seed.execute(CONFLICT_CLIENT_GOAL_DDL)
      // Two ACTIVE PRIMARY rows for one (tenant, client) with DIFFERENT goals:
      // uniqueness is satisfied (distinct goals) but the primary index is violated.
      await insertConflictGoal(seed, { id: 'pri-1', goalId: 'fat-loss', isPrimary: 1 })
      await insertConflictGoal(seed, { id: 'pri-2', goalId: 'strength', isPrimary: 1 })
    } finally {
      seed.close()
    }

    const res = await runMigration()
    expect(res.code).not.toBe(0)
    expect(res.stderr).toMatch(/goal-system index creation failed/i)

    const db = openDb()
    try {
      // No silent repair or deletion: both primaries remain, unmodified.
      expect(await count(db, 'client_goal')).toBe(2)
      const { rows } = await db.execute(
        `SELECT COUNT(*) AS c FROM "client_goal" WHERE is_primary=1 AND status='active'`,
      )
      expect(Number(rows[0].c)).toBe(2)

      // The primary index must NOT have been (falsely) created.
      const idx = await clientGoalIndexes(db)
      expect(Object.keys(idx)).not.toContain('client_goal_active_primary')
    } finally {
      db.close()
    }
  }, 30000)

  it('F. temp-database safety: db path is under the OS temp dir, is a file: URL, and never a real FitDesk DB', () => {
    expect(dbUrl.startsWith('file:')).toBe(true)
    expect(normalize(dbPath).startsWith(TMP_ROOT)).toBe(true)
    expect(normalize(tempDir).startsWith(TMP_ROOT)).toBe(true)

    const lowered = dbPath.toLowerCase().replace(/\\/g, '/')
    expect(lowered).not.toContain('/app/data')
    expect(lowered).not.toContain('fitdesk-migration-hardening/')  // not the repo worktree
    expect(lowered).not.toContain('/dev/axis-erp/fitdesk/')        // not the source checkout
    expect(lowered).not.toMatch(/\.db-volume|docker/)
  })
})
