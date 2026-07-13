'use client'

import { useEffect, useId, useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AddClientGoalWorkspace,
  workspaceReducer,
  workspaceStateFromGoals,
  toSelectedGoalDrafts,
  hasWorkspaceHardConflict,
} from '@/components/clients/GoalWorkspace'
import { updateClientGoalsAction } from '@/actions/clients'
import type { ClientGoalSummary } from '@/types/clients'

interface GoalEditorSheetProps {
  open:          boolean
  clientIndexId: string
  goals:         ClientGoalSummary[]
  onClose:       () => void
}

/**
 * Phase 4 — reachable Client Hub goal editor.
 *
 * Mobile-first bottom sheet reusing the GoalWorkspace reducer/components. Seeds
 * from the client's current active goals, submits the COMPLETE desired active set
 * via updateClientGoalsAction (strict replace-set; trainerNotes always included).
 *
 * Confirmed-first: the sheet stays open while saving, success shows only after a
 * typed server success, the server view refreshes on success, and a failed save
 * keeps the sheet open with the trainer's input intact. No optimistic success,
 * no client-side Undo for a persisted mutation.
 */
export function GoalEditorSheet({ open, clientIndexId, goals, onClose }: GoalEditorSheetProps) {
  const router = useRouter()
  const titleId = useId()
  const [state, dispatch] = useReducer(workspaceReducer, goals, workspaceStateFromGoals)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed whenever the sheet is (re)opened, so it always reflects the latest
  // server state and discards any un-saved edits from a previous open.
  useEffect(() => {
    if (open) {
      dispatch({ type: 'HYDRATE', state: workspaceStateFromGoals(goals) })
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Escape closes (only when not mid-save).
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, pending, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const hardBlocked = hasWorkspaceHardConflict(state)

  async function handleSave() {
    if (pending || hardBlocked) return
    setPending(true)
    setError(null)
    try {
      const drafts = toSelectedGoalDrafts(state)
      const result = await updateClientGoalsAction(clientIndexId, drafts)
      if (result.success) {
        toast.success('Goals updated.')
        router.refresh()          // pull the fresh server state
        onClose()                 // close only after confirmed success
      } else {
        setError(result.error || 'Could not update goals. Please try again.')
      }
    } catch {
      setError('Could not update goals. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div
        onClick={() => { if (!pending) onClose() }}
        className="fixed inset-0 z-40 backdrop-blur-[2px]"
        style={{ backgroundColor: 'rgba(15,23,42,0.55)' }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed bottom-0 left-1/2 z-50 flex max-h-[90vh] w-full max-w-[560px] -translate-x-1/2 flex-col rounded-t-[28px] border-t"
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

        <div className="flex items-center justify-between px-6 pt-2">
          <p id={titleId} className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            Edit goals
          </p>
          <button
            type="button"
            onClick={() => { if (!pending) onClose() }}
            disabled={pending}
            className="rounded-lg px-2 py-1 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ color: 'var(--fd-muted)' }}
          >
            Close
          </button>
        </div>

        {/* Scrollable workspace body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <AddClientGoalWorkspace state={state} dispatch={dispatch} />
        </div>

        {/* Footer: error + confirmed-first save */}
        <div className="border-t px-6 pt-3" style={{ borderColor: 'var(--fd-border)' }}>
          {error && (
            <p className="mb-2 text-sm" role="alert" style={{ color: 'var(--fd-red)' }}>
              {error}
            </p>
          )}
          {hardBlocked && (
            <p className="mb-2 text-sm" role="alert" style={{ color: 'var(--fd-red)' }}>
              Resolve the blocked goal combination before saving.
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || hardBlocked}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-50 active:opacity-60"
            style={{ backgroundColor: 'var(--fd-green)', color: '#fff' }}
          >
            {pending ? 'Saving…' : 'Save goals'}
          </button>
        </div>
      </div>
    </>
  )
}
