/**
 * Package consumption service — records a "Use 1 session" debit against the
 * best available active, non-expired package for a client.
 *
 * C6A building block. No ERP writes. No invoice/payment side effects.
 * Idempotent: same sessionId produces the same ledger event on replay.
 *
 * Package selection: active + non-expired, expiry-first (earliest expiry
 * consumed first; no-expiry packages consumed last).
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import type { PackageLedgerEvent } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

type AppDb = LibSQLDatabase<typeof schema>

export type TenantCtx = { tenantId: string }

export type ConsumeSessionInput = {
  sessionId:          string
  clientIndexId:      string
  erpCustomerId:      string
  consumedByUserId?:  string | null
  nowUtc?:            string
}

export type ConsumeSessionResult =
  | { outcome: 'consumed';     ledgerEvent: PackageLedgerEvent; packagePurchaseId: string; remainingBalance: number }
  | { outcome: 'already_done'; ledgerEvent: PackageLedgerEvent }
  | { outcome: 'no_package';   reason: string }
  | { outcome: 'no_balance';   reason: string; packagePurchaseId: string }

// ─── Service ──────────────────────────────────────────────────────────────────

export class PackageConsumptionService {
  private readonly purchaseRepo: ClientPackagePurchaseRepository
  private readonly ledgerRepo:   PackageLedgerRepository

  constructor(private readonly db: AppDb) {
    this.purchaseRepo = new ClientPackagePurchaseRepository(db)
    this.ledgerRepo   = new PackageLedgerRepository(db)
  }

  async consumeSession(
    ctx: TenantCtx,
    input: ConsumeSessionInput,
  ): Promise<ConsumeSessionResult> {
    if (!ctx.tenantId || ctx.tenantId.trim() === '') {
      throw new Error('[PackageConsumptionService] tenantId is required')
    }
    if (!input.sessionId || input.sessionId.trim() === '') {
      throw new Error('[PackageConsumptionService] sessionId must not be blank')
    }
    if (!input.clientIndexId || input.clientIndexId.trim() === '') {
      throw new Error('[PackageConsumptionService] clientIndexId must not be blank')
    }
    if (!input.erpCustomerId || input.erpCustomerId.trim() === '') {
      throw new Error('[PackageConsumptionService] erpCustomerId must not be blank')
    }

    const idempotencyKey = `session_consumed:${input.sessionId}`
    const nowUtc         = input.nowUtc ?? new Date().toISOString()

    // 1. Idempotency pre-check
    const existingEvent = await this.ledgerRepo.findEventByIdempotencyKey(ctx, idempotencyKey)
    if (existingEvent) {
      return { outcome: 'already_done', ledgerEvent: existingEvent }
    }

    // 2. Find best eligible package (active, non-expired, expiry-first)
    const purchase = await this.purchaseRepo.findBestEligiblePackageForClient(
      ctx,
      input.clientIndexId,
      nowUtc,
    )
    if (!purchase) {
      return { outcome: 'no_package', reason: 'No active non-expired package found for this client.' }
    }

    // 3. Derive current balance for that package
    const balance = await this.ledgerRepo.deriveBalanceByPurchase(ctx, purchase.id)
    if (balance <= 0) {
      return {
        outcome:           'no_balance',
        reason:            `Package ${purchase.id} has no remaining sessions (balance ${balance}).`,
        packagePurchaseId: purchase.id,
      }
    }

    // 4. Append session_consumed event in a transaction
    let ledgerEvent!: PackageLedgerEvent

    await this.db.transaction(async (tx) => {
      ledgerEvent = await this.ledgerRepo.appendEvent(
        ctx,
        {
          clientIndexId:     input.clientIndexId,
          erpCustomerId:     input.erpCustomerId,
          packagePurchaseId: purchase.id,
          eventType:         'session_consumed',
          deltaUnits:        -1,
          idempotencyKey,
          erpReference:      input.sessionId,
          createdByUserId:   input.consumedByUserId ?? null,
        },
        tx as unknown as AppDb,
      )
    })

    return {
      outcome:           'consumed',
      ledgerEvent,
      packagePurchaseId: purchase.id,
      remainingBalance:  balance - 1,
    }
  }
}
