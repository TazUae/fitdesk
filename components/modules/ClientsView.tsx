'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Target, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { addClient } from '@/actions/clients'
import { Avatar } from '@/components/modules/Avatar'
import { Badge } from '@/components/modules/Badge'
import type { BadgeVariant } from '@/components/modules/Badge'
import type { Client, ClientStatus } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(s: ClientStatus): BadgeVariant {
  if (s === 'active') return 'active'
  if (s === 'inactive') return 'inactive'
  return 'inactive' // paused → show as inactive in list
}

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
          {client.phone || client.email || 'No contact info'}
        </p>
        {client.goal && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--fd-muted)' }}>
            <Target className="h-3 w-3 shrink-0" />
            {client.goal}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge variant={statusVariant(client.status)} />
        <span className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
          {client.sessionCount} sessions
        </span>
      </div>
    </Link>
  )
}

// ─── Add client bottom sheet ──────────────────────────────────────────────────

interface AddClientSheetProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

function AddClientSheet({ isOpen, onClose, onCreated }: AddClientSheetProps) {
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
        goal: (fd.get('goal') as string) || undefined,
        notes: (fd.get('notes') as string) || undefined,
        status: 'Active',
      })

      if (result.success) {
        toast.success('Client added')
        ;(e.target as HTMLFormElement).reset()
        onCreated()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      {/* Sheet panel — slides up from bottom, centred at 480 px to match the app column */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add new client"
        className={cn(
          'fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2',
          'rounded-t-3xl border-t transition-transform duration-300',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor: 'var(--fd-border)',
          // clear the iPhone home indicator
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        {/* Sheet header */}
        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            New Client
          </h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--fd-muted)' }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="max-h-[72vh] overflow-y-auto px-5">
          <form onSubmit={handleSubmit} className="space-y-4 pb-2">
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
              <input
                name="mobile_no"
                type="tel"
                className="input-base"
                placeholder="+961 71 000 000"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Email
              </label>
              <input
                name="email_id"
                type="email"
                className="input-base"
                placeholder="lara@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Goal
              </label>
              <input
                name="goal"
                className="input-base"
                placeholder="e.g. Lose weight, build muscle…"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                className="input-base resize-none"
                placeholder="Health notes, injuries, preferences…"
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
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ClientsViewProps {
  clients: Client[]
  /** Error from the server fetch — displayed inline above the list. */
  error?: string
}

export function ClientsView({ clients, error }: ClientsViewProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const filtered = query.trim()
    ? clients.filter(c => {
        const q = query.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.goal?.toLowerCase().includes(q)
        )
      })
    : clients

  function handleCreated() {
    setIsAdding(false)
    // Re-run the server component to get the newly created client
    router.refresh()
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header row: count + add button */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold" style={{ color: 'var(--fd-muted)' }}>
          {clients.length} client{clients.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
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

      {/* Add client bottom sheet */}
      <AddClientSheet
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
