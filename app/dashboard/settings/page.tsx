import { getLiveSetupSummary } from "@/lib/settings/live-setup";
import { BusinessHoursEditor } from "@/components/modules/BusinessHoursEditor";
import { BufferTimeEditor } from "@/components/modules/BufferTimeEditor";

type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
const DAY_SET: ReadonlySet<Weekday> = new Set([
  "sun", "mon", "tue", "wed", "thu", "fri", "sat",
]);

export default async function SettingsPage() {
  const setup = await getLiveSetupSummary();

  // Trainer settings are available when the ERP connection is healthy.
  const hoursAvailable = setup.trainerSettings.status === "ok";

  return (
    <div className="space-y-4 p-4 pb-20">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--fd-text)" }}>
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fd-muted)" }}>
          Manage your working hours and preferences.
        </p>
      </div>

      {/* ── Business Hours ─────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--fd-surface)", borderColor: "var(--fd-border)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--fd-text)" }}>
            Business Hours
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--fd-muted)" }}>
            Pick the days you train and set your shared start and end times.
            You can change this any time.
          </p>
        </div>

        {hoursAvailable ? (
          <BusinessHoursEditor
            initialEnabled={setup.trainerSettings.enabledDayCodes.filter(
              (d): d is Weekday => DAY_SET.has(d as Weekday),
            )}
            initialStartTime={setup.trainerSettings.sharedStartTime}
            initialEndTime={setup.trainerSettings.sharedEndTime}
          />
        ) : (
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--fd-muted)" }}
          >
            {setup.trainerSettings.status === "error"
              ? "Unable to load your working hours right now. Try refreshing the page."
              : "Your workspace is still setting up. Check back in a moment."}
          </p>
        )}
      </section>

      {/* ── Buffer Time ───────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--fd-surface)", borderColor: "var(--fd-border)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--fd-text)" }}>
            Buffer time
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--fd-muted)" }}>
            Add a gap between sessions so you have time to reset, prepare, or message clients.
          </p>
        </div>

        {hoursAvailable ? (
          <BufferTimeEditor initialBuffer={setup.trainerSettings.bufferMinutes} />
        ) : (
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--fd-muted)" }}
          >
            {setup.trainerSettings.status === "error"
              ? "Unable to load your buffer setting right now. Try refreshing the page."
              : "Your workspace is still setting up. Check back in a moment."}
          </p>
        )}
      </section>

      {/* ── Payment Methods ────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--fd-surface)", borderColor: "var(--fd-border)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--fd-text)" }}>
          Payment Methods
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--fd-muted)" }}>
          How your clients can pay you.
        </p>

        <div className="mt-3 space-y-2">
          {/* Cash */}
          <div
            className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--fd-border)", backgroundColor: "var(--fd-card)" }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
              style={{ backgroundColor: "rgba(88,205,126,0.15)", color: "#58CD7E" }}
            >
              ✓
            </span>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--fd-text)" }}>Cash</p>
              <p className="text-xs" style={{ color: "var(--fd-muted)" }}>Ready to use. Record manually when received.</p>
            </div>
          </div>

          {/* Bank Transfer */}
          <div
            className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--fd-border)", backgroundColor: "var(--fd-card)" }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
              style={{ backgroundColor: "rgba(88,205,126,0.15)", color: "#58CD7E" }}
            >
              ✓
            </span>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--fd-text)" }}>Bank Transfer</p>
              <p className="text-xs" style={{ color: "var(--fd-muted)" }}>Ready to use. Record manually when received.</p>
            </div>
          </div>

          {/* Digital payment links — coming soon */}
          <div
            className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--fd-border)", backgroundColor: "var(--fd-card)", opacity: 0.6 }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
              style={{ backgroundColor: "var(--fd-border)", color: "var(--fd-muted)" }}
            >
              ○
            </span>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--fd-muted)" }}>
                Digital Payment Links
              </p>
              <p className="text-xs" style={{ color: "var(--fd-muted)" }}>
                OMT / Whish — coming soon.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ERP sync error (trainer-safe message) ──────────────────────────── */}
      {setup.error ? (
        <section
          className="rounded-2xl border p-4"
          style={{ backgroundColor: "rgba(232,92,106,0.06)", borderColor: "rgba(232,92,106,0.3)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--fd-red)" }}>
            Connection issue
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--fd-muted)" }}>
            We couldn&apos;t sync your workspace data. Your saved hours are still active —
            try refreshing in a moment.
          </p>
        </section>
      ) : null}

    </div>
  );
}
