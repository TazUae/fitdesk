# ADR-UX-006 — FitDesk Semantic Color System

Status: Approved v1.1
Date: 2026


## Context

FitDesk adopts a Mobile-Primary + Desktop-Enhanced experience architecture.

The color system must support:
- Linear-style operational clarity
- Apple Fitness-style calm and trust
- Whoop-style coaching intelligence

The system intentionally avoids cold enterprise gray palettes and decorative color usage.

## Decision

FitDesk uses a warm-neutral foundation with semantic action and signal colors.

OKLCH is the canonical color format.

HEX values are preserved only as legacy/reference comments.

## Native Perceptual Color Values

```css
:root {
  /* Core Neutrals */
  --background: oklch(0.98 0.004 80);        /* Legacy Ref: #FAFAF7 */
  --surface: oklch(1.0 0.0 0);               /* Legacy Ref: #FFFFFF */
  --surface-elevated: oklch(0.96 0.004 80);  /* Legacy Ref: #F4F4EF */
  --ink: oklch(0.19 0.008 240);              /* Legacy Ref: #18181B */
  --muted: oklch(0.53 0.012 245);            /* Legacy Ref: #71717A */
  --border: oklch(0.92 0.008 240);           /* Legacy Ref: #E4E4E7 */

  /* Actions */
  --primary: oklch(0.54 0.22 260);           /* Legacy Ref: #2563EB */
  --primary-soft: oklch(0.93 0.04 255);      /* Legacy Ref: #DBEAFE */
  --ring: oklch(0.54 0.22 260);              /* Legacy Ref: #2563EB */

  /* Signals & Coaching Pulse */
  --success-healthy: oklch(0.63 0.17 145);   /* Legacy Ref: #16A34A */
  --warning-watch: oklch(0.76 0.15 75);      /* Legacy Ref: #F59E0B */
  --danger-atrisk: oklch(0.57 0.21 25);      /* Legacy Ref: #DC2626 */
  --information: oklch(0.58 0.16 235);       /* Legacy Ref: #0284C7 */
}
```

## Token Semantics

| Token | Role |
|---|---|
| Background | Primary application canvas |
| Surface | Cards and panels |
| Surface Elevated | Raised surfaces |
| Ink | Primary text |
| Muted | Secondary text |
| Border | Borders and dividers |
| Primary | Primary actions |
| Primary Soft | Selected states |
| Ring | Focus indicators |
| Success / Healthy | Successful outcomes and healthy client state |
| Warning / Watch | Needs review |
| Danger / At Risk | Immediate intervention required |
| Information | Guidance and AI insights |

## Implementation Principles

1. Neutral First
2. Signal Clarity
3. Readability Under Gym Lighting
4. No Cold Grays
5. Semantic Consistency
6. OKLCH Canonical, HEX Reference Only

## Governance Rule

Color communicates meaning, not decoration.

A color must have a semantic purpose before it may be used in the interface.

## Consequences

### Positive
- Consistent UI language.
- Reduced design drift.
- Better trainer recognition of business and coaching signals.
- Improved perceptual consistency.

### Negative
- Requires modern CSS support.
- Requires strict token usage.
