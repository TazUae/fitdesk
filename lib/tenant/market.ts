import 'server-only'

/**
 * Workspace operating-market resolver — the ONLY authority for whether a
 * workspace may see Lebanon-specific payment methods.
 *
 * Calls the tenant-scoped Control Plane contract `GET /api/erp/tenant/market`
 * (ADR-MKT-001) through the existing tenant JWT + Control Plane path — the
 * same signing helper and CONTROL_PLANE_URL used by lib/erpnext/client.ts.
 * No new credential, no direct Control Plane database access, no ERP
 * credential is introduced here.
 *
 * FAIL CLOSED, always. Every failure mode below resolves to the same safe
 * default — { market: null, verified: false } — never an assumption, never a
 * fallback to Cash-is-unavailable (Cash is handled entirely independently of
 * this resolver and is never gated by it):
 *   - no tenant context / not signed in
 *   - CONTROL_PLANE_URL / FITDESK_JWT_SECRET not configured
 *   - any non-2xx HTTP status (401, 403, 404, 409, 429, 5xx, or anything else)
 *   - invalid JSON
 *   - a response that doesn't match the exact 3-field contract
 *   - operatingMarket present but not a market FitDesk's catalog recognizes
 *   - verifiedAt present but not a valid ISO date string
 *   - request timeout / abort
 *   - network or DNS error
 *
 * FitDesk must NEVER infer a market from Tenant.country, browser locale,
 * language, timezone, IP, phone number, company address, currency, ERP site,
 * ERP Customer, user profile, or payment history — this resolver's response
 * from the authenticated Control Plane contract is the only legitimate input.
 */

import { getTenantContext } from '@/lib/tenant/context'
import { signTenantJwt } from '@/lib/erpnext/client'

/** The only markets FitDesk's payment catalog currently recognizes. */
const SUPPORTED_MARKETS = ['LB'] as const
type SupportedMarket = (typeof SUPPORTED_MARKETS)[number]

function isSupportedMarket(value: unknown): value is SupportedMarket {
  return typeof value === 'string' && (SUPPORTED_MARKETS as readonly string[]).includes(value)
}

export interface WorkspaceMarketResult {
  /** A supported market string, or null when unverified/unconfirmed/failed. */
  market: SupportedMarket | null
  /** True only when `market` is non-null and genuinely operator-verified. */
  verified: boolean
}

const FAIL_CLOSED: WorkspaceMarketResult = { market: null, verified: false }

// ─── Bounded, tenant-scoped, revocation-safe cache ──────────────────────────
// Short-lived and bounded: a revoked or newly-granted market takes effect
// within one TTL window, matching the same tradeoff already accepted for
// lib/payments/availability.ts's own cache. Keyed by tenantId only, so no
// authority can ever leak between tenants. A failed lookup is cached too
// (still the safe FAIL_CLOSED value) so a struggling Control Plane is not
// hammered on every request — this can never "turn an error into
// authorization" because the cached value is always the fail-closed shape.

const CACHE_TTL_MS = 60_000
const REQUEST_TIMEOUT_MS = 10_000

interface CacheEntry { value: WorkspaceMarketResult; at: number }
const cache = new Map<string, CacheEntry>()

/** Test-only: reset the module-level cache between cases. */
export function resetWorkspaceMarketCache(): void {
  cache.clear()
}

function isValidContractShape(body: unknown): body is {
  operatingMarket: unknown
  verified: unknown
  verifiedAt: unknown
} {
  if (typeof body !== 'object' || body === null) return false
  const keys = Object.keys(body as Record<string, unknown>).sort()
  return keys.length === 3
    && keys[0] === 'operatingMarket'
    && keys[1] === 'verified'
    && keys[2] === 'verifiedAt'
}

function isValidVerifiedAt(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  return !Number.isNaN(Date.parse(value))
}

/**
 * Resolve the authenticated workspace's operating market. Never throws —
 * every failure mode resolves to the fail-closed default.
 */
export async function resolveWorkspaceMarket(): Promise<WorkspaceMarketResult> {
  const tenantCtx = await getTenantContext()
  const tenantId = tenantCtx?.tenantId
  if (!tenantId) return FAIL_CLOSED

  const now = Date.now()
  const cached = cache.get(tenantId)
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value
  }

  const result = await fetchWorkspaceMarket(tenantId)
  cache.set(tenantId, { value: result, at: now })
  return result
}

async function fetchWorkspaceMarket(tenantId: string): Promise<WorkspaceMarketResult> {
  const cpUrl = process.env.CONTROL_PLANE_URL
  if (!cpUrl) return FAIL_CLOSED

  let token: string
  try {
    token = await signTenantJwt(tenantId)
  } catch {
    return FAIL_CLOSED
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${cpUrl}/api/erp/tenant/market`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    })

    // Any non-2xx (401/403/404/409/429/5xx/anything else) fails closed.
    if (!res.ok) return FAIL_CLOSED

    let body: unknown
    try {
      body = await res.json()
    } catch {
      return FAIL_CLOSED // invalid JSON
    }

    if (!isValidContractShape(body)) return FAIL_CLOSED // contract mismatch / missing fields

    const { operatingMarket, verified, verifiedAt } = body
    if (typeof verified !== 'boolean') return FAIL_CLOSED
    if (!isValidVerifiedAt(verifiedAt)) return FAIL_CLOSED

    // Only a response proving verified authority for a market FitDesk
    // actually recognizes may authorize anything. Everything else -- null,
    // verified:false, an unsupported market string -- is unconfirmed.
    if (verified === true && isSupportedMarket(operatingMarket) && verifiedAt !== null) {
      return { market: operatingMarket, verified: true }
    }
    return FAIL_CLOSED
  } catch {
    // Network error, DNS error, or the abort fired by the timeout above.
    return FAIL_CLOSED
  } finally {
    clearTimeout(timeoutId)
  }
}
