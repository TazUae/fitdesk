'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, CheckCircle2, ChevronDown, Loader2, MessageCircle, RefreshCw, User } from 'lucide-react'
import { ProvisioningStatus } from './provisioning-status'
import { connectWithPairingCode, pollWhatsAppStatus } from '@/actions/whatsapp'
import { authClient, useSession } from '@/lib/auth-client'
import type { WhatsAppConnection } from '@/types'
import type { JobStatusResponse } from '@/types/controlplane'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'profile' | 'whatsapp' | 'workspace'

interface ProfileData {
  trainerName:  string
  businessName: string
  country:      string
  currency:     string
}

interface InitialRecord {
  jobId: string
  status: string
  failureReason?: string | null
}

interface OnboardingWizardProps {
  initialRecord: InitialRecord | null
  provisioningDone: boolean
  whatsappDone: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPairingCode(raw: string): string {
  const clean = raw.replace(/\W/g, '').toUpperCase()
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`
  return clean
}

// ─── Country / currency data ──────────────────────────────────────────────────

const COUNTRIES: { code: string; name: string; currency: string }[] = [
  { code: 'LB', name: 'Lebanon',              currency: 'USD' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'SA', name: 'Saudi Arabia',          currency: 'SAR' },
  { code: 'KW', name: 'Kuwait',                currency: 'KWD' },
  { code: 'QA', name: 'Qatar',                 currency: 'QAR' },
  { code: 'BH', name: 'Bahrain',               currency: 'BHD' },
  { code: 'OM', name: 'Oman',                  currency: 'OMR' },
  { code: 'JO', name: 'Jordan',                currency: 'JOD' },
  { code: 'EG', name: 'Egypt',                 currency: 'EGP' },
  { code: 'IQ', name: 'Iraq',                  currency: 'IQD' },
  { code: 'TR', name: 'Turkey',                currency: 'TRY' },
  { code: 'GB', name: 'United Kingdom',        currency: 'GBP' },
  { code: 'US', name: 'United States',         currency: 'USD' },
  { code: 'CA', name: 'Canada',                currency: 'CAD' },
  { code: 'AU', name: 'Australia',             currency: 'AUD' },
  { code: 'DE', name: 'Germany',               currency: 'EUR' },
  { code: 'FR', name: 'France',                currency: 'EUR' },
  { code: 'ES', name: 'Spain',                 currency: 'EUR' },
  { code: 'IT', name: 'Italy',                 currency: 'EUR' },
  { code: 'NL', name: 'Netherlands',           currency: 'EUR' },
  { code: 'CH', name: 'Switzerland',           currency: 'CHF' },
  { code: 'SE', name: 'Sweden',                currency: 'SEK' },
  { code: 'NO', name: 'Norway',                currency: 'NOK' },
  { code: 'IN', name: 'India',                 currency: 'INR' },
  { code: 'PK', name: 'Pakistan',              currency: 'PKR' },
  { code: 'SG', name: 'Singapore',             currency: 'SGD' },
  { code: 'MY', name: 'Malaysia',              currency: 'MYR' },
  { code: 'NG', name: 'Nigeria',               currency: 'NGN' },
  { code: 'ZA', name: 'South Africa',          currency: 'ZAR' },
  { code: 'BR', name: 'Brazil',                currency: 'BRL' },
  { code: 'MX', name: 'Mexico',                currency: 'MXN' },
  { code: 'NZ', name: 'New Zealand',           currency: 'NZD' },
]

const COUNTRY_CURRENCY: Record<string, string> = Object.fromEntries(
  COUNTRIES.map(c => [c.code, c.currency])
)

// ─── Step 1: Profile ─────────────────────────────────────────────────────────

function ProfileStep({ onDone }: { onDone: (data: ProfileData) => void }) {
  const { data: session } = useSession()

  const [trainerName,  setTrainerName]  = useState('')
  const [businessName, setBusinessName] = useState('')
  const [country,      setCountry]      = useState('LB')
  const [currency,     setCurrency]     = useState('USD')
  const [detecting,    setDetecting]    = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  // Pre-fill trainer name from auth session once loaded
  useEffect(() => {
    if (session?.user?.name && !trainerName) {
      setTrainerName(session.user.name)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.name])

  // Auto-detect country from IP on mount
  useEffect(() => {
    fetch('/api/geoip', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { countryCode?: string; currency?: string }) => {
        if (d.countryCode) {
          setCountry(d.countryCode)
          setCurrency(COUNTRY_CURRENCY[d.countryCode] ?? d.currency ?? 'USD')
        }
      })
      .catch(() => { /* keep defaults */ })
      .finally(() => setDetecting(false))
  }, [])

  // When country changes, auto-update currency
  function handleCountryChange(code: string) {
    setCountry(code)
    if (COUNTRY_CURRENCY[code]) setCurrency(COUNTRY_CURRENCY[code])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!trainerName.trim()) { setError('Please enter your name.');    return }
    if (!country)            { setError('Please select a country.');  return }
    if (!currency)           { setError('Please select a currency.'); return }
    onDone({ trainerName: trainerName.trim(), businessName: businessName.trim(), country, currency })
  }

  const selectStyle = {
    backgroundColor: 'var(--fd-card)',
    color: 'var(--fd-text)',
    borderColor: 'var(--fd-border)',
  }

  return (
    <div className="space-y-6">
      <StepHeader
        step={1}
        title="Tell us about your business"
        subtitle="This sets up your invoicing, currency, and business profile."
      />

      <form onSubmit={handleSubmit}>
        <div
          className="rounded-2xl border p-5 space-y-5"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          {error && (
            <p
              className="text-sm rounded-xl px-3 py-2"
              style={{ color: 'var(--fd-red)', backgroundColor: 'rgba(232,92,106,0.08)', border: '1px solid rgba(232,92,106,0.2)' }}
            >
              {error}
            </p>
          )}

          {/* Trainer name — first field */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              Your name
              <span className="ml-1 text-xs font-normal" style={{ color: 'var(--fd-red)' }}>*</span>
            </label>
            <div
              className="flex items-center rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
            >
              <span className="px-3 py-3 border-r" style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}>
                <User className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
              </span>
              <input
                type="text"
                value={trainerName}
                onChange={e => { setTrainerName(e.target.value); setError(null) }}
                placeholder="e.g. Alex Trainer"
                autoFocus
                className="flex-1 bg-transparent px-3 py-3 text-sm outline-none"
                style={{ color: 'var(--fd-text)' }}
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Confirm your name as it will appear to clients
            </p>
          </div>

          {/* Business name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              Business / gym name
              <span className="ml-1 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>(optional)</span>
            </label>
            <div
              className="flex items-center rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
            >
              <span className="px-3 py-3 border-r" style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}>
                <Building2 className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
              </span>
              <input
                type="text"
                value={businessName}
                onChange={e => { setBusinessName(e.target.value); setError(null) }}
                placeholder="e.g. Alex PT, FitLife Gym"
                className="flex-1 bg-transparent px-3 py-3 text-sm outline-none"
                style={{ color: 'var(--fd-text)' }}
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              The name clients will see on invoices
            </p>
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              Country
              {detecting && (
                <span className="ml-2 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                  detecting…
                </span>
              )}
            </label>
            <div className="relative">
              <select
                value={country}
                onChange={e => { handleCountryChange(e.target.value); setError(null) }}
                className="w-full appearance-none rounded-xl border px-3 py-3 pr-9 text-sm outline-none"
                style={selectStyle}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fd-muted)' }} />
            </div>
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              Currency
            </label>
            <div className="relative">
              <select
                value={currency}
                onChange={e => { setCurrency(e.target.value); setError(null) }}
                className="w-full appearance-none rounded-xl border px-3 py-3 pr-9 text-sm outline-none"
                style={selectStyle}
              >
                {['USD','LBP','AED','SAR','KWD','QAR','BHD','OMR','JOD','EGP','GBP','EUR','CAD','AUD','CHF','INR','SGD','PKR','MYR','NGN','ZAR'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fd-muted)' }} />
            </div>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Used for all invoices and payments
            </p>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-opacity active:scale-[0.98]"
            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
          >
            Continue →
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 2: WhatsApp ─────────────────────────────────────────────────────────

type PairingState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'waiting'; conn: WhatsAppConnection }
  | { phase: 'connected'; conn: WhatsAppConnection }
  | { phase: 'error'; message: string }

function WhatsAppStep({ onDone }: { onDone: () => void }) {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const [phone, setPhone] = useState('')
  const [state, setState] = useState<PairingState>({ phase: 'idle' })
  const [isPending, startTransition] = useTransition()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(() => {
      startTransition(async () => {
        const result = await pollWhatsAppStatus()
        if (!result.success) return
        const conn = result.data
        if (conn.status === 'connected') {
          stopPolling()
          setState({ phase: 'connected', conn })
          setTimeout(() => onDoneRef.current(), 1800)
        } else {
          setState(prev => prev.phase === 'waiting' ? { phase: 'waiting', conn } : prev)
        }
      })
    }, 4000)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  function handleRequest() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) { toast.error('Enter your WhatsApp phone number first.'); return }
    setState({ phase: 'requesting' })
    startTransition(async () => {
      const result = await connectWithPairingCode(phone)
      if (!result.success) {
        setState({ phase: 'error', message: result.error ?? 'Failed to get pairing code.' })
        return
      }
      const conn = result.data
      if (!conn.pairingCode) {
        setState({ phase: 'error', message: 'No pairing code returned. Make sure the number is active on WhatsApp.' })
        return
      }
      setState({ phase: 'waiting', conn })
      startPolling()
    })
  }

  function handleRetry() { stopPolling(); setState({ phase: 'idle' }) }

  const busy = isPending || state.phase === 'requesting'

  return (
    <div className="space-y-6">
      <StepHeader
        step={2}
        title="Connect WhatsApp"
        subtitle="Send invoices and payment reminders directly from your WhatsApp number."
      />

      {(state.phase === 'idle' || state.phase === 'error') && (
        <div
          className="rounded-2xl border p-5 space-y-5"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          {state.phase === 'error' && (
            <p
              className="text-sm rounded-xl px-3 py-2"
              style={{ color: 'var(--fd-red)', backgroundColor: 'rgba(232,92,106,0.08)', border: '1px solid rgba(232,92,106,0.2)' }}
            >
              {state.message}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              WhatsApp phone number
            </label>
            <div
              className="flex items-center rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
            >
              <span
                className="px-3 py-3 text-sm font-medium select-none border-r"
                style={{ color: 'var(--fd-muted)', borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
              >
                +961
              </span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="71 234 567"
                className="flex-1 bg-transparent px-3 py-3 text-sm outline-none"
                style={{ color: 'var(--fd-text)' }}
                onKeyDown={e => e.key === 'Enter' && handleRequest()}
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              The number linked to your WhatsApp account
            </p>
          </div>

          <button
            onClick={handleRequest}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
          >
            {busy
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Getting code…</>
              : <><MessageCircle className="h-4 w-4" /> Get Pairing Code</>
            }
          </button>
        </div>
      )}

      {state.phase === 'requesting' && (
        <div
          className="rounded-2xl border p-5 flex items-center gap-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <Loader2 className="h-5 w-5 animate-spin shrink-0" style={{ color: 'var(--fd-accent)' }} />
          <p className="text-sm" style={{ color: 'var(--fd-text)' }}>Generating your pairing code…</p>
        </div>
      )}

      {state.phase === 'waiting' && state.conn.pairingCode && (
        <div className="space-y-4">
          <div
            className="rounded-2xl border p-5 space-y-4"
            style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-center" style={{ color: 'var(--fd-muted)' }}>
              Your pairing code
            </p>

            <div
              className="rounded-2xl border-2 px-6 py-5 text-center"
              style={{ borderColor: 'var(--fd-accent)', backgroundColor: 'rgba(99,102,241,0.06)' }}
            >
              <span
                className="text-4xl font-black tabular-nums"
                style={{ color: 'var(--fd-accent)', letterSpacing: '0.3em' }}
              >
                {formatPairingCode(state.conn.pairingCode)}
              </span>
            </div>

            <ol className="space-y-2 text-sm" style={{ color: 'var(--fd-text)' }}>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}>1</span>
                Open <strong>WhatsApp</strong> on your phone
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}>2</span>
                Go to <strong>Settings → Linked Devices → Link a Device</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}>3</span>
                Tap <strong>&ldquo;Link with phone number&rdquo;</strong> and enter the code above
              </li>
            </ol>

            <div className="flex items-center gap-2 pt-1">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--fd-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                Waiting for you to enter the code… (expires in ~60 s)
              </p>
            </div>
          </div>

          <button
            onClick={handleRetry}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgba(138,143,168,0.1)', color: 'var(--fd-text)' }}
          >
            <RefreshCw className="h-4 w-4" /> Get a new code
          </button>
        </div>
      )}

      {state.phase === 'connected' && (
        <div
          className="rounded-2xl border p-5 flex items-center gap-3"
          style={{ backgroundColor: 'rgba(78,203,160,0.08)', borderColor: 'rgba(78,203,160,0.3)' }}
        >
          <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: 'var(--fd-green)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-green)' }}>WhatsApp connected!</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--fd-muted)' }}>Setting up your workspace next…</p>
          </div>
        </div>
      )}

      {state.phase !== 'connected' && (
        <button
          onClick={onDone}
          className="w-full text-center text-sm py-1 transition-opacity hover:opacity-70"
          style={{ color: 'var(--fd-muted)' }}
        >
          Skip for now →
        </button>
      )}
    </div>
  )
}

// ─── Step 3: Workspace ───────────────────────────────────────────────────────

function WorkspaceStep({
  initialRecord: initialRecordProp,
  profile,
  onDone,
}: {
  initialRecord: InitialRecord | null
  profile: ProfileData
  onDone: () => void
}) {
  const [record, setRecord] = useState<InitialRecord | null>(initialRecordProp)
  const [startError, setStartError] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (record !== null || startedRef.current) return
    startedRef.current = true

    fetch('/api/workspace/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName: profile.businessName, country: profile.country, currency: profile.currency }),
      cache: 'no-store',
    })
      .then(async res => {
        const body = (await res.json()) as Partial<JobStatusResponse> & { error?: string }
        if (!res.ok) {
          setStartError(body.error ?? 'Failed to start workspace setup.')
          return
        }
        setRecord({ jobId: body.jobId!, status: body.status ?? 'queued' })
      })
      .catch(err => {
        setStartError(err instanceof Error ? err.message : 'Network error.')
      })
  }, [record, profile.businessName, profile.country, profile.currency])

  return (
    <div className="space-y-6">
      <StepHeader
        step={3}
        title="Setting up your workspace"
        subtitle={`Creating your ERP workspace${profile.businessName ? ` for "${profile.businessName}"` : ''}. This usually takes 1–2 minutes.`}
      />
      {startError ? (
        <div
          className="rounded-2xl border p-4 text-sm"
          style={{ color: 'var(--fd-red)', borderColor: 'rgba(232,92,106,0.3)', backgroundColor: 'rgba(232,92,106,0.06)' }}
        >
          {startError}
          <button
            className="mt-3 block text-xs underline"
            onClick={() => { startedRef.current = false; setStartError(null) }}
          >
            Try again
          </button>
        </div>
      ) : !record ? (
        <div className="flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: 'var(--fd-border)' }}>
          <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--fd-accent)' }} />
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>Initialising your workspace…</p>
        </div>
      ) : (
        <ProvisioningStatus initialRecord={record} onComplete={onDone} />
      )}
    </div>
  )
}

// ─── Shared step header ───────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--fd-accent)' }}>
        Step {step} of 3
      </p>
      <h1 className="text-2xl font-bold" style={{ color: 'var(--fd-text)' }}>{title}</h1>
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>{subtitle}</p>
    </div>
  )
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function StepDots({ current }: { current: Step }) {
  const steps: Step[] = ['profile', 'whatsapp', 'workspace']
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map(s => (
        <span
          key={s}
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: s === current ? '1.5rem' : '0.5rem',
            backgroundColor: s === current ? 'var(--fd-accent)' : 'var(--fd-border)',
          }}
        />
      ))}
    </div>
  )
}

// ─── Wizard root ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ initialRecord, provisioningDone, whatsappDone }: OnboardingWizardProps) {
  const router = useRouter()

  // Jump to workspace if provisioning already started (profile + WhatsApp steps already done)
  const [step, setStep] = useState<Step>(initialRecord !== null ? 'workspace' : 'profile')
  const [profile, setProfile] = useState<ProfileData>({ trainerName: '', businessName: '', country: 'LB', currency: 'USD' })

  useEffect(() => {
    if (provisioningDone && whatsappDone) router.replace('/dashboard')
  }, [provisioningDone, whatsappDone, router])

  function handleProfileDone(data: ProfileData) {
    setProfile(data)
    // Sync confirmed trainer name back to auth user record (fire-and-forget)
    if (data.trainerName) {
      void authClient.updateUser({ name: data.trainerName })
    }
    setStep('whatsapp')
  }

  function handleWhatsAppDone() {
    setStep('workspace')
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12 gap-8">
      <p className="text-center text-2xl font-bold tracking-tight" style={{ color: 'var(--fd-accent)' }}>
        FitDesk
      </p>

      <StepDots current={step} />

      {step === 'profile' && (
        <ProfileStep onDone={handleProfileDone} />
      )}

      {step === 'whatsapp' && (
        <WhatsAppStep onDone={handleWhatsAppDone} />
      )}

      {step === 'workspace' && (
        <WorkspaceStep
          initialRecord={initialRecord}
          profile={profile}
          onDone={() => router.replace('/dashboard')}
        />
      )}
    </main>
  )
}
