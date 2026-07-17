/**
 * Pure view-derivation tests for the payment-method transaction selectors.
 *
 * This repo has no RTL/jsdom installed (see
 * components/clients/GoalAccordion/tests/GoalAccordion.test.tsx, which
 * documents and uses the same approach): component behavior that maps to
 * state transitions / render decisions is tested at the pure-function
 * boundary the component wires to props/branches, rather than via DOM
 * rendering. These tests are that boundary for RecordPaymentForm's pay page
 * and InvoicesView's MarkPaidSheet — proving directly the four UI
 * requirements: available-only rendering, unconfigured-method absence,
 * configuration-unavailable derivation on failure, and submit-blocked when
 * no valid method exists.
 */

import { describe, expect, it } from 'vitest'
import {
  deriveSelectableMethodOptions,
  hasNoAvailableMethods,
  isSubmitBlockedByAvailability,
  methodsToRender,
  type SelectorAvailState,
} from './selector-view'
import type { AvailabilityResult } from './availability'
import type { PaymentResult } from './errors'

function availabilityResult(overrides: Partial<AvailabilityResult> = {}): AvailabilityResult {
  return {
    methods: [
      { id: 'cash', label: 'Cash', status: 'available', depositAccount: 'Cash - TC' },
      { id: 'whish_money', label: 'Whish Money', status: 'PAYMENT_METHOD_NOT_FOUND' },
    ],
    available: [{ id: 'cash', label: 'Cash', status: 'available', depositAccount: 'Cash - TC' }],
    stale: false,
    ...overrides,
  }
}

describe('deriveSelectableMethodOptions — transaction selector renders available methods only', () => {
  it('returns only the available methods, never the full catalog', () => {
    const result: PaymentResult<AvailabilityResult> = { success: true, data: availabilityResult() }
    const options = deriveSelectableMethodOptions(result)
    expect(options).toEqual([{ value: 'cash', label: 'Cash' }])
  })

  it('unconfigured/unavailable methods are absent from the derived options', () => {
    const result: PaymentResult<AvailabilityResult> = { success: true, data: availabilityResult() }
    const options = deriveSelectableMethodOptions(result)
    expect(options.find(o => o.value === 'whish_money')).toBeUndefined()
  })

  it('a fully empty available[] derives to an empty option list (no method assumed)', () => {
    const result: PaymentResult<AvailabilityResult> = {
      success: true,
      data: availabilityResult({ available: [] }),
    }
    expect(deriveSelectableMethodOptions(result)).toEqual([])
  })

  it('a failed availability result derives to an empty option list — never Cash-assumed', () => {
    const result: PaymentResult<AvailabilityResult> = {
      success: false,
      code:    'PAYMENT_CONFIGURATION_UNAVAILABLE',
      message: 'unavailable',
    }
    expect(deriveSelectableMethodOptions(result)).toEqual([])
  })
})

describe('methodsToRender — availability failure renders configuration-unavailable state', () => {
  it('renders nothing while still loading', () => {
    const state: SelectorAvailState = { phase: 'loading' }
    expect(methodsToRender(state)).toEqual([])
  })

  it('renders the resolved methods once ready — a single available method', () => {
    const state: SelectorAvailState = { phase: 'ready', methods: [{ value: 'cash', label: 'Cash' }] }
    expect(methodsToRender(state)).toEqual([{ value: 'cash', label: 'Cash' }])
    expect(hasNoAvailableMethods(state)).toBe(false)
  })

  it('renders all seven methods safely when the full canonical catalog is available for a tenant', () => {
    const methods = [
      { value: 'cash' as const,                    label: 'Cash' },
      { value: 'whish_money' as const,              label: 'Whish Money' },
      { value: 'omt' as const,                      label: 'OMT Pay' },
      { value: 'mymonty' as const,                  label: 'MyMonty' },
      { value: 'suyool' as const,                   label: 'Suyool' },
      { value: 'purpl' as const,                    label: 'Purpl' },
      { value: 'bank_transfer_fresh_usd' as const,  label: 'Bank Transfer — Fresh USD' },
    ]
    const state: SelectorAvailState = { phase: 'ready', methods }
    expect(methodsToRender(state)).toEqual(methods)
    expect(methodsToRender(state)).toHaveLength(7)
    expect(hasNoAvailableMethods(state)).toBe(false)
    expect(isSubmitBlockedByAvailability(state)).toBe(false)
  })

  it('renders an empty list when ready with zero methods — caller shows configuration-unavailable', () => {
    const state: SelectorAvailState = { phase: 'ready', methods: [] }
    expect(methodsToRender(state)).toEqual([])
    expect(hasNoAvailableMethods(state)).toBe(true)
  })

  it('hasNoAvailableMethods is false while loading (avoids a premature unavailable flash)', () => {
    expect(hasNoAvailableMethods({ phase: 'loading' })).toBe(false)
  })

  it('hasNoAvailableMethods is false once ready with at least one method', () => {
    expect(hasNoAvailableMethods({ phase: 'ready', methods: [{ value: 'cash', label: 'Cash' }] })).toBe(false)
  })
})

describe('isSubmitBlockedByAvailability — submit is disabled when no valid method exists', () => {
  it('blocks submit while still loading', () => {
    expect(isSubmitBlockedByAvailability({ phase: 'loading' })).toBe(true)
  })

  it('blocks submit once ready with zero available methods', () => {
    expect(isSubmitBlockedByAvailability({ phase: 'ready', methods: [] })).toBe(true)
  })

  it('allows submit once ready with at least one available method', () => {
    expect(isSubmitBlockedByAvailability({ phase: 'ready', methods: [{ value: 'cash', label: 'Cash' }] })).toBe(false)
  })
})
