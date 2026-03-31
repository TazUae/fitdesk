import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { retryJob } from "@/lib/controlplane/client";
import { db } from "@/lib/db";
import { workspaceProvisioning } from "@/lib/db/schema";

export async function POST() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const latestFailed = await db.query.workspaceProvisioning.findFirst({
    where: and(
      eq(workspaceProvisioning.userId, session.user.id),
      eq(workspaceProvisioning.status, "failed"),
    ),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  });

  if (!latestFailed) {
    return NextResponse.json(
      { success: false, error: "No failed provisioning job found" },
      { status: 404 },
    );
  }

  await retryJob(latestFailed.jobId);

  const now = new Date().toISOString();
  await db
    .update(workspaceProvisioning)
    .set({
      status: "queued",
      failureReason: null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(workspaceProvisioning.id, latestFailed.id));

  return NextResponse.json({ success: true, jobId: latestFailed.jobId, status: "queued" });
}
