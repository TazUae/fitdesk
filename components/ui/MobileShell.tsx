'use client'
import { cn } from '@/lib/utils'
interface MobileShellProps {
  children: React.ReactNode
  stickyHeader?: React.ReactNode
  className?: string
}
export function MobileShell({ children, stickyHeader, className }: MobileShellProps) {
  return (
    <div className={cn('mx-auto w-full max-w-[420px] px-4 py-3', className)}>
      {stickyHeader != null && (
        <header className="sticky top-0 z-30 -mx-4 mb-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}>
          {stickyHeader}
        </header>
      )}
      {children}
    </div>
  )
}
