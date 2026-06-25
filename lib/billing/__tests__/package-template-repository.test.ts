/**
 * Integration tests for PackageTemplateRepository.
 *
 * Uses a unique temp-file SQLite database per test so Drizzle queries
 * and direct insert/select operations share the same persistent connection.
 * (@libsql/client :memory: uses separate connections per request, so DDL
 * applied via client.execute() is not visible inside Drizzle queries.)
 *
 * Only the package_template table DDL is created here.
 * The repository only queries schema.packageTemplate — other schema tables
 * are present in the Drizzle instance but never queried.
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/lib/db/schema'
import { PackageTemplateRepository } from '@/lib/billing/package-template-repository'
import type { PackageTemplateDraft, PackageTemplateUpdate } from '@/types/billing'

// ─── DDL (kept in sync with scripts/migrate-app.mjs) ─────────────────────────

const PACKAGE_TEMPLATE_DDL = [
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
  `CREATE INDEX IF NOT EXISTS "package_template_tenant_status_idx"
    ON "package_template" ("tenant_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "package_template_tenant_type_idx"
    ON "package_template" ("tenant_id", "template_type")`,
]

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

const baseDraft: PackageTemplateDraft = {
  name:         '10-Session Block',
  templateType: 'standard_block',
  sessionCount: 10,
  priceAmount:  50000,
  currency:     'USD',
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

let tempDir: string
let dbClient: ReturnType<typeof createClient>
let repo: PackageTemplateRepository

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'fitdesk-billing-repo-test-'))
  const dbPath = join(tempDir, 'test.db')
  dbClient = createClient({ url: `file:${dbPath}` })
  for (const sql of PACKAGE_TEMPLATE_DDL) {
    await dbClient.execute(sql)
  }
  const db = drizzle(dbClient, { schema })
  repo = new PackageTemplateRepository(db)
})

afterEach(() => {
  dbClient.close()
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* noop */ }
})

// ─── Tenant guard ─────────────────────────────────────────────────────────────

describe('tenant isolation guard', () => {
  it('throws when tenantId is empty string', async () => {
    await expect(
      repo.listTemplates({ tenantId: '' }),
    ).rejects.toThrow('[PackageTemplateRepository] tenantId is required')
  })

  it('throws when tenantId is whitespace-only', async () => {
    await expect(
      repo.findById({ tenantId: '   ' }, 'some-id'),
    ).rejects.toThrow('[PackageTemplateRepository] tenantId is required')
  })

  it('throws when tenantId is whitespace on createTemplate', async () => {
    await expect(
      repo.createTemplate({ tenantId: '' }, baseDraft),
    ).rejects.toThrow('[PackageTemplateRepository] tenantId is required')
  })
})

// ─── createTemplate ───────────────────────────────────────────────────────────

describe('createTemplate', () => {
  it('creates a draft template and returns the domain object', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)

    expect(t.id).toBeTruthy()
    expect(t.tenantId).toBe(TENANT_A)
    expect(t.name).toBe('10-Session Block')
    expect(t.templateType).toBe('standard_block')
    expect(t.sessionCount).toBe(10)
    expect(t.priceAmount).toBe(50000)
    expect(t.currency).toBe('USD')
    expect(t.status).toBe('draft')
    expect(t.firstSoldAtUtc).toBeNull()
    expect(t.archivedAtUtc).toBeNull()
  })

  it('defaults templateType to standard_block when omitted', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, {
      name: 'Test', sessionCount: 5, currency: 'USD',
    })
    expect(t.templateType).toBe('standard_block')
  })

  it('defaults priceAmount to 0 when omitted', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, {
      name: 'Comp', templateType: 'complimentary', sessionCount: 3, currency: 'USD',
    })
    expect(t.priceAmount).toBe(0)
  })

  it('populates both timestamps as ISO-8601 strings', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    expect(t.createdAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(t.updatedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('normalises currency to uppercase', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, currency: 'usd',
    })
    expect(t.currency).toBe('USD')
  })

  it('stores optional description', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, description: 'A great block',
    })
    expect(t.description).toBe('A great block')
  })

  it('stores expiryDays when provided', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, expiryDays: 90,
    })
    expect(t.expiryDays).toBe(90)
  })

  it('allows null expiryDays (no expiry)', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, expiryDays: null,
    })
    expect(t.expiryDays).toBeNull()
  })
})

// ─── createTemplate — validation ─────────────────────────────────────────────

describe('createTemplate validation', () => {
  it('rejects blank name', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, name: '' }),
    ).rejects.toThrow('name must not be blank')
  })

  it('rejects whitespace-only name', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, name: '   ' }),
    ).rejects.toThrow('name must not be blank')
  })

  it('rejects invalid templateType', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, {
        ...baseDraft, templateType: 'premium' as 'standard_block',
      }),
    ).rejects.toThrow('invalid template_type')
  })

  it('rejects sessionCount = 0', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, sessionCount: 0 }),
    ).rejects.toThrow('session_count must be a positive integer')
  })

  it('rejects sessionCount < 0', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, sessionCount: -5 }),
    ).rejects.toThrow('session_count must be a positive integer')
  })

  it('rejects priceAmount < 0', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, priceAmount: -1 }),
    ).rejects.toThrow('price_amount must be a non-negative integer')
  })

  it('rejects currency with length != 3', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, currency: 'US' }),
    ).rejects.toThrow('currency must be a 3-character ISO 4217 code')
  })

  it('rejects currency with length > 3', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, currency: 'USDD' }),
    ).rejects.toThrow('currency must be a 3-character ISO 4217 code')
  })

  it('rejects expiryDays = 0', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, expiryDays: 0 }),
    ).rejects.toThrow('expiry_days must be a positive integer or null')
  })

  it('rejects expiryDays < 0', async () => {
    await expect(
      repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, expiryDays: -30 }),
    ).rejects.toThrow('expiry_days must be a positive integer or null')
  })
})

// ─── findById ─────────────────────────────────────────────────────────────────

describe('findById', () => {
  it('returns the template for the correct tenant', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const found = await repo.findById({ tenantId: TENANT_A }, created.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
    expect(found!.name).toBe('10-Session Block')
  })

  it('returns null for a different tenant (tenant isolation)', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const found = await repo.findById({ tenantId: TENANT_B }, created.id)
    expect(found).toBeNull()
  })

  it('returns null for a non-existent id', async () => {
    const found = await repo.findById({ tenantId: TENANT_A }, 'no-such-id')
    expect(found).toBeNull()
  })
})

// ─── listTemplates ────────────────────────────────────────────────────────────

describe('listTemplates', () => {
  it('returns only templates belonging to the requesting tenant', async () => {
    await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await repo.createTemplate({ tenantId: TENANT_B }, { ...baseDraft, name: 'B Template' })

    const listA = await repo.listTemplates({ tenantId: TENANT_A })
    const listB = await repo.listTemplates({ tenantId: TENANT_B })

    expect(listA).toHaveLength(1)
    expect(listA[0].tenantId).toBe(TENANT_A)
    expect(listB).toHaveLength(1)
    expect(listB[0].tenantId).toBe(TENANT_B)
  })

  it('returns all templates when no status filter is given', async () => {
    const t = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await repo.archiveTemplate({ tenantId: TENANT_A }, t.id)

    const list = await repo.listTemplates({ tenantId: TENANT_A })
    expect(list.length).toBeGreaterThanOrEqual(1)
  })

  it('filters by status when provided', async () => {
    await repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, name: 'Draft One' })
    const t2 = await repo.createTemplate({ tenantId: TENANT_A }, { ...baseDraft, name: 'To Archive' })
    await repo.archiveTemplate({ tenantId: TENANT_A }, t2.id)

    const drafts = await repo.listTemplates({ tenantId: TENANT_A }, { status: 'draft' })
    const archived = await repo.listTemplates({ tenantId: TENANT_A }, { status: 'archived' })

    expect(drafts.every(t => t.status === 'draft')).toBe(true)
    expect(archived.every(t => t.status === 'archived')).toBe(true)
    expect(drafts.some(t => t.name === 'Draft One')).toBe(true)
    expect(archived.some(t => t.name === 'To Archive')).toBe(true)
  })

  it('returns empty array when tenant has no templates', async () => {
    const list = await repo.listTemplates({ tenantId: TENANT_A })
    expect(list).toEqual([])
  })
})

// ─── updateTemplate ───────────────────────────────────────────────────────────

describe('updateTemplate', () => {
  it('updates a field and advances updated_at_utc', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const originalUpdatedAt = created.updatedAtUtc

    // Introduce a small delay so updated_at_utc advances
    await new Promise(r => setTimeout(r, 5))

    const updated = await repo.updateTemplate(
      { tenantId: TENANT_A },
      created.id,
      { name: 'Revised Block' },
    )

    expect(updated.name).toBe('Revised Block')
    expect(updated.updatedAtUtc).not.toBe(originalUpdatedAt)
  })

  it('does not alter first_sold_at_utc, created_at_utc, or status on normal update', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const updated = await repo.updateTemplate(
      { tenantId: TENANT_A },
      created.id,
      { name: 'Changed Name' },
    )
    expect(updated.firstSoldAtUtc).toBeNull()
    expect(updated.createdAtUtc).toBe(created.createdAtUtc)
    expect(updated.status).toBe('draft')
  })

  it('updates multiple fields at once', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const updates: PackageTemplateUpdate = {
      name:         'Extended Block',
      sessionCount: 20,
      priceAmount:  80000,
      expiryDays:   180,
    }
    const updated = await repo.updateTemplate({ tenantId: TENANT_A }, created.id, updates)
    expect(updated.name).toBe('Extended Block')
    expect(updated.sessionCount).toBe(20)
    expect(updated.priceAmount).toBe(80000)
    expect(updated.expiryDays).toBe(180)
  })

  it('can set erpItemCode on an unused template', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const updated = await repo.updateTemplate(
      { tenantId: TENANT_A },
      created.id,
      { erpItemCode: 'PT-SESSION-10' },
    )
    expect(updated.erpItemCode).toBe('PT-SESSION-10')
  })

  it('rejects update when first_sold_at_utc is set (immutability rule)', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)

    // Simulate a sale: set first_sold_at_utc directly via the raw client
    await dbClient.execute(
      `UPDATE "package_template"
       SET "first_sold_at_utc" = '2026-01-01T00:00:00.000Z'
       WHERE "id" = '${created.id}'`,
    )

    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, { name: 'Cannot change' }),
    ).rejects.toThrow('template is immutable: first_sold_at_utc is set')
  })

  it('rejects update on an archived template', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await repo.archiveTemplate({ tenantId: TENANT_A }, created.id)

    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, { name: 'Cannot change' }),
    ).rejects.toThrow('archived template cannot be updated')
  })

  it('rejects update for a different tenant (tenant isolation)', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.updateTemplate({ tenantId: TENANT_B }, created.id, { name: 'Hijack' }),
    ).rejects.toThrow('template not found')
  })

  it('rejects blank name in update', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, { name: '' }),
    ).rejects.toThrow('name must not be blank')
  })

  it('rejects invalid template_type in update', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, {
        templateType: 'vip' as 'standard_block',
      }),
    ).rejects.toThrow('invalid template_type')
  })

  it('rejects session_count <= 0 in update', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, { sessionCount: 0 }),
    ).rejects.toThrow('session_count must be a positive integer')
  })

  it('rejects price_amount < 0 in update', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, { priceAmount: -100 }),
    ).rejects.toThrow('price_amount must be a non-negative integer')
  })

  it('rejects invalid currency length in update', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, { currency: 'EU' }),
    ).rejects.toThrow('currency must be a 3-character ISO 4217 code')
  })

  it('rejects expiry_days <= 0 in update', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.updateTemplate({ tenantId: TENANT_A }, created.id, { expiryDays: 0 }),
    ).rejects.toThrow('expiry_days must be a positive integer or null')
  })
})

// ─── archiveTemplate ──────────────────────────────────────────────────────────

describe('archiveTemplate', () => {
  it('sets status to archived and records archived_at_utc', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const archived = await repo.archiveTemplate({ tenantId: TENANT_A }, created.id)

    expect(archived.status).toBe('archived')
    expect(archived.archivedAtUtc).toBeTruthy()
    expect(archived.archivedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('is idempotent — archiving an already-archived template returns it unchanged', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const first = await repo.archiveTemplate({ tenantId: TENANT_A }, created.id)
    const second = await repo.archiveTemplate({ tenantId: TENANT_A }, created.id)

    expect(second.status).toBe('archived')
    expect(second.archivedAtUtc).toBe(first.archivedAtUtc)
  })

  it('succeeds even when first_sold_at_utc is set', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await dbClient.execute(
      `UPDATE "package_template"
       SET "first_sold_at_utc" = '2026-01-01T00:00:00.000Z'
       WHERE "id" = '${created.id}'`,
    )

    const archived = await repo.archiveTemplate({ tenantId: TENANT_A }, created.id)
    expect(archived.status).toBe('archived')
  })

  it('does not mutate priced/service fields', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    const archived = await repo.archiveTemplate({ tenantId: TENANT_A }, created.id)

    expect(archived.name).toBe(created.name)
    expect(archived.sessionCount).toBe(created.sessionCount)
    expect(archived.priceAmount).toBe(created.priceAmount)
    expect(archived.currency).toBe(created.currency)
    expect(archived.templateType).toBe(created.templateType)
    expect(archived.createdAtUtc).toBe(created.createdAtUtc)
  })

  it('rejects archive for a different tenant (tenant isolation)', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.archiveTemplate({ tenantId: TENANT_B }, created.id),
    ).rejects.toThrow('template not found')
  })

  it('throws when template does not exist', async () => {
    await expect(
      repo.archiveTemplate({ tenantId: TENANT_A }, 'no-such-id'),
    ).rejects.toThrow('template not found')
  })
})

// ─── activateTemplate ─────────────────────────────────────────────────────────

describe('activateTemplate', () => {
  it('sets status to active when erp_item_code is present', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, erpItemCode: 'PT-BLOCK-10',
    })
    const activated = await repo.activateTemplate({ tenantId: TENANT_A }, created.id)

    expect(activated.status).toBe('active')
    expect(activated.erpItemCode).toBe('PT-BLOCK-10')
  })

  it('advances updated_at_utc on activation', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, erpItemCode: 'PT-BLOCK-10',
    })
    await new Promise(r => setTimeout(r, 5))
    const activated = await repo.activateTemplate({ tenantId: TENANT_A }, created.id)
    expect(activated.updatedAtUtc).not.toBe(created.updatedAtUtc)
  })

  it('is idempotent — activating an already-active template returns it unchanged', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, erpItemCode: 'PT-BLOCK-10',
    })
    const first = await repo.activateTemplate({ tenantId: TENANT_A }, created.id)
    const second = await repo.activateTemplate({ tenantId: TENANT_A }, created.id)
    expect(second.status).toBe('active')
    expect(second.updatedAtUtc).toBe(first.updatedAtUtc)
  })

  it('rejects activation when erp_item_code is missing', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, baseDraft)
    await expect(
      repo.activateTemplate({ tenantId: TENANT_A }, created.id),
    ).rejects.toThrow('erp_item_code must be set before activating')
  })

  it('rejects activation of an archived template', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, erpItemCode: 'PT-BLOCK-10',
    })
    await repo.archiveTemplate({ tenantId: TENANT_A }, created.id)
    await expect(
      repo.activateTemplate({ tenantId: TENANT_A }, created.id),
    ).rejects.toThrow('archived template cannot be activated')
  })

  it('rejects activation for a different tenant (tenant isolation)', async () => {
    const created = await repo.createTemplate({ tenantId: TENANT_A }, {
      ...baseDraft, erpItemCode: 'PT-BLOCK-10',
    })
    await expect(
      repo.activateTemplate({ tenantId: TENANT_B }, created.id),
    ).rejects.toThrow('template not found')
  })
})
