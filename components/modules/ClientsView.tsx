'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Target, Users } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
import { EmptyState } from '@/components/modules/EmptyState'
import { ErrorState } from '@/components/modules/ErrorState'
import type { Client } from '@/types'

// ─── Client card ──────────────────────────────────────────────────────────────

function ClientCard({ client }: { client: Client }) {
  return (
    <Link
      href={`/dashboard/clients/${client.id}`}
      className="flex items-center gap-3 rounded-2xl border p-4 transition-opacity active:opacity-60"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <Avatar name={client.name} size="md" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          {client.name}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--fd-muted)' }}>
          {client.mobile || 'No phone number'}
        </p>
        {client.fitnessGoals && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--fd-muted)' }}>
            <Target className="h-3 w-3 shrink-0" />
            {client.fitnessGoals}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {client.packageType && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: 'rgba(138,143,168,0.12)', color: 'var(--fd-muted)' }}
          >
            {client.packageType}
          </span>
        )}
        {client.remainingSessions !== undefined && client.remainingSessions > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: 'rgba(232,197,71,0.15)', color: 'var(--fd-accent)' }}
          >
            {client.remainingSessions} left
          </span>
        )}
      </div>
    </Link>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ClientsViewProps {
  clients: Client[]
  error?: string
}

export function ClientsView({ clients, error }: ClientsViewProps) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? clients.filter(c => {
        const q = query.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          c.mobile?.includes(q) ||
          c.fitnessGoals?.toLowerCase().includes(q)
        )
      })
    : clients

  return (
    <div className="p-4 space-y-4">
      {/* Header row: count + add button */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold" style={{ color: 'var(--fd-muted)' }}>
          {clients.length} client{clients.length !== 1 ? 's' : ''}
        </p>
        <Link
          href="/dashboard/clients/new"
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-opacity active:opacity-70"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          <Plus className="h-4 w-4" />
          Add
        </Link>
      </div>

      {/* Server-side fetch error */}
      {error && <ErrorState title="Could not load clients" message={error} inline />}

      {/* Search — only shown when there are clients to search through */}
      {clients.length > 2 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--fd-muted)' }}
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, phone, goal…"
            className="input-base pl-9"
          />
        </div>
      )}

      {/* Empty states */}
      {clients.length === 0 && !error && (
        <EmptyState
          Icon={Users}
          title="No clients yet"
          body="Add your first client to start booking sessions and sending invoices."
          ctaHref="/dashboard/clients/new"
          ctaLabel="Add a client"
        />
      )}
      {clients.length > 0 && filtered.length === 0 && (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--fd-muted)' }}>
          No clients match &ldquo;{query}&rdquo;
        </p>
      )}

      {/* Client list */}
      <div className="space-y-2">
        {filtered.map(client => (
          <ClientCard key={client.id} client={client} />
        ))}
      </div>
    </div>
  )
}
