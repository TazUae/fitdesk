'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getClientById, updateClient } from '@/lib/business-data'
import type { Client } from '@/types'

type Props = { params: { id: string } }

export default function EditClientPage({ params }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [client, setClient] = useState<Client | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClientById(params.id).then(result => {
      if (result.success) setClient(result.data)
      else setFetchError(result.error)
      setLoading(false)
    })
  }, [params.id])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateClient(params.id, {
        customer_name: (fd.get('customer_name') as string) || undefined,
        mobile_no: (fd.get('mobile_no') as string) || undefined,
        custom_fitness_goals: (fd.get('custom_fitness_goals') as string) || undefined,
        custom_trainer_notes: (fd.get('custom_trainer_notes') as string) || undefined,
        custom_package_type: (fd.get('custom_package_type') as string || undefined) as
          'Per Session' | 'Monthly' | 'Package' | undefined,
      })

      if (result.success) {
        toast.success('Client updated')
        router.push(`/dashboard/clients/${params.id}`)
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

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/clients/${params.id}`} style={{ color: 'var(--fd-muted)' }}>
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

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Phone
          </label>
          <input
            name="mobile_no"
            type="tel"
            defaultValue={client.mobile ?? ''}
            className="input-base"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Package type
          </label>
          <select
            name="custom_package_type"
            defaultValue={client.packageType ?? ''}
            className="input-base"
          >
            <option value="">— None —</option>
            <option value="Per Session">Per Session</option>
            <option value="Monthly">Monthly</option>
            <option value="Package">Package</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Fitness goals
          </label>
          <input
            name="custom_fitness_goals"
            defaultValue={client.fitnessGoals ?? ''}
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
            defaultValue={client.trainerNotes ?? ''}
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
