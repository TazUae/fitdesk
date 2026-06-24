# ADR-UX-011 — FitDesk 2026 Frontend Architecture Amendments

Status: Approved v1.1
Date: 2026

---

# Context

FitDesk has completed the UX doctrine, design system, navigation architecture, dashboard architecture, and client workspace architecture.

The next requirement is architectural alignment between:

* Next.js 14 App Router
* shadcn/ui
* Radix primitives
* Motion
* TanStack Table
* Recharts
* Magic UI
* ERP-authoritative backend services

This ADR defines how frontend architecture is structured so that future development remains scalable, maintainable, and compatible with multi-tenant platform expansion.

---

# Decision

FitDesk adopts a Feature-Driven Frontend Architecture.

The architecture must prioritize:

* Mobile-first execution
* Route isolation
* Domain ownership
* ERP boundary protection
* Reusable UI primitives
* Incremental platform expansion

---

# Approved Folder Structure

```text
app/
├─ dashboard/
│  ├─ page.tsx
│  ├─ clients/
│  ├─ schedule/
│  ├─ invoices/
│  ├─ reports/
│  └─ _components/
│
├─ (marketing)/
├─ auth/
└─ api/

features/
├─ dashboard/
├─ clients/
├─ scheduling/
├─ billing/
├─ goals/
├─ messaging/
└─ onboarding/

components/
├─ ui/
├─ charts/
└─ layout/

lib/
├─ auth/
├─ erp/
├─ format/
├─ goals/
├─ scheduling/
├─ dashboard/
└─ clients/
```

---

# Architectural Layers

## Layer 1 — UI Primitives

Location:

```text
components/ui
```

Rules:

* No business logic
* No ERP calls
* No data fetching
* No tenant awareness

---

## Layer 2 — Feature Components

Location:

```text
features/*
```

Rules:

* Own UI behavior
* Compose primitives
* Consume actions/hooks
* No direct ERP access

---

## Layer 3 — Application Routes

Location:

```text
app/*
```

Responsibilities:

* Layout orchestration
* Route ownership
* Metadata
* Server component composition

---

## Layer 4 — Domain Services

Location:

```text
lib/*
```

Responsibilities:

* Formatting
* Domain calculations
* Repositories
* State derivation
* Projections
* ERP adapters

Rules:

* No UI
* No JSX
* Testable
* Reusable

---

# Server Component Policy

Default: Server Components First.

Client Components are opt-in and used only when required.

---

# Data Fetching Constitution

Approved order:

```text
Route
 → Server Action
 → Repository
 → ERP Adapter
 → Control Plane
 → ERP
```

Forbidden:

```text
UI → ERP
UI → Control Plane
UI → Direct Fetch
```

---

# Feature Ownership Model

Each feature owns:

```text
UI
Hooks
Actions
Tests
Types
```

---

# TanStack Table Standard

Approved for:

* Clients
* Invoices
* Packages
* Payments
* Reports

---

# Recharts Standard

Approved for:

* Revenue trends
* Client growth
* Session volume
* Retention
* Business Health

---

# Motion Standard

Approved usage:

* Sheets
* Drawers
* Accordions
* State transitions
* FAB expansion

Forbidden:

* Decorative animation
* Hero animation
* Autoplay effects

---

# Magic UI Standard

Approved usage:

* Dashboard polish
* Metric highlights
* Empty states
* AI Copilot presentation

Forbidden:

* Core navigation
* Critical workflows
* Forms
* Data grids

---

# State Management Strategy

Preferred order:

```text
URL State
Server State
Local Component State
```

Avoid global client stores unless clearly justified.

---

# URL State Rule

Major workspace context must survive refresh.

Examples:

```text
?client=123
?sheet=add-client
?triage=invoice
```

---

# Multi-Tenant Readiness

Frontend must never assume:

```text
Single trainer
Single workspace
Single module
```

---

# Testing Requirements

Every feature should support:

* Unit Tests
* Integration Tests
* E2E Tests

---

# Performance Budget

Dashboard targets:

```text
Initial route < 2 seconds
Interaction < 100ms
Sheet open < 200ms
```

---

# Governance

A frontend implementation is considered non-compliant if:

* It bypasses repositories.
* It fetches ERP data directly from UI.
* It introduces business logic into primitives.
* It duplicates domain services.
* It introduces global state without justification.
* It violates Mobile-Primary design principles.

---

# Consequences

## Positive

* Predictable scaling
* Faster onboarding of developers
* Reduced technical debt
* Easier multi-tenant evolution
* Better mobile performance

## Negative

* Requires architectural discipline
* Slower feature prototyping
* Additional folder structure overhead

---

# Relationship to Other ADRs

This ADR extends:

* ADR-UX-001 Design System Foundation
* ADR-UX-002 Component Taxonomy
* ADR-UX-003 Motion Constitution
* ADR-UX-005 Interaction Model
* ADR-UX-008 Navigation & Command System
* ADR-UX-009 Dashboard Command Center
* ADR-UX-010 Client Hub Workspace

This ADR becomes the authoritative frontend engineering blueprint for FitDesk.
