'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Package } from 'lucide-react'
import { assignPackage, getClientPackageSummary, listAssignablePackageTemplates } from '@/actions/packages'
import {
  buildAssignPackagePayload,
  decidePostAssignmentAction,
  invoicePaymentPath,
  type PackageAssignPayMode,
} from '@/lib/billing/assign-package-flow'
import type { AssignablePackageTemplate, PackagePurchaseWithBalance } from '@/types/billing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssignPackageFormProps {
  clientIndexId: string
  erpCustomerId: string
  onClose:       () => void
}

type SubmitResult =
  | { type: 'success'; paymentWarning?: string | null }
  | { type: 'error';   message: string }

type LoadState = 'loading' | 'empty' | 'load_error' | 'ready'

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignPackageForm({
  clientIndexId,
  erpCustomerId,
  onClose,
}: AssignPackageFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── Template loading + client purchase summary ──────────────────────────────

  const [loadState, setLoadState]         = useState<LoadState>('loading')
  const [templates, setTemplates]         = useState<AssignablePackageTemplate[]>([])
  const [activePurchases, setActivePurchases] = useState<PackagePurchaseWithBalance[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listAssignablePackageTemplates(),
      getClientPackageSummary(clientIndexId),
    ]).then(([templatesResult, summaryResult]) => {
      if (cancelled) return
      if (!templatesResult.success) { setLoadState('load_error'); return }
      if (templatesResult.data.length === 0) { setLoadState('empty'); return }
      setTemplates(templatesResult.data)
      setLoadState('ready')
      // Summary is non-fatal — duplicate check is skipped if it fails
      if (summaryResult.success) {
        setActivePurchases(summaryResult.data.purchases)
      }
    })
    return () => { cancelled = true }
  }, [clientIndexId])

  // ── Selection state ─────────────────────────────────────────────────────────

  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [payMode,    setPayMode]             = useState<PackageAssignPayMode>('pay_later')
  const [submitResult, setSubmitResult]     = useState<SubmitResult | null>(null)
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)

  // Idempotency key — generated lazily on first confirm, reset on selection change
  const ikeyRef = useRef<string | null>(null)

  function handleSelectTemplate(id: string) {
    setSelectedId(id)
    setSubmitResult(null)
    setDuplicateConfirmed(false)
    ikeyRef.current = null
  }

  function handleSetPayMode(mode: PackageAssignPayMode) {
    setPayMode(mode)
    setSubmitResult(null)
    ikeyRef.current = null
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const selectedTemplate  = templates.find(t => t.id === selectedId) ?? null
  const isComplimentary   = selectedTemplate?.priceAmount === 0

  const activeSameTemplate = selectedId
    ? activePurchases.filter(p => p.packageTemplateId === selectedId && p.packageStatus === 'active')
    : []
  const duplicateWarning = activeSameTemplate.length > 0
    ? {
        count:        activeSameTemplate.length,
        totalBalance: activeSameTemplate.reduce((sum, p) => sum + p.remainingBalance, 0),
      }
    : null

  // No payment method, company, or account is chosen here — that requires a
  // real invoice to exist first (see lib/billing/assign-package-flow.ts).
  const canSubmit = (
    selectedId !== null &&
    !isPending &&
    (!duplicateWarning || duplicateConfirmed)
  )

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleConfirm() {
    if (!canSubmit || !selectedId) return
    if (!ikeyRef.current) {
      ikeyRef.current = crypto.randomUUID()
    }
    const ikey = ikeyRef.current

    // Never sends a payment method, company, or account — assignPackage()
    // only ever creates the package and its billing document (no Payment
    // Entry attempted here), regardless of payMode. See
    // lib/billing/assign-package-flow.ts.
    const payload = buildAssignPackagePayload({
      clientIndexId,
      erpCustomerId,
      packageTemplateId:  selectedId,
      idempotencyKey:     ikey,
      hasDuplicateWarning: duplicateWarning !== null,
      duplicateConfirmed,
    })

    startTransition(async () => {
      const result = await assignPackage(payload)
      if (!result.success) {
        // Keep ikey — allows idempotent retry without changing the key
        setSubmitResult({ type: 'error', message: result.error })
        return
      }

      ikeyRef.current = null
      router.refresh()

      const action = decidePostAssignmentAction({
        payMode,
        erpInvoiceId: result.data.erpInvoiceId,
      })

      if (action.type === 'collect_payment') {
        // Close this sheet and hand off to the existing, ERP-preflighted
        // invoice payment flow for the invoice just created — its real
        // tenant/company/currency drive method availability there.
        onClose()
        router.push(invoicePaymentPath(action.invoiceId))
        return
      }

      setSubmitResult({ type: 'success', paymentWarning: result.data.paymentWarning })
    })
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--fd-muted)' }} />
      </div>
    )
  }

  if (loadState === 'load_error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
          Could not load package templates. Please try again.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold"
          style={{ color: 'var(--fd-accent)' }}
        >
          Close
        </button>
      </div>
    )
  }

  if (loadState === 'empty') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <Package className="h-8 w-8" style={{ color: 'var(--fd-muted)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          No active packages
        </p>
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          Create and activate a package template before assigning.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold"
          style={{ color: 'var(--fd-accent)' }}
        >
          Close
        </button>
      </div>
    )
  }

  // ── Success ─────────────────────────────────────────────────────────────────

  if (submitResult?.type === 'success') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            backgroundColor: 'rgba(78,203,160,0.12)',
            border:          '2px solid rgba(78,203,160,0.3)',
          }}
        >
          <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--fd-green)' }} />
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
            Package assigned
          </h3>
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            {selectedTemplate?.name ?? 'Package'} added to client&apos;s account.
          </p>
        </div>

        {submitResult.paymentWarning && (
          <div
            className="w-full rounded-xl border px-4 py-3"
            style={{
              backgroundColor: 'rgba(232,197,71,0.08)',
              borderColor:     'rgba(232,197,71,0.35)',
            }}
          >
            <p className="text-sm font-semibold" style={{ color: '#d4a017' }}>
              Payment pending
            </p>
            <p className="mt-0.5 text-xs" style={{ color: '#d4a017' }}>
              {submitResult.paymentWarning}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl py-3 text-sm font-bold transition-opacity active:opacity-70"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          Done
        </button>
      </div>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Template picker */}
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Package
          </p>
          <div className="space-y-2">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                aria-pressed={selectedId === tpl.id}
                onClick={() => handleSelectTemplate(tpl.id)}
                className="w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all"
                style={{
                  backgroundColor: selectedId === tpl.id
                    ? 'rgba(78,203,160,0.08)'
                    : 'var(--fd-card)',
                  borderColor: selectedId === tpl.id
                    ? 'rgba(78,203,160,0.5)'
                    : 'var(--fd-border)',
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--fd-text)' }}>
                    {tpl.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--fd-muted)' }}>
                    {tpl.sessionCount} session{tpl.sessionCount !== 1 ? 's' : ''}
                    {tpl.expiryDays ? ` · ${tpl.expiryDays}d expiry` : ''}
                  </p>
                </div>
                <div className="shrink-0 ml-3 text-right">
                  {tpl.priceAmount === 0 ? (
                    <span className="text-sm font-bold" style={{ color: 'var(--fd-green)' }}>
                      Free
                    </span>
                  ) : (
                    <span className="text-sm font-bold" style={{ color: 'var(--fd-text)' }}>
                      {tpl.currency} {(tpl.priceAmount / 100).toLocaleString()}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Duplicate active package warning */}
        {duplicateWarning && selectedTemplate && (
          <div
            className="rounded-xl border px-4 py-3 space-y-3"
            style={{
              backgroundColor: 'rgba(232,197,71,0.08)',
              borderColor:     'rgba(232,197,71,0.35)',
            }}
          >
            <p className="text-sm font-semibold" style={{ color: '#d4a017' }}>
              This client already has this package active.
            </p>
            <p className="text-xs" style={{ color: '#d4a017' }}>
              {selectedTemplate.name} is already active{' '}
              {duplicateWarning.count} time{duplicateWarning.count !== 1 ? 's' : ''} with{' '}
              {duplicateWarning.totalBalance}{' '}
              session{duplicateWarning.totalBalance !== 1 ? 's' : ''} available.
              Assigning again will add another{' '}
              {selectedTemplate.sessionCount}{' '}
              session{selectedTemplate.sessionCount !== 1 ? 's' : ''}.
            </p>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={duplicateConfirmed}
                onChange={e => setDuplicateConfirmed(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-xs font-semibold" style={{ color: '#d4a017' }}>
                I understand — assign another package
              </span>
            </label>
          </div>
        )}

        {/* Payment mode — hidden for complimentary packages. No method, company,
            or account is chosen here — Paid Now only decides whether the
            trainer is taken to collect payment right after this step. */}
        {selectedId !== null && !isComplimentary && (
          <div className="space-y-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Payment
            </p>
            <div
              className="flex rounded-xl p-1 gap-1"
              style={{ backgroundColor: 'var(--fd-card)' }}
            >
              {(
                [
                  { value: 'pay_later', label: 'Pay Later' },
                  { value: 'paid_now',  label: 'Paid Now'  },
                ] as const
              ).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSetPayMode(opt.value)}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: payMode === opt.value ? 'var(--fd-accent)' : 'transparent',
                    color:           payMode === opt.value ? 'var(--fd-bg)'     : 'var(--fd-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {payMode === 'paid_now' && (
              <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                You&apos;ll pick how they paid on the next screen, once we know what your
                workspace can accept.
              </p>
            )}
          </div>
        )}

        {/* Error banner */}
        {submitResult?.type === 'error' && (
          <div
            role="alert"
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(232,92,106,0.08)',
              borderColor:     'rgba(232,92,106,0.25)',
              color:           'var(--fd-red)',
            }}
          >
            {submitResult.message}
          </div>
        )}

      </div>

      {/* Sticky footer */}
      <div
        className="flex-shrink-0 flex gap-3 border-t px-6 pt-4"
        style={{
          borderColor:   'var(--fd-border)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="flex-1 rounded-xl border py-3 text-sm font-semibold transition-opacity active:opacity-60 disabled:opacity-50"
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
          onClick={handleConfirm}
          disabled={!canSubmit}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity active:opacity-60 disabled:opacity-50"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          {isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</>
            : duplicateConfirmed ? 'Assign another anyway' : 'Assign'
          }
        </button>
      </div>
    </div>
  )
}
