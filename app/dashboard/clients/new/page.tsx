'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AddClientForm } from '@/components/clients/AddClientForm'

export default function NewClientPage() {
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

      <AddClientForm variant="page" />
    </div>
  )
}
