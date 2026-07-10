import { describe, expect, it } from 'vitest'
import {
  buildActivityEmptyState,
  filterStatementRows,
  groupRowsByMonth,
  isTypeFilterDisabled,
  normalizeTypeFilterForAvailability,
  sliceForLoadMore,
} from './groupAndFilter'
import type { ClientStatementRow, ClientStatementRowType } from './assembleStatement'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function row(overrides: Partial<ClientStatementRow> = {}): ClientStatementRow {
  return {
    id:             'inv-SINV-1',
    date:           '2026-07-09',
    type:           'Package Invoice',
    reference:      'SINV-1',
    description:    'Package invoice',
    debit:          100,
    credit:         0,
    runningBalance: 100,
    status:         'To collect',
    invoiceTotal:   100,
    applied:        0,
    outstanding:    100,
    ...overrides,
  }
}

const NOW = new Date('2026-07-10T12:00:00Z')

// ─── filterStatementRows — date range ─────────────────────────────────────────

describe('filterStatementRows — date range', () => {
  it('"all" passes every row through regardless of date', () => {
    const rows = [row({ date: '2020-01-01' }), row({ date: '2026-07-09' })]
    expect(filterStatementRows(rows, 'all', 'all', NOW)).toHaveLength(2)
  })

  it('"30_days" excludes rows older than the cutoff', () => {
    const inRange  = row({ id: 'a', date: '2026-06-15' }) // 25 days ago
    const outRange = row({ id: 'b', date: '2026-05-01' }) // ~70 days ago
    const result = filterStatementRows([inRange, outRange], '30_days', 'all', NOW)
    expect(result.map(r => r.id)).toEqual(['a'])
  })

  it('"90_days" excludes rows older than the cutoff', () => {
    const inRange  = row({ id: 'a', date: '2026-05-01' }) // ~70 days ago
    const outRange = row({ id: 'b', date: '2025-01-01' })
    const result = filterStatementRows([inRange, outRange], '90_days', 'all', NOW)
    expect(result.map(r => r.id)).toEqual(['a'])
  })

  it('includes a row exactly on the cutoff boundary', () => {
    // 30 days before 2026-07-10 is 2026-06-10.
    const boundary = row({ id: 'boundary', date: '2026-06-10' })
    const result = filterStatementRows([boundary], '30_days', 'all', NOW)
    expect(result.map(r => r.id)).toEqual(['boundary'])
  })
})

// ─── filterStatementRows — type ───────────────────────────────────────────────

describe('filterStatementRows — type', () => {
  const mixed: ClientStatementRow[] = [
    row({ id: 'package', type: 'Package Invoice' }),
    row({ id: 'pps', type: 'Pay-per-session Invoice' }),
    row({ id: 'payment', type: 'Payment', debit: 0, credit: 50, invoiceTotal: undefined, applied: undefined, outstanding: undefined }),
  ]

  it('"all" includes every type', () => {
    expect(filterStatementRows(mixed, 'all', 'all', NOW).map(r => r.id).sort())
      .toEqual(['package', 'payment', 'pps'])
  })

  it('"invoices" includes both invoice subtypes but not payments', () => {
    expect(filterStatementRows(mixed, 'all', 'invoices', NOW).map(r => r.id).sort())
      .toEqual(['package', 'pps'])
  })

  it('"payments" includes only Payment rows', () => {
    expect(filterStatementRows(mixed, 'all', 'payments', NOW).map(r => r.id))
      .toEqual(['payment'])
  })

  it('"packages" includes only Package Invoice rows, excluding Pay-per-session', () => {
    expect(filterStatementRows(mixed, 'all', 'packages', NOW).map(r => r.id))
      .toEqual(['package'])
  })
})

// ─── filterStatementRows — combined ───────────────────────────────────────────

describe('filterStatementRows — combined range + type', () => {
  it('applies both filters together', () => {
    const rows: ClientStatementRow[] = [
      row({ id: 'recent-package', date: '2026-07-01', type: 'Package Invoice' }),
      row({ id: 'recent-payment', date: '2026-07-01', type: 'Payment' }),
      row({ id: 'old-package', date: '2025-01-01', type: 'Package Invoice' }),
    ]
    const result = filterStatementRows(rows, '30_days', 'packages', NOW)
    expect(result.map(r => r.id)).toEqual(['recent-package'])
  })
})

// ─── groupRowsByMonth ──────────────────────────────────────────────────────────

describe('groupRowsByMonth', () => {
  it('returns an empty array for no rows', () => {
    expect(groupRowsByMonth([])).toEqual([])
  })

  it('groups a single month correctly', () => {
    const rows = [row({ id: 'a', date: '2026-07-01' }), row({ id: 'b', date: '2026-07-15' })]
    const groups = groupRowsByMonth(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].monthKey).toBe('2026-07')
    expect(groups[0].monthLabel).toBe('July 2026')
    expect(groups[0].rows.map(r => r.id)).toEqual(['a', 'b'])
  })

  it('collapses rows into one group per month even when interleaved, preserving within-group order', () => {
    const rows = [
      row({ id: 'jul-1', date: '2026-07-05' }),
      row({ id: 'aug-1', date: '2026-08-02' }),
      row({ id: 'jul-2', date: '2026-07-20' }),
    ]
    const groups = groupRowsByMonth(rows)
    expect(groups.map(g => g.monthKey)).toEqual(['2026-07', '2026-08'])
    expect(groups.find(g => g.monthKey === '2026-07')?.rows.map(r => r.id)).toEqual(['jul-1', 'jul-2'])
    expect(groups.find(g => g.monthKey === '2026-08')?.rows.map(r => r.id)).toEqual(['aug-1'])
  })

  it('formats month labels correctly regardless of local timezone', () => {
    const groups = groupRowsByMonth([row({ date: '2026-01-31' })])
    expect(groups[0].monthLabel).toBe('January 2026')
  })
})

// ─── sliceForLoadMore ──────────────────────────────────────────────────────────

describe('sliceForLoadMore', () => {
  it('returns all items when fewer than displayCount', () => {
    const items = [1, 2, 3]
    expect(sliceForLoadMore(items, 20)).toEqual([1, 2, 3])
  })

  it('returns exactly displayCount items when equal', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect(sliceForLoadMore(items, 20)).toHaveLength(20)
  })

  it('slices to the first displayCount items when more are available, growing across load-more increments', () => {
    const items = Array.from({ length: 45 }, (_, i) => i)
    expect(sliceForLoadMore(items, 20)).toHaveLength(20)
    expect(sliceForLoadMore(items, 40)).toHaveLength(40)
    expect(sliceForLoadMore(items, 60)).toHaveLength(45)
  })
})

// ─── isTypeFilterDisabled ──────────────────────────────────────────────────────

describe('isTypeFilterDisabled', () => {
  it('disables "payments" when payment history is unavailable', () => {
    expect(isTypeFilterDisabled('payments', false)).toBe(true)
  })

  it('does not disable "payments" when payment history is available', () => {
    expect(isTypeFilterDisabled('payments', true)).toBe(false)
  })

  it('never disables other filter types, regardless of availability', () => {
    expect(isTypeFilterDisabled('all', false)).toBe(false)
    expect(isTypeFilterDisabled('invoices', false)).toBe(false)
    expect(isTypeFilterDisabled('packages', false)).toBe(false)
  })
})

// ─── normalizeTypeFilterForAvailability ───────────────────────────────────────

describe('normalizeTypeFilterForAvailability', () => {
  it('resets "payments" to "all" when payment history is unavailable', () => {
    expect(normalizeTypeFilterForAvailability('payments', false)).toBe('all')
  })

  it('leaves "payments" unchanged when payment history is available', () => {
    expect(normalizeTypeFilterForAvailability('payments', true)).toBe('payments')
  })

  it('leaves other filter types unchanged regardless of availability', () => {
    expect(normalizeTypeFilterForAvailability('all', false)).toBe('all')
    expect(normalizeTypeFilterForAvailability('invoices', false)).toBe('invoices')
    expect(normalizeTypeFilterForAvailability('packages', false)).toBe('packages')
  })
})

// ─── buildActivityEmptyState ───────────────────────────────────────────────────

describe('buildActivityEmptyState', () => {
  it('returns the degraded-payments copy for "payments" when history is unavailable', () => {
    expect(buildActivityEmptyState('payments', false)).toBe(
      'Payment records are temporarily unavailable. Check the invoice summary above for applied balances.',
    )
  })

  it('returns the true-empty payments copy for "payments" when history is available', () => {
    expect(buildActivityEmptyState('payments', true)).toBe('No payments recorded for this period.')
  })

  it('returns the generic copy for non-payments filters, even when history is unavailable', () => {
    expect(buildActivityEmptyState('all', false)).toBe('No activity matches this filter.')
    expect(buildActivityEmptyState('invoices', false)).toBe('No activity matches this filter.')
    expect(buildActivityEmptyState('packages', false)).toBe('No activity matches this filter.')
  })

  it('returns the generic copy for non-payments filters when history is available', () => {
    expect(buildActivityEmptyState('all', true)).toBe('No activity matches this filter.')
  })
})
