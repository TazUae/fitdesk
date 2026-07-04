/**
 * Integration tests for PackageLedgerRepository.
 *
 * Uses a unique temp-file SQLite database per test so Drizzle transactions
 * and direct select/insert operations all share the same persistent connection.
 * (@libsql/client :memory: uses separate connections per request, so aggregate
 * queries like SUM would see an empty set even after inserts.)
 *
 * Covers: appendEvent (happy path, validation, direction, idempotency),
 *         read methods, balance derivation, tenant isolation, API surface invariants.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import type { AppendLedgerEventInput } from '@/types/billing'

// ─── DDL (kept in sync with scripts/migrate-app.mjs) ─────────────────────────

const SETUP_DDL = [
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
  `CREATE INDEX IF NOT EXISTS "package_ledger_tenant_client_idx"
    ON "package_ledger" ("tenant_id", "client_index_id")`,
  `CREATE INDEX IF NOT EXISTS "package_ledger_tenant_event_idx"
    ON "package_ledger" ("tenant_id", "event_type")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "package_ledger_tenant_idempotency_uq"
    ON "package_ledger" ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL`,
]

// ─── Test context ─────────────────────────────────────────────────────────────

const CTX_A = { tenantId: 'tenant-a' }
const CTX_B = { tenantId: 'tenant-b' }

let tempDir: string
let client: ReturnType<typeof createClient>
let repo: PackageLedgerRepository

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-ledger-repo-'))
  client  = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  const db = drizzle(client, { schema })
  for (const statement of SETUP_DDL) {
    await client.execute(statement)
  }
  repo = new PackageLedgerRepository(db)
})

afterEach(() => {
  client.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop on Windows EPERM */ }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseInput(
  overrides: Partial<AppendLedgerEventInput> = {},
): AppendLedgerEventInput {
  return {
    clientIndexId:    'ci-1',
    erpCustomerId:    'CUST-001',
    packagePurchaseId:'cpp-1',
    eventType:        'purchase_activation',
    deltaUnits:       10,
    ...overrides,
  }
}

// Direct SQL seed — bypasses the repo for controlled timestamp / cross-tenant seeding
async function seedRow(opts: {
  id:               string
  tenantId:         string
  clientIndexId?:   string
  erpCustomerId?:   string
  purchaseId?:      string
  eventType?:       string
  deltaUnits?:      number
  idempotencyKey?:  string | null
  createdAtUtc?:    string
}) {
  await client.execute({
    sql: `INSERT INTO "package_ledger"
      ("id","tenant_id","client_index_id","erp_customer_id",
       "package_purchase_id","event_type","delta_units","idempotency_key","created_at_utc")
      VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [
      opts.id,
      opts.tenantId,
      opts.clientIndexId   ?? 'ci-1',
      opts.erpCustomerId   ?? 'CUST-001',
      opts.purchaseId      ?? 'cpp-1',
      opts.eventType       ?? 'purchase_activation',
      opts.deltaUnits      ?? 10,
      opts.idempotencyKey  ?? null,
      opts.createdAtUtc    ?? new Date().toISOString(),
    ],
  })
}

// ─── appendEvent — happy path ─────────────────────────────────────────────────

describe('appendEvent — happy path', () => {
  it('appends a purchase_activation event and returns a hydrated event', async () => {
    const event = await repo.appendEvent(CTX_A, baseInput())

    expect(event.id).toBeTruthy()
    expect(event.tenantId).toBe('tenant-a')
    expect(event.eventType).toBe('purchase_activation')
    expect(event.deltaUnits).toBe(10)
    expect(event.packagePurchaseId).toBe('cpp-1')
    expect(event.clientIndexId).toBe('ci-1')
    expect(event.erpCustomerId).toBe('CUST-001')
    expect(event.createdAtUtc).toBeTruthy()
    expect(event.idempotencyKey).toBeNull()

    // Verify persisted
    const listed = await repo.listEventsByPurchase(CTX_A, 'cpp-1')
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(event.id)
  })

  it('appends a bonus_granted event', async () => {
    const event = await repo.appendEvent(
      CTX_A,
      baseInput({ eventType: 'bonus_granted', deltaUnits: 5 }),
    )
    expect(event.eventType).toBe('bonus_granted')
    expect(event.deltaUnits).toBe(5)
  })

  it('appends optional fields when provided', async () => {
    const event = await repo.appendEvent(CTX_A, baseInput({
      reason:          'initial grant',
      erpReference:    'SI-00001',
      createdByUserId: 'user-abc',
      idempotencyKey:  'ikey-1',
    }))
    expect(event.reason).toBe('initial grant')
    expect(event.erpReference).toBe('SI-00001')
    expect(event.createdByUserId).toBe('user-abc')
    expect(event.idempotencyKey).toBe('ikey-1')
  })

  it('accepts all six canonical event types with correct direction', async () => {
    const cases: Array<[AppendLedgerEventInput['eventType'], number]> = [
      ['purchase_activation', 10],
      ['bonus_granted',       5],
      ['refund_credit',       -3],
      ['session_consumed',    -1],
      ['late_cancel_penalty', -1],
      ['expiration_sweep',    -2],
    ]
    for (const [eventType, deltaUnits] of cases) {
      const event = await repo.appendEvent(
        CTX_A,
        baseInput({ eventType, deltaUnits }),
      )
      expect(event.eventType).toBe(eventType)
      expect(event.deltaUnits).toBe(deltaUnits)
    }
  })
})

// ─── appendEvent — validation ─────────────────────────────────────────────────

describe('appendEvent — validation', () => {
  it('throws if tenantId is missing', async () => {
    await expect(repo.appendEvent({ tenantId: '' }, baseInput())).rejects.toThrow(
      'tenantId is required',
    )
  })

  it('rejects blank clientIndexId', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ clientIndexId: '' })),
    ).rejects.toThrow('clientIndexId must not be blank')
  })

  it('rejects whitespace-only clientIndexId', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ clientIndexId: '   ' })),
    ).rejects.toThrow('clientIndexId must not be blank')
  })

  it('rejects blank erpCustomerId', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ erpCustomerId: '' })),
    ).rejects.toThrow('erpCustomerId must not be blank')
  })

  it('rejects blank packagePurchaseId', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ packagePurchaseId: '' })),
    ).rejects.toThrow('packagePurchaseId must not be blank')
  })

  it('rejects invalid eventType', async () => {
    const badInput = { ...baseInput(), eventType: 'invalid_type' as AppendLedgerEventInput['eventType'] }
    await expect(
      repo.appendEvent(CTX_A, badInput),
    ).rejects.toThrow('invalid eventType')
  })

  it('rejects non-integer deltaUnits (float)', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ deltaUnits: 1.5 })),
    ).rejects.toThrow('must be an integer')
  })

  it('rejects zero deltaUnits', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ deltaUnits: 0 })),
    ).rejects.toThrow('must not be zero')
  })
})

// ─── appendEvent — event direction ───────────────────────────────────────────

describe('appendEvent — event direction validation', () => {
  it('rejects positive deltaUnits for session_consumed', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ eventType: 'session_consumed', deltaUnits: 1 })),
    ).rejects.toThrow('invalid direction')
  })

  it('rejects negative deltaUnits for purchase_activation', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ eventType: 'purchase_activation', deltaUnits: -10 })),
    ).rejects.toThrow('invalid direction')
  })

  it('rejects positive deltaUnits for refund_credit', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ eventType: 'refund_credit', deltaUnits: 3 })),
    ).rejects.toThrow('invalid direction')
  })

  it('rejects positive deltaUnits for late_cancel_penalty', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ eventType: 'late_cancel_penalty', deltaUnits: 1 })),
    ).rejects.toThrow('invalid direction')
  })

  it('rejects positive deltaUnits for expiration_sweep', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ eventType: 'expiration_sweep', deltaUnits: 2 })),
    ).rejects.toThrow('invalid direction')
  })

  it('rejects negative deltaUnits for bonus_granted', async () => {
    await expect(
      repo.appendEvent(CTX_A, baseInput({ eventType: 'bonus_granted', deltaUnits: -5 })),
    ).rejects.toThrow('invalid direction')
  })
})

// ─── balance derivation ───────────────────────────────────────────────────────

describe('deriveBalanceByPurchase', () => {
  it('returns 0 when no events exist for the purchase', async () => {
    const balance = await repo.deriveBalanceByPurchase(CTX_A, 'cpp-nonexistent')
    expect(balance).toBe(0)
  })

  it('derives balance via SQL SUM (+10, -1, -1 = 8)', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 10 }))
    await repo.appendEvent(CTX_A, baseInput({ eventType: 'session_consumed', deltaUnits: -1 }))
    await repo.appendEvent(CTX_A, baseInput({ eventType: 'session_consumed', deltaUnits: -1 }))

    const balance = await repo.deriveBalanceByPurchase(CTX_A, 'cpp-1')
    expect(balance).toBe(8)
  })

  it('allows negative balance (no clamping — prevention is deferred to C6)', async () => {
    await seedRow({ id: 'led-debit', tenantId: 'tenant-a', deltaUnits: -5 })
    const balance = await repo.deriveBalanceByPurchase(CTX_A, 'cpp-1')
    expect(balance).toBe(-5)
  })

  it('does not include other tenant rows', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 10 }))
    await repo.appendEvent(CTX_B, baseInput({ deltaUnits: 3 }))

    expect(await repo.deriveBalanceByPurchase(CTX_A, 'cpp-1')).toBe(10)
    expect(await repo.deriveBalanceByPurchase(CTX_B, 'cpp-1')).toBe(3)
  })
})

describe('deriveBalancesByClient', () => {
  it('returns empty object when no events exist', async () => {
    const balances = await repo.deriveBalancesByClient(CTX_A, 'ci-nonexistent')
    expect(balances).toEqual({})
  })

  it('derives balances across multiple purchases for the same client', async () => {
    // cpp-1: +10 -2 = 8
    await repo.appendEvent(CTX_A, baseInput({ packagePurchaseId: 'cpp-1', deltaUnits: 10 }))
    await repo.appendEvent(CTX_A, {
      ...baseInput({ packagePurchaseId: 'cpp-1' }),
      eventType:  'session_consumed',
      deltaUnits: -2,
    })
    // cpp-2: +5
    await repo.appendEvent(CTX_A, baseInput({ packagePurchaseId: 'cpp-2', deltaUnits: 5 }))

    const balances = await repo.deriveBalancesByClient(CTX_A, 'ci-1')
    expect(balances['cpp-1']).toBe(8)
    expect(balances['cpp-2']).toBe(5)
    expect(Object.keys(balances)).toHaveLength(2)
  })

  it('does not include other tenant rows in client balance map', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 10 }))
    await repo.appendEvent(CTX_B, baseInput({ deltaUnits: 99 }))

    const balancesA = await repo.deriveBalancesByClient(CTX_A, 'ci-1')
    expect(balancesA['cpp-1']).toBe(10)
    expect(Object.keys(balancesA)).toHaveLength(1)
  })
})

// ─── listEventsByPurchase ─────────────────────────────────────────────────────

describe('listEventsByPurchase', () => {
  it('returns events in ascending created_at_utc order, tenant-scoped', async () => {
    // Seed with distinct timestamps to guarantee order
    await seedRow({
      id: 'led-t1', tenantId: 'tenant-a',
      eventType: 'purchase_activation', deltaUnits: 10,
      createdAtUtc: '2026-01-01T10:00:00Z',
    })
    await seedRow({
      id: 'led-t2', tenantId: 'tenant-a',
      eventType: 'session_consumed', deltaUnits: -1,
      createdAtUtc: '2026-01-01T11:00:00Z',
    })
    // Tenant B noise — must not appear
    await seedRow({
      id: 'led-b1', tenantId: 'tenant-b',
      eventType: 'purchase_activation', deltaUnits: 5,
      createdAtUtc: '2026-01-01T09:00:00Z',
    })

    const events = await repo.listEventsByPurchase(CTX_A, 'cpp-1')
    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('led-t1')
    expect(events[1].id).toBe('led-t2')
    expect(events[0].createdAtUtc <= events[1].createdAtUtc).toBe(true)
  })

  it('returns empty array when no events exist for the purchase', async () => {
    const events = await repo.listEventsByPurchase(CTX_A, 'cpp-none')
    expect(events).toEqual([])
  })
})

// ─── findEventByIdempotencyKey ────────────────────────────────────────────────

describe('findEventByIdempotencyKey', () => {
  it('returns null for an unknown key', async () => {
    const result = await repo.findEventByIdempotencyKey(CTX_A, 'nonexistent')
    expect(result).toBeNull()
  })

  it('returns null for a blank key', async () => {
    const result = await repo.findEventByIdempotencyKey(CTX_A, '')
    expect(result).toBeNull()
  })

  it('returns null for a whitespace-only key', async () => {
    const result = await repo.findEventByIdempotencyKey(CTX_A, '   ')
    expect(result).toBeNull()
  })

  it('finds an existing event by idempotency key within the same tenant', async () => {
    const event = await repo.appendEvent(CTX_A, baseInput({ idempotencyKey: 'find-me' }))
    const found = await repo.findEventByIdempotencyKey(CTX_A, 'find-me')
    expect(found?.id).toBe(event.id)
    expect(found?.tenantId).toBe('tenant-a')
  })

  it('returns null for a cross-tenant key lookup', async () => {
    await repo.appendEvent(CTX_B, baseInput({ idempotencyKey: 'b-only-key' }))
    const result = await repo.findEventByIdempotencyKey(CTX_A, 'b-only-key')
    expect(result).toBeNull()
  })
})

// ─── idempotency ──────────────────────────────────────────────────────────────

describe('appendEvent — idempotency', () => {
  it('replays an existing event when key and payload match', async () => {
    const input = baseInput({ idempotencyKey: 'activation:cpp-1' })
    const first  = await repo.appendEvent(CTX_A, input)
    const second = await repo.appendEvent(CTX_A, input)

    expect(second.id).toBe(first.id)
    // Only one row persisted
    const events = await repo.listEventsByPurchase(CTX_A, 'cpp-1')
    expect(events).toHaveLength(1)
  })

  it('throws conflict when key matches but payload differs', async () => {
    await repo.appendEvent(CTX_A, baseInput({ idempotencyKey: 'key-x', deltaUnits: 10 }))
    await expect(
      repo.appendEvent(CTX_A, baseInput({ idempotencyKey: 'key-x', deltaUnits: 5 })),
    ).rejects.toThrow('idempotency key reuse with different payload')
  })

  it('throws conflict when key matches but eventType differs', async () => {
    await repo.appendEvent(CTX_A, baseInput({ idempotencyKey: 'key-y' }))
    await expect(
      repo.appendEvent(CTX_A, baseInput({ idempotencyKey: 'key-y', eventType: 'bonus_granted' })),
    ).rejects.toThrow('idempotency key reuse with different payload')
  })

  it('null idempotency key allows multiple events for the same purchase', async () => {
    await repo.appendEvent(CTX_A, baseInput({ idempotencyKey: null }))
    await repo.appendEvent(CTX_A, baseInput({ idempotencyKey: null }))
    const events = await repo.listEventsByPurchase(CTX_A, 'cpp-1')
    expect(events).toHaveLength(2)
  })

  it('same idempotency key in different tenants creates two independent events', async () => {
    const input = baseInput({ idempotencyKey: 'cross-tenant-key' })
    const eventA = await repo.appendEvent(CTX_A, input)
    const eventB = await repo.appendEvent(CTX_B, input)

    expect(eventA.id).not.toBe(eventB.id)
    expect(eventA.tenantId).toBe('tenant-a')
    expect(eventB.tenantId).toBe('tenant-b')
  })
})

// ─── appendSessionConsumedIfBalanceAvailable (Phase 6C atomic guard) ─────────

describe('appendSessionConsumedIfBalanceAvailable', () => {
  function guardInput(overrides: Partial<{
    clientIndexId:     string
    erpCustomerId:     string
    packagePurchaseId: string
    idempotencyKey:    string
    erpReference:      string
    createdByUserId:   string | null
  }> = {}) {
    return {
      clientIndexId:     'ci-1',
      erpCustomerId:     'CUST-001',
      packagePurchaseId: 'cpp-1',
      idempotencyKey:    'session_consumed:fds-1',
      erpReference:      'fds-1',
      createdByUserId:   null,
      ...overrides,
    }
  }

  it('inserts a session_consumed(-1) event when balance is sufficient', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 1 }))

    const event = await repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput())

    expect(event).not.toBeNull()
    expect(event?.eventType).toBe('session_consumed')
    expect(event?.deltaUnits).toBe(-1)
    expect(event?.idempotencyKey).toBe('session_consumed:fds-1')
    expect(event?.packagePurchaseId).toBe('cpp-1')

    const balance = await repo.deriveBalanceByPurchase(CTX_A, 'cpp-1')
    expect(balance).toBe(0)
  })

  it('refuses to insert when balance is exactly zero — returns null, no row written', async () => {
    // No grant seeded — balance is 0.
    const event = await repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput())

    expect(event).toBeNull()
    const events = await repo.listEventsByPurchase(CTX_A, 'cpp-1')
    expect(events).toHaveLength(0)
  })

  it('refuses to insert when balance is already negative (corrupted upstream state)', async () => {
    await seedRow({ id: 'led-neg', tenantId: 'tenant-a', deltaUnits: -3 })

    const event = await repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput())

    expect(event).toBeNull()
    const balance = await repo.deriveBalanceByPurchase(CTX_A, 'cpp-1')
    expect(balance).toBe(-3) // unchanged — the guard did not make it more negative
  })

  it('refuses a second insert with the same idempotency key even though balance remains', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 5 }))

    const first  = await repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput())
    const second = await repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput())

    expect(first).not.toBeNull()
    expect(second).toBeNull() // same idempotencyKey — NOT EXISTS guard rejects it

    const events = await repo.listEventsByPurchase(CTX_A, 'cpp-1')
    const consumed = events.filter(e => e.eventType === 'session_consumed')
    expect(consumed).toHaveLength(1) // not two — balance alone would have allowed a second debit
  })

  it('allows a second debit with a different idempotency key while balance remains', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 5 }))

    const first  = await repo.appendSessionConsumedIfBalanceAvailable(
      CTX_A, guardInput({ idempotencyKey: 'session_consumed:fds-1' }),
    )
    const second = await repo.appendSessionConsumedIfBalanceAvailable(
      CTX_A, guardInput({ idempotencyKey: 'session_consumed:fds-2', erpReference: 'fds-2' }),
    )

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(await repo.deriveBalanceByPurchase(CTX_A, 'cpp-1')).toBe(3)
  })

  it('is tenant-scoped — a guessed packagePurchaseId in another tenant sees no balance', async () => {
    // Tenant A has 1 unit on cpp-1.
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 1 }))

    // Tenant B attempts to consume against the SAME packagePurchaseId string —
    // both the idempotency NOT EXISTS check and the balance SUM are tenant-filtered,
    // so tenant B must see balance 0 regardless of tenant A's real balance.
    const event = await repo.appendSessionConsumedIfBalanceAvailable(CTX_B, guardInput())

    expect(event).toBeNull()
    // Tenant A's balance is untouched by tenant B's rejected attempt.
    expect(await repo.deriveBalanceByPurchase(CTX_A, 'cpp-1')).toBe(1)
  })

  it('rejects blank clientIndexId', async () => {
    await expect(
      repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput({ clientIndexId: '' })),
    ).rejects.toThrow('clientIndexId must not be blank')
  })

  it('rejects blank erpCustomerId', async () => {
    await expect(
      repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput({ erpCustomerId: '' })),
    ).rejects.toThrow('erpCustomerId must not be blank')
  })

  it('rejects blank packagePurchaseId', async () => {
    await expect(
      repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput({ packagePurchaseId: '' })),
    ).rejects.toThrow('packagePurchaseId must not be blank')
  })

  it('rejects blank idempotencyKey', async () => {
    await expect(
      repo.appendSessionConsumedIfBalanceAvailable(CTX_A, guardInput({ idempotencyKey: '' })),
    ).rejects.toThrow('idempotencyKey must not be blank')
  })

  it('throws when tenantId is missing', async () => {
    await expect(
      repo.appendSessionConsumedIfBalanceAvailable({ tenantId: '' }, guardInput()),
    ).rejects.toThrow('tenantId is required')
  })
})

// ─── tenant isolation (comprehensive) ────────────────────────────────────────

describe('tenant isolation', () => {
  it('listEventsByPurchase returns empty for a tenant with no events', async () => {
    await repo.appendEvent(CTX_A, baseInput())
    const events = await repo.listEventsByPurchase(CTX_B, 'cpp-1')
    expect(events).toEqual([])
  })

  it('deriveBalanceByPurchase returns 0 for a tenant with no events', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 100 }))
    const balance = await repo.deriveBalanceByPurchase(CTX_B, 'cpp-1')
    expect(balance).toBe(0)
  })

  it('deriveBalancesByClient returns empty for a tenant with no events', async () => {
    await repo.appendEvent(CTX_A, baseInput({ deltaUnits: 100 }))
    const balances = await repo.deriveBalancesByClient(CTX_B, 'ci-1')
    expect(balances).toEqual({})
  })
})

// ─── API surface invariants ───────────────────────────────────────────────────

describe('API surface invariants', () => {
  it('exposes exactly the expected public methods and no update/delete mutators', () => {
    const methods = Object.getOwnPropertyNames(PackageLedgerRepository.prototype)
    const expected = new Set([
      'constructor',
      'appendEvent',
      'appendSessionConsumedIfBalanceAvailable',
      'findEventByIdempotencyKey',
      'listEventsByPurchase',
      'deriveBalanceByPurchase',
      'deriveBalancesByClient',
    ])
    for (const name of methods) {
      expect(expected).toContain(name)
    }
    // Explicit no-mutator assertions
    expect(methods).not.toContain('updateEvent')
    expect(methods).not.toContain('deleteEvent')
    expect(methods).not.toContain('voidEvent')
    expect(methods).not.toContain('reverseEvent')
    expect(methods).not.toContain('removeEvent')
    expect(methods).not.toContain('patchEvent')
  })

  // ERP/action/UI import guard is verified by the shell import-guard command
  // in the verification step (Select-String on the repository file).
})
