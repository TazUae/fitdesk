import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProvisioningStatus } from "@/features/onboarding/components/provisioning-status";
import { WorkspaceSetupForm } from "@/features/onboarding/components/workspace-setup-form";
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

  // Completed → server-side redirect (closes D3: completed users no longer stuck on spinner)
  if (latestProvisioning?.status === "completed") {
    redirect("/dashboard");
  }

  // No row → workspace setup form (closes D4/D6: new users and reset users see the form)
  if (!latestProvisioning) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
        <WorkspaceSetupForm />
      </main>
    );
  }

  // Active (queued/running), Failed, or any unknown status → provisioning status component.
  // Unknown statuses fall through here (conservative: keep polling, never auto-redirect).
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
      <ProvisioningStatus
        initialRecord={{
          jobId: latestProvisioning.jobId,
          status: latestProvisioning.status,
          failureReason: latestProvisioning.failureReason,
        }}
      />
    </main>
  );
}
