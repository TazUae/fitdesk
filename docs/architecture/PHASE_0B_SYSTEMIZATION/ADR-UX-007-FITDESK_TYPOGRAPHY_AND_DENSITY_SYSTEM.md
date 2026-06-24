# ADR-UX-007 — FitDesk Typography & Density System

Status: Approved v1.1
Date: 2026


## Context

FitDesk is a Mobile-Primary + Desktop-Enhanced platform.

Typography and density are operational decisions that directly impact:
- Trainer speed
- Information scanning
- One-handed mobile usage
- Dashboard comprehension
- Client management efficiency

## Decision

FitDesk adopts a dual-typeface system and a controlled density scale.

## Typeface System

### Primary Typeface

Geist Sans

Used for:
- UI labels
- Navigation
- Forms
- Cards
- Body text
- Buttons

### Numeric Typeface

Geist Mono

Used for:
- Revenue
- Package balances
- Session counts
- KPIs
- Dashboard metrics
- Financial values
- Time slots

## Typography Scale

### Mobile

| Token | Size |
|---|---:|
| Display | 32px |
| H1 | 24px |
| H2 | 20px |
| H3 | 18px |
| Body | 16px |
| Small | 14px |
| Caption | 12px |

### Desktop

| Token | Size |
|---|---:|
| Display | 40px |
| H1 | 30px |
| H2 | 24px |
| H3 | 20px |
| Body | 16px |
| Small | 14px |
| Caption | 12px |

## Density Levels

### Comfortable

Used for:
- Onboarding
- Add Client
- AI Guidance
- Settings

### Standard

Default density.

Used for:
- Dashboard
- Client Hub
- Schedule

### Compact

Used only for:
- Tables
- Financial views
- Desktop analysis

## Spacing Rhythm Matrix

| Pixel Value | Tailwind Equivalent | Approved Class Suffix |
|---:|---:|---|
| 4px | 0.25rem | `-1` |
| 8px | 0.5rem | `-2` |
| 12px | 0.75rem | `-3` |
| 16px | 1rem | `-4` |
| 24px | 1.5rem | `-6` |
| 32px | 2rem | `-8` |
| 48px | 3rem | `-12` |
| 64px | 4rem | `-16` |

## v1.1 Engineering Amendment — Component-Centric Container Density Rules

### Decoupling From Viewports

Density configurations for layout surfaces must rely on parent container sizing boundaries (`@container`) rather than global screen dimensions (`@media`) whenever a component sits inside a split pane, dashboard grid, or resizable workspace.

### Fluid Component Adaptability

Complex interactive elements must dynamically toggle between Comfortable, Standard, and Compact content presentation scales according to the layout slot they occupy.

Examples:
- ActiveGoalInspector
- ClientPulseCard
- BillingLedger
- TimelinePanel
- DashboardMetricCluster

If a side panel expands, text layouts must reflow gracefully without global screen layout interference.

## Dashboard Density Rules

The Dashboard Command Center must:
- Prioritize actions over metrics.
- Show only essential information above the fold.
- Surface attention items before analytics.

## Table Density Rules

TanStack Table views may use Compact density.

Requirements:
- Sticky headers.
- Readable row heights.
- Mobile card fallback.
- Desktop tables must never be directly mirrored on mobile.

## Governance

Typography communicates hierarchy.

Density communicates priority.

Neither may be altered for visual preference alone.
