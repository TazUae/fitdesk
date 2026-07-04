'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { QuickActions } from '@/features/dashboard/components/QuickActions'

export function QuickActionsFab() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* FAB — mobile only, above the bottom nav */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 lg:hidden"
        style={{
          right:           '1rem',
          bottom:          'calc(4rem + env(safe-area-inset-bottom) + 1rem)',
          backgroundColor: 'var(--fd-accent)',
          color:           'var(--fd-bg)',
        }}
        aria-label="Quick actions"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <WorkspaceShell
        open={open}
        onClose={() => setOpen(false)}
        label="Quick actions"
        mobileOnly
        header={
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
        }
      >
        <div className="px-6 pb-4">
          <QuickActions />
        </div>
        <div style={{ height: 'max(env(safe-area-inset-bottom), 12px)' }} />
      </WorkspaceShell>
    </>
  )
}
