'use client'

import { CalendarDays } from 'lucide-react'
import { CompactSessionPreview } from '@/components/scheduling/booking/CompactSessionPreview'
import { ConflictBanner } from '@/components/scheduling/booking/ConflictBanner'
import { PackageBalanceGate } from '@/components/scheduling/booking/PackageBalanceGate'
import { humanSummary } from '@/lib/scheduling/draft'
import type { BookingPlan, PackageBalanceState } from '@/types/scheduling'
import type { Client } from '@/types'

const SESSION_TYPES = ['Strength', 'Cardio', 'Rehab', 'Mobility', 'Flexibility'] as const

interface BookingReviewStepProps {
  plan:              BookingPlan
  client:            Client | null
  packageBalance:    PackageBalanceState | null
  sessionType:       string | null
  fee:               number | null
  notes:             string | null
  /** When 'pay_per_session', the fee field is shown prominently and is required. */
  clientBillingMode?: 'package' | 'pay_per_session' | 'unset'
  onChange: (next: {
    sessionType?: string | null
    fee?:         number | null
    notes?:       string | null
  }) => void
  onSelectDifferentTime: () => void
}

function dateRangeLabel(plan: BookingPlan): string {
  if (plan.occurrences.length === 0) return '—'
  const first = plan.occurrences[0].startAt
  const last  = plan.occurrences[plan.occurrences.length - 1].startAt
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return plan.occurrences.length === 1 ? fmt(first) : `${fmt(first)} – ${fmt(last)}`
}

/**
 * Step 4 — Review & Confirm.
 *
 * Shows a tight summary card, an optional schedule preview, conflict banner,
 * and the optional session type / fee / notes inputs.
 */
export function BookingReviewStep({
  plan,
  client,
  packageBalance,
  sessionType,
  fee,
  notes,
  clientBillingMode,
  onChange,
  onSelectDifferentTime,
}: BookingReviewStepProps) {
  const isPPS = clientBillingMode === 'pay_per_session'
  const conflictTimes = new Set(plan.conflicts.map(c => c.occurrence.startAt.getTime()))
  const totalLabel = plan.occurrences.length === 1 ? '1 Session' : `${plan.occurrences.length} Sessions`

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          Looks good?
        </h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--fd-muted)' }}>
          {humanSummary(plan)}
        </p>
      </header>

      {/* Summary card */}
      <div
        className="flex items-center gap-3 rounded-lg border p-3"
        style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-bg)' }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: 'var(--fd-primary-soft)', color: 'var(--fd-primary-text)' }}
        >
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>{totalLabel}</p>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{dateRangeLabel(plan)}</p>
        </div>
      </div>

      {/* Client + package badge */}
      {client && (
        <div
          className="flex items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-bg)' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Client</p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>{client.name}</p>
            {client.phone && (
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{client.phone}</p>
            )}
          </div>
        </div>
      )}

      {packageBalance && <PackageBalanceGate state={packageBalance} />}

      {/* Financial consequence — always stated, never implied (doctrine). */}
      {clientBillingMode === 'unset' && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          No billing mode set for this client — booking never invoices, and
          completed sessions won&apos;t invoice automatically until billing is set
          on the profile.
        </p>
      )}
      {isPPS && fee !== null && fee > 0 && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          Booking creates no invoice. Each session invoices {fee} on completion.
        </p>
      )}

      {(plan.conflicts.length > 0 || plan.outOfHours.length > 0) && (
        <ConflictBanner plan={plan} onSelectDifferentTime={onSelectDifferentTime} />
      )}

      {/* Schedule preview */}
      <div>
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
          Schedule
        </p>
        <CompactSessionPreview occurrences={plan.occurrences} conflictTimes={conflictTimes} />
      </div>

      {/* PPS session rate — shown prominently and is required */}
      {isPPS && (
        <div
          className="rounded-lg border p-3 space-y-1.5"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-bg)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Session rate{' '}
            <span className="text-[10px] font-normal" style={{ color: 'var(--fd-red)' }}>required</span>
          </p>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={fee ?? ''}
            onChange={e => onChange({ fee: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="e.g. 20"
            className="input-base"
          />
          {(fee === null || fee <= 0) ? (
            <p className="text-[11px]" style={{ color: 'var(--fd-red)' }}>
              Session fee is required for pay-per-session clients.
            </p>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
              Snapped to this session — used when invoicing on completion.
            </p>
          )}
        </div>
      )}

      {/* Optional fields — session type, fee (non-PPS), notes */}
      <details className="rounded-lg border" style={{ borderColor: 'var(--fd-border)' }}>
        <summary
          className="cursor-pointer select-none rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--fd-card-hover)]"
          style={{ color: 'var(--fd-text)' }}
        >
          {isPPS ? 'Optional — type, notes' : 'Optional — type, fee, notes'}
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-1">
          <div>
            <p className="mb-1.5 text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Session type</p>
            <div className="flex flex-wrap gap-2">
              {SESSION_TYPES.map(type => {
                const active = sessionType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChange({ sessionType: active ? null : type })}
                    className="flex h-8 items-center justify-center rounded-full border px-3 text-xs font-medium"
                    style={{
                      backgroundColor: active ? 'var(--fd-primary-soft)' : 'var(--fd-surface)',
                      borderColor:     active ? 'var(--fd-primary-strong)' : 'var(--fd-border)',
                      color:           active ? 'var(--fd-primary-text)' : 'var(--fd-text)',
                    }}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fee — only for non-PPS clients; PPS shows it above as required */}
          {!isPPS && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Session fee</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fee ?? ''}
                onChange={e => onChange({ fee: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="0.00"
                className="input-base"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Notes</span>
            <textarea
              value={notes ?? ''}
              onChange={e => onChange({ notes: e.target.value || null })}
              rows={2}
              placeholder="Optional notes…"
              className="input-base resize-y"
            />
          </label>
        </div>
      </details>
    </section>
  )
}
