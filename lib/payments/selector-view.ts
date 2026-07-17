/**
 * Pure view-derivation helpers for the payment-method transaction selectors
 * (RecordPaymentForm's pay page, InvoicesView's MarkPaidSheet).
 *
 * No React, no DOM, no server-only import — these are the exact decision
 * functions the selectors wire to props/render branches, extracted so they
 * are independently testable. This repo has no RTL/jsdom installed (see
 * components/clients/GoalAccordion/tests/GoalAccordion.test.tsx), so
 * behavior that would otherwise need a DOM-rendering test is instead proven
 * here at the pure-function boundary — the same pattern that file documents
 * and uses.
 */

import type { AvailabilityResult } from './availability'
import type { PaymentResult } from './errors'
import type { PaymentMethod } from './methods'

export interface PaymentMethodOption {
  value: PaymentMethod
  label: string
}

/**
 * From a getAvailablePaymentMethods() result, compute the options a
 * transaction selector may render. Only `available` methods ever appear —
 * never the full catalog, never a disabled/misconfigured method. A failed
 * result derives to an empty list, which callers render as the
 * configuration-unavailable state (never a Cash/any-method assumption).
 */
export function deriveSelectableMethodOptions(
  result: PaymentResult<AvailabilityResult>,
): PaymentMethodOption[] {
  if (!result.success) return []
  return result.data.available.map((m) => ({ value: m.id, label: m.label }))
}

/** Client-side availability-fetch phase for a selector that loads it async. */
export type SelectorAvailState =
  | { phase: 'loading' }
  | { phase: 'ready'; methods: PaymentMethodOption[] }

/** True once resolved and there is nothing the trainer can select. */
export function hasNoAvailableMethods(avail: SelectorAvailState): boolean {
  return avail.phase === 'ready' && avail.methods.length === 0
}

/**
 * True when the selector must block submission: still loading, or resolved
 * with zero available methods. Never allows a submit without a validated,
 * tenant-available method actually selected.
 */
export function isSubmitBlockedByAvailability(avail: SelectorAvailState): boolean {
  return avail.phase !== 'ready' || avail.methods.length === 0
}

/** The methods list to render for the current phase — [] while loading. */
export function methodsToRender(avail: SelectorAvailState): PaymentMethodOption[] {
  return avail.phase === 'ready' ? avail.methods : []
}
