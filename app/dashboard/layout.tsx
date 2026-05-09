import { DashboardClientShell } from '@/components/modules/DashboardClientShell'
import { PilotBanner } from '@/components/modules/PilotBanner'
import { isPilotMode } from '@/lib/pilot'

/**
 * Server-rendered dashboard layout wrapper.
 *
 * Reads PILOT_MODE at request time (server-only env var) and renders the
 * pilot banner above the existing client shell. The shell holds all the
 * 'use client' navigation + sheet logic.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pilot = isPilotMode()
  return (
    <DashboardClientShell banner={<PilotBanner enabled={pilot} />}>
      {children}
    </DashboardClientShell>
  )
}
