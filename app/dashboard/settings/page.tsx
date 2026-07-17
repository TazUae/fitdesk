import Link from 'next/link'
import { Banknote, ChevronRight, CreditCard, Landmark, Package, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

const PAYMENT_METHODS = [
  {
    Icon:        Banknote,
    label:       'Cash',
    description: 'Accept cash in person from clients.',
  },
  {
    Icon:        CreditCard,
    label:       'Digital Wallet Transfer',
    description: 'WhatsApp Pay, OMT, or similar.',
  },
  {
    Icon:        Landmark,
    label:       'Bank Transfer',
    description: 'Wire or bank-to-bank payment.',
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-5 p-4 pb-20">

      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--fd-muted)' }}>
          Manage your schedule, payments, and reminders.
        </p>
      </div>

      {/* ── Package Catalog ────────────────────────────────────────────────── */}
      <Link
        href="/dashboard/settings/packages"
        className="flex items-center justify-between rounded-2xl border p-4 transition-opacity active:opacity-70"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <Package className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-accent)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Package Catalog
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
              Create and activate package templates for client billing.
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 ml-2" style={{ color: 'var(--fd-muted)' }} />
      </Link>

      {/* ── Business hours ─────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" style={{ color: 'var(--fd-accent)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Business hours
            </p>
          </div>
          <Badge variant="coming-soon" />
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
          Set your working days and available time slots. Coming in a future update.
        </p>
      </section>

      {/* ── Buffer time ────────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Buffer time between sessions
          </p>
          <Badge variant="coming-soon" />
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
          Add automatic gaps between bookings. Coming in a future update.
        </p>
      </section>

      {/* ── WhatsApp reminders ─────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            WhatsApp reminders
          </p>
          <Badge variant="coming-soon" />
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
          Automate session reminders and payment nudges via WhatsApp. Coming soon.
        </p>
      </section>

      {/* ── Payment methods ────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Accepted payment methods
        </p>
        <div className="space-y-2">
          {PAYMENT_METHODS.map(({ Icon, label, description }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
              style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
            >
              <Icon className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>{label}</p>
                <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
