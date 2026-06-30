'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { PackageBalanceState } from '@/types/scheduling'

interface PackageBalanceGateProps {
  state: PackageBalanceState
}

/**
 * Visual gate that renders the client's package balance state.
 *
 * Read-only display only — no package ledger mutations of any kind.
 * Ledger writes happen in C4 (completion dispatch) via PackageConsumptionService.
 *
 * 'no_package' renders nothing.
 * 'ok' / 'low' show a small status chip.
 * 'overdraw' shows a strong red warning.
 */
export function PackageBalanceGate({ state }: PackageBalanceGateProps) {
  if (state.status === 'no_package') return null

  if (state.status === 'overdraw') {
    const over = state.willConsume - (state.remainingSessions ?? 0)
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-lg p-3 text-sm"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--fd-red) 8%, var(--fd-surface))',
          border: '1px solid color-mix(in srgb, var(--fd-red) 30%, transparent)',
          color: 'var(--fd-red)',
        }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Package overdraw</p>
          <p className="mt-0.5 text-xs" style={{ color: 'color-mix(in srgb, var(--fd-red) 80%, var(--fd-text))' }}>
            Client has {state.remainingSessions ?? 0} session{state.remainingSessions === 1 ? '' : 's'} left —
            this booking would consume {state.willConsume}, exceeding the package by {over}.
          </p>
        </div>
      </div>
    )
  }

  if (state.status === 'low') {
    return (
      <div
        className="flex items-center gap-2.5 rounded-lg p-2 text-xs"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--fd-warning) 10%, var(--fd-surface))',
          border: '1px solid color-mix(in srgb, var(--fd-warning) 30%, transparent)',
          color: 'var(--fd-warning)',
        }}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Low balance — {state.remainingSessions} session{state.remainingSessions === 1 ? '' : 's'} left after this booking.
        </span>
      </div>
    )
  }

  // 'ok'
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg p-2 text-xs"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--fd-green) 8%, var(--fd-surface))',
        border: '1px solid color-mix(in srgb, var(--fd-green) 25%, transparent)',
        color: 'var(--fd-green)',
      }}
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>
        Package OK — {state.remainingSessions} session{state.remainingSessions === 1 ? '' : 's'} left.
      </span>
    </div>
  )
}
