/**
 * Tenant-scoped append-only repository for package_ledger.
 *
 * RULES (enforced):
 *  1. Every public method requires ctx.tenantId — throws before any SQL if missing.
 *  2. appendEvent is the ONLY writer. There is no update, delete, or void method.
 *     Corrections are always represented as new compensating events.
 *  3. Event direction (positive/negative delta) is validated in app logic before SQL.
 *  4. Balance is always derived as SUM(delta_units); never a stored counter.
 *  5. No ERP calls. No invoice/payment/session/purchase side effects. No erpnext imports.
 *  6. Cross-tenant reads return null/empty; writes are tenant-scoped via WHERE.
 */

import { and, asc, eq, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import {
  isLedgerEventType,
  ledgerDeltaMatchesDirection,
} from '@/lib/billing/taxonomy'
import type { LedgerEventType } from '@/lib/billing/taxonomy'
import type { AppendLedgerEventInput, PackageLedgerEvent } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantCtx = {
  tenantId: string
}

type AppDb = LibSQLDatabase<typeof schema>

type RawLedgerEvent = typeof schema.packageLedger.$inferSelect

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertTenantId(ctx: TenantCtx): string {
  if (!ctx.tenantId || ctx.tenantId.trim() === '') {
    throw new Error(
      '[PackageLedgerRepository] tenantId is required for all ledger operations',
    )
  }
  return ctx.tenantId
}

function hydratePackageLedgerEvent(row: RawLedgerEvent): PackageLedgerEvent {
  return {
    id:                row.id,
    tenantId:          row.tenantId,
    clientIndexId:     row.clientIndexId,
    erpCustomerId:     row.erpCustomerId,
    packagePurchaseId: row.packagePurchaseId,
    eventType:         row.eventType as LedgerEventType,
    deltaUnits:        row.deltaUnits,
    reason:            row.reason,
    idempotencyKey:    row.idempotencyKey,
    erpReference:      row.erpReference,
    createdByUserId:   row.createdByUserId,
    createdAtUtc:      row.createdAtUtc,
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = 'code' in err ? (err as { code: unknown }).code : undefined
    return (
      err.message.includes('UNIQUE constraint failed') ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      code === 'SQLITE_CONSTRAINT'
    )
  }
  return false
}

function payloadMatches(
  existing: PackageLedgerEvent,
  input: AppendLedgerEventInput,
): boolean {
  return (
    existing.packagePurchaseId === input.packagePurchaseId &&
    existing.eventType         === input.eventType &&
    existing.deltaUnits        === input.deltaUnits &&
    existing.clientIndexId     === input.clientIndexId &&
    existing.erpCustomerId     === input.erpCustomerId
  )
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class PackageLedgerRepository {
  constructor(private readonly db: AppDb) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async findEventByIdempotencyKey(
    ctx: TenantCtx,
    idempotencyKey: string,
  ): Promise<PackageLedgerEvent | null> {
    const tenantId = assertTenantId(ctx)
    if (!idempotencyKey || idempotencyKey.trim() === '') return null

    const rows = await this.db
      .select()
      .from(schema.packageLedger)
      .where(
        and(
          eq(schema.packageLedger.tenantId, tenantId),
          eq(schema.packageLedger.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
    return rows[0] ? hydratePackageLedgerEvent(rows[0]) : null
  }

  async listEventsByPurchase(
    ctx: TenantCtx,
    packagePurchaseId: string,
  ): Promise<PackageLedgerEvent[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.packageLedger)
      .where(
        and(
          eq(schema.packageLedger.tenantId, tenantId),
          eq(schema.packageLedger.packagePurchaseId, packagePurchaseId),
        ),
      )
      .orderBy(asc(schema.packageLedger.createdAtUtc))
    return rows.map(hydratePackageLedgerEvent)
  }

  async deriveBalanceByPurchase(
    ctx: TenantCtx,
    packagePurchaseId: string,
  ): Promise<number> {
    const tenantId = assertTenantId(ctx)
    const result = await this.db
      .select({
        balance: sql<number>`COALESCE(SUM(${schema.packageLedger.deltaUnits}), 0)`,
      })
      .from(schema.packageLedger)
      .where(
        and(
          eq(schema.packageLedger.tenantId, tenantId),
          eq(schema.packageLedger.packagePurchaseId, packagePurchaseId),
        ),
      )
    return result[0]?.balance ?? 0
  }

  async deriveBalancesByClient(
    ctx: TenantCtx,
    clientIndexId: string,
  ): Promise<Record<string, number>> {
    const tenantId = assertTenantId(ctx)
    const results = await this.db
      .select({
        packagePurchaseId: schema.packageLedger.packagePurchaseId,
        balance:           sql<number>`COALESCE(SUM(${schema.packageLedger.deltaUnits}), 0)`,
      })
      .from(schema.packageLedger)
      .where(
        and(
          eq(schema.packageLedger.tenantId, tenantId),
          eq(schema.packageLedger.clientIndexId, clientIndexId),
        ),
      )
      .groupBy(schema.packageLedger.packagePurchaseId)
    return Object.fromEntries(results.map((r) => [r.packagePurchaseId, r.balance ?? 0]))
  }

  // ── Write (append-only) ──────────────────────────────────────────────────

  async appendEvent(
    ctx: TenantCtx,
    input: AppendLedgerEventInput,
    executor?: AppDb,
  ): Promise<PackageLedgerEvent> {
    const tenantId = assertTenantId(ctx)

    // Validate required IDs
    if (!input.clientIndexId || input.clientIndexId.trim() === '') {
      throw new Error('[PackageLedgerRepository] clientIndexId must not be blank')
    }
    if (!input.erpCustomerId || input.erpCustomerId.trim() === '') {
      throw new Error('[PackageLedgerRepository] erpCustomerId must not be blank')
    }
    if (!input.packagePurchaseId || input.packagePurchaseId.trim() === '') {
      throw new Error('[PackageLedgerRepository] packagePurchaseId must not be blank')
    }

    // Validate eventType
    if (!isLedgerEventType(input.eventType)) {
      throw new Error(
        `[PackageLedgerRepository] invalid eventType: ${String(input.eventType)}`,
      )
    }

    // Validate deltaUnits
    if (!Number.isInteger(input.deltaUnits)) {
      throw new Error('[PackageLedgerRepository] deltaUnits must be an integer')
    }
    if (input.deltaUnits === 0) {
      throw new Error('[PackageLedgerRepository] deltaUnits must not be zero')
    }

    // Validate event direction
    if (!ledgerDeltaMatchesDirection(input.eventType, input.deltaUnits)) {
      const expected = input.deltaUnits > 0 ? 'negative' : 'positive'
      throw new Error(
        `[PackageLedgerRepository] invalid direction for eventType "${input.eventType}": ` +
        `expected ${expected} deltaUnits, got ${input.deltaUnits}`,
      )
    }

    // Normalise idempotency key: empty string → null
    const key =
      input.idempotencyKey != null && input.idempotencyKey.trim() !== ''
        ? input.idempotencyKey
        : null

    // Idempotency pre-check
    if (key) {
      const existing = await this.findEventByIdempotencyKey(ctx, key)
      if (existing) {
        if (payloadMatches(existing, input)) return existing
        throw new Error(
          `[PackageLedgerRepository] idempotency key reuse with different payload: ${key}`,
        )
      }
    }

    const id           = crypto.randomUUID()
    const createdAtUtc = new Date().toISOString()
    const db           = executor ?? this.db

    try {
      await db.insert(schema.packageLedger).values({
        id,
        tenantId,
        clientIndexId:     input.clientIndexId,
        erpCustomerId:     input.erpCustomerId,
        packagePurchaseId: input.packagePurchaseId,
        eventType:         input.eventType,
        deltaUnits:        input.deltaUnits,
        reason:            input.reason ?? null,
        idempotencyKey:    key,
        erpReference:      input.erpReference ?? null,
        createdByUserId:   input.createdByUserId ?? null,
        createdAtUtc,
      })
    } catch (err) {
      // Race: another request inserted the same idempotency key between pre-check and insert.
      // Re-read and replay if payload matches; conflict-throw if it differs.
      if (key && isUniqueConstraintError(err)) {
        const existing = await this.findEventByIdempotencyKey(ctx, key)
        if (existing && payloadMatches(existing, input)) return existing
        throw new Error(
          `[PackageLedgerRepository] idempotency key reuse with different payload: ${key}`,
        )
      }
      throw err
    }

    return {
      id,
      tenantId,
      clientIndexId:     input.clientIndexId,
      erpCustomerId:     input.erpCustomerId,
      packagePurchaseId: input.packagePurchaseId,
      eventType:         input.eventType,
      deltaUnits:        input.deltaUnits,
      reason:            input.reason ?? null,
      idempotencyKey:    key,
      erpReference:      input.erpReference ?? null,
      createdByUserId:   input.createdByUserId ?? null,
      createdAtUtc,
    }
  }
}
