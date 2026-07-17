/**
 * Orchestration tests for getDirectoryClients + isLocalDirectoryEnabled.
 *
 * Strategy:
 *  - @/lib/db is mocked to a per-test temp-file SQLite database (a real
 *    ClientRepository runs against it — repository-backed, consistent with
 *    Phase 1/2 tests).
 *  - @/lib/tenant/context and @/actions/clients (the ERP fallback) are mocked.
 *
 * No real ERP calls, no auth, no WhatsApp/payment/scheduling are touched.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import type { ActionResult, Client } from '@/types'
import type { ClientCreateDraft } from '@/types/clients'

// Hoisted holder so the @/lib/db mock can return a per-test temp database.
const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }))

vi.mock('@/lib/db', () => ({ get db() { return h.db } }))
vi.mock('@/lib/tenant/context', () => ({ getTenantContext: vi.fn() }))
vi.mock('@/actions/clients', () => ({ fetchClients: vi.fn() }))

import { getDirectoryClients, isLocalDirectoryEnabled } from '@/lib/clients/directory'
import { getTenantContext } from '@/lib/tenant/context'
import { fetchClients } from '@/actions/clients'
import { ClientRepository } from '@/lib/clients/repository'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CLIENT_INDEX_DDL = [
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
]

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

const ERP_RESULT: ActionResult<Client[]> = {
  success: true,
  data: [{
    id: 'ERP-SENTINEL', firstName: 'ERP', name: 'ERP Path', phone: '+9610000000',
    status: 'active', trainerId: '', sessionCount: 0, createdAt: '2026-01-01',
  } as Client],
}

let tempDir: string
let dbClient: ReturnType<typeof createClient>

function tenantCtx(tenantId: string | null) {
  return { userId: 'u1', slug: null, tenantId, provisioningStatus: null, lastSyncedAt: null }
}

function enableLocal(tenants?: string) {
  process.env.FITDESK_CLIENT_DIRECTORY_LOCAL_READ = '1'
  if (tenants !== undefined) process.env.FITDESK_CLIENT_DIRECTORY_LOCAL_TENANTS = tenants
}

async function seedClient(
  database: ReturnType<typeof drizzle>,
  tenantId: string,
  overrides: Partial<ClientCreateDraft> = {},
) {
  const repo = new ClientRepository(database)
  await repo.upsertClientFromBackfill({ tenantId }, {
    tenantId,
    erpCustomerId:    'CUST-001',
    fullName:         'Ali Hassan',
    phoneE164:        '+96170555999',
    whatsappEnabled:  false,
    primaryGoalLabel: 'Weight loss',
    primaryGoalId:    null,
    goalId:           null,
    subGoalIds:       [],
    goalUrgency:      null,
    goalConfidence:   'unknown',
    goalSource:       'system_inferred',
    safetyFlags:      [],
    goalNotes:        null,
    createdByUserId:  null,
    ...overrides,
  })
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-dir-test-'))
  dbClient = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  for (const sql of CLIENT_INDEX_DDL) await dbClient.execute(sql)
  h.db = drizzle(dbClient, { schema })

  vi.clearAllMocks()
  vi.mocked(fetchClients).mockResolvedValue(ERP_RESULT)
  vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(TENANT_A))
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
  delete process.env.FITDESK_CLIENT_DIRECTORY_LOCAL_READ
  delete process.env.FITDESK_CLIENT_DIRECTORY_LOCAL_TENANTS
})

// ─── isLocalDirectoryEnabled (pure flag logic) ─────────────────────────────────

describe('isLocalDirectoryEnabled', () => {
  it('is false when the flag is unset', () => {
    expect(isLocalDirectoryEnabled(TENANT_A)).toBe(false)
  })
  it('is false when the flag is not exactly "1"', () => {
    process.env.FITDESK_CLIENT_DIRECTORY_LOCAL_READ = 'true'
    expect(isLocalDirectoryEnabled(TENANT_A)).toBe(false)
  })
  it('is true when the flag is "1" and no allowlist is set', () => {
    enableLocal()
    expect(isLocalDirectoryEnabled(TENANT_A)).toBe(true)
  })
  it('is false for an empty tenantId even with the flag on', () => {
    enableLocal()
    expect(isLocalDirectoryEnabled('')).toBe(false)
  })
  it('is false when an allowlist excludes the tenant', () => {
    enableLocal('tenant-x,tenant-y')
    expect(isLocalDirectoryEnabled(TENANT_A)).toBe(false)
  })
  it('is true when an allowlist includes the tenant', () => {
    enableLocal('tenant-a,tenant-b')
    expect(isLocalDirectoryEnabled(TENANT_A)).toBe(true)
  })
})

// ─── getDirectoryClients ───────────────────────────────────────────────────────

describe('getDirectoryClients', () => {
  it('uses the ERP path when the flag is disabled (default)', async () => {
    await seedClient(h.db, TENANT_A) // present but must be ignored

    const result = await getDirectoryClients()

    expect(fetchClients).toHaveBeenCalledTimes(1)
    expect(result).toEqual(ERP_RESULT)
  })

  it('uses the local path when the flag is enabled and local rows exist', async () => {
    enableLocal()
    await seedClient(h.db, TENANT_A)

    const result = await getDirectoryClients()

    expect(fetchClients).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('CUST-001') // erpCustomerId, not local UUID
      expect(result.data[0].name).toBe('Ali Hassan')
    }
  })

  it('falls back to ERP when the local query throws (table missing)', async () => {
    enableLocal()
    await dbClient.execute(`DROP TABLE "client_index"`)

    const result = await getDirectoryClients()

    expect(fetchClients).toHaveBeenCalledTimes(1)
    expect(result).toEqual(ERP_RESULT)
  })

  it('falls back to ERP when the local table is empty (tenant not backfilled)', async () => {
    enableLocal()
    // no seed → 0 rows

    const result = await getDirectoryClients()

    expect(fetchClients).toHaveBeenCalledTimes(1)
    expect(result).toEqual(ERP_RESULT)
  })

  it('uses the ERP path when an allowlist excludes the tenant', async () => {
    enableLocal('tenant-x')
    await seedClient(h.db, TENANT_A)

    const result = await getDirectoryClients()

    expect(fetchClients).toHaveBeenCalledTimes(1)
    expect(result).toEqual(ERP_RESULT)
  })

  it('uses the local path when an allowlist includes the tenant', async () => {
    enableLocal('tenant-a,tenant-b')
    await seedClient(h.db, TENANT_A)

    const result = await getDirectoryClients()

    expect(fetchClients).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    if (result.success) expect(result.data[0].id).toBe('CUST-001')
  })

  it('uses the ERP path when there is no tenant context', async () => {
    enableLocal()
    vi.mocked(getTenantContext).mockResolvedValue(tenantCtx(null))

    const result = await getDirectoryClients()

    expect(fetchClients).toHaveBeenCalledTimes(1)
    expect(result).toEqual(ERP_RESULT)
  })

  it('enforces tenant isolation — only the current tenant rows are returned', async () => {
    enableLocal()
    await seedClient(h.db, TENANT_A, { erpCustomerId: 'CUST-001', fullName: 'Ali Hassan' })
    await seedClient(h.db, TENANT_B, { erpCustomerId: 'CUST-002', fullName: 'Other Tenant', phoneE164: '+96170000002' })

    const result = await getDirectoryClients() // context = TENANT_A

    expect(fetchClients).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('CUST-001')
      expect(result.data.some((c) => c.id === 'CUST-002')).toBe(false)
    }
  })
})
