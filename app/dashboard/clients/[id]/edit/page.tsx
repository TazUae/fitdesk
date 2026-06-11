'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getClientById, updateClient } from '@/lib/business-data'
import { PhoneInput, type PhoneValue } from '@/components/ui/PhoneInput'
import { parsePhoneNumber } from 'libphonenumber-js'
import type { Client } from '@/types'

function parsePhoneValue(phone: string): PhoneValue | undefined {
  try {
    const p = parsePhoneNumber(phone)
    if (!p?.country || !p.nationalNumber) return undefined
    return {
      phone_country:      p.country,
      phone_country_code: '+' + p.countryCallingCode,
      phone_number:       String(p.nationalNumber),
      phone_full:         p.number as string,
      has_whatsapp:       true,
    }
  } catch {
    return undefined
  }
}

type Props = { params: { id: string } }

export default function EditClientPage({ params }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [client, setClient] = useState<Client | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [phoneValue, setPhoneValue] = useState<PhoneValue | undefined>()
  const [goal, setGoal] = useState('')
  const [notes, setNotes] = useState('')

  const clientId = decodeURIComponent(params.id)

  useEffect(() => {
    getClientById(clientId).then(result => {
      if (result.success) {
        setClient(result.data)
        setGoal(result.data.goal ?? '')
        setNotes(result.data.notes ?? '')
        if (result.data.phone) setPhoneValue(parsePhoneValue(result.data.phone))
      } else {
        setFetchError(result.error)
      }
      setLoading(false)
    })
  }, [clientId])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateClient(clientId, {
        customer_name: fd.get('customer_name') as string,
        mobile_no: phoneValue?.phone_full || undefined,
        email_id: (fd.get('email_id') as string) || undefined,
        status: fd.get('status') as 'Active' | 'Inactive' | 'Paused',
        custom_fitness_goals: (fd.get('custom_fitness_goals') as string) || undefined,
        custom_trainer_notes: (fd.get('custom_trainer_notes') as string) || undefined,
      })

      if (result.success) {
        toast.success('Client updated')
        router.push(`/dashboard/clients/${encodeURIComponent(clientId)}`)
      } else {
        setSubmitError(result.error)
      }
    })
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-xl"
            style={{ backgroundColor: 'var(--fd-card)' }}
          />
        ))}
      </div>
    )
  }

  if (!client) {
    return (
      <div className="p-4">
        <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
          {fetchError ?? 'Client not found'}
        </p>
      </div>
    )
  }

  const erpStatus =
    client.status === 'active' ? 'Active' : client.status === 'inactive' ? 'Inactive' : 'Paused'

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/clients/${encodeURIComponent(clientId)}`} style={{ color: 'var(--fd-muted)' }}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          Edit Client
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Full name *
          </label>
          <input
            name="customer_name"
            required
            defaultValue={client.name}
            className="input-base"
          />
        </div>

        <PhoneInput
          defaultCountry="LB"
          value={phoneValue}
          onChange={setPhoneValue}
          label="Phone"
          hint=""
          showWhatsApp={false}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Email
          </label>
          <input
            name="email_id"
            type="email"
            defaultValue={client.email ?? ''}
            className="input-base"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Status
          </label>
          <select name="status" defaultValue={erpStatus} className="input-base">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Paused">Paused</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Goals
          </label>
          <input
            name="custom_fitness_goals"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            className="input-base"
            placeholder="e.g. Lose weight, build muscle…"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Trainer notes
          </label>
          <textarea
            name="custom_trainer_notes"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="input-base resize-none"
          />
        </div>

        {submitError && (
          <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl py-3 text-sm font-bold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
