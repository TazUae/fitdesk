/**
 * ActionCenter — lightweight attention panel.
 *
 * Renders itemized attention cards:
 *   overdue_invoice      — red urgency (past due)
 *   pending_invoice      — amber collection prompt (sent / partially_paid)
 *   invoice_overflow     — "+N more" cap link to invoices list
 *   unresolved_session   — amber, session needs an outcome (US-057/US-003)
 *   missing_next_session — calm/neutral, client has no upcoming session (US-003)
 *
 * Link-only — no mutation.
 * Caller must guard: if (attentionItems.length === 0) don't render this.
 *
 * IMPORTANT: every AttentionItem.type must have its own explicit branch
 * here. The final return below assumes overdue_invoice shape
 * (outstandingAmount/currency/ageDays) — a type that falls through to it
 * without a dedicated branch would render with the wrong color and blank
 * meta text instead of a visible error, so this is not a safe default.
 */

import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarX, Clock } from 'lucide-react'
import { fmtMoneyCompact } from '@/lib/format/money'
import type { AttentionItem } from '@/lib/dashboard/derive'

interface ActionCenterProps {
  items: AttentionItem[]
}

export function ActionCenter({ items }: ActionCenterProps) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        // ── Overflow cap ────────────────────────────────────────────────────
        if (item.type === 'invoice_overflow') {
          return (
            <Link
              key={idx}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-opacity active:opacity-70"
              style={{
                backgroundColor: 'var(--fd-surface)',
                borderColor:     'var(--fd-border)',
              }}
            >
              <p className="min-w-0 flex-1 text-sm" style={{ color: 'var(--fd-muted)' }}>
                {item.label}
              </p>
              <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            </Link>
          )
        }

        // ── Pending invoice — sent / partially_paid (amber) ────────────────
        if (item.type === 'pending_invoice') {
          const hasMeta = item.outstandingAmount !== undefined && !!item.currency
          return (
            <Link
              key={idx}
              href={item.href}
              aria-label={item.label}
              className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-opacity active:opacity-70"
              style={{
                backgroundColor: 'rgba(232,197,71,0.07)',
                borderColor:     'rgba(232,197,71,0.28)',
              }}
            >
              <Clock
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--fd-accent)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                  {item.clientName ?? item.label}
                </p>
                {hasMeta && (
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
                    {fmtMoneyCompact(item.outstandingAmount!, item.currency!)}
                    {' · To collect'}
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            </Link>
          )
        }

        // ── Unresolved session — amber, needs an outcome (US-057/US-003) ────
        if (item.type === 'unresolved_session') {
          return (
            <Link
              key={idx}
              href={item.href}
              aria-label={item.label}
              className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-opacity active:opacity-70"
              style={{
                backgroundColor: 'rgba(232,197,71,0.07)',
                borderColor:     'rgba(232,197,71,0.28)',
              }}
            >
              <Clock
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--fd-accent)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" style={{ color: 'var(--fd-text)' }}>
                  {item.label}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            </Link>
          )
        }

        // ── Missing next session — calm/neutral, no upcoming session (US-003) ──
        if (item.type === 'missing_next_session') {
          return (
            <Link
              key={idx}
              href={item.href}
              aria-label={item.label}
              className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-opacity active:opacity-70"
              style={{
                backgroundColor: 'var(--fd-surface)',
                borderColor:     'var(--fd-border)',
              }}
            >
              <CalendarX
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--fd-muted)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" style={{ color: 'var(--fd-text)' }}>
                  {item.label}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            </Link>
          )
        }

        // ── Overdue invoice — red urgency ──────────────────────────────────
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
                  {fmtMoneyCompact(item.outstandingAmount!, item.currency!)}
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
