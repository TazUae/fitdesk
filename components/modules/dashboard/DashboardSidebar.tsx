'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/')
}

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="hidden lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:h-dvh overflow-y-auto border-r"
      style={{ backgroundColor: 'var(--fd-bg)', borderColor: 'var(--fd-border)' }}
    >
      {/* Logo */}
      <div
        className="flex h-14 shrink-0 items-center border-b px-5"
        style={{ borderColor: 'var(--fd-border)' }}
      >
        <span
          className="text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--fd-accent)' }}
        >
          FitDesk
        </span>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map(({ href, label, Icon, exact }) => {
          const active = isActive(pathname, href, exact)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[rgba(232,197,71,0.08)]'
                  : 'hover:bg-[rgba(255,255,255,0.03)]',
              )}
              style={{ color: active ? 'var(--fd-accent)' : 'var(--fd-muted)' }}
            >
              <Icon
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={active ? 2.5 : 1.75}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div
        className="border-t px-3 pb-4 pt-4"
        style={{ borderColor: 'var(--fd-border)' }}
      >
        <Link
          href="/dashboard/settings"
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
            pathname === '/dashboard/settings'
              ? 'bg-[rgba(232,197,71,0.08)]'
              : 'hover:bg-[rgba(255,255,255,0.03)]',
          )}
          style={{
            color:
              pathname === '/dashboard/settings'
                ? 'var(--fd-accent)'
                : 'var(--fd-muted)',
          }}
        >
          <Settings
            className="h-[18px] w-[18px] shrink-0"
            strokeWidth={pathname === '/dashboard/settings' ? 2.5 : 1.75}
          />
          Settings
        </Link>
      </div>
    </aside>
  )
}
