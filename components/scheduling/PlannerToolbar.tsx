'use client'

import Link from 'next/link'
import { Menu, HelpCircle, Settings } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'

interface PlannerToolbarProps {
  sidebarOpen:    boolean
  onToggleSidebar: () => void
}

/**
 * Top app bar for the Planner.
 *
 * Layout (Google Calendar–inspired):
 *   [☰]  FitDesk Planner          [Help] [Settings] [Profile]
 *
 * Schedule-X renders its own date-nav / view-switcher header inside the
 * calendar area; that header is restyled by scheduler-x-overrides.css to
 * match this toolbar visually. Keeping Schedule-X's native header avoids
 * having to wire its programmatic control plugin in Phase 5.0.
 */
export function PlannerToolbar({ sidebarOpen, onToggleSidebar }: PlannerToolbarProps) {
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
        <Avatar name="Trainer" size="sm" />
      </div>
    </header>
  )
}
