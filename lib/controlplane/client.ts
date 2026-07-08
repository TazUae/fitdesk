import "server-only";
import type {
  CreateTenantInput,
  CreateTenantResponse,
  JobStatusResponse,
} from "@/types/controlplane";

// "Server-only Control Plane client. Do not import in client components."

function resolveControlPlaneConfig(): { url: string; apiKey: string } {
  const url = process.env.CONTROL_PLANE_URL;
  const apiKey = process.env.CONTROL_PLANE_API_KEY;

  if (!url) {
    throw new Error("Missing required environment variable: CONTROL_PLANE_URL");
  }

  if (!apiKey) {
    throw new Error("Missing required environment variable: CONTROL_PLANE_API_KEY");
  }

  return { url, apiKey };
}

function buildUrl(path: string): string {
  const { url } = resolveControlPlaneConfig();
  const normalizedBase = url.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function cpFetch(path: string, init?: RequestInit) {
  const { apiKey } = resolveControlPlaneConfig();
  const response = await fetch(buildUrl(path), {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const responseText = await response.text();
  const responseBody = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    const errorBody =
      responseBody === null ? "null" : JSON.stringify(responseBody);
    throw new Error(`Control Plane request failed (${response.status}): ${errorBody}`);
  }

  return responseBody;
}

export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResponse> {
  return cpFetch("/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  const raw = (await cpFetch(`/jobs/${encodeURIComponent(jobId)}`)) as Record<string, unknown>;
  // The Control Plane returns `id` (not `jobId`) and carries the failure text on
  // both `failureReason` and the legacy `lastError`. Normalize here so the UI
  // reliably receives the real reason instead of falling back to a generic error.
  const failureReason =
    (typeof raw.failureReason === "string" ? raw.failureReason : null) ??
    (typeof raw.lastError === "string" ? raw.lastError : null);
  return {
    jobId: typeof raw.id === "string" ? raw.id : jobId,
    tenantId: typeof raw.tenantId === "string" ? raw.tenantId : "",
    status: raw.status as JobStatusResponse["status"],
    currentStep: raw.currentStep as JobStatusResponse["currentStep"],
    failureReason,
  };
}

export async function retryJob(jobId: string): Promise<JobStatusResponse> {
  return cpFetch(`/jobs/${encodeURIComponent(jobId)}/retry-enqueue`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getTenant(tenantId: string) {
  return cpFetch(`/tenants/${encodeURIComponent(tenantId)}`);
}

export async function listTenants() {
  return cpFetch("/tenants");
}

/**
 * List a tenant's pending payment notifications (workflow state recorded from the
 * ERP invoice-submitted webhook). Returns the raw Control Plane body; callers
 * validate it before use.
 */
export async function listPendingPaymentNotifications(slug: string): Promise<unknown> {
  return cpFetch(`/tenants/${encodeURIComponent(slug)}/pending-payment-notifications`);
}
