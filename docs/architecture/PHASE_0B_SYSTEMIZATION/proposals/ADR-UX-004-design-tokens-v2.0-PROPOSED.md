> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-004-FITDESK_DESIGN_TOKENS.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-004 — FitDesk Design Tokens

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk design tokens translate product decisions into enforceable implementation values.

The previous mixed gold, blue, pastel, and component-level styling created multiple visual identities. The new direction is a single Indigo interaction system over Deep Ink and Clean Cloud neutrals.

## Decision

All recurring visual values must resolve through approved `--fd-*` semantic tokens or existing Tailwind utilities mapped to those tokens.

## Token Categories

- color;
- typography;
- spacing;
- radius;
- elevation;
- motion;
- focus;
- density.

## Canonical Core Color Tokens

OKLCH is canonical. Hex is included as implementation-reference metadata.

```css
:root {
  --fd-canvas: oklch(0.9795 0.0054 274.97);         /* #F7F8FC */
  --fd-surface: oklch(1 0 0);                       /* #FFFFFF */
  --fd-surface-subtle: oklch(0.9683 0.0069 247.90);/* #F1F5F9 */

  --fd-ink: oklch(0.2077 0.0398 265.75);           /* #0F172A */
  --fd-text-secondary: oklch(0.4455 0.0374 257.28);/* #475569 */
  --fd-text-muted: oklch(0.5544 0.0407 257.42);    /* #64748B */

  --fd-border: oklch(0.9288 0.0126 255.51);        /* #E2E8F0 */
  --fd-border-strong: oklch(0.8690 0.0198 252.89); /* #CBD5E1 */

  --fd-primary: oklch(0.5784 0.2346 278.29);       /* #635BFF */
  --fd-primary-strong: oklch(0.4890 0.2013 279.87);/* #5145CD */
  --fd-primary-soft: oklch(0.9576 0.0214 288.86);  /* #F0EFFF */
  --fd-primary-border: oklch(0.8483 0.0790 287);   /* #C9C6FF */
  --fd-primary-text: var(--fd-primary-strong);      /* links/text on light surfaces */
  --fd-on-primary: oklch(1 0 0);                    /* #FFFFFF */
  --fd-focus: var(--fd-primary-strong);             /* default focus ring — contrast-safe on light */
  --fd-focus-soft: oklch(0.6887 0.1695 283.30);    /* #8F89FF — dark/tinted surfaces only */

  --fd-success: oklch(0.5081 0.1049 165.61);       /* #047857 */
  --fd-success-soft: oklch(0.9793 0.0207 166.11);  /* #ECFDF5 */
  --fd-information: oklch(0.5000 0.1193 242.75);   /* #0369A1 */
  --fd-information-soft: oklch(0.9514 0.0250 236.82);/* #E0F2FE */
  --fd-warning: oklch(0.5553 0.1455 49);           /* #B45309 */
  --fd-warning-soft: oklch(0.9796 0.0158 73.68);   /* #FFF7ED */
  --fd-danger: oklch(0.5771 0.2152 27.33);         /* #DC2626 */
  --fd-danger-soft: oklch(0.9705 0.0129 17.38);    /* #FEF2F2 */
  --fd-health: oklch(0.5109 0.0861 186.39);        /* #0F766E */
  --fd-health-soft: oklch(0.9527 0.0498 180.80);   /* #CCFBF1 */

  --fd-overlay: oklch(0.2077 0.0398 265.75 / 0.48);
}
```

## Focus Contrast Policy (Correction 2026-07-18)

`#8F89FF` fails the WCAG 1.4.11 non-text contrast minimum (~2.5:1) against
white and light surfaces and MUST NOT be the default focus indicator there.

- The default focus-ring token on white or light surfaces resolves to
  `--fd-primary-strong` (#5145CD, contrast-verified), or to a separately
  verified focus token meeting the applicable non-text contrast requirement.
- `#8F89FF` (`--fd-focus-soft`) may be used only as a soft/decorative
  focus-support value on dark or tinted surfaces where contrast is
  independently verified.
- Focus must remain visible and must not rely on color alone (use ring width
  and offset, not hue changes only).
- The CSS/token implementation of this policy is a REQUIRED FUTURE ADOPTION
  ACTION — it is not completed work, and `app/globals.css` is unchanged by
  this documentation correction.

## Compatibility Aliases (Correction 2026-07-18)

ADR-UX v2 renames existing neutral token roles. The old names are FROZEN
COMPATIBILITY ALIASES, not deleted tokens:

```text
--fd-bg               → --fd-canvas
--fd-text             → --fd-ink
--fd-muted            → --fd-text-muted
--fd-text-on-primary  → --fd-on-primary
```

Policy:

- existing token names remain frozen aliases (old name resolves to the new
  canonical token) until consumers are migrated slice by slice;
- NO mass rename; no standalone repository-wide cleanup;
- each alias may be removed only after an explicit search confirms zero
  consumers, as a separate scoped change with its own validation;
- changing a canonical token VALUE must never require touching every
  component — that is the entire point of the alias layer;
- deprecated aliases carry a `DEPRECATED — alias of --fd-*` comment.

## Radius Scale

| Token | Value | Use |
|---|---:|---|
| `--fd-radius-xs` | 2px | compact indicators |
| `--fd-radius-sm` | 4px | checks, chips, small controls |
| `--fd-radius-md` | 6px | buttons and inputs |
| `--fd-radius-lg` | 8px | cards and ledger blocks |
| `--fd-radius-xl` | 12px | sheets and contextual panels |

## Radius Migration Is a Separate Decision (Correction 2026-07-18)

The sharper radius direction above is a SEPARATE visual-system decision from
the Indigo re-accent. It materially changes product identity and the
visual-QA surface, and must not be treated as an incidental part of color
migration.

- Re-accenting and radius migration are separately scoped, separately
  approved slices.
- Existing `rounded-xl`, `rounded-2xl`, and equivalent consumers remain VALID
  until a component slice is deliberately migrated.
- No mass radius rewrite is authorized.
- Each migrated slice requires desktop, mobile, interaction, and
  accessibility QA before freeze.
- The token table above describes the TARGET system — it is not an
  instruction to rewrite the repository immediately.

## Spacing Rhythm

Approved base rhythm:

```text
4, 8, 12, 16, 24, 32, 48, 64px
```

Use existing Tailwind spacing utilities or semantic layout variables. Avoid arbitrary classes such as `p-[13px]` when an approved value is suitable.

A truly necessary exception requires a scoped rationale and approval; it must not become a new silent token.

## Typography Tokens

Target family:

```text
--fd-font-sans: Geist Sans, approved fallback stack
--fd-font-mono: Geist Mono, approved fallback stack
```

The ADR defines the target. Installing a font package remains a separate dependency decision.

## Elevation Rule

Use borders, surface contrast, and spacing before shadows.

Shadows must be restrained and tokenized. No glow or decorative elevation.

## Governance

- component code must not introduce raw brand or semantic colors;
- tokens use semantic names, not hue names;
- new tokens require role documentation and product-owner approval;
- component tokens are introduced only after repeated verified need;
- dark mode remains future work until light-theme token coverage is proven;
- token changes must remain reversible and centrally controlled;
- existing hardcoded values are migrated when their file is already in an approved slice, unless a separate migration is explicitly approved.

## Claude Code Skill Interaction

External skills may propose intent, but all visual implementation resolves through these tokens.

Any suggestion to invent a new palette, raw hex set, font dependency, or one-off spacing system is `Stop — needs approval`.
