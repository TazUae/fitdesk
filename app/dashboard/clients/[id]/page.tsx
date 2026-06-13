import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Target } from 'lucide-react'
import { getClientById, getInvoices, getSessions } from '@/lib/business-data'
import { isErpUnavailableError } from '@/lib/erpnext/is-unavailable-error'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import { formatGoal } from '@/lib/format/goal'
import { getClientHubOverview } from '@/lib/clients/hub'
import { Avatar } from '@/components/modules/Avatar'
import { Badge } from '@/components/modules/Badge'
import { ClientHubPanel } from '@/components/modules/ClientHubPanel'
import { DeactivateClientButton } from '@/components/modules/DeactivateClientButton'
import type { BadgeVariant } from '@/components/modules/Badge'
import type { ClientStatus, Invoice, InvoiceStatus, Session, SessionStatus } from '@/types'

// ─── Status → badge variant maps ──────────────────────────────────────────────

function clientVariant(s: ClientStatus): BadgeVariant {
  return s === 'active' ? 'active' : 'inactive'
}

function sessionVariant(s: SessionStatus): BadgeVariant {
  const map: Record<SessionStatus, BadgeVariant> = {
    scheduled: 'upcoming',
    completed: 'completed',
    missed: 'missed',
    cancelled: 'cancelled',
  }
  return map[s]
}

function invoiceVariant(s: InvoiceStatus): BadgeVariant {
  const map: Record<InvoiceStatus, BadgeVariant> = {
    draft:          'draft',
    sent:           'pending',
    partially_paid: 'pending',
    paid:           'paid',
    overdue:        'overdue',
    cancelled:      'cancelled',
  }
  return map[s]
}

// ─── Balance helper ────────────────────────────────────────────────────────────

function outstandingBalance(invoices: Invoice[]): number {
  return invoices
    .filter(i => isOutstandingInvoiceStatus(i.status))
    .reduce((sum, i) => sum + i.outstandingAmount, 0)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { params: { id: string } }

export default async function ClientDetailPage({ params }: Props) {
  const clientId = decodeURIComponent(params.id)
  const [clientResult, sessionsResult, invoicesResult, hub] = await Promise.all([
    getClientById(clientId),
    getSessions({ clientId }),
    getInvoices({ clientId }),
    getClientHubOverview(clientId),
  ])

  if (!clientResult.success) {
    if (isErpUnavailableError(clientResult.error)) {
      return (
        <div className="space-y-5 p-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/clients" style={{ color: 'var(--fd-muted)' }}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
          <div
            className="rounded-2xl border p-6 text-center"
            style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>
              Workspace data is still connecting
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
              Client details will appear once your workspace data connection is ready.
            </p>
            <Link
              href="/dashboard/clients"
              className="mt-4 inline-block text-sm font-semibold"
              style={{ color: 'var(--fd-accent)' }}
            >
              ← Back to clients
            </Link>
          </div>
        </div>
      )
    }
    notFound()
  }

  const client = clientResult.data
  const sessions = sessionsResult.success ? sessionsResult.data : []
  const invoices = invoicesResult.success ? invoicesResult.data : []
  const balance = outstandingBalance(invoices)

  return (
    <div className="space-y-5 p-4">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/clients" style={{ color: 'var(--fd-muted)' }}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="flex-1" />
        <Link
          href={`/dashboard/clients/${params.id}/edit`}
          className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold"
          style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
      </div>

      {/* ── Profile card ────────────────────────────────────────────────── */}
      <div
        className="space-y-4 rounded-2xl border p-5"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {/* Avatar + name + status */}
        <div className="flex items-center gap-4">
          <Avatar name={client.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
              {client.name}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={clientVariant(client.status)} />
              <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {client.sessionCount} sessions
              </span>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-2">
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
          {formatGoal(client.goal) && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fd-muted)' }}>
              <Target className="h-3.5 w-3.5 shrink-0" />
              {formatGoal(client.goal)}
            </div>
          )}
        </div>

        {/* Outstanding balance — only shown when there is money owed */}
        {balance > 0 && (
          <div
            className="rounded-xl border px-4 py-3"
            style={{
              backgroundColor: 'rgba(232,92,106,0.08)',
              borderColor: 'rgba(232,92,106,0.25)',
            }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--fd-red)' }}>
              Outstanding balance
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--fd-red)' }}>
              ${balance.toLocaleString()}
            </p>
          </div>
        )}

        {/* Notes placeholder */}
        {client.notes ? (
          <p
            className="rounded-xl border p-3 text-xs"
            style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
          >
            {client.notes}
          </p>
        ) : (
          <p
            className="rounded-xl border border-dashed p-3 text-center text-xs"
            style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
          >
            No notes — add them via Edit
          </p>
        )}

        {/* WhatsApp button */}
        {client.phone && (
          <Link
            href={`/dashboard/messages/${params.id}`}
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-green)' }}
          >
            <MessageCircle className="h-4 w-4" />
            Send WhatsApp
          </Link>
        )}
      </div>

      {/* ── Client Hub (Phase 7 — flag-gated, additive) ─────────────────── */}
      {hub && <ClientHubPanel overview={hub} />}

      {/* ── Sessions ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Sessions
            {sessions.length > 0 && (
              <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                ({sessions.length})
              </span>
            )}
          </h3>
          <span
            className="text-xs font-medium opacity-35 cursor-not-allowed select-none"
            style={{ color: 'var(--fd-accent)' }}
            title="Session booking coming soon"
          >
            + Schedule
          </span>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            No sessions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 10).map(session => (
              <SessionRow key={session.id} session={session} />
            ))}
            {sessions.length > 10 && (
              <p className="text-center text-xs" style={{ color: 'var(--fd-muted)' }}>
                Showing 10 of {sessions.length}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Invoices ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Invoices
            {invoices.length > 0 && (
              <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                ({invoices.length})
              </span>
            )}
          </h3>
          <Link
            href={`/dashboard/invoices/new?client=${params.id}`}
            className="text-xs font-medium"
            style={{ color: 'var(--fd-accent)' }}
          >
            + Invoice
          </Link>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            No invoices yet.
          </p>
        ) : (
          <div className="space-y-2">
            {invoices.map(invoice => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </div>
        )}
      </section>

      {/* ── Danger zone ───────────────────────────────────────────────────── */}
      {client.status === 'active' && (
        <section className="space-y-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fd-muted)' }}>
            Danger zone
          </p>
          <DeactivateClientButton clientId={client.id} clientName={client.name} />
        </section>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
// These are Server Components — no 'use client' needed.

function SessionRow({ session }: { session: Session }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border px-4 py-3"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
          {session.date}
          {session.time ? ` · ${session.time}` : ''}
        </p>
        {session.durationMinutes && (
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {session.durationMinutes} min
          </p>
        )}
      </div>
      <Badge variant={sessionVariant(session.status)} />
    </div>
  )
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border px-4 py-3"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          {invoice.currency} {invoice.amount.toLocaleString()}
        </p>
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          Due {invoice.dueDate}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Badge variant={invoiceVariant(invoice.status)} />
        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
          <Link
            href={`/dashboard/invoices/${invoice.id}/pay`}
            className="text-[11px] font-semibold"
            style={{ color: 'var(--fd-accent)' }}
          >
            Record payment
          </Link>
        )}
      </div>
    </div>
  )
}
