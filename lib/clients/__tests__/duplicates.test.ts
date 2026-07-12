/**
 * Tenant-scoped duplicate detection tests.
 *
 * Uses temp-file SQLite (not :memory:) so Drizzle transactions and selects
 * share the same persistent database within each test.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import { ClientRepository } from '@/lib/clients/repository'
import { findDuplicatesByPhone } from '@/lib/clients/duplicates'
import type { ClientCreateDraft } from '@/types/clients'

const CLIENT_TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "erp_customer_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "whatsapp_enabled" INTEGER NOT NULL DEFAULT 0,
    "whatsapp_consent_state" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'active',
    "primary_goal_label" TEXT,
    "primary_goal_id" TEXT,
    "safety_state" TEXT NOT NULL DEFAULT 'clear',
    "onboarding_state" TEXT NOT NULL DEFAULT 'not_started',
    "billing_mode" TEXT NOT NULL DEFAULT 'unset',
    "payment_summary" TEXT NOT NULL DEFAULT 'unset',
    "next_session_at_utc" TEXT,
    "last_activity_at_utc" TEXT,
    "possible_duplicate_client_id" TEXT,
    "duplicate_override_reason" TEXT,
    "created_at_utc" TEXT NOT NULL,
    "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_index_tenant_erp_idx"
    ON "client_index" ("tenant_id", "erp_customer_id")`,
  `CREATE TABLE IF NOT EXISTS "client_goal" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT NOT NULL, "erp_customer_id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL, "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
    "urgency" TEXT NOT NULL DEFAULT 'active_focus', "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL DEFAULT 'system_inferred', "safety_flags_json" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'active',
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_action_intent" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT NOT NULL, "erp_customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal', "source" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT, "due_at_utc" TEXT, "completed_at_utc" TEXT,
    "dismissed_at_utc" TEXT, "expires_at_utc" TEXT,
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_event" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT, "erp_customer_id" TEXT, "type" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL DEFAULT '{}', "created_by_user_id" TEXT,
    "created_at_utc" TEXT NOT NULL
  )`,
]

let tempDir: string
let dbClient: ReturnType<typeof createClient>
let repo: ClientRepository

const TENANT_A = 'tenant-dup-a'
const TENANT_B = 'tenant-dup-b'
const SHARED_PHONE = '+96170555999'

const draftA: ClientCreateDraft = {
  tenantId:         TENANT_A,
  erpCustomerId:    'ERP-DUP-001',
  fullName:         'Ali Hassan',
  phoneE164:        SHARED_PHONE,
  whatsappEnabled:  false,
  primaryGoalLabel: null,
  primaryGoalId:    null,
  goalId:           null,
  subGoalIds:       [],
  goalUrgency:      null,
  goalConfidence:   'unknown',
  goalSource:       'system_inferred',
  safetyFlags:      [],
  goalNotes:        null,
  createdByUserId:  null,
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-dup-test-'))
  const dbPath = join(tempDir, 'test.db')
  dbClient = createClient({ url: `file:${dbPath}` })
  for (const sql of CLIENT_TABLES_DDL) {
    await dbClient.execute(sql)
  }
  const db = drizzle(dbClient, { schema })
  repo = new ClientRepository(db)
})

afterEach(() => {
  dbClient.close()
  // On Windows, libsql may hold a file lock briefly after close().
  // Suppress cleanup errors — temp files in %TEMP% are harmless.
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

describe('findDuplicatesByPhone', () => {
  it('returns empty array when no match exists', async () => {
    const results = await findDuplicatesByPhone(repo, { tenantId: TENANT_A }, SHARED_PHONE)
    expect(results).toEqual([])
  })

  it('returns a match with exact_phone type and high confidence', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, draftA)

    const results = await findDuplicatesByPhone(repo, { tenantId: TENANT_A }, SHARED_PHONE)

    expect(results.length).toBe(1)
    expect(results[0].matchType).toBe('exact_phone')
    expect(results[0].confidence).toBe('high')
    expect(results[0].phoneE164).toBe(SHARED_PHONE)
    expect(results[0].fullName).toBe('Ali Hassan')
  })

  it('does NOT return cross-tenant matches — tenant isolation enforced', async () => {
    await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...draftA, tenantId: TENANT_B, erpCustomerId: 'ERP-DUP-002' },
    )

    // Tenant A sees zero duplicates — tenant B's record must not appear
    const results = await findDuplicatesByPhone(repo, { tenantId: TENANT_A }, SHARED_PHONE)
    expect(results.length).toBe(0)
  })

  it('returns multiple matches if the same phone appears twice in the same tenant', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, draftA)
    await repo.createClientRow(
      { tenantId: TENANT_A },
      { ...draftA, erpCustomerId: 'ERP-DUP-003', fullName: 'Ali Hassan (copy)' },
    )

    const results = await findDuplicatesByPhone(repo, { tenantId: TENANT_A }, SHARED_PHONE)
    expect(results.length).toBe(2)
    expect(results.every((r) => r.matchType === 'exact_phone')).toBe(true)
  })
})
