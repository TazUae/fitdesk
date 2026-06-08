/**
 * ActionCenter — lightweight attention panel.
 *
 * Only rendered when there are real attention items (overdue invoices).
 * Shows links only — no inline session mutations, no schedulingActions.
 *
 * Caller must guard: if (attentionItems.length === 0) don't render this.
 */

import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { AttentionItem } from '@/lib/dashboard/derive'

interface ActionCenterProps {
  items: AttentionItem[]
}

export function ActionCenter({ items }: ActionCenterProps) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fd-muted)' }}>
        Needs attention
      </p>
      {items.map((item, idx) => (
        <Link
          key={idx}
          href={item.href}
          className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-opacity active:opacity-70"
          style={{
            backgroundColor: 'rgba(232,92,106,0.07)',
            borderColor:     'rgba(232,92,106,0.2)',
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-red)' }} />
          <p className="min-w-0 flex-1 text-sm font-semibold" style={{ color: 'var(--fd-red)' }}>
            {item.label}
          </p>
          <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-red)' }} />
        </Link>
      ))}
    </div>
  )
}
