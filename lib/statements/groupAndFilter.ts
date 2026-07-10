/**
 * Pure client-side grouping/filtering/pagination for the Statement of Account
 * activity list. Operates only on already-assembled ClientStatementRow[] —
 * no I/O, no auth, no ERP calls. Never touches statement.summary; the top
 * summary always reflects all-time totals regardless of these filters.
 */

import type { ClientStatementRow, ClientStatementRowType } from './assembleStatement'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateRangeFilter = 'all' | '30_days' | '90_days'
export type TypeFilter = 'all' | 'invoices' | 'payments' | 'packages'

export interface StatementMonthGroup {
  /** Sort key — 'YYYY-MM'. */
  monthKey: string
  /** Display label — e.g. 'July 2026'. */
  monthLabel: string
  rows: ClientStatementRow[]
}

const RANGE_DAYS: Record<Exclude<DateRangeFilter, 'all'>, number> = {
  '30_days': 30,
  '90_days': 90,
}

const INVOICE_TYPES: ClientStatementRowType[] = ['Package Invoice', 'Pay-per-session Invoice']

function matchesType(row: ClientStatementRow, type: TypeFilter): boolean {
  if (type === 'all') return true
  if (type === 'invoices') return INVOICE_TYPES.includes(row.type)
  if (type === 'payments') return row.type === 'Payment'
  return row.type === 'Package Invoice' // 'packages'
}

/** ISO YYYY-MM-DD cutoff string for "N days ago from now", inclusive. */
function cutoffDate(days: number, now: Date): string {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)
  return cutoff.toISOString().slice(0, 10)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function filterStatementRows(
  rows: ClientStatementRow[],
  range: DateRangeFilter,
  type: TypeFilter,
  now: Date = new Date(),
): ClientStatementRow[] {
  const cutoff = range === 'all' ? null : cutoffDate(RANGE_DAYS[range], now)
  return rows.filter(row => {
    if (cutoff !== null && row.date < cutoff) return false
    return matchesType(row, type)
  })
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

function monthLabelFor(isoDate: string): string {
  // Parse as UTC to avoid local-timezone shifting the date across a month boundary.
  const [year, month, day] = isoDate.split('-').map(Number)
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)))
}

/** Groups rows by calendar month (from row.date), preserving incoming row order. */
export function groupRowsByMonth(rows: ClientStatementRow[]): StatementMonthGroup[] {
  const groups = new Map<string, StatementMonthGroup>()

  for (const row of rows) {
    const monthKey = row.date.slice(0, 7) // 'YYYY-MM'
    let group = groups.get(monthKey)
    if (!group) {
      group = { monthKey, monthLabel: monthLabelFor(row.date), rows: [] }
      groups.set(monthKey, group)
    }
    group.rows.push(row)
  }

  return [...groups.values()]
}

/** Returns the first `displayCount` items — used for the "Load more" cap. */
export function sliceForLoadMore<T>(items: T[], displayCount: number): T[] {
  return items.slice(0, displayCount)
}
