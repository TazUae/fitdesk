'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createTenant } from '@/lib/controlplane/client'
import { db } from '@/lib/db'
import { workspaceProvisioning } from '@/lib/db/schema'
import { slugifyWorkspaceName } from '@/lib/workspace/slug'

export type StartWorkspaceResult =
  | { success: true; jobId: string; status: string }
  | { success: false; error: string }

/**
 * Explicitly starts workspace provisioning for the authenticated user.
 *
 * Sends ONLY { workspaceName, ownerEmail } to the Control Plane.
 * Does NOT persist or transmit country / timezone / currency.
 * Is idempotent: resumes an existing active/completed row instead of duplicating.
 */
export async function startWorkspace(workspaceName: string): Promise<StartWorkspaceResult> {
  // 1. Require authenticated session
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Not authenticated. Please sign in again.' }
  }

  const userId = session.user.id
  const ownerEmail = session.user.email

  // 2. Validate workspace name
  const trimmedName = workspaceName.trim()
  if (!trimmedName) {
    return { success: false, error: 'Workspace name is required.' }
  }

  // 3. Idempotency — resume if an active or completed row already exists for this user
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

  // 4. Generate slug + app-level collision check against WorkspaceProvisioning.slug
  let slug = slugifyWorkspaceName(trimmedName)

  for (let attempt = 2; attempt <= 6; attempt++) {
    const collision = await db.query.workspaceProvisioning.findFirst({
      where: eq(workspaceProvisioning.slug, slug),
    })
    // No collision, or the collision belongs to this user (e.g. a prior failed row) — slug is usable
    if (!collision || collision.userId === userId) break
    slug = `${slugifyWorkspaceName(trimmedName)}-${attempt}`
  }

  // 5. Create tenant via existing Control Plane client — sends ONLY workspaceName + ownerEmail
  let tenant: { tenantId: string; jobId: string; status: string }
  try {
    tenant = await createTenant({ workspaceName: trimmedName, ownerEmail })
  } catch (err) {
    console.error('[start-workspace] createTenant failed', { userId }, err)
    return { success: false, error: 'Failed to create workspace. Please try again.' }
  }

  // 6. Insert WorkspaceProvisioning row immediately after Control Plane responds
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
