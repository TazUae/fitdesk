"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { JobStatusResponse } from "@/types/controlplane";

type InitialRecord = {
  jobId: string;
  status: string;
  failureReason?: string | null;
};

type ProvisioningStatusProps = {
  initialRecord: InitialRecord | null;
  onComplete?: () => void;
};

const STEP_MESSAGE: Record<string, string> = {
  queued: "Preparing your workspace",
  site_created: "Creating ERP workspace",
  erp_installed: "Installing modules",
  scheduler_enabled: "Configuring background services",
  domain_registered: "Connecting your domain",
  api_keys_generated: "Securing workspace",
  warmup_completed: "Finalizing setup",
};

export function ProvisioningStatus({ initialRecord, onComplete }: ProvisioningStatusProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const [pollingRunId, setPollingRunId] = useState(0);
  const pollingDelayRef = useRef(2000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep onComplete stable — updating a ref doesn't retrigger the polling effect
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const jobId = initialRecord?.jobId ?? null;
  const status = job?.status ?? initialRecord?.status ?? "queued";
  const step = job?.currentStep ?? "queued";
  const message = useMemo(() => STEP_MESSAGE[step] ?? "Preparing your workspace", [step]);

  useEffect(() => {
    if (!jobId) return;

    const timeout = setTimeout(() => {
      setShowSlowNotice(true);
    }, 120_000);

    return () => clearTimeout(timeout);
  }, [jobId]);

  useEffect(() => {
    if (!jobId || status === "completed") return;

    let isActive = true;

    const poll = async () => {
      try {
        const response = await fetch(`/api/controlplane/jobs/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || "Failed to fetch provisioning status");
        }

        const data = (await response.json()) as JobStatusResponse;
        if (!isActive) return;

        setJob(data);
        setError(null);

        if (data.status === "completed") {
          if (onCompleteRef.current) {
            onCompleteRef.current();
          } else {
            router.replace("/dashboard");
          }
          return;
        }

        if (data.status === "failed") {
          return;
        }

        pollingDelayRef.current = Math.min(pollingDelayRef.current + 1000, 8000);
        timerRef.current = setTimeout(poll, pollingDelayRef.current);
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : "Failed to fetch status");
        pollingDelayRef.current = Math.min(pollingDelayRef.current + 1000, 8000);
        timerRef.current = setTimeout(poll, pollingDelayRef.current);
      }
    };

    timerRef.current = setTimeout(poll, pollingDelayRef.current);

    return () => {
      isActive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, pollingRunId, router, status]);

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      setError(null);
      const response = await fetch("/api/workspace/retry", {
        method: "POST",
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Retry failed");
      }

      setJob(null);
      setShowSlowNotice(false);
      pollingDelayRef.current = 2000;
      if (timerRef.current) clearTimeout(timerRef.current);
      setPollingRunId((prev) => prev + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retry failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  };

  if (!initialRecord) {
    return (
      <div className="rounded-xl border p-4 text-sm">
        No provisioning job found yet. Please contact support if this persists.
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium text-red-600">Provisioning failed.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {job?.failureReason ?? initialRecord.failureReason ?? "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isRetrying ? "Retrying..." : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="text-sm font-medium">{message}</p>
      </div>
      <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
        Current step: {step.replace(/_/g, " ")}
      </p>
      {showSlowNotice ? (
        <p className="mt-3 text-sm text-muted-foreground">Still working...</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
