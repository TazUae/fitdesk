'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Receipt, X } from 'lucide-react'
import { getClientStatement } from '@/actions/statements'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { fmtMoney } from '@/lib/format/money'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'
import type { ClientStatement, ClientStatementRow } from '@/lib/statements/assembleStatement'

export interface StatementSheetProps {
  open:     boolean
  onClose:  () => void
  clientId: string
}

type LoadState = 'loading' | 'unavailable' | 'error' | 'ready'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  'Preparing':   'draft',
  'To collect':  'pending',
  'Partly paid': 'pending',
  'Overdue':     'overdue',
  'Paid':        'paid',
  'Cancelled':   'cancelled',
}

function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status] ?? 'draft'
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryGrid({
  summary,
  paymentHistoryAvailable,
}: {
  summary: ClientStatement['summary']
  /** When false, the credited-amount card is labeled "Applied" (invoice-balance-derived), not "Paid". */
  paymentHistoryAvailable: boolean
}) {
  const cards: { label: string; value: number; color: string }[] = [
    { label: 'Invoiced', value: summary.totalInvoiced, color: 'var(--fd-text)' },
    {
      label: paymentHistoryAvailable ? 'Paid' : 'Applied',
      value: summary.totalPaid,
      color: 'var(--fd-green)',
    },
    { label: 'Outstanding', value: summary.outstandingBalance, color: 'var(--fd-red)' },
    { label: 'Overdue',     value: summary.overdueBalance,     color: 'var(--fd-red)' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className="rounded-xl border p-3"
          style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            {card.label}
          </p>
          <p className="mt-0.5 text-base font-bold" style={{ color: card.color }}>
            {fmtMoney(card.value)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Payment history warning ──────────────────────────────────────────────────

/** Non-blocking notice — shown when invoice data loaded but payment history didn't. */
function PaymentHistoryWarning({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium"
      style={{
        backgroundColor: 'rgba(232,197,71,0.10)',
        border:          '1px solid rgba(232,197,71,0.3)',
        color:           '#d4a017',
      }}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {message}
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function StatementRowCard({
  row,
  showLedgerFooter,
}: {
  row: ClientStatementRow
  /**
   * False in degraded mode (paymentHistoryAvailable === false) — the running
   * Debit/Credit/Bal ledger footer is misleading once payment rows can't be
   * fetched, so it's hidden in favor of the invoice-level Total/Applied/
   * Outstanding breakdown above it. Statement math itself is unchanged.
   */
  showLedgerFooter: boolean
}) {
  return (
    <div
      className="rounded-xl border p-3 space-y-1.5"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: 'var(--fd-text)' }}>
            {row.type}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
            {formatDate(row.date)} · {row.reference}
          </p>
        </div>
        <Badge variant={statusVariant(row.status)} label={row.status} />
      </div>

      <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
        {row.description}
      </p>

      {row.invoiceTotal !== undefined && (
        <div className="grid grid-cols-3 gap-2 rounded-lg px-2 py-1.5" style={{ backgroundColor: 'var(--fd-card)' }}>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--fd-muted)' }}>Total</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--fd-text)' }}>
              {fmtMoney(row.invoiceTotal)}
            </p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--fd-muted)' }}>Applied</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--fd-green)' }}>
              {fmtMoney(row.applied ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--fd-muted)' }}>Outstanding</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--fd-red)' }}>
              {fmtMoney(row.outstanding ?? 0)}
            </p>
          </div>
        </div>
      )}

      {showLedgerFooter && (
        <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--fd-border)' }}>
          <div className="flex items-center gap-3 text-xs">
            {row.debit > 0 && (
              <span style={{ color: 'var(--fd-red)' }}>Debit {fmtMoney(row.debit)}</span>
            )}
            {row.credit > 0 && (
              <span style={{ color: 'var(--fd-green)' }}>Credit {fmtMoney(row.credit)}</span>
            )}
            {row.debit === 0 && row.credit === 0 && (
              <span style={{ color: 'var(--fd-muted)' }}>No effect</span>
            )}
          </div>
          <span className="text-[11px] font-semibold" style={{ color: 'var(--fd-text)' }}>
            Bal {fmtMoney(row.runningBalance)}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StatementSheet({ open, onClose, clientId }: StatementSheetProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [statement, setStatement] = useState<ClientStatement | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadState('loading')
    setStatement(null)

    getClientStatement(clientId).then(result => {
      if (cancelled) return
      if (!result.success) {
        setLoadState(isErpUnavailableError(result.error) ? 'unavailable' : 'error')
        return
      }
      setStatement(result.data)
      setLoadState('ready')
    })

    return () => { cancelled = true }
  }, [open, clientId])

  return (
    <WorkspaceShell
      open={open}
      onClose={onClose}
      label="Statement of account"
      header={
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            Statement of account
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {loadState === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--fd-muted)' }} />
          </div>
        )}

        {loadState === 'unavailable' && (
          <div className="py-8 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>
              Statement is still connecting
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
              It will appear here once your workspace data connection is ready.
            </p>
          </div>
        )}

        {loadState === 'error' && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--fd-muted)' }}>
            Could not load the statement. Please try again.
          </p>
        )}

        {loadState === 'ready' && statement && (
          <>
            {!statement.paymentHistoryAvailable && (
              <PaymentHistoryWarning
                message={
                  statement.warning
                  ?? 'Payment history is temporarily unavailable. Totals below use invoice balances. '
                    + 'Individual payment rows cannot be shown right now.'
                }
              />
            )}

            <SummaryGrid summary={statement.summary} paymentHistoryAvailable={statement.paymentHistoryAvailable} />

            {statement.rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Receipt className="h-8 w-8" style={{ color: 'var(--fd-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                  No invoices or payments yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {statement.rows.map(row => (
                  <StatementRowCard
                    key={row.id}
                    row={row}
                    showLedgerFooter={statement.paymentHistoryAvailable}
                  />
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </WorkspaceShell>
  )
}
