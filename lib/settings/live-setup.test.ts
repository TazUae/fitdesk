import { describe, expect, it } from "vitest";
import {
  SESSION_TYPE_FIELDS,
  normalizeSessionTypes,
  normalizeTrainerSettings,
  toSafeSetupError,
} from "@/lib/settings/live-setup-normalizers";

describe("live setup summary helpers", () => {
  it("normalizes trainer settings with working days and billing item", () => {
    const normalized = normalizeTrainerSettings({
      name: "FitDesk Trainer Settings",
      standard_billing_item: "TRAINING-SESSION",
      working_days: [{ day: "monday" }, { day: "Friday" }],
    });

    expect(normalized.status).toBe("ok");
    expect(normalized.workingDaysCount).toBe(2);
    expect(normalized.workingDayNames).toEqual(["Monday", "Friday"]);
    expect(normalized.standardBillingItem).toBe("TRAINING-SESSION");
  });

  it("handles missing trainer settings safely", () => {
    const normalized = normalizeTrainerSettings(null);
    expect(normalized.status).toBe("missing");
    expect(normalized.workingDaysCount).toBe(0);
    expect(normalized.workingDayNames).toEqual([]);
    expect(normalized.enabledDayCodes).toEqual([]);
    expect(normalized.standardBillingItem).toBeNull();
  });

  it("extracts 3-letter codes for enabled working days only", () => {
    const normalized = normalizeTrainerSettings({
      name: "FitDesk Trainer Settings",
      working_days: [
        { weekday: "mon", enabled: 1 },
        { weekday: "tue", enabled: 0 },
        { weekday: "wed", enabled: "1" },
        { weekday: "Sunday", enabled: 1 },
      ],
    });
    expect(normalized.enabledDayCodes).toEqual(["mon", "wed", "sun"]);
  });

  it("reads `initialized` as a boolean and extracts shared HH:MM hours", () => {
    const normalized = normalizeTrainerSettings({
      name: "FitDesk Trainer Settings",
      initialized: 1,
      working_days: [
        { weekday: "mon", enabled: 1, start_time: "08:30:00", end_time: "19:45:00" },
        { weekday: "tue", enabled: 1, start_time: "08:30:00", end_time: "19:45:00" },
      ],
    });
    expect(normalized.initialized).toBe(true);
    expect(normalized.sharedStartTime).toBe("08:30");
    expect(normalized.sharedEndTime).toBe("19:45");
  });

  it("treats missing initialized as false", () => {
    const normalized = normalizeTrainerSettings({
      name: "FitDesk Trainer Settings",
      working_days: [],
    });
    expect(normalized.initialized).toBe(false);
    expect(normalized.sharedStartTime).toBeNull();
    expect(normalized.sharedEndTime).toBeNull();
  });

  it("falls back to the first row's hours when no day is enabled yet", () => {
    const normalized = normalizeTrainerSettings({
      name: "FitDesk Trainer Settings",
      working_days: [
        { weekday: "mon", enabled: 0, start_time: "09:00:00", end_time: "20:00:00" },
      ],
    });
    expect(normalized.sharedStartTime).toBe("09:00");
    expect(normalized.sharedEndTime).toBe("20:00");
  });

  it("handles empty session types list", () => {
    const normalized = normalizeSessionTypes([]);
    expect(normalized.status).toBe("missing");
    expect(normalized.count).toBe(0);
    expect(normalized.items).toEqual([]);
  });

  it("normalizes session type fields if present", () => {
    const normalized = normalizeSessionTypes([
      {
        name: "PT",
        default_duration_minutes: "60",
        default_rate: "30",
        standard_billing_item: "TRAINING-SESSION",
      },
    ]);
    expect(normalized.status).toBe("ok");
    expect(normalized.count).toBe(1);
    expect(normalized.items[0]).toEqual({
      name: "PT",
      durationMinutes: 60,
      price: 30,
      standardBillingItem: "TRAINING-SESSION",
    });
  });

  it("requests only safe base fields for FitDesk Session Type", () => {
    expect([...SESSION_TYPE_FIELDS]).toEqual(["name", "modified", "creation", "owner"]);
    expect(SESSION_TYPE_FIELDS).not.toContain("duration_minutes");
    expect(SESSION_TYPE_FIELDS).not.toContain("default_duration_minutes");
    expect(SESSION_TYPE_FIELDS).not.toContain("default_rate");
    expect(SESSION_TYPE_FIELDS).not.toContain("rate");
    expect(SESSION_TYPE_FIELDS).not.toContain("standard_billing_item");
  });

  it("keeps session type count with safe fields only", () => {
    const normalized = normalizeSessionTypes([
      { name: "Personal Training", owner: "trainer@example.com", modified: "2026-05-06" },
      { name: "Cardio", owner: "trainer@example.com", creation: "2026-05-06" },
    ]);

    expect(normalized.status).toBe("ok");
    expect(normalized.count).toBe(2);
    expect(normalized.items[0].durationMinutes).toBeNull();
    expect(normalized.items[0].price).toBeNull();
    expect(normalized.items[0].standardBillingItem).toBeNull();
  });

  it("scrubs secrets from upstream errors", () => {
    const message = toSafeSetupError(
      "ERP proxy failed with Authorization Bearer token and api_key value",
    );
    expect(message).toContain("HIDDEN");
    expect(message).not.toContain("Authorization");
    expect(message).not.toContain("token");
    expect(message).not.toContain("api_key");
  });
});
