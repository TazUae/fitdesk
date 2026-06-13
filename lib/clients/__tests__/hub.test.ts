/**
 * Integration tests for ClientRepository Phase 7 action-intent transitions:
 * completeActionIntent and dismissActionIntent.
 *
 * Uses the established temp-file SQLite harness from repository.test.ts —
 * real Drizzle transactions on a real SQLite file per test.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import { ClientRepository } from '@/lib/clients/repository'
import type { ClientCreateDraft } from '@/types/clients'

// ─── DDL (mirrors repository.test.ts) ────────────────────────────────────────

const CLIENT_TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
    "erp_customer_id" TEXT NOT NULL, "full_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL, "whatsapp_enabled" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active', "primary_goal_label" TEXT,
    "primary_goal_id" TEXT, "safety_state" TEXT NOT NULL DEFAULT 'clear',
    "onboarding_state" TEXT NOT NULL DEFAULT 'not_started',
    "billing_mode" TEXT NOT NULL DEFAULT 'unset',
    "payment_summary" TEXT NOT NULL DEFAULT 'unset',
    "next_session_at_utc" TEXT, "last_activity_at_utc" TEXT,
    "possible_duplicate_client_id" TEXT, "duplicate_override_reason" TEXT,
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_index_tenant_erp_idx"
    ON "client_index" ("tenant_id", "erp_customer_id")`,
  `CREATE TABLE IF NOT EXISTS "client_goal" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT NOT NULL, "erp_customer_id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL, "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
    "urgency" TEXT NOT NULL DEFAULT 'active_focus',
    "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL DEFAULT 'system_inferred',
    "safety_flags_json" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'active',
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_action_intent" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT NOT NULL, "erp_customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "source" TEXT NOT NULL DEFAULT 'system', "reason" TEXT,
    "due_at_utc" TEXT, "completed_at_utc" TEXT,
    "dismissed_at_utc" TEXT, "expires_at_utc" TEXT,
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_event" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT, "erp_customer_id" TEXT,
    "type" TEXT NOT NULL, "payload_json" TEXT NOT NULL DEFAULT '{}',
    "created_by_user_id" TEXT, "created_at_utc" TEXT NOT NULL
  )`,
]

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

const baseDraft: ClientCreateDraft = {
  tenantId:         TENANT_A,
  erpCustomerId:    'CUST-100',
  fullName:         'Sara Ahmad',
  phoneE164:        '+96170000001',
  whatsappEnabled:  true,
  primaryGoalLabel: 'Fat loss',
  primaryGoalId:    'fat_loss',
  goalId:           'fat_loss',
  subGoalIds:       [],
  goalUrgency:      'active_focus',
  goalConfidence:   'high',
  goalSource:       'trainer_manual',
  safetyFlags:      [],
  goalNotes:        null,
  createdByUserId:  'user-1',
}

let tempDir: string
let dbClient: ReturnType<typeof createClient>
let repo: ClientRepository

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-hub-test-'))
  const dbPath = join(tempDir, 'test.db')
  dbClient = createClient({ url: `file:${dbPath}` })
  for (const sql of CLIENT_TABLES_DDL) await dbClient.execute(sql)
  const db = drizzle(dbClient, { schema })
  repo = new ClientRepository(db)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedClient() {
  return repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
}

async function firstPendingIntentId(): Promise<string> {
  const { rows } = await dbClient.execute(
    `SELECT id FROM client_action_intent WHERE status = 'pending' LIMIT 1`,
  )
  return String(rows[0].id)
}

async function intentStatus(intentId: string): Promise<string> {
  const { rows } = await dbClient.execute(
    `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
  )
  return String(rows[0].status)
}

async function countEvents(type: string): Promise<number> {
  const { rows } = await dbClient.execute(
    `SELECT count(*) AS c FROM client_event WHERE type = '${type}'`,
  )
  return Number(rows[0].c)
}

// ─── completeActionIntent ─────────────────────────────────────────────────────

describe('completeActionIntent', () => {
  it('transitions a pending intent to completed and returns the updated row', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()

    const result = await repo.completeActionIntent({ tenantId: TENANT_A }, intentId)

    expect(result).not.toBeNull()
    expect(result?.status).toBe('completed')
    expect(result?.completedAtUtc).not.toBeNull()
    expect(result?.id).toBe(intentId)
  })

  it('sets completedAtUtc and updatedAtUtc in the database row', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()
    await repo.completeActionIntent({ tenantId: TENANT_A }, intentId)

    const { rows } = await dbClient.execute(
      `SELECT status, completed_at_utc, updated_at_utc FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('completed')
    expect(rows[0].completed_at_utc).not.toBeNull()
    expect(rows[0].updated_at_utc).not.toBeNull()
  })

  it('writes an action_intent.completed audit event in the same transaction', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()
    await repo.completeActionIntent({ tenantId: TENANT_A }, intentId)

    expect(await countEvents('action_intent.completed')).toBe(1)
  })

  it('removes the intent from listPendingActions after completion', async () => {
    const created = await seedClient()
    const intentId = await firstPendingIntentId()
    const beforeCount = (await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)).length

    await repo.completeActionIntent({ tenantId: TENANT_A }, intentId)

    const afterCount = (await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)).length
    expect(afterCount).toBe(beforeCount - 1)
  })

  it('returns null for an already-completed intent (no second transition)', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()
    await repo.completeActionIntent({ tenantId: TENANT_A }, intentId)

    const secondAttempt = await repo.completeActionIntent({ tenantId: TENANT_A }, intentId)
    expect(secondAttempt).toBeNull()

    // Verify no duplicate audit events
    expect(await countEvents('action_intent.completed')).toBe(1)
  })

  it('returns null and makes no mutation when tenantId does not own the intent', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()

    // Attempt from a different tenant
    const result = await repo.completeActionIntent({ tenantId: TENANT_B }, intentId)
    expect(result).toBeNull()

    // Original row must still be pending
    expect(await intentStatus(intentId)).toBe('pending')
    expect(await countEvents('action_intent.completed')).toBe(0)
  })

  it('returns null for a non-existent intentId', async () => {
    const result = await repo.completeActionIntent({ tenantId: TENANT_A }, 'does-not-exist')
    expect(result).toBeNull()
  })
})

// ─── dismissActionIntent ──────────────────────────────────────────────────────

describe('dismissActionIntent', () => {
  it('transitions a pending intent to dismissed and returns the updated row', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()

    const result = await repo.dismissActionIntent({ tenantId: TENANT_A }, intentId)

    expect(result).not.toBeNull()
    expect(result?.status).toBe('dismissed')
    expect(result?.dismissedAtUtc).not.toBeNull()
  })

  it('sets dismissedAtUtc and updatedAtUtc in the database row', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()
    await repo.dismissActionIntent({ tenantId: TENANT_A }, intentId)

    const { rows } = await dbClient.execute(
      `SELECT status, dismissed_at_utc, updated_at_utc FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('dismissed')
    expect(rows[0].dismissed_at_utc).not.toBeNull()
  })

  it('writes an action_intent.dismissed audit event', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()
    await repo.dismissActionIntent({ tenantId: TENANT_A }, intentId)

    expect(await countEvents('action_intent.dismissed')).toBe(1)
  })

  it('returns null for an already-dismissed intent', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()
    await repo.dismissActionIntent({ tenantId: TENANT_A }, intentId)

    const secondAttempt = await repo.dismissActionIntent({ tenantId: TENANT_A }, intentId)
    expect(secondAttempt).toBeNull()
    expect(await countEvents('action_intent.dismissed')).toBe(1)
  })

  it('returns null and makes no mutation when tenantId does not own the intent', async () => {
    await seedClient()
    const intentId = await firstPendingIntentId()

    const result = await repo.dismissActionIntent({ tenantId: TENANT_B }, intentId)
    expect(result).toBeNull()

    expect(await intentStatus(intentId)).toBe('pending')
    expect(await countEvents('action_intent.dismissed')).toBe(0)
  })

  it('returns null for a non-existent intentId', async () => {
    const result = await repo.dismissActionIntent({ tenantId: TENANT_A }, 'ghost-id')
    expect(result).toBeNull()
  })
})

// ─── Tenant guard ─────────────────────────────────────────────────────────────

describe('tenant guard', () => {
  it('completeActionIntent throws on empty tenantId', async () => {
    await expect(
      repo.completeActionIntent({ tenantId: '' }, 'any-id'),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })

  it('dismissActionIntent throws on empty tenantId', async () => {
    await expect(
      repo.dismissActionIntent({ tenantId: '  ' }, 'any-id'),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })
})
