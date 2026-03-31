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
        first_name: fd.get('first_name') as string,
        last_name: (fd.get('last_name') as string) || undefined,
        mobile_no: (fd.get('mobile_no') as string) || undefined,
        email_id: (fd.get('email_id') as string) || undefined,
        status: fd.get('status') as 'Active' | 'Inactive' | 'Paused',
        goal: (fd.get('goal') as string) || undefined,
        notes: (fd.get('notes') as string) || undefined,
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

  const erpStatus =
    client.status === 'active' ? 'Active' : client.status === 'inactive' ? 'Inactive' : 'Paused'

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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              First name *
            </label>
            <input
              name="first_name"
              required
              defaultValue={client.firstName}
              className="input-base"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              Last name
            </label>
            <input name="last_name" defaultValue={client.lastName ?? ''} className="input-base" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Phone
          </label>
          <input name="mobile_no" type="tel" defaultValue={client.phone} className="input-base" />
        </div>

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
            Goal
          </label>
          <input
            name="goal"
            defaultValue={client.goal ?? ''}
            className="input-base"
            placeholder="e.g. Lose weight, build muscle…"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Notes
          </label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={client.notes ?? ''}
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
