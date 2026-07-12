/**
 * Integration tests for backfillTenantClients().
 *
 * Uses temp-file SQLite (not :memory:) so Drizzle transactions and selects
 * share the same persistent database within each test.
 *
 * The ERP fetch is injected via a mock fetchCustomers function — no real ERP
 * calls are made in these tests.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import { ClientRepository } from '@/lib/clients/repository'
import { backfillTenantClients } from '@/lib/clients/backfill'
import type { BackfillCustomerRaw } from '@/lib/clients/backfill'

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
    "goal_id" TEXT NOT NULL, "is_primary" INTEGER NOT NULL DEFAULT 0,
    "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
    "trainer_sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
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

const TENANT_A = 'tenant-bf-a'
const TENANT_B = 'tenant-bf-b'

/** Build a valid raw ERP Customer with sensible defaults. */
function makeCustomer(overrides: Partial<BackfillCustomerRaw> = {}): BackfillCustomerRaw {
  return {
    name:                 'CUST-001',
    customer_name:        'Ali Hassan',
    mobile_no:            '+96170555999',
    disabled:             0,
    custom_fitness_goals: 'weight loss',
    creation:             '2026-01-01T00:00:00',
    ...overrides,
  }
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-bf-test-'))
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

// ─── Dry-run mode ─────────────────────────────────────────────────────────────

describe('dry-run mode (default)', () => {
  it('writes nothing to the database when dryRun is true', async () => {
    const fetchCustomers = async () => [makeCustomer()]

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: true },
      fetchCustomers,
    )

    expect(result.inspected).toBe(1)
    expect(result.created).toBe(1)
    expect(result.errors).toHaveLength(0)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients.length).toBe(0)
  })

  it('dry-run counts would-be updates correctly', async () => {
    // Pre-seed a row so the next dry-run sees it as an update
    await repo.upsertClientFromBackfill(
      { tenantId: TENANT_A },
      {
        tenantId: TENANT_A, erpCustomerId: 'CUST-001', fullName: 'Old Name',
        phoneE164: '+96170555999', whatsappEnabled: false,
        primaryGoalLabel: null, primaryGoalId: null,
        goalId: null, subGoalIds: [], goalUrgency: null,
        goalConfidence: 'unknown', goalSource: 'system_inferred',
        safetyFlags: [], goalNotes: null, createdByUserId: null,
      },
    )

    const fetchCustomers = async () => [makeCustomer({ customer_name: 'New Name' })]
    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: true },
      fetchCustomers,
    )

    expect(result.updated).toBe(1)
    expect(result.created).toBe(0)

    // Dry-run: name must not have changed
    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients[0].fullName).toBe('Old Name')
  })
})

// ─── Execute mode ─────────────────────────────────────────────────────────────

describe('execute mode (dryRun: false)', () => {
  it('creates client_index rows when execute is enabled', async () => {
    const fetchCustomers = async () => [makeCustomer()]

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: false },
      fetchCustomers,
    )

    expect(result.inspected).toBe(1)
    expect(result.created).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.errors).toHaveLength(0)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients.length).toBe(1)
    expect(clients[0].erpCustomerId).toBe('CUST-001')
    expect(clients[0].fullName).toBe('Ali Hassan')
    expect(clients[0].phoneE164).toBe('+96170555999')
  })

  it('is idempotent — running execute twice creates exactly one row', async () => {
    const fetchCustomers = async () => [makeCustomer()]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)
    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients.length).toBe(1)
  })

  it('updates safe fields on a second run without creating a duplicate', async () => {
    const fetchCustomers = async () => [makeCustomer()]
    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const fetchUpdated = async () => [makeCustomer({ customer_name: 'Ali Hassan (Updated)' })]
    const result = await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchUpdated)

    expect(result.updated).toBe(1)
    expect(result.created).toBe(0)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients.length).toBe(1)
    expect(clients[0].fullName).toBe('Ali Hassan (Updated)')
  })
})

// ─── Disabled customers ───────────────────────────────────────────────────────

describe('disabled ERP Customers', () => {
  it('skips disabled customers when includeDisabled is not set', async () => {
    const fetchCustomers = async () => [makeCustomer({ disabled: 1 })]

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: false },
      fetchCustomers,
    )

    expect(result.skipped).toBe(1)
    expect(result.created).toBe(0)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients.length).toBe(0)
  })

  it('includes disabled customers when includeDisabled is true', async () => {
    const fetchCustomers = async () => [makeCustomer({ disabled: 1 })]

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: false, includeDisabled: true },
      fetchCustomers,
    )

    expect(result.skipped).toBe(0)
    expect(result.created).toBe(1)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients.length).toBe(1)
  })
})

// ─── Phone handling ───────────────────────────────────────────────────────────

describe('phone normalization', () => {
  it('counts invalidPhone and does not throw for an invalid phone number', async () => {
    const fetchCustomers = async () => [makeCustomer({ mobile_no: 'not-a-phone' })]

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: false },
      fetchCustomers,
    )

    expect(result.invalidPhone).toBe(1)
    expect(result.created).toBe(0)
    expect(result.errors).toHaveLength(0)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients.length).toBe(0)
  })

  it('counts invalidPhone for a missing phone field', async () => {
    const fetchCustomers = async () => [makeCustomer({ mobile_no: undefined })]

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: false },
      fetchCustomers,
    )

    expect(result.invalidPhone).toBe(1)
    expect(result.errors).toHaveLength(0)
  })
})

// ─── Goal handling ────────────────────────────────────────────────────────────

describe('goal handling', () => {
  it('does not throw when custom_fitness_goals contains messy data', async () => {
    const fetchCustomers = async () => [
      makeCustomer({ custom_fitness_goals: '{"broken":json unparseable!@#$' }),
    ]

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: false },
      fetchCustomers,
    )

    expect(result.errors).toHaveLength(0)
    expect(result.created).toBe(1)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients[0].primaryGoalLabel).toBe('{"broken":json unparseable!@#$')
  })

  it('stores clean goal text as primaryGoalLabel', async () => {
    const fetchCustomers = async () => [makeCustomer({ custom_fitness_goals: 'Weight loss' })]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients[0].primaryGoalLabel).toBe('Weight loss')
  })

  it('sets primaryGoalLabel to null when custom_fitness_goals is absent', async () => {
    const fetchCustomers = async () => [makeCustomer({ custom_fitness_goals: undefined })]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients[0].primaryGoalLabel).toBeNull()
  })

  it('normalizes a JSON array with goal_type to a readable label', async () => {
    const fetchCustomers = async () => [
      makeCustomer({ custom_fitness_goals: '[{"goal_type":"fat_loss","focuses":["weight_loss"]}]' }),
    ]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients[0].primaryGoalLabel).toBe('Fat loss')
  })

  it('normalizes a JSON array with multiple goals to comma-separated labels', async () => {
    const fetchCustomers = async () => [
      makeCustomer({
        custom_fitness_goals: '[{"goal_type":"strength","focuses":["max_strength"]},{"goal_type":"muscle_gain","focuses":["hypertrophy"]}]',
      }),
    ]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients[0].primaryGoalLabel).toBe('Strength, Muscle gain')
  })

  it('normalizes a JSON object with a label field to a readable label', async () => {
    const fetchCustomers = async () => [
      makeCustomer({ custom_fitness_goals: '{"label":"Mobility"}' }),
    ]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const clients = await repo.listClients({ tenantId: TENANT_A })
    expect(clients[0].primaryGoalLabel).toBe('Mobility')
  })
})

// ─── Event writing ────────────────────────────────────────────────────────────

describe('client.backfilled events', () => {
  it('writes no events in dry-run mode', async () => {
    const fetchCustomers = async () => [makeCustomer()]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: true }, fetchCustomers)

    const { rows } = await dbClient.execute(
      `SELECT count(*) as cnt FROM client_event WHERE tenant_id = '${TENANT_A}'`,
    )
    expect(rows[0].cnt).toBe(0)
  })

  it('writes a client.backfilled event for each new row in execute mode', async () => {
    const fetchCustomers = async () => [makeCustomer(), makeCustomer({ name: 'CUST-002', customer_name: 'Sara Ahmad', mobile_no: '+96170000002' })]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const { rows } = await dbClient.execute(
      `SELECT count(*) as cnt FROM client_event WHERE tenant_id = '${TENANT_A}' AND type = 'client.backfilled'`,
    )
    expect(rows[0].cnt).toBe(2)
  })

  it('does not write a client.backfilled event on second run (update path)', async () => {
    const fetchCustomers = async () => [makeCustomer()]

    // First run — creates and events
    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    // Second run — updates only, no new event
    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const { rows } = await dbClient.execute(
      `SELECT count(*) as cnt FROM client_event WHERE tenant_id = '${TENANT_A}' AND type = 'client.backfilled'`,
    )
    expect(rows[0].cnt).toBe(1)
  })
})

// ─── Tenant isolation ─────────────────────────────────────────────────────────

describe('tenant isolation', () => {
  it('backfill for tenant A does not create rows in tenant B', async () => {
    const fetchCustomers = async () => [makeCustomer()]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)

    const clientsB = await repo.listClients({ tenantId: TENANT_B })
    expect(clientsB.length).toBe(0)
  })

  it('two tenants can backfill the same erpCustomerId independently', async () => {
    const fetchCustomers = async () => [makeCustomer()]

    await backfillTenantClients(repo, { tenantId: TENANT_A, dryRun: false }, fetchCustomers)
    await backfillTenantClients(repo, { tenantId: TENANT_B, dryRun: false }, fetchCustomers)

    const clientsA = await repo.listClients({ tenantId: TENANT_A })
    const clientsB = await repo.listClients({ tenantId: TENANT_B })

    expect(clientsA.length).toBe(1)
    expect(clientsB.length).toBe(1)
    expect(clientsA[0].tenantId).toBe(TENANT_A)
    expect(clientsB[0].tenantId).toBe(TENANT_B)
  })
})

// ─── fetchCustomers error handling ───────────────────────────────────────────

describe('fetchCustomers failure', () => {
  it('returns a single error entry when fetchCustomers throws', async () => {
    const fetchCustomers = async (): Promise<BackfillCustomerRaw[]> => {
      throw new Error('ERP proxy timed out')
    }

    const result = await backfillTenantClients(
      repo,
      { tenantId: TENANT_A, dryRun: false },
      fetchCustomers,
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].erpCustomerId).toBe('*')
    expect(result.errors[0].reason).toContain('ERP proxy timed out')
    expect(result.inspected).toBe(0)
  })
})
