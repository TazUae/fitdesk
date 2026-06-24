'use client'

import { useState } from 'react'

interface TrainerNotesTextareaProps {
  value:    string
  onCommit: (notes: string) => void
}

// Local draft buffer — prevents ledger re-renders while the trainer types.
// Syncs the committed value to the reducer on blur.
// Key this component by goalId to reset the draft when the active goal changes.
export function TrainerNotesTextarea({ value, onCommit }: TrainerNotesTextareaProps) {
  const [draft, setDraft] = useState(value)

  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      placeholder="Goal-specific trainer notes…"
      rows={2}
      className="input-base w-full resize-none"
      aria-label="Trainer notes for this goal"
    />
  )
}
