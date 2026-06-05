import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceProvisioning } from "@/lib/db/schema";
import { cpFetch } from "@/lib/controlplane/client";

export async function GET() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ status: null }, { status: 401 });
  }

  const latest = await db.query.workspaceProvisioning.findFirst({
    where: eq(workspaceProvisioning.userId, session.user.id),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  });

  if (!latest) {
    return NextResponse.json({ status: null });
  }

  // When SQLite says "completed", verify the tenant still exists in the
  // Control Plane. If CP returns 404, the record is stale (CP volume was
  // wiped or tenant was deleted). Mark it failed so the user can
  // re-provision through the normal onboarding flow.
  if (latest.status === "completed" && latest.tenantId) {
    try {
      await cpFetch(`/tenants/${latest.tenantId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.includes("not found")) {
        await db
          .update(workspaceProvisioning)
          .set({
            status: "failed",
            failureReason: "Workspace no longer found on server. Please set up your workspace again.",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(workspaceProvisioning.id, latest.id));

        return NextResponse.json({ status: "failed" });
      }
      // CP is temporarily unreachable — return the cached status rather
      // than incorrectly blocking the user.
    }
  }

  return NextResponse.json({ status: latest.status });
}
