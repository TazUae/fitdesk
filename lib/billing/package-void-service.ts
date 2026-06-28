/**
 * Package void service — reverses mistaken complimentary package assignments.
 *
 * Eligibility rules (all must pass):
 *  1. purchase belongs to the calling tenant
 *  2. purchase.packageStatus === 'active'
 *  3. templateSnapshot.templateType === 'complimentary'
 *  4. templateSnapshot.priceAmount === 0
 *  5. erpSalesInvoiceId === null
 *  6. remainingBalance === templateSnapshot.sessionCount (fully unused)
 *  7. trainer provides a non-empty reason
 *
 * Ledger approach:
 *  - Uses 'refund_credit' event (direction: negative) — the closest existing
 *    canonical type for reversing a session grant. The reason field carries
 *    the trainer-supplied context. No schema migration required.
 *  - Original ledger event invariant: purchase_activation/bonus_granted(+N)
 *    + refund_credit(-N) = 0
 *
 * No ERP calls. No invoice/payment/session side effects. No erpnext imports.
 * Idempotent: same voidIdempotencyKey replays without double-reversing.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import type { VoidPackageInput, VoidPackageResult } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

type AppDb = LibSQLDatabase<typeof schema>

export type TenantCtx = { tenantId: string }

// ─── Service ──────────────────────────────────────────────────────────────────

export class PackageVoidService {
  private readonly purchaseRepo: ClientPackagePurchaseRepository
  private readonly ledgerRepo:   PackageLedgerRepository

  constructor(private readonly db: AppDb) {
    this.purchaseRepo = new ClientPackagePurchaseRepository(db)
    this.ledgerRepo   = new PackageLedgerRepository(db)
  }

  async voidComplimentaryPackage(
    ctx: TenantCtx,
    input: VoidPackageInput,
  ): Promise<VoidPackageResult> {
    // ── Input validation ──────────────────────────────────────────────────────

    if (!input.packagePurchaseId || input.packagePurchaseId.trim() === '') {
      throw new Error('[PackageVoidService] packagePurchaseId must not be blank')
    }
    if (!input.reason || input.reason.trim() === '') {
      throw new Error('[PackageVoidService] reason must not be blank')
    }
    if (!input.voidIdempotencyKey || input.voidIdempotencyKey.trim() === '') {
      throw new Error('[PackageVoidService] voidIdempotencyKey must not be blank')
    }

    // ── Idempotency pre-check on ledger key ──────────────────────────────────

    const existingEvent = await this.ledgerRepo.findEventByIdempotencyKey(
      ctx,
      input.voidIdempotencyKey,
    )
    if (existingEvent) {
      const purchase = await this.purchaseRepo.findPurchaseById(ctx, input.packagePurchaseId)
      if (!purchase) {
        throw new Error(
          `[PackageVoidService] purchase not found on idempotent replay: ${input.packagePurchaseId}`,
        )
      }
      return { purchase, ledgerEvent: existingEvent, isIdempotentReplay: true }
    }

    // ── Find purchase (tenant-scoped) ─────────────────────────────────────────

    const purchase = await this.purchaseRepo.findPurchaseById(ctx, input.packagePurchaseId)
    if (!purchase) {
      throw new Error(`[PackageVoidService] purchase not found: ${input.packagePurchaseId}`)
    }

    // ── Eligibility validation ────────────────────────────────────────────────

    if (purchase.packageStatus !== 'active') {
      throw new Error(
        `[PackageVoidService] cannot void purchase with status "${purchase.packageStatus}"; must be active`,
      )
    }

    const snap = purchase.templateSnapshot

    if (snap.templateType !== 'complimentary') {
      throw new Error(
        `[PackageVoidService] only complimentary packages can be voided; template type is "${snap.templateType}"`,
      )
    }

    if (snap.priceAmount !== 0) {
      throw new Error(
        `[PackageVoidService] only zero-value packages can be voided; priceAmount is ${snap.priceAmount}`,
      )
    }

    if (purchase.erpSalesInvoiceId !== null) {
      throw new Error(
        `[PackageVoidService] cannot void a package linked to ERP invoice "${purchase.erpSalesInvoiceId}"`,
      )
    }

    // ── Validate unused balance ───────────────────────────────────────────────

    const remainingBalance = await this.ledgerRepo.deriveBalanceByPurchase(ctx, purchase.id)

    if (remainingBalance <= 0) {
      throw new Error(
        `[PackageVoidService] cannot void a package with no remaining sessions`,
      )
    }

    if (remainingBalance !== snap.sessionCount) {
      throw new Error(
        `[PackageVoidService] cannot void a partially-used package; ` +
        `remaining balance ${remainingBalance} does not equal original session count ${snap.sessionCount}`,
      )
    }

    // ── Write reversal + cancel in a transaction ──────────────────────────────

    let cancelledPurchase = purchase
    let ledgerEvent!: VoidPackageResult['ledgerEvent']

    await this.db.transaction(async (tx) => {
      ledgerEvent = await this.ledgerRepo.appendEvent(
        ctx,
        {
          clientIndexId:     purchase.clientIndexId,
          erpCustomerId:     purchase.erpCustomerId,
          packagePurchaseId: purchase.id,
          eventType:         'refund_credit',
          deltaUnits:        -remainingBalance,
          reason:            input.reason.trim(),
          idempotencyKey:    input.voidIdempotencyKey,
          createdByUserId:   input.voidedByUserId ?? null,
        },
        tx as unknown as AppDb,
      )
      cancelledPurchase = await this.purchaseRepo.cancelPurchase(
        ctx,
        purchase.id,
        tx as unknown as AppDb,
      )
    })

    return {
      purchase:           cancelledPurchase,
      ledgerEvent,
      isIdempotentReplay: false,
    }
  }
}
