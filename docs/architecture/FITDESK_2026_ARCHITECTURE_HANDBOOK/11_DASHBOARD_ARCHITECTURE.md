# 11 — Dashboard Architecture

> **Purpose:** Document the Dashboard Command Center, mark widgets blocked by unresolved session
> truth, and keep fake data forbidden.
> **Last verified:** 2026-06-25 · **Authority:** `ADR-UX-009`.

## Scope

`app/dashboard/page.tsx`, `lib/dashboard/*`, and dashboard widgets/triage overlays.

## Current known state (verified)

- The dashboard is an **Action-First Command Center** (ADR-UX-009), not an analytics page.
- Action Center + Today Timeline shipped in prior work; triage uses URL-backed overlays.
- **Session-derived data is stubbed** (see `09`): the PT Session ERP read returns nothing, so any
  widget that depends on real sessions (Today Timeline counts, session volume, "missed sessions"
  attention items) is **limited to invoice-derived signals** until session truth is resolved.
- Real attention signals today come primarily from invoices/outstanding balances; sessions are not yet real.

## Architecture rules (ADR-UX-009)

Every widget must answer one of four questions, in this priority order:
```text
1. What needs my attention now?   (Needs Attention)
2. What should I do next?          (Timeline / Quick Actions)
3. Which clients need me?          (Client Pulse)
4. How healthy is my business?     (Business Health)
```

### Structure
- **Daily Brief** (sessions today, revenue today, new clients, open attention) — session counts gated.
- **Needs Attention** (unpaid invoices, expiring packages, missed sessions) — sorted by
  urgency, triage-in-place. Missed-session items gated on session truth. Attention items are
  **deterministic/rule-derived**, not model-scored; do not label them "AI risk" — the current
  `AiCopilotRail` implementation makes zero model calls (verified 2026-07-19, see
  `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md` §9).
- **Today Timeline** — upcoming sessions/appointments/gaps — **gated** until sessions are real.
- **AI Copilot** — link-only presentation of the deterministic attention items above; advisory only;
  never auto-acts; must not be described as model-generated.
- **Business Health / Client Pulse** — analytics, **never outrank action**.
- **Quick Actions** — Add Client, Book Session, Record Payment. Manual invoice creation is not a
  Quick Action; it remains hidden from the normal trainer workflow (2026-07-19 audit correction).

### Dashboard Laws
1. Action before analytics. 2. **No dead cards.** 3. Triage in place. 4. Context preservation
   (URL-backed). 5. AI is advisory. 6. URL-backed triage state.

### Mobile-primary
- First viewport: Daily Brief + Needs Attention + Timeline preview; priorities clear within ~3 seconds.

## Do-not-touch areas

- **No fake data.** A session-derived widget that cannot be sourced is **hidden or clearly empty**,
  never populated with placeholder numbers. (This is a `00` rule.)
- AI never performs actions automatically.

## Open decisions

- Which session-gated widgets light up after the PT/FD Session decision + Phase G (`09`).
- Whether "Book Session" Quick Action is enabled before drag-create UX is reconciled (F).

## Verification checklist

- [ ] Every visible widget answers one of the four questions (else remove it).
- [ ] No widget shows fabricated session/engagement numbers.
- [ ] Session-derived widgets are visibly gated/empty until session truth resolves.
- [ ] Triage state is URL-backed and dismissable without full reload.

## Related files

- `app/dashboard/page.tsx`, `lib/dashboard/derive.ts`, `components/modules/*` (dashboard views),
  `actions/sessions.ts` (gated source).

## Related ADRs

- `ADR-UX-009` (dashboard command center), `ADR-UX-005` (triage interaction).

## Next actions

- Keep session widgets gated until `09`/G resolve; revisit Quick Action "Book Session" after F1.
