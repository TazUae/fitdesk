'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface WorkspaceShellProps {
  /** Controls open/close state. Shell stays mounted; transforms in/out. */
  open: boolean
  /** Called on backdrop click, ESC key, or close button. */
  onClose: () => void
  /** Accessible dialog label applied to role="dialog". */
  label: string
  /** Optional header slot — shrink-0, rendered above the body. */
  header?: ReactNode
  /** Body content. Children own their own overflow / scroll. */
  children: ReactNode
  /** Optional footer slot — shrink-0, rendered below the body. */
  footer?: ReactNode
  /**
   * When true the shell is mobile-only (lg:hidden on backdrop and container).
   * The desktop right-drawer variant is suppressed; always renders as a
   * bottom sheet. Use for FAB sheets that should never appear on desktop.
   */
  mobileOnly?: boolean
}

export function WorkspaceShell({
  open,
  onClose,
  label,
  header,
  children,
  footer,
  mobileOnly = false,
}: WorkspaceShellProps) {
  const [isDesktop, setIsDesktop] = useState(false)

  // Detect lg breakpoint (1024px). Skipped entirely when mobileOnly.
  useEffect(() => {
    if (mobileOnly) return
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mobileOnly])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ESC key closes
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const showDesktopDrawer = !mobileOnly && isDesktop

  const containerClass = cn(
    showDesktopDrawer
      ? 'fixed top-0 right-0 z-50 flex h-full w-full max-w-[460px] flex-col border-l rounded-l-[20px]'
      : 'fixed bottom-0 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 flex-col rounded-t-[28px] border-t',
    mobileOnly && 'lg:hidden',
  )

  const containerStyle: CSSProperties = {
    backgroundColor: 'var(--fd-surface)',
    borderColor:     'var(--fd-border)',
    transition:      'transform 300ms cubic-bezier(0.32,0.72,0,1)',
    ...(showDesktopDrawer
      ? { transform: `translateX(${open ? '0%' : '100%'})` }
      : {
          transform:  `translateX(-50%) translateY(${open ? '0%' : '100%'})`,
          maxHeight:  '90dvh',
        }
    ),
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity duration-300',
          mobileOnly && 'lg:hidden',
        )}
        style={{
          backgroundColor: 'rgba(15,23,42,0.55)',
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />

      {/* Sheet / Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={containerClass}
        style={containerStyle}
      >
        {/* Drag handle — mobile bottom sheet only */}
        {!showDesktopDrawer && (
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
          </div>
        )}

        {/* Header slot — flex-shrink-0 wrapper ensures it never compresses */}
        {header && (
          <div className="flex-shrink-0">
            {header}
          </div>
        )}

        {/* Body — flex-1/min-h-0 so children (e.g. AddClientForm) fill the space */}
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>

        {/* Footer slot */}
        {footer && (
          <div className="flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
