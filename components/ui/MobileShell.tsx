'use client'

import { cn } from '@/lib/utils'
import { scheduleTokens } from '@/lib/ui/scheduleDesignTokens'

interface MobileShellProps {
  children: React.ReactNode
  /** Optional sticky region (e.g. planner title row). */
  stickyHeader?: React.ReactNode
  className?: string
}

/**
 * Unified mobile-first frame: max 420px, centered on desktop, full width on small screens.
 */
export function MobileShell({ children, stickyHeader, className }: MobileShellProps) {
  return (
    <div className={cn('mx-auto w-full max-w-[420px] px-4 py-3', className)}>
      {stickyHeader != null && (
        <header
          className="sticky top-0 z-30 -mx-4 mb-3 border-b px-4 py-3 backdrop-blur-xl"
          style={{
            borderColor: scheduleTokens.borderSubtle,
            background: 'linear-gradient(180deg, rgba(19,24,38,0.92) 0%, rgba(13,17,28,0.88) 100%)',
            boxShadow: '0 8px 24px rgba(6,9,18,0.35)',
          }}
        >
          {stickyHeader}
        </header>
      )}
      {children}
    </div>
  )
}
