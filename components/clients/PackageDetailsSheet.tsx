'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Package, X } from 'lucide-react'
import { getClientPackageSummary, voidClientPackagePurchase } from '@/actions/packages'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import type { PackagePurchaseWithBalance } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageDetailsSheetProps {
  open:          boolean
  onClose:       () => void
  clientIndexId: string
  erpCustomerId: string
}

type LoadState = 'loading' | 'error' | 'ready'

// ─── Constants ────────────────────────────────────────────────────────────────

const VOID_REASONS = [
  'Duplicate package assigned by mistake',
  'Wrong package selected',
  'Client will not use this package',
  'Administrative correction',
  'Other',
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

function isVoidEligible(p: PackagePurchaseWithBalance): boolean {
  return (
    p.packageStatus === 'active' &&
    p.templateSnapshot.templateType === 'complimentary' &&
    p.templateSnapshot.priceAmount === 0 &&
    p.erpSalesInvoiceId === null &&
    p.remainingBalance > 0 &&
    p.remainingBalance === p.templateSnapshot.sessionCount
  )
}

function ineligibleReason(p: PackagePurchaseWithBalance): string {
  if (p.templateSnapshot.priceAmount > 0) return 'Paid packages cannot be voided here.'
  if (p.erpSalesInvoiceId !== null) return 'Cannot void — package has an ERP invoice.'
  if (p.remainingBalance !== p.templateSnapshot.sessionCount) return 'Cannot void — sessions have been used.'
  return 'Not eligible for void.'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PackageDetailsSheet({
  open,
  onClose,
  clientIndexId,
}: PackageDetailsSheetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── Load state ──────────────────────────────────────────────────────────────

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [purchases, setPurchases] = useState<PackagePurchaseWithBalance[]>([])

  // ── Void state ──────────────────────────────────────────────────────────────

  const [voidingId, setVoidingId]           = useState<string | null>(null)
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [otherDetails, setOtherDetails]     = useState('')
  const [voidError, setVoidError]           = useState<string | null>(null)
  const ikeyRef                             = useRef<string | null>(null)

  // Derived: final reason string sent to the action
  function derivedReason(): string {
    if (!selectedReason) return ''
    if (selectedReason === 'Other') return `Other: ${otherDetails.trim()}`
    return selectedReason
  }

  // Derived: whether the submit button is enabled
  const canSubmit =
    selectedReason !== null &&
    (selectedReason !== 'Other' || otherDetails.trim() !== '')

  // ── Load purchases when opened ──────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadState('loading')
    setVoidingId(null)
    setSelectedReason(null)
    setOtherDetails('')
    setVoidError(null)
    getClientPackageSummary(clientIndexId).then(result => {
      if (cancelled) return
      if (!result.success) { setLoadState('error'); return }
      setPurchases(result.data.purchases.filter(p => p.packageStatus === 'active'))
      setLoadState('ready')
    })
    return () => { cancelled = true }
  }, [open, clientIndexId])

  // ── Void handlers ───────────────────────────────────────────────────────────

  function handleStartVoid(id: string) {
    setVoidingId(id)
    setSelectedReason(null)
    setOtherDetails('')
    setVoidError(null)
    ikeyRef.current = null
  }

  function handleCancelVoid() {
    setVoidingId(null)
    setSelectedReason(null)
    setOtherDetails('')
    setVoidError(null)
    ikeyRef.current = null
  }

  function handleConfirmVoid() {
    const finalReason = derivedReason()
    if (!voidingId || !finalReason || isPending) return
    if (!ikeyRef.current) {
      ikeyRef.current = crypto.randomUUID()
    }
    const ikey = ikeyRef.current

    startTransition(async () => {
      const result = await voidClientPackagePurchase({
        packagePurchaseId:  voidingId,
        reason:             finalReason,
        voidIdempotencyKey: ikey,
      })
      if (result.success) {
        ikeyRef.current = null
        setVoidingId(null)
        setSelectedReason(null)
        setOtherDetails('')
        setVoidError(null)
        const summary = await getClientPackageSummary(clientIndexId)
        if (summary.success) {
          setPurchases(summary.data.purchases.filter(p => p.packageStatus === 'active'))
        }
        router.refresh()
      } else {
        setVoidError(result.error)
      }
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <WorkspaceShell
      open={open}
      onClose={onClose}
      label="Active packages"
      header={
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            Active packages
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

        {loadState === 'error' && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--fd-muted)' }}>
            Could not load package details. Please try again.
          </p>
        )}

        {loadState === 'ready' && purchases.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Package className="h-8 w-8" style={{ color: 'var(--fd-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              No active packages.
            </p>
          </div>
        )}

        {loadState === 'ready' && purchases.map(p => {
          const eligible     = isVoidEligible(p)
          const isConfirming = voidingId === p.id

          return (
            <div
              key={p.id}
              className="rounded-xl border p-4 space-y-3"
              style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
            >
              {/* Package summary row */}
              <div className="space-y-0.5">
                <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                  {p.templateSnapshot.name}
                </p>
                <p className="text-xs font-semibold" style={{ color: 'var(--fd-accent)' }}>
                  {p.remainingBalance} session{p.remainingBalance !== 1 ? 's' : ''} available
                </p>
                {p.activatedAtUtc && (
                  <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                    Activated {formatDate(p.activatedAtUtc)}
                  </p>
                )}
              </div>

              {/* Void confirmation or void trigger */}
              {isConfirming ? (
                <div className="space-y-3">
                  {/* Warning banner */}
                  <div
                    className="rounded-xl border px-3 py-2.5 space-y-1"
                    style={{
                      backgroundColor: 'rgba(232,92,106,0.06)',
                      borderColor:     'rgba(232,92,106,0.25)',
                    }}
                  >
                    <p className="text-xs font-semibold" style={{ color: 'var(--fd-red)' }}>
                      Void package?
                    </p>
                    <p className="text-xs" style={{ color: 'var(--fd-red)' }}>
                      This will remove the remaining sessions from this package without deleting the audit history.
                    </p>
                  </div>

                  {/* Reason selector */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold" style={{ color: 'var(--fd-text)' }}>
                      Reason for audit log
                    </p>
                    <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                      Choose the closest reason. This will be saved on the reversal ledger entry.
                    </p>

                    <div className="space-y-2 pt-1">
                      {VOID_REASONS.map(r => (
                        <label
                          key={r}
                          className="flex items-center gap-2.5 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`void-reason-${voidingId}`}
                            value={r}
                            checked={selectedReason === r}
                            onChange={() => {
                              setSelectedReason(r)
                              setOtherDetails('')
                              setVoidError(null)
                            }}
                            className="shrink-0"
                            style={{ accentColor: 'var(--fd-red)' }}
                          />
                          <span className="text-xs" style={{ color: 'var(--fd-text)' }}>
                            {r}
                          </span>
                        </label>
                      ))}
                    </div>

                    {selectedReason === 'Other' && (
                      <textarea
                        value={otherDetails}
                        onChange={e => { setOtherDetails(e.target.value); setVoidError(null) }}
                        placeholder="Please describe (required)"
                        rows={2}
                        className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none mt-1"
                        style={{
                          backgroundColor: 'var(--fd-card)',
                          borderColor:     otherDetails.trim() ? 'var(--fd-border)' : 'rgba(232,92,106,0.4)',
                          color:           'var(--fd-text)',
                        }}
                      />
                    )}
                  </div>

                  {voidError && (
                    <p className="text-xs" style={{ color: 'var(--fd-red)' }}>
                      {voidError}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelVoid}
                      disabled={isPending}
                      className="flex-1 rounded-xl border py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
                      style={{
                        borderColor:     'var(--fd-border)',
                        color:           'var(--fd-text)',
                        backgroundColor: 'var(--fd-card)',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmVoid}
                      disabled={!canSubmit || isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
                      style={{
                        backgroundColor: 'rgba(232,92,106,0.12)',
                        color:           'var(--fd-red)',
                      }}
                    >
                      {isPending
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Voiding…</>
                        : 'Void package'
                      }
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {eligible ? (
                    <button
                      type="button"
                      onClick={() => handleStartVoid(p.id)}
                      className="text-xs font-semibold transition-opacity active:opacity-70"
                      style={{ color: 'var(--fd-red)' }}
                    >
                      Void package
                    </button>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                      {ineligibleReason(p)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}

      </div>
    </WorkspaceShell>
  )
}
