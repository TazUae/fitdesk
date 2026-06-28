/**
 * Package assignment service — orchestrates the full Assign Package sequence.
 *
 * Sequence (ADR §15.2):
 *  1. Validate input + idempotency pre-check
 *  2. Read and validate package template
 *  3. Create local purchase intent (createPurchaseFromTemplate)
 *  4. Build ERP invoice payload (buildPackageInvoicePayload) — non-zero only
 *  5. ERP: createInvoice — non-zero only
 *  6. Persist ERP invoice docname (recordInvoiceCreated) — recovery anchor, non-zero only
 *  7. ERP: submitSalesInvoice — non-zero only
 *  8. Local transaction: activate purchase + append ledger event
 *
 * ERP dependency is constructor-injected as PackageAssignmentErpAdapter.
 * No direct ERP client import. No erpFetch. No fetch. No actions. No 'use server'.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import type { Invoice } from '@/types'
import type { CreateInvoicePayload } from '@/lib/erpnext/types'
import { PackageTemplateRepository } from '@/lib/billing/package-template-repository'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import { buildPackageInvoicePayload } from '@/lib/billing/package-invoice-builder'
import type { PackagePaymentStatus } from '@/lib/billing/taxonomy'
import { isEnabledPaymentMethod, paymentMethodToErpMode } from '@/lib/payments/methods'
import { projectPackagePaymentStatus } from '@/lib/billing/payment-status'
import type {
  AssignPackageInput,
  AssignPackageResult,
  ClientPackagePurchase,
  PackageLedgerEvent,
  PackageTemplateSnapshot,
} from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

type AppDb = LibSQLDatabase<typeof schema>

export type TenantCtx = { tenantId: string }

export type PackageAssignmentErpAdapter = {
  createInvoice:     (payload: CreateInvoicePayload) => Promise<Invoice>
  submitSalesInvoice:(invoiceId: string)              => Promise<Invoice>
  getInvoiceById:    (invoiceId: string)              => Promise<Invoice>
  // Optional — injected only when the caller requests Paid Now (C4+).
  // Not imported from the ERP client directly; must be injected by the caller.
  createAndSubmitPaymentEntry?: (opts: {
    invoiceId:     string
    clientId:      string
    amount:        number
    modeOfPayment: string
    date:          string
    reference?:    string
    note?:         string
  }) => Promise<{ payment: unknown; invoice: Invoice }>
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class DuplicateActivePackageError extends Error {
  constructor(
    readonly templateName: string,
    readonly activePurchaseCount: number,
  ) {
    super(
      `[DuplicateActivePackageError] "${templateName}" is already active ` +
      `${activePurchaseCount} time(s) for this client. ` +
      `Pass allowDuplicateActivePackage: true to override.`,
    )
    this.name = 'DuplicateActivePackageError'
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POSTING_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertTenantId(ctx: TenantCtx): string {
  if (!ctx.tenantId || ctx.tenantId.trim() === '') {
    throw new Error('[PackageAssignmentService] tenantId is required')
  }
  return ctx.tenantId
}

function resolvePostingDate(assignmentDate?: string | null): string {
  if (assignmentDate == null || assignmentDate === '') {
    return new Date().toISOString().slice(0, 10)
  }
  if (!POSTING_DATE_RE.test(assignmentDate)) {
    throw new Error(
      `[PackageAssignmentService] assignmentDate must be YYYY-MM-DD, got: "${assignmentDate}"`,
    )
  }
  return assignmentDate
}

function extractInvoiceDocname(invoice: Invoice): string {
  if (!invoice.id) {
    throw new Error(
      '[PackageAssignmentService] ERP invoice returned without an id/docname — cannot record invoice',
    )
  }
  return invoice.id
}

function isInvoiceDraft(invoice: Invoice): boolean {
  return invoice.status === 'draft'
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PackageAssignmentService {
  private readonly templateRepo: PackageTemplateRepository
  private readonly purchaseRepo: ClientPackagePurchaseRepository
  private readonly ledgerRepo:   PackageLedgerRepository

  constructor(
    private readonly db:  AppDb,
    private readonly erp: PackageAssignmentErpAdapter,
  ) {
    this.templateRepo = new PackageTemplateRepository(db)
    this.purchaseRepo = new ClientPackagePurchaseRepository(db)
    this.ledgerRepo   = new PackageLedgerRepository(db)
  }

  async assignPackage(
    ctx:   TenantCtx,
    input: AssignPackageInput,
  ): Promise<AssignPackageResult> {
    assertTenantId(ctx)

    if (!input.clientIndexId || input.clientIndexId.trim() === '') {
      throw new Error('[PackageAssignmentService] clientIndexId must not be blank')
    }
    if (!input.erpCustomerId || input.erpCustomerId.trim() === '') {
      throw new Error('[PackageAssignmentService] erpCustomerId must not be blank')
    }
    if (!input.packageTemplateId || input.packageTemplateId.trim() === '') {
      throw new Error('[PackageAssignmentService] packageTemplateId must not be blank')
    }
    if (!input.idempotencyKey || input.idempotencyKey.trim() === '') {
      throw new Error('[PackageAssignmentService] idempotencyKey must not be blank')
    }

    const postingDate = resolvePostingDate(input.assignmentDate)

    // Idempotency pre-check
    const existingPurchase = await this.purchaseRepo.findPurchaseByIdempotencyKey(
      ctx,
      input.idempotencyKey,
    )

    if (existingPurchase) {
      // Validate payload consistency
      if (
        existingPurchase.clientIndexId    !== input.clientIndexId ||
        existingPurchase.erpCustomerId    !== input.erpCustomerId ||
        existingPurchase.packageTemplateId !== input.packageTemplateId
      ) {
        throw new Error(
          `[PackageAssignmentService] idempotency key reuse with different payload: ` +
          `key "${input.idempotencyKey}" already used for a different client/customer/template`,
        )
      }
      return this.replayPurchase(ctx, existingPurchase, input)
    }

    // Duplicate active package guard — fresh assignments only; idempotent replays bypass
    const activeSameTemplate = await this.purchaseRepo.listActiveByClientAndTemplate(
      ctx,
      input.clientIndexId,
      input.packageTemplateId,
    )
    if (activeSameTemplate.length > 0 && !input.allowDuplicateActivePackage) {
      throw new DuplicateActivePackageError(
        activeSameTemplate[0]!.templateSnapshot.name,
        activeSameTemplate.length,
      )
    }

    // Fresh assignment — read and validate template
    const template = await this.templateRepo.findById(ctx, input.packageTemplateId)
    if (!template) {
      throw new Error(
        `[PackageAssignmentService] package template not found: ${input.packageTemplateId}`,
      )
    }
    if (template.status !== 'active') {
      throw new Error(
        `[PackageAssignmentService] template must be active; current status: "${template.status}"`,
      )
    }

    // Non-zero templates require erpItemCode before purchase creation
    if (template.priceAmount > 0 && (!template.erpItemCode || template.erpItemCode.trim() === '')) {
      throw new Error(
        '[PackageAssignmentService] erpItemCode must be set on the template before assigning a non-zero package',
      )
    }

    // For non-zero Paid Now: validate adapter capability and method before any DB/ERP write
    if (template.priceAmount > 0 && input.payment != null) {
      if (!this.erp.createAndSubmitPaymentEntry) {
        throw new Error(
          '[PackageAssignmentService] payment requested but adapter is missing createAndSubmitPaymentEntry',
        )
      }
      if (!isEnabledPaymentMethod(input.payment.method)) {
        throw new Error(
          `[PackageAssignmentService] unsupported or disabled payment method: "${input.payment.method}"`,
        )
      }
    }

    // Create local purchase intent
    const purchase = await this.purchaseRepo.createPurchaseFromTemplate(ctx, {
      clientIndexId:     input.clientIndexId,
      erpCustomerId:     input.erpCustomerId,
      packageTemplateId: input.packageTemplateId,
      idempotencyKey:    input.idempotencyKey,
    })

    const snapshot = purchase.templateSnapshot

    if (snapshot.priceAmount > 0) {
      if (input.payment != null) {
        return this.executePaidNowPath(ctx, purchase, snapshot, input, postingDate)
      }
      return this.executeNonZeroPath(ctx, purchase, snapshot, input, postingDate)
    }

    return this.executeComplimentaryPath(ctx, purchase, snapshot, input)
  }

  // ── Non-zero Pay Later path ───────────────────────────────────────────────

  private async executeNonZeroPath(
    ctx:         TenantCtx,
    purchase:    ClientPackagePurchase,
    snapshot:    PackageTemplateSnapshot,
    input:       AssignPackageInput,
    postingDate: string,
  ): Promise<AssignPackageResult> {
    const payload = buildPackageInvoicePayload({
      snapshot,
      erpCustomerId: purchase.erpCustomerId,
      postingDate,
    })

    const createdInvoice    = await this.erp.createInvoice(payload)
    const erpSalesInvoiceId = extractInvoiceDocname(createdInvoice)

    // Persist invoice docname before submission (recovery anchor — §15.2 step 3)
    await this.purchaseRepo.recordInvoiceCreated(ctx, purchase.id, { erpSalesInvoiceId })

    const submittedInvoice = await this.erp.submitSalesInvoice(erpSalesInvoiceId)

    let activatedPurchase!: ClientPackagePurchase
    let ledgerEvent!:       PackageLedgerEvent

    await this.db.transaction(async (tx) => {
      activatedPurchase = await this.purchaseRepo.attachInvoiceAndActivate(
        ctx,
        purchase.id,
        { erpSalesInvoiceId, paymentStatus: 'unpaid' },
        tx as unknown as AppDb,
      )
      ledgerEvent = await this.ledgerRepo.appendEvent(
        ctx,
        {
          clientIndexId:     purchase.clientIndexId,
          erpCustomerId:     purchase.erpCustomerId,
          packagePurchaseId: purchase.id,
          eventType:         'purchase_activation',
          deltaUnits:        snapshot.sessionCount,
          idempotencyKey:    input.idempotencyKey + ':activation',
          erpReference:      erpSalesInvoiceId,
          createdByUserId:   input.assignedByUserId ?? null,
        },
        tx as unknown as AppDb,
      )
    })

    return {
      purchase:           activatedPurchase,
      ledgerEvent,
      erpInvoiceId:       erpSalesInvoiceId,
      invoice:            submittedInvoice,
      isIdempotentReplay: false,
    }
  }

  // ── Non-zero Paid Now path ────────────────────────────────────────────────
  // Mirrors executeNonZeroPath up to submitSalesInvoice, then attempts one
  // Payment Entry. If the PE fails, a safe getInvoiceById re-fetch is tried
  // before projecting unpaid. The PE is NEVER retried on replay/recovery.

  private async executePaidNowPath(
    ctx:         TenantCtx,
    purchase:    ClientPackagePurchase,
    snapshot:    PackageTemplateSnapshot,
    input:       AssignPackageInput,
    postingDate: string,
  ): Promise<AssignPackageResult> {
    const payload = buildPackageInvoicePayload({
      snapshot,
      erpCustomerId: purchase.erpCustomerId,
      postingDate,
    })

    const createdInvoice    = await this.erp.createInvoice(payload)
    const erpSalesInvoiceId = extractInvoiceDocname(createdInvoice)

    // Persist invoice docname before submission (recovery anchor — §15.2 step 3)
    await this.purchaseRepo.recordInvoiceCreated(ctx, purchase.id, { erpSalesInvoiceId })

    const submittedInvoice = await this.erp.submitSalesInvoice(erpSalesInvoiceId)

    // Attempt payment once — never on replay (createAndSubmitPaymentEntry is not idempotent)
    let projectedPaymentStatus: PackagePaymentStatus = 'unpaid'
    let paymentWarning: string | null = null

    if (submittedInvoice.outstandingAmount > 0) {
      const modeOfPayment = paymentMethodToErpMode(input.payment!.method)
      try {
        const peResult = await this.erp.createAndSubmitPaymentEntry!({
          invoiceId:     erpSalesInvoiceId,
          clientId:      input.erpCustomerId,
          amount:        submittedInvoice.outstandingAmount,
          modeOfPayment,
          date:          postingDate,
        })
        projectedPaymentStatus = projectPackagePaymentStatus(peResult.invoice.status)
      } catch {
        // PE failed — attempt one safe re-fetch to detect a possible out-of-band payment
        let reconciledInvoice: Invoice | null = null
        try {
          reconciledInvoice = await this.erp.getInvoiceById(erpSalesInvoiceId)
        } catch {
          // re-fetch also failed — floor to unpaid
        }
        projectedPaymentStatus = reconciledInvoice
          ? projectPackagePaymentStatus(reconciledInvoice.status)
          : 'unpaid'
        if (projectedPaymentStatus !== 'paid' && projectedPaymentStatus !== 'partially_paid') {
          paymentWarning =
            'Payment was not recorded. The package is active and payment can be collected later.'
        }
      }
    } else {
      projectedPaymentStatus = projectPackagePaymentStatus(submittedInvoice.status)
    }

    let activatedPurchase!: ClientPackagePurchase
    let ledgerEvent!:       PackageLedgerEvent

    await this.db.transaction(async (tx) => {
      activatedPurchase = await this.purchaseRepo.attachInvoiceAndActivate(
        ctx,
        purchase.id,
        { erpSalesInvoiceId, paymentStatus: projectedPaymentStatus },
        tx as unknown as AppDb,
      )
      ledgerEvent = await this.ledgerRepo.appendEvent(
        ctx,
        {
          clientIndexId:     purchase.clientIndexId,
          erpCustomerId:     purchase.erpCustomerId,
          packagePurchaseId: purchase.id,
          eventType:         'purchase_activation',
          deltaUnits:        snapshot.sessionCount,
          idempotencyKey:    input.idempotencyKey + ':activation',
          erpReference:      erpSalesInvoiceId,
          createdByUserId:   input.assignedByUserId ?? null,
        },
        tx as unknown as AppDb,
      )
    })

    return {
      purchase:           activatedPurchase,
      ledgerEvent,
      erpInvoiceId:       erpSalesInvoiceId,
      invoice:            submittedInvoice,
      isIdempotentReplay: false,
      paymentWarning,
    }
  }

  // ── Zero-value complimentary path ─────────────────────────────────────────

  private async executeComplimentaryPath(
    ctx:      TenantCtx,
    purchase: ClientPackagePurchase,
    snapshot: PackageTemplateSnapshot,
    input:    AssignPackageInput,
  ): Promise<AssignPackageResult> {
    let activatedPurchase!: ClientPackagePurchase
    let ledgerEvent!:       PackageLedgerEvent

    await this.db.transaction(async (tx) => {
      activatedPurchase = await this.purchaseRepo.activateComplimentary(
        ctx,
        purchase.id,
        {},
        tx as unknown as AppDb,
      )
      ledgerEvent = await this.ledgerRepo.appendEvent(
        ctx,
        {
          clientIndexId:     purchase.clientIndexId,
          erpCustomerId:     purchase.erpCustomerId,
          packagePurchaseId: purchase.id,
          eventType:         'bonus_granted',
          deltaUnits:        snapshot.sessionCount,
          idempotencyKey:    input.idempotencyKey + ':bonus',
          erpReference:      null,
          createdByUserId:   input.assignedByUserId ?? null,
        },
        tx as unknown as AppDb,
      )
    })

    return {
      purchase:           activatedPurchase,
      ledgerEvent,
      erpInvoiceId:       null,
      invoice:            null,
      isIdempotentReplay: false,
    }
  }

  // ── Replay / recovery ─────────────────────────────────────────────────────

  private async replayPurchase(
    ctx:      TenantCtx,
    purchase: ClientPackagePurchase,
    input:    AssignPackageInput,
  ): Promise<AssignPackageResult> {
    const { packageStatus, erpSalesInvoiceId } = purchase

    // Pending with no invoice — in-flight duplicate; do not call ERP
    if (packageStatus === 'pending_activation' && erpSalesInvoiceId === null) {
      return {
        purchase,
        ledgerEvent:        null,
        erpInvoiceId:       null,
        invoice:            null,
        isIdempotentReplay: true,
      }
    }

    // Pending with invoice id — recovery: re-submit if still draft, then finalize locally.
    // Payment Entry is NEVER retried here — createAndSubmitPaymentEntry is not idempotent.
    // Instead, project paymentStatus from the ERP invoice state (detects out-of-band payments).
    if (packageStatus === 'pending_activation' && erpSalesInvoiceId !== null) {
      const existingInvoice = await this.erp.getInvoiceById(erpSalesInvoiceId)
      const submittedInvoice = isInvoiceDraft(existingInvoice)
        ? await this.erp.submitSalesInvoice(erpSalesInvoiceId)
        : existingInvoice

      const projectedStatus = projectPackagePaymentStatus(submittedInvoice.status)

      let activatedPurchase!: ClientPackagePurchase
      let ledgerEvent!:       PackageLedgerEvent

      await this.db.transaction(async (tx) => {
        activatedPurchase = await this.purchaseRepo.attachInvoiceAndActivate(
          ctx,
          purchase.id,
          { erpSalesInvoiceId, paymentStatus: projectedStatus },
          tx as unknown as AppDb,
        )
        ledgerEvent = await this.ledgerRepo.appendEvent(
          ctx,
          {
            clientIndexId:     purchase.clientIndexId,
            erpCustomerId:     purchase.erpCustomerId,
            packagePurchaseId: purchase.id,
            eventType:         'purchase_activation',
            deltaUnits:        purchase.templateSnapshot.sessionCount,
            idempotencyKey:    input.idempotencyKey + ':activation',
            erpReference:      erpSalesInvoiceId,
            createdByUserId:   input.assignedByUserId ?? null,
          },
          tx as unknown as AppDb,
        )
      })

      // When Paid Now was requested but the invoice is still unpaid after recovery,
      // inform the caller that payment must be collected separately.
      const recoveryPaymentWarning =
        input.payment != null &&
        projectedStatus !== 'paid' &&
        projectedStatus !== 'partially_paid'
          ? 'Payment was not retried to avoid duplicate collection. The package is active and payment can be collected later.'
          : null

      return {
        purchase:           activatedPurchase,
        ledgerEvent,
        erpInvoiceId:       erpSalesInvoiceId,
        invoice:            submittedInvoice,
        isIdempotentReplay: true,
        paymentWarning:     recoveryPaymentWarning,
      }
    }

    // Active — full replay: find existing ledger event, re-fetch invoice if applicable
    if (packageStatus === 'active') {
      const ledgerKey = erpSalesInvoiceId
        ? input.idempotencyKey + ':activation'
        : input.idempotencyKey + ':bonus'

      const ledgerEvent = await this.ledgerRepo.findEventByIdempotencyKey(ctx, ledgerKey)
      if (!ledgerEvent) {
        throw new Error(
          `[PackageAssignmentService] data integrity error: active purchase ${purchase.id} ` +
          `has no ledger event for key "${ledgerKey}"`,
        )
      }

      const invoice: Invoice | null = erpSalesInvoiceId
        ? await this.erp.getInvoiceById(erpSalesInvoiceId)
        : null

      return {
        purchase,
        ledgerEvent,
        erpInvoiceId:       erpSalesInvoiceId,
        invoice,
        isIdempotentReplay: true,
      }
    }

    throw new Error(
      `[PackageAssignmentService] unexpected purchase state during replay: ` +
      `packageStatus="${packageStatus}"`,
    )
  }
}
