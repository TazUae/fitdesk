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
]

for (const sql of statements) {
  try {
    await client.execute(sql)
  } catch (err) {
    console.error('[app-migration] statement failed:', err.message)
    process.exit(1)
  }
}

console.log('\nVerifying app tables...')
const { rows } = await client.execute(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
)
const tables = rows.map((r) => r.name)

if (!tables.includes('WorkspaceProvisioning')) {
  console.error('\n[app-migration] missing required table: WorkspaceProvisioning')
  process.exit(1)
}

console.log('✓ WorkspaceProvisioning table is present')
console.log('✓ App migration complete.\n')
client.close()
