# 06 — Frontend / UI Architecture

> **Purpose:** Define how the FitDesk frontend is structured: App Router, feature folders, the
> workspace shell + overlays, and mobile-first rules.
> **Last verified:** 2026-06-25 · **Authority:** `ADR-UX-011` (extends `001/002/003/005/008/009/010`).

## Scope

`app/`, `features/`, `components/`, `lib/` in the FitDesk repo.

## Current known state (verified)

- App Router is in use; routes under `app/dashboard/*` (`clients`, `schedule`, `invoices`, etc.).
- **`features/*` is a skeleton**: the folders exist as `.gitkeep` placeholders; only
  `features/clients/components/ClientWorkspaceOverlay.tsx` has been migrated. Most real components
  still live under `components/modules/*` and `components/scheduling/*`.
- A reusable workspace shell + URL-backed overlay routes exist (per the 17 unpushed `main` commits:
  "extract reusable workspace shell", "add workspace overlay route", "add dashboard overlay route slot").

## Architecture rules

### Layering (ADR-UX-011)
```text
app/*        → route ownership, layout orchestration, metadata, server-component composition
features/*   → feature behavior; compose primitives; consume actions/hooks; NO direct ERP access
components/  → ui (dumb primitives, no business logic), charts, layout
lib/*        → domain services: formatting, calculations, repositories, projections, ERP adapters (no JSX)
```

### Data-fetching constitution (binding)
```text
Route → Server Action → Repository → ERP Adapter → Control Plane → ERP
Forbidden: UI → ERP · UI → Control Plane · UI → direct fetch
```

### Server Components first
- Default to Server Components. Client Components are opt-in (`'use client'`) only when needed
  (interactivity, browser APIs, calendar). E.g. `ScheduleView`, `PlannerShell` are client; pages are server.

### Feature-folder strategy
- Each feature owns its UI, hooks, actions, tests, types under `features/<name>/`.
- Migration into `features/*` is **Phase E**, done with re-export shims (old path re-exports new),
  one feature per commit, `tsc --noEmit` after each. Clients first, then dashboard, scheduling after F1.

### WorkspaceShell / overlays
- A shared shell hosts the dashboard sub-routes; major workspace context is **URL-backed**
  (e.g. `?client=123`, `?sheet=add-client`, `?triage=invoice`) so it survives refresh and supports
  instant dismissal without full reload (ADR-UX-009 v1.1).
- Overlays (sheets, drawers, the client workspace overlay) render in a dedicated slot and win z-index.

### Mobile-first rules
- Design for phones first; critical actions in ≤ 2–3 taps.
- Prefer cards, vertical lists, bottom sheets, simple forms over dense tables.
- Status is always visible (Paid/Unpaid/Overdue; Upcoming/Completed/Missed); overdue surfaces prominently.
- Triage: desktop = right-side drawer, mobile = bottom sheet; the underlying view stays visible.
- Motion is functional (sheets/drawers/accordions/transitions/FAB) — no decorative/hero/autoplay.

### State management
- Preferred order: URL state → server state → local component state. Avoid global client stores
  unless justified. Never duplicate financial source-of-truth in a frontend store.

## Do-not-touch areas

- The proxy boundary in `lib/erpnext/client.ts` (see `08`).
- The client workspace overlay route contract (URL params) — changing keys breaks deep links.

## Open decisions

- E1 migration map specifics (which `components/modules/*` files map where).
- Whether `components/charts` standardizes on Recharts now or during E (ADR-UX-011 approves Recharts).

## Verification checklist

- [ ] No client component imports an ERP adapter or calls the proxy directly.
- [ ] New domain logic lives in `lib/*`, not in `components/ui`.
- [ ] Workspace context that should survive refresh is in the URL.
- [ ] `tsc --noEmit` green after any feature move.

## Related files

- `app/dashboard/*`, `components/modules/*`, `features/*`, `components/scheduling/PlannerShell.tsx`,
  `features/clients/components/ClientWorkspaceOverlay.tsx`, `lib/*`.

## Related ADRs

- `ADR-UX-011` (frontend amendments), `ADR-UX-005` (interaction), `ADR-UX-008` (navigation/command),
  `ADR-UX-009` (dashboard), `ADR-UX-010` (client hub).

## Next actions

- Produce the E1 migration map; migrate clients (E2) then dashboard (E3); scheduling (E4) after F1.
