'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import {
  listPackageTemplates,
  createPackageTemplate,
  activatePackageTemplate,
  archivePackageTemplate,
} from '@/actions/packages'
import type { PackageTemplate } from '@/types/billing'

// TRAINING-SESSION is the default ERP Item Code for local smoke.
// The UI default can be overridden by the trainer before creation.
const DEFAULT_ERP_ITEM = 'TRAINING-SESSION'

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: PackageTemplate['status'] }) {
  if (status === 'active') {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ backgroundColor: 'var(--fd-green)', color: '#0F1117' }}
      >
        Active
      </span>
    )
  }
  if (status === 'archived') {
    return (
      <span
        className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
        style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
      >
        Archived
      </span>
    )
  }
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
    >
      Draft
    </span>
  )
}

// price_amount is stored in minor units (cents for USD/AED — divide by 100)
function fmtPrice(amount: number, currency: string): string {
  return `${currency} ${(amount / 100).toFixed(2)}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

type PendingAction = { id: string; action: 'activate' | 'archive' } | null

export default function PackagesSettingsPage() {
  const [templates, setTemplates] = useState<PackageTemplate[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pending,   setPending]   = useState<PendingAction>(null)

  // Create form
  const [name,         setName]         = useState('')
  const [sessionCount, setSessionCount] = useState('')
  const [priceMajor,   setPriceMajor]   = useState('')
  const [currency,     setCurrency]     = useState('USD')
  const [expiryDays,   setExpiryDays]   = useState('')
  const [erpItemCode,  setErpItemCode]  = useState(DEFAULT_ERP_ITEM)
  const [creating,     setCreating]     = useState(false)

  useEffect(() => {
    async function init() {
      const result = await listPackageTemplates()
      if (!result.success) { setLoadState('error'); return }
      setTemplates(result.data)
      setLoadState('ready')
    }
    init()
  }, [])

  async function refresh() {
    const result = await listPackageTemplates()
    if (result.success) setTemplates(result.data)
  }

  async function handleActivate(id: string) {
    if (pending !== null) return
    setPending({ id, action: 'activate' })
    const result = await activatePackageTemplate(id)
    setPending(null)
    if (!result.success) { toast.error(result.error); return }
    toast.success('Template activated — now assignable to clients.')
    await refresh()
  }

  async function handleArchive(id: string) {
    if (pending !== null) return
    setPending({ id, action: 'archive' })
    const result = await archivePackageTemplate(id)
    setPending(null)
    if (!result.success) { toast.error(result.error); return }
    toast.success('Template archived.')
    await refresh()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return

    const trimName = name.trim()
    if (!trimName) { toast.error('Template name is required.'); return }

    const count = parseInt(sessionCount, 10)
    if (!Number.isInteger(count) || count < 1) {
      toast.error('Session count must be a positive whole number.')
      return
    }

    const priceVal = parseFloat(priceMajor || '0')
    if (Number.isNaN(priceVal) || priceVal < 0) {
      toast.error('Price must be 0 or greater.')
      return
    }
    const priceMinor = Math.round(priceVal * 100)

    const trimCurrency = currency.trim().toUpperCase()
    if (trimCurrency.length !== 3) {
      toast.error('Currency must be 3 letters (e.g. USD).')
      return
    }

    const expiry = expiryDays.trim() !== ''
      ? parseInt(expiryDays.trim(), 10)
      : null
    if (expiry !== null && (!Number.isInteger(expiry) || expiry < 1)) {
      toast.error('Expiry days must be a positive whole number.')
      return
    }

    setCreating(true)
    const result = await createPackageTemplate({
      name:         trimName,
      sessionCount: count,
      priceAmount:  priceMinor,
      currency:     trimCurrency,
      expiryDays:   expiry,
      erpItemCode:  erpItemCode.trim() || null,
    })
    setCreating(false)

    if (!result.success) { toast.error(result.error); return }
    toast.success('Template created. Activate it to make it assignable to clients.')
    setName('')
    setSessionCount('')
    setPriceMajor('')
    setCurrency('USD')
    setExpiryDays('')
    setErpItemCode(DEFAULT_ERP_ITEM)
    await refresh()
  }

  return (
    <div className="space-y-5 p-4 pb-20">

      {/* Header */}
      <div>
        <Link
          href="/dashboard/settings"
          className="mb-3 inline-flex items-center gap-1 text-sm transition-opacity active:opacity-60"
          style={{ color: 'var(--fd-muted)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Workspace Settings
        </Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
          Package Catalog
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--fd-muted)' }}>
          Active templates appear in the Assign Package sheet on client profiles.
        </p>
      </div>

      {/* Loading */}
      {loadState === 'loading' && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--fd-muted)' }} />
        </div>
      )}

      {/* Error */}
      {loadState === 'error' && (
        <div
          className="rounded-2xl border p-4 text-center"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
        >
          <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
            Failed to load templates.
          </p>
          <button
            onClick={() => {
              setLoadState('loading')
              listPackageTemplates().then(r => {
                if (!r.success) { setLoadState('error'); return }
                setTemplates(r.data)
                setLoadState('ready')
              })
            }}
            className="mt-2 text-sm underline"
            style={{ color: 'var(--fd-accent)' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {loadState === 'ready' && templates.length === 0 && (
        <section
          className="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
        >
          <Package className="h-8 w-8" style={{ color: 'var(--fd-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            No templates yet
          </p>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            Create a template below, then activate it to start assigning packages to clients.
          </p>
        </section>
      )}

      {/* Template list */}
      {loadState === 'ready' && templates.length > 0 && (
        <section
          className="divide-y overflow-hidden rounded-2xl border"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
        >
          {templates.map((t) => (
            <div
              key={t.id}
              className="p-4"
              style={{ opacity: t.status === 'archived' ? 0.55 : 1 }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--fd-text)' }}>
                  {t.name}
                </p>
                <StatusPill status={t.status} />
              </div>

              <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
                {t.sessionCount} session{t.sessionCount !== 1 ? 's' : ''}
                {' · '}
                {fmtPrice(t.priceAmount, t.currency)}
                {t.erpItemCode ? ` · ${t.erpItemCode}` : ' · no ERP item'}
                {t.expiryDays ? ` · ${t.expiryDays}d expiry` : ''}
              </p>

              {t.status !== 'archived' && (
                <div className="mt-2.5 flex gap-2">
                  {t.status === 'draft' && (
                    <button
                      onClick={() => handleActivate(t.id)}
                      disabled={pending !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50 active:opacity-70"
                      style={{ backgroundColor: 'var(--fd-green)', color: '#0F1117' }}
                    >
                      {pending?.id === t.id && pending.action === 'activate'
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Check className="h-3 w-3" />
                      }
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => handleArchive(t.id)}
                    disabled={pending !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50 active:opacity-70"
                    style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)', backgroundColor: 'var(--fd-card)' }}
                  >
                    {pending?.id === t.id && pending.action === 'archive'
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : null
                    }
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Create form */}
      <section
        className="rounded-2xl border p-4"
        style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
      >
        <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Create new template
        </p>

        <form onSubmit={handleCreate} className="space-y-3">

          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              Template name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 10-Session Block"
              className="input-base"
              disabled={creating}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Sessions
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={sessionCount}
                onChange={e => setSessionCount(e.target.value)}
                placeholder="10"
                className="input-base"
                disabled={creating}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Expiry days (optional)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={expiryDays}
                onChange={e => setExpiryDays(e.target.value)}
                placeholder="90"
                className="input-base"
                disabled={creating}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Price (major units)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceMajor}
                onChange={e => setPriceMajor(e.target.value)}
                placeholder="50.00"
                className="input-base"
                disabled={creating}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Currency
              </label>
              <input
                type="text"
                value={currency}
                onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                placeholder="USD"
                className="input-base"
                disabled={creating}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              ERP Item Code
            </label>
            <input
              type="text"
              value={erpItemCode}
              onChange={e => setErpItemCode(e.target.value)}
              placeholder="TRAINING-SESSION"
              className="input-base"
              disabled={creating}
            />
            <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
              Must match an existing ERPNext Item. Required before activation.
            </p>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-60 active:scale-[0.98]"
            style={{ backgroundColor: 'var(--fd-green)', color: '#0F1117' }}
          >
            {creating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
              : 'Create Template'
            }
          </button>
        </form>
      </section>

    </div>
  )
}
