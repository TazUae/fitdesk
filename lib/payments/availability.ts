import 'server-only'

/**
 * Tenant-aware payment availability — bounded ERP preflight (plan §4.3/§4.4).
 *
 * A payment method is SELECTABLE only when its ERPNext Mode of Payment exists,
 * is enabled, has a deposit account mapped for the invoice's company, and its
 * settlement is compatible with the invoice currency. The transaction UI shows
 * only `available` methods; everything else carries a structured reason.
 *
 * Corrected fail behaviour (plan §4.4): a failed probe NEVER assumes Cash — or
 * any method — exists. Design supports serving a validated last-known-good
 * cache within a bounded stale window, WITH observability — but for Slice 1
 * pilot safety that stale-serve path is DISABLED BY DEFAULT (see
 * STALE_SERVE_ENABLED below). A failed fresh probe always yields a
 * recoverable "configuration unavailable" state with NO selectable method,
 * until stale-serving is separately reviewed and approved.
 *
 * Server-only: this reaches ERPNext through the CP proxy. UI selectors must
 * call the `getAvailablePaymentMethods` server action, never import this file.
 *
 * Slice 1 keeps the three existing method ids (cash / whish_money / omt) and
 * derives its small catalog from lib/payments/methods.ts. The full rail-grouped
 * product catalog is Slice 2 (plan §4.2).
 */

import {
  ERPNextError,
  getModeOfPaymentDoc,
  listEnabledModesOfPayment,
} from '@/lib/erpnext/client'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/payments/methods'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'
import { PaymentConfigurationUnavailableError, type PaymentErrorCode } from './errors'
import type { SettlementAsset } from './rails'

// ─── Public shape ───────────────────────────────────────────────────────────────

export interface PaymentMethodAvailability {
  id:     PaymentMethod
  label:  string
  /** 'available', or the reason it is not (a PaymentErrorCode subset). */
  status: 'available' | Exclude<PaymentErrorCode, 'PAYMENT_CONFIGURATION_UNAVAILABLE' | 'PAYMENT_REFERENCE_REQUIRED' | 'PAYMENT_PROVIDER_REQUIRED' | 'PAYMENT_METHOD_NOT_ENABLED_FOR_WORKSPACE' | 'PAYMENT_FEATURE_DISABLED'>
  /** Company-scoped deposit account — present only when status === 'available'. */
  depositAccount?: string
}

export interface AvailabilityResult {
  /** Every Slice-1 candidate with its per-method status. */
  methods:   PaymentMethodAvailability[]
  /** Convenience projection: only status === 'available'. */
  available: PaymentMethodAvailability[]
  /** True when served from a validated last-known-good cache after a failed probe. */
  stale:     boolean
}

export interface ResolveAvailabilityParams {
  company:  string
  currency: string
  tenantId: string
}

// ─── Tunables (plan §4.4 / §9 open-decision #1) ──────────────────────────────────
// TTL: how long a FRESH, just-validated result is reused before re-probing.
// This is ordinary caching of a known-good result — it never crosses a probe
// failure boundary, so it stays enabled unconditionally.

const TTL_MS = 60_000 // 60s

// STALE_WINDOW / STALE_SERVE_ENABLED: how long a validated last-known-good
// MAY be served after a FAILED fresh probe, with observability. This is the
// mechanism plan §4.4 describes — but for Slice 1 pilot safety it is DISABLED
// BY DEFAULT. A failed fresh probe currently always falls through to the
// recoverable "no method assumed" path (PAYMENT_CONFIGURATION_UNAVAILABLE /
// ERP_UNAVAILABLE), never serving a payment-method list computed from a stale
// probe. The mechanism is kept (not deleted) so it can be re-enabled after a
// separate, explicit product/security review — flip STALE_SERVE_ENABLED only
// then, not as a casual toggle.
const STALE_SERVE_ENABLED = false
const STALE_WINDOW_MS     = 5 * 60_000 // 5 min — inert while the flag above is false

/** Bumped in Slice 2 when workspace enablement / feature flags change (plan §4.7). */
const CONFIG_VERSION  = 'v1'

// ─── Slice-1 catalog (derived from the single source of truth) ───────────────────

interface Slice1CatalogEntry {
  id:               PaymentMethod
  label:            string
  erpModeOfPayment: string
  settlementAsset:  SettlementAsset
  /** Static product-support gate; a product-off method is never even probed. */
  productSupported: boolean
}

// Slice 1 methods all settle in fresh USD. Settlement asset is metadata used
// only for currency compatibility — it is NOT a method identity (plan §4.1).
const SETTLEMENT_ASSET: Record<PaymentMethod, SettlementAsset> = {
  cash:        'USD',
  whish_money: 'USD',
  omt:         'USD',
}

const SLICE1_CATALOG: Slice1CatalogEntry[] = PAYMENT_METHODS.map((m) => ({
  id:               m.value,
  label:            m.label,
  erpModeOfPayment: m.erpNextModeOfPayment,
  settlementAsset:  SETTLEMENT_ASSET[m.value],
  productSupported: m.enabled,
}))

function currencyCompatible(asset: SettlementAsset, invoiceCurrency: string): boolean {
  const cur = (invoiceCurrency || 'USD').toUpperCase()
  switch (asset) {
    case 'USD':  return cur === 'USD'
    case 'USDT': return cur === 'USD' || cur === 'USDT'
    case 'LBP':  return cur === 'LBP'
    default:     return false
  }
}

// ─── Best-effort cache (per server instance) ────────────────────────────────────

interface CacheEntry { value: AvailabilityResult; at: number }
const cache = new Map<string, CacheEntry>()

function cacheKey(p: ResolveAvailabilityParams): string {
  return `${p.tenantId}|${p.company}|${p.currency}|${CONFIG_VERSION}`
}

/** Test-only: reset the module-level cache between cases. */
export function resetAvailabilityCache(): void {
  cache.clear()
}

// ─── Core probe ─────────────────────────────────────────────────────────────────

async function probe({ company, currency }: ResolveAvailabilityParams): Promise<AvailabilityResult> {
  // Step 1: one list request — what this tenant can actually accept.
  const enabled      = await listEnabledModesOfPayment()
  const enabledNames = new Set(enabled.map((m) => m.name))

  // Step 2: intersect with the supported catalog; drop product-off methods
  // first so we never probe them (plan §4.3 step 2).
  const candidates = SLICE1_CATALOG.filter((c) => c.productSupported)

  // Step 3-5: bounded parallel per-candidate validation.
  const methods = await Promise.all(
    candidates.map(async (c): Promise<PaymentMethodAvailability> => {
      // Not in the tenant's enabled set → not found, no extra read.
      if (!enabledNames.has(c.erpModeOfPayment)) {
        return { id: c.id, label: c.label, status: 'PAYMENT_METHOD_NOT_FOUND' }
      }
      // Currency / settlement compatibility (cheap, no read).
      if (!currencyCompatible(c.settlementAsset, currency)) {
        return { id: c.id, label: c.label, status: 'PAYMENT_CURRENCY_MISMATCH' }
      }
      // Read the MoP doc to validate a company-mapped deposit account.
      let doc
      try {
        doc = await getModeOfPaymentDoc(c.erpModeOfPayment)
      } catch (err) {
        if (err instanceof ERPNextError && err.status === 404) {
          return { id: c.id, label: c.label, status: 'PAYMENT_METHOD_NOT_FOUND' }
        }
        // Non-404 read failure for THIS candidate only — mark it unavailable
        // rather than nuking the whole probe, so a validated method (e.g. Cash)
        // can still be offered. A total failure surfaces from Step 1 instead.
        return { id: c.id, label: c.label, status: 'ERP_UNAVAILABLE' }
      }
      if (doc.enabled === 0) {
        return { id: c.id, label: c.label, status: 'PAYMENT_METHOD_DISABLED' }
      }
      const account = (doc.accounts ?? []).find((a) => a.company === company)?.default_account
      if (!account) {
        return { id: c.id, label: c.label, status: 'PAYMENT_ACCOUNT_MISSING' }
      }
      return { id: c.id, label: c.label, status: 'available', depositAccount: account }
    }),
  )

  const available = methods.filter((m) => m.status === 'available')
  return { methods, available, stale: false }
}

// ─── Public entry point ─────────────────────────────────────────────────────────

/**
 * Resolve the tenant's available payment methods for a given company + currency.
 *
 * - Fresh success → cached and returned (stale: false).
 * - Fresh failure → Slice 1 pilot default: ALWAYS falls through to the
 *   recoverable "no method assumed" path below (STALE_SERVE_ENABLED is
 *   false), regardless of whether an in-window cache exists.
 * - (Mechanism, currently inert) Fresh failure + STALE_SERVE_ENABLED +
 *   validated cache within the stale window → served with stale: true + a
 *   structured stale-serve log.
 * - Otherwise → throws (connectivity errors propagate as ERPNextError →
 *   ERP_UNAVAILABLE; anything else becomes PaymentConfigurationUnavailableError).
 *   NEVER assumes any method exists.
 */
export async function resolveAvailablePaymentMethods(
  params: ResolveAvailabilityParams,
): Promise<AvailabilityResult> {
  const key    = cacheKey(params)
  const now    = Date.now()
  const cached = cache.get(key)

  // Fresh cache hit — serve without probing. Not stale-serving: this is a
  // just-validated result that never crossed a probe failure boundary.
  if (cached && now - cached.at < TTL_MS) {
    return cached.value
  }

  try {
    const fresh = await probe(params)
    cache.set(key, { value: fresh, at: now })
    return fresh
  } catch (err) {
    // Probe failed. Slice 1 pilot safety: stale last-known-good serving is
    // OFF by default — never serve a payment-method list computed before a
    // failed probe. Never assume Cash, or any method, exists (plan §4.4).
    if (STALE_SERVE_ENABLED && cached && now - cached.at < STALE_WINDOW_MS) {
      console.warn('[payment-availability] stale-serve', JSON.stringify({
        tenantId: params.tenantId,
        company:  params.company,
        currency: params.currency,
        ageMs:    now - cached.at,
      }))
      return { ...cached.value, stale: true }
    }
    // No fresh result (and, by default, no stale fallback) → recoverable, no
    // method assumed. Preserve the connectivity distinction so the action can
    // emit ERP_UNAVAILABLE rather than a generic configuration error.
    if (isErpUnavailableError(err)) throw err
    if (err instanceof PaymentConfigurationUnavailableError) throw err
    throw new PaymentConfigurationUnavailableError()
  }
}
