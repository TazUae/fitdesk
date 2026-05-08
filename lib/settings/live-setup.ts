import type { ERPDocResponse, ERPListResponse } from "@/lib/erpnext/types";
import { erpFetchForTenant, erpMethodForTenant } from "@/lib/dev/tenant-readiness";
import { getTenantContext } from "@/lib/tenant/context";
import {
  normalizeSessionTypes,
  normalizeTrainerSettings,
  SESSION_TYPE_FIELDS,
  toSafeSetupError,
  type SetupStatus,
  type SessionTypesSummary,
  type TrainerSettingsSummary,
} from "@/lib/settings/live-setup-normalizers";

type GenericDoc = Record<string, unknown>;

export type LiveSetupSummary = {
  tenant: {
    id: string | null;
    slug: string | null;
  };
  trainerSettings: TrainerSettingsSummary;
  sessionTypes: SessionTypesSummary;
  trainingItemStatus: SetupStatus;
  error: string | null;
};

async function fetchSessionTypesForTenant(tenantId: string, fields: readonly string[]) {
  return erpFetchForTenant<ERPListResponse<GenericDoc>>(
    tenantId,
    `/api/resource/${encodeURIComponent("FitDesk Session Type")}`,
    {
      params: {
        fields: JSON.stringify(fields),
        limit_page_length: "100",
      },
    },
  );
}

export async function getLiveSetupSummary(): Promise<LiveSetupSummary> {
  const tenant = await getTenantContext();
  if (!tenant?.tenantId) {
    return {
      tenant: { id: null, slug: null },
      trainerSettings: normalizeTrainerSettings(null),
      sessionTypes: normalizeSessionTypes([]),
      trainingItemStatus: "error",
      error: "No active tenant context available.",
    };
  }

  const summary: LiveSetupSummary = {
    tenant: { id: tenant.tenantId, slug: tenant.slug ?? null },
    trainerSettings: normalizeTrainerSettings(null),
    sessionTypes: normalizeSessionTypes([]),
    trainingItemStatus: "missing",
    error: null,
  };

  try {
    const trainerSettingsRes = await erpMethodForTenant<{ message?: GenericDoc }>(
      tenant.tenantId,
      "frappe.client.get",
      {
        doctype: "FitDesk Trainer Settings",
        name: "FitDesk Trainer Settings",
      },
    );
    summary.trainerSettings = normalizeTrainerSettings(trainerSettingsRes.message ?? null);
  } catch (error) {
    summary.trainerSettings = { ...normalizeTrainerSettings(null), status: "error" };
    summary.error = toSafeSetupError(error);
  }

  try {
    const sessionTypesRes = await fetchSessionTypesForTenant(tenant.tenantId, SESSION_TYPE_FIELDS);
    summary.sessionTypes = normalizeSessionTypes(sessionTypesRes.data ?? []);
  } catch (error) {
    summary.sessionTypes = { ...normalizeSessionTypes([]), status: "error" };
    if (!summary.error) summary.error = toSafeSetupError(error);
  }

  try {
    const trainingItemRes = await erpFetchForTenant<ERPDocResponse<GenericDoc>>(
      tenant.tenantId,
      `/api/resource/${encodeURIComponent("Item")}/${encodeURIComponent("TRAINING-SESSION")}`,
      { params: { fields: JSON.stringify(["name"]) } },
    );
    summary.trainingItemStatus =
      typeof trainingItemRes.data?.name === "string" && trainingItemRes.data.name.trim()
        ? "ok"
        : "missing";
  } catch {
    summary.trainingItemStatus = "missing";
  }

  return summary;
}
