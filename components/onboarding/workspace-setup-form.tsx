'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { startWorkspace } from '@/app/onboarding/actions'
import { slugifyWorkspaceName } from '@/lib/workspace/slug'

// MENA timezone → country/currency mapping.
// Country is transmitted to the Control Plane as a detected setup default.
// Timezone and currency are display-only — not transmitted or persisted.
const MENA_TZ_MAP: Record<string, { country: string; currency: string }> = {
  'Asia/Dubai':  { country: 'United Arab Emirates', currency: 'AED' },
  'Asia/Riyadh': { country: 'Saudi Arabia',          currency: 'SAR' },
  'Asia/Beirut': { country: 'Lebanon',               currency: 'USD' },
  'Asia/Kuwait': { country: 'Kuwait',                currency: 'KWD' },
  'Asia/Qatar':  { country: 'Qatar',                 currency: 'QAR' },
}

const DEFAULT_LOCALE = { country: 'United Arab Emirates', currency: 'AED' }

type LocaleInfo = { timezone: string; country: string; currency: string }

function detectLocale(): LocaleInfo {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const match = MENA_TZ_MAP[timezone] ?? DEFAULT_LOCALE
  return { timezone, ...match }
}

export function WorkspaceSetupForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [workspaceName, setWorkspaceName] = useState('')
  const [locale, setLocale] = useState<LocaleInfo | null>(null)

  // Detect locale client-side only — safe for SSR (no window access during render)
  useEffect(() => {
    setLocale(detectLocale())
  }, [])

  const slug = slugifyWorkspaceName(workspaceName)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!workspaceName.trim()) return

    startTransition(async () => {
      const result = await startWorkspace({
        workspaceName,
        country: locale?.country ?? DEFAULT_LOCALE.country,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      // Refresh the server component — onboarding/page.tsx will re-read the DB
      // and route to ProvisioningStatus now that a row exists.
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--fd-text)' }}>
          Set up your workspace
        </h1>
        <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
          Give your FitDesk workspace a name to get started.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workspace name — the only required input */}
        <div className="space-y-1.5">
          <label
            htmlFor="workspaceName"
            className="block text-sm font-medium"
            style={{ color: 'var(--fd-text)' }}
          >
            Workspace name
          </label>
          <input
            id="workspaceName"
            type="text"
            name="workspaceName"
            required
            autoComplete="off"
            placeholder="e.g. Alex Johnson PT"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            disabled={isPending}
            className="input-base"
          />
          {/* Live slug preview */}
          {workspaceName.trim() && (
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Workspace ID: <span className="font-mono">{slug}</span>
            </p>
          )}
        </div>

        {/* Locale preview — country is sent to workspace setup; timezone and currency are preview-only */}
        {locale !== null && (
          <div
            className="rounded-xl border p-4 space-y-3"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
          >
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
              Detected workspace defaults — Used for setup
            </p>
            <dl className="space-y-1 text-sm" style={{ color: 'var(--fd-text)' }}>
              <div className="flex gap-2">
                <dt style={{ color: 'var(--fd-muted)', minWidth: '5rem' }}>Country</dt>
                <dd>{locale.country}</dd>
              </div>
              <div className="flex gap-2">
                <dt style={{ color: 'var(--fd-muted)', minWidth: '5rem' }}>Timezone</dt>
                <dd>{locale.timezone}</dd>
              </div>
              <div className="flex gap-2">
                <dt style={{ color: 'var(--fd-muted)', minWidth: '5rem' }}>Currency</dt>
                <dd>{locale.currency}</dd>
              </div>
            </dl>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Country is sent to workspace setup. Timezone and currency are preview-only for now.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !workspaceName.trim()}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          {isPending ? 'Starting...' : 'Start Workspace'}
        </button>
      </form>
    </div>
  )
}
