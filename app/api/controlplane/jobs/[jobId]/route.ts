import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceProvisioning } from "@/lib/db/schema";
import { getJob, retryJob } from "@/lib/controlplane/client";
import { isTrustedMutationOrigin } from "@/lib/security/trusted-mutation-origin";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = (await context.params);
  const record = await db.query.workspaceProvisioning.findFirst({
    where: and(
      eq(workspaceProvisioning.userId, session.user.id),
      eq(workspaceProvisioning.jobId, jobId),
    ),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  });

  if (!record) {
    return NextResponse.json({ error: "Provisioning job not found" }, { status: 404 });
  }

  const job = await getJob(jobId);
  const now = new Date().toISOString();

  await db
    .update(workspaceProvisioning)
    .set({
      status: job.status,
      failureReason: job.failureReason ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(workspaceProvisioning.id, record.id));

  return NextResponse.json(job);
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const { jobId } = (await context.params);
  const record = await db.query.workspaceProvisioning.findFirst({
    where: and(
      eq(workspaceProvisioning.userId, session.user.id),
      eq(workspaceProvisioning.jobId, jobId),
    ),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  });

  if (!record) {
    return NextResponse.json({ error: "Provisioning job not found" }, { status: 404 });
  }

  const job = await retryJob(jobId);
  const now = new Date().toISOString();

  await db
    .update(workspaceProvisioning)
    .set({
      status: job.status,
      failureReason: job.failureReason ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(workspaceProvisioning.id, record.id));

  return NextResponse.json(job);
}
