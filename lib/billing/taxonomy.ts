/**
 * Canonical billing, package, and ledger taxonomy.
 *
 * Single source of truth for domain vocabulary defined in
 * docs/architecture/FITDESK_BILLING_PACKAGE_ERP_DECISION.md (§5).
 *
 * Rules:
 * - `pay_per_session` and `package` are MVP-active.
 * - `subscription` is reserved/deferred — never active in MVP code paths.
 * - `unset` is a persistence/UI sentinel, NOT a canonical business billing mode.
 * - No external dependencies. Safe to import from tests and server actions alike.
 */

// ─── Billing mode ─────────────────────────────────────────────────────────────

export const ACTIVE_BILLING_MODES = ['pay_per_session', 'package'] as const
export const RESERVED_BILLING_MODES = ['subscription'] as const
export const BILLING_MODES = ['pay_per_session', 'package', 'subscription'] as const
export const BILLING_MODE_SENTINELS = ['unset'] as const

/** All values that may appear in client_index.billing_mode (business modes + persistence sentinel). */
export const CLIENT_BILLING_MODE_VALUES = [
  'unset',
  'pay_per_session',
  'package',
  'subscription',
] as const

export type ActiveBillingMode   = typeof ACTIVE_BILLING_MODES[number]
export type ReservedBillingMode = typeof RESERVED_BILLING_MODES[number]
export type BillingMode         = typeof BILLING_MODES[number]
export type BillingModeSentinel = typeof BILLING_MODE_SENTINELS[number]

/** Union of all values that may appear in the persistence layer (sentinel + business modes). */
export type ClientBillingModeValue = typeof CLIENT_BILLING_MODE_VALUES[number]

// ─── Package template type ────────────────────────────────────────────────────

export const TEMPLATE_TYPES = ['standard_block', 'complimentary', 'promotional'] as const

export type TemplateType = typeof TEMPLATE_TYPES[number]

// ─── Ledger event type ────────────────────────────────────────────────────────

export const LEDGER_EVENT_TYPES = [
  'purchase_activation',
  'bonus_granted',
  'refund_credit',
  'session_consumed',
  'late_cancel_penalty',
  'expiration_sweep',
] as const

export type LedgerEventType = typeof LEDGER_EVENT_TYPES[number]

// ─── Billing session status ───────────────────────────────────────────────────
// Named BillingSessionStatus to avoid collision with SessionStatus in types/index.ts
// (which uses 'missed'/'cancelled' without the early/late split).

export const BILLING_SESSION_STATUSES = [
  'draft',
  'scheduled',
  'completed',
  'cancelled_early',
  'cancelled_late',
] as const

export type BillingSessionStatus = typeof BILLING_SESSION_STATUSES[number]

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isBillingMode(value: unknown): value is BillingMode {
  return typeof value === 'string' && (BILLING_MODES as readonly string[]).includes(value)
}

export function isActiveBillingMode(value: unknown): value is ActiveBillingMode {
  return typeof value === 'string' && (ACTIVE_BILLING_MODES as readonly string[]).includes(value)
}

export function isReservedBillingMode(value: unknown): value is ReservedBillingMode {
  return typeof value === 'string' && (RESERVED_BILLING_MODES as readonly string[]).includes(value)
}

export function isClientBillingModeValue(value: unknown): value is ClientBillingModeValue {
  return typeof value === 'string' && (CLIENT_BILLING_MODE_VALUES as readonly string[]).includes(value)
}

export function isTemplateType(value: unknown): value is TemplateType {
  return typeof value === 'string' && (TEMPLATE_TYPES as readonly string[]).includes(value)
}

export function isLedgerEventType(value: unknown): value is LedgerEventType {
  return typeof value === 'string' && (LEDGER_EVENT_TYPES as readonly string[]).includes(value)
}

export function isBillingSessionStatus(value: unknown): value is BillingSessionStatus {
  return typeof value === 'string' && (BILLING_SESSION_STATUSES as readonly string[]).includes(value)
}

/** Exhaustiveness helper — call in the default branch of a switch on a union. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`)
}

// ─── Package template status ──────────────────────────────────────────────────

export const PACKAGE_TEMPLATE_STATUSES = ['draft', 'active', 'archived'] as const
export type PackageTemplateStatus = typeof PACKAGE_TEMPLATE_STATUSES[number]

export function isPackageTemplateStatus(value: unknown): value is PackageTemplateStatus {
  return typeof value === 'string' && (PACKAGE_TEMPLATE_STATUSES as readonly string[]).includes(value)
}
