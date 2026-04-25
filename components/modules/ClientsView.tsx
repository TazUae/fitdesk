'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Target } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
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

      {client.packageType && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: 'rgba(138,143,168,0.12)', color: 'var(--fd-muted)' }}
        >
          {client.packageType}
        </span>
      )}
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
      {error && (
        <p
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-red)' }}
        >
          {error}
        </p>
      )}

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
        <p className="py-8 text-center text-sm" style={{ color: 'var(--fd-muted)' }}>
          No clients yet. Tap <strong>Add</strong> to create your first one.
        </p>
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
