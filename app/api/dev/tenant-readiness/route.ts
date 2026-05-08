import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceProvisioning } from "@/lib/db/schema";
import { getTenant } from "@/lib/controlplane/client";
import type { ERPDocResponse, ERPListResponse } from "@/lib/erpnext/types";
import { getTenantContext } from "@/lib/tenant/context";
import {
  buildPayload,
  erpFailure,
  erpFetchForTenant,
  erpMethodForTenant,
  isMethodRouteMissing,
  isProductionEnv,
  normalizeSingleMessage,
  parseTenantOverride,
  scrubSensitive,
  upstreamFailure,
} from "@/lib/dev/tenant-readiness";

type GenericDoc = Record<string, unknown>;
type ListItem = Record<string, unknown>;
type MethodEnvelope<T> = { message?: T };

const TARGET_TENANT = {
  id: "8168e424-ea93-4cf7-9903-a1b5241354d5",
  slug: "phase-264-fitdesk-repeat-2",
} as const;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function containsSmokeMarker(rows: ListItem[]): boolean {
  return rows.some((row) =>
    Object.values(row).some(
      (v) => typeof v === "string" && v.toLowerCase().includes("smoke"),
    ),
  );
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
        code: "UNAUTHORIZED",
        secretsExposed: false,
      },
      { status: 401 },
    );
  }

  const tenantCtx = await getTenantContext();
  if (!tenantCtx?.tenantId || !tenantCtx.slug) {
    return NextResponse.json(
      {
        ok: false,
        error: "No safe tenant context resolved for current user",
        code: "TENANT_CONTEXT_MISSING",
        secretsExposed: false,
      },
      { status: 412 },
    );
  }

  const overrideTenantId = parseTenantOverride(req.url);

  let effectiveTenantId = tenantCtx.tenantId;
  let effectiveTenantSlug = tenantCtx.slug;

  if (overrideTenantId) {
    if (isProductionEnv(process.env.NODE_ENV)) {
      const failure = erpFailure(
        "TENANT_OVERRIDE_FORBIDDEN",
        403,
        "tenantId override is disabled in production",
      );
      return NextResponse.json(failure.body, { status: failure.status });
    }

    const linked = await db.query.workspaceProvisioning.findFirst({
      where: and(
        eq(workspaceProvisioning.userId, session.user.id),
        eq(workspaceProvisioning.tenantId, overrideTenantId),
      ),
    });
    if (!linked) {
      const failure = erpFailure(
        "TENANT_NOT_LINKED",
        403,
        "Override tenant is not linked to current user",
      );
      return NextResponse.json(failure.body, { status: failure.status });
    }

    const tenant = await getTenant(overrideTenantId);
    if (tenant?.status !== "active") {
      const failure = erpFailure(
        "TENANT_INACTIVE",
        409,
        "Override tenant is not active",
      );
      return NextResponse.json(failure.body, { status: failure.status });
    }

    effectiveTenantId = overrideTenantId;
    effectiveTenantSlug = tenant.slug ?? linked.slug ?? tenantCtx.slug;
  }

  if (
    !overrideTenantId &&
    (tenantCtx.tenantId !== TARGET_TENANT.id || tenantCtx.slug !== TARGET_TENANT.slug)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Resolved tenant does not match approved Phase 3.0 target tenant",
        code: "TENANT_MISMATCH",
        details: {
          expected: TARGET_TENANT,
          resolved: {
            id: tenantCtx.tenantId,
            slug: tenantCtx.slug,
          },
        },
        secretsExposed: false,
      },
      { status: 409 },
    );
  }

  try {
    const trainerSettingsDoctype = "FitDesk Trainer Settings";
    const sessionTypeDoctype = "FitDesk Session Type";

    let trainerSettings: GenericDoc;
    try {
      const trainerSettingsMethodRes = await erpMethodForTenant<MethodEnvelope<GenericDoc>>(
        effectiveTenantId,
        "frappe.client.get",
        {
          doctype: trainerSettingsDoctype,
          name: trainerSettingsDoctype,
        },
      );
      trainerSettings = normalizeSingleMessage(trainerSettingsMethodRes);
    } catch (err) {
      if (!isMethodRouteMissing(err)) throw err;
      // Backward-compatible fallback for CP instances that only expose doctype list proxy.
      const trainerSettingsList = await erpFetchForTenant<ERPListResponse<GenericDoc>>(
        effectiveTenantId,
        `/api/resource/${encodeURIComponent(trainerSettingsDoctype)}`,
        {
          params: {
            fields: JSON.stringify(["name", "working_days"]),
            limit_page_length: "1",
          },
        },
      );
      trainerSettings = trainerSettingsList.data[0] ?? {};
    }

    const workingDays = asArray(trainerSettings.working_days);

    const sessionTypesRes = await erpFetchForTenant<ERPListResponse<ListItem>>(
      effectiveTenantId,
      `/api/resource/${encodeURIComponent(sessionTypeDoctype)}`,
      {
        params: {
          fields: JSON.stringify(["name"]),
          limit_page_length: "100",
        },
      },
    );

    const trainingItemRes = await erpFetchForTenant<ERPDocResponse<GenericDoc>>(
      effectiveTenantId,
      `/api/resource/${encodeURIComponent("Item")}/${encodeURIComponent("TRAINING-SESSION")}`,
      { params: { fields: JSON.stringify(["name"]) } },
    );

    const customersRes = await erpFetchForTenant<ERPListResponse<ListItem>>(
      effectiveTenantId,
      `/api/resource/${encodeURIComponent("Customer")}`,
      {
        params: {
          fields: JSON.stringify(["name", "customer_name"]),
          limit_page_length: "25",
        },
      },
    );

    const invoicesRes = await erpFetchForTenant<ERPListResponse<ListItem>>(
      effectiveTenantId,
      `/api/resource/${encodeURIComponent("Sales Invoice")}`,
      {
        params: {
          fields: JSON.stringify(["name", "customer", "customer_name"]),
          limit_page_length: "25",
        },
      },
    );

    const payload = buildPayload({
      tenantId: effectiveTenantId,
      tenantSlug: effectiveTenantSlug,
      workingDaysCount: workingDays.length,
      sessionTypeCount: sessionTypesRes.data.length,
      trainerSettingsExists: Boolean((trainerSettings as GenericDoc).name),
      trainingItemExists: Boolean(trainingItemRes.data?.name),
      customersReadable: Array.isArray(customersRes.data),
      invoicesReadable: Array.isArray(invoicesRes.data),
      smokeDataFound:
        containsSmokeMarker(customersRes.data) || containsSmokeMarker(invoicesRes.data),
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(upstreamFailure(scrubSensitive(detail)), { status: 502 });
  }
}
