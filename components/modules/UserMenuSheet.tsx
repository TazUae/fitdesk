'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Settings, LogOut, X } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { Avatar } from './Avatar'

interface UserMenuSheetProps {
  open:      boolean
  onClose:   () => void
  userName:  string
  userEmail: string
}

export function UserMenuSheet({ open, onClose, userName, userEmail }: UserMenuSheetProps) {
  const router = useRouter()

  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [signingOut,        setSigningOut]        = useState(false)

  const cancelBtnRef = useRef<HTMLButtonElement>(null)

  // Reset confirmation state whenever the sheet closes
  useEffect(() => {
    if (!open) setConfirmingSignOut(false)
  }, [open])

  // Focus Cancel button when confirmation appears
  useEffect(() => {
    if (confirmingSignOut) cancelBtnRef.current?.focus()
  }, [confirmingSignOut])

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Escape key: cancel confirmation if active, otherwise close sheet
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (confirmingSignOut) {
        setConfirmingSignOut(false)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, confirmingSignOut, onClose])

  async function handleConfirmSignOut() {
    if (signingOut) return
    setSigningOut(true)
    await signOut()
    router.replace('/auth/login')
  }

  const itemBase =
    'flex w-full items-center gap-3.5 px-6 py-4 text-sm font-medium transition-colors active:opacity-60'

  return (
    <>
      {/* ── Backdrop ───────────────────────────────────────────────────────── */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(0,0,0,0.6)',
          opacity:          open ? 1 : 0,
          pointerEvents:    open ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />

      {/* ── Sheet ──────────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account menu"
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 rounded-t-[28px] border-t"
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor:     'var(--fd-border)',
          transform:       `translateX(-50%) translateY(${open ? '0%' : '100%'})`,
          transition:      'transform 300ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full transition-opacity active:opacity-60"
          style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>

        {/* User identity */}
        <div
          className="flex items-center gap-4 border-b px-6 py-5"
          style={{ borderColor: 'var(--fd-border)' }}
        >
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

        {/* ── Confirmation section (replaces menu items while confirming) ─── */}
        {confirmingSignOut ? (
          <div
            className="px-6 py-6"
            aria-live="polite"
          >
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
          /* ── Normal menu items ────────────────────────────────────────── */
          <div className="py-2">
            <Link
              href="/dashboard/account"
              onClick={onClose}
              className={itemBase}
              style={{ color: 'var(--fd-text)' }}
            >
              <Settings className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
              Account Settings
            </Link>

            {/* Divider */}
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

        {/* iPhone home bar clearance */}
        <div style={{ height: 'max(env(safe-area-inset-bottom), 12px)' }} />
      </div>
    </>
  )
}
