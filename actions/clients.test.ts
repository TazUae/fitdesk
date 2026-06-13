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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
  // Side-effect primitives — asserted NEVER called by Add Client or AI parse.
  createInvoice: vi.fn(),
  submitSalesInvoice: vi.fn(),
  createAndSubmitPaymentEntry: vi.fn(),
  createSession: vi.fn(),
}))

vi.mock('@/lib/clients/ai-parse', () => ({
  parseClientText:    vi.fn(),
  failedParseResult:  vi.fn(() => ({
    state: 'failed',
    fields: {
      fullName:        { value: null, confidence: 'unknown', source: 'ai_parse' },
      phone:           { value: null, confidence: 'unknown', source: 'ai_parse' },
      whatsappEnabled: { value: null, confidence: 'unknown', source: 'ai_parse' },
      goals:           { value: [],   confidence: 'unknown', source: 'ai_parse' },
      notes:           { value: null, confidence: 'unknown', source: 'ai_parse' },
    },
  })),
}))

import { addClient, completeClientAction, dismissClientAction, findClientDuplicates, parseClientDetails } from '@/actions/clients'
import * as erp from '@/lib/business-data/erp-adapter'
import * as aiParse from '@/lib/clients/ai-parse'
import { auth } from '@/lib/auth'
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

  it('persists whatsappEnabled:true to client_index.whatsapp_enabled', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD, { whatsappEnabled: true })

    const { rows } = await dbClient.execute(`SELECT whatsapp_enabled FROM client_index LIMIT 1`)
    expect(Number(rows[0].whatsapp_enabled)).toBe(1)
  })

  it('stores whatsapp_enabled as 0 when option is absent', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD)

    const { rows } = await dbClient.execute(`SELECT whatsapp_enabled FROM client_index LIMIT 1`)
    expect(Number(rows[0].whatsapp_enabled)).toBe(0)
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

// ─── parseClientDetails (Phase 5) ────────────────────────────────────────────

describe('parseClientDetails', () => {
  const mockPartialResult = {
    state: 'partial_success' as const,
    fields: {
      fullName:        { value: 'Sara Ahmad', confidence: 'high' as const, source: 'ai_parse' as const },
      phone:           { value: '+96170555000', confidence: 'high' as const, source: 'ai_parse' as const },
      whatsappEnabled: { value: true, confidence: 'high' as const, source: 'ai_parse' as const },
      goals:           { value: ['fat_loss'], confidence: 'high' as const, source: 'ai_parse' as const },
      notes:           { value: null, confidence: 'unknown' as const, source: 'ai_parse' as const },
    },
  }

  it('returns success:false when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await parseClientDetails('Sara Ahmad 70 000 000')
    expect(result.success).toBe(false)
    expect(aiParse.parseClientText).not.toHaveBeenCalled()
  })

  it('returns success:true with the parser result on parse success', async () => {
    vi.mocked(aiParse.parseClientText).mockResolvedValue(mockPartialResult)

    const result = await parseClientDetails('Sara Ahmad 70 000 000')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.state).toBe('partial_success')
      expect(result.data.fields.fullName.value).toBe('Sara Ahmad')
    }
  })

  it('returns success:true with failed state when parseClientText unexpectedly throws', async () => {
    vi.mocked(aiParse.parseClientText).mockRejectedValue(new Error('unexpected'))

    const result = await parseClientDetails('some text')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.state).toBe('failed')
  })

  it('returns success:true with failed state for empty input', async () => {
    const result = await parseClientDetails('   ')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.state).toBe('failed')
    expect(aiParse.parseClientText).not.toHaveBeenCalled()
  })

  it('does NOT call ERP createClient, createInvoice, payment, or session', async () => {
    vi.mocked(aiParse.parseClientText).mockResolvedValue(mockPartialResult)

    await parseClientDetails('Sara Ahmad')

    expect(erp.createClient).not.toHaveBeenCalled()
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
  })

  it('duplicate detection is untouched — addClient still runs Phase 6 duplicate check on submit', async () => {
    // addClient flow is separate from parseClientDetails; this verifies they are independent.
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const addResult = await addClient(PAYLOAD)
    expect(addResult.success).toBe(true)
    // parseClientText was NOT called by addClient (duplicate detection is in findClientDuplicates)
    expect(aiParse.parseClientText).not.toHaveBeenCalled()
  })
})

// ─── completeClientAction (Phase 7) ──────────────────────────────────────────

describe('completeClientAction', () => {
  async function seedAndGetIntentId(): Promise<string> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_action_intent WHERE status = 'pending' LIMIT 1`,
    )
    return String(rows[0].id)
  }

  it('marks the intent as completed in the database', async () => {
    const intentId = await seedAndGetIntentId()

    const result = await completeClientAction(intentId)

    expect(result.success).toBe(true)
    const { rows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('completed')
  })

  it('writes an action_intent.completed audit event', async () => {
    const intentId = await seedAndGetIntentId()
    await completeClientAction(intentId)

    const { rows } = await dbClient.execute(
      `SELECT count(*) AS c FROM client_event WHERE type = 'action_intent.completed'`,
    )
    expect(Number(rows[0].c)).toBe(1)
  })

  it('does NOT call ERP createClient, invoice, payment, or session', async () => {
    const intentId = await seedAndGetIntentId()
    vi.clearAllMocks()
    // Re-set needed mocks only — deliberately NOT re-setting ERP adapters
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1', name: 'T', email: 't@e.com', phone: null } } as never)
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    await completeClientAction(intentId)

    expect(erp.createClient).not.toHaveBeenCalled()
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.updateClient).not.toHaveBeenCalled()
  })

  it('returns success:false when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await completeClientAction('any-id')
    expect(result.success).toBe(false)
  })

  it('returns success:false for a non-existent intentId (no mutation)', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await completeClientAction('ghost-id')
    expect(result.success).toBe(false)
  })

  it('returns success:false when cross-tenant intentId is used', async () => {
    const intentId = await seedAndGetIntentId()
    // Switch to a different tenant for the action call
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_B))

    const result = await completeClientAction(intentId)
    expect(result.success).toBe(false)

    // Original intent is still pending
    const { rows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('pending')
  })
})

// ─── dismissClientAction (Phase 7) ───────────────────────────────────────────

describe('dismissClientAction', () => {
  async function seedAndGetIntentId(): Promise<string> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient({ ...PAYLOAD, mobile_no: '+96170000099' })
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_action_intent WHERE status = 'pending' LIMIT 1`,
    )
    return String(rows[0].id)
  }

  it('marks the intent as dismissed in the database', async () => {
    const intentId = await seedAndGetIntentId()

    const result = await dismissClientAction(intentId)

    expect(result.success).toBe(true)
    const { rows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('dismissed')
  })

  it('writes an action_intent.dismissed audit event', async () => {
    const intentId = await seedAndGetIntentId()
    await dismissClientAction(intentId)

    const { rows } = await dbClient.execute(
      `SELECT count(*) AS c FROM client_event WHERE type = 'action_intent.dismissed'`,
    )
    expect(Number(rows[0].c)).toBe(1)
  })

  it('does NOT call ERP createClient, invoice, payment, or session', async () => {
    const intentId = await seedAndGetIntentId()
    vi.clearAllMocks()
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1', name: 'T', email: 't@e.com', phone: null } } as never)
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    await dismissClientAction(intentId)

    expect(erp.createClient).not.toHaveBeenCalled()
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
    expect(erp.updateClient).not.toHaveBeenCalled()
  })

  it('returns success:false when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await dismissClientAction('any-id')
    expect(result.success).toBe(false)
  })

  it('returns success:false for a non-existent intentId', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await dismissClientAction('ghost-id')
    expect(result.success).toBe(false)
  })
})
