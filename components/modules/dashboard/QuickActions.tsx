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
        className="flex flex-col items-center gap-1.5 rounded-2xl border py-3 opacity-35 cursor-not-allowed select-none"
        style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
        aria-disabled="true"
        title="Session booking coming soon"
      >
        <CalendarPlus className="h-5 w-5" style={{ color: 'var(--fd-accent)' }} />
        <span className="text-[10px] font-semibold" style={{ color: 'var(--fd-muted)' }}>
          Book
        </span>
      </div>

      {ACTIONS.map(({ href, Icon, label }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-col items-center gap-1.5 rounded-2xl border py-3 transition-all hover:bg-[rgba(255,255,255,0.06)] active:scale-[0.97] active:opacity-80"
          style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
        >
          <Icon className="h-5 w-5" style={{ color: 'var(--fd-accent)' }} />
          <span className="text-[10px] font-semibold" style={{ color: 'var(--fd-text)' }}>
            {label}
          </span>
        </Link>
      ))}
    </div>
  )
}
