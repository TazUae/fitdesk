import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { ensureTrainerIdForUser } from '@/lib/trainer'

export async function resolveTrainerId(): Promise<{ trainerId: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { error: 'Not authenticated.' }
  const sessionPhone =
    typeof (session.user as { phone?: string | null }).phone === 'string'
      ? (session.user as { phone?: string | null }).phone
      : undefined
  try {
    const trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name:   session.user.name,
      email:  session.user.email,
      phone:  sessionPhone,
    })
    return { trainerId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }
}
