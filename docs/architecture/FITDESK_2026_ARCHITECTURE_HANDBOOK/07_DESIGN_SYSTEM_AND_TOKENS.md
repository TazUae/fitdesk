# 07 — Design System & Tokens

> **Purpose:** Define FitDesk token rules and governance, and document the current token-wiring
> defect so it is fixed correctly (Phase C) without over- or under-scoping.
> **Last verified:** 2026-06-25 · **Authority:** `ADR-UX-001` (foundation), `ADR-UX-004` (tokens),
> `ADR-UX-006` (semantic color), `ADR-UX-007` (typography/density).

## Scope

`app/globals.css`, `tailwind.config.ts`, and all styling in `app/*` and `components/*`.

## Current known state (verified)

There are **two parallel token systems** in `app/globals.css`:

1. **`--fd-*` variables** in **OKLCH** (e.g. `--fd-primary: oklch(0.54 0.22 260)`) — the canonical
   ADR-UX-004/006 tokens. Used **directly and correctly** via `var(--fd-*)` in body styles and most
   components (e.g. `style={{ backgroundColor: 'var(--fd-bg)' }}`).
2. **shadcn-style variables** (`--primary`, `--background`, `--border`, …) defined as **raw OKLCH
   triplets** (e.g. `--primary: 0.54 0.22 260;`).

**The defect (🟥 VERIFIED PROBLEM):** `tailwind.config.ts` consumes the shadcn variables as
`hsl(var(--primary))`, i.e. `hsl(0.54 0.22 260)`. Wrapping an **OKLCH triplet** in `hsl()` (and with
unit-less saturation/lightness) yields an **invalid/incorrect color**. So every Tailwind semantic
utility (`bg-primary`, `bg-background`, `border-border`, `text-foreground`, …) resolves wrong.

**Blast-radius calibration (🟩 FACT):**
- The app overwhelmingly styles via `var(--fd-*)` **inline**, which is correct and unaffected.
- Direct shadcn-utility usage is **small** (~5 occurrences, both in onboarding).
- **But** `globals.css` has `* { @apply border-border }`, so the **global default border color**
  flows through the broken bridge (latent, app-wide for any element relying on the default border).
- Net: real defect, mostly **latent**; fixing it is contained and screenshot-verifiable.

> ⚠️ The token defect is **not** confirmed to be the cause of "screens feel different / used to feel
> better." That intuition is more likely the scheduler-UX regression (`09`/F). Do not promise Phase C
> restores the "feel."

## Architecture rules (token governance)

1. **All visual values resolve through approved tokens.** OKLCH is canonical; HEX only as legacy
   reference comments (ADR-UX-004 v1.1).
2. **One bridge, one color space.** The Tailwind ↔ CSS-variable bridge must use the variable's actual
   color function. Recommended fix: `oklch(var(--x))` (keep one space, OKLCH) **or** convert the
   shadcn vars to true HSL triplets — not the current mismatch.
3. **No arbitrary Tailwind values** — `p-[13px]`, `gap-[22px]`, `rounded-[10px]`, `text-[#123456]`
   are prohibited unless a future ADR approves them.
4. **Radius / spacing / typography** follow the ADR-UX-004 scales (radius xs–xl; spacing 4/8/12/16/24/
   32/48/64; Geist Sans / Geist Mono).
5. **Color semantics** (success/warning/danger/information, surfaces, text) come from ADR-UX-006 tokens,
   not ad-hoc values.

## Do-not-touch areas

- Do not rip out the `--fd-*` system — it is correct and widely used. Phase C fixes the **bridge**, not the tokens.

## Open decisions

- Bridge direction: standardize on `oklch(var(--x))` (recommended) vs. converting shadcn vars to HSL.
- Whether to add a lint/stylelint rule enforcing rule #3 now (recommended, optional second commit).

## Verification checklist

- [ ] `bg-primary` / `bg-background` / `border-border` render the intended palette (before/after screenshots of `/dashboard`, `/dashboard/clients`, `/dashboard/schedule`).
- [ ] `npx next build && npx vitest run` green.
- [ ] No new arbitrary-value classes introduced.
- [ ] `components/ui/*` audited for shadcn-utility usage (confirms blast radius).

## Related files

- `app/globals.css`, `tailwind.config.ts`, `components/ui/*`, `lib/ui/clientColor.ts`.

## Related ADRs

- `ADR-UX-001`, `ADR-UX-004`, `ADR-UX-006`, `ADR-UX-007`. A **Design-Token Governance ADR** is still
  missing (see `14`) — it should encode rules #2–#3 as enforceable policy.

## Next actions

- Execute Phase C (single bridge-fix commit + optional lint guard); set expectations that this is a
  color-correctness fix, not the scheduler "feel" fix.
