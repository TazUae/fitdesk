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
import { formatGoalLabel } from '@/lib/goals/format'
import type { ClientCreateDraft, SelectedGoalDraft } from '@/types/clients'

// ─── Setup ────────────────────────────────────────────────────────────────────

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
  // Phase 5 — defense-in-depth partial unique indexes (mirror scripts/migrate-app.mjs).
  // Exercised by the repository tests so the real reconciliation runs against them.
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_goal_active_uniqueness"
    ON "client_goal" ("tenant_id", "client_index_id", "goal_id")
    WHERE "status" = 'active'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_goal_active_primary"
    ON "client_goal" ("tenant_id", "client_index_id")
    WHERE "status" = 'active' AND "is_primary" = 1`,
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

describe('setWhatsAppConsent', () => {
  it('a newly created client defaults to unknown consent', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    expect(created.clientIndex.whatsappConsentState).toBe('unknown')

    const found = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    expect(found?.whatsappConsentState).toBe('unknown')
  })

  it('opt-in writes the state and a client_event audit row', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const updated = await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')

    expect(updated?.whatsappConsentState).toBe('opted_in')

    const found = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    expect(found?.whatsappConsentState).toBe('opted_in')

    const events = await repo.listEvents({ tenantId: TENANT_A }, created.clientIndex.id)
    const consentEvent = events.find((event) => event.type === 'client.whatsapp_consent_changed')
    expect(consentEvent).toBeTruthy()
    expect(consentEvent?.payloadJson).toMatchObject({
      previousState: 'unknown',
      newState:      'opted_in',
      source:        'trainer_manual',
    })
  })

  it('opt-out writes the state and a client_event audit row', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const updated = await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_out')

    expect(updated?.whatsappConsentState).toBe('opted_out')

    const events = await repo.listEvents({ tenantId: TENANT_A }, created.clientIndex.id)
    const consentEvent = events.find((event) => event.type === 'client.whatsapp_consent_changed')
    expect(consentEvent?.payloadJson).toMatchObject({
      previousState: 'unknown',
      newState:      'opted_out',
    })
  })

  it('changing consent again (opted_in -> opted_out) records the correct previousState', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')

    const updated = await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_out')
    expect(updated?.whatsappConsentState).toBe('opted_out')

    const created = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    const events = await repo.listEvents({ tenantId: TENANT_A }, created!.id)
    const events2 = events.filter((event) => event.type === 'client.whatsapp_consent_changed')
    expect(events2).toHaveLength(2)
    // listEvents orders newest-first (see ClientRepository.listEvents) — index 0 is the most recent change.
    expect(events2[0].payloadJson).toMatchObject({ previousState: 'opted_in', newState: 'opted_out' })
    expect(events2[1].payloadJson).toMatchObject({ previousState: 'unknown', newState: 'opted_in' })
  })

  it('setting the same state again is a no-op — no duplicate audit event', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')

    await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')

    const events = await repo.listEvents({ tenantId: TENANT_A }, created.clientIndex.id)
    const consentEvents = events.filter((event) => event.type === 'client.whatsapp_consent_changed')
    expect(consentEvents).toHaveLength(1)
  })

  it('returns null for a non-existent erpCustomerId — fails closed, no row created', async () => {
    const result = await repo.setWhatsAppConsent({ tenantId: TENANT_A }, 'ERP-DOES-NOT-EXIST', 'opted_in')
    expect(result).toBeNull()
  })

  it('tenant isolation: tenant A cannot read tenant B consent state (fails closed)', async () => {
    await repo.createClientRow({ tenantId: TENANT_B }, { ...baseDraft, tenantId: TENANT_B })
    await repo.setWhatsAppConsent({ tenantId: TENANT_B }, ERP_ID_1, 'opted_in')

    const crossTenantRead = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    expect(crossTenantRead).toBeNull()
  })

  it('tenant isolation: tenant A cannot mutate tenant B consent state', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )

    const result = await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')
    expect(result).toBeNull()

    const found = await repo.findClientByErpId({ tenantId: TENANT_B }, ERP_ID_1)
    expect(found?.whatsappConsentState).toBe('unknown')

    const events = await repo.listEvents({ tenantId: TENANT_B }, created.clientIndex.id)
    expect(events.map((event) => event.type)).not.toContain('client.whatsapp_consent_changed')
  })

  it('throws when tenantId is blank — fails closed before any query', async () => {
    await expect(
      repo.setWhatsAppConsent({ tenantId: '' }, ERP_ID_1, 'opted_in'),
    ).rejects.toThrow()
  })
})

describe('findActionIntentById (US-048)', () => {
  it('returns the intent when it exists in this tenant', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    const pending = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    const anyIntent = pending[0]

    const found = await repo.findActionIntentById({ tenantId: TENANT_A }, anyIntent.id)
    expect(found?.id).toBe(anyIntent.id)
  })

  it('returns null for a non-existent intent id', async () => {
    const found = await repo.findActionIntentById({ tenantId: TENANT_A }, 'nonexistent-id')
    expect(found).toBeNull()
  })

  it('tenant isolation: returns null for an intent belonging to another tenant', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )
    const pending = await repo.listPendingActions({ tenantId: TENANT_B }, created.clientIndex.id)
    const anyIntent = pending[0]

    const found = await repo.findActionIntentById({ tenantId: TENANT_A }, anyIntent.id)
    expect(found).toBeNull()
  })

  it('throws when tenantId is blank — fails closed before any query', async () => {
    await expect(
      repo.findActionIntentById({ tenantId: '' }, 'some-id'),
    ).rejects.toThrow()
  })
})

describe('createWhatsAppReminderCandidate (US-050)', () => {
  it('blocks and creates no intent for opted_out — no override', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_out')

    const result = await repo.createWhatsAppReminderCandidate(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      'package running low',
    )

    expect(result).toEqual({ outcome: 'blocked', reason: 'opted_out' })

    const pending = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(pending.some((a) => a.type === 'whatsapp_reminder_candidate')).toBe(false)
  })

  it('blocks and creates no intent for unknown consent — never treated as auto-send permission', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    // baseDraft has no consent override — defaults to 'unknown'.

    const result = await repo.createWhatsAppReminderCandidate(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      'package running low',
    )

    expect(result).toEqual({ outcome: 'blocked', reason: 'consent_unknown' })

    const pending = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(pending.some((a) => a.type === 'whatsapp_reminder_candidate')).toBe(false)
  })

  it('creates a pending candidate for opted_in — trainer-approved suggestion, not sent', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')

    const result = await repo.createWhatsAppReminderCandidate(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      'package running low',
    )

    expect(result.outcome).toBe('created')
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.intent.type).toBe('whatsapp_reminder_candidate')
    expect(result.intent.status).toBe('pending')
    expect(result.intent.reason).toBe('package running low')

    const pending = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    const candidate = pending.find((a) => a.type === 'whatsapp_reminder_candidate')
    expect(candidate).toBeTruthy()
    expect(candidate?.status).toBe('pending')
  })

  it('candidate requires trainer approval — completing it transitions out of pending, same as any other action intent', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')
    const result = await repo.createWhatsAppReminderCandidate(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      'package running low',
    )
    if (result.outcome !== 'created') throw new Error('expected created')

    const completed = await repo.completeActionIntent({ tenantId: TENANT_A }, result.intent.id)
    expect(completed?.status).toBe('completed')

    const pending = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(pending.some((a) => a.id === result.intent.id)).toBe(false)
  })

  it('candidate can be dismissed by the trainer instead of approved', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.setWhatsAppConsent({ tenantId: TENANT_A }, ERP_ID_1, 'opted_in')
    const result = await repo.createWhatsAppReminderCandidate(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      'package running low',
    )
    if (result.outcome !== 'created') throw new Error('expected created')

    const dismissed = await repo.dismissActionIntent({ tenantId: TENANT_A }, result.intent.id)
    expect(dismissed?.status).toBe('dismissed')
  })

  it('returns client_not_found for a non-existent clientIndexId', async () => {
    const result = await repo.createWhatsAppReminderCandidate(
      { tenantId: TENANT_A },
      'nonexistent-client-index-id',
      'package running low',
    )
    expect(result).toEqual({ outcome: 'client_not_found' })
  })

  it('tenant isolation: tenant A cannot create a candidate for tenant B\'s client', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )
    await repo.setWhatsAppConsent({ tenantId: TENANT_B }, ERP_ID_1, 'opted_in')

    const result = await repo.createWhatsAppReminderCandidate(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      'package running low',
    )

    expect(result).toEqual({ outcome: 'client_not_found' })

    const pending = await repo.listPendingActions({ tenantId: TENANT_B }, created.clientIndex.id)
    expect(pending.some((a) => a.type === 'whatsapp_reminder_candidate')).toBe(false)
  })

  it('throws when tenantId is blank — fails closed before any query', async () => {
    await expect(
      repo.createWhatsAppReminderCandidate({ tenantId: '' }, 'some-id', 'reason'),
    ).rejects.toThrow()
  })
})

describe('createMissingNextSessionCandidate ("US-038" per the batch label)', () => {
  it('creates a pending missing_next_session intent', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const result = await repo.createMissingNextSessionCandidate({ tenantId: TENANT_A }, created.clientIndex.id)

    expect(result.outcome).toBe('created')
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.intent.type).toBe('missing_next_session')
    expect(result.intent.status).toBe('pending')

    const pending = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(pending.some(a => a.type === 'missing_next_session')).toBe(true)
  })

  it('duplicate prevention: a second call for the same client returns already_pending, not a second intent', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.createMissingNextSessionCandidate({ tenantId: TENANT_A }, created.clientIndex.id)

    const second = await repo.createMissingNextSessionCandidate({ tenantId: TENANT_A }, created.clientIndex.id)

    expect(second.outcome).toBe('already_pending')
    const pending = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(pending.filter(a => a.type === 'missing_next_session')).toHaveLength(1)
  })

  it('a new candidate can be created again after the prior one is completed or dismissed', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    const first = await repo.createMissingNextSessionCandidate({ tenantId: TENANT_A }, created.clientIndex.id)
    if (first.outcome !== 'created') throw new Error('expected created')
    await repo.completeActionIntent({ tenantId: TENANT_A }, first.intent.id)

    const second = await repo.createMissingNextSessionCandidate({ tenantId: TENANT_A }, created.clientIndex.id)

    expect(second.outcome).toBe('created')
  })

  it('returns client_not_found for a non-existent clientIndexId', async () => {
    const result = await repo.createMissingNextSessionCandidate({ tenantId: TENANT_A }, 'nonexistent-id')
    expect(result).toEqual({ outcome: 'client_not_found' })
  })

  it('tenant isolation: tenant A cannot create a candidate for tenant B\'s client', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )

    const result = await repo.createMissingNextSessionCandidate({ tenantId: TENANT_A }, created.clientIndex.id)

    expect(result).toEqual({ outcome: 'client_not_found' })
    const pending = await repo.listPendingActions({ tenantId: TENANT_B }, created.clientIndex.id)
    expect(pending.some(a => a.type === 'missing_next_session')).toBe(false)
  })

  it('throws when tenantId is blank — fails closed before any query', async () => {
    await expect(
      repo.createMissingNextSessionCandidate({ tenantId: '' }, 'some-id'),
    ).rejects.toThrow()
  })
})

describe('addClientNote (US-053)', () => {
  it('writes a client.note client_event with the given text', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const event = await repo.addClientNote({ tenantId: TENANT_A }, created.clientIndex.id, 'Doing great this week')

    expect(event).not.toBeNull()
    expect(event!.type).toBe('client.note')
    expect(event!.payloadJson).toEqual({ text: 'Doing great this week' })
    expect(event!.clientIndexId).toBe(created.clientIndex.id)
    expect(event!.erpCustomerId).toBe(created.clientIndex.erpCustomerId)
  })

  it('the written note appears via listEvents', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.addClientNote({ tenantId: TENANT_A }, created.clientIndex.id, 'Second note')

    const events = await repo.listEvents({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(events.some(e => e.type === 'client.note' && e.payloadJson.text === 'Second note')).toBe(true)
  })

  it('returns null for a non-existent clientIndexId', async () => {
    const event = await repo.addClientNote({ tenantId: TENANT_A }, 'nonexistent-id', 'text')
    expect(event).toBeNull()
  })

  it('tenant isolation: tenant A cannot add a note to tenant B\'s client', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )

    const event = await repo.addClientNote({ tenantId: TENANT_A }, created.clientIndex.id, 'sneaky note')

    expect(event).toBeNull()
    const events = await repo.listEvents({ tenantId: TENANT_B }, created.clientIndex.id)
    expect(events.some(e => e.type === 'client.note')).toBe(false)
  })

  it('throws when tenantId is blank — fails closed before any query', async () => {
    await expect(
      repo.addClientNote({ tenantId: '' }, 'some-id', 'text'),
    ).rejects.toThrow()
  })
})

describe('addProgressEntry (US-052)', () => {
  it('writes a client.progress client_event with no goal link', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const result = await repo.addProgressEntry({ tenantId: TENANT_A }, created.clientIndex.id, 'Lost 2kg this month', null)

    expect(result.outcome).toBe('created')
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.event.type).toBe('client.progress')
    expect(result.event.payloadJson).toEqual({ text: 'Lost 2kg this month', goalId: null })
  })

  it('links to one of the client\'s own goals when goalId matches', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals[0].goalId).toBe('goal-wl')

    const result = await repo.addProgressEntry({ tenantId: TENANT_A }, created.clientIndex.id, 'Hit a new PR', 'goal-wl')

    expect(result.outcome).toBe('created')
    if (result.outcome !== 'created') throw new Error('expected created')
    expect(result.event.payloadJson).toEqual({ text: 'Hit a new PR', goalId: 'goal-wl' })
  })

  it('returns invalid_goal_link when goalId does not match any of the client\'s own goals', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)

    const result = await repo.addProgressEntry({ tenantId: TENANT_A }, created.clientIndex.id, 'text', 'some-other-goal')

    expect(result).toEqual({ outcome: 'invalid_goal_link' })
    const events = await repo.listEvents({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(events.some(e => e.type === 'client.progress')).toBe(false)
  })

  it('returns client_not_found for a non-existent clientIndexId', async () => {
    const result = await repo.addProgressEntry({ tenantId: TENANT_A }, 'nonexistent-id', 'text', null)
    expect(result).toEqual({ outcome: 'client_not_found' })
  })

  it('tenant isolation: tenant A cannot add a progress entry to tenant B\'s client', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )

    const result = await repo.addProgressEntry({ tenantId: TENANT_A }, created.clientIndex.id, 'sneaky entry', null)

    expect(result).toEqual({ outcome: 'client_not_found' })
    const events = await repo.listEvents({ tenantId: TENANT_B }, created.clientIndex.id)
    expect(events.some(e => e.type === 'client.progress')).toBe(false)
  })

  it('tenant isolation: cannot link to another tenant\'s goal even if the goalId string matches', async () => {
    const createdB = await repo.createClientRow({ tenantId: TENANT_B }, { ...baseDraft, tenantId: TENANT_B })
    const createdA = await repo.createClientRow(
      { tenantId: TENANT_A },
      { ...baseDraft, erpCustomerId: ERP_ID_2, goalId: null, isPrimary: undefined },
    )

    const result = await repo.addProgressEntry({ tenantId: TENANT_A }, createdA.clientIndex.id, 'text', 'goal-wl')

    expect(result).toEqual({ outcome: 'invalid_goal_link' })
    expect(createdB.clientIndex.id).not.toBe(createdA.clientIndex.id)
  })

  it('throws when tenantId is blank — fails closed before any query', async () => {
    await expect(
      repo.addProgressEntry({ tenantId: '' }, 'some-id', 'text', null),
    ).rejects.toThrow()
  })
})

describe('setClientNextSessionAtUtc', () => {
  it('updates nextSessionAtUtc and updatedAtUtc only', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    const before = created.clientIndex

    const updated = await repo.setClientNextSessionAtUtc(
      { tenantId: TENANT_A },
      before.id,
      '2026-07-01T09:00:00.000Z',
    )

    expect(updated?.nextSessionAtUtc).toBe('2026-07-01T09:00:00.000Z')
    expect(updated?.updatedAtUtc).not.toBe(before.updatedAtUtc)

    const found = await repo.findClientById({ tenantId: TENANT_A }, before.id)
    expect(found?.nextSessionAtUtc).toBe('2026-07-01T09:00:00.000Z')
  })

  it('clears nextSessionAtUtc to null', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.setClientNextSessionAtUtc({ tenantId: TENANT_A }, created.clientIndex.id, '2026-07-01T09:00:00.000Z')

    const cleared = await repo.setClientNextSessionAtUtc({ tenantId: TENANT_A }, created.clientIndex.id, null)

    expect(cleared?.nextSessionAtUtc).toBeNull()
    const found = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(found?.nextSessionAtUtc).toBeNull()
  })

  it('is tenant-scoped — returns null and writes nothing for a client belonging to another tenant', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B },
    )

    const result = await repo.setClientNextSessionAtUtc(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      '2026-07-01T09:00:00.000Z',
    )

    expect(result).toBeNull()
    const found = await repo.findClientById({ tenantId: TENANT_B }, created.clientIndex.id)
    expect(found?.nextSessionAtUtc).toBeNull()
  })

  it('is client-scoped — returns null for an unknown clientIndexId', async () => {
    const result = await repo.setClientNextSessionAtUtc(
      { tenantId: TENANT_A },
      'nonexistent-client-index-id',
      '2026-07-01T09:00:00.000Z',
    )
    expect(result).toBeNull()
  })

  it('does not overwrite local enrichment fields', async () => {
    const draft: ClientCreateDraft = {
      ...baseDraft,
      billingMode: 'package',
    }
    const created = await repo.createClientRow({ tenantId: TENANT_A }, draft)

    // Simulate trainer-set enrichment that must survive the projection write.
    await repo.setBillingModeIfUnset({ tenantId: TENANT_A }, ERP_ID_1, 'pay_per_session')
    const beforeUpdate = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)

    await repo.setClientNextSessionAtUtc(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      '2026-07-01T09:00:00.000Z',
    )

    const after = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(after?.billingMode).toBe(beforeUpdate?.billingMode)
    expect(after?.whatsappEnabled).toBe(beforeUpdate?.whatsappEnabled)
    expect(after?.paymentSummary).toBe(beforeUpdate?.paymentSummary)
    expect(after?.safetyState).toBe(beforeUpdate?.safetyState)
    expect(after?.onboardingState).toBe(beforeUpdate?.onboardingState)
    expect(after?.fullName).toBe(beforeUpdate?.fullName)
    expect(after?.phoneE164).toBe(beforeUpdate?.phoneE164)
    expect(after?.possibleDuplicateClientId).toBe(beforeUpdate?.possibleDuplicateClientId)
    expect(after?.duplicateOverrideReason).toBe(beforeUpdate?.duplicateOverrideReason)

    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.length).toBe(1)
    const actions = await repo.listPendingActions({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(actions.length).toBe(created.actions.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// US-025 — Plane-B tenant-isolation coverage (behavior-neutral).
//
// These document the local read-model isolation model: every read/list and every
// mutation is scoped by ctx.tenantId, a missing tenantId fails closed, and a
// client-supplied id (or payload) from one tenant can never reach another tenant's
// rows. They assert existing behavior only — no production code is changed.
// Invariant for this increment: single trainer per tenant (intra-tenant
// multi-trainer ownership is future hardening, out of scope — see US-025 plan).
// ═══════════════════════════════════════════════════════════════════════════════

describe('US-025 findClientsByStatus — tenant isolation', () => {
  it('returns only current-tenant rows for a status both tenants share', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )

    const activeA = await repo.findClientsByStatus({ tenantId: TENANT_A }, 'active')

    expect(activeA.length).toBe(1)
    expect(activeA[0].tenantId).toBe(TENANT_A)
    expect(activeA[0].erpCustomerId).toBe(ERP_ID_1)
  })

  it('does not surface another tenant rows when the current tenant has none', async () => {
    await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )

    const activeA = await repo.findClientsByStatus({ tenantId: TENANT_A }, 'active')
    expect(activeA).toEqual([])
  })

  it('throws when tenantId is blank (fails closed)', async () => {
    await expect(
      repo.findClientsByStatus({ tenantId: '' }, 'active'),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })
})

describe('US-025 related-row reads — cross-tenant isolation', () => {
  it('listGoals / listEvents / listPendingActions never return another tenant related rows', async () => {
    // Tenant B owns a full client record: index + goal + default intents + events.
    const b = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )

    // Tenant B sees its own related rows (they exist).
    expect((await repo.listGoals({ tenantId: TENANT_B }, b.clientIndex.id)).length).toBe(1)
    expect(
      (await repo.listEvents({ tenantId: TENANT_B }, b.clientIndex.id)).some((e) => e.type === 'client.created'),
    ).toBe(true)
    expect(
      (await repo.listPendingActions({ tenantId: TENANT_B }, b.clientIndex.id)).length,
    ).toBe(b.actions.length)

    // Tenant A, using tenant B's real clientIndexId, sees nothing.
    expect(await repo.listGoals({ tenantId: TENANT_A }, b.clientIndex.id)).toEqual([])
    expect(await repo.listEvents({ tenantId: TENANT_A }, b.clientIndex.id)).toEqual([])
    expect(await repo.listPendingActions({ tenantId: TENANT_A }, b.clientIndex.id)).toEqual([])
  })

  it('related-row reads fail closed when tenantId is blank', async () => {
    await expect(repo.listGoals({ tenantId: '' }, 'any-id')).rejects.toThrow('[ClientRepository] tenantId is required')
    await expect(repo.listEvents({ tenantId: '' }, 'any-id')).rejects.toThrow('[ClientRepository] tenantId is required')
    await expect(
      repo.listPendingActions({ tenantId: '' }, 'any-id'),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })
})

describe('US-025 completeActionIntent — tenant scoping', () => {
  it('completes an intent owned by the same tenant', async () => {
    const a = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    const intentId = a.actions[0].id

    const completed = await repo.completeActionIntent({ tenantId: TENANT_A }, intentId)

    expect(completed).not.toBeNull()
    expect(completed?.status).toBe('completed')

    const stillPending = await repo.listPendingActions({ tenantId: TENANT_A }, a.clientIndex.id)
    expect(stillPending.map((i) => i.id)).not.toContain(intentId)
  })

  it('is a no-op for an intent id that belongs to another tenant', async () => {
    const b = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )
    const bIntentId = b.actions[0].id

    const result = await repo.completeActionIntent({ tenantId: TENANT_A }, bIntentId)

    expect(result).toBeNull()
    // Tenant B's intent is untouched — still pending.
    const bPending = await repo.listPendingActions({ tenantId: TENANT_B }, b.clientIndex.id)
    expect(bPending.map((i) => i.id)).toContain(bIntentId)
    expect(bPending.length).toBe(b.actions.length)
  })

  it('throws when tenantId is blank (fails closed)', async () => {
    await expect(
      repo.completeActionIntent({ tenantId: '' }, 'any-intent-id'),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })
})

describe('US-025 dismissActionIntent — tenant scoping', () => {
  it('dismisses an intent owned by the same tenant', async () => {
    const a = await repo.createClientRow({ tenantId: TENANT_A }, baseDraft)
    const intentId = a.actions[0].id

    const dismissed = await repo.dismissActionIntent({ tenantId: TENANT_A }, intentId)

    expect(dismissed).not.toBeNull()
    expect(dismissed?.status).toBe('dismissed')

    const stillPending = await repo.listPendingActions({ tenantId: TENANT_A }, a.clientIndex.id)
    expect(stillPending.map((i) => i.id)).not.toContain(intentId)
  })

  it('is a no-op for an intent id that belongs to another tenant', async () => {
    const b = await repo.createClientRow(
      { tenantId: TENANT_B },
      { ...baseDraft, tenantId: TENANT_B, erpCustomerId: ERP_ID_2 },
    )
    const bIntentId = b.actions[0].id

    const result = await repo.dismissActionIntent({ tenantId: TENANT_A }, bIntentId)

    expect(result).toBeNull()
    const bPending = await repo.listPendingActions({ tenantId: TENANT_B }, b.clientIndex.id)
    expect(bPending.map((i) => i.id)).toContain(bIntentId)
    expect(bPending.length).toBe(b.actions.length)
  })

  it('throws when tenantId is blank (fails closed)', async () => {
    await expect(
      repo.dismissActionIntent({ tenantId: '' }, 'any-intent-id'),
    ).rejects.toThrow('[ClientRepository] tenantId is required')
  })
})

describe('US-025 createClientRow — server ctx governs tenant (payload cannot cross tenants)', () => {
  it('stamps every created row with ctx.tenantId, ignoring a mismatched draft.tenantId', async () => {
    // Server context is TENANT_A; the (client-supplied) draft claims TENANT_B.
    const result = await repo.createClientRow(
      { tenantId: TENANT_A },
      { ...baseDraft, tenantId: TENANT_B },
    )

    // Every row is stamped with the server ctx tenant, never the draft's claim.
    expect(result.clientIndex.tenantId).toBe(TENANT_A)
    expect(result.goal?.tenantId).toBe(TENANT_A)
    expect(result.actions.every((a) => a.tenantId === TENANT_A)).toBe(true)
    expect(result.event.tenantId).toBe(TENANT_A)

    // The row is visible to TENANT_A and invisible to TENANT_B.
    expect(await repo.findClientById({ tenantId: TENANT_A }, result.clientIndex.id)).not.toBeNull()
    expect(await repo.findClientById({ tenantId: TENANT_B }, result.clientIndex.id)).toBeNull()
  })
})

// ─── Phase 3: replaceClientGoals ──────────────────────────────────────────

/** Build a valid SelectedGoalDraft (server contract shape) for tests. */
function mkDraft(over: Partial<SelectedGoalDraft> & { goalId: string }): SelectedGoalDraft {
  return {
    goalId:            over.goalId,
    isPrimary:         over.isPrimary ?? false,
    urgency:           over.urgency ?? 'active_focus',
    clientSubGoalIds:  over.clientSubGoalIds ?? [],
    trainerSubGoalIds: over.trainerSubGoalIds ?? [],
    trainerNotes:      'trainerNotes' in over ? (over.trainerNotes ?? null) : null,
  }
}

describe('replaceClientGoals — A. strict replacement validation (zero writes on any error)', () => {
  it('unknown goalId rejects the complete request', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'nonexistent-goal', isPrimary: true }),
      ]),
    ).rejects.toThrow('unknown_goal_id')
    // Zero writes: original goal untouched.
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.map(g => g.goalId)).toEqual(['fat-loss'])
  })

  it('duplicate goalId rejects the complete request', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'strength', isPrimary: true }),
        mkDraft({ goalId: 'strength', isPrimary: false }),
      ]),
    ).rejects.toThrow('duplicate_goal_id')
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.map(g => g.goalId)).toEqual(['fat-loss'])
  })

  it('unknown sub-goal rejects the complete request', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'strength', isPrimary: true, clientSubGoalIds: ['made_up_sub_goal'] }),
      ]),
    ).rejects.toThrow('unknown_sub_goal')
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.map(g => g.goalId)).toEqual(['fat-loss'])
  })

  it('sub-goal in the wrong layer rejects the complete request', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    // 'preserve_skeletal_muscle_mass' is a SECONDARY (trainer) sub-goal for fat-loss —
    // supplying it as a client (primary-layer) sub-goal must be rejected.
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'fat-loss', isPrimary: true, clientSubGoalIds: ['preserve_skeletal_muscle_mass'] }),
      ]),
    ).rejects.toThrow('unknown_sub_goal_in_primary_layer')
  })

  it('omitted trainerNotes property rejects the complete request (D8)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    const draftMissingNotes = {
      goalId: 'strength', isPrimary: true, urgency: 'active_focus',
      clientSubGoalIds: [], trainerSubGoalIds: [],
    } as unknown as SelectedGoalDraft
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [draftMissingNotes]),
    ).rejects.toThrow('missing_trainer_notes_property')
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.map(g => g.goalId)).toEqual(['fat-loss'])
  })

  it('hard conflict rejects the complete request (zero writes)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    // underweight + fat-loss is an unresolved hard conflict.
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'fat-loss', isPrimary: true }),
        mkDraft({ goalId: 'underweight', isPrimary: false }),
      ]),
    ).rejects.toThrow('hard_conflict_detected')
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.map(g => g.goalId)).toEqual(['fat-loss'])
  })
})

describe('replaceClientGoals — B. primary invariant', () => {
  it('zero active goals is valid and nulls index primary fields (D7)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [])
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals).toHaveLength(0)
    const client = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(client?.primaryGoalId).toBeNull()
    expect(client?.primaryGoalLabel).toBeNull()
  })

  it('nonempty set requires exactly one primary', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'strength', isPrimary: false }),
        mkDraft({ goalId: 'cardio', isPrimary: false }),
      ]),
    ).rejects.toThrow('primary_invariant_violated')
  })

  it('rejects two primaries', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'strength', isPrimary: true }),
        mkDraft({ goalId: 'cardio', isPrimary: true }),
      ]),
    ).rejects.toThrow('primary_invariant_violated')
  })

  it('sets index primary fields from the active primary', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'strength', isPrimary: true }),
      mkDraft({ goalId: 'cardio', isPrimary: false }),
    ])
    const client = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(client?.primaryGoalId).toBe('strength')
    // Label comes from the canonical taxonomy (formatGoalLabel), not the draft.
    expect(client?.primaryGoalLabel).toBe(formatGoalLabel('strength'))
  })
})

describe('replaceClientGoals — C. archive / reactivation', () => {
  it('archives removed goals and hides them from active reads', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'strength', isPrimary: true }),
    ])
    const active = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(active.map(g => g.goalId)).toEqual(['strength'])
    // fat-loss is archived (present in history, absent from active).
    expect(await repo.hasGoalHistory({ tenantId: TENANT_A }, created.clientIndex.id)).toBe(true)
  })

  it('reactivates the SAME logical row on re-selection (preserves id + createdAtUtc, no duplicate)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    const before = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    const originalRow = before.find(g => g.goalId === 'fat-loss')!
    const originalId = originalRow.id
    const originalCreatedAt = originalRow.createdAtUtc

    // Archive fat-loss by replacing with strength.
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'strength', isPrimary: true }),
    ])
    // Re-select fat-loss → reactivation.
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'fat-loss', isPrimary: true }),
    ])

    const active = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    const reactivated = active.filter(g => g.goalId === 'fat-loss')
    expect(reactivated).toHaveLength(1) // no active duplicate
    expect(reactivated[0].id).toBe(originalId) // same logical row
    expect(reactivated[0].createdAtUtc).toBe(originalCreatedAt) // createdAtUtc preserved
  })

  it('advances updatedAtUtc on a change', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    const before = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    const beforeUpdated = before[0].updatedAtUtc
    // Small delay so the ISO timestamp differs.
    await new Promise(r => setTimeout(r, 5))
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'fat-loss', isPrimary: true, urgency: 'urgent' }),
    ])
    const after = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(after[0].urgency).toBe('urgent')
    expect(after[0].updatedAtUtc >= beforeUpdated).toBe(true)
  })
})

describe('replaceClientGoals — sub-goal + safety persistence (round-trip)', () => {
  it('persists both sub-goal layers and recomputed safety flags (not empty)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({
        goalId: 'fat-loss',
        isPrimary: true,
        clientSubGoalIds: ['reduce_total_body_fat'],
        trainerSubGoalIds: ['preserve_skeletal_muscle_mass'],
        trainerNotes: 'Careful with knees',
      }),
      // rehab triggers an injury_risk safety flag — proves server-side recompute persists.
      mkDraft({ goalId: 'rehab', isPrimary: false }),
    ])
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    const fatLoss = goals.find(g => g.goalId === 'fat-loss')!
    expect(fatLoss.subGoalIds).toEqual(['reduce_total_body_fat'])
    expect(fatLoss.trainerSubGoalIds).toEqual(['preserve_skeletal_muscle_mass'])
    expect(fatLoss.notes).toBe('Careful with knees')
    const rehab = goals.find(g => g.goalId === 'rehab')!
    expect(rehab.safetyFlags).toContain('injury_risk')
    // client_index safety summary recomputed.
    const client = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(client?.safetyState).toBe('needs_review')
  })

  it('trims nonempty notes and clears blank/null to null (D8)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'strength', isPrimary: true, trainerNotes: '  Trimmed note  ' }),
      mkDraft({ goalId: 'cardio', isPrimary: false, trainerNotes: '   ' }),
    ])
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.find(g => g.goalId === 'strength')?.notes).toBe('Trimmed note')
    expect(goals.find(g => g.goalId === 'cardio')?.notes).toBeNull()
  })

  it('replaces (does not append) sub-goal arrays', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'fat-loss', isPrimary: true, clientSubGoalIds: ['reduce_total_body_fat', 'boost_daily_energy_levels'] }),
    ])
    // Now replace with a single sub-goal — the removed one must not persist.
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'fat-loss', isPrimary: true, clientSubGoalIds: ['reduce_total_body_fat'] }),
    ])
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals[0].subGoalIds).toEqual(['reduce_total_body_fat'])
  })
})

describe('replaceClientGoals — D. transaction atomicity (rollback)', () => {
  it('rolls back ALL writes (goal rows + index + audit) when the audit insert fails mid-transaction', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    const clientBefore = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)

    // Break the audit-event write so step 9 (inside the same tx) fails.
    await dbClient.execute('DROP TABLE client_event')

    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
        mkDraft({ goalId: 'strength', isPrimary: true }),
      ]),
    ).rejects.toThrow()

    // Recreate client_event so the read-back queries work.
    await dbClient.execute(`CREATE TABLE IF NOT EXISTS "client_event" (
      "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
      "client_index_id" TEXT, "erp_customer_id" TEXT, "type" TEXT NOT NULL,
      "payload_json" TEXT NOT NULL DEFAULT '{}', "created_by_user_id" TEXT,
      "created_at_utc" TEXT NOT NULL)`)

    // Goal rows rolled back: fat-loss still active, strength never inserted.
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.map(g => g.goalId)).toEqual(['fat-loss'])
    // Index rolled back: primary unchanged.
    const clientAfter = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(clientAfter?.primaryGoalId).toBe(clientBefore?.primaryGoalId)
  })
})

describe('replaceClientGoals — E. trusted identity / tenant isolation (fail closed)', () => {
  it('returns the tenant-verified erpCustomerId', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    const result = await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [
      mkDraft({ goalId: 'strength', isPrimary: true }),
    ])
    expect(result.erpCustomerId).toBe(created.clientIndex.erpCustomerId)
  })

  it('cross-tenant update fails closed (client_not_found)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await expect(
      repo.replaceClientGoals({ tenantId: TENANT_B }, created.clientIndex.id, [
        mkDraft({ goalId: 'strength', isPrimary: true }),
      ]),
    ).rejects.toThrow('client_not_found')
    // TENANT_A's data is untouched.
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.map(g => g.goalId)).toEqual(['fat-loss'])
  })

  it('missing tenant context fails closed', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    await expect(
      repo.replaceClientGoals({ tenantId: '' }, created.clientIndex.id, [
        mkDraft({ goalId: 'strength', isPrimary: true }),
      ]),
    ).rejects.toThrow('tenantId is required')
  })
})

describe('hasGoalHistory — local authority marker (D3)', () => {
  it('is false for a client with no local goal rows', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: null, primaryGoalId: null, primaryGoalLabel: null })
    expect(await repo.hasGoalHistory({ tenantId: TENANT_A }, created.clientIndex.id)).toBe(false)
  })

  it('is true when an active goal exists', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    expect(await repo.hasGoalHistory({ tenantId: TENANT_A }, created.clientIndex.id)).toBe(true)
  })

  it('is true when only archived history remains (prevents ERP fallback)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    // Archive everything (reduce to zero active).
    await repo.replaceClientGoals({ tenantId: TENANT_A }, created.clientIndex.id, [])
    expect((await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id))).toHaveLength(0)
    // But archived history exists → local remains authoritative.
    expect(await repo.hasGoalHistory({ tenantId: TENANT_A }, created.clientIndex.id)).toBe(true)
  })

  it('is tenant-scoped (cross-tenant sees no history)', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, { ...baseDraft, goalId: 'fat-loss' })
    expect(await repo.hasGoalHistory({ tenantId: TENANT_B }, created.clientIndex.id)).toBe(false)
  })
})
