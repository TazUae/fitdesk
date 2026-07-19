> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-009-FITDESK_DASHBOARD_COMMAND_CENTER_SPECIFICATION.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-009 — FitDesk Dashboard Command Center Specification

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

The dashboard is FitDesk's primary operating surface.

It is not an ERP homepage, decorative analytics page, or generic admin template.

It must answer within seconds:

1. What is happening today?
2. What needs my attention?
3. Why does it matter?
4. What is the safest next action?

## Decision

FitDesk adopts an action-first, truth-aware dashboard.

## Information Priority

1. Today
2. Needs Attention
3. Safe contextual actions
4. Concise Business Health
5. Advisory AI and Client Pulse
6. Analytics only when decision-relevant

Today and Needs Attention form the visual anchor. A short Daily Brief may sit above them but must not displace operational work.

## Desktop Composition

```text
Compact navigation
Main operational workspace
  - concise greeting / Daily Brief
  - Today
  - Needs Attention
  - supporting operational rows
  - concise Business Health
Conditional right rail
  - relevant Copilot suggestions
  - Client Pulse
  - selected-item context
```

The main workspace expands when the right rail has no useful content.

## Mobile Composition

```text
Bottom navigation
Single-column operational priority
Daily Brief
Needs Attention
Today preview
Business Health
WorkspaceShell actions
```

No permanent right rail exists on mobile.

## Operational Rows

Repeated items should use compact, aligned rows rather than independent cards.

Each attention row identifies:

- client or object;
- reason;
- consequence;
- verified status;
- safe next action.

Actions open the approved workflow and do not execute hidden mutations.

## Empty and Sparse States

Each state explains:

1. what is absent;
2. what that means;
3. one relevant action, when appropriate.

Do not duplicate “nothing scheduled” messages within the same viewport.

Do not state “all caught up” when:

- source data is unavailable;
- attention rules were not evaluated;
- eligibility is uncertain;
- an unresolved error exists.

## Data Availability Is Not Emptiness (Correction 2026-07-18)

`unavailable`, `loading`, `partial`, `error`, and `empty` are DISTINCT
dashboard states. The dashboard must never translate unavailable or failed
data into zero values or an “all clear” message.

- Reassuring copy is permitted only after the relevant checks complete
  successfully.
- Unavailable data uses clear language such as “Data still connecting” or
  another approved equivalent — never a reassurance.
- Unavailable-state actions must not imply the trainer has no work.

### Verified code evidence (read-only, 2026-07-18)

The current implementation VIOLATES this rule and requires a future
corrective slice:

- `app/dashboard/page.tsx` passes an empty attention array when client data
  is `null` (`clients !== null ? getMissingNextSessionAttentionItems(...) : []`),
  so an ERP outage renders the “You're all caught up” reassurance state.
- Fixing this requires a data-availability signal reaching the empty-state
  component — an approved future implementation slice, not completed work.
- No application code was changed by this documentation correction.

## Missing-Next-Session Rule

Active clients without upcoming sessions are **candidates for evaluation**, not automatically retention risks.

Eligibility must be defined and tested against:

- client status;
- onboarding state;
- previous session history;
- package or pay-per-session configuration;
- paused or unavailable state;
- future scheduling window;
- data-source availability.

Changing this derivation is a product-logic change and requires approval.

### Target vs. current implementation (Correction 2026-07-18)

The list above is the TARGET rule. The current implementation
(`lib/dashboard/derive.ts`, `getMissingNextSessionAttentionItems`) is a
PARTIAL v1 rule, verified read-only on 2026-07-18. It checks only:

1. `client.status === 'active'`;
2. the client has at least one session in the dashboard's already-fetched
   session window (never-booked clients are deliberately excluded as the
   Add Client / first-booking loop's responsibility, per FE-002);
3. no `scheduled` session dated today or later exists in that window.

It does NOT yet evaluate onboarding state, package or pay-per-session
configuration, paused nuance, or window-independent history (a client whose
entire history predates the fetched window is treated as never-booked).

- This ADR is NOT weakened to match the partial code.
- Reconciling code to the target rule is an APPROVED FUTURE implementation
  slice requiring tests and product-owner sign-off on the exact business
  criteria — it is not completed compliance.
- Not every active client without a future session is automatically a
  retention risk; candidates require the eligibility evaluation above.

## Business Health

Business Health is concise and operational.

Preferred baseline values:

- amount collected;
- amount remaining to collect;
- active clients;
- verified exception status.

Values use neutral text unless they represent a status.

Trend deltas or charts require an approved metric contract defining source, period, currency, reversals, completeness, and drill-down.

## Quick Actions

Preferred actions:

- Add Client;
- Book Session;
- Open Schedule;
- Prepare Reminder;
- Review Session Outcome;
- Message Client.

Do not expose generic manual invoice creation or generic Add Payment as normal dashboard shortcuts.

## AI Copilot

AI is advisory.

The rail appears only when useful. No sparkle, gold glow, or permanent empty “standing by” panel.

AI may prepare or explain an action. The trainer confirms consequential execution.

## State Matrix

The dashboard must be reviewed in:

- loading;
- empty;
- sparse;
- populated;
- error;
- partial/unavailable data;
- blocked action;
- long-text and large-value cases;
- narrow desktop;
- mobile;
- keyboard-only;
- reduced motion.

## Accessibility

- one clear page heading;
- logical landmarks and keyboard order;
- visible focus;
- no color-only status;
- correct button/link semantics;
- accessible loading and empty-state copy;
- focus restoration after overlays;
- usable targets.

## Dashboard Laws

1. Operational Truth Before Reassurance
2. Action Before Analytics
3. Today and Needs Attention First
4. No Dead Cards
5. No Duplicate Empty Messages
6. Contextual Rail Only
7. Triage Opens a Workflow; It Does Not Hide a Mutation
8. AI Is Advisory
9. Protected Flows Are Confirmed-First
10. Analytics Must Support a Defined Decision

## Claude Code Skill Interaction

All dashboard design and performance proposals pass through `fitdesk-guardrail`.

A chart dependency, global shell redesign, KPI navigation behavior, new route state, optimistic protected flow, or derivation change is `Stop — needs approval`.

## Governance

If a widget does not improve operational truth, priority, consequence, or next action, challenge or remove it.
