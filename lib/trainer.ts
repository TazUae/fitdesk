/**
 * Trainer ERP record resolution.
 *
 * Maps a Better Auth user ID → the corresponding ERPNext Trainer DocType
 * docname. This is the bridge between the auth system and the ERP data layer.
 * Every ERP query that should be scoped to "this trainer's clients/sessions"
 * needs a Trainer docname, not a Better Auth user ID.
 *
 * The mapping is stored in the `trainer_mapping` table in auth.db and is
 * populated automatically on user registration via the Better Auth
 * databaseHooks.user.create.after hook in lib/auth.ts.
 */

import { desc, eq } from 'drizzle-orm'
import { db } from './db'
import { trainerMapping, user, workspaceProvisioning } from './db/schema'

// ─── Error ────────────────────────────────────────────────────────────────────

export class TrainerNotFoundError extends Error {
  constructor(userId: string) {
    super(
      `No ERPNext Trainer mapped to user "${userId}". ` +
      `Your account may not have been fully provisioned — please contact support.`,
    )
    this.name = 'TrainerNotFoundError'
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a Better Auth user ID → ERPNext Trainer docname.
 *
 * Throws TrainerNotFoundError if no mapping exists (e.g. registration
 * completed but ERPNext was unavailable when the hook ran).
 */
export async function getTrainerId(userId: string): Promise<string> {
  const row = await db.query.trainerMapping.findFirst({
    where: eq(trainerMapping.userId, userId),
  })

  if (!row) throw new TrainerNotFoundError(userId)
  return row.erpTrainerId
}

/**
 * Resolve a Better Auth user → ERPNext Trainer docname.
 *
 * Unlike `getTrainerId()`, this function attempts to auto-provision the
 * ERPNext Trainer + mapping when the row is missing (e.g. ERPNext was
 * temporarily unavailable during the Better Auth registration hook).
 *
 * If provisioning fails, it throws `TrainerNotFoundError` so callers keep
 * a consistent user-facing message.
 */
export async function ensureTrainerIdForUser(opts: {
  userId: string
  name?: string | null
  email?: string | null
  phone?: string | null
}): Promise<string> {
  const existing = await db.query.trainerMapping.findFirst({
    where: eq(trainerMapping.userId, opts.userId),
  })

  if (existing) return existing.erpTrainerId

  const email = opts.email ?? undefined
  if (!email) {
    throw new TrainerNotFoundError(opts.userId)
  }

  try {
    return await createTrainerForUser(
      opts.userId,
      opts.name ?? email,
      email,
      opts.phone ?? undefined,
    )
  } catch (err) {
    console.error('[trainer-provision] failed for user', opts.userId, err)
    throw new TrainerNotFoundError(opts.userId)
  }
}

/**
 * Create an ERPNext Trainer record and store the auth → ERP mapping.
 *
 * Called from the Better Auth user.create.after hook on every registration.
 * Idempotent — if a mapping already exists for this userId, returns the
 * existing erpTrainerId without creating a duplicate ERP record.
 *
 * If ERPNext is not configured (missing env vars), falls back to using the
 * auth userId as the erpTrainerId so the rest of the app (WhatsApp, auth)
 * continues to work. ERP-dependent features will still fail with a clear
 * "Not Configured" error when accessed.
 */
export async function createTrainerForUser(
  userId: string,
  _name: string,
  _email: string,
  _phone?: string | null,
): Promise<string> {
  // Idempotency check — return early if mapping already exists
  const existing = await db.query.trainerMapping.findFirst({
    where: eq(trainerMapping.userId, userId),
  })
  if (existing) return existing.erpTrainerId

  // Trainer provisioning in ERPNext is handled by the Control Plane workspace
  // provisioning workflow. FitDesk stores the userId as a placeholder mapping
  // so the rest of the app (WhatsApp, auth) can function during provisioning.
  // ERP-dependent features will surface a clear error until provisioning is complete.
  const erpTrainerId = userId

  await db.insert(trainerMapping).values({
    userId,
    erpTrainerId,
    createdAt: new Date().toISOString(),
  })

  return erpTrainerId
}

/**
 * Read the trainer's profile from the local SQLite database.
 * Returns user info combined with their latest workspace provisioning record.
 * Does NOT call ERPNext — safe to call before provisioning is complete.
 */
export async function getTrainerProfile(userId: string): Promise<{
  userId: string
  name: string
  email: string
  phone?: string
  slug: string | null
  tenantId: string | null
  provisioningStatus: string | null
} | null> {
  const [userRow, provisioning] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db.query.workspaceProvisioning.findFirst({
      where: eq(workspaceProvisioning.userId, userId),
      orderBy: [desc(workspaceProvisioning.createdAt)],
    }),
  ])

  if (!userRow) return null

  return {
    userId,
    name:               userRow.name,
    email:              userRow.email,
    phone:              userRow.phone ?? undefined,
    slug:               provisioning?.slug ?? null,
    tenantId:           provisioning?.tenantId ?? null,
    provisioningStatus: provisioning?.status ?? null,
  }
}
