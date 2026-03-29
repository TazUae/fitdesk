'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { addClient } from '@/actions/clients'

export default function NewClientPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await addClient({
        first_name: fd.get('first_name') as string,
        last_name: (fd.get('last_name') as string) || undefined,
        mobile_no: (fd.get('mobile_no') as string) || undefined,
        email_id: (fd.get('email_id') as string) || undefined,
        notes: (fd.get('notes') as string) || undefined,
        status: 'Active',
      })

      if (result.success) {
        toast.success('Client created')
        router.push('/dashboard/clients')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/clients" style={{ color: 'var(--fd-muted)' }}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          New Client
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              First name *
            </label>
            <input name="first_name" required className="input-base" placeholder="Lara" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              Last name
            </label>
            <input name="last_name" className="input-base" placeholder="Croft" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Phone
          </label>
          <input name="mobile_no" type="tel" className="input-base" placeholder="+961 71 000 000" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Email
          </label>
          <input name="email_id" type="email" className="input-base" placeholder="lara@example.com" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Notes
          </label>
          <textarea
            name="notes"
            rows={3}
            className="input-base resize-none"
            placeholder="Goals, health notes, etc."
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
          {isPending ? 'Creating…' : 'Create Client'}
        </button>
      </form>
    </div>
  )
}
