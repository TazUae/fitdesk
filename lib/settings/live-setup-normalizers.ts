const SECRET_PATTERN =
  /(api[_-]?key|api[_-]?secret|token|password|jwt|webhook|authorization|bearer)/gi;

type GenericDoc = Record<string, unknown>;

export type SetupStatus = "ok" | "missing" | "error";

export type SessionTypeSummary = {
  name: string;
  durationMinutes: number | null;
  price: number | null;
  standardBillingItem: string | null;
};

export type TrainerSettingsSummary = {
  status: SetupStatus;
  workingDaysCount: number;
  workingDayNames: string[];
  standardBillingItem: string | null;
};

export type SessionTypesSummary = {
  status: SetupStatus;
  count: number;
  items: SessionTypeSummary[];
};

export const SESSION_TYPE_BASE_FIELDS = ["name", "modified", "creation", "owner"] as const;
export const SESSION_TYPE_FIELDS = SESSION_TYPE_BASE_FIELDS;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeWorkingDayName(day: unknown): string | null {
  if (typeof day !== "string" || !day.trim()) return null;
  const normalized = day.trim().toLowerCase();
  const map: Record<string, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return map[normalized] ?? day.trim();
}

export function toSafeSetupError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return detail.replace(SECRET_PATTERN, "HIDDEN").slice(0, 220);
}

export function normalizeTrainerSettings(doc: GenericDoc | null): TrainerSettingsSummary {
  if (!doc) {
    return {
      status: "missing",
      workingDaysCount: 0,
      workingDayNames: [],
      standardBillingItem: null,
    };
  }

  const workingDays = asArray(doc.working_days);
  const workingDayNames = workingDays
    .map((row) => {
      const rec = (row ?? {}) as Record<string, unknown>;
      return normalizeWorkingDayName(rec.day ?? rec.weekday ?? rec.week_day);
    })
    .filter((v): v is string => Boolean(v));

  return {
    status: toStringOrNull(doc.name) ? "ok" : "missing",
    workingDaysCount: workingDays.length,
    workingDayNames,
    standardBillingItem:
      toStringOrNull(doc.standard_billing_item) ??
      toStringOrNull(doc.default_billing_item) ??
      toStringOrNull(doc.billing_item),
  };
}

export function normalizeSessionTypes(rows: GenericDoc[]): SessionTypesSummary {
  const items = rows.map((row) => ({
    name: toStringOrNull(row.name) ?? "Unnamed",
    durationMinutes:
      toNumber(row.default_duration_minutes) ??
      toNumber(row.duration_minutes) ??
      toNumber(row.duration),
    price: toNumber(row.default_rate) ?? toNumber(row.rate) ?? toNumber(row.price),
    standardBillingItem:
      toStringOrNull(row.standard_billing_item) ??
      toStringOrNull(row.default_billing_item) ??
      toStringOrNull(row.billing_item),
  }));

  return {
    status: items.length > 0 ? "ok" : "missing",
    count: items.length,
    items,
  };
}
