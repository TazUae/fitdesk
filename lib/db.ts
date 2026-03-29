import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './db/schema'

/**
 * Auth database — SQLite via LibSQL.
 *
 * Local:      DATABASE_URL=file:./auth.db   (file in project root)
 * Production: DATABASE_URL=libsql://your-db.turso.io  +  DATABASE_AUTH_TOKEN=...
 *
 * This database stores auth data (users, sessions, accounts) and the
 * trainer_mapping table that bridges Better Auth users ↔ ERPNext Trainer docnames.
 * All business data lives in ERPNext.
 */
const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./auth.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
