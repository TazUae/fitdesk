/**
 * Tests for reconcileTenantNextSessions (Phase 5C — dry-run-only reconcile).
 *
 * Uses a real ClientRepository backed by a temp-file SQLite DB (same pattern
 * as repository.test.ts) so the "no write method is ever called" assertions
 * are meaningful — we spy on the real repository's write methods.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { ClientRepository } from '@/lib/clients/repository'
import { reconcileTenantNextSessions } from '@/lib/clients/reconcile'
import type { ClientCreateDraft } from '@/types/clients'
import type { FDSession, FDSessionStatus } from '@/types/scheduling'

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
const TRAINER_A = 'trainer-a'
const ERP_ID_1 = 'ERP-CUST-0001'
const ERP_ID_2 = 'ERP-CUST-0002'
const ERP_ID_3 = 'ERP-CUST-0003'
const NOW = new Date('2026-06-15T12:00:00Z')

function draft(overrides: Partial<ClientCreateDraft> = {}): ClientCreateDraft {
  return {
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
    ...overrides,
  }
}

function fdSession(overrides: Partial<FDSession> & { status: FDSessionStatus }): FDSession {
  return {
    id:                     'fds-001',
    tenantId:               '',
    trainerId:              TRAINER_A,
    clientId:               ERP_ID_1,
    clientName:             'Sara Ahmad',
    seriesId:               null,
    startAt:                new Date('2026-06-20T09:00:00Z'),
    endAt:                  new Date('2026-06-20T10:00:00Z'),
    durationMinutes:        60,
    timezone:               'UTC',
    occurrenceKey:          null,
    occurrenceIndex:        null,
    isOverride:             false,
    rate:                   100,
    sessionType:            null,
    notes:                  null,
    invoiceId:              null,
    version:                1,
    isTrialSession:         false,
    sessionConsumedPackage: false,
    ...overrides,
  }
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-reconcile-test-'))
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
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reconcileTenantNextSessions', () => {
  it('returns an empty structured result when the tenant has no local clients', async () => {
    const fetchClientSessions = vi.fn(async () => [])

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(result).toEqual({
      tenantId:  TENANT_A,
      trainerId: TRAINER_A,
      dryRun:    true,
      inspected: 0,
      projected: 0,
      unchanged: 0,
      cleared:   0,
      skipped:   0,
      changes:   [],
      errors:    [],
    })
    expect(fetchClientSessions).not.toHaveBeenCalled()
  })

  it('proposes a nextSessionAtUtc update when the derived value differs from null', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, draft())
    const fetchClientSessions = vi.fn(async () => [
      fdSession({ status: 'scheduled', startAt: new Date('2026-06-20T09:00:00Z') }),
    ])

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(result.inspected).toBe(1)
    expect(result.projected).toBe(1)
    expect(result.unchanged).toBe(0)
    expect(result.cleared).toBe(0)
    expect(result.changes).toEqual([
      {
        clientIndexId: expect.any(String),
        erpCustomerId: ERP_ID_1,
        field:         'nextSessionAtUtc',
        previousValue: null,
        proposedValue: '2026-06-20T09:00:00.000Z',
      },
    ])
  })

  it('reports unchanged when the derived value already matches the stored value', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, draft())
    await repo.setClientNextSessionAtUtc(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      '2026-06-20T09:00:00.000Z',
    )
    const fetchClientSessions = vi.fn(async () => [
      fdSession({ status: 'scheduled', startAt: new Date('2026-06-20T09:00:00Z') }),
    ])

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(result.unchanged).toBe(1)
    expect(result.projected).toBe(0)
    expect(result.cleared).toBe(0)
    expect(result.changes).toEqual([])
  })

  it('proposes clearing nextSessionAtUtc to null when no future sessions exist', async () => {
    const created = await repo.createClientRow({ tenantId: TENANT_A }, draft())
    await repo.setClientNextSessionAtUtc(
      { tenantId: TENANT_A },
      created.clientIndex.id,
      '2026-06-01T09:00:00.000Z', // stale value from a session that has since passed
    )
    const fetchClientSessions = vi.fn(async () => [])

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(result.cleared).toBe(1)
    expect(result.projected).toBe(0)
    expect(result.changes).toEqual([
      {
        clientIndexId: created.clientIndex.id,
        erpCustomerId: ERP_ID_1,
        field:         'nextSessionAtUtc',
        previousValue: '2026-06-01T09:00:00.000Z',
        proposedValue: null,
      },
    ])
  })

  it('ignores cancelled/skipped/completed/no_show sessions via the existing derivation function', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, draft())
    const fetchClientSessions = vi.fn(async () => [
      fdSession({ id: 'fds-1', status: 'cancelled', startAt: new Date('2026-06-16T09:00:00Z') }),
      fdSession({ id: 'fds-2', status: 'skipped', startAt: new Date('2026-06-17T09:00:00Z') }),
      fdSession({ id: 'fds-3', status: 'completed', startAt: new Date('2026-06-18T09:00:00Z') }),
      fdSession({ id: 'fds-4', status: 'no_show', startAt: new Date('2026-06-19T09:00:00Z') }),
    ])

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(result.changes).toEqual([])
    expect(result.unchanged).toBe(1)
  })

  it('preserves tenant scope — only inspects clients in the requested tenant', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, draft({ erpCustomerId: ERP_ID_1, tenantId: TENANT_A }))
    await repo.createClientRow({ tenantId: TENANT_A }, draft({ erpCustomerId: ERP_ID_2, tenantId: TENANT_A }))
    await repo.createClientRow({ tenantId: TENANT_B }, draft({ erpCustomerId: ERP_ID_3, tenantId: TENANT_B }))

    const seenErpIds: string[] = []
    const fetchClientSessions = vi.fn(async (erpCustomerId: string) => {
      seenErpIds.push(erpCustomerId)
      return []
    })

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(result.tenantId).toBe(TENANT_A)
    expect(result.trainerId).toBe(TRAINER_A)
    expect(result.inspected).toBe(2)
    expect(seenErpIds.sort()).toEqual([ERP_ID_1, ERP_ID_2])
    expect(seenErpIds).not.toContain(ERP_ID_3)

    // Tenant B's row is untouched — reconcile never writes, and never even inspected it.
    const tenantBClient = await repo.findClientByErpId({ tenantId: TENANT_B }, ERP_ID_3)
    expect(tenantBClient?.nextSessionAtUtc).toBeNull()
  })

  it('never calls any repository write method (dry-run only, by design)', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, draft())

    const setSpy          = vi.spyOn(repo, 'setClientNextSessionAtUtc')
    const setBillingSpy    = vi.spyOn(repo, 'setBillingModeIfUnset')
    const upsertSpy        = vi.spyOn(repo, 'upsertClientFromBackfill')
    const createSpy        = vi.spyOn(repo, 'createClientRow')
    const completeSpy      = vi.spyOn(repo, 'completeActionIntent')
    const dismissSpy       = vi.spyOn(repo, 'dismissActionIntent')

    const fetchClientSessions = vi.fn(async () => [
      fdSession({ status: 'scheduled', startAt: new Date('2026-06-20T09:00:00Z') }),
    ])

    await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(setSpy).not.toHaveBeenCalled()
    expect(setBillingSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(createSpy).not.toHaveBeenCalled() // not called again beyond the seed above
    expect(completeSpy).not.toHaveBeenCalled()
    expect(dismissSpy).not.toHaveBeenCalled()
  })

  it('never proposes deletion and never includes enrichment fields in proposed changes', async () => {
    const created = await repo.createClientRow(
      { tenantId: TENANT_A },
      draft({ billingMode: 'package' }),
    )
    const fetchClientSessions = vi.fn(async () => [
      fdSession({ status: 'scheduled', startAt: new Date('2026-06-20T09:00:00Z') }),
    ])

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    // Every proposed change is limited to the nextSessionAtUtc projection field.
    for (const change of result.changes) {
      expect(change.field).toBe('nextSessionAtUtc')
      expect(Object.keys(change).sort()).toEqual(
        ['clientIndexId', 'erpCustomerId', 'field', 'previousValue', 'proposedValue'].sort(),
      )
    }

    // Enrichment set at creation time is untouched (reconcile never writes at all).
    const after = await repo.findClientById({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(after?.billingMode).toBe('package')
    expect(after?.whatsappEnabled).toBe(true)
    const goals = await repo.listGoals({ tenantId: TENANT_A }, created.clientIndex.id)
    expect(goals.length).toBe(1)
  })

  it('isolates a per-client session-fetch error into result.errors without aborting the run', async () => {
    await repo.createClientRow({ tenantId: TENANT_A }, draft({ erpCustomerId: ERP_ID_1 }))
    await repo.createClientRow({ tenantId: TENANT_A }, draft({ erpCustomerId: ERP_ID_2 }))

    const fetchClientSessions = vi.fn(async (erpCustomerId: string) => {
      if (erpCustomerId === ERP_ID_1) {
        throw new Error('ERP unavailable')
      }
      return [fdSession({ status: 'scheduled', startAt: new Date('2026-06-20T09:00:00Z') })]
    })

    const result = await reconcileTenantNextSessions(
      repo,
      { tenantId: TENANT_A, trainerId: TRAINER_A, now: NOW },
      fetchClientSessions,
    )

    expect(result.inspected).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.errors).toEqual([
      {
        clientIndexId: expect.any(String),
        erpCustomerId: ERP_ID_1,
        reason:        'ERP unavailable',
      },
    ])
    // The second client still gets a proposed change despite the first client's failure.
    expect(result.projected).toBe(1)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].erpCustomerId).toBe(ERP_ID_2)

    // The failing client's existing (null) projection is not touched/cleared.
    const client1 = await repo.findClientByErpId({ tenantId: TENANT_A }, ERP_ID_1)
    expect(client1?.nextSessionAtUtc).toBeNull()
  })
})
