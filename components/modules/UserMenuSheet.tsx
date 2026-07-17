'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, User, SlidersHorizontal, LifeBuoy, LogOut, X } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { Avatar } from '@/components/ui/Avatar'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'

interface UserMenuSheetProps {
  open:      boolean
  onClose:   () => void
  userName:  string
  userEmail: string
}

export function UserMenuSheet({ open, onClose, userName, userEmail }: UserMenuSheetProps) {
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [signingOut,        setSigningOut]        = useState(false)

  const cancelBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) setConfirmingSignOut(false)
  }, [open])

  useEffect(() => {
    if (confirmingSignOut) cancelBtnRef.current?.focus()
  }, [confirmingSignOut])

  async function handleConfirmSignOut() {
    if (signingOut) return
    setSigningOut(true)
    await signOut()
    window.location.assign('/auth/login')
  }

  const itemBase =
    'flex w-full items-center gap-3.5 px-6 py-4 text-sm font-medium transition-colors active:opacity-60'

  return (
    <WorkspaceShell
      open={open}
      onClose={onClose}
      label="Account menu"
      header={
        <div
          className="flex items-center justify-between gap-4 border-b px-6 py-5"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={userName || 'Trainer'} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
                {userName || 'Trainer'}
              </p>
              <p className="truncate text-xs" style={{ color: 'var(--fd-muted)' }}>
                {userEmail}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
    >
      {confirmingSignOut ? (
        <div className="px-6 py-6" aria-live="polite">
          <p className="mb-1 text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            Sign out of FitDesk?
          </p>
          <p className="mb-6 text-sm" style={{ color: 'var(--fd-muted)' }}>
            You will need to sign in again to access your workspace.
          </p>
          <div className="flex gap-3">
            <button
              ref={cancelBtnRef}
              onClick={() => setConfirmingSignOut(false)}
              disabled={signingOut}
              className="flex-1 rounded-xl border py-3 text-sm font-semibold transition-opacity disabled:opacity-50 active:opacity-60"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSignOut}
              disabled={signingOut}
              className="flex-1 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-50 active:opacity-60"
              style={{ backgroundColor: 'var(--fd-red)', color: '#fff' }}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : (
        <div className="py-2">
          <Link
            href="/dashboard/account"
            onClick={onClose}
            className={itemBase}
            style={{ color: 'var(--fd-text)' }}
          >
            <User className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            Profile
          </Link>

          <Link
            href="/dashboard/settings"
            onClick={onClose}
            className={itemBase}
            style={{ color: 'var(--fd-text)' }}
          >
            <SlidersHorizontal className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            Workspace Settings
          </Link>

          <Link
            href="/dashboard/whatsapp"
            onClick={onClose}
            className={itemBase}
            style={{ color: 'var(--fd-text)' }}
          >
            <MessageCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            WhatsApp &amp; Reminders
          </Link>

          <Link
            href="/dashboard/help"
            onClick={onClose}
            className={itemBase}
            style={{ color: 'var(--fd-text)' }}
          >
            <LifeBuoy className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            Help &amp; Support
          </Link>

          <div className="my-2 border-t" style={{ borderColor: 'var(--fd-border)' }} />

          <button
            onClick={() => setConfirmingSignOut(true)}
            className={itemBase}
            style={{ color: 'var(--fd-red)' }}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign Out
          </button>
        </div>
      )}

      <div style={{ height: 'max(env(safe-area-inset-bottom), 12px)' }} />
    </WorkspaceShell>
  )
}
