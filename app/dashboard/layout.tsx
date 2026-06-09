import { DashboardClientShell } from '@/components/modules/DashboardClientShell'
import { PilotBanner } from '@/components/modules/PilotBanner'
import { isPilotMode } from '@/lib/pilot'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pilot = isPilotMode()
  return (
    <DashboardClientShell banner={<PilotBanner enabled={pilot} />}>
      {children}
    </DashboardClientShell>
  )
}
