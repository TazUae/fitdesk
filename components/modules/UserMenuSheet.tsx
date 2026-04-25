'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Settings, HelpCircle, LogOut, X } from 'lucide-react'
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

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function handleSignOut() {
    onClose()
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
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 rounded-t-3xl border-t"
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
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-opacity active:opacity-60"
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

        {/* Menu items */}
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

          <Link
            href="/dashboard/help"
            onClick={onClose}
            className={itemBase}
            style={{ color: 'var(--fd-text)' }}
          >
            <HelpCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            Help &amp; Support
          </Link>

          {/* Divider */}
          <div className="my-2 border-t" style={{ borderColor: 'var(--fd-border)' }} />

          <button
            onClick={handleSignOut}
            className={itemBase}
            style={{ color: 'var(--fd-red)' }}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign Out
          </button>
        </div>

        {/* iPhone home bar clearance */}
        <div style={{ height: 'max(env(safe-area-inset-bottom), 12px)' }} />
      </div>
    </>
  )
}
