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

  /**
   * Atomically appends a single-unit (-1) session_consumed debit ONLY IF the
   * package purchase's derived balance is currently >= 1 — the balance check
   * and the insert happen in ONE SQL statement, so a concurrent different-
   * session attempt on the same purchase's final unit cannot observe a
   * stale (pre-debit) balance the way two separate statements could
   * (Phase 6C — closes the read-then-insert gap in
   * PackageConsumptionService.consumeSession).
   *
   * Same-session idempotency is enforced in the same statement via a
   * NOT EXISTS guard on (tenant_id, idempotency_key) — this is defense in
   * depth alongside, not a replacement for, the DB-level partial unique
   * index, which remains the storage-engine-enforced backstop against any
   * successful double-insert.
   *
   * Returns the inserted event on success, or null when the conditional
   * insert affected zero rows. A null result is ambiguous by design between
   * "idempotency key already exists" (same-session replay) and "balance
   * insufficient" (no_balance) — the caller distinguishes the two with a
   * follow-up findEventByIdempotencyKey call, which is race-free because
   * package_ledger rows are immutable and never deleted once inserted.
   *
   * ATOMICITY NOTE: this relies on SQLite/libSQL's single-writer
   * serialization, not on an explicit transaction or a special isolation
   * level. Two concurrent single-statement writers against the same
   * database cannot have overlapping write phases — one fully commits
   * before the other's WHERE clause is evaluated — so the second writer's
   * balance subquery always observes the first writer's already-committed
   * debit.
   */
  async appendSessionConsumedIfBalanceAvailable(
    ctx: TenantCtx,
    input: {
      clientIndexId:     string
      erpCustomerId:     string
      packagePurchaseId: string
      idempotencyKey:    string
      erpReference:      string
      createdByUserId?:  string | null
    },
    executor?: AppDb,
  ): Promise<PackageLedgerEvent | null> {
    const tenantId = assertTenantId(ctx)

    if (!input.clientIndexId || input.clientIndexId.trim() === '') {
      throw new Error('[PackageLedgerRepository] clientIndexId must not be blank')
    }
    if (!input.erpCustomerId || input.erpCustomerId.trim() === '') {
      throw new Error('[PackageLedgerRepository] erpCustomerId must not be blank')
    }
    if (!input.packagePurchaseId || input.packagePurchaseId.trim() === '') {
      throw new Error('[PackageLedgerRepository] packagePurchaseId must not be blank')
    }
    if (!input.idempotencyKey || input.idempotencyKey.trim() === '') {
      throw new Error(
        '[PackageLedgerRepository] idempotencyKey must not be blank for a guarded consumption',
      )
    }

    const id           = crypto.randomUUID()
    const createdAtUtc = new Date().toISOString()
    const db           = executor ?? this.db
    const clientIndexId     = input.clientIndexId
    const erpCustomerId     = input.erpCustomerId
    const packagePurchaseId = input.packagePurchaseId
    const idempotencyKey    = input.idempotencyKey
    const erpReference      = input.erpReference
    const createdByUserId   = input.createdByUserId ?? null

    let rowsAffected: number

    try {
      const result = await db.run(sql`
        INSERT INTO "package_ledger"
          ("id","tenant_id","client_index_id","erp_customer_id","package_purchase_id",
           "event_type","delta_units","reason","idempotency_key","erp_reference",
           "created_by_user_id","created_at_utc")
        SELECT
          ${id}, ${tenantId}, ${clientIndexId}, ${erpCustomerId}, ${packagePurchaseId},
          'session_consumed', -1, NULL, ${idempotencyKey}, ${erpReference},
          ${createdByUserId}, ${createdAtUtc}
        WHERE NOT EXISTS (
          SELECT 1 FROM "package_ledger"
          WHERE "tenant_id" = ${tenantId} AND "idempotency_key" = ${idempotencyKey}
        )
        AND (
          SELECT COALESCE(SUM("delta_units"), 0) FROM "package_ledger"
          WHERE "tenant_id" = ${tenantId} AND "package_purchase_id" = ${packagePurchaseId}
        ) >= 1
      `)
      rowsAffected = (result as { rowsAffected?: number }).rowsAffected ?? 0
    } catch (err) {
      // Defense in depth: the NOT EXISTS guard above should make this
      // unreachable under normal operation (see ATOMICITY NOTE), but if the
      // storage-engine unique index is ever hit anyway, treat it the same as
      // "zero rows affected" rather than surfacing a raw constraint error.
      if (isUniqueConstraintError(err)) {
        rowsAffected = 0
      } else {
        throw err
      }
    }

    if (rowsAffected !== 1) {
      return null
    }

    return {
      id,
      tenantId,
      clientIndexId,
      erpCustomerId,
      packagePurchaseId,
      eventType:       'session_consumed',
      deltaUnits:      -1,
      reason:          null,
      idempotencyKey,
      erpReference,
      createdByUserId,
      createdAtUtc,
    }
  }
}
