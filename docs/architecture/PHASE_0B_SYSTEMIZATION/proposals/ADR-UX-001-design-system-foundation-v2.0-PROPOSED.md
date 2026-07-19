> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-001-FITDESK_DESIGN_SYSTEM_FOUNDATION.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-001 — FitDesk Design System Foundation

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk is a mobile-primary, desktop-enhanced operating system for personal trainers.

Its interface must support:

- fast gym-floor execution on mobile;
- focused planning and review on desktop;
- trainer-friendly workflows over ERP-backed complexity;
- calm, premium, operational visual design;
- clear business consequences without exposing implementation detail;
- accessibility and performance as release requirements, not polish.

The dashboard and core workspaces must feel like a commercial product, not a generic admin panel, decorative portfolio image, or analytics template.

## Decision

FitDesk adopts the following product and design laws:

1. **Operational truth before visual calm.**
   The interface must not communicate “all clear” unless verified product rules support that conclusion.

2. **Action before analytics.**
   Today, Needs Attention, and the safest next action outrank charts and decorative metrics.

3. **Safe actions fast; consequential actions confirmed.**
   Reversible presentation state may respond immediately. Billing, payment, invoice, package, booking, completion, cancellation, no-show, rescheduling, and WhatsApp outcomes remain confirmed-first.

4. **Mobile-primary, desktop-enhanced.**
   Mobile uses focused single-column flows and bottom sheets. Desktop uses a wider operational canvas, compact navigation, and contextual panels only when they contain useful information.

5. **Progressive disclosure.**
   Secondary detail stays contextual. Empty or idle panels must not permanently consume prime workspace.

6. **One coherent visual identity.**
   The primary interaction accent is FitDesk Indigo, not gold. Semantic colors communicate status only.

7. **Existing system before new implementation.**
   Reuse approved tokens, components, contracts, and repository structure. Avoid broad rewrites and one-off primitives.

8. **AI advises; trainer decides.**
   AI may explain, prioritize, and prepare actions. It may not silently execute consequential actions.

## Visual Direction

FitDesk uses:

- **FitDesk Indigo** for primary actions and selection;
- **Deep Ink** for hierarchy and business values;
- **Clean Cloud neutrals** for canvas, surfaces, and borders;
- restricted semantic success, warning, danger, information, and coaching-health colors;
- restrained depth and motion;
- compact operational rows instead of excessive standalone cards;
- clear typographic hierarchy and tabular numeric treatment;
- no decorative gradients, glow, sparkle, or hero-style dashboard treatment.

## Technology and Dependency Rule

The active repository and lockfile are authoritative for installed UI technology.

Existing shadcn-style architecture, Radix primitives, Motion, Recharts, Magic UI, or other libraries may be used only when already installed, already owned by the relevant slice, and compliant with these ADRs.

No ADR grants blanket permission to install a dependency.

Adding, removing, or upgrading any UI, font, chart, motion, compiler, analyzer, accessibility, or test dependency requires explicit approval and a separate change.

Native CSS and browser capabilities may be used only when they preserve current routing, accessibility, and support requirements.

## Claude Code Skill Governance

For FitDesk styling, accessibility, responsive, or frontend-performance work:

1. Load `fitdesk-guardrail` first.
2. Treat `frontend-design`, `web-design-guidelines`, and `vercel-react-best-practices` as advisory proposal sources.
3. Classify every proposal as:
   - Apply directly
   - Apply via token/existing primitive
   - Stop — needs approval
4. External skills may not redefine FitDesk's palette, typography, navigation, motion, component taxonomy, protected flows, or architecture.
5. A suggestion that adds a dependency, changes routing/contracts, expands scope, or introduces optimistic success in a protected flow must stop for approval.

## Governance

All UI work must map to ADR-UX-002 through ADR-UX-012.

When current owner direction, active repository evidence, and an older or copied ADR conflict, stop and report the conflict. Do not use a historical copy to override a current decision.

## Consequences

### Positive

- Prevents visual and behavioral drift.
- Protects financial and scheduling integrity.
- Improves desktop density without weakening mobile workflows.
- Makes external design and performance skills safe to use.
- Keeps ERP complexity behind FitDesk-owned boundaries.

### Negative

- Requires explicit evidence before broad UI changes.
- Slows dependency and architecture changes.
- Requires separate approval for brand-wide token migrations.
