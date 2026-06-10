'use client'

import { useState } from 'react'

interface FilterItem {
  id:    string
  label: string
  color: string
}

const DEFAULT_FILTERS: FilterItem[] = [
  { id: 'sessions',  label: 'Sessions',          color: 'var(--fd-blue)' },
  { id: 'confirmed', label: 'Confirmed',         color: 'var(--fd-green)' },
  { id: 'pending',   label: 'Pending invoices',  color: 'var(--fd-warning)' },
  { id: 'messages',  label: 'WhatsApp activity', color: '#9334E6' },
]

export function CalendarFilters() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_FILTERS.map(f => [f.id, true])),
  )

  return (
    <section aria-label="Calendar filters" className="px-3 py-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
        My calendars
      </p>
      <ul className="space-y-1">
        {DEFAULT_FILTERS.map(f => {
          const on = enabled[f.id]
          return (
            <li key={f.id}>
              <label
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--fd-card-hover)]"
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border"
                  style={{
                    backgroundColor: on ? f.color : 'transparent',
                    borderColor:     on ? f.color : 'var(--fd-border-strong)',
                  }}
                  aria-hidden="true"
                >
                  {on && (
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 8 7 12 13 4" />
                    </svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setEnabled(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                  className="sr-only"
                />
                <span className="text-sm" style={{ color: 'var(--fd-text)' }}>{f.label}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
