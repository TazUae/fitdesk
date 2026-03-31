'use client'

import { Suspense, useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { bookSession, getClients } from '@/lib/business-data'
import type { Client } from '@/types'

function NewSessionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClientId = searchParams.get('client') ?? ''

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    getClients().then(res => {
      if (res.success) setClients(res.data)
    })
  }, [])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const clientId = fd.get('client_id') as string
    const date = fd.get('session_date') as string
    const rawTime = fd.get('session_time') as string
    const rawDuration = fd.get('duration') as string

    if (!clientId) { setError('Please select a client'); return }
    if (!date) { setError('Please select a date'); return }

    startTransition(async () => {
      const result = await bookSession({
        client: clientId,
        session_date: date,
        session_time: rawTime ? `${rawTime}:00` : undefined,
        duration: rawDuration ? Number(rawDuration) : undefined,
        notes: (fd.get('notes') as string) || undefined,
      })

      if (result.success) {
        toast.success('Session scheduled')
        router.push('/dashboard/schedule')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/schedule" style={{ color: 'var(--fd-muted)' }}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          Schedule Session
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Client *
          </label>
          <select
            name="client_id"
            defaultValue={preselectedClientId}
            required
            className="input-base"
          >
            <option value="">Select client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              Date *
            </label>
            <input
              name="session_date"
              type="date"
              min={today}
              defaultValue={today}
              required
              className="input-base"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              Time
            </label>
            <input name="session_time" type="time" className="input-base" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Duration (minutes)
          </label>
          <input
            name="duration"
            type="number"
            min="15"
            max="180"
            step="15"
            placeholder="60"
            className="input-base"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Notes
          </label>
          <textarea
            name="notes"
            rows={2}
            className="input-base resize-none"
            placeholder="Optional session notes"
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl py-3 text-sm font-bold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          {isPending ? 'Scheduling…' : 'Schedule Session'}
        </button>
      </form>
    </div>
  )
}

export default function NewSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm" style={{ color: 'var(--fd-muted)' }}>
          Loading…
        </div>
      }
    >
      <NewSessionForm />
    </Suspense>
  )
}
