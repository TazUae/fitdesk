'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Camera, CheckCircle2, ChevronDown, Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { addClient } from '@/actions/clients'
import { Avatar } from '@/components/modules/Avatar'
import { PhoneInput, type PhoneValue } from '@/components/ui/PhoneInput'
import { AgeInput, type AgeValue } from '@/components/ui/AgeInput'
import { MultiGoalSelector } from '@/components/ui/MultiGoalSelector'
import type { GoalSelection } from '@/utils/goalHelpers'
import type { Client } from '@/types'

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: 'var(--fd-red)' }}>*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{hint}</p>
      )}
    </div>
  )
}

// ─── Success state ────────────────────────────────────────────────────────────

function SuccessView({ client }: { client: Client }) {
  const router = useRouter()
  return (
    <div className="flex flex-col min-h-[70vh] p-6">

      {/* Back */}
      <Link
        href="/dashboard/clients"
        className="flex items-center gap-1.5 text-sm self-start mb-8 transition-opacity active:opacity-60"
        style={{ color: 'var(--fd-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      {/* Checkmark + name */}
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

        {/* Quick actions */}
        <div className="w-full max-w-xs space-y-3 mt-4">
          <Link
            href={`/dashboard/schedule?clientId=${encodeURIComponent(client.id)}`}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-bold transition-opacity active:opacity-70"
            style={{ backgroundColor: '#00C853', color: '#0F1117' }}
          >
            <Calendar className="h-5 w-5" />
            Book a session
          </Link>

          <Link
            href={`/dashboard/invoices/new?clientId=${encodeURIComponent(client.id)}&clientName=${encodeURIComponent(client.name)}`}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border py-4 text-sm font-bold transition-opacity active:opacity-70"
            style={{
              backgroundColor: 'var(--fd-surface)',
              borderColor:     'var(--fd-border)',
              color:           'var(--fd-text)',
            }}
          >
            <Receipt className="h-5 w-5" style={{ color: 'var(--fd-accent)' }} />
            Send payment link
          </Link>

          <button
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewClientPage() {
  const [isPending, startTransition] = useTransition()

  const [name,        setName]        = useState('')
  const [phoneValue,  setPhoneValue]  = useState<PhoneValue | undefined>()
  const [goals,       setGoals]       = useState<GoalSelection[]>([])
  const [ageValue,    setAgeValue]    = useState<AgeValue>({})
  const [bloodType,   setBloodType]   = useState('')
  const [ecName,      setEcName]      = useState('')
  const [ecPhone,     setEcPhone]     = useState<PhoneValue | undefined>()
  const [notes,       setNotes]       = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [showMedical, setShowMedical] = useState(false)

  const [createdClient, setCreatedClient] = useState<Client | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim())              { setError('Full name is required.');    return }
    if (!phoneValue?.phone_number) { setError('Phone number is required.'); return }

    // Prepend age / DOB to trainer notes if provided
    let trainerNotes = notes.trim()
    const ageParts: string[] = []
    if (ageValue.age)           ageParts.push(`Age: ${ageValue.age}`)
    if (ageValue.date_of_birth) ageParts.push(`DOB: ${ageValue.date_of_birth}`)
    if (ageParts.length > 0) {
      trainerNotes = `${ageParts.join(' | ')}${trainerNotes ? '\n' + trainerNotes : ''}`
    }

    startTransition(async () => {
      // Serialize goals for ERPNext
      const fitnessGoalStr = goals.length > 0
        ? JSON.stringify(goals.map(g => ({ goal_type: g.type, focuses: g.focuses })))
        : undefined

      const result = await addClient({
        customer_name:                  name.trim(),
        customer_type:                  'Individual',
        customer_group:                 'Individual',
        territory:                      'All Territories',
        mobile_no:                      phoneValue?.phone_full ?? '',
        custom_fitness_goals:           fitnessGoalStr,
        custom_trainer_notes:           trainerNotes || undefined,
        custom_blood_type:              bloodType || undefined,
        custom_emergency_contact_name:  ecName.trim() || undefined,
        custom_emergency_contact_phone: ecPhone?.phone_full || undefined,
      })

      if (result.success) {
        toast.success(`${result.data.name} added to your roster.`)
        setCreatedClient(result.data)
      } else {
        setError(result.error)
      }
    })
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (createdClient) return <SuccessView client={createdClient} />

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 pb-10 space-y-6">

      {/* Header */}
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

      {/* Profile photo area */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <div className="relative">
          <Avatar name={name.trim() || 'NC'} size="xl" />
          {/* "Add photo" gradient overlay */}
          <div
            className="absolute inset-0 rounded-full flex flex-col items-center justify-end pb-2 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)' }}
          >
            <Camera className="h-3.5 w-3.5 text-white mb-0.5" />
            <span className="text-[9px] font-semibold text-white leading-none">Add photo</span>
          </div>
        </div>
        {name.trim() && (
          <p className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>
            {name.trim()}
          </p>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Full name */}
        <Field label="Full name" required>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(null) }}
            placeholder="e.g. Rana Mansour"
            className="input-base"
            autoFocus
          />
        </Field>

        {/* Phone */}
        <PhoneInput
          defaultCountry="LB"
          value={phoneValue}
          onChange={v => { setPhoneValue(v); setError(null) }}
          label="Phone number"
          required
          hint="Used to send payment links via WhatsApp"
        />

        {/* Fitness goals */}
        <MultiGoalSelector
          value={goals}
          onChange={setGoals}
        />

        {/* Age / Date of birth */}
        <AgeInput value={ageValue} onChange={setAgeValue} />

        {/* Medical & Emergency — collapsible optional section */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowMedical(v => !v)}
            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--fd-muted)' }}
          >
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: showMedical ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
            {showMedical ? 'Hide' : '+'} Medical &amp; emergency contact (optional)
          </button>

          {showMedical && (
            <div className="space-y-4 rounded-2xl border p-4"
              style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
            >
              {/* Blood type */}
              <Field label="Blood type">
                <div className="relative">
                  <select
                    value={bloodType}
                    onChange={e => setBloodType(e.target.value)}
                    className="w-full appearance-none rounded-xl border px-3 py-3 pr-9 text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--fd-surface)',
                      borderColor:     'var(--fd-border)',
                      color:           bloodType ? 'var(--fd-text)' : 'var(--fd-muted)',
                    }}
                  >
                    <option value="">Select blood type</option>
                    {['A+','A−','B+','B−','AB+','AB−','O+','O−'].map(bt => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: 'var(--fd-muted)' }}
                  />
                </div>
              </Field>

              {/* Emergency contact */}
              <Field label="Emergency contact name">
                <input
                  type="text"
                  value={ecName}
                  onChange={e => setEcName(e.target.value)}
                  placeholder="e.g. Sara Mansour"
                  className="input-base"
                />
              </Field>

              <PhoneInput
                defaultCountry="LB"
                value={ecPhone}
                onChange={setEcPhone}
                label="Emergency contact phone"
                showWhatsApp={false}
                hint=""
              />
            </div>
          )}
        </div>

        {/* Trainer notes */}
        <Field label="Trainer notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Health conditions, injuries, preferences…"
            className="input-base resize-none"
          />
        </Field>

        {/* Error */}
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

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-opacity disabled:opacity-50 active:scale-[0.98]"
          style={{ backgroundColor: '#00C853', color: '#0F1117' }}
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
