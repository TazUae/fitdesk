'use client'

import { useEffect, useId, useRef } from 'react'

interface SignOutConfirmSheetProps {
  open:      boolean
  pending:   boolean
  onCancel:  () => void
  onConfirm: () => void
}

export function SignOutConfirmSheet({ open, pending, onCancel, onConfirm }: SignOutConfirmSheetProps) {
  const titleId     = useId()
  const cancelBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      <div
        onClick={onCancel}
        className="fixed inset-0 z-40 backdrop-blur-[2px]"
        style={{ backgroundColor: 'rgba(15,23,42,0.55)' }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 rounded-t-[28px] border-t"
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor:     'var(--fd-border)',
          paddingBottom:   'max(env(safe-area-inset-bottom), 16px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        <div className="px-6 pb-2 pt-4">
          <p
            id={titleId}
            className="mb-1 text-base font-semibold"
            style={{ color: 'var(--fd-text)' }}
          >
            Sign out of FitDesk?
          </p>
          <p className="mb-6 text-sm" style={{ color: 'var(--fd-muted)' }}>
            You will need to sign in again to access your workspace.
          </p>

          <div className="flex gap-3">
            <button
              ref={cancelBtnRef}
              onClick={onCancel}
              disabled={pending}
              className="flex-1 rounded-xl border py-3 text-sm font-semibold transition-opacity disabled:opacity-50 active:opacity-60"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={pending}
              className="flex-1 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-50 active:opacity-60"
              style={{ backgroundColor: 'var(--fd-red)', color: '#fff' }}
            >
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
