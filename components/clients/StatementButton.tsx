'use client'

import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { StatementSheet } from '@/components/clients/StatementSheet'

export interface StatementButtonProps {
  clientId: string
}

/**
 * Entry point for the read-only client Statement of Account.
 * Mounted only on the canonical full client profile
 * (app/dashboard/clients/[id]/page.tsx) — not in ClientHubPanel and not in
 * the intercepted (.)clients overlay, so it never reaches the quick-view.
 */
export function StatementButton({ clientId }: StatementButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-opacity active:opacity-70"
        style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-accent)' }}
      >
        <Receipt className="h-3.5 w-3.5" />
        View statement
      </button>
      <StatementSheet open={open} onClose={() => setOpen(false)} clientId={clientId} />
    </>
  )
}
