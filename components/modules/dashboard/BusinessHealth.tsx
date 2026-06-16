/**
 * BusinessHealth — unified 3-metric honest strip.
 *
 * Three equal cells in one bordered container:
 *   To Collect → /invoices
 *   This Month → /invoices
 *   Active Clients → /clients
 *
 * No Sessions/Week. No deltas. No fake data.
 * Active Clients shows '—' when the fetch failed (null), never a fake 0.
 */

import Link from 'next/link'
import type { MoneySnapshot } from '@/lib/dashboard/derive'

interface BusinessHealthProps {
  snapshot:           MoneySnapshot
  activeClientsCount: number | null
}

function fmtMoney(n: number, currency: string): string {
  if (n === 0) return '$0'
  return new Intl.NumberFormat('en-US', {
    style:                'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

export function BusinessHealth({ snapshot, activeClientsCount }: BusinessHealthProps) {
  const { outstandingAmount, currency, overdueCount, monthlyRevenue } = snapshot
  const hasOutstanding = outstandingAmount > 0

  return (
    <div
      className="grid grid-cols-3 overflow-hidden rounded-2xl border"
    >
      {/* To Collect */}
      <Link
        href="/dashboard/invoices"
        className="flex flex-col gap-0.5 bg-[var(--fd-surface)] px-3 py-3.5 transition-colors hover:bg-[var(--fd-card)] active:opacity-70"
        aria-label={`To collect: ${fmtMoney(outstandingAmount, currency)}. View invoices.`}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--fd-muted)' }}
        >
          To Collect
        </p>
        <p
          className="text-xl font-bold tabular-nums"
          style={{ color: hasOutstanding ? 'var(--fd-red)' : 'var(--fd-green)' }}
        >
          {fmtMoney(outstandingAmount, currency)}
        </p>
        <p className="text-[10px]" style={{ color: hasOutstanding ? 'var(--fd-red)' : 'var(--fd-green)' }}>
          {hasOutstanding
            ? `${overdueCount > 0 ? `${overdueCount} overdue` : 'outstanding'}`
            : 'All clear ✓'}
        </p>
      </Link>

      {/* This Month */}
      <Link
        href="/dashboard/invoices"
        className="flex flex-col gap-0.5 border-l bg-[var(--fd-surface)] px-3 py-3.5 transition-colors hover:bg-[var(--fd-card)] active:opacity-70"
        aria-label={`This month: ${fmtMoney(monthlyRevenue, currency)}. View invoices.`}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--fd-muted)' }}
        >
          This Month
        </p>
        <p
          className="text-xl font-bold tabular-nums"
          style={{ color: 'var(--fd-text)' }}
        >
          {fmtMoney(monthlyRevenue, currency)}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--fd-muted)' }}>
          collected
        </p>
      </Link>

      {/* Active Clients */}
      <Link
        href="/dashboard/clients"
        className="flex flex-col gap-0.5 border-l bg-[var(--fd-surface)] px-3 py-3.5 transition-colors hover:bg-[var(--fd-card)] active:opacity-70"
        aria-label={`Active clients: ${activeClientsCount !== null ? activeClientsCount : 'unavailable'}. View clients.`}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--fd-muted)' }}
        >
          Active Clients
        </p>
        <p
          className="text-xl font-bold tabular-nums"
          style={{ color: 'var(--fd-text)' }}
        >
          {activeClientsCount !== null ? activeClientsCount : '—'}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--fd-muted)' }}>
          {activeClientsCount === 1 ? 'client' : 'clients'}
        </p>
      </Link>
    </div>
  )
}
