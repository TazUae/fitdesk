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
  return cpFetch(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function retryJob(jobId: string): Promise<JobStatusResponse> {
  return cpFetch(`/jobs/${encodeURIComponent(jobId)}/retry`, {
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
