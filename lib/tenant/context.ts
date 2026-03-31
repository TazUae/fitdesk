import "server-only";

import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceProvisioning } from "@/lib/db/schema";

export type TenantContext = {
  userId: string;
  slug: string | null;
  tenantId: string | null;
  provisioningStatus: string | null;
  lastSyncedAt: string | null;
};

/**
 * Returns cached tenant provisioning context from local DB only.
 * No ERP calls are made here.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) return null;

  const latest = await db.query.workspaceProvisioning.findFirst({
    where: eq(workspaceProvisioning.userId, session.user.id),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  });

  return {
    userId: session.user.id,
    slug: latest?.slug ?? null,
    tenantId: latest?.tenantId ?? null,
    provisioningStatus: latest?.status ?? null,
    lastSyncedAt: latest?.lastSyncedAt ?? null,
  };
}
