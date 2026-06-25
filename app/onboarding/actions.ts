'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createTenant } from '@/lib/controlplane/client'
import { db } from '@/lib/db'
import { workspaceProvisioning } from '@/lib/db/schema'
import { abbreviateWorkspaceName } from '@/lib/workspace/abbr'
import { slugifyWorkspaceName } from '@/lib/workspace/slug'

// ISO 3166-1 alpha-2 codes accepted by the Control Plane.
// Must stay in sync with the MENA_TZ_MAP in lib/workspace/locale.ts.
const ALLOWED_COUNTRY_CODES = new Set(['AE', 'SA', 'LB', 'KW', 'QA'])

export type StartWorkspaceResult =
  | { success: true; jobId: string; status: string }
  | { success: false; error: string }

type StartWorkspaceInput = {
  workspaceName: string
  countryCode: string
}

/**
 * Explicitly starts workspace provisioning for the authenticated user.
 *
 * Payload sent to the Control Plane (real runtime contract):
 *   { slug, country: countryCode, companyName, companyAbbr }
 *
 * country is sent as an ISO 3166-1 alpha-2 code (e.g. 'LB') — required by the
 * Control Plane. The UI displays the full country name but it is never submitted.
 * Timezone and currency are NOT transmitted.
 * No locale fields are persisted in the local FitDesk schema.
 *
 * Is idempotent: resumes an existing active/completed row instead of duplicating.
 */
export async function startWorkspace(input: StartWorkspaceInput): Promise<StartWorkspaceResult> {
  const { workspaceName, countryCode } = input

  // 1. Require authenticated session
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Not authenticated. Please sign in again.' }
  }

  const userId = session.user.id

  // 2. Validate workspace name
  const trimmedName = workspaceName.trim()
  if (!trimmedName) {
    return { success: false, error: 'Workspace name is required.' }
  }

  // 3. Validate country code (ISO alpha-2; must be a known MENA detected default)
  const trimmedCode = countryCode.trim().toUpperCase()
  if (!ALLOWED_COUNTRY_CODES.has(trimmedCode)) {
    return { success: false, error: 'Invalid country. Please reload the page and try again.' }
  }

  // 4. Idempotency — resume if an active or completed row already exists for this user
  const existingRow = await db.query.workspaceProvisioning.findFirst({
    where: and(
      eq(workspaceProvisioning.userId, userId),
      inArray(workspaceProvisioning.status, ['queued', 'running', 'completed']),
    ),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  })

  if (existingRow) {
    return { success: true, jobId: existingRow.jobId, status: existingRow.status }
  }

  // 5. Generate slug + app-level collision check against WorkspaceProvisioning.slug
  let slug = slugifyWorkspaceName(trimmedName)

  for (let attempt = 2; attempt <= 6; attempt++) {
    const collision = await db.query.workspaceProvisioning.findFirst({
      where: eq(workspaceProvisioning.slug, slug),
    })
    // No collision, or the collision belongs to this user (e.g. a prior failed row) — slug is usable
    if (!collision || collision.userId === userId) break
    slug = `${slugifyWorkspaceName(trimmedName)}-${attempt}`
  }

  // 6. Derive company abbreviation
  const companyAbbr = abbreviateWorkspaceName(trimmedName)

  // 7. Create tenant — sends real Control Plane contract fields only.
  //    country is the ISO 3166-1 alpha-2 code. Timezone and currency are NOT included.
  let tenant: { tenantId: string; jobId: string; status: string }
  try {
    tenant = await createTenant({
      slug,
      country: trimmedCode,
      companyName: trimmedName,
      companyAbbr,
    })
  } catch (err) {
    console.error('[start-workspace] createTenant failed', { userId }, err)
    return { success: false, error: 'Failed to create workspace. Please try again.' }
  }

  // 8. Insert WorkspaceProvisioning row immediately after Control Plane responds.
  //    If this insert fails after a successful tenant creation, log the orphan data
  //    so it can be reconciled manually (per spec §6.5).
  const now = new Date().toISOString()
  try {
    await db.insert(workspaceProvisioning).values({
      id: crypto.randomUUID(),
      userId,
      slug,
      tenantId: tenant.tenantId,
      jobId: tenant.jobId,
      status: tenant.status,
      failureReason: null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
  } catch (err) {
    console.error('[start-workspace] db insert failed — orphan tenant data for reconciliation', {
      userId,
      tenantId: tenant.tenantId,
      jobId: tenant.jobId,
    }, err)
    return { success: false, error: 'Workspace was created but could not be saved. Please contact support.' }
  }

  return { success: true, jobId: tenant.jobId, status: tenant.status }
}
