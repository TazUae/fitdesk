'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { QuickActions } from '@/components/modules/dashboard/QuickActions'

export function QuickActionsFab() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* FAB — mobile only, above the bottom nav */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 lg:hidden"
        style={{
          right: '1rem',
          bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)',
          backgroundColor: 'var(--fd-accent)',
          color: 'var(--fd-bg)',
        }}
        aria-label="Quick actions"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden"
        style={{
          backgroundColor: 'rgba(15,23,42,0.55)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 rounded-t-[28px] border-t lg:hidden"
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor: 'var(--fd-border)',
          transform: `translateX(-50%) translateY(${open ? '0%' : '100%'})`,
          transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        {/* Sheet header */}
        <div className="flex items-center justify-between px-6 py-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            Quick Actions
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Actions grid */}
        <div className="px-6 pb-4">
          <QuickActions />
        </div>

        {/* Safe-area spacer */}
        <div style={{ height: 'max(env(safe-area-inset-bottom), 12px)' }} />
      </div>
    </>
  )
}
