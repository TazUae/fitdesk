/**
 * Integration tests for PackageConsumptionService.
 *
 * Uses a unique temp-file SQLite database per test. No ERP dependency.
 * Covers: happy path, ledger event shape, idempotency, no_package, no_balance,
 *         expired package exclusion, multi-package selection, tenant isolation,
 *         input validation, source invariants.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import {
  PackageConsumptionService,
  type TenantCtx,
  type ConsumeSessionInput,
} from '@/lib/billing/package-consumption-service'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'

// ─── DDL (kept in sync with scripts/migrate-app.mjs) ─────────────────────────

const SETUP_DDL = [
  `CREATE TABLE IF NOT EXISTS "client_index" (
    "id"                           TEXT NOT NULL PRIMARY KEY,
    "tenant_id"                    TEXT NOT NULL,
    "erp_customer_id"              TEXT NOT NULL,
    "full_name"                    TEXT NOT NULL,
    "phone_e164"                   TEXT NOT NULL,
    "whatsapp_enabled"             INTEGER NOT NULL DEFAULT 0,
    "status"                       TEXT NOT NULL DEFAULT 'active',
    "primary_goal_label"           TEXT,
    "primary_goal_id"              TEXT,
    "safety_state"                 TEXT NOT NULL DEFAULT 'clear',
    "onboarding_state"             TEXT NOT NULL DEFAULT 'not_started',
    "billing_mode"                 TEXT NOT NULL DEFAULT 'unset',
    "payment_summary"              TEXT NOT NULL DEFAULT 'unset',
    "next_session_at_utc"          TEXT,
    "last_activity_at_utc"         TEXT,
    "possible_duplicate_client_id" TEXT,
    "duplicate_override_reason"    TEXT,
    "created_at_utc"               TEXT NOT NULL,
    "updated_at_utc"               TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_index_tenant_erp_idx"
    ON "client_index" ("tenant_id", "erp_customer_id")`,

  `CREATE TABLE IF NOT EXISTS "package_template" (
    "id"                     TEXT NOT NULL PRIMARY KEY,
    "tenant_id"              TEXT NOT NULL,
    "name"                   TEXT NOT NULL,
    "description"            TEXT,
    "template_type"          TEXT NOT NULL DEFAULT 'standard_block'
                               CHECK ("template_type" IN ('standard_block','complimentary','promotional')),
    "session_count"          INTEGER NOT NULL CHECK ("session_count" > 0),
    "price_amount"           INTEGER NOT NULL DEFAULT 0 CHECK ("price_amount" >= 0),
    "currency"               TEXT NOT NULL CHECK (length("currency") = 3),
    "expiry_days"            INTEGER CHECK ("expiry_days" IS NULL OR "expiry_days" > 0),
    "erp_item_code"          TEXT,
    "status"                 TEXT NOT NULL DEFAULT 'draft'
                               CHECK ("status" IN ('draft','active','archived')),
    "first_sold_at_utc"      TEXT,
    "supersedes_template_id" TEXT,
    "archived_at_utc"        TEXT,
    "created_at_utc"         TEXT NOT NULL,
    "updated_at_utc"         TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS "client_package_purchase" (
    "id"                     TEXT NOT NULL PRIMARY KEY,
    "tenant_id"              TEXT NOT NULL,
    "client_index_id"        TEXT NOT NULL,
    "erp_customer_id"        TEXT NOT NULL,
    "package_template_id"    TEXT NOT NULL,
    "template_snapshot_json" TEXT NOT NULL
                               CHECK (length("template_snapshot_json") > 0
                                      AND json_valid("template_snapshot_json")),
    "erp_sales_invoice_id"   TEXT,
    "idempotency_key"        TEXT,
    "payment_status"         TEXT NOT NULL DEFAULT 'pending'
                               CHECK ("payment_status" IN ('pending','unpaid','partially_paid','paid','refunded')),
    "package_status"         TEXT NOT NULL DEFAULT 'pending_activation'
                               CHECK ("package_status" IN ('pending_activation','active','expired','refunded','cancelled')),
    "purchased_at_utc"       TEXT NOT NULL,
    "activated_at_utc"       TEXT CHECK ("activated_at_utc" IS NULL OR "activated_at_utc" >= "purchased_at_utc"),
    "expires_at_utc"         TEXT CHECK ("expires_at_utc" IS NULL OR "expires_at_utc" >= "purchased_at_utc"),
    "created_at_utc"         TEXT NOT NULL,
    "updated_at_utc"         TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "client_package_purchase_tenant_client_idx"
    ON "client_package_purchase" ("tenant_id", "client_index_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "client_package_purchase_tenant_idempotency_uq"
    ON "client_package_purchase" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS "package_ledger" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "tenant_id"           TEXT NOT NULL,
    "client_index_id"     TEXT NOT NULL,
    "erp_customer_id"     TEXT NOT NULL,
    "package_purchase_id" TEXT NOT NULL,
    "event_type"          TEXT NOT NULL
                            CHECK ("event_type" IN (
                              'purchase_activation','bonus_granted','refund_credit',
                              'session_consumed','late_cancel_penalty','expiration_sweep'
                            )),
    "delta_units"         INTEGER NOT NULL CHECK ("delta_units" != 0),
    "reason"              TEXT,
    "idempotency_key"     TEXT,
    "erp_reference"       TEXT,
    "created_by_user_id"  TEXT,
    "created_at_utc"      TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "package_ledger_tenant_purchase_idx"
    ON "package_ledger" ("tenant_id", "package_purchase_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "package_ledger_tenant_idempotency_uq"
    ON "package_ledger" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,
]

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT:    TenantCtx = { tenantId: 'tenant-pcs' }
const ALT_CTX:   TenantCtx = { tenantId: 'tenant-pcs-other' }

const CLIENT_ID = 'ci-pcs-1'
const ERP_ID    = 'CUST-PCS-001'

const NOW = '2026-06-01T00:00:00.000Z'

const SNAPSHOT = JSON.stringify({
  schemaVersion: 1, templateId: 'pt-1', name: '5-Session Block',
  description: null, templateType: 'standard_block', sessionCount: 5,
  priceAmount: 0, currency: 'USD', expiryDays: null, erpItemCode: null,
  supersedesTemplateId: null, templateStatus: 'active', capturedAtUtc: '2026-01-01T00:00:00.000Z',
})

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tempDir:    string
let dbClient:   ReturnType<typeof createClient>
let service:    PackageConsumptionService
let ledgerRepo: PackageLedgerRepository

beforeEach(async () => {
  tempDir  = mkdtempSync(join(tmpdir(), 'fitdesk-pcs-test-'))
  dbClient = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  for (const stmt of SETUP_DDL) {
    await dbClient.execute(stmt)
  }
  const db = drizzle(dbClient, { schema })
  service    = new PackageConsumptionService(db)
  ledgerRepo = new PackageLedgerRepository(db)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop on Windows EPERM */ }
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedPurchase(opts: {
  id:              string
  tenantId?:       string
  clientIndexId?:  string
  erpCustomerId?:  string
  packageStatus?:  string
  activatedAtUtc?: string | null
  expiresAtUtc?:   string | null
}) {
  const tenant      = opts.tenantId      ?? TENANT.tenantId
  const clientId    = opts.clientIndexId ?? CLIENT_ID
  const erpCustId   = opts.erpCustomerId ?? ERP_ID
  const status      = opts.packageStatus ?? 'active'
  const activated   = opts.activatedAtUtc !== undefined ? opts.activatedAtUtc : '2026-01-02T00:00:00.000Z'
  const expires     = opts.expiresAtUtc   !== undefined ? opts.expiresAtUtc   : null
  const activPart   = activated === null ? 'NULL' : `'${activated}'`
  const expiresPart = expires   === null ? 'NULL' : `'${expires}'`

  await dbClient.execute(`
    INSERT INTO "client_package_purchase" (
      "id","tenant_id","client_index_id","erp_customer_id","package_template_id",
      "template_snapshot_json","payment_status","package_status",
      "purchased_at_utc","activated_at_utc","expires_at_utc",
      "created_at_utc","updated_at_utc"
    ) VALUES (
      '${opts.id}','${tenant}','${clientId}','${erpCustId}',
      'pt-1','${SNAPSHOT}','paid','${status}',
      '2026-01-01T00:00:00.000Z',${activPart},${expiresPart},
      '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'
    )
  `)
}

async function seedLedgerEvent(opts: {
  purchaseId:      string
  tenantId?:       string
  clientId?:       string
  erpId?:          string
  eventType?:      string
  deltaUnits?:     number
  idempotencyKey?: string | null
}) {
  const tenant   = opts.tenantId      ?? TENANT.tenantId
  const clientId = opts.clientId      ?? CLIENT_ID
  const erpId    = opts.erpId         ?? ERP_ID
  const evType   = opts.eventType     ?? 'purchase_activation'
  const delta    = opts.deltaUnits    ?? 5
  const ikeyVal  = opts.idempotencyKey != null ? `'${opts.idempotencyKey}'` : 'NULL'
  const id       = crypto.randomUUID()

  await dbClient.execute(`
    INSERT INTO "package_ledger" (
      "id","tenant_id","client_index_id","erp_customer_id",
      "package_purchase_id","event_type","delta_units","idempotency_key","created_at_utc"
    ) VALUES (
      '${id}','${tenant}','${clientId}','${erpId}',
      '${opts.purchaseId}','${evType}',${delta},${ikeyVal},'2026-01-01T00:00:00.000Z'
    )
  `)
}

function baseInput(overrides: Partial<ConsumeSessionInput> = {}): ConsumeSessionInput {
  return {
    sessionId:     'session-001',
    clientIndexId: CLIENT_ID,
    erpCustomerId: ERP_ID,
    nowUtc:        NOW,
    ...overrides,
  }
}

// ─── 1. Happy path ────────────────────────────────────────────────────────────

describe('consumeSession — happy path', () => {
  it('returns outcome=consumed and correct packagePurchaseId', async () => {
    await seedPurchase({ id: 'cpp-h1' })
    await seedLedgerEvent({ purchaseId: 'cpp-h1', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput())

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.packagePurchaseId).toBe('cpp-h1')
  })

  it('returns remainingBalance = prior balance - 1', async () => {
    await seedPurchase({ id: 'cpp-h2' })
    await seedLedgerEvent({ purchaseId: 'cpp-h2', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-h2' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.remainingBalance).toBe(4)
  })

  it('counts earlier consumed sessions in balance before deducting', async () => {
    await seedPurchase({ id: 'cpp-h3' })
    await seedLedgerEvent({ purchaseId: 'cpp-h3', deltaUnits: 5, idempotencyKey: 'act-h3' })
    await seedLedgerEvent({ purchaseId: 'cpp-h3', deltaUnits: -1, eventType: 'session_consumed', idempotencyKey: 'consume-h3-prev' })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-h3' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.remainingBalance).toBe(3) // was 4, now 3
  })
})

// ─── 2. Ledger event shape ────────────────────────────────────────────────────

describe('consumeSession — ledger event shape', () => {
  it('appended event has eventType=session_consumed and deltaUnits=-1', async () => {
    await seedPurchase({ id: 'cpp-evt1' })
    await seedLedgerEvent({ purchaseId: 'cpp-evt1', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-evt1' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.ledgerEvent.eventType).toBe('session_consumed')
    expect(result.ledgerEvent.deltaUnits).toBe(-1)
  })

  it('idempotencyKey equals session_consumed:{sessionId}', async () => {
    await seedPurchase({ id: 'cpp-evt2' })
    await seedLedgerEvent({ purchaseId: 'cpp-evt2', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-evt2' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.ledgerEvent.idempotencyKey).toBe('session_consumed:sess-evt2')
  })

  it('erpReference equals sessionId', async () => {
    await seedPurchase({ id: 'cpp-evt3' })
    await seedLedgerEvent({ purchaseId: 'cpp-evt3', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-evt3' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.ledgerEvent.erpReference).toBe('sess-evt3')
  })

  it('clientIndexId, erpCustomerId, packagePurchaseId, tenantId are correct', async () => {
    await seedPurchase({ id: 'cpp-evt4' })
    await seedLedgerEvent({ purchaseId: 'cpp-evt4', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-evt4' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.ledgerEvent.clientIndexId).toBe(CLIENT_ID)
    expect(result.ledgerEvent.erpCustomerId).toBe(ERP_ID)
    expect(result.ledgerEvent.packagePurchaseId).toBe('cpp-evt4')
    expect(result.ledgerEvent.tenantId).toBe(TENANT.tenantId)
  })

  it('createdByUserId is null when consumedByUserId is not provided', async () => {
    await seedPurchase({ id: 'cpp-evt5' })
    await seedLedgerEvent({ purchaseId: 'cpp-evt5', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-evt5' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.ledgerEvent.createdByUserId).toBeNull()
  })

  it('stores consumedByUserId in createdByUserId', async () => {
    await seedPurchase({ id: 'cpp-evt6' })
    await seedLedgerEvent({ purchaseId: 'cpp-evt6', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({
      sessionId:        'sess-evt6',
      consumedByUserId: 'trainer-abc',
    }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.ledgerEvent.createdByUserId).toBe('trainer-abc')
  })
})

// ─── 3. Idempotency ───────────────────────────────────────────────────────────

describe('consumeSession — idempotency', () => {
  it('returns already_done on replay with same sessionId', async () => {
    await seedPurchase({ id: 'cpp-idemp1' })
    await seedLedgerEvent({ purchaseId: 'cpp-idemp1', deltaUnits: 5 })

    const first = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-idemp1' }))
    expect(first.outcome).toBe('consumed')

    const second = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-idemp1' }))
    expect(second.outcome).toBe('already_done')
    if (second.outcome !== 'already_done') throw new Error('narrow')
    expect(second.ledgerEvent.idempotencyKey).toBe('session_consumed:sess-idemp1')
  })

  it('does not append a second ledger event on replay', async () => {
    await seedPurchase({ id: 'cpp-idemp2' })
    await seedLedgerEvent({ purchaseId: 'cpp-idemp2', deltaUnits: 5 })

    await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-idemp2' }))
    await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-idemp2' }))

    const events = await ledgerRepo.listEventsByPurchase(TENANT, 'cpp-idemp2')
    const consumed = events.filter(e => e.eventType === 'session_consumed')
    expect(consumed).toHaveLength(1)
  })

  it('different sessionIds produce independent consumption events', async () => {
    await seedPurchase({ id: 'cpp-idemp3' })
    await seedLedgerEvent({ purchaseId: 'cpp-idemp3', deltaUnits: 5 })

    const r1 = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-idemp3a' }))
    const r2 = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-idemp3b' }))

    expect(r1.outcome).toBe('consumed')
    expect(r2.outcome).toBe('consumed')
    const events = await ledgerRepo.listEventsByPurchase(TENANT, 'cpp-idemp3')
    expect(events.filter(e => e.eventType === 'session_consumed')).toHaveLength(2)
  })
})

// ─── 4. no_package ───────────────────────────────────────────────────────────

describe('consumeSession — no_package', () => {
  it('returns no_package when client has no packages at all', async () => {
    const result = await service.consumeSession(TENANT, baseInput())
    expect(result.outcome).toBe('no_package')
  })

  it('returns no_package when all packages are pending_activation', async () => {
    await seedPurchase({ id: 'cpp-pend1', packageStatus: 'pending_activation' })
    await seedLedgerEvent({ purchaseId: 'cpp-pend1', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-pend1' }))
    expect(result.outcome).toBe('no_package')
  })

  it('returns no_package when all active packages are expired', async () => {
    await seedPurchase({ id: 'cpp-expa1', expiresAtUtc: '2026-05-31T00:00:00.000Z' })
    await seedLedgerEvent({ purchaseId: 'cpp-expa1', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-expa1' }))
    expect(result.outcome).toBe('no_package')
  })

  it('returns no_package when all packages are cancelled', async () => {
    await seedPurchase({ id: 'cpp-canc1', packageStatus: 'cancelled' })
    await seedLedgerEvent({ purchaseId: 'cpp-canc1', deltaUnits: 5 })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-canc1' }))
    expect(result.outcome).toBe('no_package')
  })
})

// ─── 5. no_balance ───────────────────────────────────────────────────────────

describe('consumeSession — no_balance', () => {
  it('returns no_balance when eligible package balance is zero', async () => {
    await seedPurchase({ id: 'cpp-zero1' })
    await seedLedgerEvent({ purchaseId: 'cpp-zero1', deltaUnits: 5, idempotencyKey: 'act-zero1' })
    await seedLedgerEvent({ purchaseId: 'cpp-zero1', deltaUnits: -5, eventType: 'refund_credit', idempotencyKey: 'ref-zero1' })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-zero1' }))

    expect(result.outcome).toBe('no_balance')
    if (result.outcome !== 'no_balance') throw new Error('narrow')
    expect(result.packagePurchaseId).toBe('cpp-zero1')
  })

  it('returns no_balance and includes packagePurchaseId when all sessions consumed', async () => {
    await seedPurchase({ id: 'cpp-nbal1' })
    await seedLedgerEvent({ purchaseId: 'cpp-nbal1', deltaUnits: 1, idempotencyKey: 'act-nbal1' })
    await seedLedgerEvent({ purchaseId: 'cpp-nbal1', deltaUnits: -1, eventType: 'session_consumed', idempotencyKey: 'con-nbal1' })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-nbal1' }))

    expect(result.outcome).toBe('no_balance')
    if (result.outcome !== 'no_balance') throw new Error('narrow')
    expect(result.packagePurchaseId).toBe('cpp-nbal1')
  })
})

// ─── 5b. Sequential exhaustion (Phase 6B regression) ─────────────────────────
// Confirms today's read-then-insert path never drives the derived balance
// negative under *sequential* consumption. Phase 6C's atomic guard exists to
// extend this same invariant to *concurrent* different-session attempts,
// which cannot be proven in this single-threaded harness (see Phase 6 plan).

describe('consumeSession — sequential exhaustion never goes negative', () => {
  it('floors at zero after exactly consuming the granted balance, then rejects further attempts', async () => {
    await seedPurchase({ id: 'cpp-seq1' })
    await seedLedgerEvent({ purchaseId: 'cpp-seq1', deltaUnits: 2, idempotencyKey: 'act-seq1' })

    const first = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-seq1a' }))
    expect(first.outcome).toBe('consumed')

    const second = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-seq1b' }))
    expect(second.outcome).toBe('consumed')

    const third = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-seq1c' }))
    expect(third.outcome).toBe('no_balance')

    const balance = await ledgerRepo.deriveBalanceByPurchase(TENANT, 'cpp-seq1')
    expect(balance).toBe(0)
    expect(balance).toBeGreaterThanOrEqual(0)
  })
})

// ─── 5c. Different-session final-slot race (Phase 6C) ────────────────────────
// Dispatches two different sessions' consumeSession calls concurrently
// (Promise.all, no await between them) against a balance-1 package. This
// exercises real interleaving at the JS/await level; it cannot force a true
// OS-thread/process race (vitest is single-threaded against one connection),
// so it does not by itself prove the concurrency guarantee. The actual
// protection is PackageLedgerRepository.appendSessionConsumedIfBalanceAvailable's
// single atomic SQL statement, which relies on SQLite/libSQL's single-writer
// serialization (documented there) — this test proves the guard's outcome
// contract holds under concurrent dispatch, not that it holds under genuine
// parallel hardware execution.

describe('consumeSession — different-session final-slot race', () => {
  it('exactly one of two different sessions consumes the last unit; the loser gets no_balance; balance never goes negative', async () => {
    await seedPurchase({ id: 'cpp-race1' })
    await seedLedgerEvent({ purchaseId: 'cpp-race1', deltaUnits: 1, idempotencyKey: 'act-race1' })

    const [r1, r2] = await Promise.all([
      service.consumeSession(TENANT, baseInput({ sessionId: 'sess-race1a' })),
      service.consumeSession(TENANT, baseInput({ sessionId: 'sess-race1b' })),
    ])

    const outcomes = [r1.outcome, r2.outcome].sort()
    expect(outcomes).toEqual(['consumed', 'no_balance'])

    const balance = await ledgerRepo.deriveBalanceByPurchase(TENANT, 'cpp-race1')
    expect(balance).toBe(0)
    expect(balance).toBeGreaterThanOrEqual(0)

    const events = await ledgerRepo.listEventsByPurchase(TENANT, 'cpp-race1')
    expect(events.filter(e => e.eventType === 'session_consumed')).toHaveLength(1)
  })
})

// ─── 6. Expired package exclusion ────────────────────────────────────────────

describe('consumeSession — expired package handling', () => {
  it('skips expired package and uses valid package', async () => {
    await seedPurchase({ id: 'cpp-expc1', expiresAtUtc: '2026-05-31T00:00:00.000Z' })
    await seedLedgerEvent({ purchaseId: 'cpp-expc1', deltaUnits: 5, idempotencyKey: 'act-expc1' })

    await seedPurchase({ id: 'cpp-valid1', expiresAtUtc: '2026-07-01T00:00:00.000Z' })
    await seedLedgerEvent({ purchaseId: 'cpp-valid1', deltaUnits: 5, idempotencyKey: 'act-valid1' })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-expc1' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.packagePurchaseId).toBe('cpp-valid1')
  })
})

// ─── 7. Multi-package selection ───────────────────────────────────────────────

describe('consumeSession — package selection across multiple purchases', () => {
  it('selects earliest-expiry package first', async () => {
    await seedPurchase({ id: 'cpp-mlt-late', expiresAtUtc: '2026-09-01T00:00:00.000Z' })
    await seedLedgerEvent({ purchaseId: 'cpp-mlt-late', deltaUnits: 5, idempotencyKey: 'act-mlt-late' })

    await seedPurchase({ id: 'cpp-mlt-early', expiresAtUtc: '2026-07-01T00:00:00.000Z' })
    await seedLedgerEvent({ purchaseId: 'cpp-mlt-early', deltaUnits: 5, idempotencyKey: 'act-mlt-early' })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-mlt1' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.packagePurchaseId).toBe('cpp-mlt-early')
  })

  it('selects dated-expiry package before no-expiry package', async () => {
    await seedPurchase({ id: 'cpp-mlt-noexp', expiresAtUtc: null })
    await seedLedgerEvent({ purchaseId: 'cpp-mlt-noexp', deltaUnits: 5, idempotencyKey: 'act-mlt-noexp' })

    await seedPurchase({ id: 'cpp-mlt-dated', expiresAtUtc: '2026-07-01T00:00:00.000Z' })
    await seedLedgerEvent({ purchaseId: 'cpp-mlt-dated', deltaUnits: 5, idempotencyKey: 'act-mlt-dated' })

    const result = await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-mlt2' }))

    expect(result.outcome).toBe('consumed')
    if (result.outcome !== 'consumed') throw new Error('narrow')
    expect(result.packagePurchaseId).toBe('cpp-mlt-dated')
  })
})

// ─── 8. Tenant isolation ──────────────────────────────────────────────────────

describe('consumeSession — tenant isolation', () => {
  it('cannot consume from another tenant package (returns no_package)', async () => {
    await seedPurchase({ id: 'cpp-iso1', tenantId: TENANT.tenantId })
    await seedLedgerEvent({ purchaseId: 'cpp-iso1', deltaUnits: 5 })

    const result = await service.consumeSession(ALT_CTX, baseInput({
      sessionId:     'sess-iso1',
      clientIndexId: CLIENT_ID,
      erpCustomerId: ERP_ID,
    }))
    expect(result.outcome).toBe('no_package')
  })

  it('ledger events from one tenant are not visible to another', async () => {
    await seedPurchase({ id: 'cpp-iso2', tenantId: TENANT.tenantId })
    await seedLedgerEvent({ purchaseId: 'cpp-iso2', deltaUnits: 5 })

    // First tenant consumes
    await service.consumeSession(TENANT, baseInput({ sessionId: 'sess-iso2' }))

    // Alt tenant should not see the same idempotency key
    const eventsAlt = await ledgerRepo.findEventByIdempotencyKey(ALT_CTX, 'session_consumed:sess-iso2')
    expect(eventsAlt).toBeNull()
  })
})

// ─── 9. Input validation ──────────────────────────────────────────────────────

describe('consumeSession — input validation', () => {
  it('throws when tenantId is empty', async () => {
    await expect(
      service.consumeSession({ tenantId: '' }, baseInput()),
    ).rejects.toThrow('tenantId is required')
  })

  it('throws when sessionId is empty', async () => {
    await expect(
      service.consumeSession(TENANT, baseInput({ sessionId: '' })),
    ).rejects.toThrow('sessionId must not be blank')
  })

  it('throws when clientIndexId is empty', async () => {
    await expect(
      service.consumeSession(TENANT, baseInput({ clientIndexId: '' })),
    ).rejects.toThrow('clientIndexId must not be blank')
  })

  it('throws when erpCustomerId is empty', async () => {
    await expect(
      service.consumeSession(TENANT, baseInput({ erpCustomerId: '' })),
    ).rejects.toThrow('erpCustomerId must not be blank')
  })
})

// ─── 10. Source invariants ────────────────────────────────────────────────────

describe('service source invariants', () => {
  it('package-consumption-service.ts contains no forbidden patterns', () => {
    const src = readFileSync(
      join(__dirname, '..', 'package-consumption-service.ts'),
      'utf-8',
    )
    expect(src).not.toMatch(/^\s*['"]use server['"]\s*;?\s*$/m)
    expect(src).not.toContain('erpnext/client')
    expect(src).not.toContain('business-data/erp-adapter')
    expect(src).not.toContain("from '@/actions/")
    expect(src).not.toContain('from "@/actions/')
    expect(src).not.toContain('erpFetch(')
    expect(src).not.toMatch(/(?<![A-Za-z])fetch\s*\(/)
    expect(src).not.toContain('createInvoice')
    expect(src).not.toContain('submitSalesInvoice')
    expect(src).not.toContain('Payment Entry')
    expect(src).not.toContain('cancelPurchase')
  })
})
