# ADR-UX-002 — FitDesk Component Taxonomy

Status: Approved v1.1
Date: 2026


## Context

FitDesk needs a component model that prevents visual drift, business-logic leakage, and global component sprawl.

## Decision

FitDesk uses three component classes:

## Primitive Components

Global location:
- `/components/ui`

Examples:
- Button
- Input
- Card
- Badge
- Sheet
- Dialog

Rules:
- No business logic.
- No data fetching.
- No ERP terminology.
- No feature-specific assumptions.
- No hardcoded colors, spacing, or radius outside tokens.

## Composite Components

Preferred location:
- `/components/blocks`
- or colocated inside feature/domain folders when route-specific

Examples:
- MetricCard
- AlertCard
- TimelineCard
- ActionCard
- EmptyStateCard
- TriageCard

Rules:
- May understand layout intent.
- Must not own business data access.
- Must remain reusable across domains.

## Domain Components

Preferred locations:
- `/features/<domain>/`
- `app/<route>/_components/`

Examples:
- ClientPulseCard
- BusinessHealthCard
- SessionOutcomeCard
- AIInsightCard
- ClientSnapshotPanel
- PackageStatusCard

Rules:
- May know FitDesk domain language.
- May compose primitives and composites.
- Must not hardcode token values.
- Must not bypass repository/action boundaries.

## v1.1 Engineering Amendment — Domain Component Colocation Rule

### Global Primitives Boundary

`/components/ui` remains reserved for stateless, zero-business-logic primitive components.

### Feature-Driven Architecture

Composite or domain components linked to specific journeys must be colocated close to their execution scope.

Approved locations:
- `@/features/clients/`
- `@/features/dashboard/`
- `@/features/schedule/`
- `app/dashboard/clients/_components/`
- `app/dashboard/_components/`

Global directories must not become a dumping ground for specialized feature configurations.

### Next.js Private Folder Rule

Route-specific UI that does not need global reuse should live in route-private folders:

```text
app/dashboard/clients/_components/
app/dashboard/_components/
app/dashboard/schedule/_components/
```

## Governance

Domain components compose composites and primitives.

Hardcoded design tokens inside domain components are prohibited.

If a component needs business logic, it belongs in a feature/domain folder, not `/components/ui`.
