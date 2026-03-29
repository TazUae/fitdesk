/**
 * Better Auth + trainer_mapping migration script.
 *
 * Run with: node scripts/migrate.mjs
 *
 * Uses @libsql/client directly (same driver as the app) so it works
 * whether DATABASE_URL points to a local file or a Turso instance.
 *
 * Safe to re-run — all statements use CREATE TABLE IF NOT EXISTS.
 */

import { createClient } from '@libsql/client'

const DATABASE_URL = process.env.DATABASE_URL ?? 'file:./auth.db'
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN

console.log(`\nConnecting to: ${DATABASE_URL}`)

const client = createClient({
  url: DATABASE_URL,
  authToken: DATABASE_AUTH_TOKEN,
})

// ─── Schema derived from getAuthTables() output ───────────────────────────────
//
// Better Auth + drizzle-adapter (sqlite, provider: 'sqlite') uses camelCase
// column names matching the fieldName values returned by getAuthTables().
// Types: string→TEXT  boolean→INTEGER  date→INTEGER  (Better Auth convention)
//
// Tables: user, session, account, verification + trainer_mapping (custom)

const statements = [
  // ── user ──────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS user (
    id             TEXT    PRIMARY KEY,
    name           TEXT    NOT NULL,
    email          TEXT    NOT NULL UNIQUE,
    emailVerified  INTEGER NOT NULL DEFAULT 0,
    image          TEXT,
    createdAt      INTEGER NOT NULL,
    updatedAt      INTEGER NOT NULL,
    phone          TEXT
  )`,

  // ── session ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS session (
    id          TEXT    PRIMARY KEY,
    expiresAt   INTEGER NOT NULL,
    token       TEXT    NOT NULL UNIQUE,
    createdAt   INTEGER NOT NULL,
    updatedAt   INTEGER NOT NULL,
    ipAddress   TEXT,
    userAgent   TEXT,
    userId      TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE
  )`,

  // ── account ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS account (
    id                     TEXT    PRIMARY KEY,
    accountId              TEXT    NOT NULL,
    providerId             TEXT    NOT NULL,
    userId                 TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    accessToken            TEXT,
    refreshToken           TEXT,
    idToken                TEXT,
    accessTokenExpiresAt   INTEGER,
    refreshTokenExpiresAt  INTEGER,
    scope                  TEXT,
    password               TEXT,
    createdAt              INTEGER NOT NULL,
    updatedAt              INTEGER NOT NULL
  )`,

  // ── verification ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS verification (
    id          TEXT    PRIMARY KEY,
    identifier  TEXT    NOT NULL,
    value       TEXT    NOT NULL,
    expiresAt   INTEGER NOT NULL,
    createdAt   INTEGER,
    updatedAt   INTEGER
  )`,

  // ── trainer_mapping (custom FitDesk table) ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS trainer_mapping (
    user_id        TEXT PRIMARY KEY NOT NULL,
    erp_trainer_id TEXT NOT NULL,
    created_at     TEXT NOT NULL
  )`,

  // ── trainer_whatsapp_connection ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS trainer_whatsapp_connection (
    id                  TEXT    PRIMARY KEY NOT NULL,
    trainerId           TEXT    NOT NULL UNIQUE,
    instanceName        TEXT    NOT NULL,
    instanceId          TEXT,
    status              TEXT    NOT NULL DEFAULT 'not_connected',
    phoneNumber         TEXT,
    displayName         TEXT,
    qrCode              TEXT,
    pairingCode         TEXT,
    lastError           TEXT,
    lastConnectedAt     INTEGER,
    lastDisconnectedAt  INTEGER,
    createdAt           INTEGER NOT NULL,
    updatedAt           INTEGER NOT NULL
  )`,
]

// ─── Run migrations ───────────────────────────────────────────────────────────

let created = 0
let skipped = 0

for (const sql of statements) {
  // Extract table name from CREATE TABLE IF NOT EXISTS <name>
  const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)
  const tableName = match?.[1] ?? '?'

  try {
    await client.execute(sql)
    console.log(`  ✓  ${tableName}`)
    created++
  } catch (err) {
    console.error(`  ✗  ${tableName}: ${err.message}`)
    process.exit(1)
  }
}

// ─── Verify ───────────────────────────────────────────────────────────────────

console.log('\nVerifying tables...')

const { rows } = await client.execute(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
)

const tables = rows.map(r => r.name)
console.log('\nTables in database:', tables.join(', '))

const required = ['user', 'session', 'account', 'verification', 'trainer_mapping', 'trainer_whatsapp_connection']
const missing = required.filter(t => !tables.includes(t))

if (missing.length > 0) {
  console.error('\n✗ Missing tables:', missing.join(', '))
  process.exit(1)
}

// ─── Verify phone column on user ──────────────────────────────────────────────

const { rows: cols } = await client.execute(`PRAGMA table_info(user)`)
const colNames = cols.map(c => c.name)
console.log('\nuser columns:', colNames.join(', '))

if (!colNames.includes('phone')) {
  console.error('\n✗ phone column missing from user table')
  process.exit(1)
}

console.log('\n✓ All required tables and columns present.')
console.log('✓ Migration complete.\n')

client.close()
