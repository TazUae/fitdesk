'use client'

import { useState, type ReactNode } from 'react'
import { PlannerToolbar } from '@/components/scheduling/PlannerToolbar'
import { PlannerSidebar } from '@/components/scheduling/PlannerSidebar'
import { cn } from '@/lib/utils'

interface PlannerShellProps {
  /** Calendar area — typically <SchedulerXAdapter>. */
  children: ReactNode
  /** Optional currently-selected date for MiniCalendar / toolbar title context. */
  currentDate?: Date
  /** Fired when the toolbar "Book session" button is tapped. */
  onCreate?: () => void
  /** Fired when the user taps a date in the mini-calendar. */
  onSelectDate?: (date: Date) => void
  /** Reserve desktop space for a fixed right-side drawer. */
  rightDrawerOpen?: boolean
  /** Floating overlay slot — booking sheet, modals, FAB. Rendered last so they win z-index. */
  overlays?: ReactNode
}

export function PlannerShell({
  children,
  currentDate,
  onCreate,
  onSelectDate,
  rightDrawerOpen,
  overlays,
}: PlannerShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(min-width: 1280px)').matches
  })

  return (
    <div
      className="flex h-[100dvh] flex-col"
      style={{ backgroundColor: 'var(--fd-bg)', color: 'var(--fd-text)' }}
    >
      <PlannerToolbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onCreate={onCreate}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Sidebar — desktop only (md+). Always rendered so transitions work. */}
        <aside
          className={cn(
            'hidden min-w-0 shrink-0 border-r md:flex md:flex-col',
            sidebarOpen ? 'md:w-[260px]' : 'md:w-0 md:overflow-hidden',
            'transition-[width] duration-200 ease-out',
          )}
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-bg)' }}
        >
          <PlannerSidebar currentDate={currentDate} onSelectDate={onSelectDate} />
        </aside>

        {/* Main calendar area */}
        <main
          className={cn(
            'relative flex min-w-0 flex-1 flex-col overflow-hidden',
            'transition-[padding-right] duration-200 ease-out',
            rightDrawerOpen && 'md:pr-[520px]',
          )}
          style={{ backgroundColor: 'var(--fd-surface)' }}
        >
          {children}
        </main>
      </div>

      {overlays}
    </div>
  )
}
