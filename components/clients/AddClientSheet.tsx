'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { AddClientForm } from '@/components/clients/AddClientForm'

interface AddClientSheetProps {
  open:    boolean
  onClose: () => void
}

export function AddClientSheet({ open, onClose }: AddClientSheetProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [clientAdded, setClientAdded] = useState(false)

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

  return (
    <WorkspaceShell
      open={open}
      onClose={onClose}
      label="Add client"
      header={
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
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
      }
    >
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
    </WorkspaceShell>
  )
}
