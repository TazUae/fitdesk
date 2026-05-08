import { SignJWT } from "jose";

export type ReadinessStatus = "pass" | "fail" | "warn";

export type CountCheck = {
  status: ReadinessStatus;
  count: number;
};

export type TenantReadinessChecks = {
  trainerSettings: ReadinessStatus;
  workingDays: CountCheck;
  sessionTypes: CountCheck;
  trainingItem: ReadinessStatus;
  customersReadable: ReadinessStatus;
  invoicesReadable: ReadinessStatus;
  smokeDataHint?: {
    status: "info";
    found: boolean;
  };
};

export type TenantReadinessPayload = {
  ok: boolean;
  tenant: {
    id: string;
    slug: string;
  };
  checks: TenantReadinessChecks;
  secretsExposed: false;
};

export type TenantReadinessFailure = {
  ok: false;
  error: string;
  code:
    | "UNAUTHORIZED"
    | "TENANT_CONTEXT_MISSING"
    | "TENANT_MISMATCH"
    | "TENANT_OVERRIDE_FORBIDDEN"
    | "TENANT_NOT_LINKED"
    | "TENANT_INACTIVE"
    | "UPSTREAM_ERP_PROXY_FAILED";
  details?: unknown;
  secretsExposed: false;
};

const SECRET_PATTERN =
  /(api[_-]?key|api[_-]?secret|token|password|jwt|webhook|authorization|bearer)/gi;

export function scrubSensitive(input: string): string {
  return input.replace(SECRET_PATTERN, "HIDDEN");
}

export function isProductionEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

export function parseTenantOverride(url: string): string | null {
  const tenantId = new URL(url).searchParams.get("tenantId");
  return tenantId?.trim() || null;
}

export function erpFailure(
  code: Exclude<TenantReadinessFailure["code"], "UPSTREAM_ERP_PROXY_FAILED">,
  status: number,
  error: string,
  details?: unknown,
) {
  return {
    status,
    body: {
      ok: false as const,
      code,
      error,
      ...(details !== undefined ? { details } : {}),
      secretsExposed: false as const,
    },
  };
}

async function signTenantJwt(tenantId: string): Promise<string> {
  const rawSecret = process.env.FITDESK_JWT_SECRET;
  if (!rawSecret) {
    throw new Error("Missing FITDESK_JWT_SECRET");
  }
  const secret = new TextEncoder().encode(rawSecret);
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

type FetchOpts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string>;
};

export async function erpFetchForTenant<T>(
  tenantId: string,
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const cpUrl = process.env.CONTROL_PLANE_URL;
  if (!cpUrl) {
    throw new Error("Missing CONTROL_PLANE_URL");
  }
  const token = await signTenantJwt(tenantId);
  const cpPath = path.replace("/api/resource/", "/api/erp/doctype/");
  const base = cpUrl.replace(/\/+$/, "");
  let url = `${base}${cpPath}`;
  if (opts.params && Object.keys(opts.params).length > 0) {
    const qs = new URLSearchParams(opts.params).toString();
    url = `${url}${url.includes("?") ? "&" : "?"}${qs}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ERP proxy call failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function erpMethodForTenant<T>(
  tenantId: string,
  methodName: string,
  body: unknown = {},
): Promise<T> {
  const cpUrl = process.env.CONTROL_PLANE_URL;
  if (!cpUrl) {
    throw new Error("Missing CONTROL_PLANE_URL");
  }
  const token = await signTenantJwt(tenantId);
  const base = cpUrl.replace(/\/+$/, "");
  const url = `${base}/api/erp/method/${methodName}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ERP proxy method call failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function normalizeSingleMessage<T>(input: { message?: T } | null | undefined): T {
  if (!input || input.message === undefined || input.message === null) {
    throw new Error("Invalid single-method response: missing message");
  }
  return input.message;
}

export function isMethodRouteMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    lower.includes("erp proxy method call failed (404)") &&
    lower.includes("route post:/api/erp/method/")
  );
}

export function upstreamFailure(detail: string): TenantReadinessFailure {
  return {
    ok: false,
    error: "ERP proxy read failed",
    code: "UPSTREAM_ERP_PROXY_FAILED",
    details: scrubSensitive(detail).slice(0, 400),
    secretsExposed: false,
  };
}

export function buildPayload(args: {
  tenantId: string;
  tenantSlug: string;
  workingDaysCount: number;
  sessionTypeCount: number;
  trainerSettingsExists: boolean;
  trainingItemExists: boolean;
  customersReadable: boolean;
  invoicesReadable: boolean;
  smokeDataFound: boolean;
}): TenantReadinessPayload {
  return {
    ok: true,
    tenant: {
      id: args.tenantId,
      slug: args.tenantSlug,
    },
    checks: {
      trainerSettings: args.trainerSettingsExists ? "pass" : "fail",
      workingDays: {
        status: args.workingDaysCount === 7 ? "pass" : "fail",
        count: args.workingDaysCount,
      },
      sessionTypes: {
        status: args.sessionTypeCount === 4 ? "pass" : "warn",
        count: args.sessionTypeCount,
      },
      trainingItem: args.trainingItemExists ? "pass" : "fail",
      customersReadable: args.customersReadable ? "pass" : "fail",
      invoicesReadable: args.invoicesReadable ? "pass" : "fail",
      smokeDataHint: {
        status: "info",
        found: args.smokeDataFound,
      },
    },
    secretsExposed: false,
  };
}
