/**
 * Payment domain error contract — Slice 1.
 *
 * Mirrors the repository precedent in actions/schedulingActions.ts: typed error
 * CLASSES thrown by the lower layers (ERP client, availability preflight) + a
 * discriminated result + a `mapPaymentError` that converts the classes to
 * structured codes. This is what replaces the incident's behaviour where a
 * missing Mode of Payment surfaced as a generic HTTP 503 "deposit account
 * missing" (plan §2 Defect B, §4.6).
 *
 * Rules (plan §4.6):
 *   - NEVER turn method-not-found into account-missing.
 *   - NO HTTP 503 for business-configuration errors — those are typed codes.
 *   - Genuine ERP connectivity failures still flow through ERPNextError +
 *     isErpUnavailableError and map to ERP_UNAVAILABLE.
 *
 * This module is pure (no ERP / network / server-only imports) so it is safe to
 * import from the ERP client, server actions, and unit tests alike.
 */

import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'

// ─── Codes & result ────────────────────────────────────────────────────────────

export type PaymentErrorCode =
  | 'PAYMENT_METHOD_NOT_FOUND'
  | 'PAYMENT_METHOD_DISABLED'
  | 'PAYMENT_ACCOUNT_MISSING'
  | 'PAYMENT_CURRENCY_MISMATCH'
  | 'PAYMENT_REFERENCE_REQUIRED'
  | 'PAYMENT_PROVIDER_REQUIRED'
  | 'PAYMENT_METHOD_NOT_ENABLED_FOR_WORKSPACE'
  | 'PAYMENT_FEATURE_DISABLED'
  | 'PAYMENT_CONFIGURATION_UNAVAILABLE'
  | 'ERP_UNAVAILABLE'

/**
 * Discriminated result for the pure availability surface
 * (getAvailablePaymentMethods). The plan (§4.6) specifies exactly this shape.
 */
export type PaymentResult<T> =
  | { success: true;  data: T }
  | { success: false; code: PaymentErrorCode; message: string }

/**
 * Result envelope for the payment MUTATION actions (recordPayment /
 * collectPayment). It keeps the stable `{ success, data } | { success, error }`
 * shape those actions already return — so existing callers/tests reading
 * `.error` are unaffected — and ADDS an optional machine `code` for the
 * business-configuration failures the plan cares about. The human `error`
 * string is always a safe, non-alarming message (never raw ERP 503 text).
 *
 * `code` is present only for payment-configuration failures (mapped from the
 * typed errors below); plain request-validation failures (bad amount, invoice
 * not open, …) carry just `error`, exactly as before.
 */
export type PaymentActionResult<T> =
  | { success: true;  data: T }
  | { success: false; error: string; code?: PaymentErrorCode }

// ─── Typed error classes (thrown by ERP client / availability preflight) ────────

/** The exact Mode of Payment docname does not exist in the tenant's ERP site (404). */
export class PaymentMethodNotFoundError extends Error {
  constructor(public readonly method: string) {
    super(`Payment method not found in ERP: "${method}"`)
    this.name = 'PaymentMethodNotFoundError'
  }
}

/** The Mode of Payment exists but is disabled (enabled = 0). */
export class PaymentMethodDisabledError extends Error {
  constructor(public readonly method: string) {
    super(`Payment method is disabled in ERP: "${method}"`)
    this.name = 'PaymentMethodDisabledError'
  }
}

/**
 * The Mode of Payment exists (and is enabled) but has no account mapped for the
 * invoice's company. This is the ONLY condition that may become
 * PAYMENT_ACCOUNT_MISSING — never a plain method-not-found (that was the bug).
 */
export class PaymentAccountMissingError extends Error {
  constructor(public readonly method: string, public readonly company: string) {
    super(`No deposit account mapped for "${method}" in company "${company}"`)
    this.name = 'PaymentAccountMissingError'
  }
}

/** The invoice currency is incompatible with the method's settlement asset. */
export class PaymentCurrencyMismatchError extends Error {
  constructor(public readonly method: string, public readonly currency: string) {
    super(`Payment method "${method}" cannot settle currency "${currency}"`)
    this.name = 'PaymentCurrencyMismatchError'
  }
}

/**
 * No fresh availability result AND no in-window last-known-good cache. The UI
 * shows a recoverable "payments temporarily unavailable" state — NEVER a Cash
 * assumption (plan §4.4).
 */
export class PaymentConfigurationUnavailableError extends Error {
  constructor(message = 'Payment configuration is temporarily unavailable') {
    super(message)
    this.name = 'PaymentConfigurationUnavailableError'
  }
}

// ─── Safe user-facing messages (no secrets, non-alarming) ───────────────────────

const SAFE_MESSAGE: Record<PaymentErrorCode, string> = {
  PAYMENT_METHOD_NOT_FOUND:
    "That payment method isn't set up in your workspace yet.",
  PAYMENT_METHOD_DISABLED:
    'That payment method is currently turned off in your workspace.',
  PAYMENT_ACCOUNT_MISSING:
    'That payment method still needs a deposit account before it can be used. Set it up in Settings.',
  PAYMENT_CURRENCY_MISMATCH:
    "That payment method can't be used for this invoice's currency.",
  PAYMENT_REFERENCE_REQUIRED:
    'Add the transaction reference for this payment method.',
  PAYMENT_PROVIDER_REQUIRED:
    'This payment method has no link provider configured.',
  PAYMENT_METHOD_NOT_ENABLED_FOR_WORKSPACE:
    "That payment method isn't enabled for your workspace.",
  PAYMENT_FEATURE_DISABLED:
    'That payment method is not available.',
  PAYMENT_CONFIGURATION_UNAVAILABLE:
    "We couldn't load your payment methods just now. Please try again in a moment.",
  ERP_UNAVAILABLE:
    'Payments are temporarily unavailable. Please try again in a moment.',
}

/** Safe, non-alarming user-facing message for a code. */
export function paymentErrorMessage(code: PaymentErrorCode): string {
  return SAFE_MESSAGE[code]
}

// ─── Error mapper ───────────────────────────────────────────────────────────────

/**
 * Map a thrown error to a structured payment failure. Mirrors
 * schedulingActions.mapError. Order matters: the specific typed classes are
 * checked before the generic ERP-connectivity marker so a business-config
 * error is never misclassified as connectivity.
 *
 * Returns the FAILURE branch only — callers wrap it into whichever envelope
 * they expose (PaymentResult or PaymentActionResult).
 */
export function mapPaymentError(err: unknown): { code: PaymentErrorCode; message: string } {
  if (err instanceof PaymentMethodNotFoundError) {
    return { code: 'PAYMENT_METHOD_NOT_FOUND', message: paymentErrorMessage('PAYMENT_METHOD_NOT_FOUND') }
  }
  if (err instanceof PaymentMethodDisabledError) {
    return { code: 'PAYMENT_METHOD_DISABLED', message: paymentErrorMessage('PAYMENT_METHOD_DISABLED') }
  }
  if (err instanceof PaymentAccountMissingError) {
    return { code: 'PAYMENT_ACCOUNT_MISSING', message: paymentErrorMessage('PAYMENT_ACCOUNT_MISSING') }
  }
  if (err instanceof PaymentCurrencyMismatchError) {
    return { code: 'PAYMENT_CURRENCY_MISMATCH', message: paymentErrorMessage('PAYMENT_CURRENCY_MISMATCH') }
  }
  if (err instanceof PaymentConfigurationUnavailableError) {
    return { code: 'PAYMENT_CONFIGURATION_UNAVAILABLE', message: paymentErrorMessage('PAYMENT_CONFIGURATION_UNAVAILABLE') }
  }
  // Genuine ERP connectivity / proxy / tenant-context failure (ERPNextError with
  // the known markers) — surfaced, not swallowed, as recoverable.
  if (isErpUnavailableError(err)) {
    return { code: 'ERP_UNAVAILABLE', message: paymentErrorMessage('ERP_UNAVAILABLE') }
  }
  // Unknown failure: fail closed to the recoverable ERP-unavailable state
  // rather than leaking a raw internal message to the trainer.
  return { code: 'ERP_UNAVAILABLE', message: paymentErrorMessage('ERP_UNAVAILABLE') }
}
