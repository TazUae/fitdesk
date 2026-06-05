"use client";

import { useEffect, useRef, useState } from "react";
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

// All 15 real steps in execution order with trainer-friendly labels
const STEPS: { key: string; label: string }[] = [
  { key: "site_created",          label: "Creating your workspace" },
  { key: "erp_installed",         label: "Installing business tools" },
  { key: "scheduler_enabled",     label: "Starting background services" },
  { key: "locale_configured",     label: "Setting up your region" },
  { key: "company_created",       label: "Creating your company" },
  { key: "fiscal_year_created",   label: "Setting up fiscal year" },
  { key: "global_defaults_set",   label: "Configuring defaults" },
  { key: "setup_completed",       label: "Completing initial setup" },
  { key: "regional_setup",        label: "Applying regional settings" },
  { key: "domains_activated",     label: "Activating your domain" },
  { key: "fitdesk_configured",    label: "Configuring FitDesk" },
  { key: "app_installed_fitdesk", label: "Installing FitDesk app" },
  { key: "api_keys_generated",    label: "Securing your workspace" },
  { key: "warmup_completed",      label: "Warming up services" },
  { key: "smoke_test_passed",     label: "Running final checks" },
];

const STEP_INDEX: Record<string, number> = Object.fromEntries(
  STEPS.map((s, i) => [s.key, i])
);

// 5 high-level milestones visible in the checklist.
// terminalIdx: the STEPS index whose completion marks this milestone done.
const MILESTONES: { label: string; terminalIdx: number }[] = [
  { label: "Account created",     terminalIdx: -2 }, // always done — user is already here
  { label: "Creating workspace",  terminalIdx: 0  }, // site_created
  { label: "Installing modules",  terminalIdx: 1  }, // erp_installed
  { label: "Configuring account", terminalIdx: 9  }, // domains_activated
  { label: "Setting up FitDesk",  terminalIdx: 14 }, // smoke_test_passed
];

// Progress % weighted by actual time cost (site ~2 min, erp ~4 min, rest ~2 min)
function getProgress(currentStep: string, jobStatus: string): number {
  if (jobStatus === "completed") return 100;
  if (currentStep === "queued") return 3;
  const idx = STEP_INDEX[currentStep] ?? -1;
  if (idx === -1) return 3;
  if (idx === 0) return 25;  // site_created running
  if (idx === 1) return 52;  // erp_installed running (heaviest step)
  // steps 2–14: 52% → 97% spread evenly
  return Math.round(52 + ((idx - 1) / 13) * 45);
}

function getCurrentStepLabel(step: string): string {
  return STEPS.find(s => s.key === step)?.label ?? "Preparing your workspace";
}

function getEtaLabel(progress: number, jobStatus: string): string {
  if (jobStatus === "completed") return "Ready!";
  if (progress < 10) return "About 5–8 minutes total";
  if (progress < 80) return "Still working…";
  if (progress < 95) return "Almost there…";
  return "Finishing up…";
}

// "done" = step has passed milestone's terminal step
// "active" = this is the first non-done milestone
// "pending" = not yet reached
function getMilestoneStates(
  currentStep: string,
  jobStatus: string
): ("done" | "active" | "pending")[] {
  if (jobStatus === "completed") return MILESTONES.map(() => "done");

  const currentIdx = currentStep === "queued" ? -1 : (STEP_INDEX[currentStep] ?? -1);

  return MILESTONES.map((m, i) => {
    if (i === 0) return "done"; // "Account created" always done
    if (currentIdx > m.terminalIdx) return "done";
    // Active if the previous milestone is done (i.e. we've passed its terminal)
    const prevTerminalIdx = MILESTONES[i - 1].terminalIdx;
    if (i === 1 || currentIdx > prevTerminalIdx) return "active";
    return "pending";
  });
}

export function ProvisioningStatus({ initialRecord, onComplete }: ProvisioningStatusProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pollingRunId, setPollingRunId] = useState(0);
  const pollingDelayRef = useRef(2000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const jobId = initialRecord?.jobId ?? null;
  const jobStatus = job?.status ?? initialRecord?.status ?? "queued";
  const currentStep = job?.currentStep ?? "queued";
  const progress = getProgress(currentStep, jobStatus);
  const etaLabel = getEtaLabel(progress, jobStatus);
  const milestoneStates = getMilestoneStates(currentStep, jobStatus);

  useEffect(() => {
    if (!jobId || jobStatus === "completed") return;

    let isActive = true;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/controlplane/jobs/${encodeURIComponent(jobId)}`,
          { cache: "no-store" }
        );

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

        if (data.status === "failed") return;

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
  }, [jobId, pollingRunId, router, jobStatus]);

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
      pollingDelayRef.current = 2000;
      if (timerRef.current) clearTimeout(timerRef.current);
      setPollingRunId((prev) => prev + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  if (!initialRecord) {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ borderColor: "var(--fd-border)" }}
      >
        No provisioning job found. Please contact support if this persists.
      </div>
    );
  }

  if (jobStatus === "failed") {
    return (
      <div
        className="rounded-2xl border p-5 space-y-3"
        style={{
          borderColor: "rgba(232,92,106,0.3)",
          backgroundColor: "rgba(232,92,106,0.06)",
        }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--fd-red)" }}>
          Setup failed
        </p>
        <p className="text-sm" style={{ color: "var(--fd-muted)" }}>
          {job?.failureReason ??
            initialRecord.failureReason ??
            "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60 active:opacity-70"
          style={{ backgroundColor: "var(--fd-accent)", color: "var(--fd-bg)" }}
        >
          {isRetrying ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-5 space-y-5"
      style={{
        backgroundColor: "var(--fd-surface)",
        borderColor: "var(--fd-border)",
      }}
    >
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate" style={{ color: "var(--fd-text)" }}>
            {getCurrentStepLabel(currentStep)}
          </p>
          <span
            className="shrink-0 text-xs tabular-nums"
            style={{ color: "var(--fd-muted)" }}
          >
            {progress}%
          </span>
        </div>
        <div
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--fd-border)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              backgroundColor: "var(--fd-accent)",
            }}
          />
        </div>
        <p className="text-xs" style={{ color: "var(--fd-muted)" }}>
          {etaLabel}
        </p>
      </div>

      {/* Milestone checklist */}
      <ul className="space-y-3">
        {MILESTONES.map((m, i) => {
          const state = milestoneStates[i];
          return (
            <li key={m.label} className="flex items-center gap-3">
              {/* Icon */}
              <span
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    state === "done" ? "var(--fd-accent)" : "transparent",
                  border:
                    state === "done"
                      ? "none"
                      : `1.5px solid ${state === "active" ? "var(--fd-accent)" : "var(--fd-border)"}`,
                }}
              >
                {state === "done" && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {state === "active" && (
                  <span
                    className="h-2 w-2 rounded-full animate-pulse"
                    style={{ backgroundColor: "var(--fd-accent)" }}
                  />
                )}
              </span>
              {/* Label */}
              <span
                className="text-sm"
                style={{
                  color:
                    state === "pending" ? "var(--fd-muted)" : "var(--fd-text)",
                  fontWeight: state === "active" ? 500 : 400,
                }}
              >
                {m.label}
              </span>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="text-sm" style={{ color: "var(--fd-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
