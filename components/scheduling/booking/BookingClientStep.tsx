'use client'

import { SmartClientPicker } from '@/components/clients/SmartClientPicker'
import type { Client } from '@/types'
import type { PackageBalanceState } from '@/types/scheduling'

interface BookingClientStepProps {
  clients:        Client[]
  selectedId:     string | null
  packageBalance: PackageBalanceState | null
  onSelect:       (id: string) => void
}

/**
 * Step 1 — Client.
 *
 * Reuses the existing SmartClientPicker so search behavior, suggested
 * clients, and remaining-sessions chip remain consistent across the app.
 */
export function BookingClientStep({
  clients,
  selectedId,
  packageBalance,
  onSelect,
}: BookingClientStepProps) {
  const remaining = packageBalance?.remainingSessions ?? undefined

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          Who is this for?
        </h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--fd-muted)' }}>
          Search or pick from your recent clients.
        </p>
      </header>

      <SmartClientPicker
        clients={clients}
        selectedId={selectedId ?? ''}
        remainingSessions={remaining}
        onSelect={onSelect}
      />
    </section>
  )
}
