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

    // Create local purchase intent
    const purchase = await this.purchaseRepo.createPurchaseFromTemplate(ctx, {
      clientIndexId:     input.clientIndexId,
      erpCustomerId:     input.erpCustomerId,
      packageTemplateId: input.packageTemplateId,
      idempotencyKey:    input.idempotencyKey,
    })

    const snapshot = purchase.templateSnapshot

    if (snapshot.priceAmount > 0) {
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

    // Pending with invoice id — recovery: re-submit if still draft, then finalize locally
    if (packageStatus === 'pending_activation' && erpSalesInvoiceId !== null) {
      const existingInvoice = await this.erp.getInvoiceById(erpSalesInvoiceId)
      const submittedInvoice = isInvoiceDraft(existingInvoice)
        ? await this.erp.submitSalesInvoice(erpSalesInvoiceId)
        : existingInvoice

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
            deltaUnits:        purchase.templateSnapshot.sessionCount,
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
        isIdempotentReplay: true,
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
