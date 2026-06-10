'use client'

import { useRef, useState } from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateAge(dob: string): number {
  const birthDate = new Date(dob)
  const today     = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgeValue {
  age?:           number
  date_of_birth?: string
}

interface AgeInputProps {
  value?:   AgeValue
  onChange: (value: AgeValue) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgeInput({ value, onChange }: AgeInputProps) {
  const [showDob,  setShowDob]  = useState(!!value?.date_of_birth)
  const ageIsManual = useRef(false)

  const age = value?.age
  const dob = value?.date_of_birth ?? ''

  function handleAgeChange(raw: string) {
    ageIsManual.current = true
    const parsed = raw === '' ? undefined : parseInt(raw, 10)
    onChange({ ...value, age: parsed !== undefined && !isNaN(parsed) ? parsed : undefined })
  }

  function handleDobChange(newDob: string) {
    if (!newDob) {
      onChange({ ...value, date_of_birth: undefined })
      return
    }

    const calc = calculateAge(newDob)
    const isValid = calc >= 10 && calc <= 100

    if (!ageIsManual.current && isValid) {
      onChange({ age: calc, date_of_birth: newDob })
    } else {
      onChange({ ...value, date_of_birth: newDob })
    }

    ageIsManual.current = false
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Age
          <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>(optional)</span>
        </label>
        <input
          type="number"
          min={10}
          max={100}
          value={age ?? ''}
          onChange={e => handleAgeChange(e.target.value)}
          placeholder="e.g. 28"
          className="input-base"
          style={{ colorScheme: 'dark' }}
        />
      </div>

      {!showDob && (
        <button
          type="button"
          onClick={() => setShowDob(true)}
          className="text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--fd-muted)' }}
        >
          + Add date of birth (optional)
        </button>
      )}

      {showDob && (
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Date of Birth
            <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>(optional)</span>
          </label>
          <input
            type="date"
            value={dob}
            onChange={e => handleDobChange(e.target.value)}
            className="input-base"
            style={{ colorScheme: 'dark' }}
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
