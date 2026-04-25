import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createTenant } from '@/lib/controlplane/client'
import { db } from '@/lib/db'
import { workspaceProvisioning } from '@/lib/db/schema'
import type { CreateTenantResponse } from '@/types/controlplane'

// ─── Derivation helpers ───────────────────────────────────────────────────────

/** "Alex Johnson" → "alex-johnson-a3f2" (3-63 chars, [a-z0-9-]) */
function deriveSlug(name: string, email: string): string {
  const base = (name || email.split('@')[0] || 'trainer')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base || 'trainer'}-${suffix}`
}

/** "Alex Johnson" → "AJ"   "Yasser Zaidan" → "YZ"  (max 10) */
function deriveAbbr(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
  return (initials || name.slice(0, 4).toUpperCase()).slice(0, 10)
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: userId, name, email } = session.user

  // Idempotency: bail out if there is already an active or completed job
  const existing = await db.query.workspaceProvisioning.findFirst({
    where: and(
      eq(workspaceProvisioning.userId, userId),
      inArray(workspaceProvisioning.status, ['queued', 'running', 'completed']),
    ),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  })

  if (existing) {
    return NextResponse.json({ jobId: existing.jobId, status: existing.status })
  }

  // Read onboarding form data from request body
  let bodyBusinessName: string | undefined
  let bodyCountry: string | undefined
  let bodyCurrency: string | undefined
  try {
    const body = await req.json() as { businessName?: string; country?: string; currency?: string }
    bodyBusinessName = body.businessName?.trim() || undefined
    bodyCountry      = body.country?.trim().toUpperCase().slice(0, 2) || undefined
    bodyCurrency     = body.currency?.trim().toUpperCase().slice(0, 3) || undefined
  } catch { /* no body or not JSON — use fallbacks */ }

  const displayName  = bodyBusinessName || name?.trim() || email.split('@')[0] || 'Trainer'
  const slug         = deriveSlug(displayName, email)
  const companyName  = displayName
  const companyAbbr  = deriveAbbr(displayName)
  const country      = bodyCountry ?? 'LB'
  const currency     = bodyCurrency  // undefined → control plane derives from country

  let tenant: CreateTenantResponse
  try {
    tenant = await createTenant({
      slug,
      country,
      companyName,
      companyAbbr,
      ownerEmail: email,
      ...(currency ? { currency } : {}),
    }) as CreateTenantResponse
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to contact control plane'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const now = new Date().toISOString()
  await db.insert(workspaceProvisioning).values({
    id:            crypto.randomUUID(),
    userId,
    slug,
    tenantId:      tenant.tenantId,
    jobId:         tenant.jobId,
    status:        tenant.status,
    createdAt:     now,
    updatedAt:     now,
    failureReason: null,
    lastSyncedAt:  now,
  })

  return NextResponse.json({ jobId: tenant.jobId, status: tenant.status })
}
