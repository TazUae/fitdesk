'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Calendar,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/auth-client'
import { Avatar } from '@/components/modules/Avatar'
import { UserMenuSheet } from '@/components/modules/UserMenuSheet'
import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { QuickActionsFab } from '@/features/dashboard/components/QuickActionsFab'

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
]

const ROUTE_TITLES: [string, string][] = [
  ['/dashboard/clients',  'Clients'],
  ['/dashboard/schedule', 'Schedule'],
  ['/dashboard/invoices', 'Invoices'],
  ['/dashboard/messages', 'Messages'],
  ['/dashboard/whatsapp', 'WhatsApp & Reminders'],
  ['/dashboard/settings', 'Workspace Settings'],
  ['/dashboard/account',  'Profile'],
  ['/dashboard/help',     'Help & Support'],
  ['/dashboard',          'Home'],
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

interface Props {
  children:  React.ReactNode
  banner?:   React.ReactNode
}

export function DashboardClientShell({ children, banner }: Props) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: session } = useSession()
  const userName  = session?.user?.name  ?? ''
  const userEmail = session?.user?.email ?? ''

  const isFullWidthRoute =
    pathname === '/dashboard/schedule' || pathname.startsWith('/dashboard/schedule/')

  // Routes with the wide desktop canvas (responsive grid layout).
  // All other sub-routes stay constrained at max-w-[480px] until redesigned.
  const isCommandCenter = pathname === '/dashboard'
  const isClientsRoute  = pathname === '/dashboard/clients' || pathname.startsWith('/dashboard/clients/')
  const isWideCanvas    = isCommandCenter || isClientsRoute

  // Schedule keeps its own full-width layout — no shell chrome
  if (isFullWidthRoute) {
    return (
      <>
        {banner}
        {children}
        <UserMenuSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          userName={userName}
          userEmail={userEmail}
        />
      </>
    )
  }

  return (
    <div className="min-h-dvh lg:flex" style={{ backgroundColor: 'var(--fd-bg)' }}>

      {/* ── Desktop sidebar (lg+) ──────────────────────────────────────────── */}
      <DashboardSidebar />

      {/* ── Content column ────────────────────────────────────────────────── */}
      {/*   Mobile (all routes):   centered 480px column                       */}
      {/*   Desktop /dashboard:    fills remaining space (wide command center) */}
      {/*   Desktop sub-routes:    stays max-w-[480px] centered beside sidebar */}
      <div className={cn(
        'flex min-h-dvh flex-col mx-auto w-full max-w-[480px] lg:flex-1 lg:min-w-0',
        isWideCanvas && 'lg:mx-0 lg:max-w-none',
      )}>

        {banner}

        {/* Mobile header — hidden on desktop */}
        <header
          className="relative lg:hidden sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b px-4"
          style={{ backgroundColor: 'var(--fd-bg)', borderColor: 'var(--fd-border)' }}
        >
          <span
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: 'var(--fd-accent)' }}
          >
            FitDesk
          </span>

          <span
            className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold"
            style={{ color: 'var(--fd-text)' }}
          >
            {getTitle(pathname)}
          </span>

          <button
            onClick={() => setMenuOpen(true)}
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full transition-opacity active:opacity-60"
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

        {/* Desktop header — hidden on mobile */}
        <header
          className="hidden lg:sticky lg:top-0 lg:z-20 lg:flex h-14 shrink-0 items-center justify-between border-b px-6"
          style={{ backgroundColor: 'var(--fd-bg)', borderColor: 'var(--fd-border)' }}
        >
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--fd-text)' }}
          >
            {getTitle(pathname)}
          </span>

          <button
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity active:opacity-60"
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

        {/* Page content */}
        <main className="flex-1 pb-24 lg:pb-0">
          {children}
        </main>

      </div>

      {/* ── Mobile bottom nav (lg:hidden) ─────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-1/2 z-20 w-full max-w-[480px] -translate-x-1/2 border-t"
        style={{
          backgroundColor: 'var(--fd-bg)',
          borderColor:     'var(--fd-border)',
          paddingBottom:   'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex h-16 items-center">
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

      {/* ── Mobile FAB — Quick Actions (lg:hidden, handled inside component) ─ */}
      <QuickActionsFab />

      {/* ── Account sheet ─────────────────────────────────────────────────── */}
      <UserMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        userName={userName}
        userEmail={userEmail}
      />

    </div>
  )
}
