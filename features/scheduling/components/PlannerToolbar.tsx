'use client'

import Link from 'next/link'
import { Menu, HelpCircle, Settings, Plus } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useSession } from '@/lib/auth-client'

interface PlannerToolbarProps {
  sidebarOpen:      boolean
  onToggleSidebar:  () => void
  /** Opens the booking sheet at step 1. Shown in the toolbar so the CTA is
   *  always reachable regardless of sidebar state or viewport width. */
  onCreate?:        () => void
}

export function PlannerToolbar({ sidebarOpen, onToggleSidebar, onCreate }: PlannerToolbarProps) {
  // Same identity as the app shell — never a placeholder avatar (the planner
  // previously showed a hardcoded "TR" while the shell showed the real user).
  const { data: session } = useSession()
  const userName = session?.user?.name || 'Trainer'

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4"
      style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
    >
      {/* Sidebar toggle — desktop only */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={sidebarOpen}
        className="hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)] md:flex"
        style={{ color: 'var(--fd-text)' }}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Brand */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-[var(--fd-card-hover)]"
        aria-label="FitDesk home"
      >
        <span
          className="inline-block h-6 w-6 rounded-md"
          style={{
            background: 'linear-gradient(135deg, var(--fd-accent) 0%, #C8A130 100%)',
          }}
        />
        <span className="text-base font-semibold tracking-tight" style={{ color: 'var(--fd-text)' }}>
          FitDesk
        </span>
        <span className="ml-2 hidden text-sm sm:inline" style={{ color: 'var(--fd-muted)' }}>
          Planner
        </span>
      </Link>

      {/* Book session CTA — shown only when onCreate is provided (tablet/desktop). */}
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          aria-label="Book session"
          className="ml-2 hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-90 active:scale-95 md:flex"
          style={{
            backgroundColor: 'var(--fd-primary)',
            color:           'var(--fd-text-on-primary)',
          }}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Book session</span>
        </button>
      )}

      <div className="flex-1" />

      {/* Right-side actions */}
      <Link
        href="/dashboard"
        aria-label="Help"
        className="hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)] sm:flex"
        style={{ color: 'var(--fd-muted)' }}
      >
        <HelpCircle className="h-5 w-5" />
      </Link>
      <Link
        href="/dashboard/settings"
        aria-label="Settings"
        className="hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)] sm:flex"
        style={{ color: 'var(--fd-muted)' }}
      >
        <Settings className="h-5 w-5" />
      </Link>
      <div className="ml-1">
        <Avatar name={userName} size="sm" />
      </div>
    </header>
  )
}
