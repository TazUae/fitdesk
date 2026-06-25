/**
 * Tenant-scoped repository for package_template.
 *
 * RULES (enforced):
 *  1. Every public method requires ctx.tenantId — throws before any SQL if missing.
 *  2. Priced/service fields are immutable once first_sold_at_utc is set (ADR §7).
 *  3. Archive is always allowed regardless of first_sold_at_utc (lifecycle, not financial).
 *  4. Activation requires a non-empty erp_item_code; does not call ERP.
 *  5. No ERP calls. No invoice/payment/session/ledger side effects.
 *  6. Currency is normalised to uppercase ISO 4217 on write.
 */

import { and, desc, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import { isTemplateType } from '@/lib/billing/taxonomy'
import type { TemplateType, PackageTemplateStatus } from '@/lib/billing/taxonomy'
import type { PackageTemplate, PackageTemplateDraft, PackageTemplateUpdate } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantCtx = {
  tenantId: string
}

type AppDb = LibSQLDatabase<typeof schema>

type RawPackageTemplate = typeof schema.packageTemplate.$inferSelect

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertTenantId(ctx: TenantCtx): string {
  if (!ctx.tenantId || ctx.tenantId.trim() === '') {
    throw new Error(
      '[PackageTemplateRepository] tenantId is required for all package template operations',
    )
  }
  return ctx.tenantId
}

function hydratePackageTemplate(row: RawPackageTemplate): PackageTemplate {
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

function validateDraft(draft: PackageTemplateDraft): void {
  if (!draft.name || draft.name.trim() === '') {
    throw new Error('[PackageTemplateRepository] name must not be blank')
  }
  if (draft.templateType !== undefined && !isTemplateType(draft.templateType)) {
    throw new Error(
      `[PackageTemplateRepository] invalid template_type: ${String(draft.templateType)}`,
    )
  }
  if (!Number.isInteger(draft.sessionCount) || draft.sessionCount < 1) {
    throw new Error('[PackageTemplateRepository] session_count must be a positive integer')
  }
  if (draft.priceAmount !== undefined && (!Number.isInteger(draft.priceAmount) || draft.priceAmount < 0)) {
    throw new Error(
      '[PackageTemplateRepository] price_amount must be a non-negative integer (minor units)',
    )
  }
  if (!draft.currency || draft.currency.trim().length !== 3) {
    throw new Error('[PackageTemplateRepository] currency must be a 3-character ISO 4217 code')
  }
  if (
    draft.expiryDays !== undefined &&
    draft.expiryDays !== null &&
    (!Number.isInteger(draft.expiryDays) || draft.expiryDays < 1)
  ) {
    throw new Error('[PackageTemplateRepository] expiry_days must be a positive integer or null')
  }
}

function validateUpdate(updates: PackageTemplateUpdate): void {
  if ('name' in updates && updates.name !== undefined && updates.name.trim() === '') {
    throw new Error('[PackageTemplateRepository] name must not be blank')
  }
  if (
    'templateType' in updates &&
    updates.templateType !== undefined &&
    !isTemplateType(updates.templateType)
  ) {
    throw new Error(
      `[PackageTemplateRepository] invalid template_type: ${String(updates.templateType)}`,
    )
  }
  if (
    'sessionCount' in updates &&
    updates.sessionCount !== undefined &&
    (!Number.isInteger(updates.sessionCount) || updates.sessionCount < 1)
  ) {
    throw new Error('[PackageTemplateRepository] session_count must be a positive integer')
  }
  if (
    'priceAmount' in updates &&
    updates.priceAmount !== undefined &&
    (!Number.isInteger(updates.priceAmount) || updates.priceAmount < 0)
  ) {
    throw new Error('[PackageTemplateRepository] price_amount must be a non-negative integer')
  }
  if (
    'currency' in updates &&
    updates.currency !== undefined &&
    updates.currency.trim().length !== 3
  ) {
    throw new Error('[PackageTemplateRepository] currency must be a 3-character ISO 4217 code')
  }
  if (
    'expiryDays' in updates &&
    updates.expiryDays !== undefined &&
    updates.expiryDays !== null &&
    (!Number.isInteger(updates.expiryDays) || updates.expiryDays < 1)
  ) {
    throw new Error('[PackageTemplateRepository] expiry_days must be a positive integer or null')
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class PackageTemplateRepository {
  constructor(private readonly db: AppDb) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async findById(ctx: TenantCtx, id: string): Promise<PackageTemplate | null> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.packageTemplate)
      .where(
        and(
          eq(schema.packageTemplate.tenantId, tenantId),
          eq(schema.packageTemplate.id, id),
        ),
      )
      .limit(1)
    return rows[0] ? hydratePackageTemplate(rows[0]) : null
  }

  async listTemplates(
    ctx: TenantCtx,
    opts: { status?: PackageTemplateStatus } = {},
  ): Promise<PackageTemplate[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.packageTemplate)
      .where(
        opts.status
          ? and(
              eq(schema.packageTemplate.tenantId, tenantId),
              eq(schema.packageTemplate.status, opts.status),
            )
          : eq(schema.packageTemplate.tenantId, tenantId),
      )
      .orderBy(desc(schema.packageTemplate.updatedAtUtc))
    return rows.map(hydratePackageTemplate)
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  async createTemplate(
    ctx: TenantCtx,
    draft: PackageTemplateDraft,
  ): Promise<PackageTemplate> {
    const tenantId = assertTenantId(ctx)
    validateDraft(draft)

    const now          = new Date().toISOString()
    const id           = crypto.randomUUID()
    const name         = draft.name.trim()
    const description  = draft.description ?? null
    const templateType = draft.templateType ?? 'standard_block'
    const sessionCount = draft.sessionCount
    const priceAmount  = draft.priceAmount ?? 0
    const currency     = draft.currency.toUpperCase()
    const expiryDays   = draft.expiryDays ?? null
    const erpItemCode  = draft.erpItemCode ?? null
    const supersedesTemplateId = draft.supersedesTemplateId ?? null

    await this.db.insert(schema.packageTemplate).values({
      id,
      tenantId,
      name,
      description,
      templateType,
      sessionCount,
      priceAmount,
      currency,
      expiryDays,
      erpItemCode,
      status:               'draft',
      firstSoldAtUtc:       null,
      supersedesTemplateId,
      archivedAtUtc:        null,
      createdAtUtc:         now,
      updatedAtUtc:         now,
    })

    return {
      id,
      tenantId,
      name,
      description,
      templateType,
      sessionCount,
      priceAmount,
      currency,
      expiryDays,
      erpItemCode,
      status:               'draft',
      firstSoldAtUtc:       null,
      supersedesTemplateId,
      archivedAtUtc:        null,
      createdAtUtc:         now,
      updatedAtUtc:         now,
    }
  }

  async updateTemplate(
    ctx: TenantCtx,
    id: string,
    updates: PackageTemplateUpdate,
  ): Promise<PackageTemplate> {
    const tenantId = assertTenantId(ctx)
    validateUpdate(updates)

    const existing = await this.findById(ctx, id)
    if (!existing) {
      throw new Error(`[PackageTemplateRepository] template not found: ${id}`)
    }
    if (existing.firstSoldAtUtc !== null) {
      throw new Error(
        '[PackageTemplateRepository] template is immutable: first_sold_at_utc is set',
      )
    }
    if (existing.status === 'archived') {
      throw new Error('[PackageTemplateRepository] archived template cannot be updated')
    }

    const now = new Date().toISOString()

    // Compute the final values for each updatable field.
    // Providing all fields to .set() avoids dynamic patch typing complications.
    const name = 'name' in updates && updates.name !== undefined
      ? updates.name.trim()
      : existing.name
    const description = 'description' in updates
      ? (updates.description ?? null)
      : existing.description
    const templateType = 'templateType' in updates && updates.templateType !== undefined
      ? updates.templateType
      : existing.templateType
    const sessionCount = 'sessionCount' in updates && updates.sessionCount !== undefined
      ? updates.sessionCount
      : existing.sessionCount
    const priceAmount = 'priceAmount' in updates && updates.priceAmount !== undefined
      ? updates.priceAmount
      : existing.priceAmount
    const currency = 'currency' in updates && updates.currency !== undefined
      ? updates.currency.toUpperCase()
      : existing.currency
    const expiryDays = 'expiryDays' in updates
      ? (updates.expiryDays ?? null)
      : existing.expiryDays
    const erpItemCode = 'erpItemCode' in updates
      ? (updates.erpItemCode ?? null)
      : existing.erpItemCode
    const supersedesTemplateId = 'supersedesTemplateId' in updates
      ? (updates.supersedesTemplateId ?? null)
      : existing.supersedesTemplateId

    await this.db
      .update(schema.packageTemplate)
      .set({
        name,
        description,
        templateType,
        sessionCount,
        priceAmount,
        currency,
        expiryDays,
        erpItemCode,
        supersedesTemplateId,
        updatedAtUtc: now,
      })
      .where(
        and(
          eq(schema.packageTemplate.tenantId, tenantId),
          eq(schema.packageTemplate.id, id),
        ),
      )

    return {
      ...existing,
      name,
      description,
      templateType,
      sessionCount,
      priceAmount,
      currency,
      expiryDays,
      erpItemCode,
      supersedesTemplateId,
      updatedAtUtc: now,
    }
  }

  async archiveTemplate(ctx: TenantCtx, id: string): Promise<PackageTemplate> {
    const tenantId = assertTenantId(ctx)

    const existing = await this.findById(ctx, id)
    if (!existing) {
      throw new Error(`[PackageTemplateRepository] template not found: ${id}`)
    }

    // Idempotent — already archived
    if (existing.status === 'archived') {
      return existing
    }

    const now = new Date().toISOString()
    await this.db
      .update(schema.packageTemplate)
      .set({ status: 'archived', archivedAtUtc: now, updatedAtUtc: now })
      .where(
        and(
          eq(schema.packageTemplate.tenantId, tenantId),
          eq(schema.packageTemplate.id, id),
        ),
      )

    return {
      ...existing,
      status:        'archived',
      archivedAtUtc: now,
      updatedAtUtc:  now,
    }
  }

  async activateTemplate(ctx: TenantCtx, id: string): Promise<PackageTemplate> {
    const tenantId = assertTenantId(ctx)

    const existing = await this.findById(ctx, id)
    if (!existing) {
      throw new Error(`[PackageTemplateRepository] template not found: ${id}`)
    }
    if (existing.status === 'archived') {
      throw new Error('[PackageTemplateRepository] archived template cannot be activated')
    }
    if (!existing.erpItemCode || existing.erpItemCode.trim() === '') {
      throw new Error(
        '[PackageTemplateRepository] erp_item_code must be set before activating a template',
      )
    }

    // Idempotent — already active
    if (existing.status === 'active') {
      return existing
    }

    const now = new Date().toISOString()
    await this.db
      .update(schema.packageTemplate)
      .set({ status: 'active', updatedAtUtc: now })
      .where(
        and(
          eq(schema.packageTemplate.tenantId, tenantId),
          eq(schema.packageTemplate.id, id),
        ),
      )

    return { ...existing, status: 'active', updatedAtUtc: now }
  }
}
