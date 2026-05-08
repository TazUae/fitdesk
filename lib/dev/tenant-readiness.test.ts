import { describe, expect, it } from "vitest";
import {
  buildPayload,
  erpFailure,
  isMethodRouteMissing,
  isProductionEnv,
  normalizeSingleMessage,
  parseTenantOverride,
  scrubSensitive,
  upstreamFailure,
} from "@/lib/dev/tenant-readiness";

describe("tenant-readiness helpers", () => {
  it("builds normalized readiness payload", () => {
    const payload = buildPayload({
      tenantId: "8168e424-ea93-4cf7-9903-a1b5241354d5",
      tenantSlug: "phase-264-fitdesk-repeat-2",
      workingDaysCount: 7,
      sessionTypeCount: 4,
      trainerSettingsExists: true,
      trainingItemExists: true,
      customersReadable: true,
      invoicesReadable: true,
      smokeDataFound: false,
    });

    expect(payload.ok).toBe(true);
    expect(payload.checks.workingDays.status).toBe("pass");
    expect(payload.checks.sessionTypes.status).toBe("pass");
    expect(payload.secretsExposed).toBe(false);
  });

  it("scrubs sensitive words from error details", () => {
    const input =
      "Authorization Bearer abc token API_KEY api_secret jwt webhook password";
    const output = scrubSensitive(input);
    expect(output).not.toContain("Authorization");
    expect(output).not.toContain("token");
    expect(output).not.toContain("API_KEY");
    expect(output).not.toContain("api_secret");
    expect(output).not.toContain("jwt");
    expect(output).not.toContain("webhook");
    expect(output).not.toContain("password");
    expect(output).toContain("HIDDEN");
  });

  it("returns stable failure shape for upstream errors", () => {
    const failure = upstreamFailure("token timeout at upstream");
    expect(failure.ok).toBe(false);
    expect(failure.code).toBe("UPSTREAM_ERP_PROXY_FAILED");
    expect(failure.details).toContain("HIDDEN");
    expect(failure.secretsExposed).toBe(false);
  });

  it("normalizes singleton method response envelope", () => {
    const payload = normalizeSingleMessage({
      message: {
        name: "FitDesk Trainer Settings",
        working_days: [{ day: "Monday" }],
      },
    });
    expect(payload.name).toBe("FitDesk Trainer Settings");
    expect(Array.isArray(payload.working_days)).toBe(true);
  });

  it("throws for invalid singleton method envelope", () => {
    expect(() => normalizeSingleMessage(undefined)).toThrow(
      "Invalid single-method response: missing message",
    );
    expect(() => normalizeSingleMessage({})).toThrow(
      "Invalid single-method response: missing message",
    );
  });

  it("detects missing CP method route errors for fallback", () => {
    const err = new Error(
      'ERP proxy method call failed (404): {"message":"Route POST:/api/erp/method/frappe.client.get_single not found","error":"Not Found","statusCode":404}',
    );
    expect(isMethodRouteMissing(err)).toBe(true);
    expect(isMethodRouteMissing(new Error("some other failure"))).toBe(false);
  });

  it("parses optional tenant override from query string", () => {
    const withOverride = parseTenantOverride(
      "http://localhost:3000/api/dev/tenant-readiness?tenantId=abc-123",
    );
    const withoutOverride = parseTenantOverride(
      "http://localhost:3000/api/dev/tenant-readiness",
    );
    expect(withOverride).toBe("abc-123");
    expect(withoutOverride).toBeNull();
  });

  it("detects production env for override guard", () => {
    expect(isProductionEnv("production")).toBe(true);
    expect(isProductionEnv("development")).toBe(false);
    expect(isProductionEnv(undefined)).toBe(false);
  });

  it("builds explicit override rejection payload codes", () => {
    const forbidden = erpFailure(
      "TENANT_OVERRIDE_FORBIDDEN",
      403,
      "tenantId override is disabled in production",
    );
    const notLinked = erpFailure(
      "TENANT_NOT_LINKED",
      403,
      "Override tenant is not linked to current user",
    );
    const inactive = erpFailure(
      "TENANT_INACTIVE",
      409,
      "Override tenant is not active",
    );

    expect(forbidden.body.code).toBe("TENANT_OVERRIDE_FORBIDDEN");
    expect(notLinked.body.code).toBe("TENANT_NOT_LINKED");
    expect(inactive.body.code).toBe("TENANT_INACTIVE");
    expect(forbidden.body.secretsExposed).toBe(false);
  });

  it("scrubs sensitive terms in method-path upstream failures", () => {
    const failure = upstreamFailure(
      "ERP proxy method call failed (404): Authorization Bearer token API_KEY password",
    );
    expect(String(failure.details)).toContain("HIDDEN");
    expect(String(failure.details)).not.toContain("Authorization");
    expect(String(failure.details)).not.toContain("password");
  });
});
