/**
 * Integration tests for addClient — Phase 4 local row creation.
 *
 * Strategy: mock the external boundaries (next/headers, Better Auth, trainer
 * resolution, ERP adapter, tenant context) and inject a per-test temp-file
 * SQLite database via the @/lib/db hoisted-getter mock, so the REAL
 * ClientRepository writes real rows we can assert on. No real ERP calls.
 */

import { createClient as createLibsqlClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import type { Client } from '@/types'

// Hoisted holder so the @/lib/db mock returns a per-test temp database.
const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }))

vi.mock('@/lib/db', () => ({ get db() { return h.db } }))
vi.mock('next/headers', () => ({ headers: () => ({}) }))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'user-1', name: 'T', email: 't@e.com', phone: null } })) } },
}))
vi.mock('@/lib/trainer', () => ({ ensureTrainerIdForUser: vi.fn(async () => 'trainer-1') }))
vi.mock('@/lib/tenant/context', () => ({ getTenantContext: vi.fn() }))
vi.mock('@/lib/business-data/erp-adapter', () => ({
  createClient: vi.fn(),
  getClientById: vi.fn(),
  getClients: vi.fn(),
  updateClient: vi.fn(),
  // Side-effect primitives — asserted NEVER called by Add Client.
  createInvoice: vi.fn(),
  submitSalesInvoice: vi.fn(),
  createAndSubmitPaymentEntry: vi.fn(),
  createSession: vi.fn(),
}))

import { addClient, findClientDuplicates } from '@/actions/clients'
import * as erp from '@/lib/business-data/erp-adapter'
import { getTenantContext } from '@/lib/tenant/context'
import { ClientRepository } from '@/lib/clients/repository'
import type { ClientCreateDraft } from '@/types/clients'

// ─── DDL (all four client tables — createClientRow writes to all) ───────────────

const CLIENT_TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "erp_customer_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL, "phone_e164" TEXT NOT NULL,
    "whatsapp_enabled" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'active',
    "primary_goal_label" TEXT, "primary_goal_id" TEXT, "safety_state" TEXT NOT NULL DEFAULT 'clear',
    "onboarding_state" TEXT NOT NULL DEFAULT 'not_started', "billing_mode" TEXT NOT NULL DEFAULT 'unset',
    "payment_summary" TEXT NOT NULL DEFAULT 'unset', "next_session_at_utc" TEXT, "last_activity_at_utc" TEXT,
    "possible_duplicate_client_id" TEXT, "duplicate_override_reason" TEXT,
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_index_tenant_erp_idx" ON "client_index" ("tenant_id", "erp_customer_id")`,
  `CREATE TABLE IF NOT EXISTS "client_goal" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "client_index_id" TEXT NOT NULL,
    "erp_customer_id" TEXT NOT NULL, "goal_id" TEXT NOT NULL, "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
    "urgency" TEXT NOT NULL DEFAULT 'active_focus', "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL DEFAULT 'system_inferred', "safety_flags_json" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'active', "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_action_intent" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "client_index_id" TEXT NOT NULL,
    "erp_customer_id" TEXT NOT NULL, "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal', "source" TEXT NOT NULL DEFAULT 'system', "reason" TEXT,
    "due_at_utc" TEXT, "completed_at_utc" TEXT, "dismissed_at_utc" TEXT, "expires_at_utc" TEXT,
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "client_event" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "client_index_id" TEXT, "erp_customer_id" TEXT,
    "type" TEXT NOT NULL, "payload_json" TEXT NOT NULL DEFAULT '{}', "created_by_user_id" TEXT,
    "created_at_utc" TEXT NOT NULL
  )`,
]

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

let tempDir: string
let dbClient: ReturnType<typeof createLibsqlClient>

function erpClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'CUST-100', firstName: 'Sara', lastName: 'Ahmad', name: 'Sara Ahmad',
    phone: '+96170000001', status: 'active', trainerId: '', sessionCount: 0,
    goal: undefined, createdAt: '2026-01-01', ...overrides,
  }
}

function tenantCtx(tenantId: string | null) {
  return { userId: 'user-1', slug: null, tenantId, provisioningStatus: null, lastSyncedAt: null }
}

const PAYLOAD = {
  customer_name: 'Sara Ahmad',
  customer_type: 'Individual',
  customer_group: 'Individual',
  territory: 'All Territories',
  mobile_no: '+96170000001',
  custom_fitness_goals: '[{"label":"fat_loss","value":"fat_loss"}]',
  status: 'Active' as const,
}

async function count(table: string, where = '1=1'): Promise<number> {
  const { rows } = await dbClient.execute(`SELECT count(*) AS c FROM ${table} WHERE ${where}`)
  return Number(rows[0].c)
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-addclient-test-'))
  dbClient = createLibsqlClient({ url: `file:${join(tempDir, 'test.db')}` })
  for (const sql of CLIENT_TABLES_DDL) await dbClient.execute(sql)
  h.db = drizzle(dbClient, { schema })

  vi.clearAllMocks()
  vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

// ─── ERP success + local success ────────────────────────────────────────────────

describe('addClient — ERP success + local success', () => {
  it('writes client_index, client_goal, inert intents, and client.created event', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    const result = await addClient(PAYLOAD)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.id).toBe('CUST-100') // returned id stays ERP docname

    expect(await count('client_index')).toBe(1)
    expect(await count('client_index', `erp_customer_id = 'CUST-100'`)).toBe(1) // erpCustomerId = docname
    expect(await count('client_goal')).toBe(1)
    expect(await count('client_action_intent')).toBe(3) // inert suggestions
    expect(await count('client_event', `type = 'client.created'`)).toBe(1)
  })

  it('maps a clean trainer goal to confidence=high / source=trainer_manual', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD)

    const { rows } = await dbClient.execute(`SELECT goal_id, confidence, source FROM client_goal LIMIT 1`)
    expect(rows[0].goal_id).toBe('fat_loss')
    expect(rows[0].confidence).toBe('high')
    expect(rows[0].source).toBe('trainer_manual')
  })

  it('creates NO client_goal row for messy goal data but still creates the client', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    const result = await addClient({ ...PAYLOAD, custom_fitness_goals: 'just lose weight' })

    expect(result.success).toBe(true)
    expect(await count('client_index')).toBe(1)
    expect(await count('client_goal')).toBe(0) // no fabricated structured goal
    const { rows } = await dbClient.execute(`SELECT primary_goal_label FROM client_index LIMIT 1`)
    expect(rows[0].primary_goal_label).toBe('just lose weight')
  })

  it('does NOT trigger any invoice/payment/session side effects', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD)

    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
  })
})

// ─── ERP failure ────────────────────────────────────────────────────────────────

describe('addClient — ERP failure', () => {
  it('returns an error and writes no local rows', async () => {
    vi.mocked(erp.createClient).mockRejectedValue(new Error('ERP down'))

    const result = await addClient(PAYLOAD)

    expect(result.success).toBe(false)
    expect(await count('client_index')).toBe(0)
    expect(await count('client_goal')).toBe(0)
    expect(await count('client_event')).toBe(0)
  })
})

// ─── ERP success + local failure ─────────────────────────────────────────────────

describe('addClient — ERP success but local write fails', () => {
  it('does not delete/modify the ERP Customer and returns a recoverable error', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    // Force the local transaction to throw: remove the target table.
    await dbClient.execute(`DROP TABLE "client_index"`)

    const result = await addClient(PAYLOAD)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('needs repair')

    // ERP Customer must be left intact — no delete/modify call.
    expect(erp.updateClient).not.toHaveBeenCalled()
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })
})

// ─── Tenant isolation ─────────────────────────────────────────────────────────────

describe('addClient — tenant isolation', () => {
  it('writes the row only under the active tenant', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    await addClient(PAYLOAD)

    expect(await count('client_index', `tenant_id = '${TENANT_A}'`)).toBe(1)
    expect(await count('client_index', `tenant_id = '${TENANT_B}'`)).toBe(0)
  })
})

// ─── findClientDuplicates (Phase 6) ──────────────────────────────────────────────

async function seedClient(tenantId: string, phoneE164: string, erpCustomerId: string) {
  const repo = new ClientRepository(h.db)
  const draft: ClientCreateDraft = {
    tenantId, erpCustomerId, fullName: 'Seed Client', phoneE164, whatsappEnabled: false,
    primaryGoalLabel: null, primaryGoalId: null, goalId: null, subGoalIds: [], goalUrgency: null,
    goalConfidence: 'unknown', goalSource: 'system_inferred', safetyFlags: [], goalNotes: null,
    createdByUserId: null,
  }
  await repo.upsertClientFromBackfill({ tenantId }, draft)
}

describe('findClientDuplicates', () => {
  it('detects an exact-phone duplicate in the same tenant and exposes the ERP docname', async () => {
    await seedClient(TENANT_A, '+96170555000', 'CUST-DUP')
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await findClientDuplicates('+96170555000')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].matchType).toBe('exact_phone')
      expect(result.data[0].erpCustomerId).toBe('CUST-DUP') // Open existing uses ERP docname
    }
  })

  it('does NOT surface a duplicate from another tenant', async () => {
    await seedClient(TENANT_B, '+96170555000', 'CUST-OTHER')
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await findClientDuplicates('+96170555000')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(0)
  })

  it('returns empty when there is no duplicate', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await findClientDuplicates('+96170555111')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(0)
  })

  it('returns empty for an unnormalizable phone', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await findClientDuplicates('not-a-phone')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(0)
  })

  it('fails open with empty list when there is no tenant context', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(null))
    const result = await findClientDuplicates('+96170555000')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(0)
  })
})

// ─── addClient — duplicate override (Phase 6) ────────────────────────────────────

describe('addClient — duplicate override', () => {
  it('with a reason: stores override columns and writes a duplicate.override event', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await addClient(PAYLOAD, {
      overrideDuplicate: true,
      duplicateOverrideReason: 'Different person',
      possibleDuplicateClientId: 'existing-local-id',
    })

    expect(result.success).toBe(true)
    expect(await count('client_index', `possible_duplicate_client_id = 'existing-local-id'`)).toBe(1)
    expect(await count('client_index', `duplicate_override_reason = 'Different person'`)).toBe(1)
    expect(await count('client_event', `type = 'duplicate.override'`)).toBe(1)
    expect(await count('client_event', `type = 'client.created'`)).toBe(1)
  })

  it('blocks server-side when override is requested without a reason — no ERP call, no rows', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await addClient(PAYLOAD, { overrideDuplicate: true, duplicateOverrideReason: '   ' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('reason is required')
    expect(erp.createClient).not.toHaveBeenCalled()
    expect(await count('client_index')).toBe(0)
  })

  it('normal create writes no duplicate.override event and no override columns', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    await addClient(PAYLOAD)

    expect(await count('client_event', `type = 'duplicate.override'`)).toBe(0)
    expect(await count('client_index', `possible_duplicate_client_id IS NOT NULL`)).toBe(0)
  })
})
