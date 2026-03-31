import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProvisioningStatus } from "@/components/onboarding/provisioning-status";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceProvisioning } from "@/lib/db/schema";

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: headers() });

  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/onboarding");
  }

  const latestProvisioning = await db.query.workspaceProvisioning.findFirst({
    where: eq(workspaceProvisioning.userId, session.user.id),
    orderBy: [desc(workspaceProvisioning.createdAt)],
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
      <h1 className="text-2xl font-semibold">Setting up your workspace</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We are preparing your FitDesk workspace. This usually takes a minute or two.
      </p>

      <div className="mt-8">
        <ProvisioningStatus
          initialRecord={
            latestProvisioning
              ? {
                  jobId: latestProvisioning.jobId,
                  status: latestProvisioning.status,
                  failureReason: latestProvisioning.failureReason,
                }
              : null
          }
        />
      </div>
    </main>
  );
}
