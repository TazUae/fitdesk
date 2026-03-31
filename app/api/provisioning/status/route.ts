import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceProvisioning } from "@/lib/db/schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ status: null }, { status: 401 });
  }

  const latest = await db.query.workspaceProvisioning.findFirst({
    where: eq(workspaceProvisioning.userId, session.user.id),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  });

  return NextResponse.json({
    status: latest?.status ?? null,
  });
}
