'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Receipt, X } from 'lucide-react'
import { getClientStatement } from '@/actions/statements'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { fmtMoney } from '@/lib/format/money'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'
import type { ClientStatement, ClientStatementRow } from '@/lib/statements/assembleStatement'
import { filterStatementRows, groupRowsByMonth, sliceForLoadMore } from '@/lib/statements/groupAndFilter'
import type { DateRangeFilter, TypeFilter } from '@/lib/statements/groupAndFilter'

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

// ─── Activity filters ─────────────────────────────────────────────────────────

const RANGE_TABS: { id: DateRangeFilter; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: '30_days',  label: 'Last 30 days' },
  { id: '90_days',  label: 'Last 90 days' },
]

const TYPE_TABS: { id: TypeFilter; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'packages', label: 'Packages' },
]

const RANGE_ACTIVITY_LABEL: Record<DateRangeFilter, string> = {
  all:       'All time',
  '30_days': 'Last 30 days',
  '90_days': 'Last 90 days',
}

const LOAD_MORE_STEP = 20

function FilterPillRow<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(tab => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: isActive ? 'var(--fd-accent)' : 'var(--fd-card)',
              color:           isActive ? 'var(--fd-bg)'     : 'var(--fd-muted)',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
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

// ─── Month section ────────────────────────────────────────────────────────────

function MonthSection({
  monthKey,
  monthLabel,
  rows,
  collapsed,
  onToggle,
  showLedgerFooter,
}: {
  monthKey: string
  monthLabel: string
  rows: ClientStatementRow[]
  collapsed: boolean
  onToggle: () => void
  showLedgerFooter: boolean
}) {
  const sectionId = `statement-month-${monthKey}`

  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={sectionId}
        className="flex w-full items-center justify-between py-1.5"
      >
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
          {monthLabel} · {rows.length}
        </span>
        {collapsed
          ? <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--fd-muted)' }} />
          : <ChevronUp className="h-3.5 w-3.5" style={{ color: 'var(--fd-muted)' }} />
        }
      </button>
      {!collapsed && (
        <div id={sectionId} className="space-y-2 pt-1">
          {rows.map(row => (
            <StatementRowCard key={row.id} row={row} showLedgerFooter={showLedgerFooter} />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StatementSheet({ open, onClose, clientId }: StatementSheetProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [statement, setStatement] = useState<ClientStatement | null>(null)

  const [rangeFilter, setRangeFilter]       = useState<DateRangeFilter>('90_days')
  const [typeFilter, setTypeFilter]         = useState<TypeFilter>('all')
  const [displayCount, setDisplayCount]     = useState(LOAD_MORE_STEP)
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadState('loading')
    setStatement(null)
    setRangeFilter('90_days')
    setTypeFilter('all')
    setDisplayCount(LOAD_MORE_STEP)
    setCollapsedMonths(new Set())

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

  // Switching filters restarts pagination so the trainer isn't stranded mid-list.
  useEffect(() => {
    setDisplayCount(LOAD_MORE_STEP)
  }, [rangeFilter, typeFilter])

  function toggleMonth(monthKey: string) {
    setCollapsedMonths(prev => {
      const next = new Set(prev)
      if (next.has(monthKey)) next.delete(monthKey)
      else next.add(monthKey)
      return next
    })
  }

  const filteredRows  = statement ? filterStatementRows(statement.rows, rangeFilter, typeFilter) : []
  const visibleRows   = sliceForLoadMore(filteredRows, displayCount)
  const monthGroups   = groupRowsByMonth(visibleRows)
  const hasMoreRows   = filteredRows.length > displayCount

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
              <>
                <div className="space-y-2">
                  <FilterPillRow tabs={RANGE_TABS} active={rangeFilter} onChange={setRangeFilter} />
                  <FilterPillRow tabs={TYPE_TABS} active={typeFilter} onChange={setTypeFilter} />
                  <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                    Activity shown: {RANGE_ACTIVITY_LABEL[rangeFilter]}
                  </p>
                </div>

                {filteredRows.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Receipt className="h-8 w-8" style={{ color: 'var(--fd-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                      No activity matches this filter.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {monthGroups.map(group => (
                      <MonthSection
                        key={group.monthKey}
                        monthKey={group.monthKey}
                        monthLabel={group.monthLabel}
                        rows={group.rows}
                        collapsed={collapsedMonths.has(group.monthKey)}
                        onToggle={() => toggleMonth(group.monthKey)}
                        showLedgerFooter={statement.paymentHistoryAvailable}
                      />
                    ))}

                    {hasMoreRows && (
                      <button
                        type="button"
                        onClick={() => setDisplayCount(c => c + LOAD_MORE_STEP)}
                        className="w-full rounded-xl border py-2 text-xs font-semibold"
                        style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-accent)' }}
                      >
                        Load more
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

      </div>
    </WorkspaceShell>
  )
}
