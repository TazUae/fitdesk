# ADR-UX-012 — FitDesk Design Token Governance

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk previously carried competing gold, blue, and pastel identities plus component-level color bypasses.

The product owner has selected a new direction, confirmed and finalized by
explicit product-owner decision dated 2026-07-19 (see
`docs/DOCUMENTATION_AUTHORITY_MAP.md` "Resolved decisions" and
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md` §13):

- FitDesk Indigo `#635BFF` primary interaction;
- FitDesk Midnight `#0B1020` deep-ink hierarchy;
- Clean Cloud neutrals;
- restricted semantic colors;
- no gold as the default interaction accent.

This ADR replaces the prior gold-primary decision while retaining centralized token governance and reversible migration.

This ADR governs **tokens only** — surface, text, border, interaction-state,
and semantic-color roles. It does not define logo variants, endorsement
usage, or brand typography; those are governed by
`ADR-UX-013-FITDESK_BRAND_AND_PRODUCT_UI_FOUNDATION.md`. Where the two
overlap (e.g. Midnight's exact value), this ADR is the token-value source of
truth and ADR-UX-013 defers to it.

## Decision

## 1. Single Interaction Accent

`--fd-primary` is FitDesk Indigo:

```css
--fd-primary: oklch(0.5784 0.2346 278.29); /* #635BFF */
```

Supporting roles:

```css
--fd-primary-strong: oklch(0.4890 0.2013 279.87); /* #5145CD */
--fd-primary-soft: oklch(0.9576 0.0214 288.86);   /* #F0EFFF */
--fd-primary-border: oklch(0.8483 0.0790 287);    /* #C9C6FF */
--fd-primary-text: var(--fd-primary-strong);       /* text/link on light */
--fd-on-primary: oklch(1 0 0);                    /* #FFFFFF */
--fd-focus: var(--fd-primary-strong);              /* default focus ring — contrast-safe on light */
--fd-focus-soft: oklch(0.6887 0.1695 283.30);     /* #8F89FF — dark/tinted surfaces only */
```

Focus policy (Correction 2026-07-18): `#8F89FF` fails WCAG 1.4.11 non-text
contrast (~2.5:1) on light surfaces. The default focus ring on white/light
surfaces resolves to `--fd-primary-strong`; `#8F89FF` is restricted to dark
or tinted surfaces with independently verified contrast. The CSS
implementation is a required future adoption action, not completed work.

Indigo is used for:

- primary actions;
- active navigation;
- selection;
- links;
- focus relationships;
- approved Copilot emphasis.

## 1b. Midnight — Deep Ink Role

`--fd-midnight` is FitDesk Midnight, the deep-ink brand role:

```css
--fd-midnight: oklch(0.16 0.045 265.75); /* #0B1020 */
```

Midnight is used for:

- the highest-emphasis heading tier where a role distinct from body text is
  needed (e.g. page titles, the desktop shell wordmark region);
- the reference ink for the FitDesk wordmark and F+D icon (brand-asset
  color, not a repainted CSS glyph — see ADR-UX-013);
- dark or tinted surfaces where a near-black is required (e.g. an on-dark
  overlay panel), always paired with white or near-white text/icon content
  at verified contrast.

Midnight is **not** a forced replacement for the existing `--fd-text`
(`oklch(0.19 0.008 240)`, `#18181B`) body-text role. `--fd-text` remains the
default body/paragraph ink; a component migrates to `--fd-midnight` only when
it specifically needs the brand deep-ink role (heading hierarchy, wordmark
region, dark surface), not as a blanket rename. Both tokens must remain
distinguishable in the codebase — do not alias one to the other silently.

Light page and surface hierarchy remains: `--fd-bg` (page canvas) →
`--fd-surface` (card/panel) → `--fd-card` (secondary panel) → `--fd-border`
(hairline separators). Primary text uses `--fd-text`; secondary/supporting
text uses `--fd-muted`. This hierarchy is unchanged by the Indigo/Midnight
adoption — only the interaction-accent and deep-ink roles are new.

### Interaction states

- **Hover / pressed:** `--fd-primary-strong` for both hover and pressed
  states on Indigo-primary controls, consistent with the existing
  `--fd-primary-strong` role already defined below. Do not introduce a
  separate pressed-only token unless a verified contrast or usability issue
  requires one.
- **Focus:** `--fd-focus` (defined below) is the single focus-ring source;
  never a component-local color.
- **Disabled:** see §3b.

## 2. Gold Deprecation

Gold is not approved for:

- buttons;
- links;
- active navigation;
- focus;
- selection;
- Copilot sparkle;
- generic metrics.

Legacy gold tokens and aliases such as `--fd-accent`:

- remain frozen until consumers are migrated;
- receive a `DEPRECATED` comment;
- are not used in new or modified components;
- are removed only after verified zero usage.

## 2b. Neutral-Name Compatibility Aliases (Correction 2026-07-18)

The v2 neutral renames are covered by the same alias discipline as gold:

```text
--fd-bg               → --fd-canvas
--fd-text             → --fd-ink
--fd-muted            → --fd-text-muted
--fd-text-on-primary  → --fd-on-primary
```

Old names remain frozen compatibility aliases (resolving to the new
canonical tokens) until consumers are migrated slice by slice. No mass
rename. No standalone repository-wide cleanup. Each alias is removed only
after an explicit zero-consumer search, as a separate scoped change.
Changing a canonical token VALUE must never require touching every
component.

## 3. Semantic Colors

Information blue, health teal, success, warning, and danger are semantic only.

They may not replace Indigo for generic interaction.

## 3b. Disabled States

Disabled controls use a dedicated muted treatment, never a reduced-opacity
copy of `--fd-primary`:

```css
--fd-disabled-bg: var(--fd-card);
--fd-disabled-text: var(--fd-muted);
--fd-disabled-border: var(--fd-border);
```

Rationale: opacity-reduced Indigo can still register as an active-looking
control at a glance and can fail non-text contrast requirements
unpredictably depending on the underlying surface. A disabled control must
be unambiguously non-interactive by color and by the browser's native
`disabled`/`aria-disabled` semantics together, not by color alone.

## 4. Overlay

All shared overlay backdrops use:

```css
--fd-overlay: oklch(0.2077 0.0398 265.75 / 0.48);
```

No per-component backdrop RGBA values when the shared token applies.

## 5. Canonical Format

OKLCH is canonical.

Hex values are reference comments and test metadata only.

## Governance Rules

- tokens use semantic names;
- new tokens require a documented role and product-owner approval;
- semantic tokens live centrally;
- component-specific tokens wait until at least three verified consumers need them;
- deprecated aliases remain stable during migration;
- existing hardcoded values are migrated only within an approved slice unless a separate inventory-backed migration is approved;
- dark mode remains out of scope until light-theme coverage is proven;
- token swaps remain centralized and reversible;
- a raw color from `frontend-design` or another external skill is never copied directly into a component;
- **no component may hardcode `#0B1020`, `#635BFF`, or any other Midnight/Indigo/gold hex literal directly** — every use goes through a semantic token (`--fd-midnight`, `--fd-primary`, etc.), the same discipline already required for gold;
- every new or migrated interactive-state pairing (text-on-fill, icon-on-fill) is contrast-verified against WCAG 1.4.3/1.4.11 before merge, not assumed from the palette alone.

## Migration Sequence

1. audit current `--fd-*`, gold, raw hex, RGBA, and inline color usage;
2. verify active token consumers;
3. install the compatibility alias layer (old neutral names → new canonical
   tokens) BEFORE any value change, so central swaps stay slice-independent;
4. change central primary roles;
5. migrate touched components in explicit slices;
6. visually verify dashboard, schedule, clients, invoices, messages, settings, sheets, focus, and semantic statuses;
7. confirm contrast;
8. remove deprecated aliases only after zero-consumer evidence.

Do not combine token migration with billing, routing, auth, ERP, or broad component refactors.

## Claude Code Skill Governance

`fitdesk-guardrail` is the controlling skill for token work.

- `frontend-design` may propose visual intent but not new palette values.
- `web-design-guidelines` may identify contrast/focus issues; fixes use approved tokens.
- `vercel-react-best-practices` has no authority over color choices.
- any brand-wide token change is `Stop — needs approval` unless explicitly named in the current task.

## Consequences

### Positive

- one coherent FitDesk identity;
- reversible re-accenting;
- fewer component-level bypasses;
- clearer semantic status;
- safer use of external design skills.

### Negative

- legacy gold remains visible until migrated;
- visual QA is required across multiple modules;
- detached or copied ADR versions may still conflict until repository authority cleanup completes.
