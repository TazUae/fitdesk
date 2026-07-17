/**
 * Manual payment methods — single source of truth.
 *
 * The trainer manually records which method a payment was received by.
 * The client only ever sends an internal `PaymentMethod` value; the server
 * maps it to the exact ERPNext "Mode of Payment" name. ERPNext mode names are
 * never accepted from the client.
 *
 * Adding a method: add one row to PAYMENT_METHODS — nothing else changes.
 *
 * `enabled` here is a product-level kill switch, orthogonal to whether a
 * given tenant's ERP site actually has the method configured — that tenant
 * truth is resolved live by lib/payments/availability.ts, never assumed from
 * this static flag. A method must be `enabled: true` here to even become a
 * candidate for the per-tenant ERP probe.
 *
 * USDT and "Other Mobile Wallet" are intentionally NOT rows in this catalog —
 * see docs/execution/TENANT_AWARE_PAYMENT_SLICE_2_CHECKPOINT.md for why and
 * for the configuration contract either would need before being added.
 *
 * `market` records product intent — 'global' (cash) vs. 'LB' (Lebanon-only:
 * every mobile wallet + the Fresh USD bank transfer) — but is NOT yet a live
 * enforcement mechanism. There is currently no reachable, authoritative
 * workspace-country signal anywhere in FitDesk's approved request path (no
 * field on TenantContext, no field on the tenant-scoped Control Plane ERP
 * proxy response, no field on ERPTrainerSettings — full audit in the
 * checkpoint doc). Control Plane's Tenant.country column exists but requires
 * a Control Plane contract change to expose it, which is out of scope here.
 * Until that lands, every `market: 'LB'` row is held at `enabled: false` —
 * the exact same product-level kill switch OMT used before its docname was
 * corrected — so NO workspace (Lebanon or otherwise) is offered it, rather
 * than wrongly offering it to every workspace. See
 * docs/execution/TENANT_AWARE_PAYMENT_SLICE_2_CHECKPOINT.md for the full
 * writeup and the exact precondition for re-enabling each row.
 */

import type { PaymentRail } from './rails'

export type PaymentMethod =
  | 'cash'
  | 'whish_money'
  | 'omt'
  | 'mymonty'
  | 'suyool'
  | 'purpl'
  | 'bank_transfer_fresh_usd'

interface PaymentMethodDef {
  /** Internal value sent client -> server. Never an ERPNext name. */
  value: PaymentMethod
  /** Trainer-facing label. */
  label: string
  /** Exact ERPNext "Mode of Payment" docname this maps to. */
  erpNextModeOfPayment: string
  /** Rail family — display/grouping metadata, never identity (see ./rails). */
  rail: PaymentRail
  /**
   * Product intent only (see file header) — 'global' methods are for every
   * workspace; 'LB' methods are Lebanon-only and are currently HELD via
   * `enabled: false` because no authoritative country gate exists yet.
   */
  market: 'global' | 'LB'
  /** Whether the method is offered in the UI. */
  enabled: boolean
}

export const PAYMENT_METHODS: readonly PaymentMethodDef[] = [
  { value: 'cash', label: 'Cash', erpNextModeOfPayment: 'Cash', rail: 'cash', market: 'global', enabled: true },
  // Lebanon-only (market: 'LB') — held at enabled:false pending an
  // authoritative workspace-country gate (see file header). Docname
  // corrected from the retired 'OMT' to 'OMT Pay' for `omt` specifically;
  // the old name was never provisioned in any tenant's ERP.
  { value: 'whish_money', label: 'Whish Money', erpNextModeOfPayment: 'Whish Money', rail: 'mobile_wallet', market: 'LB', enabled: false },
  { value: 'omt',         label: 'OMT Pay',     erpNextModeOfPayment: 'OMT Pay',     rail: 'mobile_wallet', market: 'LB', enabled: false },
  { value: 'mymonty',     label: 'MyMonty',     erpNextModeOfPayment: 'MyMonty',     rail: 'mobile_wallet', market: 'LB', enabled: false },
  { value: 'suyool',      label: 'Suyool',      erpNextModeOfPayment: 'Suyool',      rail: 'mobile_wallet', market: 'LB', enabled: false },
  { value: 'purpl',       label: 'Purpl',       erpNextModeOfPayment: 'Purpl',       rail: 'mobile_wallet', market: 'LB', enabled: false },
  {
    value:                'bank_transfer_fresh_usd',
    label:                'Bank Transfer — Fresh USD',
    // Hyphen, not the label's em dash — this is the literal ERPNext docname
    // join key (plan §4.2's mismatch warning applies here too: verify against
    // the real tenant site before relying on this name).
    erpNextModeOfPayment: 'Bank Transfer - Fresh USD',
    rail:                 'bank_transfer',
    market:               'LB',
    enabled:              false,
  },
]

/** Type guard: true for any known internal payment method value. */
export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && PAYMENT_METHODS.some(m => m.value === value)
}

/**
 * Type guard: true only for a known internal payment method that is
 * currently enabled. The server action uses this so a disabled method
 * (currently: every Lebanon-only method, held pending an authoritative
 * workspace-country gate — see file header) can never be recorded, even if
 * a client sends its value directly.
 */
export function isEnabledPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string'
    && PAYMENT_METHODS.some(m => m.value === value && m.enabled)
}

/** Map an internal payment method to its ERPNext "Mode of Payment" name. */
export function paymentMethodToErpMode(method: PaymentMethod): string {
  const def = PAYMENT_METHODS.find(m => m.value === method)
  if (!def) {
    // Unreachable for a valid PaymentMethod; guards against a future enum drift.
    throw new Error(`Unknown payment method: ${method}`)
  }
  return def.erpNextModeOfPayment
}

/** Trainer-facing label for an internal payment method. */
export function paymentMethodLabel(method: PaymentMethod): string {
  const def = PAYMENT_METHODS.find(m => m.value === method)
  if (!def) throw new Error(`Unknown payment method: ${method}`)
  return def.label
}

/**
 * The three authoritative identity fields recordPayment logs on a
 * 'payment_recorded' audit event: canonical id, exact label, exact ERP
 * docname. Extracted here — rather than inlined in actions/invoices.ts, a
 * 'use server' file that may only export async functions — so this
 * construction is independently unit-testable for every catalog method,
 * including the six currently held for the Lebanon market boundary, which
 * cannot reach recordPayment's success path today to be tested end-to-end.
 * Never derive any of these three from `PaymentProvider` — that coarse,
 * link-routing-only bucket is what previously produced a contradictory
 * audit record (e.g. `{ provider: 'cash', method: 'mymonty' }`).
 */
export function paymentRecordedAuditIdentity(method: PaymentMethod): {
  method:           PaymentMethod
  methodLabel:      string
  erpModeOfPayment: string
} {
  return {
    method,
    methodLabel:      paymentMethodLabel(method),
    erpModeOfPayment: paymentMethodToErpMode(method),
  }
}

/**
 * Reverse direction of paymentMethodToErpMode: resolve an exact ERPNext Mode
 * of Payment docname back to its canonical internal id + label. This is the
 * ONLY correct way to recover method identity from an ERP-sourced string
 * (e.g. a Payment Entry's mode_of_payment) — never re-derive it with
 * substring matching (that produced the incident where a mislabeled method
 * silently read back as a different one).
 *
 * Returns null when the docname does not match any catalog entry — an
 * unrecognized or legacy Mode of Payment (e.g. a tenant-custom wallet, or a
 * retired docname from before a correction). Callers MUST treat null as an
 * explicit unknown state and preserve the raw ERP text for display; they
 * must never default it to `cash` or any other specific method.
 */
export function erpModeToPaymentMethod(
  mode: string,
): { id: PaymentMethod; label: string } | null {
  const def = PAYMENT_METHODS.find(m => m.erpNextModeOfPayment === mode)
  return def ? { id: def.value, label: def.label } : null
}

/** Payment methods offered in the UI. */
export function enabledPaymentMethods(): readonly PaymentMethodDef[] {
  return PAYMENT_METHODS.filter(m => m.enabled)
}
