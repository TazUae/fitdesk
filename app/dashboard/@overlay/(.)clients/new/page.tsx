'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AddClientForm } from '@/components/clients/AddClientForm'

/**
 * Intercepted Add Client route.
 *
 * This prevents soft navigation to /dashboard/clients/new from being captured by
 * the dynamic intercepted client detail route at @overlay/(.)clients/[id].
 *
 * Hard refresh/direct access still uses app/dashboard/clients/new/page.tsx.
 */
export default function NewClientOverlayPage() {
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