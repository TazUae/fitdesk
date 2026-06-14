/**
 * QuickActions — secondary row of common one-tap navigation shortcuts.
 * Always rendered at the bottom of the dashboard, below all content sections.
 */

import Link from 'next/link'
import { CalendarPlus, UserPlus, MessageCircle, Receipt } from 'lucide-react'

const ACTIONS = [
  { href: '/dashboard/clients/new',  Icon: UserPlus,      label: 'Client'  },
  { href: '/dashboard/invoices/new', Icon: Receipt,       label: 'Invoice' },
  { href: '/dashboard/whatsapp',     Icon: MessageCircle, label: 'WhatsApp'},
] as const

export function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {/* Book — disabled until session writes are connected */}
      <div
        className="flex flex-col items-center gap-2 rounded-2xl border bg-[var(--fd-card)] py-3.5 opacity-35 cursor-not-allowed select-none"
        style={{ borderColor: 'var(--fd-border)' }}
        aria-disabled="true"
        title="Session booking coming soon"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(232,197,71,0.10)' }}
        >
          <CalendarPlus className="h-[18px] w-[18px]" style={{ color: 'var(--fd-accent)' }} />
        </div>
        <span className="text-[10px] font-semibold" style={{ color: 'var(--fd-muted)' }}>
          Book
        </span>
        <span className="sr-only">Session booking coming soon</span>
      </div>

      {ACTIONS.map(({ href, Icon, label }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-col items-center gap-2 rounded-2xl border bg-[var(--fd-card)] py-3.5 transition-all hover:bg-[var(--fd-card-hover)] active:scale-[0.97] active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fd-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fd-bg)]"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(232,197,71,0.10)' }}
          >
            <Icon className="h-[18px] w-[18px]" style={{ color: 'var(--fd-accent)' }} />
          </div>
          <span className="text-[10px] font-semibold" style={{ color: 'var(--fd-text)' }}>
            {label}
          </span>
        </Link>
      ))}
    </div>
  )
}
