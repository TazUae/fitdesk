'use client'

import type { ReactNode } from 'react'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Plain-language statement of exactly what confirming will do. */
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Use 'destructive' for cancellations/deletions, 'primary' otherwise. */
  tone?: 'primary' | 'destructive'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Product-styled replacement for window.confirm(). Confirmed-first doctrine:
 * the body must state the concrete consequence, never a vague "Are you sure?".
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <WorkspaceShell
      open={open}
      onClose={loading ? () => {} : onClose}
      label={title}
      header={
        <div className="px-5 pb-1 pt-4">
          <p className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>{title}</p>
        </div>
      }
      footer={
        <div
          className="flex flex-col gap-2 border-t px-5 pt-3"
          style={{ borderColor: 'var(--fd-border)', paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
        >
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            size="lg"
            block
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" block disabled={loading} onClick={onClose}>
            {cancelLabel}
          </Button>
        </div>
      }
    >
      <div className="px-5 py-3 text-sm" style={{ color: 'var(--fd-text)' }}>
        {body}
      </div>
    </WorkspaceShell>
  )
}
