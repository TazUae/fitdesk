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
  /** 3-letter codes ('mon'..'sun') of currently enabled working days. */
  enabledDayCodes: string[];
  /** Shared start time across enabled rows, e.g. '09:00', or null if unknown/mixed. */
  sharedStartTime: string | null;
  /** Shared end time across enabled rows, e.g. '20:00', or null if unknown/mixed. */
  sharedEndTime: string | null;
  /** True once availability has been confirmed (FitDesk Trainer Settings.initialized == 1). */
  initialized: boolean;
  standardBillingItem: string | null;
  /** Minimum gap between sessions in minutes, or null if unavailable. */
  bufferMinutes: number | null;
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

const DAY_CODE_MAP: Record<string, string> = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
  friday: "fri", saturday: "sat", sunday: "sun",
  mon: "mon", tue: "tue", wed: "wed", thu: "thu",
  fri: "fri", sat: "sat", sun: "sun",
};

function toDayCode(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return DAY_CODE_MAP[raw.trim().toLowerCase()] ?? null;
}

function isEnabledRow(v: unknown): boolean {
  return v === 1 || v === true || v === "1";
}

/**
 * Frappe Time fields come back as 'HH:MM:SS'. Trim to 'HH:MM' for the
 * trainer-facing UI. Returns null for empty/invalid input so the caller
 * can fall back to the default.
 */
function toHHmm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept 'HH:MM', 'HH:MM:SS', or 'HH:MM:SS.ffff'. Reject anything else.
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(trimmed);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function normalizeTrainerSettings(doc: GenericDoc | null): TrainerSettingsSummary {
  if (!doc) {
    return {
      status: "missing",
      workingDaysCount: 0,
      workingDayNames: [],
      enabledDayCodes: [],
      sharedStartTime: null,
      sharedEndTime: null,
      initialized: false,
      standardBillingItem: null,
      bufferMinutes: null,
    };
  }

  const workingDays = asArray(doc.working_days);
  const workingDayNames = workingDays
    .map((row) => {
      const rec = (row ?? {}) as Record<string, unknown>;
      return normalizeWorkingDayName(rec.day ?? rec.weekday ?? rec.week_day);
    })
    .filter((v): v is string => Boolean(v));

  const enabledRows = workingDays
    .map((row) => (row ?? {}) as Record<string, unknown>)
    .filter((rec) => isEnabledRow(rec.enabled));

  const enabledDayCodes = enabledRows
    .map((rec) => toDayCode(rec.weekday ?? rec.day ?? rec.week_day))
    .filter((v): v is string => Boolean(v));

  // Prefer enabled-row times; fall back to the first row's times when no
  // day is enabled yet (fresh tenants seed Mon–Fri 09:00–20:00 with the
  // same range, so the trainer-facing UI just needs *any* sane default).
  const sampleRows = enabledRows.length > 0
    ? enabledRows
    : (workingDays.length > 0 ? [workingDays[0] as Record<string, unknown>] : []);
  const sharedStartTime = sampleRows.length > 0
    ? toHHmm(sampleRows[0].start_time)
    : null;
  const sharedEndTime = sampleRows.length > 0
    ? toHHmm(sampleRows[0].end_time)
    : null;

  return {
    status: toStringOrNull(doc.name) ? "ok" : "missing",
    workingDaysCount: workingDays.length,
    workingDayNames,
    enabledDayCodes,
    sharedStartTime,
    sharedEndTime,
    initialized: isEnabledRow(doc.initialized),
    standardBillingItem:
      toStringOrNull(doc.standard_billing_item) ??
      toStringOrNull(doc.default_billing_item) ??
      toStringOrNull(doc.billing_item),
    bufferMinutes: toNumber(doc.buffer_minutes),
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
