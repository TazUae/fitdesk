import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { workspaceProvisioning } from '@/lib/db/schema'
import { getTrainerSettingsDoc } from '@/lib/erpnext/client'

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.id) redirect('/auth/login?callbackUrl=/onboarding')

  // ── Provisioning status ───────────────────────────────────────────────────
  const latestProvisioning = await db.query.workspaceProvisioning.findFirst({
    where: eq(workspaceProvisioning.userId, session.user.id),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  })

  const provisioningDone = latestProvisioning?.status === 'completed'

  // ── Availability status (only worth checking once provisioning is done) ──
  //
  // `initialized = 1` on the FitDesk Trainer Settings singleton is the
  // onboarding completion signal. No separate FitDesk-side flag needed.
  let availabilityDone = false
  if (provisioningDone) {
    try {
      const settings = await getTrainerSettingsDoc()
      availabilityDone = settings?.initialized === 1
    } catch {
      // Non-fatal — just show the availability step.
    }
  }

  // ── Both done → skip onboarding entirely ─────────────────────────────────
  if (provisioningDone && availabilityDone) redirect('/dashboard')

  return (
    <OnboardingWizard
      initialRecord={
        latestProvisioning
          ? {
              jobId: latestProvisioning.jobId,
              status: latestProvisioning.status,
              failureReason: latestProvisioning.failureReason,
            }
          : null
      }
      provisioningDone={provisioningDone}
      availabilityDone={availabilityDone}
    />
  )
}
