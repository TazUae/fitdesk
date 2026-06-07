import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { MoneySnapshot as MoneySnapshotData } from '@/lib/dashboard/derive'

interface Props {
  money: MoneySnapshotData
}

function fmtMoney(amount: number, currency: string): string {
  if (amount === 0) return '$0'
  return new Intl.NumberFormat('en-US', {
    style:                'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function MoneySnapshot({ money }: Props) {
  const { toCollect, collectedThisMonth, pendingCount, currency } = money
  const hasOutstanding = toCollect > 0

  // Proportion bar: out of total activity this month
  const total = toCollect + collectedThisMonth
  const collectedPct = total > 0 ? Math.round((collectedThisMonth / total) * 100) : 0

  return (
    <section className="space-y-2">
      <p className="px-0.5 text-sm font-bold" style={{ color: 'var(--fd-text)' }}>
        Money
      </p>

      <Link
        href="/dashboard/invoices"
        className="group block rounded-2xl border transition-opacity hover:opacity-95 active:opacity-80"
        style={{
          backgroundColor: hasOutstanding
            ? 'color-mix(in srgb, var(--fd-accent) 4%, var(--fd-surface))'
            : 'var(--fd-surface)',
          borderColor: hasOutstanding
            ? 'color-mix(in srgb, var(--fd-accent) 22%, var(--fd-border))'
            : 'var(--fd-border)',
        }}
      >
        {/* Hero figure */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.09em]"
                style={{ color: hasOutstanding ? 'var(--fd-warning)' : 'var(--fd-muted)' }}
              >
                To collect
              </p>
              <p
                className="mt-1 text-[2rem] font-bold leading-none tracking-tight"
                style={{ color: hasOutstanding ? 'var(--fd-text)' : 'var(--fd-text)' }}
              >
                {fmtMoney(toCollect, currency)}
              </p>
              {pendingCount > 0 && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
                  {pendingCount} invoice{pendingCount === 1 ? '' : 's'} pending
                </p>
              )}
              {!hasOutstanding && (
                <p className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--fd-green)' }}>
                  All invoices settled ✓
                </p>
              )}
            </div>
            <ArrowRight
              className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: 'var(--fd-muted)' }}
            />
          </div>

          {/* Proportion bar */}
          {total > 0 && (
            <div className="mt-4">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'rgba(217,48,37,0.12)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width:           `${collectedPct}%`,
                    backgroundColor: 'var(--fd-green)',
                  }}
                />
              </div>
              <p className="mt-1.5 text-[10px]" style={{ color: 'var(--fd-muted)' }}>
                {collectedPct}% collected this month
              </p>
            </div>
          )}
        </div>

        {/* Footer stat */}
        <div
          className="flex items-center justify-between border-t px-5 py-3"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            Collected this month
          </p>
          <p
            className="text-sm font-bold tabular-nums"
            style={{ color: collectedThisMonth > 0 ? 'var(--fd-green)' : 'var(--fd-muted)' }}
          >
            {fmtMoney(collectedThisMonth, currency)}
          </p>
        </div>
      </Link>
    </section>
  )
}
