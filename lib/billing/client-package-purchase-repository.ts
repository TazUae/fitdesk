/**
 * Tenant-scoped repository for client_package_purchase.
 *
 * RULES (enforced):
 *  1. Every public method requires ctx.tenantId — throws before any SQL if missing.
 *  2. createPurchaseFromTemplate runs entirely in a single DB transaction.
 *  3. template_snapshot_json is written once at purchase creation and never rewritten.
 *  4. package_template.first_sold_at_utc is stamped null→now only inside this repo,
 *     only during purchase creation, and only when currently null.
 *  5. No ERP calls. No invoice/payment/ledger/session side effects. No erpnext imports.
 *  6. Cross-tenant reads return null (reads) or throw (writes) — never cross-tenant data.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import type { TemplateType, PackageTemplateStatus } from '@/lib/billing/taxonomy'
import type {
  ClientPackagePurchase,
  CreatePackagePurchaseInput,
  PackageTemplate,
  PackageTemplateSnapshot,
} from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantCtx = {
  tenantId: string
}

type AppDb = LibSQLDatabase<typeof schema>

type RawPurchase = typeof schema.clientPackagePurchase.$inferSelect
type RawTemplate = typeof schema.packageTemplate.$inferSelect

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertTenantId(ctx: TenantCtx): string {
  if (!ctx.tenantId || ctx.tenantId.trim() === '') {
    throw new Error(
      '[ClientPackagePurchaseRepository] tenantId is required for all purchase operations',
    )
  }
  return ctx.tenantId
}

function hydrateTemplate(row: RawTemplate): PackageTemplate {
  return {
    id:                   row.id,
    tenantId:             row.tenantId,
    name:                 row.name,
    description:          row.description,
    templateType:         row.templateType as TemplateType,
    sessionCount:         row.sessionCount,
    priceAmount:          row.priceAmount,
    currency:             row.currency,
    expiryDays:           row.expiryDays,
    erpItemCode:          row.erpItemCode,
    status:               row.status as PackageTemplateStatus,
    firstSoldAtUtc:       row.firstSoldAtUtc,
    supersedesTemplateId: row.supersedesTemplateId,
    archivedAtUtc:        row.archivedAtUtc,
    createdAtUtc:         row.createdAtUtc,
    updatedAtUtc:         row.updatedAtUtc,
  }
}

function hydratePurchase(row: RawPurchase): ClientPackagePurchase {
  return {
    id:                   row.id,
    tenantId:             row.tenantId,
    clientIndexId:        row.clientIndexId,
    erpCustomerId:        row.erpCustomerId,
    packageTemplateId:    row.packageTemplateId,
    templateSnapshot:     JSON.parse(row.templateSnapshotJson) as PackageTemplateSnapshot,
    erpSalesInvoiceId:    row.erpSalesInvoiceId,
    paymentStatus:        row.paymentStatus as ClientPackagePurchase['paymentStatus'],
    packageStatus:        row.packageStatus as ClientPackagePurchase['packageStatus'],
    purchasedAtUtc:       row.purchasedAtUtc,
    activatedAtUtc:       row.activatedAtUtc,
    expiresAtUtc:         row.expiresAtUtc,
    createdAtUtc:         row.createdAtUtc,
    updatedAtUtc:         row.updatedAtUtc,
  }
}

// ─── Snapshot builder (exported for testing) ─────────────────────────────────

export function buildPackageTemplateSnapshot(
  template: PackageTemplate,
  capturedAtUtc: string,
): PackageTemplateSnapshot {
  return {
    schemaVersion:        1,
    templateId:           template.id,
    name:                 template.name,
    description:          template.description,
    templateType:         template.templateType,
    sessionCount:         template.sessionCount,
    priceAmount:          template.priceAmount,
    currency:             template.currency,
    expiryDays:           template.expiryDays,
    erpItemCode:          template.erpItemCode,
    supersedesTemplateId: template.supersedesTemplateId,
    templateStatus:       template.status,
    capturedAtUtc,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ClientPackagePurchaseRepository {
  constructor(private readonly db: AppDb) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async findPurchaseById(ctx: TenantCtx, id: string): Promise<ClientPackagePurchase | null> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientPackagePurchase)
      .where(
        and(
          eq(schema.clientPackagePurchase.tenantId, tenantId),
          eq(schema.clientPackagePurchase.id, id),
        ),
      )
      .limit(1)
    return rows[0] ? hydratePurchase(rows[0]) : null
  }

  async listPurchasesByClient(
    ctx: TenantCtx,
    clientIndexId: string,
  ): Promise<ClientPackagePurchase[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientPackagePurchase)
      .where(
        and(
          eq(schema.clientPackagePurchase.tenantId, tenantId),
          eq(schema.clientPackagePurchase.clientIndexId, clientIndexId),
        ),
      )
      .orderBy(desc(schema.clientPackagePurchase.purchasedAtUtc))
    return rows.map(hydratePurchase)
  }

  async listPurchasesByTemplate(
    ctx: TenantCtx,
    packageTemplateId: string,
  ): Promise<ClientPackagePurchase[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientPackagePurchase)
      .where(
        and(
          eq(schema.clientPackagePurchase.tenantId, tenantId),
          eq(schema.clientPackagePurchase.packageTemplateId, packageTemplateId),
        ),
      )
      .orderBy(desc(schema.clientPackagePurchase.purchasedAtUtc))
    return rows.map(hydratePurchase)
  }

  // ── Write ────────────────────────────────────────────────────────────────

  async createPurchaseFromTemplate(
    ctx: TenantCtx,
    input: CreatePackagePurchaseInput,
  ): Promise<ClientPackagePurchase> {
    const tenantId = assertTenantId(ctx)

    // Input validation — all three IDs must be non-empty
    if (!input.clientIndexId || input.clientIndexId.trim() === '') {
      throw new Error(
        '[ClientPackagePurchaseRepository] clientIndexId must not be blank',
      )
    }
    if (!input.erpCustomerId || input.erpCustomerId.trim() === '') {
      throw new Error(
        '[ClientPackagePurchaseRepository] erpCustomerId must not be blank',
      )
    }
    if (!input.packageTemplateId || input.packageTemplateId.trim() === '') {
      throw new Error(
        '[ClientPackagePurchaseRepository] packageTemplateId must not be blank',
      )
    }

    // Validate local client exists in this tenant
    const clientRows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.id, input.clientIndexId),
        ),
      )
      .limit(1)

    const clientRow = clientRows[0]
    if (!clientRow) {
      throw new Error(
        `[ClientPackagePurchaseRepository] client not found: ${input.clientIndexId}`,
      )
    }

    // Validate ERP customer ID matches the local client projection
    if (clientRow.erpCustomerId !== input.erpCustomerId) {
      throw new Error(
        `[ClientPackagePurchaseRepository] erpCustomerId mismatch: ` +
        `input "${input.erpCustomerId}" does not match client projection "${clientRow.erpCustomerId}"`,
      )
    }

    // Read template tenant-scoped
    const templateRows = await this.db
      .select()
      .from(schema.packageTemplate)
      .where(
        and(
          eq(schema.packageTemplate.tenantId, tenantId),
          eq(schema.packageTemplate.id, input.packageTemplateId),
        ),
      )
      .limit(1)

    const templateRow = templateRows[0]
    if (!templateRow) {
      throw new Error(
        `[ClientPackagePurchaseRepository] package template not found: ${input.packageTemplateId}`,
      )
    }

    const template = hydrateTemplate(templateRow)

    if (template.status !== 'active') {
      throw new Error(
        `[ClientPackagePurchaseRepository] template must be active to create a purchase; ` +
        `current status: "${template.status}"`,
      )
    }

    const now     = new Date().toISOString()
    const id      = crypto.randomUUID()
    const snapshot = buildPackageTemplateSnapshot(template, now)
    const snapshotJson = JSON.stringify(snapshot)

    let purchase!: ClientPackagePurchase

    await this.db.transaction(async (tx) => {
      // Insert the purchase row
      await tx.insert(schema.clientPackagePurchase).values({
        id,
        tenantId,
        clientIndexId:        input.clientIndexId,
        erpCustomerId:        input.erpCustomerId,
        packageTemplateId:    input.packageTemplateId,
        templateSnapshotJson: snapshotJson,
        erpSalesInvoiceId:    null,
        paymentStatus:        'pending',
        packageStatus:        'pending_activation',
        purchasedAtUtc:       now,
        activatedAtUtc:       null,
        expiresAtUtc:         null,
        createdAtUtc:         now,
        updatedAtUtc:         now,
      })

      // Stamp first_sold_at_utc on the template only if currently null.
      // Condition is checked on the WHERE clause — safe against concurrent races.
      await tx
        .update(schema.packageTemplate)
        .set({ firstSoldAtUtc: now, updatedAtUtc: now })
        .where(
          and(
            eq(schema.packageTemplate.tenantId, tenantId),
            eq(schema.packageTemplate.id, input.packageTemplateId),
            isNull(schema.packageTemplate.firstSoldAtUtc),
          ),
        )

      purchase = {
        id,
        tenantId,
        clientIndexId:     input.clientIndexId,
        erpCustomerId:     input.erpCustomerId,
        packageTemplateId: input.packageTemplateId,
        templateSnapshot:  snapshot,
        erpSalesInvoiceId: null,
        paymentStatus:     'pending',
        packageStatus:     'pending_activation',
        purchasedAtUtc:    now,
        activatedAtUtc:    null,
        expiresAtUtc:      null,
        createdAtUtc:      now,
        updatedAtUtc:      now,
      }
    })

    return purchase
  }
}
