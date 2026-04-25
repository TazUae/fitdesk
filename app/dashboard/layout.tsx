'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Calendar,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/auth-client'
import { Avatar } from '@/components/modules/Avatar'
import { UserMenuSheet } from '@/components/modules/UserMenuSheet'

// ─── Nav config ───────────────────────────────────────────────────────────────

type NavItem = {
  href:   string
  label:  string
  Icon:   LucideIcon
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',          label: 'Home',     Icon: LayoutDashboard, exact: true },
  { href: '/dashboard/clients',  label: 'Clients',  Icon: Users },
  { href: '/dashboard/schedule', label: 'Schedule', Icon: Calendar },
  { href: '/dashboard/invoices', label: 'Invoices', Icon: Receipt },
  { href: '/dashboard/whatsapp', label: 'WhatsApp', Icon: MessageCircle },
]

/** Map route prefixes → display titles shown in the top bar. */
const ROUTE_TITLES: [string, string][] = [
  ['/dashboard/clients',  'Clients'],
  ['/dashboard/schedule', 'Schedule'],
  ['/dashboard/invoices', 'Invoices'],
  ['/dashboard/messages', 'Messages'],
  ['/dashboard/whatsapp', 'WhatsApp'],
  ['/dashboard/account',  'Account Settings'],
  ['/dashboard/help',     'Help & Support'],
  ['/dashboard',          'Home'],      // must be last (shortest prefix)
]

function getTitle(pathname: string): string {
  const match = ROUTE_TITLES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
  return match ? match[1] : 'FitDesk'
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: session } = useSession()
  const userName  = session?.user?.name  ?? ''
  const userEmail = session?.user?.email ?? ''

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--fd-bg)' }}>
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">

        {/* ── Top bar ───────────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b px-4"
          style={{ backgroundColor: 'var(--fd-bg)', borderColor: 'var(--fd-border)' }}
        >
          {/* Wordmark */}
          <span
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: 'var(--fd-accent)' }}
          >
            FitDesk
          </span>

          {/* Current section */}
          <span
            className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold"
            style={{ color: 'var(--fd-text)' }}
          >
            {getTitle(pathname)}
          </span>

          {/* Avatar — opens the account sheet */}
          <button
            onClick={() => setMenuOpen(true)}
            className="transition-opacity active:opacity-60"
            aria-label="Open account menu"
          >
            {userName ? (
              <Avatar name={userName} size="sm" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-accent)' }}
              >
                PT
              </div>
            )}
          </button>
        </header>

        {/* ── Page content ──────────────────────────────────────────────── */}
        <main className="flex-1 pb-24">
          {children}
        </main>

      </div>

      {/* ── Bottom navigation ─────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-1/2 z-20 w-full max-w-[480px] -translate-x-1/2 border-t"
        style={{
          backgroundColor: 'var(--fd-bg)',
          borderColor:     'var(--fd-border)',
          paddingBottom:   'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex h-16 items-center">

          {/* Regular nav links */}
          {NAV_ITEMS.map(({ href, label, Icon, exact }) => {
            const active = isActive(pathname, href, exact)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 py-2',
                  'transition-opacity active:opacity-60',
                )}
              >
                <Icon
                  className="h-[22px] w-[22px] transition-colors"
                  style={{ color: active ? 'var(--fd-accent)' : 'var(--fd-muted)' }}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                <span
                  className="text-[10px] font-medium leading-none transition-colors"
                  style={{ color: active ? 'var(--fd-accent)' : 'var(--fd-muted)' }}
                >
                  {label}
                </span>
              </Link>
            )
          })}

          {/* More — opens account sheet */}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-opacity active:opacity-60"
          >
            <MoreHorizontal
              className="h-[22px] w-[22px]"
              style={{ color: menuOpen ? 'var(--fd-accent)' : 'var(--fd-muted)' }}
              strokeWidth={menuOpen ? 2.5 : 1.75}
            />
            <span
              className="text-[10px] font-medium leading-none"
              style={{ color: menuOpen ? 'var(--fd-accent)' : 'var(--fd-muted)' }}
            >
              More
            </span>
          </button>

        </div>
      </nav>

      {/* ── Account menu sheet ────────────────────────────────────────────── */}
      <UserMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        userName={userName}
        userEmail={userEmail}
      />
    </div>
  )
}
