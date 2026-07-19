# FitDesk Dashboard — Visual Blueprint V2

**Document type:** Visual / UX Blueprint (design specification, no code)
**Status:** Approved
**Date:** 2026-07-19
**Supersedes:** `FITDESK_DASHBOARD_COMMAND_CENTER_V1_1.md`,
`FITDESK_DASHBOARD_VISUAL_BLUEPRINT_2026.md` (both archived with supersession
banners, not deleted).
**Authority:** `ADR-UX-009-FITDESK_DASHBOARD_COMMAND_CENTER_SPECIFICATION.md`
(structure/action model), `ADR-UX-012` (Indigo/Midnight tokens), `ADR-UX-013`
(brand identity, logo placement), the canonical Journey Map and Application
Sitemap (`docs/product/`), and
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
(verified current implementation state — the tiebreaker for any conflict
between this blueprint's target description and actual code).

## 0. Scope and honesty rule

This document describes **target visual direction** for the Dashboard. Where
a described element is not yet implemented, it is explicitly marked
**(target only)**. Nothing in this document should be read as evidence that
an unmarked feature already exists — verify against
`FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md` before citing
this blueprint as proof of current behavior.

## 1. Purpose

The Dashboard is the trainer's command center — not an analytics page, not an
ERP homepage. Every element answers one of:

1. What requires my attention now?
2. What should I do next?
3. Which clients need me?
4. How healthy is my business?

Actions always appear before analytics (`ADR-UX-009`).

## 2. Brand foundation

- **Ink/surfaces:** `--fd-bg` → `--fd-surface` → `--fd-card` → `--fd-border`
  light hierarchy, unchanged from the existing token system.
- **Interaction accent:** Indigo `--fd-primary` (`#635BFF`) for primary
  actions, active nav, selection, links, focus.
- **Deep-ink role:** Midnight `--fd-midnight` (`#0B1020`) reserved for the
  desktop shell wordmark region and highest-emphasis headings — not a blanket
  replacement for body text ink.
- **Typography:** Geist Sans (UI), Geist Mono (identifiers/technical data),
  tabular numerals for all money/count values. No typeface change from
  current implementation.
- **Logo:** the FitDesk wordmark in the desktop sidebar header where space
  permits; the F+D icon alone on mobile compact headers and the app
  icon/favicon. No "by Novarra" endorsement on this operational screen
  (`ADR-UX-013` §3–§4). **(target only — no logo asset is integrated yet;
  see `ADR-UX-013` §7.)**

## 3. Desktop layout

Persistent sidebar + compact top bar, consistent with the existing shell
architecture (`components/ui/WorkspaceShell.tsx` family — no new shell
pattern introduced).

```text
┌─────────────┬──────────────────────────────────────────┐
│  Sidebar     │  Top bar: search · profile               │
│  (Indigo     ├──────────────────────────────────────────┤
│  active      │  Needs Attention (lead)                   │
│  state)      │  ────────────────────────────             │
│              │  Today Timeline                           │
│  Dashboard   │  ────────────────────────────             │
│  Schedule    │  Business Health (never outranks action)  │
│  Clients     │                                            │
│  Invoices*   │                                            │
│  Settings    │                                            │
└─────────────┴──────────────────────────────────────────┘
```

`*` Sidebar currently reads "Invoices" (verified current implementation).
The canonical target label is "Billing"; `/invoices` remains the operational
route and is preserved as a compatibility path when/if the label migrates —
see `ADR-UX-008` for the full navigation reconciliation. This blueprint does
not itself migrate the route or label.

Compact, high-signal density: restrained borders, no heavy shadows, rounded
but not playful corners, outlined icons.

## 4. Mobile layout

Bottom navigation for implemented primary destinations, action-first
stacking:

```text
┌────────────────────────────┐
│  Today                      │
│  ──────────────────────     │
│  Needs Attention             │
│  ──────────────────────     │
│  Timeline preview            │
├────────────────────────────┤
│ Home  Clients  Schedule  Invoices*  More │
└────────────────────────────┘
```

`*` Same current-vs-target note as §3. Global Search is persistently
reachable, never demoted into More.

First viewport contains Needs Attention + Timeline preview; the trainer
should understand the day's priorities within a few seconds
(`ADR-UX-009` §Mobile-Primary Rules).

## 5. Sections

### 5.1 Needs Attention (lead)

Unpaid invoices, expiring packages, missed sessions — sorted by urgency,
resolved in place via URL-backed overlay (`ADR-UX-005` Pattern 6).
**Deterministic, rule-derived — not model-scored.** Missed-session items are
gated on session-data truth (verified current implementation: session-derived
signals are limited; invoice-derived signals are real — see
`FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`).

### 5.2 Today Timeline

Upcoming sessions/appointments/gaps. Gated/empty (not fabricated) until
session-derived data is fully real, per the existing "no fake data" rule.

### 5.3 AI Copilot rail

Link-only presentation of the Needs Attention items above, computed
deterministically by `lib/dashboard/derive.ts`. **Verified: makes zero model
calls.** Must not be described as generating suggestions — it surfaces
already-computed attention items. Desktop: right rail, `xl+` only (verified
current implementation gap: mobile/tablet currently shows a static
placeholder instead of the real rail — flagged for correction outside this
blueprint's scope, see the implementation-status audit §9).

### 5.4 Business Health

Analytics — revenue trends, client growth, package utilization. Never
outranks action; positioned below Needs Attention and Timeline.

### 5.5 Quick Actions

Add Client, Book Session, Record Payment. **Manual invoice creation is not a
Quick Action** — package invoices are created through package assignment,
pay-per-session invoices through confirmed session completion, per the
2026-07-19 audit correction.

## 6. States

Every section must render one of these honestly — never a false "all clear":

| State | Rule |
|---|---|
| Loading | Skeleton, not blank; no layout shift on resolve |
| Empty | Genuinely zero items — distinct from unavailable |
| Sparse | Few items — no forced padding to imply more |
| Partial | Some data sources resolved, others pending — say so |
| Stale | Cached/older data — timestamp or freshness indicator |
| Unavailable | Source failed to load — explicit error, retry affordance |
| Blocked | Gated on an unresolved dependency (e.g. session truth) — say why |
| Uncertain | Data exists but confidence is low — never silently upgraded to certain |

No widget may show a fabricated number to fill space. A widget that cannot
be sourced is hidden or clearly marked, never populated with placeholder
data (existing "no fake data" rule, unchanged).

## 7. Explicitly out of scope for this blueprint

- Full Inbox UI — **(target only, not implemented)**. Do not build against
  mockups showing a conversation view; verify `/inbox` does not exist before
  treating any inbox visual as current.
- Programs navigation — **(target only, not implemented)**.
- Predictive Client Pulse (Healthy/Watch/At Risk) — remains a separately
  gated future phase per `docs/plans/FITDESK_ACTIVE_ROADMAP_V3.md` Phase 5;
  not part of this blueprint's shipped Dashboard structure.
- Offline behavior, dark mode — future platform work, unaffected by this
  blueprint.

## 8. Accessibility

Visible, unobscured focus on every interactive element; keyboard-operable
Needs Attention triage; reduced-motion equivalents for any Timeline/rail
animation; 44×44 preferred touch targets on mobile action rows; status
changes (e.g. a triage item resolved) announced to assistive tech, not only
shown visually.
