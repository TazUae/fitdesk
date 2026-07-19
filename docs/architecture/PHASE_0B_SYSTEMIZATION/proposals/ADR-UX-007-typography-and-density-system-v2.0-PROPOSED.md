> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-007-FITDESK_TYPOGRAPHY_AND_DENSITY_SYSTEM.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-007 — FitDesk Typography and Density System

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

Typography and density determine trainer speed, scanning, comprehension, and perceived product quality.

The dashboard must use desktop space efficiently without reproducing desktop tables or dense inspectors on mobile.

## Typeface Decision

### Primary UI target

Geist Sans

Used for:

- navigation;
- labels;
- forms;
- body copy;
- buttons;
- headings.

### Numeric target

Geist Mono or tabular numerals within the approved stack.

Used for:

- money;
- package balances;
- session counts;
- dates and times;
- operational metrics.

This ADR defines the type target. Adding the Geist package remains an approval-gated dependency change. Until adopted, use the active repository's approved fallback stack.

## Scale

### Mobile

| Role | Size |
|---|---:|
| Display | 32px |
| H1 | 24px |
| H2 | 20px |
| H3 | 18px |
| Body | 16px |
| Small | 14px |
| Caption | 12px |

### Desktop

| Role | Size |
|---|---:|
| Display | 40px |
| H1 | 30px |
| H2 | 24px |
| H3 | 20px |
| Body | 16px |
| Small | 14px |
| Caption | 12px |

Use clear hierarchy. Do not render every label, metric, and section at similar visual weight.

## Density Levels

### Comfortable

Use for:

- onboarding;
- Add Client;
- settings;
- explanatory guidance.

### Standard

Default for:

- dashboard sections;
- Client Hub;
- schedule;
- sheets.

### Compact

Use for:

- repeated operational rows;
- financial ledgers;
- desktop tables;
- dense comparison surfaces.

Compact does not mean inaccessible. Row height, labels, focus, and touch behavior remain usable.

## Dashboard Density Laws

- Today and Needs Attention dominate the first useful region.
- Repeated records use compact aligned rows.
- Large cards are reserved for distinct groups.
- Business Health is concise.
- An empty right rail yields space to the main workspace.
- Zero-value sections do not outrank the next useful action.
- Large numerals are used selectively for meaningful metrics, not decoration.

## Navigation Density

Desktop primary navigation should normally fit within approximately 240–280px, subject to the active shell and responsive validation.

Mobile uses bottom navigation and single-column content.

A global shell-width change remains approval-gated.

## Target Size

- Meet WCAG 2.2 target-size requirements.
- Prefer approximately 44×44px for frequent mobile controls.
- Use shared Button and IconButton variants, not local padding hacks.

## Responsive Rule

Use existing responsive mechanisms first.

Container queries may be used for an approved component when they solve a verified local layout problem. They are not a mandate for a broad rewrite.

## Claude Code Skill Interaction

`frontend-design` may strengthen hierarchy and composition but may not replace the type system.

`web-design-guidelines` accessibility findings route through shared type, focus, and control tokens.

`vercel-react-best-practices` may improve rendering but may not reduce readable content or change protected flow semantics.

## Governance

Typography communicates hierarchy.

Density communicates priority.

Neither is changed merely to imitate a reference screenshot.
