'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Unified sheet/drawer primitive.
 *
 * Rendered through a portal on document.body so it can never be clipped by an
 * ancestor stacking context or overflow container (this was the cause of the
 * mid-list "Record Payment" rendering defect). While closed the dialog is
 * removed from the accessibility tree and made inert; while open, focus is
 * trapped inside and restored to the invoking element on close.
 */
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
  const [mounted, setMounted]     = useState(false)
  const dialogRef                 = useRef<HTMLDivElement>(null)
  const restoreFocusRef           = useRef<HTMLElement | null>(null)

  // Portal target only exists client-side.
  useEffect(() => { setMounted(true) }, [])

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

  // A11y open/close lifecycle: inert while closed, focus capture on open,
  // focus restoration on close.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    // `inert` removes the closed (visually offscreen but mounted) dialog from
    // both the tab order and the accessibility tree.
    el.inert = !open
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
      // Focus the first focusable control, falling back to the dialog itself.
      const first = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? el).focus({ preventScroll: true })
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current.focus({ preventScroll: true })
      restoreFocusRef.current = null
    }
  }, [open])

  // ESC closes; Tab is trapped inside the dialog while open.
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const el = dialogRef.current
      if (!el) return
      const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(f => f.offsetParent !== null || f === document.activeElement)
      if (focusables.length === 0) {
        e.preventDefault()
        el.focus()
        return
      }
      const first = focusables[0]
      const last  = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !el.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !el.contains(active)) {
        e.preventDefault()
        first.focus()
      }
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
    visibility:      open ? 'visible' : 'hidden',
    transitionProperty: 'transform, visibility',
    ...(showDesktopDrawer
      ? { transform: `translateX(${open ? '0%' : '100%'})` }
      : {
          transform:  `translateX(-50%) translateY(${open ? '0%' : '100%'})`,
          maxHeight:  '90dvh',
        }
    ),
  }

  if (!mounted) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity duration-300',
          mobileOnly && 'lg:hidden',
        )}
        style={{
          backgroundColor: 'var(--fd-overlay)',
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />

      {/* Sheet / Drawer */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={open ? undefined : true}
        tabIndex={-1}
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
    </>,
    document.body,
  )
}
