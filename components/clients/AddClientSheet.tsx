'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Sparkles, X } from 'lucide-react'
import { parsePhoneNumber, getCountryCallingCode } from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'
import { toast } from 'sonner'
import { addClient, findClientDuplicates, parseClientDetails } from '@/actions/clients'
import { PhoneInput, type PhoneValue } from '@/components/ui/PhoneInput'
import { AgeInput, type AgeValue } from '@/components/ui/AgeInput'
import { GoalMultiSelect, type SubGoalsMap } from '@/components/ui/GoalMultiSelect'
import type { Client } from '@/types'
import type { AiParseState, BillingMode, DuplicateClientMatch } from '@/types/clients'

function e164ToPhoneValue(e164: string, hasWhatsApp: boolean): PhoneValue | null {
  try {
    const parsed = parsePhoneNumber(e164)
    if (!parsed?.country) return null
    const cc = '+' + getCountryCallingCode(parsed.country as CountryCode)
    return {
      phone_country:      parsed.country,
      phone_country_code: cc,
      phone_number:       String(parsed.nationalNumber),
      phone_full:         e164,
      has_whatsapp:       hasWhatsApp,
    }
  } catch {
    return null
  }
}

type AddClientOptions = NonNullable<Parameters<typeof addClient>[1]>

interface AddClientSheetProps {
  open:    boolean
  onClose: () => void
}

export function AddClientSheet({ open, onClose }: AddClientSheetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name,        setName]        = useState('')
  const [phoneValue,  setPhoneValue]  = useState<PhoneValue | undefined>()
  const [ageValue,    setAgeValue]    = useState<AgeValue>({})
  const [goals,       setGoals]       = useState<string[]>([])
  const [subGoals,    setSubGoals]    = useState<SubGoalsMap>({})
  const [notes,       setNotes]       = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [isDesktop,   setIsDesktop]   = useState(false)

  const [billingMode, setBillingMode] = useState<BillingMode>('unset')
  const [ppsRate,     setPpsRate]     = useState('')

  const [error,            setError]            = useState<string | null>(null)
  const [createdClient,    setCreatedClient]    = useState<Client | null>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateClientMatch[] | null>(null)
  const [overrideReason,   setOverrideReason]   = useState('')
  const [aiOpen,    setAiOpen]    = useState(false)
  const [aiRawText, setAiRawText] = useState('')
  const [aiState,   setAiState]   = useState<AiParseState>('idle')

  const nameRef = useRef<HTMLInputElement>(null)

  // Detect desktop viewport (lg = 1024px)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Escape key closes
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus name field after sheet animates in
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => nameRef.current?.focus(), 60)
    return () => clearTimeout(id)
  }, [open])

  // Reset all form state after the close animation finishes
  useEffect(() => {
    if (open) return
    const id = setTimeout(() => {
      setName('')
      setPhoneValue(undefined)
      setAgeValue({})
      setGoals([])
      setSubGoals({})
      setNotes('')
      setDetailsOpen(false)
      setError(null)
      setCreatedClient(null)
      setDuplicateMatches(null)
      setOverrideReason('')
      setBillingMode('unset')
      setPpsRate('')
      setAiOpen(false)
      setAiRawText('')
      setAiState('idle')
    }, 350)
    return () => clearTimeout(id)
  }, [open])

  function resetFormForAnother() {
    setCreatedClient(null)
    setName('')
    setPhoneValue(undefined)
    setAgeValue({})
    setGoals([])
    setSubGoals({})
    setNotes('')
    setDetailsOpen(false)
    setError(null)
    setDuplicateMatches(null)
    setOverrideReason('')
    setBillingMode('unset')
    setPpsRate('')
    setAiOpen(false)
    setAiRawText('')
    setAiState('idle')
    setTimeout(() => nameRef.current?.focus(), 60)
  }

  function buildPayload() {
    let trainerNotes = notes.trim()
    const ageParts: string[] = []
    if (ageValue.age) ageParts.push(`Age: ${ageValue.age}`)
    if (ageValue.date_of_birth) ageParts.push(`DOB: ${ageValue.date_of_birth}`)
    if (ageParts.length > 0) {
      trainerNotes = `${ageParts.join(' | ')}${trainerNotes ? '\n' + trainerNotes : ''}`
    }

    const fitnessGoalStr = goals.length > 0
      ? JSON.stringify(goals.map(g => ({ label: g, value: g })))
      : undefined

    const parsedRate = billingMode === 'pay_per_session' ? parseFloat(ppsRate) : NaN

    return {
      customer_name:               name.trim(),
      customer_type:               'Individual',
      customer_group:              'Individual',
      territory:                   'All Territories',
      mobile_no:                   phoneValue?.phone_full ?? '',
      custom_fitness_goals:        fitnessGoalStr,
      custom_trainer_notes:        trainerNotes || undefined,
      status:                      'Active' as const,
      ...(billingMode === 'pay_per_session' && !isNaN(parsedRate) && parsedRate > 0
        ? { custom_default_session_rate: parsedRate }
        : {}),
    }
  }

  async function runCreate(options?: AddClientOptions) {
    const result = await addClient(buildPayload(), {
      ...options,
      whatsappEnabled: phoneValue?.has_whatsapp ?? false,
      billingMode:     billingMode !== 'unset' ? billingMode : undefined,
    })
    if (result.success) {
      toast.success(`${result.data.name} added to your roster.`)
      setCreatedClient(result.data)
      router.refresh()
    } else {
      setDuplicateMatches(null)
      setError(result.error)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Full name is required.')
      return
    }
    if (!phoneValue?.phone_number) {
      setError('Phone number is required.')
      return
    }

    startTransition(async () => {
      const dup = await findClientDuplicates(phoneValue?.phone_full ?? '')
      if (dup.success && dup.data.length > 0) {
        setOverrideReason('')
        setDuplicateMatches(dup.data)
        return
      }
      await runCreate()
    })
  }

  function handleContinueAnyway() {
    const reason = overrideReason.trim()
    if (!reason || !duplicateMatches || duplicateMatches.length === 0) return
    const match = duplicateMatches[0]
    setError(null)
    startTransition(async () => {
      await runCreate({
        overrideDuplicate:         true,
        duplicateOverrideReason:   reason,
        possibleDuplicateClientId: match.clientIndexId,
      })
    })
  }

  function handleExtractDetails() {
    if (!aiRawText.trim() || isPending) return
    setAiState('parsing')
    setError(null)
    startTransition(async () => {
      const result = await parseClientDetails(aiRawText)
      if (!result.success || result.data.state === 'failed' || result.data.state === 'timeout') {
        setAiState(result.success ? result.data.state : 'failed')
        toast.error("Couldn't read that — please fill the form manually.")
        return
      }
      const { state, fields } = result.data
      if (fields.fullName.value) setName(fields.fullName.value)
      if (fields.phone.value) {
        const pv = e164ToPhoneValue(fields.phone.value, fields.whatsappEnabled.value ?? true)
        if (pv) setPhoneValue(pv)
      }
      if (fields.goals.value && fields.goals.value.length > 0) setGoals(fields.goals.value)
      if (fields.notes.value) setNotes(prev => prev || fields.notes.value!)
      setAiState(state)
    })
  }

  // ── Responsive positioning ──────────────────────────────────────────────────
  // Mobile: slide up from bottom. Desktop (lg+): slide in from right.

  const containerClass = isDesktop
    ? 'fixed top-0 right-0 z-50 flex h-full w-full max-w-[460px] flex-col border-l rounded-l-[20px]'
    : 'fixed bottom-0 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 flex-col rounded-t-[28px] border-t'

  const containerStyle: React.CSSProperties = {
    backgroundColor: 'var(--fd-surface)',
    borderColor:     'var(--fd-border)',
    transition:      'transform 300ms cubic-bezier(0.32,0.72,0,1)',
    ...(isDesktop
      ? { transform: `translateX(${open ? '0%' : '100%'})` }
      : {
          transform: `translateX(-50%) translateY(${open ? '0%' : '100%'})`,
          maxHeight: '90dvh',
        }
    ),
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(15,23,42,0.55)',
          opacity:          open ? 1 : 0,
          pointerEvents:    open ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />

      {/* Sheet / Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add client"
        className={containerClass}
        style={containerStyle}
      >
        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
          </div>
        )}

        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            {createdClient ? 'Client added' : 'Add client'}
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

        {/* ── Success state ─────────────────────────────────────────────────── */}
        {createdClient ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(78,203,160,0.12)', border: '2px solid rgba(78,203,160,0.3)' }}
            >
              <CheckCircle2 className="h-10 w-10" style={{ color: 'var(--fd-green)' }} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
                {createdClient.name}
              </h3>
              <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                Added to your roster
              </p>
            </div>

            <div className="w-full space-y-3 mt-2">
              <Link
                href={`/dashboard/clients/${encodeURIComponent(createdClient.id)}`}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-opacity active:opacity-70"
                style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
              >
                View profile
              </Link>

              {/* Navigational next steps — no state mutations, no auto-actions */}
              <div
                className="rounded-2xl border divide-y text-sm"
                style={{ borderColor: 'var(--fd-border)' }}
              >
                <Link
                  href={`/dashboard/schedule/new?client=${encodeURIComponent(createdClient.id)}`}
                  className="flex items-center justify-between px-4 py-3 transition-opacity active:opacity-70"
                  style={{ color: 'var(--fd-text)' }}
                >
                  <span>Book first session</span>
                  <span style={{ color: 'var(--fd-muted)' }}>→</span>
                </Link>
                <Link
                  href={`/dashboard/messages/${encodeURIComponent(createdClient.id)}`}
                  className="flex items-center justify-between px-4 py-3 transition-opacity active:opacity-70"
                  style={{ color: 'var(--fd-text)' }}
                >
                  <span>Send WhatsApp welcome</span>
                  <span style={{ color: 'var(--fd-muted)' }}>→</span>
                </Link>
                <Link
                  href={`/dashboard/clients/${encodeURIComponent(createdClient.id)}`}
                  className="flex items-center justify-between px-4 py-3 transition-opacity active:opacity-70"
                  style={{ color: 'var(--fd-text)' }}
                >
                  <span>Set up billing</span>
                  <span style={{ color: 'var(--fd-muted)' }}>→</span>
                </Link>
              </div>

              <button
                type="button"
                onClick={resetFormForAnother}
                className="w-full rounded-xl border py-3 text-sm font-semibold transition-opacity active:opacity-60"
                style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
              >
                Add another
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-sm transition-opacity active:opacity-60"
                style={{ color: 'var(--fd-muted)' }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* ── Form ─────────────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Possible-duplicate warning */}
              {duplicateMatches && duplicateMatches.length > 0 && (
                <div
                  role="alertdialog"
                  aria-label="Possible duplicate client"
                  className="rounded-2xl border p-4 space-y-3"
                  style={{ backgroundColor: 'rgba(232,92,106,0.06)', borderColor: 'rgba(232,92,106,0.3)' }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-red)' }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                        Possible duplicate found
                      </p>
                      <p className="mt-0.5 truncate text-sm" style={{ color: 'var(--fd-muted)' }}>
                        {duplicateMatches[0].fullName} — {duplicateMatches[0].phoneE164}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/clients/${encodeURIComponent(duplicateMatches[0].erpCustomerId)}`}
                    className="block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-opacity active:opacity-70"
                    style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
                  >
                    Open existing client
                  </Link>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                      Reason to add anyway (required)
                    </label>
                    <input
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="e.g. Different person, same household number"
                      className="input-base"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setDuplicateMatches(null); setOverrideReason('') }}
                      className="flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-opacity active:opacity-60"
                      style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleContinueAnyway}
                      disabled={isPending || overrideReason.trim() === ''}
                      className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: 'var(--fd-red)', color: 'var(--fd-bg)' }}
                    >
                      {isPending ? 'Adding…' : 'Continue anyway'}
                    </button>
                  </div>
                </div>
              )}

              {/* AI parse review banners */}
              {aiState === 'partial_success' && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(78,203,160,0.08)',
                    border:          '1px solid rgba(78,203,160,0.25)',
                    color:           'var(--fd-green)',
                  }}
                >
                  Details filled in — please review before saving.
                </div>
              )}
              {aiState === 'low_confidence' && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(232,197,71,0.08)',
                    border:          '1px solid rgba(232,197,71,0.35)',
                  }}
                >
                  <p className="font-semibold" style={{ color: '#d4a017' }}>
                    Low confidence — please double-check everything before saving.
                  </p>
                </div>
              )}

              {/* Full name */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                  Full name
                  <span className="ml-1 text-xs font-normal" style={{ color: 'var(--fd-red)' }}>
                    {' '}*
                  </span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(null) }}
                  placeholder="e.g. Sara Khoury"
                  className="input-base"
                  autoComplete="name"
                />
              </div>

              {/* Phone + WhatsApp toggle */}
              <PhoneInput
                value={phoneValue}
                onChange={v => { setPhoneValue(v); setError(null) }}
                label="Phone"
                required
                showWhatsApp
              />

              {/* Progressive disclosure */}
              <div>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(p => !p)}
                  className="flex w-full items-center justify-between border-t pt-4 text-sm font-medium transition-opacity active:opacity-60"
                  style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
                >
                  Add more details
                  <ChevronDown
                    className="h-4 w-4 transition-transform duration-200"
                    style={{
                      color:     'var(--fd-muted)',
                      transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </button>

                {detailsOpen && (
                  <div className="pt-5 space-y-5">
                    <GoalMultiSelect
                      goals={goals}
                      subGoals={subGoals}
                      onGoalsChange={setGoals}
                      onSubGoalsChange={setSubGoals}
                    />

                    <AgeInput value={ageValue} onChange={setAgeValue} />

                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                        Trainer notes
                        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                          (optional)
                        </span>
                      </label>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Health notes, goals, context…"
                        rows={3}
                        className="input-base resize-none"
                      />
                    </div>

                    {/* Billing mode */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                        Billing
                        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                          (optional)
                        </span>
                      </label>
                      <div
                        className="flex rounded-xl p-1 gap-1"
                        style={{ backgroundColor: 'var(--fd-card)' }}
                      >
                        {([
                          { value: 'unset',           label: 'Decide later' },
                          { value: 'package',         label: 'Package' },
                          { value: 'pay_per_session', label: 'Per session' },
                        ] as { value: BillingMode; label: string }[]).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setBillingMode(opt.value)}
                            className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
                            style={{
                              backgroundColor: billingMode === opt.value ? 'var(--fd-accent)' : 'transparent',
                              color:           billingMode === opt.value ? 'var(--fd-bg)'     : 'var(--fd-muted)',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {billingMode === 'pay_per_session' && (
                        <div className="space-y-1.5 pt-1">
                          <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                            Default rate per session
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={ppsRate}
                            onChange={e => setPpsRate(e.target.value)}
                            placeholder="e.g. 50"
                            className="input-base"
                          />
                        </div>
                      )}

                      {billingMode === 'package' && (
                        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                          Set up sessions and package details on the client profile.
                        </p>
                      )}
                    </div>

                    {/* Quick add from text */}
                    <div
                      className="rounded-2xl border overflow-hidden"
                      style={{ borderColor: 'var(--fd-border)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setAiOpen(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-opacity active:opacity-70"
                        style={{ backgroundColor: 'var(--fd-surface)', color: 'var(--fd-text)' }}
                        aria-expanded={aiOpen}
                      >
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" style={{ color: 'var(--fd-accent)' }} />
                          Quick add from text
                        </span>
                        <ChevronDown
                          className="h-4 w-4 transition-transform duration-200"
                          style={{
                            color:     'var(--fd-muted)',
                            transform: aiOpen ? 'rotate(180deg)' : 'none',
                          }}
                        />
                      </button>

                      {aiOpen && (
                        <div
                          className="px-4 pb-4 pt-2 space-y-3 border-t"
                          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
                        >
                          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                            Paste your notes and we&apos;ll suggest form fields — review everything before saving.
                          </p>
                          <textarea
                            value={aiRawText}
                            onChange={e => setAiRawText(e.target.value)}
                            rows={3}
                            placeholder="e.g. Sara Ahmad, +961 70 000 000, wants fat loss, prefers WhatsApp"
                            className="input-base resize-none"
                          />
                          <button
                            type="button"
                            onClick={handleExtractDetails}
                            disabled={isPending || !aiRawText.trim()}
                            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
                            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
                          >
                            {aiState === 'parsing'
                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</>
                              : <><Sparkles className="h-4 w-4" /> Extract details</>
                            }
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Inline error */}
              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(232,92,106,0.08)',
                    border:          '1px solid rgba(232,92,106,0.25)',
                    color:           'var(--fd-red)',
                  }}
                >
                  {error}
                </div>
              )}

            </div>

            {/* Footer */}
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
                className="flex-1 rounded-xl border py-3 text-sm font-semibold transition-opacity active:opacity-60"
                style={{
                  borderColor:     'var(--fd-border)',
                  color:           'var(--fd-text)',
                  backgroundColor: 'var(--fd-card)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity active:opacity-60 disabled:opacity-50"
                style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
              >
                {isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                  : 'Create client'
                }
              </button>
            </div>

          </form>
        )}
      </div>
    </>
  )
}
