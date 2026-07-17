import { describe, expect, it } from 'vitest'

import {
  enabledPaymentMethods,
  erpModeToPaymentMethod,
  isEnabledPaymentMethod,
  isPaymentMethod,
  paymentMethodLabel,
  paymentMethodToErpMode,
  paymentRecordedAuditIdentity,
  PAYMENT_METHODS,
} from './methods'

const CANONICAL_IDS = [
  'cash',
  'whish_money',
  'omt',
  'mymonty',
  'suyool',
  'purpl',
  'bank_transfer_fresh_usd',
] as const

describe('PAYMENT_METHODS — canonical Slice 2 catalog', () => {
  it('contains exactly the seven canonical fixed methods', () => {
    expect(PAYMENT_METHODS.map(m => m.value).sort()).toEqual([...CANONICAL_IDS].sort())
    expect(PAYMENT_METHODS).toHaveLength(7)
  })

  it('every fixed method has a unique stable internal id', () => {
    const ids = PAYMENT_METHODS.map(m => m.value)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every fixed method has a deterministic rail', () => {
    const railById = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.rail]))
    expect(railById).toEqual({
      cash:                     'cash',
      whish_money:              'mobile_wallet',
      omt:                      'mobile_wallet',
      mymonty:                  'mobile_wallet',
      suyool:                   'mobile_wallet',
      purpl:                    'mobile_wallet',
      bank_transfer_fresh_usd:  'bank_transfer',
    })
  })

  it('cash is global and enabled; the six Lebanon-only methods are held (enabled: false) pending an authoritative country gate', () => {
    const byId = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, { market: m.market, enabled: m.enabled }]))
    expect(byId.cash).toEqual({ market: 'global', enabled: true })
    for (const id of ['whish_money', 'omt', 'mymonty', 'suyool', 'purpl', 'bank_transfer_fresh_usd'] as const) {
      expect(byId[id]).toEqual({ market: 'LB', enabled: false })
    }
  })

  it('no catalog entry uses the retired ERP docname "OMT"', () => {
    expect(PAYMENT_METHODS.some(m => m.erpNextModeOfPayment === 'OMT')).toBe(false)
  })

  it('does not include usdt or mobile_wallet_other as catalog entries', () => {
    const ids = PAYMENT_METHODS.map(m => m.value)
    expect(ids).not.toContain('usdt')
    expect(ids).not.toContain('mobile_wallet_other')
  })
})

describe('paymentMethodToErpMode', () => {
  it('maps internal values to their exact ERPNext Mode of Payment docnames', () => {
    expect(paymentMethodToErpMode('cash')).toBe('Cash')
    expect(paymentMethodToErpMode('whish_money')).toBe('Whish Money')
    expect(paymentMethodToErpMode('mymonty')).toBe('MyMonty')
    expect(paymentMethodToErpMode('suyool')).toBe('Suyool')
    expect(paymentMethodToErpMode('purpl')).toBe('Purpl')
    expect(paymentMethodToErpMode('bank_transfer_fresh_usd')).toBe('Bank Transfer - Fresh USD')
  })

  it('omt resolves to the corrected ERP docname "OMT Pay", never the retired "OMT"', () => {
    expect(paymentMethodToErpMode('omt')).toBe('OMT Pay')
    expect(paymentMethodToErpMode('omt')).not.toBe('OMT')
  })
})

describe('paymentMethodLabel', () => {
  it('returns the canonical trainer-facing labels', () => {
    expect(paymentMethodLabel('cash')).toBe('Cash')
    expect(paymentMethodLabel('whish_money')).toBe('Whish Money')
    expect(paymentMethodLabel('mymonty')).toBe('MyMonty')
    expect(paymentMethodLabel('suyool')).toBe('Suyool')
    expect(paymentMethodLabel('purpl')).toBe('Purpl')
    expect(paymentMethodLabel('bank_transfer_fresh_usd')).toBe('Bank Transfer — Fresh USD')
  })

  it('omt displays as "OMT Pay"', () => {
    expect(paymentMethodLabel('omt')).toBe('OMT Pay')
  })
})

describe('isPaymentMethod', () => {
  it('accepts all seven canonical methods', () => {
    for (const id of CANONICAL_IDS) {
      expect(isPaymentMethod(id)).toBe(true)
    }
  })

  it('rejects usdt — not a catalog entry, so it can never be selectable or probed', () => {
    expect(isPaymentMethod('usdt')).toBe(false)
  })

  it('rejects mobile_wallet_other — no fixed docname exists to join on yet', () => {
    expect(isPaymentMethod('mobile_wallet_other')).toBe(false)
  })

  it('rejects the retired bare "bank_transfer" id and ERPNext mode names sent as an internal value', () => {
    expect(isPaymentMethod('bank_transfer')).toBe(false)
    expect(isPaymentMethod('Cash')).toBe(false)
    expect(isPaymentMethod('OMT Pay')).toBe(false)
  })

  it('rejects unknown, empty, and non-string values', () => {
    expect(isPaymentMethod('unknown')).toBe(false)
    expect(isPaymentMethod('')).toBe(false)
    expect(isPaymentMethod(undefined)).toBe(false)
    expect(isPaymentMethod(null)).toBe(false)
    expect(isPaymentMethod(123)).toBe(false)
  })
})

describe('enabledPaymentMethods / isEnabledPaymentMethod — Lebanon market hold', () => {
  it('offers only cash — every Lebanon-only method is held pending an authoritative country gate', () => {
    expect(enabledPaymentMethods().map(m => m.value)).toEqual(['cash'])
  })

  it('accepts cash; rejects every Lebanon-only method even though each is a known, correctly-mapped catalog id', () => {
    expect(isEnabledPaymentMethod('cash')).toBe(true)
    for (const id of ['whish_money', 'omt', 'mymonty', 'suyool', 'purpl', 'bank_transfer_fresh_usd'] as const) {
      // Still a real catalog member with a correct docname/label — held, not unknown.
      expect(isPaymentMethod(id)).toBe(true)
      expect(isEnabledPaymentMethod(id)).toBe(false)
    }
  })

  it('still rejects usdt, mobile_wallet_other, retired, mode-name, and non-string values', () => {
    expect(isEnabledPaymentMethod('usdt')).toBe(false)
    expect(isEnabledPaymentMethod('mobile_wallet_other')).toBe(false)
    expect(isEnabledPaymentMethod('bank_transfer')).toBe(false)
    expect(isEnabledPaymentMethod('Cash')).toBe(false)
    expect(isEnabledPaymentMethod('')).toBe(false)
    expect(isEnabledPaymentMethod(undefined)).toBe(false)
    expect(isEnabledPaymentMethod(null)).toBe(false)
  })
})

describe('erpModeToPaymentMethod — reverse lookup, the other direction of the same catalog', () => {
  it('resolves every canonical ERP docname back to its exact internal id and label', () => {
    expect(erpModeToPaymentMethod('Cash')).toEqual({ id: 'cash', label: 'Cash' })
    expect(erpModeToPaymentMethod('Whish Money')).toEqual({ id: 'whish_money', label: 'Whish Money' })
    expect(erpModeToPaymentMethod('OMT Pay')).toEqual({ id: 'omt', label: 'OMT Pay' })
    expect(erpModeToPaymentMethod('MyMonty')).toEqual({ id: 'mymonty', label: 'MyMonty' })
    expect(erpModeToPaymentMethod('Suyool')).toEqual({ id: 'suyool', label: 'Suyool' })
    expect(erpModeToPaymentMethod('Purpl')).toEqual({ id: 'purpl', label: 'Purpl' })
    expect(erpModeToPaymentMethod('Bank Transfer - Fresh USD')).toEqual({
      id: 'bank_transfer_fresh_usd', label: 'Bank Transfer — Fresh USD',
    })
  })

  it('the retired docname "OMT" no longer resolves to anything — it must not silently mean omt', () => {
    expect(erpModeToPaymentMethod('OMT')).toBeNull()
  })

  it('an unrecognized or legacy ERP mode returns null — never guessed as cash or any other method', () => {
    expect(erpModeToPaymentMethod('Some Tenant-Custom Wallet')).toBeNull()
    expect(erpModeToPaymentMethod('')).toBeNull()
  })

  it('is the exact inverse of paymentMethodToErpMode for every canonical method', () => {
    for (const id of CANONICAL_IDS) {
      const erpMode = paymentMethodToErpMode(id)
      expect(erpModeToPaymentMethod(erpMode)?.id).toBe(id)
    }
  })
})

describe('existing Cash and Whish Money identity is unchanged by the catalog expansion', () => {
  it('cash: same id, label, docname, and enabled status as before — global, unaffected by the Lebanon hold', () => {
    expect(paymentMethodToErpMode('cash')).toBe('Cash')
    expect(paymentMethodLabel('cash')).toBe('Cash')
    expect(isEnabledPaymentMethod('cash')).toBe(true)
  })

  it('whish_money: same id, label, and docname as before — its enabled status changed for a documented reason', () => {
    expect(paymentMethodToErpMode('whish_money')).toBe('Whish Money')
    expect(paymentMethodLabel('whish_money')).toBe('Whish Money')
    // Was enabled prior to the Lebanon market boundary; now held like every
    // other Lebanon-only method, pending an authoritative country gate —
    // not a regression in its identity mapping, which is unchanged above.
    expect(isEnabledPaymentMethod('whish_money')).toBe(false)
  })
})

describe('paymentRecordedAuditIdentity — the exact three-field audit identity, for every catalog method', () => {
  const EXPECTED: Record<typeof CANONICAL_IDS[number], { methodLabel: string; erpModeOfPayment: string }> = {
    cash:                     { methodLabel: 'Cash',                       erpModeOfPayment: 'Cash' },
    whish_money:              { methodLabel: 'Whish Money',                erpModeOfPayment: 'Whish Money' },
    omt:                      { methodLabel: 'OMT Pay',                    erpModeOfPayment: 'OMT Pay' },
    mymonty:                  { methodLabel: 'MyMonty',                    erpModeOfPayment: 'MyMonty' },
    suyool:                   { methodLabel: 'Suyool',                     erpModeOfPayment: 'Suyool' },
    purpl:                    { methodLabel: 'Purpl',                      erpModeOfPayment: 'Purpl' },
    bank_transfer_fresh_usd:  { methodLabel: 'Bank Transfer — Fresh USD',  erpModeOfPayment: 'Bank Transfer - Fresh USD' },
  }

  it('produces the exact id/label/docname for every one of the seven catalog methods — including the six currently held ones, which cannot reach recordPayment\'s success path today to prove this end-to-end', () => {
    for (const id of CANONICAL_IDS) {
      const identity = paymentRecordedAuditIdentity(id)
      expect(identity).toEqual({ method: id, ...EXPECTED[id] })
    }
  })

  it('never carries a `provider` key on any method\'s identity — the coarse link-routing bucket that previously produced contradictory records like { provider: "cash", method: "mymonty" } has no path into this object at all', () => {
    for (const id of CANONICAL_IDS) {
      const identity = paymentRecordedAuditIdentity(id)
      expect('provider' in identity).toBe(false)
    }
  })

  it('no non-cash method\'s label or docname is ever the string "Cash" — the exact defect class this identity exists to prevent', () => {
    for (const id of CANONICAL_IDS) {
      if (id === 'cash') continue
      const identity = paymentRecordedAuditIdentity(id)
      expect(identity.methodLabel).not.toBe('Cash')
      expect(identity.erpModeOfPayment).not.toBe('Cash')
    }
  })

  it('serializes to JSON with no false provider:"cash" for any non-cash method', () => {
    for (const id of CANONICAL_IDS) {
      if (id === 'cash') continue
      const serialized = JSON.stringify({ ...paymentRecordedAuditIdentity(id), eventType: 'payment_recorded' })
      expect(serialized).not.toContain('"provider"')
      expect(serialized).not.toMatch(/"provider":"cash"/)
    }
  })
})
