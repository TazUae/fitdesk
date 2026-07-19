'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Plus, Search, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { AddClientSheet } from '@/components/clients/AddClientSheet'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'
import type { ClientRosterCard, NeedsActionType } from '@/lib/clients/list-derive'
import type { BadgeVariant } from '@/components/ui/Badge'
import type { ClientStatus } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(s: ClientStatus): BadgeVariant {
  if (s === 'active') return 'active'
  return 'inactive'
}

function actionBadgeStyle(type: NeedsActionType): { bg: string; color: string } {
  if (type === 'overdue') {
    return {
      bg:    'rgba(232,92,106,0.12)',
      color: 'var(--fd-red)',
    }
  }
  if (type === 'outstanding') {
    return {
      bg:    'rgba(232,163,92,0.12)',
      color: 'var(--fd-accent)',
    }
  }
  return {
    bg:    'var(--fd-card)',
    color: 'var(--fd-muted)',
  }
}

// ─── Client card ──────────────────────────────────────────────────────────────

function ClientCard({ card }: { card: ClientRosterCard }) {
  const style = card.needsAction ? actionBadgeStyle(card.needsAction) : null

  return (
    <Link
      href={`/dashboard/clients/${card.id}`}
      className="flex items-start gap-3 rounded-2xl border p-4 transition-opacity active:opacity-60"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <Avatar name={card.name} size="md" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          {card.name}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--fd-muted)' }}>
          {card.phone || 'No phone'}
        </p>
        {card.goalLabel && (
          <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
            <Target className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate" title={card.goalLabel}>{card.goalLabel}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge variant={statusVariant(card.status)} />
        {card.needsAction && card.actionLabel && style && (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: style.bg, color: style.color }}
          >
            {card.needsAction === 'overdue' && (
              <AlertTriangle className="h-3 w-3 shrink-0" />
            )}
            {card.actionLabel}
          </span>
        )}
      </div>
    </Link>
  )
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

type FilterType = 'all' | 'owes'

// ─── Main component ───────────────────────────────────────────────────────────

interface ClientsViewProps {
  rosterCards:           ClientRosterCard[]
  /** Error from the server fetch — displayed inline above the list. */
  error?:                string
  invoicesAvailable:     boolean
  /** When true, Add button opens the AddClientSheet instead of navigating to /new. */
  enableAddClientSheet?: boolean
}

export function ClientsView({ rosterCards, error, invoicesAvailable, enableAddClientSheet }: ClientsViewProps) {
  const router    = useRouter()
  const [query,   setQuery]   = useState('')
  const [filter,  setFilter]  = useState<FilterType>('all')
  const [sheetOpen, setSheetOpen] = useState(false)

  const oweCount = rosterCards.filter(
    c => c.needsAction === 'overdue' || c.needsAction === 'outstanding',
  ).length

  const afterFilter: ClientRosterCard[] =
    filter === 'owes'
      ? rosterCards.filter(c => c.outstanding > 0 || c.overdueCount > 0)
      : rosterCards

  const filtered: ClientRosterCard[] = query.trim()
    ? afterFilter.filter(c => {
        const q = query.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.goalLabel?.toLowerCase().includes(q) ?? false)
        )
      })
    : afterFilter

  return (
    <div className="p-4 space-y-4">

      {/* Add Client Sheet (flag-gated) */}
      {enableAddClientSheet && (
        <AddClientSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      )}

      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold" style={{ color: 'var(--fd-muted)' }}>
          {rosterCards.length} client{rosterCards.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => {
            if (enableAddClientSheet) {
              setSheetOpen(true)
            } else {
              router.push('/dashboard/clients/new')
            }
          }}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {/* ── Server-side fetch error ───────────────────────────────────────── */}
      {error && (
        isErpUnavailableError(error) ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>
              Workspace data is still connecting
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
              Clients will appear here once your workspace data connection is ready.
            </p>
          </div>
        ) : (
          <p
            className="rounded-xl border p-3 text-sm"
            style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-red)' }}
          >
            {error}
          </p>
        )
      )}

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--fd-muted)' }}
        />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, phone, goal…"
          className="input-base pl-9"
        />
      </div>

      {/* ── Filter chips ─────────────────────────────────────────────────── */}
      {invoicesAvailable && oweCount > 0 && (
        <div className="flex gap-2">
          {(['all', 'owes'] as const).map(f => {
            const label = f === 'all' ? 'All' : `Owes money · ${oweCount}`
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  filter === f
                    ? 'text-[var(--fd-bg)]'
                    : 'border',
                )}
                style={
                  filter === f
                    ? { backgroundColor: 'var(--fd-accent)' }
                    : { borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }
                }
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Empty states ─────────────────────────────────────────────────── */}
      {rosterCards.length === 0 && !error && (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--fd-muted)' }}>
          No clients yet. Tap <strong>Add</strong> to create your first one.
        </p>
      )}
      {rosterCards.length > 0 && filtered.length === 0 && (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--fd-muted)' }}>
          {query.trim()
            ? `No clients match "${query}"`
            : 'No clients in this filter.'}
        </p>
      )}

      {/* ── Roster grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(card => (
          <ClientCard key={card.id} card={card} />
        ))}
      </div>

    </div>
  )
}
