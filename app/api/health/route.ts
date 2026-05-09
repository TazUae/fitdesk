/**
 * Health check endpoint.
 *
 * Used by:
 *   - Docker HEALTHCHECK (Dockerfile + docker-compose.yml)
 *   - Reverse proxy uptime checks
 *   - Dokploy / deployment platform monitors
 *
 * Default GET is cheap and unauthenticated: returns 200 if the Node
 * process is up. Does NOT check external services on the default path.
 *
 * GET /api/health?deep=1 (Phase 5.0.3a):
 *   Aggregates a deeper view including tenant context presence and
 *   Control Plane reachability. Auth-required because it surfaces
 *   per-user provisioning state.
 *
 * Phase 5.0.3a fix: this route used to be statically cached by Next.js,
 * so process.env was read at build time — `evolution: false` even when
 * the env was set at runtime. force-dynamic + no-store fixes it.
 */

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant/context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface DeepHealth {
  tenant: {
    contextResolved: boolean
    provisioningStatus: string | null
    failureReason: string | null
  }
  controlPlane: {
    configured: boolean
    reachable: boolean | null
    error: string | null
  }
}

async function pingControlPlane(): Promise<{ reachable: boolean | null; error: string | null }> {
  const cpUrl = process.env.CONTROL_PLANE_URL
  if (!cpUrl) return { reachable: null, error: 'CONTROL_PLANE_URL not set' }
  try {
    const res = await fetch(`${cpUrl.replace(/\/+$/, '')}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    })
    return { reachable: res.ok, error: res.ok ? null : `HTTP ${res.status}` }
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message.slice(0, 120) : 'unknown' }
  }
}

async function deepHealth(): Promise<DeepHealth> {
  const tenant = await getTenantContext()
  const cp = await pingControlPlane()
  return {
    tenant: {
      contextResolved:    Boolean(tenant?.tenantId),
      provisioningStatus: tenant?.provisioningStatus ?? null,
      failureReason:      null, // populated below if available
    },
    controlPlane: {
      configured: Boolean(process.env.CONTROL_PLANE_URL),
      reachable:  cp.reachable,
      error:      cp.error,
    },
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deep = url.searchParams.get('deep') === '1'

  const base = {
    status:    'ok' as const,
    service:   'fitdesk',
    version:   process.env.APP_VERSION ?? 'dev',
    env:       process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
    configured: {
      // Now reads env at request time (not build time).
      controlPlane: !!(process.env.CONTROL_PLANE_URL && process.env.CONTROL_PLANE_API_KEY),
      evolution:    !!(process.env.EVOLUTION_API_URL  && process.env.EVOLUTION_API_KEY),
      whish:        !!(process.env.WHISH_API_URL      && process.env.WHISH_API_KEY),
      claude:       !!process.env.ANTHROPIC_API_KEY,
      pilotMode:    process.env.PILOT_MODE === 'true' || process.env.PILOT_MODE === '1',
    },
  }

  if (!deep) {
    return Response.json(base, { status: 200 })
  }

  // Deep mode requires auth — it exposes per-user provisioning state.
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const deepData = await deepHealth()
  return Response.json({ ...base, deep: deepData }, { status: 200 })
}
