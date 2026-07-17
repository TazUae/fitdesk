import { Suspense } from 'react'
import { DashboardClientShell } from '@/components/modules/DashboardClientShell'
import { PilotBanner } from '@/components/ui/PilotBanner'
import { isPilotMode } from '@/lib/pilot'

export default function DashboardLayout({
  children,
  overlay,
}: {
  children: React.ReactNode
  overlay:  React.ReactNode
}) {
  const pilot = isPilotMode()
  return (
    <DashboardClientShell banner={<PilotBanner enabled={pilot} />}>
      {children}
      <Suspense fallback={null}>{overlay}</Suspense>
    </DashboardClientShell>
  )
}
