# ADR-UX-006 — FitDesk Semantic Color System

Status: Approved v1.1
Date: 2026
Amended: 2026-07-19 — Actions/Primary/Ring values superseded by
`ADR-UX-012-DESIGN_TOKEN_GOVERNANCE.md` (Indigo `#635BFF` / Midnight
`#0B1020`); Core Neutrals and Signals/Coaching-Pulse values retained as
accurate.


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

**Reconciliation with `ADR-UX-012` (2026-07-19):** the "Actions" values below
(`--primary`, `--ring` at `#2563EB`) were an orphaned third color identity —
neither the prior Gold accent nor the now-approved Indigo. They are
**superseded**. `ADR-UX-012-DESIGN_TOKEN_GOVERNANCE.md` §1 (`--fd-primary`,
Indigo `#635BFF`) and §1b (`--fd-midnight`, Midnight `#0B1020`) are the
authoritative brand-primary and deep-ink token values. This document's Core
Neutrals and Signals/Coaching-Pulse values remain accurate and are retained
below; only the Actions block is superseded. Note also that this document
predates the repository's actual `--fd-` token prefix convention (it uses
bare names like `--primary`/`--surface`); treat the `--fd-`-prefixed names in
`ADR-UX-012` and `app/globals.css` as the implementation-accurate naming —
this document's names are conceptual/historical, not literal selectors.

## Native Perceptual Color Values

```css
:root {
  /* Core Neutrals — accurate, retained */
  --background: oklch(0.98 0.004 80);        /* Legacy Ref: #FAFAF7 */
  --surface: oklch(1.0 0.0 0);               /* Legacy Ref: #FFFFFF */
  --surface-elevated: oklch(0.96 0.004 80);  /* Legacy Ref: #F4F4EF */
  --ink: oklch(0.19 0.008 240);              /* Legacy Ref: #18181B */
  --muted: oklch(0.53 0.012 245);            /* Legacy Ref: #71717A */
  --border: oklch(0.92 0.008 240);           /* Legacy Ref: #E4E4E7 */

  /* Actions — SUPERSEDED. See ADR-UX-012 for the authoritative Indigo
     (--fd-primary, #635BFF) and Midnight (--fd-midnight, #0B1020) values. */

  /* Signals & Coaching Pulse — accurate, retained */
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
| Primary | **Superseded — see `ADR-UX-012` `--fd-primary` (Indigo `#635BFF`)** |
| Primary Soft | **Superseded — see `ADR-UX-012` `--fd-primary-soft`** |
| Ring | **Superseded — see `ADR-UX-012` `--fd-focus`** |
| Success / Healthy | Successful outcomes and healthy client state |
| Warning / Watch | Needs review |
| Danger / At Risk | Immediate intervention required |
| Information | Guidance and semantic status only — informational blue is a semantic color, never a substitute for the Indigo interaction accent (see `ADR-UX-012` §3) |

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
