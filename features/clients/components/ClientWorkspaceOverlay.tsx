'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Mail, MessageCircle, Phone, Target, X } from 'lucide-react'
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

  // Hub's enriched label takes priority; falls back to ERP goal string
  const goalDisplay = hub?.client.primaryGoalLabel ?? formatGoal(client.goal)
  const clientSince = (() => {
    try {
      return new Date(client.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    } catch { return null }
  })()
  const headerMeta = [goalDisplay, clientSince ? `Since ${clientSince}` : null]
    .filter((s): s is string => Boolean(s))
    .join(' · ')
  const needsAttentionCount = hub?.pendingActions.length ?? 0

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
              {headerMeta && (
                <p className="mt-0.5 text-xs truncate" style={{ color: 'var(--fd-muted)' }}>
                  {headerMeta}
                </p>
              )}
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
          className="border-t px-5 py-4 space-y-3"
          style={{
            borderColor:   'var(--fd-border)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          }}
        >
          {/* Secondary CTA — only when phone is available */}
          {client.phone && (
            <Link
              href={`/dashboard/messages/${encodeURIComponent(client.id)}`}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-opacity active:opacity-70"
              style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-green)' }}
            >
              <MessageCircle className="h-4 w-4" />
              Send WhatsApp
            </Link>
          )}
          {/* Primary CTA — always present */}
          <Link
            href={`/dashboard/clients/${encodeURIComponent(client.id)}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-opacity active:opacity-70"
            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
          >
            Open full profile
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      }
    >
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {hub ? (
          <>
            {/* Contact snapshot — phone and email only; skipped when both absent */}
            {(client.phone || client.email) && (
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
              </div>
            )}

            {/* Needs attention strip — establishes action-first hierarchy before hub panel */}
            {needsAttentionCount > 0 && (
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
                style={{
                  backgroundColor: 'rgba(232,197,71,0.08)',
                  border:          '1px solid rgba(232,197,71,0.35)',
                  color:           '#d4a017',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: '#d4a017' }}
                />
                {needsAttentionCount}{' '}
                {needsAttentionCount === 1 ? 'item needs' : 'items need'} attention
              </div>
            )}

            {/* Client Hub panel — internals unchanged */}
            <ClientHubPanel overview={hub} />

            {/* Trainer notes — only in the hub-present path; fallback path shows notes inline */}
            {client.notes && (
              <div
                className="rounded-2xl border p-4"
                style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wide mb-2"
                  style={{ color: 'var(--fd-muted)' }}
                >
                  Trainer notes
                </p>
                <p className="text-sm" style={{ color: 'var(--fd-text)' }}>
                  {client.notes}
                </p>
              </div>
            )}
          </>
        ) : (
          /* Hub-null fallback — intentional, not empty */
          <div
            className="rounded-2xl border p-4 space-y-3"
            style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Client command center is still preparing
            </p>
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
            {goalDisplay && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fd-muted)' }}>
                <Target className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{goalDisplay}</span>
              </div>
            )}
            {client.notes && (
              <>
                <div className="border-t" style={{ borderColor: 'var(--fd-border)' }} />
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: 'var(--fd-muted)' }}
                  >
                    Trainer notes
                  </p>
                  <p className="text-sm" style={{ color: 'var(--fd-text)' }}>
                    {client.notes}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </WorkspaceShell>
  )
}
