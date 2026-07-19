> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-006-FITDESK_SEMANTIC_COLOR_SYSTEM.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-006 — FitDesk Semantic Color System

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk needs a calm, premium, high-clarity visual system that works under gym lighting and supports operational scanning.

The previous gold-led direction is superseded.

## Decision

FitDesk uses:

- Cool Indigo for primary interaction;
- Deep Ink for hierarchy and business values;
- Clean Cloud neutrals for canvas and surfaces;
- semantic colors only for status, information, and coaching health.

OKLCH values and token names are governed by ADR-UX-004 and ADR-UX-012.

## Core Roles

| Role | Token | Reference |
|---|---|---|
| Canvas | `--fd-canvas` | `#F7F8FC` |
| Surface | `--fd-surface` | `#FFFFFF` |
| Subtle surface | `--fd-surface-subtle` | `#F1F5F9` |
| Primary text | `--fd-ink` | `#0F172A` |
| Secondary text | `--fd-text-secondary` | `#475569` |
| Muted text | `--fd-text-muted` | `#64748B` |
| Border | `--fd-border` | `#E2E8F0` |
| Primary action | `--fd-primary` | `#635BFF` |
| Primary strong | `--fd-primary-strong` | `#5145CD` |
| Primary soft | `--fd-primary-soft` | `#F0EFFF` |
| Focus | `--fd-focus` | `#8F89FF` |

## Semantic Roles

| Meaning | Token | Use |
|---|---|---|
| Success | `--fd-success` | confirmed healthy/successful state |
| Information | `--fd-information` | neutral guidance and data information |
| Warning | `--fd-warning` | needs review |
| Danger | `--fd-danger` | immediate or blocking risk |
| Coaching health | `--fd-health` | coaching-health context and selected chart semantics |

## Color Laws

1. **Indigo is interaction, not status.**
   Use it for primary actions, selection, active navigation, links, and focus relationships.

2. **Gold is not a primary/default interaction color.**
   Legacy gold tokens are deprecated and may exist only during the approved migration.

3. **Status colors are restricted.**
   Success, warning, danger, information, and health colors may not become generic CTA colors.

4. **Business values are neutral by default.**
   Revenue, client count, and balances use Deep Ink unless the value itself represents a verified status.

5. **Color is never the only signal.**
   Pair status color with text, iconography, shape, or placement.

6. **No raw component colors.**
   Components use semantic `--fd-*` tokens.

7. **Contrast is required.**
   Text and UI states must meet applicable WCAG contrast requirements. Focus and status distinctions must remain visible.

## Calendar and Data Categories

Category colors may use indigo, information blue, health teal, violet variants derived through approved tokens, and danger red.

Categories must also have labels, icons, patterns, or text. Do not rely on hue alone.

## AI Copilot

Copilot uses Indigo and soft lavender relationships, not gold sparkle or decorative glow.

## Dark Mode

Dark mode is future architecture. Do not add piecemeal `.dark` values until token coverage and visual QA are approved.

## Governance

Any palette change is a product decision and token migration, not a component-level styling choice.
