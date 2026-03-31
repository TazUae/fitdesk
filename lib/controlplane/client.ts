import "server-only";
import type {
  CreateTenantInput,
  CreateTenantResponse,
  JobStatusResponse,
} from "@/types/controlplane";

// "Server-only Control Plane client. Do not import in client components."

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL;
const CONTROL_PLANE_API_KEY = process.env.CONTROL_PLANE_API_KEY;

if (!CONTROL_PLANE_URL) {
  throw new Error("Missing required environment variable: CONTROL_PLANE_URL");
}

if (!CONTROL_PLANE_API_KEY) {
  throw new Error("Missing required environment variable: CONTROL_PLANE_API_KEY");
}

function buildUrl(path: string): string {
  const normalizedBase = CONTROL_PLANE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function cpFetch(path: string, init?: RequestInit) {
  const response = await fetch(buildUrl(path), {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${CONTROL_PLANE_API_KEY}`,
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
