# ADR-UX-013 — FitDesk Brand and Product UI Foundation

Status: Approved
Decision date: 2026-07-19
Authority: Explicit product-owner decision dated 2026-07-19 (see
`docs/DOCUMENTATION_AUTHORITY_MAP.md` "Resolved decisions" and
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md` §13).
Governing brand source: FitDesk Brand Board (external reference asset,
`FitDesk brand identity board.png`) and `LOVABLE_PROJECT_KNOWLEDGE_NOVARRA.md`
(Novarra AI master-brand project knowledge, external reference document).
Neither external source is copied into this repository by this ADR; both are
cited as authority provenance only.

## Context

FitDesk is one of three products endorsed by its parent brand, Novarra AI
("FitDesk by Novarra"). A Brand Board and supplied logo artwork were produced
for FitDesk and confirmed by the product owner on 2026-07-19 to govern the
FitDesk **application's** visual identity, not only the separate Novarra
marketing website.

`ADR-UX-012-DESIGN_TOKEN_GOVERNANCE.md` governs color/interaction **tokens**
only. This ADR governs the **brand identity layer** — logo, wordmark,
endorsement lockup, icon usage, and application typography posture — and how
that layer relates to token governance, canonical product structure, and the
other interaction/navigation ADRs. Where this ADR references a color value
(e.g. Midnight, Indigo), `ADR-UX-012` is the token-value source of truth;
this ADR only states *where and how* the identity is used.

## Decision

### 1. Approved identity assets

- **F+D icon** — a geometric, integrated F+D symbol in Midnight and Indigo.
- **FitDesk wordmark** — the "FitDesk" logotype in Midnight, paired with the
  icon.
- **"FitDesk by Novarra" endorsed lockup** — the wordmark plus a smaller
  "by Novarra" endorsement mark, Novarra rendered in Indigo weight-distinct
  from the Midnight "FitDesk" wordmark.

All three are **supplied artwork**. This ADR does not attach production
asset files — see §7 (Asset governance) for why, and for the required next
step before any asset is integrated into application code.

### 2. Variants

The approved system defines these variants (per the Brand Board reference):

| Variant | Purpose |
|---|---|
| Icon only | Compact/collapsed contexts |
| On dark | Dark or Midnight-tinted surfaces |
| Monochrome | Single-color contexts (print, low-color UI chrome) |
| On Indigo | Indigo-filled surfaces (e.g. a filled banner) |
| App icon | OS/PWA app icon |
| Favicon | Browser tab icon |

Only a **primary logo on white** raster has been located as an individually
exportable file to date (see §7). The remaining variants exist only baked
into the single Brand Board composite reference image, not as individual
production-ready files.

### 3. Placement rules

Use the full **"FitDesk by Novarra" endorsed lockup** primarily on:

- authentication (sign-in/sign-up);
- onboarding;
- workspace-ready / provisioning-success surfaces;
- reports and exports (PDF/print headers, footers);
- spacious, non-operational branded surfaces.

Use the **FitDesk wordmark** (no endorsement) in the desktop shell where
horizontal space permits (e.g. a persistent sidebar header).

Use the **F+D icon** alone for:

- collapsed navigation;
- compact mobile headers;
- app icon;
- favicon;
- compact loading or identity surfaces (e.g. a splash/loading state).

### 4. Endorsement restraint

Do not repeat "by Novarra" across routine operational screens (Dashboard,
Schedule, Clients, Client Hub, Billing, Inbox, Settings, Session Completion).
The endorsement is a first-impression and formal-document signal, not a
persistent watermark. Operational screens use the wordmark or icon alone per
§3.

### 5. Supplied-artwork-only rule

Logo typography (the "FitDesk" wordmark glyphs and the F+D icon geometry) is
**authoritative artwork**, sourced from the supplied brand assets. It must
never be:

- recreated using Geist, Inter, or any other application/system typeface;
- reconstructed as styled CSS text (e.g. a bold `<span>FitDesk</span>` is not
  a substitute for the wordmark where the wordmark is called for);
- traced, redrawn, or "improved" from a screenshot or mockup reference.

Where a true vector/production logo file is not available for a given
placement, the placement must wait for the correct asset rather than
substitute a text approximation — see §7.

### 6. Application typography posture

- **Geist Sans** remains the primary FitDesk application UI typeface.
  Unchanged from `ADR-UX-007` (Approved v1.1) — no conflict, no migration
  required.
- **Geist Mono** remains available for technical identifiers (IDs, docnames,
  code-like values) and suitable data-display contexts.
- **Financial values use tabular numerals** (money, session counts, package
  balances, KPI values), consistent with `ADR-UX-007` and
  `docs/plans/FITDESK_DASHBOARD_UI_UX_FULL_PLAN_V1_2.md` §14.2.
- Logo typography (§5) is categorically separate from application UI
  typography. Approving Geist for the UI does not imply Geist governs the
  wordmark, and approving the wordmark's own type does not introduce a
  second application UI font.
- **Inter is not approved** for any purpose in the FitDesk application. No
  source document — not the Brand Board, not the Novarra project-knowledge
  document — specifies Inter. This corrects an earlier external audit's
  incorrect claim.

### 7. Asset governance

**Current state (2026-07-19):** the only individually exportable, non-mockup
brand asset file located to date is a single "primary logo on white" raster
PNG. Every other variant listed in §2 (icon-only, on-dark, monochrome,
on-Indigo, app icon, favicon, and the endorsed lockup as a standalone file)
exists only as part of a single composite Brand Board reference image, not
as an individually exportable production file. A separate 85+ file asset
archive was also inspected and found to contain product/marketing UI
**mockups** (full-page screenshots of dashboard, billing, onboarding,
scheduling, messaging, and marketing surfaces) plus two brand-reference
composites — not individual logo exports.

**Governance rule:** do not extract, crop, trace, or re-derive individual
logo variants from the composite Brand Board image or from product mockups.
Doing so would constitute recreating supplied artwork, which §5 prohibits.
Integration of any brand asset into `public/` or application code requires
the actual individually-exported production file (SVG preferred; PNG at
minimum 2x/3x raster) to be supplied first.

**Canonical future asset location:** once true production asset files are
supplied, they belong under:

```text
public/brand/fitdesk/
  icon.svg                 — F+D icon only
  wordmark.svg              — FitDesk wordmark, no endorsement
  lockup-endorsed.svg       — "FitDesk by Novarra" full lockup
  icon-monochrome.svg
  icon-on-dark.svg
  icon-on-indigo.svg
  favicon.ico / favicon.svg
  app-icon-512.png (and other required PWA/OS sizes)
```

This ADR does not create these files. Creating them is out of scope until
production assets are supplied; the current UI/UX modernization work (see
Batch F/G of the active docs-and-application-migration plan) must proceed
with token-level color changes only and must not fabricate placeholder logo
graphics in the interim.

### 8. Brand tone and pillars

Tone: clean, modern, human, calm, efficient, trusted — consistent with the
Brand Board and with `CLAUDE.md`'s existing "Product Goal" (simple, fast,
reliable).

Pillars, and their application-level meaning:

| Pillar | Application meaning |
|---|---|
| Continuous flow | Nothing falls through — Needs Attention, unresolved sessions, and package/invoice state stay visible and actionable, never silently dropped. |
| Human-centered | Built for trainers, clients, and relationships — copy and flows speak to the trainer's actual day, not abstract admin. |
| Operational excellence | Less admin, more coaching — the interaction model (existing `ADR-UX-005`) already reflects this; this ADR does not change it. |
| Financial clarity | Know your numbers — tabular numerals, explicit Paid/Unpaid/Overdue states, no ambiguous financial copy. |
| Trust and security | Your business, your data — consistent with the existing tenant-isolation and ERP-boundary rules in `CLAUDE.md`, unaffected by this ADR. |

### 9. Relationship to other authorities

- **`ADR-UX-012`** — token-value source of truth for Midnight/Indigo; this
  ADR never restates or overrides a token value.
- **Canonical Journey Map and Application Sitemap** (`docs/product/`) —
  govern workflow and target information architecture; this ADR governs
  identity/typography only and does not alter navigation or route structure.
- **`ADR-UX-005` (Interaction Model), `ADR-UX-008` (Navigation and Command
  System), component ADRs** — govern interaction and structure; this ADR
  does not introduce new interaction patterns. Any conflict between this
  ADR and an interaction/navigation ADR is a defect in the other ADR, to be
  corrected there, not resolved by this ADR taking on interaction scope.
- **Mockups are visual references, not proof that a capability exists.**
  Product/marketing mockups inspected during this ADR's drafting (see §7)
  must not be cited as evidence that Inbox, Programs, or any other
  unimplemented surface already exists in the application. See
  `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
  for verified implementation state.

### 10. Accessibility and contrast

- Logo placements must meet the same contrast discipline as any other UI
  element: the endorsed lockup and wordmark on a given surface must be
  legible per WCAG 1.4.3/1.4.11 at the surface's actual background, not
  assumed from the Brand Board's own light-background presentation.
  Indigo-on-Midnight (`~4.03:1`) is insufficient for small normal text —
  where the wordmark or lockup must render on a Midnight or Indigo surface,
  use the "on dark" / "on Indigo" logo variant (white/light rendering), not
  the standard Midnight-ink wordmark recolored ad hoc.
- Favicon and app-icon variants must remain legible at their minimum
  rendered size (16×16 for favicon, per-platform minimums for app icons);
  do not approve a variant for these placements without confirming it
  survives that scale.
- This section states requirements; it does not certify that any current
  placement has been contrast-verified, since no asset integration has
  occurred yet (§7).

## Consequences

### Positive
- One documented, binding identity authority, closing the "brand is
  unencoded in active docs" gap identified by the 2026-07-19 audit.
- Clear separation of concerns: tokens (`ADR-UX-012`) vs. identity (this
  ADR) vs. interaction/navigation (existing ADRs), each independently
  amendable.
- Explicit, honest asset-availability gap recorded rather than silently
  worked around with a placeholder or recreated logo.

### Negative
- No logo can be integrated into the application yet — this ADR intentionally
  blocks that until true production asset files exist, which may delay
  some visual polish relative to the color/token migration.
- The endorsement-restraint rule (§4) requires a small amount of ongoing
  judgment per surface rather than a single mechanical rule; reviewers must
  check new surfaces against §3's placement table.
