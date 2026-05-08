import { getLiveSetupSummary } from "@/lib/settings/live-setup";

function statusBadge(status: "ok" | "missing" | "error"): { label: string; bg: string; color: string } {
  if (status === "ok") {
    return { label: "Connected", bg: "rgba(88, 205, 126, 0.12)", color: "#58CD7E" };
  }
  if (status === "missing") {
    return { label: "Missing", bg: "rgba(232, 197, 71, 0.16)", color: "var(--fd-accent)" };
  }
  return { label: "Error", bg: "rgba(232, 92, 106, 0.16)", color: "var(--fd-red)" };
}

export default async function SettingsPage() {
  const setup = await getLiveSetupSummary();
  const trainerState = statusBadge(setup.trainerSettings.status);
  const sessionTypeState = statusBadge(setup.sessionTypes.status);
  const trainingItemState = statusBadge(setup.trainingItemStatus);

  return (
    <div className="space-y-4 p-4 pb-20">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--fd-text)" }}>
          FitDesk Setup
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fd-muted)" }}>
          Live read-only setup data from your active tenant.
        </p>
      </div>

      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--fd-surface)", borderColor: "var(--fd-border)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fd-muted)" }}>
          Tenant
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--fd-text)" }}>
          {setup.tenant.slug ?? "Unavailable"}
        </p>
      </section>

      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--fd-surface)", borderColor: "var(--fd-border)" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--fd-text)" }}>
            Trainer Settings
          </p>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: trainerState.bg, color: trainerState.color }}
          >
            {trainerState.label}
          </span>
        </div>

        <div className="mt-3 space-y-2 text-sm" style={{ color: "var(--fd-muted)" }}>
          <p>
            Working days:{" "}
            <span style={{ color: "var(--fd-text)" }}>{setup.trainerSettings.workingDaysCount}</span>
          </p>
          <p>
            Standard billing item:{" "}
            <span style={{ color: "var(--fd-text)" }}>
              {setup.trainerSettings.standardBillingItem ?? "Not set"}
            </span>
          </p>
          <p>
            Day names:{" "}
            <span style={{ color: "var(--fd-text)" }}>
              {setup.trainerSettings.workingDayNames.length > 0
                ? setup.trainerSettings.workingDayNames.join(", ")
                : "No working days configured"}
            </span>
          </p>
        </div>
      </section>

      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--fd-surface)", borderColor: "var(--fd-border)" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--fd-text)" }}>
            Session Types
          </p>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: sessionTypeState.bg, color: sessionTypeState.color }}
          >
            {sessionTypeState.label}
          </span>
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--fd-muted)" }}>
          Count: <span style={{ color: "var(--fd-text)" }}>{setup.sessionTypes.count}</span>
        </p>

        {setup.sessionTypes.items.length > 0 ? (
          <div className="mt-3 space-y-2">
            {setup.sessionTypes.items.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--fd-border)", backgroundColor: "var(--fd-card)" }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--fd-text)" }}>
                  {item.name}
                </p>
                <p className="text-xs" style={{ color: "var(--fd-muted)" }}>
                  Duration: {item.durationMinutes ?? "N/A"} min · Price: {item.price ?? "N/A"} · Billing item:{" "}
                  {item.standardBillingItem ?? "N/A"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "var(--fd-muted)" }}>
            No session types found.
          </p>
        )}
      </section>

      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--fd-surface)", borderColor: "var(--fd-border)" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--fd-text)" }}>
            TRAINING-SESSION Item
          </p>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: trainingItemState.bg, color: trainingItemState.color }}
          >
            {trainingItemState.label}
          </span>
        </div>
      </section>

      {setup.error ? (
        <section
          className="rounded-2xl border p-4"
          style={{ backgroundColor: "rgba(232,92,106,0.06)", borderColor: "rgba(232,92,106,0.3)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--fd-red)" }}>
            Data fetch warning
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--fd-muted)" }}>
            {setup.error}
          </p>
        </section>
      ) : null}
    </div>
  );
}
