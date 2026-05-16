/**
 * Manual payment methods — single source of truth.
 *
 * The trainer manually records which method a payment was received by.
 * The client only ever sends an internal `PaymentMethod` value; the server
 * maps it to the exact ERPNext "Mode of Payment" name. ERPNext mode names are
 * never accepted from the client.
 *
 * Adding a method: add one row to PAYMENT_METHODS — nothing else changes.
 */

export type PaymentMethod = 'cash' | 'whish_money' | 'omt'

interface PaymentMethodDef {
  /** Internal value sent client -> server. Never an ERPNext name. */
  value: PaymentMethod
  /** Trainer-facing label. */
  label: string
  /** Exact ERPNext "Mode of Payment" docname this maps to. */
  erpNextModeOfPayment: string
  /** Whether the method is offered in the UI. */
  enabled: boolean
}

export const PAYMENT_METHODS: readonly PaymentMethodDef[] = [
  { value: 'cash',        label: 'Cash',        erpNextModeOfPayment: 'Cash',        enabled: true },
  { value: 'whish_money', label: 'Whish Money', erpNextModeOfPayment: 'Whish Money', enabled: true },
  // OMT stays defined but disabled until ERPNext provisioning adds an "OMT"
  // Mode of Payment. Without it ERPNext rejects the Payment Entry, so the
  // method must not be offered or accepted. Re-enable by flipping `enabled`.
  { value: 'omt',         label: 'OMT',         erpNextModeOfPayment: 'OMT',         enabled: false },
]

/** Type guard: true for any known internal payment method value. */
export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && PAYMENT_METHODS.some(m => m.value === value)
}

/**
 * Type guard: true only for a known internal payment method that is
 * currently enabled. The server action uses this so a disabled method
 * (e.g. OMT before its ERPNext provisioning lands) can never be recorded,
 * even if a client sends its value directly.
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

/** Payment methods offered in the UI. */
export function enabledPaymentMethods(): readonly PaymentMethodDef[] {
  return PAYMENT_METHODS.filter(m => m.enabled)
}
