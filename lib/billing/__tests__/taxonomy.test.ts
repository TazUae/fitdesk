import { describe, it, expect } from 'vitest'
import {
  BILLING_MODES,
  ACTIVE_BILLING_MODES,
  RESERVED_BILLING_MODES,
  BILLING_MODE_SENTINELS,
  CLIENT_BILLING_MODE_VALUES,
  TEMPLATE_TYPES,
  LEDGER_EVENT_TYPES,
  BILLING_SESSION_STATUSES,
  isBillingMode,
  isActiveBillingMode,
  isReservedBillingMode,
  isClientBillingModeValue,
  isTemplateType,
  isLedgerEventType,
  isBillingSessionStatus,
} from '../taxonomy'

describe('Billing mode constants', () => {
  it('BILLING_MODES contains exactly the three canonical modes', () => {
    expect([...BILLING_MODES]).toEqual(['pay_per_session', 'package', 'subscription'])
  })

  it('ACTIVE_BILLING_MODES contains exactly pay_per_session and package', () => {
    expect([...ACTIVE_BILLING_MODES]).toEqual(['pay_per_session', 'package'])
  })

  it('RESERVED_BILLING_MODES contains exactly subscription', () => {
    expect([...RESERVED_BILLING_MODES]).toEqual(['subscription'])
  })

  it('BILLING_MODE_SENTINELS contains exactly unset', () => {
    expect([...BILLING_MODE_SENTINELS]).toEqual(['unset'])
  })

  it('CLIENT_BILLING_MODE_VALUES includes unset', () => {
    expect(CLIENT_BILLING_MODE_VALUES).toContain('unset')
  })

  it('BILLING_MODES does not include unset', () => {
    expect(BILLING_MODES).not.toContain('unset')
  })

  it('CLIENT_BILLING_MODE_VALUES includes all BILLING_MODES values', () => {
    for (const mode of BILLING_MODES) {
      expect(CLIENT_BILLING_MODE_VALUES).toContain(mode)
    }
  })
})

describe('Template types', () => {
  it('TEMPLATE_TYPES contains exactly the three canonical values', () => {
    expect([...TEMPLATE_TYPES]).toEqual(['standard_block', 'complimentary', 'promotional'])
  })
})

describe('Ledger event types', () => {
  it('LEDGER_EVENT_TYPES contains exactly the six canonical values', () => {
    expect([...LEDGER_EVENT_TYPES]).toEqual([
      'purchase_activation',
      'bonus_granted',
      'refund_credit',
      'session_consumed',
      'late_cancel_penalty',
      'expiration_sweep',
    ])
  })
})

describe('Billing session statuses', () => {
  it('BILLING_SESSION_STATUSES contains exactly the five canonical values', () => {
    expect([...BILLING_SESSION_STATUSES]).toEqual([
      'draft',
      'scheduled',
      'completed',
      'cancelled_early',
      'cancelled_late',
    ])
  })
})

describe('isBillingMode', () => {
  it('returns true for active billing modes', () => {
    expect(isBillingMode('pay_per_session')).toBe(true)
    expect(isBillingMode('package')).toBe(true)
  })

  it('returns true for reserved billing modes', () => {
    expect(isBillingMode('subscription')).toBe(true)
  })

  it('returns false for sentinel and unknown strings', () => {
    expect(isBillingMode('unset')).toBe(false)
    expect(isBillingMode('unknown')).toBe(false)
    expect(isBillingMode('')).toBe(false)
    expect(isBillingMode(null)).toBe(false)
    expect(isBillingMode(undefined)).toBe(false)
    expect(isBillingMode(42)).toBe(false)
  })
})

describe('isActiveBillingMode', () => {
  it('returns true for pay_per_session and package', () => {
    expect(isActiveBillingMode('pay_per_session')).toBe(true)
    expect(isActiveBillingMode('package')).toBe(true)
  })

  it('returns false for subscription (reserved/deferred)', () => {
    expect(isActiveBillingMode('subscription')).toBe(false)
  })

  it('returns false for sentinel and unknown strings', () => {
    expect(isActiveBillingMode('unset')).toBe(false)
    expect(isActiveBillingMode('unknown')).toBe(false)
    expect(isActiveBillingMode(null)).toBe(false)
  })
})

describe('isReservedBillingMode', () => {
  it('returns true for subscription', () => {
    expect(isReservedBillingMode('subscription')).toBe(true)
  })

  it('returns false for active modes and sentinel', () => {
    expect(isReservedBillingMode('pay_per_session')).toBe(false)
    expect(isReservedBillingMode('package')).toBe(false)
    expect(isReservedBillingMode('unset')).toBe(false)
    expect(isReservedBillingMode('unknown')).toBe(false)
    expect(isReservedBillingMode(null)).toBe(false)
  })
})

describe('isClientBillingModeValue', () => {
  it('returns true for unset and all business modes', () => {
    expect(isClientBillingModeValue('unset')).toBe(true)
    expect(isClientBillingModeValue('pay_per_session')).toBe(true)
    expect(isClientBillingModeValue('package')).toBe(true)
    expect(isClientBillingModeValue('subscription')).toBe(true)
  })

  it('returns false for unknown strings', () => {
    expect(isClientBillingModeValue('unknown')).toBe(false)
    expect(isClientBillingModeValue('')).toBe(false)
    expect(isClientBillingModeValue(null)).toBe(false)
  })
})

describe('isTemplateType', () => {
  it('returns true for all canonical template types', () => {
    expect(isTemplateType('standard_block')).toBe(true)
    expect(isTemplateType('complimentary')).toBe(true)
    expect(isTemplateType('promotional')).toBe(true)
  })

  it('returns false for unknown strings', () => {
    expect(isTemplateType('trial')).toBe(false)
    expect(isTemplateType('unknown')).toBe(false)
    expect(isTemplateType(null)).toBe(false)
  })
})

describe('isLedgerEventType', () => {
  it('returns true for all canonical ledger event types', () => {
    expect(isLedgerEventType('purchase_activation')).toBe(true)
    expect(isLedgerEventType('bonus_granted')).toBe(true)
    expect(isLedgerEventType('refund_credit')).toBe(true)
    expect(isLedgerEventType('session_consumed')).toBe(true)
    expect(isLedgerEventType('late_cancel_penalty')).toBe(true)
    expect(isLedgerEventType('expiration_sweep')).toBe(true)
  })

  it('returns false for unknown strings', () => {
    expect(isLedgerEventType('debit')).toBe(false)
    expect(isLedgerEventType('unknown')).toBe(false)
    expect(isLedgerEventType(null)).toBe(false)
  })
})

describe('isBillingSessionStatus', () => {
  it('returns true for all canonical billing session statuses', () => {
    expect(isBillingSessionStatus('draft')).toBe(true)
    expect(isBillingSessionStatus('scheduled')).toBe(true)
    expect(isBillingSessionStatus('completed')).toBe(true)
    expect(isBillingSessionStatus('cancelled_early')).toBe(true)
    expect(isBillingSessionStatus('cancelled_late')).toBe(true)
  })

  it('returns false for the existing ERP session statuses that this type splits', () => {
    expect(isBillingSessionStatus('cancelled')).toBe(false)
    expect(isBillingSessionStatus('missed')).toBe(false)
  })

  it('returns false for unknown strings', () => {
    expect(isBillingSessionStatus('unknown')).toBe(false)
    expect(isBillingSessionStatus(null)).toBe(false)
    expect(isBillingSessionStatus(undefined)).toBe(false)
  })
})
