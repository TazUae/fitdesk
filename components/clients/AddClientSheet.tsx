'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AddClientForm } from '@/components/clients/AddClientForm'

interface AddClientSheetProps {
  open:    boolean
  onClose: () => void
}

export function AddClientSheet({ open, onClose }: AddClientSheetProps) {
  const nameRef = useRef<HTMLInputElement>(null)

  const [isDesktop,    setIsDesktop]    = useState(false)
  const [clientAdded,  setClientAdded]  = useState(false)

  // Detect desktop viewport (lg = 1024px)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Escape key closes
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus name field after sheet animates in
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => nameRef.current?.focus(), 60)
    return () => clearTimeout(id)
  }, [open])

  // Reset clientAdded flag after the close animation finishes
  useEffect(() => {
    if (open) return
    const id = setTimeout(() => setClientAdded(false), 350)
    return () => clearTimeout(id)
  }, [open])

  const containerClass = isDesktop
    ? 'fixed top-0 right-0 z-50 flex h-full w-full max-w-[460px] flex-col border-l rounded-l-[20px]'
    : 'fixed bottom-0 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 flex-col rounded-t-[28px] border-t'

  const containerStyle: React.CSSProperties = {
    backgroundColor: 'var(--fd-surface)',
    borderColor:     'var(--fd-border)',
    transition:      'transform 300ms cubic-bezier(0.32,0.72,0,1)',
    ...(isDesktop
      ? { transform: `translateX(${open ? '0%' : '100%'})` }
      : {
          transform: `translateX(-50%) translateY(${open ? '0%' : '100%'})`,
          maxHeight: '90dvh',
        }
    ),
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(15,23,42,0.55)',
          opacity:          open ? 1 : 0,
          pointerEvents:    open ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />

      {/* Sheet / Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add client"
        className={containerClass}
        style={containerStyle}
      >
        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
          </div>
        )}

        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            {clientAdded ? 'Client added' : 'Add client'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shared form — sheet variant */}
        <AddClientForm
          variant="sheet"
          nameInputRef={nameRef}
          onClose={onClose}
          onCreated={() => setClientAdded(true)}
          onReset={() => {
            setClientAdded(false)
            setTimeout(() => nameRef.current?.focus(), 60)
          }}
        />
      </div>
    </>
  )
}
