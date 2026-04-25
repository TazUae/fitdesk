'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, Search, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Client } from '@/types'

interface SmartClientPickerProps {
  clients:    Client[]
  selectedId: string
  /** Package sessions left for selected client (optional). */
  remainingSessions?: number
  onSelect:   (id: string) => void
}

const SUGGESTED_COUNT = 4

function suggestedClients(clients: Client[]): Client[] {
  const sorted = [...clients].sort((a, b) => {
    const ra = a.remainingSessions ?? 0
    const rb = b.remainingSessions ?? 0
    if (rb !== ra) return rb - ra
    return a.name.localeCompare(b.name)
  })
  return sorted.slice(0, SUGGESTED_COUNT)
}

export function SmartClientPicker({
  clients,
  selectedId,
  remainingSessions,
  onSelect,
}: SmartClientPickerProps) {
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'default' | 'search' | 'full'>('default')

  const selected = clients.find(c => c.id === selectedId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => c.name.toLowerCase().includes(q))
  }, [clients, search])

  const suggested = useMemo(() => suggestedClients(clients), [clients])

  if (selected && mode === 'default' && !search) {
    return (
      <div
        className="flex items-center justify-between rounded-2xl border p-3.5"
        style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {selected.name}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            {selected.packageType && (
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {selected.packageType}
              </p>
            )}
            {remainingSessions !== undefined && (
              <p
                className="text-xs font-semibold"
                style={{ color: remainingSessions === 0 ? 'var(--fd-red)' : 'var(--fd-green)' }}
              >
                {remainingSessions} session{remainingSessions !== 1 ? 's' : ''} left
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setMode('search'); setSearch('') }}
          className="ml-3 shrink-0 text-xs font-semibold"
          style={{ color: 'var(--fd-accent)' }}
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {mode === 'default' && !search && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
            Suggested
          </p>
          <div className="space-y-1">
            {suggested.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c.id); setMode('default'); setSearch('') }}
                className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors hover:opacity-90"
                style={{
                  borderColor: 'var(--fd-border)',
                  backgroundColor: 'var(--fd-card)',
                  color: 'var(--fd-text)',
                }}
              >
                <span className="truncate">{c.name}</span>
                {selectedId === c.id && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-green)' }} />}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMode('search')}
            className="text-xs font-semibold"
            style={{ color: 'var(--fd-accent)' }}
          >
            Search clients…
          </button>
          <button
            type="button"
            onClick={() => setMode('full')}
            className="block w-full text-left text-xs font-semibold"
            style={{ color: 'var(--fd-muted)' }}
          >
            View all clients
          </button>
        </div>
      )}

      {(mode === 'search' || mode === 'full' || search) && (
        <>
          <div
            className="flex items-center gap-2 rounded-2xl border px-3.5 py-3"
            style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setMode('search') }}
              placeholder="Search clients…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--fd-text)' }}
              autoFocus={mode === 'search'}
            />
          </div>

          <div
            className={cn(
              'overflow-y-auto rounded-2xl border',
              mode === 'full' ? 'max-h-56' : 'max-h-40',
            )}
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-5 text-center">
                <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>No clients found</p>
                <Link
                  href="/dashboard/clients/new"
                  className="flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: 'var(--fd-accent)' }}
                >
                  <UserPlus className="h-4 w-4" />
                  Add Client
                </Link>
              </div>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c.id)
                    setMode('default')
                    setSearch('')
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3.5 py-3 text-sm transition-colors',
                    i > 0 && 'border-t',
                  )}
                  style={{
                    borderColor: 'var(--fd-border)',
                    color: selectedId === c.id ? 'var(--fd-green)' : 'var(--fd-text)',
                  }}
                >
                  <span className="truncate text-left">{c.name}</span>
                  {selectedId === c.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>

          {mode === 'full' && (
            <button
              type="button"
              onClick={() => { setMode('default'); setSearch('') }}
              className="text-xs font-semibold"
              style={{ color: 'var(--fd-muted)' }}
            >
              Back to suggested
            </button>
          )}
        </>
      )}
    </div>
  )
}
