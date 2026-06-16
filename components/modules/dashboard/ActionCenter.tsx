/**
 * ActionCenter — lightweight attention panel.
 *
 * Renders itemized overdue invoice cards (Phase 2) with client name, amount,
 * age label, and severity-driven accent treatment. Link-only — no mutation.
 *
 * Caller must guard: if (attentionItems.length === 0) don't render this.
 */

import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { AttentionItem } from '@/lib/dashboard/derive'

interface ActionCenterProps {
  items: AttentionItem[]
}

function fmtMoney(amount: number, currency: string): string {
  if (amount === 0) return '$0'
  return new Intl.NumberFormat('en-US', {
    style:                'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function ActionCenter({ items }: ActionCenterProps) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        if (item.type === 'overdue_invoice_overflow') {
          return (
            <Link
              key={idx}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-opacity active:opacity-70"
              style={{
                backgroundColor: 'rgba(232,92,106,0.04)',
                borderColor:     'rgba(232,92,106,0.15)',
              }}
            >
              <p className="min-w-0 flex-1 text-sm" style={{ color: 'var(--fd-muted)' }}>
                {item.label}
              </p>
              <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            </Link>
          )
        }

        const isHigh  = item.severity === 'high'
        const hasMeta = item.outstandingAmount !== undefined && !!item.currency

        return (
          <Link
            key={idx}
            href={item.href}
            aria-label={item.label}
            className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-opacity active:opacity-70"
            style={{
              backgroundColor: isHigh ? 'rgba(232,92,106,0.10)' : 'rgba(232,92,106,0.07)',
              borderColor:     isHigh ? 'rgba(232,92,106,0.30)' : 'rgba(232,92,106,0.20)',
            }}
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--fd-red)' }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-red)' }}>
                {item.clientName ?? item.label}
              </p>
              {hasMeta && (
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: isHigh ? 'var(--fd-red)' : 'var(--fd-muted)' }}
                >
                  {fmtMoney(item.outstandingAmount!, item.currency!)}
                  {item.ageDays !== undefined && item.ageDays > 0 && (
                    <> · {item.ageDays} day{item.ageDays !== 1 ? 's' : ''} overdue</>
                  )}
                </p>
              )}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-red)' }} />
          </Link>
        )
      })}
    </div>
  )
}
