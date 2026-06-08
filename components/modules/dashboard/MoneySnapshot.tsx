/**
 * MoneySnapshot — prominent money-to-collect card near the top of the dashboard.
 *
 * Shows outstanding balance and revenue this month.
 * Links to /dashboard/invoices for full detail.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { MoneySnapshot as MoneySnapshotData } from '@/lib/dashboard/derive'

interface MoneySnapshotProps {
  snapshot: MoneySnapshotData
}

function fmtMoney(n: number, currency: string): string {
  if (n === 0) return '$0'
  return new Intl.NumberFormat('en-US', {
    style:                'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

export function MoneySnapshot({ snapshot }: MoneySnapshotProps) {
  const { outstandingAmount, currency, overdueCount, monthlyRevenue } = snapshot
  const hasOutstanding = outstandingAmount > 0
  const allClear       = outstandingAmount === 0

  return (
    <Link
      href="/dashboard/invoices"
      className="flex items-center gap-4 rounded-2xl border p-4 transition-opacity active:opacity-70"
      style={{
        backgroundColor: hasOutstanding
          ? 'rgba(232,92,106,0.06)'
          : 'var(--fd-surface)',
        borderColor: hasOutstanding
          ? 'rgba(232,92,106,0.2)'
          : 'var(--fd-border)',
      }}
    >
      {/* Left: outstanding */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
          To collect
        </p>
        <p
          className="mt-0.5 text-2xl font-bold tabular-nums"
          style={{ color: hasOutstanding ? 'var(--fd-red)' : 'var(--fd-green)' }}
        >
          {fmtMoney(outstandingAmount, currency)}
        </p>
        {allClear ? (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-green)' }}>
            All clear ✓
          </p>
        ) : (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
            {overdueCount > 0
              ? `${overdueCount} overdue · tap to view`
              : 'Tap to view invoices'}
          </p>
        )}
      </div>

      {/* Right: this month */}
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
          This month
        </p>
        <p className="mt-0.5 text-base font-bold tabular-nums" style={{ color: 'var(--fd-text)' }}>
          {fmtMoney(monthlyRevenue, currency)}
        </p>
        <ArrowRight
          className="mt-1 ml-auto h-3.5 w-3.5"
          style={{ color: 'var(--fd-muted)' }}
        />
      </div>
    </Link>
  )
}
