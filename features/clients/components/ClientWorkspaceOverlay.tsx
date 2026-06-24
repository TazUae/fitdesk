'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, MessageCircle, Phone, Target, X } from 'lucide-react'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { Avatar } from '@/components/modules/Avatar'
import { Badge } from '@/components/modules/Badge'
import { ClientHubPanel } from '@/components/modules/ClientHubPanel'
import { formatGoal } from '@/lib/format/goal'
import type { Client } from '@/types'
import type { ClientHubOverview } from '@/types/clients'

interface ClientWorkspaceOverlayProps {
  client: Client
  hub:    ClientHubOverview | null
}

export function ClientWorkspaceOverlay({ client, hub }: ClientWorkspaceOverlayProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  // Trigger entrance animation after first render
  useEffect(() => { setIsOpen(true) }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    // Let the 300ms close animation finish before navigating away
    setTimeout(() => router.back(), 310)
  }, [router])

  const goal = formatGoal(client.goal)

  return (
    <WorkspaceShell
      open={isOpen}
      onClose={handleClose}
      label={`Client: ${client.name}`}
      header={
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={client.name} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--fd-text)' }}>
                {client.name}
              </p>
              <div className="mt-0.5">
                <Badge variant={client.status === 'active' ? 'active' : 'inactive'} />
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
      footer={
        <div
          className="border-t px-5 py-4"
          style={{
            borderColor:   'var(--fd-border)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          }}
        >
          <Link
            href={`/dashboard/clients/${encodeURIComponent(client.id)}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-opacity active:opacity-70"
            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
          >
            Open full profile →
          </Link>
        </div>
      }
    >
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Contact snapshot */}
        <div
          className="rounded-2xl border p-4 space-y-2"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          {client.phone && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fd-muted)' }}>
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {client.phone}
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fd-muted)' }}>
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {goal && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fd-muted)' }}>
              <Target className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{goal}</span>
            </div>
          )}
          {client.phone && (
            <Link
              href={`/dashboard/messages/${encodeURIComponent(client.id)}`}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold"
              style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-green)' }}
            >
              <MessageCircle className="h-4 w-4" />
              Send WhatsApp
            </Link>
          )}
        </div>

        {/* Client Hub — rendered only when feature flag is on for this tenant */}
        {hub && <ClientHubPanel overview={hub} />}

      </div>
    </WorkspaceShell>
  )
}
