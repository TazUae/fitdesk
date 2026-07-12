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
import { mkdtempSync, readFileSync, rmSync } from 'fs'
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

vi.mock('@/lib/erpnext/client', () => ({
  getCustomerBillingMode: vi.fn(),
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

// US-048 — deliverWhatsAppReminderAction pulls in sendMessage (actions/messages.ts),
// which transitively imports these. Mocked here the same way messages.test.ts does,
// so no real Evolution call is ever reachable from this test file.
vi.mock('@/lib/evolution', () => ({
  sendWhatsAppMessage: vi.fn(),
  normalizePhone: (phone: string) => phone.replace(/\D/g, ''),
}))
vi.mock('@/lib/pilot', () => ({
  isPilotMode:    () => false,
  matchAllowlist: () => ({ allowed: true }),
}))
vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// "US-038" (per the batch label) — createMissingNextSessionSignalAction reads
// live FD Sessions via findSessionsForClient. Mocked so tests control the
// exact session list without a real ERP fetch.
vi.mock('@/lib/scheduling/sessionRepository', () => ({
  findSessionsForClient: vi.fn(),
}))

import { addClient, completeClientAction, dismissClientAction, findClientDuplicates, parseClientDetails, syncClientBillingMode, setWhatsAppConsentAction, createWhatsAppReminderCandidateAction, deliverWhatsAppReminderAction, createMissingNextSessionSignalAction, addClientNoteAction, addProgressEntryAction } from '@/actions/clients'
import * as evolution from '@/lib/evolution'
import * as schedulingRepo from '@/lib/scheduling/sessionRepository'
import type { FDSession } from '@/types/scheduling'

const CLIENTS_ACTION_SRC = readFileSync(join(__dirname, 'clients.ts'), 'utf-8')
import * as erp from '@/lib/business-data/erp-adapter'
import * as erpNext from '@/lib/erpnext/client'
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
    "whatsapp_enabled" INTEGER NOT NULL DEFAULT 0, "whatsapp_consent_state" TEXT NOT NULL DEFAULT 'unknown', "status" TEXT NOT NULL DEFAULT 'active',
    "primary_goal_label" TEXT, "primary_goal_id" TEXT, "safety_state" TEXT NOT NULL DEFAULT 'clear',
    "onboarding_state" TEXT NOT NULL DEFAULT 'not_started', "billing_mode" TEXT NOT NULL DEFAULT 'unset',
    "payment_summary" TEXT NOT NULL DEFAULT 'unset', "next_session_at_utc" TEXT, "last_activity_at_utc" TEXT,
    "possible_duplicate_client_id" TEXT, "duplicate_override_reason" TEXT,
    "created_at_utc" TEXT NOT NULL, "updated_at_utc" TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_index_tenant_erp_idx" ON "client_index" ("tenant_id", "erp_customer_id")`,
  `CREATE TABLE IF NOT EXISTS "client_goal" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "client_index_id" TEXT NOT NULL,
    "erp_customer_id" TEXT NOT NULL, "goal_id" TEXT NOT NULL,
    "is_primary" INTEGER NOT NULL DEFAULT 0, "sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
    "trainer_sub_goal_ids_json" TEXT NOT NULL DEFAULT '[]',
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
  `CREATE TABLE IF NOT EXISTS "message_log" (
    "id" TEXT NOT NULL PRIMARY KEY, "trainer_id" TEXT NOT NULL, "client_id" TEXT NOT NULL,
    "message_type" TEXT NOT NULL, "body" TEXT NOT NULL, "status" TEXT NOT NULL,
    "error_detail" TEXT, "sent_at" TEXT NOT NULL, "evolution_message_id" TEXT
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

// ─── addClient — clientStatedSubGoals (Phase 4.3) ────────────────────────────────

describe('addClient — clientStatedSubGoals', () => {
  it('persists canonical sub-goal ID in sub_goal_ids_json when a valid sub-goal is supplied', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD, { clientStatedSubGoals: { fat_loss: 'reduce_total_body_fat' } })

    const { rows } = await dbClient.execute(`SELECT sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].sub_goal_ids_json))).toEqual(['reduce_total_body_fat'])
  })

  it('persists [] in sub_goal_ids_json when no sub-goals are supplied', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD)

    const { rows } = await dbClient.execute(`SELECT sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].sub_goal_ids_json))).toEqual([])
  })

  it('keeps trainer_sub_goal_ids_json as [] — no trainer-assessed sub-goals at intake', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD, { clientStatedSubGoals: { fat_loss: 'reduce_total_body_fat' } })

    const { rows } = await dbClient.execute(`SELECT trainer_sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].trainer_sub_goal_ids_json))).toEqual([])
  })

  it('ERP createClient receives the same payload — custom_fitness_goals is unchanged', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD, { clientStatedSubGoals: { fat_loss: 'reduce_total_body_fat' } })

    const call = vi.mocked(erp.createClient).mock.calls[0][0]
    expect(call.custom_fitness_goals).toBe(PAYLOAD.custom_fitness_goals)
  })

  it('does NOT trigger invoice/payment/session side effects when sub-goals are supplied', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(PAYLOAD, { clientStatedSubGoals: { fat_loss: 'reduce_total_body_fat' } })

    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
  })
})

// ─── addClient — primaryGoal (Phase 4C-B Smart Accordion) ────────────────────────

describe('addClient — primaryGoal', () => {
  // The Smart Accordion serializes canonical goal IDs + a human label, primary first.
  const CANONICAL_PAYLOAD = {
    ...PAYLOAD,
    custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]',
  }

  it('persists the primary goal row with is_primary = 1', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(CANONICAL_PAYLOAD, {
      primaryGoal: { goalId: 'fat-loss', subGoalIds: [], trainerSubGoalIds: [], urgency: 'active_focus' },
    })

    const { rows } = await dbClient.execute(`SELECT goal_id, is_primary FROM client_goal LIMIT 1`)
    expect(rows[0].goal_id).toBe('fat-loss')
    expect(Number(rows[0].is_primary)).toBe(1)
  })

  it('persists client-stated sub-goals to sub_goal_ids_json', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(CANONICAL_PAYLOAD, {
      primaryGoal: {
        goalId: 'fat-loss',
        subGoalIds: ['reduce_total_body_fat', 'boost_daily_energy_levels'],
        trainerSubGoalIds: [],
        urgency: 'active_focus',
      },
    })

    const { rows } = await dbClient.execute(`SELECT sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].sub_goal_ids_json))).toEqual([
      'reduce_total_body_fat', 'boost_daily_energy_levels',
    ])
  })

  it('persists trainer-assessed sub-goals to trainer_sub_goal_ids_json', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(CANONICAL_PAYLOAD, {
      primaryGoal: {
        goalId: 'fat-loss',
        subGoalIds: [],
        trainerSubGoalIds: ['preserve_skeletal_muscle_mass'],
        urgency: 'active_focus',
      },
    })

    const { rows } = await dbClient.execute(`SELECT trainer_sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].trainer_sub_goal_ids_json))).toEqual(['preserve_skeletal_muscle_mass'])
  })

  it('persists urgency from the primary goal config', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(CANONICAL_PAYLOAD, {
      primaryGoal: { goalId: 'fat-loss', subGoalIds: [], trainerSubGoalIds: [], urgency: 'urgent' },
    })

    const { rows } = await dbClient.execute(`SELECT urgency FROM client_goal LIMIT 1`)
    expect(rows[0].urgency).toBe('urgent')
  })

  it('passes custom_fitness_goals through to ERP unchanged (canonical values)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(CANONICAL_PAYLOAD, {
      primaryGoal: { goalId: 'fat-loss', subGoalIds: [], trainerSubGoalIds: [], urgency: 'active_focus' },
    })

    const call = vi.mocked(erp.createClient).mock.calls[0][0]
    expect(call.custom_fitness_goals).toBe(CANONICAL_PAYLOAD.custom_fitness_goals)
  })

  it('writes a single client_goal row (non-primary goals reach ERP only, not local rows)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    // Two selected goals; the accordion lists the primary first in custom_fitness_goals.
    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"},{"label":"Strength & Power","value":"strength"}]' },
      { primaryGoal: { goalId: 'fat-loss', subGoalIds: [], trainerSubGoalIds: [], urgency: 'active_focus' } },
    )

    // Single-row model: only the primary goal is projected locally in this phase.
    expect(await count('client_goal')).toBe(1)
    const { rows } = await dbClient.execute(`SELECT goal_id, is_primary FROM client_goal LIMIT 1`)
    expect(rows[0].goal_id).toBe('fat-loss')
    expect(Number(rows[0].is_primary)).toBe(1)
  })

  it('does NOT trigger invoice/payment/session side effects', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(CANONICAL_PAYLOAD, {
      primaryGoal: { goalId: 'fat-loss', subGoalIds: ['reduce_total_body_fat'], trainerSubGoalIds: [], urgency: 'urgent' },
    })

    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
  })
})

// ─── addClient — selectedGoals (multi-goal, Phase 4D) ────────────────────────────

describe('addClient — selectedGoals (multi-goal)', () => {
  const MULTI_GOAL_PAYLOAD = {
    ...PAYLOAD,
    custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"},{"label":"Strength & Power","value":"strength"}]',
  }

  it('legacy bridge: primaryGoal alone maps to 1 client_goal row with the correct fields', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' },
      { primaryGoal: { goalId: 'fat-loss', subGoalIds: [], trainerSubGoalIds: [], urgency: 'urgent' } },
    )

    expect(await count('client_goal')).toBe(1)
    const { rows } = await dbClient.execute(`SELECT goal_id, is_primary, urgency FROM client_goal LIMIT 1`)
    expect(rows[0].goal_id).toBe('fat-loss')
    expect(Number(rows[0].is_primary)).toBe(1)
    expect(rows[0].urgency).toBe('urgent')
  })

  it('isPrimary invariant: returns error before ERP call when 0 goals are primary', async () => {
    const result = await addClient(MULTI_GOAL_PAYLOAD, {
      selectedGoals: [
        { goalId: 'fat-loss', isPrimary: false, urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        { goalId: 'strength', isPrimary: false, urgency: 'background',   clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('primary')
    expect(erp.createClient).not.toHaveBeenCalled()
    expect(await count('client_goal')).toBe(0)
  })

  it('isPrimary invariant: returns error before ERP call when 2 goals are both primary', async () => {
    const result = await addClient(MULTI_GOAL_PAYLOAD, {
      selectedGoals: [
        { goalId: 'fat-loss', isPrimary: true, urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        { goalId: 'strength', isPrimary: true, urgency: 'background',   clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('primary')
    expect(erp.createClient).not.toHaveBeenCalled()
    expect(await count('client_goal')).toBe(0)
  })

  it('persists N client_goal rows when selectedGoals has N items', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(MULTI_GOAL_PAYLOAD, {
      selectedGoals: [
        { goalId: 'fat-loss', isPrimary: true,  urgency: 'urgent',       clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        { goalId: 'strength', isPrimary: false, urgency: 'background',   clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
      ],
    })

    expect(await count('client_goal')).toBe(2)
    expect(await count('client_goal', `goal_id = 'fat-loss' AND is_primary = 1`)).toBe(1)
    expect(await count('client_goal', `goal_id = 'strength' AND is_primary = 0`)).toBe(1)
  })

  it('persists per-goal urgency independently', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(MULTI_GOAL_PAYLOAD, {
      selectedGoals: [
        { goalId: 'fat-loss', isPrimary: true,  urgency: 'urgent',     clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        { goalId: 'strength', isPrimary: false, urgency: 'background', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
      ],
    })

    const { rows } = await dbClient.execute(`SELECT goal_id, urgency FROM client_goal ORDER BY is_primary DESC`)
    const byGoal = Object.fromEntries(rows.map(r => [r.goal_id, r.urgency]))
    expect(byGoal['fat-loss']).toBe('urgent')
    expect(byGoal['strength']).toBe('background')
  })

  it('persists per-goal trainerNotes to the notes column', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' },
      {
        selectedGoals: [{
          goalId: 'fat-loss', isPrimary: true, urgency: 'active_focus',
          clientSubGoalIds: [], trainerSubGoalIds: [],
          trainerNotes: 'focus on deficit phase',
        }],
      },
    )

    const { rows } = await dbClient.execute(`SELECT notes FROM client_goal WHERE goal_id = 'fat-loss'`)
    expect(rows[0].notes).toBe('focus on deficit phase')
  })

  it('persists clientSubGoalIds to sub_goal_ids_json (layer:primary)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' },
      {
        selectedGoals: [{
          goalId: 'fat-loss', isPrimary: true, urgency: 'active_focus',
          clientSubGoalIds: ['reduce_total_body_fat'],
          trainerSubGoalIds: [],
          trainerNotes: null,
        }],
      },
    )

    const { rows } = await dbClient.execute(`SELECT sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].sub_goal_ids_json))).toEqual(['reduce_total_body_fat'])
  })

  it('persists trainerSubGoalIds to trainer_sub_goal_ids_json (layer:secondary)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' },
      {
        selectedGoals: [{
          goalId: 'fat-loss', isPrimary: true, urgency: 'active_focus',
          clientSubGoalIds: [],
          trainerSubGoalIds: ['preserve_skeletal_muscle_mass'],
          trainerNotes: null,
        }],
      },
    )

    const { rows } = await dbClient.execute(`SELECT trainer_sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].trainer_sub_goal_ids_json))).toEqual(['preserve_skeletal_muscle_mass'])
  })

  it('cross-layer sub-goals are silently dropped server-side (layer integrity enforced)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    // preserve_skeletal_muscle_mass is layer:'secondary' — invalid as a clientSubGoalId
    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' },
      {
        selectedGoals: [{
          goalId: 'fat-loss', isPrimary: true, urgency: 'active_focus',
          clientSubGoalIds: ['preserve_skeletal_muscle_mass'],
          trainerSubGoalIds: [],
          trainerNotes: null,
        }],
      },
    )

    const { rows } = await dbClient.execute(`SELECT sub_goal_ids_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(rows[0].sub_goal_ids_json))).toEqual([])
  })

  it('ERP createClient receives custom_fitness_goals unchanged (ERP proxy untouched)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(MULTI_GOAL_PAYLOAD, {
      selectedGoals: [
        { goalId: 'fat-loss', isPrimary: true,  urgency: 'urgent',     clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        { goalId: 'strength', isPrimary: false, urgency: 'background', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
      ],
    })

    const call = vi.mocked(erp.createClient).mock.calls[0][0]
    expect(call.custom_fitness_goals).toBe(MULTI_GOAL_PAYLOAD.custom_fitness_goals)
  })

  it('does NOT trigger invoice/payment/session/WhatsApp side effects', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(MULTI_GOAL_PAYLOAD, {
      selectedGoals: [
        { goalId: 'fat-loss', isPrimary: true,  urgency: 'urgent',     clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        { goalId: 'strength', isPrimary: false, urgency: 'background', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
      ],
    })

    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
  })
})

// ─── addClient — goal safety (Phase 3: server-side hard-conflict + safetyState) ──
//
// Reuses the existing GOAL_CONFLICT_RULES (lib/goals/conflicts.ts) and
// computeSafetyFlags/deriveSafetyState (lib/goals/safety.ts) — no new taxonomy
// or rules are invented here. The only hard conflict currently defined in the
// repo is underweight + fat-loss; the only two goals carrying mandatory safety
// interactions are rehab (injury_risk) and postnatal (prenatal_postnatal), both
// of which currently map to needs_review via deriveSafetyState.

describe('addClient — goal safety (Phase 3)', () => {
  it('a valid, non-conflicting goal payload still passes (baseline sanity check)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    const result = await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' },
      {
        selectedGoals: [
          { goalId: 'fat-loss', isPrimary: true, urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        ],
      },
    )

    expect(result.success).toBe(true)
    expect(erp.createClient).toHaveBeenCalledTimes(1)
    expect(await count('client_index')).toBe(1)
  })

  it('hard conflict (underweight + fat-loss): rejected before ERP Customer creation, no local rows', async () => {
    const result = await addClient(
      {
        ...PAYLOAD,
        custom_fitness_goals: '[{"label":"Safe Weight Gain","value":"underweight"},{"label":"Fat Loss","value":"fat-loss"}]',
      },
      {
        selectedGoals: [
          { goalId: 'underweight', isPrimary: true,  urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
          { goalId: 'fat-loss',    isPrimary: false, urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        ],
      },
    )

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('contraindicated')
    expect(erp.createClient).not.toHaveBeenCalled()
    expect(await count('client_index')).toBe(0)
    expect(await count('client_goal')).toBe(0)
  })

  it('hard conflict cannot be bypassed by a crafted payload that skips the UI entirely', async () => {
    // Simulates calling the server action directly with a hard-conflicting
    // selectedGoals array — the exact bypass the UI's own hard-conflict
    // intercept exists to prevent, reaching addClient with no UI in the loop.
    // custom_fitness_goals deliberately does NOT mention the conflicting pair,
    // proving the guard checks selectedGoals itself, not just the free-text field.
    const result = await addClient(
      { ...PAYLOAD, custom_fitness_goals: 'looks clean, unrelated to selectedGoals below' },
      {
        selectedGoals: [
          { goalId: 'underweight', isPrimary: true,  urgency: 'urgent', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
          { goalId: 'fat-loss',    isPrimary: false, urgency: 'urgent', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        ],
      },
    )

    expect(result.success).toBe(false)
    expect(erp.createClient).not.toHaveBeenCalled()
    expect(await count('client_index')).toBe(0)
    expect(await count('client_event')).toBe(0)
  })

  // Closest existing rule to "rehab/pain-sensitive goal requires safety context":
  // GOAL_SAFETY_FLAGS maps 'rehab' -> 'injury_risk' unconditionally (no separate
  // pain-note-conditional rule exists in the repo today), and deriveSafetyState
  // transitions client_index.safetyState to 'needs_review' whenever any safety
  // flag is present. This is the rule this test exercises.
  it('rehab goal: transitions client_index.safety_state to needs_review (injury_risk flag)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Rehabilitation & Recovery","value":"rehab"}]' },
      {
        selectedGoals: [
          { goalId: 'rehab', isPrimary: true, urgency: 'urgent', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        ],
      },
    )

    const { rows } = await dbClient.execute(`SELECT safety_state FROM client_index LIMIT 1`)
    expect(rows[0].safety_state).toBe('needs_review')
    const goalRows = await dbClient.execute(`SELECT safety_flags_json FROM client_goal LIMIT 1`)
    expect(JSON.parse(String(goalRows.rows[0].safety_flags_json))).toEqual(['injury_risk'])
  })

  // Closest existing rule to "postnatal/medical safety-sensitive goal handling":
  // GOAL_SAFETY_FLAGS maps 'postnatal' -> 'prenatal_postnatal', which likewise
  // drives deriveSafetyState to 'needs_review' at goal-save time (not deferred
  // to program generation).
  it('postnatal goal: transitions client_index.safety_state to needs_review (prenatal_postnatal flag)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Pre & Postnatal Fitness","value":"postnatal"}]' },
      {
        selectedGoals: [
          { goalId: 'postnatal', isPrimary: true, urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        ],
      },
    )

    const { rows } = await dbClient.execute(`SELECT safety_state FROM client_index LIMIT 1`)
    expect(rows[0].safety_state).toBe('needs_review')
  })

  it('plain fat-loss goal: client_index.safety_state stays clear (no false-positive safety flag)', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' },
      {
        selectedGoals: [
          { goalId: 'fat-loss', isPrimary: true, urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        ],
      },
    )

    const { rows } = await dbClient.execute(`SELECT safety_state FROM client_index LIMIT 1`)
    expect(rows[0].safety_state).toBe('clear')
  })

  it('legacy primaryGoal bridge (single goal): a lone goal can never trigger a hard conflict', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())

    const result = await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Safe Weight Gain","value":"underweight"}]' },
      { primaryGoal: { goalId: 'underweight', subGoalIds: [], trainerSubGoalIds: [], urgency: 'active_focus' } },
    )

    expect(result.success).toBe(true)
    expect(erp.createClient).toHaveBeenCalledTimes(1)
  })

  it('does NOT trigger invoice/payment/session side effects when a hard conflict is rejected', async () => {
    await addClient(
      { ...PAYLOAD, custom_fitness_goals: '[{"label":"Safe Weight Gain","value":"underweight"},{"label":"Fat Loss","value":"fat-loss"}]' },
      {
        selectedGoals: [
          { goalId: 'underweight', isPrimary: true,  urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
          { goalId: 'fat-loss',    isPrimary: false, urgency: 'active_focus', clientSubGoalIds: [], trainerSubGoalIds: [], trainerNotes: null },
        ],
      },
    )

    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
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

  it('US-047: applies uniformly to a whatsapp_reminder_candidate (US-050) — a trainer declining a suggested reminder', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    const clientIndexId = rows[0].id as string
    await setWhatsAppConsentAction('CUST-100', 'opted_in')
    const created = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')
    if (!created.success || created.data.outcome !== 'created') throw new Error('expected created')

    const result = await dismissClientAction(created.data.intent.id)

    expect(result.success).toBe(true)
    const { rows: intentRows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${created.data.intent.id}'`,
    )
    expect(intentRows[0].status).toBe('dismissed')
  })
})


describe('syncClientBillingMode', () => {
  async function seedClient(payload: Parameters<typeof addClient>[0] = PAYLOAD): Promise<void> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await addClient(payload)
    expect(result.success).toBe(true)
  }

  it('syncs ERP Pay Per Session into an unset local client billing mode', async () => {
    await seedClient()
    vi.mocked(erpNext.getCustomerBillingMode).mockResolvedValue('pay_per_session')

    const result = await syncClientBillingMode('CUST-100')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toMatchObject({ applied: true, mode: 'pay_per_session' })

    const { rows } = await dbClient.execute(`SELECT billing_mode FROM client_index WHERE erp_customer_id = 'CUST-100'`)
    expect(rows[0].billing_mode).toBe('pay_per_session')
    expect(await count('client_event', `type = 'client.billing_mode_synced'`)).toBe(1)
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    expect(erp.createSession).not.toHaveBeenCalled()
  })

  it('does not overwrite an existing package billing mode or call ERP billing lookup', async () => {
    await seedClient()
    await dbClient.execute(`UPDATE client_index SET billing_mode = 'package' WHERE erp_customer_id = 'CUST-100'`)

    const result = await syncClientBillingMode('CUST-100')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toMatchObject({ applied: false, mode: 'package', reason: 'already_set' })
    expect(erpNext.getCustomerBillingMode).not.toHaveBeenCalled()

    const { rows } = await dbClient.execute(`SELECT billing_mode FROM client_index WHERE erp_customer_id = 'CUST-100'`)
    expect(rows[0].billing_mode).toBe('package')
    expect(await count('client_event', `type = 'client.billing_mode_synced'`)).toBe(0)
  })

  it('returns erp_unset when ERP has no canonical billing mode', async () => {
    await seedClient()
    vi.mocked(erpNext.getCustomerBillingMode).mockResolvedValue(null)

    const result = await syncClientBillingMode('CUST-100')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toMatchObject({ applied: false, reason: 'erp_unset' })

    const { rows } = await dbClient.execute(`SELECT billing_mode FROM client_index WHERE erp_customer_id = 'CUST-100'`)
    expect(rows[0].billing_mode).toBe('unset')
    expect(await count('client_event', `type = 'client.billing_mode_synced'`)).toBe(0)
  })

  it('returns success:false when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await syncClientBillingMode('CUST-100')

    expect(result.success).toBe(false)
    expect(erpNext.getCustomerBillingMode).not.toHaveBeenCalled()
  })
})

describe('setWhatsAppConsentAction (US-059)', () => {
  async function seedClient(payload: Parameters<typeof addClient>[0] = PAYLOAD): Promise<void> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await addClient(payload)
    expect(result.success).toBe(true)
  }

  it('a newly added client defaults to unknown consent', async () => {
    await seedClient()
    const { rows } = await dbClient.execute(
      `SELECT whatsapp_consent_state FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    expect(rows[0].whatsapp_consent_state).toBe('unknown')
  })

  it('opts a client in — writes state and an audit event, sends no WhatsApp message', async () => {
    await seedClient()

    const result = await setWhatsAppConsentAction('CUST-100', 'opted_in')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.whatsappConsentState).toBe('opted_in')

    const { rows } = await dbClient.execute(
      `SELECT whatsapp_consent_state FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    expect(rows[0].whatsapp_consent_state).toBe('opted_in')
    expect(await count('client_event', `type = 'client.whatsapp_consent_changed'`)).toBe(1)
  })

  it('opts a client out — writes state and an audit event', async () => {
    await seedClient()

    const result = await setWhatsAppConsentAction('CUST-100', 'opted_out')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.whatsappConsentState).toBe('opted_out')
    expect(await count('client_event', `type = 'client.whatsapp_consent_changed'`)).toBe(1)
  })

  it('returns success:false for an unknown erpCustomerId — fails closed', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await setWhatsAppConsentAction('CUST-DOES-NOT-EXIST', 'opted_in')
    expect(result.success).toBe(false)
  })

  it('returns success:false when not authenticated — never mutates', async () => {
    await seedClient()
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await setWhatsAppConsentAction('CUST-100', 'opted_in')

    expect(result.success).toBe(false)
    const { rows } = await dbClient.execute(
      `SELECT whatsapp_consent_state FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    expect(rows[0].whatsapp_consent_state).toBe('unknown')
  })

  it('returns success:false when tenant context is unavailable — never mutates', async () => {
    await seedClient()
    vi.mocked(getTenantContext).mockResolvedValueOnce(null)

    const result = await setWhatsAppConsentAction('CUST-100', 'opted_in')

    expect(result.success).toBe(false)
    const { rows } = await dbClient.execute(
      `SELECT whatsapp_consent_state FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    expect(rows[0].whatsapp_consent_state).toBe('unknown')
  })
})

describe('createWhatsAppReminderCandidateAction (US-050)', () => {
  async function seedClient(payload: Parameters<typeof addClient>[0] = PAYLOAD): Promise<string> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await addClient(payload)
    expect(result.success).toBe(true)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    return rows[0].id as string
  }

  it('blocks and creates no candidate for opted_out — no override', async () => {
    const clientIndexId = await seedClient()
    await setWhatsAppConsentAction('CUST-100', 'opted_out')

    const result = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ outcome: 'blocked', reason: 'opted_out' })
    expect(await count('client_action_intent', `type = 'whatsapp_reminder_candidate'`)).toBe(0)
  })

  it('blocks and creates no candidate for unknown consent — not treated as auto-send permission', async () => {
    const clientIndexId = await seedClient()

    const result = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ outcome: 'blocked', reason: 'consent_unknown' })
    expect(await count('client_action_intent', `type = 'whatsapp_reminder_candidate'`)).toBe(0)
  })

  it('creates a pending candidate for opted_in — a trainer-approved suggestion, never sent', async () => {
    const clientIndexId = await seedClient()
    await setWhatsAppConsentAction('CUST-100', 'opted_in')

    const result = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')

    expect(result.success).toBe(true)
    if (result.success && result.data.outcome === 'created') {
      expect(result.data.intent.status).toBe('pending')
      expect(result.data.intent.type).toBe('whatsapp_reminder_candidate')
    } else {
      throw new Error('expected outcome: created')
    }
    expect(await count('client_action_intent', `type = 'whatsapp_reminder_candidate' AND status = 'pending'`)).toBe(1)
  })

  it('candidate requires trainer approval — completeClientAction transitions it out of pending', async () => {
    const clientIndexId = await seedClient()
    await setWhatsAppConsentAction('CUST-100', 'opted_in')
    const created = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')
    if (!created.success || created.data.outcome !== 'created') throw new Error('expected created')

    const completed = await completeClientAction(created.data.intent.id)
    expect(completed.success).toBe(true)
    expect(await count('client_action_intent', `type = 'whatsapp_reminder_candidate' AND status = 'pending'`)).toBe(0)
  })

  it('returns success:false when not authenticated — never creates a candidate', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')

    expect(result.success).toBe(false)
    expect(await count('client_action_intent', `type = 'whatsapp_reminder_candidate'`)).toBe(0)
  })

  it('tenant isolation: tenant A cannot create a candidate for a client belonging to tenant B', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx('tenant-b'))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    const clientIndexId = rows[0].id as string

    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ outcome: 'client_not_found' })
  })
})

describe('deliverWhatsAppReminderAction (US-048)', () => {
  async function seedOptedInCandidate(): Promise<{ intentId: string; clientIndexId: string }> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    const clientIndexId = rows[0].id as string

    await setWhatsAppConsentAction('CUST-100', 'opted_in')
    const created = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')
    if (!created.success || created.data.outcome !== 'created') throw new Error('expected created')

    return { intentId: created.data.intent.id, clientIndexId }
  }

  beforeEach(() => {
    vi.mocked(evolution.sendWhatsAppMessage).mockReset()
  })

  it('opted_in allows explicit trainer-approved delivery — uses the existing sendMessage abstraction only', async () => {
    const { intentId } = await seedOptedInCandidate()
    vi.mocked(evolution.sendWhatsAppMessage).mockResolvedValue({ success: true, messageId: 'evo-msg-1' })

    const result = await deliverWhatsAppReminderAction(intentId, 'Your package is running low — want to renew?')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.delivered).toBe(true)
    expect(evolution.sendWhatsAppMessage).toHaveBeenCalledOnce()
    expect(await count('message_log', `message_type = 'reminder' AND status = 'sent'`)).toBe(1)
  })

  it('successful delivery completes the candidate only after send success', async () => {
    const { intentId } = await seedOptedInCandidate()
    vi.mocked(evolution.sendWhatsAppMessage).mockResolvedValue({ success: true, messageId: 'evo-msg-1' })

    await deliverWhatsAppReminderAction(intentId, 'Your package is running low — want to renew?')

    const { rows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('completed')
  })

  it('failed send leaves the candidate pending/retryable — does not complete or dismiss it', async () => {
    const { intentId } = await seedOptedInCandidate()
    vi.mocked(evolution.sendWhatsAppMessage).mockResolvedValue({ success: false, error: 'Evolution timeout' })

    const result = await deliverWhatsAppReminderAction(intentId, 'Your package is running low — want to renew?')

    expect(result.success).toBe(false)
    const { rows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('pending')
  })

  it('opted_out blocks delivery — never calls sendMessage/sendWhatsAppMessage', async () => {
    const { intentId } = await seedOptedInCandidate()
    await setWhatsAppConsentAction('CUST-100', 'opted_out')

    const result = await deliverWhatsAppReminderAction(intentId, 'Your package is running low — want to renew?')

    expect(result.success).toBe(false)
    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
    const { rows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('pending')
  })

  it('unknown consent blocks delivery — re-verified at send time, not just trusted from candidate creation', async () => {
    // A candidate can only be created while opted_in (US-050), but consent can
    // change again before the trainer clicks send — this proves the send path
    // re-checks live consent rather than trusting the state at creation time.
    const { intentId } = await seedOptedInCandidate()
    await setWhatsAppConsentAction('CUST-100', 'unknown')

    const result = await deliverWhatsAppReminderAction(intentId, 'test body')

    expect(result.success).toBe(false)
    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
    const { rows } = await dbClient.execute(
      `SELECT status FROM client_action_intent WHERE id = '${intentId}'`,
    )
    expect(rows[0].status).toBe('pending')
  })

  it('rejects delivery for a non-existent intent id', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await deliverWhatsAppReminderAction('nonexistent-intent-id', 'test body')
    expect(result.success).toBe(false)
    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('rejects delivery for an intent that is not a whatsapp_reminder_candidate', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient(PAYLOAD)
    // addClient seeds default intents (send_whatsapp_welcome, etc.) — grab one of those.
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_action_intent WHERE type = 'send_whatsapp_welcome' LIMIT 1`,
    )
    const otherIntentId = rows[0].id as string

    const result = await deliverWhatsAppReminderAction(otherIntentId, 'test body')

    expect(result.success).toBe(false)
    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('rejects delivery for an already-completed candidate — no double-send', async () => {
    const { intentId } = await seedOptedInCandidate()
    vi.mocked(evolution.sendWhatsAppMessage).mockResolvedValue({ success: true, messageId: 'evo-msg-1' })
    await deliverWhatsAppReminderAction(intentId, 'first send')
    vi.mocked(evolution.sendWhatsAppMessage).mockClear()

    const second = await deliverWhatsAppReminderAction(intentId, 'second send attempt')

    expect(second.success).toBe(false)
    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('US-047: rejects delivery for an already-dismissed candidate — a trainer declining a suggestion is exactly as final as completing one', async () => {
    const { intentId } = await seedOptedInCandidate()
    const dismissed = await dismissClientAction(intentId)
    expect(dismissed.success).toBe(true)

    const result = await deliverWhatsAppReminderAction(intentId, 'attempted send after dismissal')

    expect(result.success).toBe(false)
    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('tenant isolation: tenant A cannot deliver a reminder for tenant B\'s candidate', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx('tenant-b'))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    const clientIndexId = rows[0].id as string
    await setWhatsAppConsentAction('CUST-100', 'opted_in')
    const created = await createWhatsAppReminderCandidateAction(clientIndexId, 'package running low')
    if (!created.success || created.data.outcome !== 'created') throw new Error('expected created')

    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await deliverWhatsAppReminderAction(created.data.intent.id, 'test body')

    expect(result.success).toBe(false)
    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('does not call any invoice, payment, or package-consumption function', async () => {
    const { intentId } = await seedOptedInCandidate()
    vi.mocked(evolution.sendWhatsAppMessage).mockResolvedValue({ success: true, messageId: 'evo-msg-1' })

    await deliverWhatsAppReminderAction(intentId, 'test body')

    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })
})

describe('createMissingNextSessionSignalAction ("US-038" per the batch label)', () => {
  function fdSession(overrides: Partial<FDSession> = {}): FDSession {
    return {
      id:                     'fds-001',
      tenantId:               '',
      trainerId:              'trainer-1',
      clientId:               'CUST-100',
      clientName:             'Test Client',
      seriesId:               null,
      startAt:                new Date('2026-01-05T09:00:00Z'),
      endAt:                  new Date('2026-01-05T10:00:00Z'),
      durationMinutes:        60,
      timezone:               'UTC',
      status:                 'completed',
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

  async function seedClient(): Promise<string> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    return rows[0].id as string
  }

  beforeEach(() => {
    vi.mocked(schedulingRepo.findSessionsForClient).mockReset()
  })

  it('a client with session history and no upcoming session gets a pending action intent', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(schedulingRepo.findSessionsForClient).mockResolvedValue([
      fdSession({ status: 'completed', startAt: new Date('2026-01-01T09:00:00Z') }),
    ])

    const result = await createMissingNextSessionSignalAction(clientIndexId)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.outcome).toBe('created')
    expect(await count('client_action_intent', `type = 'missing_next_session' AND status = 'pending'`)).toBe(1)
  })

  it('a client with a future scheduled session does not get a signal — not_needed', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(schedulingRepo.findSessionsForClient).mockResolvedValue([
      fdSession({ status: 'scheduled', startAt: new Date(Date.now() + 7 * 86_400_000) }),
    ])

    const result = await createMissingNextSessionSignalAction(clientIndexId)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ outcome: 'not_needed', reason: 'has_upcoming_session' })
    expect(await count('client_action_intent', `type = 'missing_next_session'`)).toBe(0)
  })

  it('a brand-new client with zero session history does not get a signal — that is Add Client\'s job, not this one\'s', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(schedulingRepo.findSessionsForClient).mockResolvedValue([])

    const result = await createMissingNextSessionSignalAction(clientIndexId)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ outcome: 'not_needed', reason: 'no_session_history' })
    expect(await count('client_action_intent', `type = 'missing_next_session'`)).toBe(0)
  })

  it('duplicate prevention: calling it twice for the same client only ever creates one pending intent', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(schedulingRepo.findSessionsForClient).mockResolvedValue([
      fdSession({ status: 'completed', startAt: new Date('2026-01-01T09:00:00Z') }),
    ])

    await createMissingNextSessionSignalAction(clientIndexId)
    const second = await createMissingNextSessionSignalAction(clientIndexId)

    expect(second.success).toBe(true)
    if (second.success) expect(second.data.outcome).toBe('already_pending')
    expect(await count('client_action_intent', `type = 'missing_next_session'`)).toBe(1)
  })

  it('never auto-books — does not call bookSession/createSession/any booking function', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(schedulingRepo.findSessionsForClient).mockResolvedValue([
      fdSession({ status: 'completed', startAt: new Date('2026-01-01T09:00:00Z') }),
    ])

    await createMissingNextSessionSignalAction(clientIndexId)

    expect(erp.createSession).not.toHaveBeenCalled()
  })

  it('does not send any WhatsApp message', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(schedulingRepo.findSessionsForClient).mockResolvedValue([
      fdSession({ status: 'completed', startAt: new Date('2026-01-01T09:00:00Z') }),
    ])

    await createMissingNextSessionSignalAction(clientIndexId)

    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('does not create or submit an invoice, or record a payment', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(schedulingRepo.findSessionsForClient).mockResolvedValue([
      fdSession({ status: 'completed', startAt: new Date('2026-01-01T09:00:00Z') }),
    ])

    await createMissingNextSessionSignalAction(clientIndexId)

    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('tenant isolation: tenant A cannot create a signal for tenant B\'s client', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx('tenant-b'))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    const clientIndexId = rows[0].id as string

    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await createMissingNextSessionSignalAction(clientIndexId)

    expect(result.success).toBe(false)
  })

  it('returns success:false when not authenticated', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await createMissingNextSessionSignalAction(clientIndexId)

    expect(result.success).toBe(false)
  })
})

describe('addClientNoteAction (US-053)', () => {
  async function seedClient(): Promise<string> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    return rows[0].id as string
  }

  it('writes a client.note event with the trimmed text', async () => {
    const clientIndexId = await seedClient()

    const result = await addClientNoteAction(clientIndexId, '  Great session today  ')

    expect(result.success).toBe(true)
    expect(await count('client_event', `type = 'client.note'`)).toBe(1)
  })

  it('rejects an empty (or whitespace-only) note', async () => {
    const clientIndexId = await seedClient()

    const result = await addClientNoteAction(clientIndexId, '   ')

    expect(result.success).toBe(false)
    expect(await count('client_event', `type = 'client.note'`)).toBe(0)
  })

  it('rejects a note longer than 500 characters', async () => {
    const clientIndexId = await seedClient()

    const result = await addClientNoteAction(clientIndexId, 'x'.repeat(501))

    expect(result.success).toBe(false)
    expect(await count('client_event', `type = 'client.note'`)).toBe(0)
  })

  it('returns success:false for a non-existent clientIndexId', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await addClientNoteAction('nonexistent-id', 'some note')

    expect(result.success).toBe(false)
  })

  it('tenant isolation: tenant A cannot add a note to tenant B\'s client', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx('tenant-b'))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    const clientIndexId = rows[0].id as string

    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await addClientNoteAction(clientIndexId, 'sneaky note')

    expect(result.success).toBe(false)
    expect(await count('client_event', `type = 'client.note'`)).toBe(0)
  })

  it('does not send any WhatsApp message, invoice, or payment', async () => {
    const clientIndexId = await seedClient()

    await addClientNoteAction(clientIndexId, 'A note')

    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('returns success:false when not authenticated', async () => {
    const clientIndexId = await seedClient()
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await addClientNoteAction(clientIndexId, 'some note')

    expect(result.success).toBe(false)
  })
})

describe('addProgressEntryAction (US-052)', () => {
  async function seedClientWithGoal(): Promise<string> {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    return rows[0].id as string
  }

  it('writes a client.progress event with no goal link', async () => {
    const clientIndexId = await seedClientWithGoal()

    const result = await addProgressEntryAction(clientIndexId, '  Ran 5k without stopping  ')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.outcome).toBe('created')
    expect(await count('client_event', `type = 'client.progress'`)).toBe(1)
  })

  it('links to the client\'s own goal when goalId is a valid IntakeGoalId the client actually has', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    // Canonical IntakeGoalId values use hyphens (lib/goals/taxonomy.ts) — 'fat-loss', not
    // the module-level PAYLOAD's underscore 'fat_loss' (which is stored as-is but is not
    // itself a recognized canonical id, so isIntakeGoalId would reject it).
    await addClient({ ...PAYLOAD, custom_fitness_goals: '[{"label":"Fat Loss","value":"fat-loss"}]' })
    const { rows } = await dbClient.execute(`SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`)
    const clientIndexId = rows[0].id as string
    expect(await count('client_goal', `goal_id = 'fat-loss'`)).toBe(1)

    const result = await addProgressEntryAction(clientIndexId, 'Down a dress size', 'fat-loss')

    expect(result.success).toBe(true)
    if (result.success && result.data.outcome === 'created') {
      expect(result.data.event.payloadJson).toEqual({ text: 'Down a dress size', goalId: 'fat-loss' })
    } else {
      throw new Error('expected created')
    }
  })

  it('returns invalid_goal_link when goalId is a real IntakeGoalId but not one of this client\'s goals', async () => {
    const clientIndexId = await seedClientWithGoal()

    const result = await addProgressEntryAction(clientIndexId, 'text', 'mobility')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.outcome).toBe('invalid_goal_link')
    expect(await count('client_event', `type = 'client.progress'`)).toBe(0)
  })

  it('silently drops a goalId that is not a known IntakeGoalId at all — stored as no link, not an error', async () => {
    const clientIndexId = await seedClientWithGoal()

    const result = await addProgressEntryAction(clientIndexId, 'text', 'not-a-real-goal-id')

    expect(result.success).toBe(true)
    if (result.success && result.data.outcome === 'created') {
      expect(result.data.event.payloadJson).toEqual({ text: 'text', goalId: null })
    } else {
      throw new Error('expected created')
    }
  })

  it('rejects an empty (or whitespace-only) progress entry', async () => {
    const clientIndexId = await seedClientWithGoal()

    const result = await addProgressEntryAction(clientIndexId, '   ')

    expect(result.success).toBe(false)
    expect(await count('client_event', `type = 'client.progress'`)).toBe(0)
  })

  it('rejects a progress entry longer than 500 characters', async () => {
    const clientIndexId = await seedClientWithGoal()

    const result = await addProgressEntryAction(clientIndexId, 'x'.repeat(501))

    expect(result.success).toBe(false)
    expect(await count('client_event', `type = 'client.progress'`)).toBe(0)
  })

  it('returns outcome client_not_found for a non-existent clientIndexId (consistent with the sibling US-050/US-038 actions)', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))

    const result = await addProgressEntryAction('nonexistent-id', 'some entry')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.outcome).toBe('client_not_found')
  })

  it('tenant isolation: tenant A cannot add a progress entry to tenant B\'s client', async () => {
    vi.mocked(erp.createClient).mockResolvedValue(erpClient())
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx('tenant-b'))
    await addClient(PAYLOAD)
    const { rows } = await dbClient.execute(
      `SELECT id FROM client_index WHERE erp_customer_id = 'CUST-100'`,
    )
    const clientIndexId = rows[0].id as string

    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
    const result = await addProgressEntryAction(clientIndexId, 'sneaky entry')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.outcome).toBe('client_not_found')
    expect(await count('client_event', `type = 'client.progress'`)).toBe(0)
  })

  it('does not send any WhatsApp message, invoice, or payment', async () => {
    const clientIndexId = await seedClientWithGoal()

    await addProgressEntryAction(clientIndexId, 'An entry')

    expect(evolution.sendWhatsAppMessage).not.toHaveBeenCalled()
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('returns success:false when not authenticated', async () => {
    const clientIndexId = await seedClientWithGoal()
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never)

    const result = await addProgressEntryAction(clientIndexId, 'some entry')

    expect(result.success).toBe(false)
  })
})

// ─── Source invariants — WhatsApp send boundary in actions/clients.ts ─────────
//
// Candidate CREATION (US-050) never sends. Candidate DELIVERY (US-048) does
// eventually send — but only by calling the existing sendMessage() action
// (actions/messages.ts), never by importing lib/evolution or Evolution API
// concepts directly. Both properties are checked separately below so this
// suite stays accurate as the file's responsibilities grow.

describe('actions/clients.ts source — no direct Evolution import; delivery goes through sendMessage only', () => {
  it('does not import lib/evolution or call sendWhatsAppMessage directly — only via sendMessage', () => {
    expect(CLIENTS_ACTION_SRC).not.toContain('sendWhatsAppMessage')
    expect(CLIENTS_ACTION_SRC).not.toContain('lib/evolution')
  })

  it('delivers only by importing and calling the existing sendMessage action', () => {
    expect(CLIENTS_ACTION_SRC).toContain("from '@/actions/messages'")
    expect(CLIENTS_ACTION_SRC).toContain('sendMessage(')
  })

  it('does not write to message_log directly — sendMessage already owns that audit write', () => {
    // Checks actual usage, not prose — this file's own doc comments describe
    // what createWhatsAppReminderCandidateAction/deliverWhatsAppReminderAction
    // do NOT do, which legitimately mentions "message_log" descriptively
    // without ever importing/inserting into it directly.
    expect(CLIENTS_ACTION_SRC).not.toContain('schema.messageLog')
    expect(CLIENTS_ACTION_SRC).not.toContain("from '@/lib/db/schema'")
  })

  it('does not create or submit an invoice, and does not consume a package', () => {
    expect(CLIENTS_ACTION_SRC).not.toContain('createInvoice')
    expect(CLIENTS_ACTION_SRC).not.toContain('submitSalesInvoice')
    expect(CLIENTS_ACTION_SRC).not.toContain('consumeForSession')
    expect(CLIENTS_ACTION_SRC).not.toContain('PackageConsumptionService')
  })
})
