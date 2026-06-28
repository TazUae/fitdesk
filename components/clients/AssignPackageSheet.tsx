'use client'

import { X } from 'lucide-react'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { AssignPackageForm } from '@/components/clients/AssignPackageForm'

export interface AssignPackageSheetProps {
  open:          boolean
  onClose:       () => void
  clientIndexId: string
  erpCustomerId: string
}

export function AssignPackageSheet({
  open,
  onClose,
  clientIndexId,
  erpCustomerId,
}: AssignPackageSheetProps) {
  return (
    <WorkspaceShell
      open={open}
      onClose={onClose}
      label="Assign package"
      header={
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            Assign package
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
      <AssignPackageForm
        clientIndexId={clientIndexId}
        erpCustomerId={erpCustomerId}
        onClose={onClose}
      />
    </WorkspaceShell>
  )
}
