/**
 * Integration tests for ClientRepository.
 *
 * Uses a unique temp-file SQLite database per test so Drizzle transactions
 * and direct select/insert operations all share the same persistent connection.
 * (@libsql/client :memory: uses separate connections per request, so DDL applied
 * via client.execute() is not visible inside subsequent Drizzle transactions.)
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

// ─── Setup ────────────────────────────────────────────────────────────────────

const CLIENT_TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "erp_customer_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "whatsapp_enabled" INTEGER NOT NULL DEFAULT 0,
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
  `CREATE INDEX IF NOT EXISTS "client_index_tenant_phone_idx"
    ON "client_index" ("tenant_id", "phone_e164")`,
  `CREATE INDEX IF NOT EXISTS "client_index_tenant_status_idx"
    ON "client_index" ("tenant_id", "status")`,
  `CREATE TABLE IF NOT EXISTS "client_goal" (
    "id"                        TEXT NOT NULL PRIMARY KEY,
    "tenant_id"                 TEXT NOT NULL,
    "client_index_id"           TEXT NOT NULL,
    "erp_customer_id"           TEXT NOT NULL,
    "goal_id"                   TEXT NOT NULL,
    "is_primary"                INTEGER NOT NULL DEFAULT 0,
    "sub_goal_ids_json"         TEXT NOT NULL DEFAULT '[]',
    "trainer_sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
    "urgency"                   TEXT NOT NULL DEFAULT 'active_focus',
    "confidence"                TEXT NOT NULL DEFAULT 'unknown',
    "source"                    TEXT NOT NULL DEFAULT 'system_inferred',
    "safety_flags_json"         TEXT NOT NULL DEFAULT '[]',
    "notes"                     TEXT,
    "status"                    TEXT NOT NULL DEFAULT 'active',
    "created_at_utc"            TEXT NOT NULL,
    "updated_at_utc"            TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_action_intent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT NOT NULL,
    "erp_customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "source" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT,
    "due_at_utc" TEXT,
    "completed_at_utc" TEXT,
    "dismissed_at_utc" TEXT,
    "expires_at_utc" TEXT,
    "created_at_utc" TEXT NOT NULL,
    "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "client_index_id" TEXT,
    "erp_customer_id" TEXT,
    "type" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL DEFAULT '{}',
    "created_by_user_id" TEXT,
    "created_at_utc" TEXT NOT NULL
  )`,
]

let tempDir: string
let dbClient: ReturnType<typeof createClient>
let repo: ClientRepository

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'
const ERP_ID_1 = 'ERP-CUST-0001'
const ERP_ID_2 = 'ERP-CUST-0002'

const baseDraft: ClientCreateDraft = {
  tenantId:         TENANT_A,
  erpCustomerId:    ERP_ID_1,
  fullName:         'Sara Ahmad',
  phoneE164:        '+96170000001',
  whatsappEnabled:  true,
  primaryGoalLabel: 'Weight loss',
  primaryGoalId:    'goal-wl',
  goalId:           'goal-wl',
  isPrimary:        true,
  subGoalIds:       [],
  trainerSubGoalIds: [],
  goalUrgency:      'active_focus',
  goalConfidence:   'high',
  goalSource:       'trainer_manual',
  safetyFlags:      [],
  goalNotes:        null,
  createdByUserId:  'user-trainer-1',
}

beforeEach(async () => {
  // Use a unique temp file so all connections (DDL, Drizzle tx, select) share the same DB.
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-repo-test-'))
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

// ─── Tenant guard tests ───────────────────────────────────────────────────────

describe('tenant isolation guard', () => {
  it('throws when tenantId is an empty string', async () => {
    await expect(
      repo.listClients({ tenantId: '' }),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })

  it('throws when tenantId is whitespace-only', async () => {
    await expect(
      repo.findClientByErpId({ tenantId: '   ' }, ERP_ID_1),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })
})

// ─── Create and read ──────────────────────────────────────────────────────────

describe('createClientRow', () => {
  it('returns a ClientCreateResult with all four record types', async () => {
    const result = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    expect(result.clientIndex.id).toBeTruthy()
    expect(result.clientIndex.erpCustomerId).toBe(ERP_ID_1)
    expect(result.clientIndex.fullName).toBe('Sara Ahmad')
    expect(result.clientIndex.status).toBe('active')

    expect(result.goal).not.toBeNull()
    expect(result.goal?.goalId).toBe('goal-wl')
    expect(result.goal?.subGoalIds).toEqual([])

    expect(result.actions.length).toBeGreaterThan(0)
    expect(result.actions.every((a) => a.status === 'pending')).toBe(true)

    expect(result.event.type).toBe('client.created')
  })

  it('creates no goal row when goalId is null', async () => {
    const noGoalDraft: ClientCreateDraft = { ...baseDraft, goalId: null, subGoalIds: [] }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, noGoalDraft)
    expect(result.goal).toBeNull()
  })

  it('created client is immediately visible in listClients', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const list = await repo.listClients({ tenantId: TENANT_A })
    expect(list.length).toBe(1)
    expect(list[0].erpCustomerId).toBe(ERP_ID_1)
  })

  it('created client is findable by erpCustomerId', async () => {
    const result = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const found = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    expect(found).not.toBeNull()
    expect(found?.id).toBe(result.clientIndex.id)
  })
})

// ─── findClientById ───────────────────────────────────────────────────────────

describe('findClientById', () => {
  it('returns the client when found in the correct tenant', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const found = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)

    expect(found).not.toBeNull()
    expect(found?.id).toBe(created.clientIndex.id)
    expect(found?.erpCustomerId).toBe(ERP_ID_1)
    expect(found?.fullName).toBe('Sara Ahmad')
    expect(found?.tenantId).toBe(TENANT_A)
  })

  it('returns null when the id is correct but belongs to a different tenant (cross-tenant isolation)', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )

    const found = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)

    expect(found).toBeNull()
  })

  it('returns null for an unknown client id', async () => {
    const found = await repo.findClientById({ tenantId: TENANT_A }, 'nonexistent-id-000')

    expect(found).toBeNull()
  })

  it('throws when tenantId is blank', async () => {
    await expect(
      repo.findClientById({ tenantId: '' }, 'some-id'),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })
})

// ─── Tenant isolation ─────────────────────────────────────────────────────────

describe('tenant isolation', () => {
  it('tenant A cannot read tenant B rows', async () => {
    await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )

    const listA = await repo.listClients({ tenantId: TENANT_A })
    expect(listA.length).toBe(0)

    const found = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_2)
    expect(found).toBeNull()
  })

  it('each tenant sees only its own rows when both have clients', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )

    const listA = await repo.listClients({ tenantId: TENANT_A })
    const listB = await repo.listClients({ tenantId: TENANT_B })

    expect(listA.length).toBe(1)
    expect(listA[0].tenantId).toBe(TENANT_A)
    expect(listB.length).toBe(1)
    expect(listB[0].tenantId).toBe(TENANT_B)
  })
})

// ─── Unique constraint ────────────────────────────────────────────────────────

describe('unique (tenantId, erpCustomerId) constraint', () => {
  it('throws on duplicate (tenantId, erpCustomerId) insert', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.createClientRow({ tenantId: TENANT_A }, baseDraft),
    ).rejects.toThrow()
  })

  it('allows the same erpCustomerId for a different tenant', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.createClientRow(
        { tenantId: TENANT_B },
        { ...baseDraft, tenantId: TENANT_B },
      ),
    ).resolves.not.toThrow()
  })
})

// ─── Phone search ─────────────────────────────────────────────────────────────

describe('findClientsByPhone', () => {
  it('returns matching clients by E.164 phone within the same tenant', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const results = await repo.findClientsByPhone({ tenantId: TENANT_A }, '+96170000001')
    expect(results.length).toBe(1)
    expect(results[0].phoneE164).toBe('+96170000001')
  })

  it('does not return other-tenant clients with the same phone', async () => {
    await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )

    const results = await repo.findClientsByPhone({ tenantId: TENANT_A }, '+96170000001')
    expect(results.length).toBe(0)
  })

  it('returns empty array when no phone match found', async () => {
    const results = await repo.findClientsByPhone({ tenantId: TENANT_A }, '+96100000000')
    expect(results).toEqual([])
  })
})

// ─── Backfill upsert ──────────────────────────────────────────────────────────

describe('upsertClientFromBackfill', () => {
  it('creates a new row when no existing row is present', async () => {
    const result = await repo.upsertClientFromBackfill({ tenantId: TENANT_A }, baseDraft)
    expect(result.erpCustomerId).toBe(ERP_ID_1)
    expect(result.fullName).toBe('Sara Ahmad')
  })

  it('is idempotent — calling twice produces exactly one row', async () => {
    await repo.upsertClientFromBackfill({ tenantId: TENANT_A }, baseDraft)
    await repo.upsertClientFromBackfill({ tenantId: TENANT_A }, baseDraft)

    const list = await repo.listClients({ tenantId: TENANT_A })
    expect(list.length).toBe(1)
  })

  it('updates fullName on second call without creating a duplicate', async () => {
    await repo.upsertClientFromBackfill({ tenantId: TENANT_A }, baseDraft)
    const updated = await repo.upsertClientFromBackfill(
      { tenantId: TENANT_A },
      { ...baseDraft, fullName: 'Sara Ahmad (Updated)' },
    )

    expect(updated.fullName).toBe('Sara Ahmad (Updated)')

    const list = await repo.listClients({ tenantId: TENANT_A })
    expect(list.length).toBe(1)
    expect(list[0].fullName).toBe('Sara Ahmad (Updated)')
  })
})

// ─── Goal JSON hydration ──────────────────────────────────────────────────────

describe('goal JSON hydration', () => {
  it('stores and retrieves subGoalIds as an array', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, subGoalIds: ['sub-1', 'sub-2'] }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)
    expect(result.goal?.subGoalIds).toEqual(['sub-1', 'sub-2'])

    const goals = await repo.listGoals({ tenantId: TENANT_A }, result.clientIndex.id)
    expect(goals[0].subGoalIds).toEqual(['sub-1', 'sub-2'])
  })

  it('stores and retrieves safetyFlags as an array', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, safetyFlags: ['cardiac', 'knee'] }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)

    const goals = await repo.listGoals({ tenantId: TENANT_A }, result.clientIndex.id)
    expect(goals[0].safetyFlags).toEqual(['cardiac', 'knee'])
  })
})

// ─── Phase 4.2 — isPrimary and trainerSubGoalIds ─────────────────────────────

describe('goal isPrimary and trainerSubGoalIds', () => {
  it('defaults isPrimary to true when draft sets isPrimary: true', async () => {
    const result = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    expect(result.goal?.isPrimary).toBe(true)

    const goals = await repo.listGoals({ tenantId: TENANT_A }, result.clientIndex.id)
    expect(goals[0].isPrimary).toBe(true)
  })

  it('defaults isPrimary to true when draft omits isPrimary (repository default)', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, isPrimary: undefined }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)
    expect(result.goal?.isPrimary).toBe(true)

    const goals = await repo.listGoals({ tenantId: TENANT_A }, result.clientIndex.id)
    expect(goals[0].isPrimary).toBe(true)
  })

  it('stores and retrieves trainerSubGoalIds as an empty array by default', async () => {
    const result = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    expect(result.goal?.trainerSubGoalIds).toEqual([])

    const goals = await repo.listGoals({ tenantId: TENANT_A }, result.clientIndex.id)
    expect(goals[0].trainerSubGoalIds).toEqual([])
  })

  it('stores and retrieves trainerSubGoalIds when provided', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, trainerSubGoalIds: ['trainer-sub-a', 'trainer-sub-b'] }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)
    expect(result.goal?.trainerSubGoalIds).toEqual(['trainer-sub-a', 'trainer-sub-b'])

    const goals = await repo.listGoals({ tenantId: TENANT_A }, result.clientIndex.id)
    expect(goals[0].trainerSubGoalIds).toEqual(['trainer-sub-a', 'trainer-sub-b'])
  })

  it('no goal row is created (and isPrimary is irrelevant) when goalId is null', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, goalId: null }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)
    expect(result.goal).toBeNull()
  })
})

// ─── Duplicate override (Phase 6) ───────────────────────────────────────────────

describe('createClientRow — duplicate override audit', () => {
  it('stores override columns and writes a duplicate.override event in the same transaction', async () => {
    const draft: ClientCreateDraft = {
      ...baseDraft,
      possibleDuplicateClientId: 'existing-local-id',
      duplicateOverrideReason:   'Different person, shared number',
    }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)

    expect(result.clientIndex.possibleDuplicateClientId).toBe('existing-local-id')
    expect(result.clientIndex.duplicateOverrideReason).toBe('Different person, shared number')

    const events = await repo.listEvents({ tenantId: TENANT_A }, result.clientIndex.id)
    const types = events.map((e) => e.type)
    expect(types).toContain('client.created')
    expect(types).toContain('duplicate.override')

    const override = events.find((e) => e.type === 'duplicate.override')
    expect(override?.payloadJson.possibleDuplicateClientId).toBe('existing-local-id')
    expect(override?.payloadJson.reason).toBe('Different person, shared number')
  })

  it('writes NO duplicate.override event for a normal create (Phase 4 behavior preserved)', async () => {
    const result = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    expect(result.clientIndex.possibleDuplicateClientId).toBeNull()
    expect(result.clientIndex.duplicateOverrideReason).toBeNull()

    const events = await repo.listEvents({ tenantId: TENANT_A }, result.clientIndex.id)
    expect(events.map((e) => e.type)).not.toContain('duplicate.override')
    expect(events.some((e) => e.type === 'client.created')).toBe(true)
  })
})

// ─── Billing mode (Phase E) ───────────────────────────────────────────────────

describe('createClientRow — billing mode', () => {
  it('defaults to unset when billingMode is absent from draft', async () => {
    const result = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    expect(result.clientIndex.billingMode).toBe('unset')
  })

  it('stores package billing mode', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, billingMode: 'package' }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)
    expect(result.clientIndex.billingMode).toBe('package')
  })

  it('stores pay_per_session billing mode', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, billingMode: 'pay_per_session' }
    const result = await repo.createClientRow({ tenantId: TENANT_A }, draft)
    expect(result.clientIndex.billingMode).toBe('pay_per_session')
  })
})


describe('setBillingModeIfUnset', () => {
  it('updates unset billing mode and writes a billing sync audit event', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const updated = await repo.setBillingModeIfUnset({ tenantId: TENANT_A }, ERP_ID_1, 'pay_per_session')

    expect(updated?.billingMode).toBe('pay_per_session')

    const found = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    expect(found?.billingMode).toBe('pay_per_session')

    const events = await repo.listEvents({ tenantId: TENANT_A }, created.clientIndex.id)
    const syncEvent = events.find((event) => event.type === 'client.billing_mode_synced')
    expect(syncEvent).toBeTruthy()
    expect(syncEvent?.payloadJson).toMatchObject({
      previousMode: 'unset',
      newMode:      'pay_per_session',
      source:       'erp_customer',
    })
  })

  it('does not overwrite an existing package billing mode', async () => {
    const draft: ClientCreateDraft = { ...baseDraft, billingMode: 'package' }
    const created = await repo.createClientRow({ tenantId: TENANT_A }, draft)

    const updated = await repo.setBillingModeIfUnset({ tenantId: TENANT_A }, ERP_ID_1, 'pay_per_session')

    expect(updated).toBeNull()

    const found = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    expect(found?.billingMode).toBe('package')

    const events = await repo.listEvents({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(events.map((event) => event.type)).not.toContain('client.billing_mode_synced')
  })

  it('does not update another tenant row with the same ERP customer id', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )

    const updated = await repo.setBillingModeIfUnset({ tenantId: TENANT_A }, ERP_ID_1, 'pay_per_session')

    expect(updated).toBeNull()

    const found = await repo.findClientByErpId({ tenantId: TENANT_B }, ERP_ID_1)
    expect(found?.billingMode).toBe('unset')

    const events = await repo.listEvents({ tenantId: TENANT_B }, created.clientIndex.id)
    expect(events.map((event) => event.type)).not.toContain('client.billing_mode_synced')
  })
})
