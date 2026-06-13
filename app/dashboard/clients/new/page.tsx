'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { parsePhoneNumber, getCountryCallingCode } from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'
import { toast } from 'sonner'
import { addClient, findClientDuplicates, parseClientDetails } from '@/actions/clients'
import { PhoneInput, type PhoneValue } from '@/components/ui/PhoneInput'
import { AgeInput, type AgeValue } from '@/components/ui/AgeInput'
import { GoalMultiSelect, type SubGoalsMap } from '@/components/ui/GoalMultiSelect'
import type { Client } from '@/types'
import type { AiParseState, DuplicateClientMatch } from '@/types/clients'

// Convert an E.164 phone string to the PhoneValue shape expected by PhoneInput.
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

/** Options accepted by addClient — inferred so no type is exported from the 'use server' file. */
type AddClientOptions = NonNullable<Parameters<typeof addClient>[1]>

// ─── Success state ────────────────────────────────────────────────────────────

function SuccessView({ client }: { client: Client }) {
  const router = useRouter()
  return (
    <div className="flex flex-col min-h-[70vh] p-6">
      <Link
        href="/dashboard/clients"
        className="flex items-center gap-1.5 text-sm self-start mb-8 transition-opacity active:opacity-60"
        style={{ color: 'var(--fd-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      <div className="flex flex-col items-center gap-5 flex-1 justify-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(78,203,160,0.12)', border: '2px solid rgba(78,203,160,0.3)' }}
        >
          <CheckCircle2 className="h-10 w-10" style={{ color: 'var(--fd-green)' }} />
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--fd-text)' }}>
            {client.name}
          </h2>
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            Added to your roster
          </p>
        </div>

        <div className="w-full max-w-xs space-y-3 mt-4">
          <Link
            href={`/dashboard/clients/${encodeURIComponent(client.id)}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-opacity active:opacity-70"
            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
          >
            View client
          </Link>

          <button
            type="button"
            onClick={() => router.push('/dashboard/clients')}
            className="w-full py-3 text-sm transition-opacity active:opacity-60"
            style={{ color: 'var(--fd-muted)' }}
          >
            View all clients →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export default function NewClientPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [phoneValue, setPhoneValue] = useState<PhoneValue | undefined>()
  const [ageValue, setAgeValue] = useState<AgeValue>({})
  const [goals, setGoals] = useState<string[]>([])
  const [subGoals, setSubGoals] = useState<SubGoalsMap>({})
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdClient, setCreatedClient] = useState<Client | null>(null)

  // Phase 6 — possible-duplicate warning state.
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateClientMatch[] | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  // Phase 5 — optional AI parse state.
  const [aiOpen, setAiOpen]       = useState(false)
  const [aiRawText, setAiRawText] = useState('')
  const [aiState, setAiState]     = useState<AiParseState>('idle')

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

    return {
      customer_name: name.trim(),
      customer_type: 'Individual',
      customer_group: 'Individual',
      territory: 'All Territories',
      mobile_no: phoneValue?.phone_full ?? '',
      custom_fitness_goals: fitnessGoalStr,
      custom_trainer_notes: trainerNotes || undefined,
      status: 'Active' as const,
    }
  }

  async function runCreate(options?: AddClientOptions) {
    const result = await addClient(buildPayload(), {
      ...options,
      whatsappEnabled: phoneValue?.has_whatsapp ?? false,
    })
    if (result.success) {
      toast.success(`${result.data.name} added to your roster.`)
      setCreatedClient(result.data)
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
      // Phase 6 — advisory tenant-scoped duplicate check BEFORE ERP creation.
      // Fails open: a check error or no tenant lets creation proceed.
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
        overrideDuplicate: true,
        duplicateOverrideReason: reason,
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
      // Prefill form fields — trainer reviews and can edit everything before submitting.
      if (fields.fullName.value) setName(fields.fullName.value)
      if (fields.phone.value) {
        // hasWhatsApp prefills the PhoneInput toggle; the value flows to the submit payload via runCreate.
        const pv = e164ToPhoneValue(fields.phone.value, fields.whatsappEnabled.value ?? true)
        if (pv) setPhoneValue(pv)
      }
      if (fields.goals.value && fields.goals.value.length > 0) setGoals(fields.goals.value)
      if (fields.notes.value) setNotes(prev => prev || fields.notes.value!)
      setAiState(state)
    })
  }

  if (createdClient) return <SuccessView client={createdClient} />

  return (
    <div className="p-4 pb-10 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/clients"
          className="transition-opacity active:opacity-60"
          style={{ color: 'var(--fd-muted)' }}
          aria-label="Back to clients"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          New Client
        </h1>
      </div>

      {/* Phase 5 — optional AI quick-add (collapsed by default, manual-first) */}
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

      {/* Phase 6 — possible-duplicate warning */}
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

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Full name *
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(null) }}
            placeholder="e.g. Rana Mansour"
            className="input-base"
            autoFocus
          />
        </div>

        <PhoneInput
          defaultCountry="LB"
          value={phoneValue}
          onChange={v => { setPhoneValue(v); setError(null) }}
          label="Phone number"
          required
          hint="Used to send payment links via WhatsApp"
        />

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
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Health conditions, injuries, preferences…"
            className="input-base resize-none"
          />
        </div>

        {error && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(232,92,106,0.08)',
              border: '1px solid rgba(232,92,106,0.25)',
              color: 'var(--fd-red)',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          {isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            : 'Create Client'
          }
        </button>
      </form>
    </div>
  )
}
