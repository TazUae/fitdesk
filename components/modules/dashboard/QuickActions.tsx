import Link from 'next/link'
import { CalendarPlus, UserPlus, MessageCircle, Receipt } from 'lucide-react'

interface Props {
  whatsappConnected: boolean
}

interface ActionItemProps {
  href:  string
  Icon:  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
}

function ActionItem({ href, Icon, label }: ActionItemProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-opacity hover:opacity-90 active:opacity-70"
      style={{ backgroundColor: 'var(--fd-card-hover)' }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--fd-surface)', border: '1px solid var(--fd-border)' }}
      >
        <Icon className="h-4 w-4" style={{ color: 'var(--fd-blue)' }} />
      </div>
      <span className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        {label}
      </span>
    </Link>
  )
}

export function QuickActions({ whatsappConnected }: Props) {
  return (
    <section className="space-y-2">
      <p className="px-0.5 text-sm font-bold" style={{ color: 'var(--fd-text)' }}>
        Quick Actions
      </p>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="divide-y" style={{ borderColor: 'var(--fd-border)' }}>
          <ActionItem href="/dashboard/schedule"   Icon={CalendarPlus} label="Book session" />
          <ActionItem href="/dashboard/clients/new" Icon={UserPlus}    label="Add client" />
          <ActionItem href="/dashboard/invoices"    Icon={Receipt}      label="Payments" />
          <ActionItem
            href="/dashboard/whatsapp"
            Icon={MessageCircle}
            label={whatsappConnected ? 'Messages' : 'Connect WhatsApp'}
          />
        </div>
      </div>
    </section>
  )
}
