'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ResolveSessionSheet } from './ResolveSessionSheet'
import type { SessionResolvable } from '@/lib/dashboard/derive'

interface Props {
  sessions: SessionResolvable[]
}

export function NeedsResolutionList({ sessions }: Props) {
  const [selected, setSelected] = useState<SessionResolvable | null>(null)

  if (sessions.length === 0) return null

  return (
    <>
      {sessions.map(s => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
          style={{ backgroundColor: 'rgba(217,48,37,0.06)', border: '1px solid rgba(217,48,37,0.18)' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-red)' }} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                {s.clientName}
              </p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                Session ended — mark it
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelected(s)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 active:opacity-70"
            style={{ backgroundColor: 'var(--fd-red)', color: '#fff' }}
          >
            Resolve
          </button>
        </div>
      ))}

      <ResolveSessionSheet
        session={selected}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
