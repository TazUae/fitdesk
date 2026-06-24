# ADR-UX-001 — FitDesk Design System Foundation

Status: Approved v1.1
Date: 2026


## Context

FitDesk is a Mobile-Primary + Desktop-Enhanced SaaS platform for personal trainers.

The design system must support:
- Gym-floor execution on mobile
- Deep-work planning on desktop
- Fast operational workflows
- Calm, premium fitness aesthetics
- ERP-backed complexity hidden behind trainer-friendly UX

FitDesk must feel like:
- 50% Linear: operational speed, density, precision
- 30% Apple Fitness: calm, health-focused trust
- 20% Whoop: coaching intelligence and signal-driven insight

## Decision

FitDesk adopts a strict design system foundation:

- Mobile-Primary + Desktop-Enhanced
- Action before analytics
- Single-context workflows
- Progressive disclosure
- AI suggests, trainer decides
- No ERP terminology exposed to trainers
- Color, typography, motion, navigation, and interaction patterns are governed by ADRs

## Technology Foundation

- Foundation: shadcn/ui architecture as structural blueprint
- Primitives: targeted `@radix-ui` primitives where accessibility requires them
- Tables: TanStack Table
- Motion: Motion for component state transitions
- Premium layer: Magic UI only for selective dashboard polish
- Charts: Recharts for business and coaching insight charts

## v1.1 Engineering Amendment — 2026 Update

### Headless Foundation Over Heavy UI Libraries

The primitive system uses shadcn/ui architecture plus targeted Radix primitive execution.

Introducing heavy, pre-styled, or inaccessible third-party UI packages is prohibited.

### Modern Browser Specifications

All upcoming UI development must target:

1. **OKLCH perceptual color tokens** for contrast-safe, human-perceived color consistency.
2. **Container Queries** for multi-column, card, panel, and split-workspace layouts.
3. **Native View Transitions API** where appropriate for route/context morphs and overlay transitions.

## Governance

No UI feature may bypass the design system.

All new components must map to:
- ADR-UX-002 Component Taxonomy
- ADR-UX-003 Motion Constitution
- ADR-UX-004 Design Tokens
- ADR-UX-005 Interaction Model
- ADR-UX-006 Semantic Color System
- ADR-UX-007 Typography & Density System
- ADR-UX-008 Navigation & Command System

## Consequences

### Positive
- Prevents visual drift.
- Protects mobile operator speed.
- Enables reusable UI infrastructure.
- Keeps ERP complexity hidden from trainers.

### Negative
- Slower upfront design work.
- Requires strict engineering discipline.
