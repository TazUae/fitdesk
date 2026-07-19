'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Shared focus-trap for hand-rolled dialogs that cannot adopt WorkspaceShell
 * wholesale (BookingSheet, GoalEditorSheet). While `active`:
 * - focus moves into the container on activation (first focusable, else container)
 * - Tab / Shift+Tab cycle inside the container
 * - focus returns to the previously-focused element on deactivation
 *
 * Escape handling stays with the caller (close semantics differ per dialog).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const first = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(first ?? el).focus({ preventScroll: true })

    function handler(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const container = ref.current
      if (!container) return
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(f => f.offsetParent !== null || f === document.activeElement)
      if (focusables.length === 0) {
        e.preventDefault()
        container.focus()
        return
      }
      const firstEl = focusables[0]
      const lastEl  = focusables[focusables.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (activeEl === firstEl || !container.contains(activeEl)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else if (activeEl === lastEl || !container.contains(activeEl)) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [ref, active])
}
