import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { workspaceProvisioning } from '@/lib/db/schema'
import { getTrainerWhatsAppConnection } from '@/lib/evolution'
import { getTrainerId } from '@/lib/trainer'

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.id) redirect('/auth/login?callbackUrl=/onboarding')

  // ── Provisioning status ───────────────────────────────────────────────────
  const latestProvisioning = await db.query.workspaceProvisioning.findFirst({
    where: eq(workspaceProvisioning.userId, session.user.id),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  })

  const provisioningDone = latestProvisioning?.status === 'completed'

  // ── WhatsApp status (only worth checking if provisioning is done) ─────────
  let whatsappDone = false
  if (provisioningDone) {
    try {
      const trainerId = await getTrainerId(session.user.id)
      if (trainerId) {
        const conn = await getTrainerWhatsAppConnection(trainerId)
        whatsappDone = conn?.status === 'connected'
      }
    } catch {
      // Non-fatal — just show the WhatsApp step
    }
  }

  // ── Both done → skip onboarding entirely ─────────────────────────────────
  if (provisioningDone && whatsappDone) redirect('/dashboard')

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
      whatsappDone={whatsappDone}
    />
  )
}
