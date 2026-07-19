# FitDesk Dashboard UI/UX Full Plan v1.2

**Product:** FitDesk  
**Surface:** Trainer Dashboard / Command Center  
**Canonical repository:** `C:\Users\Lenovo\Dev\axis-erp\FitDesk`  
**Known branch:** `feat/ui-ux-modernization`  
**Known baseline HEAD:** `e027365`  
**Status:** Proposed implementation plan — implementation not yet authorized  
**Accent-color status:** Resolved — Midnight #0B1020 and Indigo #635BFF approved;
Gold rejected as the default application accent, per product-owner decision
dated 2026-07-19. §14.1's Indigo re-accent direction is confirmed. See
`docs/DOCUMENTATION_AUTHORITY_MAP.md` "Resolved decisions" and
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md` §13.  
**Date:** 2026-07-18  
**Supersedes:** `FITDESK_DASHBOARD_UI_UX_FULL_PLAN_V1_1.md`

---

## 0. Purpose of this revision

Version 1.0 established a strong defensive foundation:

- operational truth;
- confirmed-first actions;
- atomic implementation;
- accessibility;
- token governance;
- rollback;
- approval gates;
- protection of billing, scheduling, ERP, tenant, and routing contracts.

Version 1.2 preserves that foundation and the v1.1 excellence layer so FitDesk does not stop at being correct, accessible, and visually clean.

The revised north star is:

```text
Detect meaningful operational risk
→ explain why it matters
→ prepare the next safe action
→ let the trainer review and confirm
→ reflect the verified result
```

The dashboard should become known for two flagship capabilities:

1. **Client Pulse** — a trainer-specific, explainable retention radar.
2. **Prepared Actions** — work prepared in advance, but always reviewed and confirmed by the trainer.

Version 1.2 also binds the plan to the existing modernization execution log, narrows
Client Pulse v1 to already-available repository data, recognizes the overdue-reminder
prepared action as an extension of an existing branch flow, separates immediately
measurable UX targets from instrumentation-dependent targets, and resolves the rail
sequencing dependency before Client Pulse implementation.

---

# 1. Executive summary

## Current diagnosis

The dashboard has a calm visual foundation but still falls short of a best-in-class 2026 operational product because:

1. unavailable or partial data may be interpreted as empty;
2. Today and Needs Attention are not yet dominant enough;
3. desktop space is used inefficiently;
4. repeated cards weaken density and comparison;
5. the right rail can remain oversized while idle;
6. operational metrics lack meaningful trend context;
7. Client Pulse is not yet functioning as a signature product capability;
8. attention items do not yet prepare the next action;
9. the first-run journey is not owned as a complete activation loop;
10. UX quality is not measured with product outcomes.

## Target outcome

The dashboard must answer within three seconds:

1. What is happening today?
2. What needs attention?
3. Why does it matter?
4. What should I safely do next?
5. How is my client base and business changing?

## Strategic structure

The work is divided into two layers.

### Foundation layer

Build trust, correctness, speed, accessibility, and visual consistency.

### Excellence layer

Deliver FitDesk-specific intelligence and prepared operational work that generic dashboard templates cannot match.

## Highest-risk issue

The highest-risk issue remains:

> Unavailable or incomplete operational data being presented as zero or “all clear.”

## Most important differentiator

The highest-value differentiator is:

> Client Pulse with explainable Healthy / Watch / At Risk states and prepared next actions.

---

# 2. Planning evidence and repository boundary

## Known repository state

```text
Repository: C:\Users\Lenovo\Dev\axis-erp\FitDesk
Branch: feat/ui-ux-modernization
Known baseline HEAD: e027365
Working tree: mixed and dirty
```

Known modified or untracked areas include:

- dashboard components;
- client and invoice surfaces;
- scheduling sheets;
- `lib/dashboard/derive.ts`;
- `app/globals.css`;
- `package.json`;
- new UI primitives;
- focus-management utilities;
- visual-QA scripts;
- performance-baseline script;
- ADR-UX files;
- the FitDesk guardrail skill.

## Safety conclusion

Do not make another broad implementation change until the current branch is reconciled.

Do not:

- run `git add -A`;
- reset;
- restore;
- stash;
- clean;
- overwrite unrelated work;
- blindly commit the entire branch.

## Required branch reconciliation before implementation

Use this existing file as the starting change manifest rather than reconstructing the
dirty tree from scratch:

```text
docs/plans/FITDESK_UI_UX_MODERNIZATION_EXECUTION_LOG.md
```

Treat it as a high-value reconciliation input, not unquestioned truth. Verify its entries
against the current Git diff, then classify only the delta it does not already explain.

1. Verify repository root, branch, and current HEAD.
2. Reconcile all modified and untracked files against the execution log.
3. Identify completed, partial, broken, and unrelated changes.
4. Verify known high-risk files such as:
   - `SessionCompletionSheet.tsx`;
   - `BookingSheet.tsx`;
   - `WorkspaceShell.tsx`;
   - `app/globals.css`;
   - `lib/dashboard/derive.ts`;
   - `package.json`.
5. Run the narrowest relevant validation.
6. Create a safe checkpoint only after exact-path review.
7. Stage explicit paths only.
8. Commit documentation and code in separate commits when feasible.

---

# 3. Product north star

FitDesk is not an analytics homepage.

It is a trainer command center.

The dashboard exists to:

- detect meaningful client and business risk;
- prioritize the trainer’s day;
- explain why an item matters;
- prepare the next action;
- preserve trainer control;
- confirm authoritative outcomes;
- reduce administration without hiding consequences.

## Dashboard laws

1. Operational truth before visual calm.
2. Action before analytics.
3. Today and Needs Attention lead.
4. Unavailable data is never zero.
5. Empty, sparse, partial, error, and populated are distinct.
6. No dead cards.
7. No hidden mutation.
8. AI prepares; trainer decides.
9. Context is preserved.
10. Mobile is operational; desktop is deep work.
11. Client Pulse must be explainable.
12. Performance must feel immediate, not merely pass a budget.
13. UX excellence must be measurable.

---

# 4. Target dashboard composition

## 4.1 Wide desktop — populated

```text
┌──────────────┬──────────────────────────────────────────┬──────────────────┐
│ Compact nav  │ Heading + concise Daily Brief            │ Contextual rail  │
│              ├──────────────────────────────────────────┤                  │
│ Dashboard    │ Today                                    │ Client Pulse     │
│ Clients      │ Compact session rows                     │                  │
│ Schedule     ├──────────────────────────────────────────┤ Prepared Actions │
│ Invoices     │ Needs Attention                          │                  │
│ Settings     │ Reason + consequence + safe action       │ Copilot context  │
│              ├──────────────────────────────────────────┤                  │
│              │ Business Health + one useful trend       │ Selected detail  │
└──────────────┴──────────────────────────────────────────┴──────────────────┘
```

## 4.2 Wide desktop — empty or sparse

```text
┌──────────────┬────────────────────────────────────────────────────────────┐
│ Compact nav  │ Heading                                                    │
│              ├────────────────────────────────────────────────────────────┤
│              │ Verified state explanation                                │
│              │ One relevant next action                                   │
│              ├────────────────────────────────────────────────────────────┤
│              │ Activation guidance or concise Business Health             │
│              │ No duplicate zero-state panels                             │
│              │ Right rail hidden unless it has useful content             │
└──────────────┴────────────────────────────────────────────────────────────┘
```

## 4.3 Mobile

```text
Heading + concise Daily Brief
Today
Needs Attention
Client Pulse summary
Prepared Actions
Business Health
Bottom navigation
WorkspaceShell bottom sheets
No permanent right rail
```

---

# 5. Dashboard state model

The dashboard must support eight explicit states.

## 5.1 Loading

- Stable shell appears immediately.
- Correctly shaped skeletons are used.
- No spinner-then-layout jump.
- No reassuring copy.
- No unexpected layout shift.

## 5.2 Unavailable

- Required source failed or cannot be reached.
- Example copy:

```text
We couldn’t refresh client activity yet.
Your existing schedule is still available.
[Try again]
```

- Never display zero or “all clear.”
- Copilot must not infer health from missing data.

## 5.3 Partial

- Some sources succeeded and others failed.
- Clearly identify what is current and what is incomplete.
- Only allow actions supported by complete data.

## 5.4 Error

- Explain what failed.
- Give one safe next step.
- Preserve context.
- Avoid technical ERP language.

## 5.5 Empty

- Required checks completed successfully.
- No relevant records exist.
- Show one clear activation action.

## 5.6 Sparse

- Some records exist, but little activity exists.
- Avoid exaggerating risk.
- Use the first-run or reactivation journey where appropriate.

## 5.7 Populated

- Normal operational state.
- Today, Needs Attention, Client Pulse, and Business Health are active.

## 5.8 Action blocked

- Explain why the action cannot continue.
- Provide a resolution path.
- Never use an unexplained disabled control.

---

# 6. Information hierarchy

## Primary

1. Today
2. Needs Attention
3. Client Pulse
4. Prepared Actions

## Secondary

5. Business Health
6. Daily Brief
7. Quick Actions
8. Copilot context

## Tertiary

9. Historical details
10. Optional trends
11. Secondary navigation shortcuts

## Rules

- Do not show the same empty message twice.
- Do not allow analytics to outrank action.
- Do not make every metric a large card.
- Use compact rows for repeated operational objects.
- Use hierarchy, spacing, and alignment before adding containers.
- The right rail appears only when it contains useful context.

---

# 7. Flagship capability 1 — Client Pulse

## Purpose

Client Pulse is the FitDesk-specific retention and coaching-health radar.

It should help a trainer identify:

- who is healthy;
- who needs watching;
- who is at risk;
- why;
- what the next safe action is.

## v1 status model

```text
Healthy
Watch
At Risk
Unknown
```

`Unknown` is mandatory when the data is unavailable or incomplete.

## Explainability requirement

Every Watch or At Risk state must show a reason.

Examples:

```text
No session in 12 days
Package has 1 session remaining
Two recent no-shows
Payment overdue by 8 days
Goal review is due
No upcoming session is booked
```

## Deterministic first version

Client Pulse v1 must be rule-based and testable.

AI may:

- summarize;
- explain in trainer language;
- prepare a follow-up action.

AI must not silently assign the underlying state.

## v1 data-source boundary

Client Pulse v1 may use only signals computable from repositories and projections that
already exist in FitDesk at the start of Stage 6.

It must not add a new ERP surface, new ERP endpoint, new Control Plane contract, or new
credential path.

Phase 0 must verify which signals are already available. Signals such as low adherence,
goal-review due, or package expiry remain out of v1 unless the required data is already
present in existing repositories and already available to the dashboard or Client Hub.

## Possible signal categories

### Scheduling

- no upcoming session;
- long gap since last session;
- repeated cancellation;
- repeated no-show.

### Package

- one session remaining;
- package exhausted;
- package nearing expiry.

### Billing

- overdue invoice;
- repeated unpaid balance;
- payment configuration incomplete.

### Engagement

- no recent activity;
- missed goal review;
- low adherence when verified data exists.

### Data confidence

- unavailable;
- partial;
- stale.

## Required business decisions

- Exact thresholds.
- Signal priority.
- Healthy/Watch/At Risk precedence.
- How conflicting signals combine.
- Whether financial risk and coaching risk appear separately.
- How newly onboarded clients are treated.

## Surfaces

- Dashboard right rail.
- Needs Attention rows.
- Client Hub.
- Optional client-list status.

## Acceptance criteria

- Every state is explainable.
- No client is At Risk due to missing data alone.
- Unknown is distinct from Healthy.
- The same rule produces the same state.
- Cross-tenant data is impossible.
- Signals link to relevant context or prepared action.

---

# 8. Flagship capability 2 — Prepared Actions

## Purpose

Prepared Actions reduce administration by preparing the work without executing it.

The trainer remains sovereign.

## Core pattern

```text
Detect issue
→ prepare response
→ show full preview
→ trainer edits or accepts
→ ConfirmDialog
→ authoritative mutation
→ verified result
```

## Current branch leverage

The recommended first prepared action is the overdue-invoice reminder because the branch
is reported to already contain most of the flow:

```text
Dashboard card
→ Remind
→ messages composer
→ AI draft through `generateDraftMessage`
→ full-preview `ConfirmDialog`
→ approved send path
```

Phase 0 must verify this exact path and its payload boundaries. If confirmed, Stage 7 is
not a new messaging capability. It is a bounded UX refinement that surfaces the prepared
draft one step earlier while preserving the existing composer, preview, confirmation,
and send contracts.

Any change to message payloads, recipient resolution, tenant context, send semantics, or
the approved messaging path remains approval-gated.

## Candidate prepared actions

### Overdue invoice

```text
Reason:
Invoice overdue by 8 days

Prepared:
Trainer-friendly reminder message

Flow:
Review message
→ edit if needed
→ confirm
→ send through approved WhatsApp workflow
```

### Missing next session

```text
Reason:
No future session is booked

Prepared:
Suggested times generated from approved scheduling availability

Flow:
Review suggested slots
→ select one
→ open booking review
→ confirm booking
```

### Package nearly exhausted

```text
Reason:
1 session remains

Prepared:
Renewal conversation or package review

Flow:
Review
→ choose approved path
→ confirm
```

### Unresolved session outcome

```text
Reason:
Completed session has no final outcome

Prepared:
Resolution workflow opened with known context

Flow:
Review
→ confirm financial/package consequence
→ submit
```

## Guardrails

- No hidden execution.
- No optimistic success.
- No generic manual invoice flow.
- No package deduction before authoritative confirmation.
- No WhatsApp send before preview and confirmation.
- No new scheduling logic outside the existing engine/service/repository/action path.
- No new AI dependency without approval.
- Prepared copy must not expose ERP terminology.

## Acceptance criteria

- Full consequence is visible.
- The trainer can edit or cancel.
- Failure preserves the active workspace.
- Retry is available.
- The authoritative result is reflected after success.
- Browser and focus behavior remain predictable.

---

# 9. First-run and activation journey

## Goal

Own the trainer’s first meaningful operating loop:

```text
Add first client
→ configure billing mode
→ book first session
→ dashboard becomes operational
```

## Activation states

### No clients

```text
Add your first client
Set up their billing and book the first session.
[Add client]
```

### Client exists, no session

```text
Maya is ready to schedule
Book the first session to start her plan.
[Book session]
```

### Session booked

```text
Your first session is on the schedule
FitDesk will surface what needs attention next.
[View schedule]
```

## Requirements

- No persistent onboarding framework in v1.
- No new storage or checklist system.
- Use contextual guidance based on verified state.
- Keep one primary action.
- Do not duplicate setup instructions across sections.

## Success measure

Time from account readiness to first booked session.

---

# 10. Trainer voice system

## Voice principles

- Trainer language, never ERP language.
- Calm and competent.
- Concrete, not vague.
- Helpful, not cheerful for its own sake.
- One reason.
- One consequence.
- One safe next action.
- No unsupported reassurance.
- No fake personification.

## Examples

### Unavailable

Avoid:

```text
ERP synchronization failed.
```

Use:

```text
We couldn’t refresh client activity yet.
Your existing schedule is still available.
[Try again]
```

### Missing session

Avoid:

```text
Client at risk.
```

Use:

```text
Maya may need a new session.
Her last session was 12 days ago and nothing is booked.
[Review suggested times]
```

### Overdue payment

Avoid:

```text
Payment issue.
```

Use:

```text
Ali’s invoice is 8 days overdue.
$400 remains to collect.
[Review reminder]
```

---

# 11. Business Health and insight layer

## Principle

FitDesk should answer:

> How is my business trending?

But it must not add decorative analytics.

## Metric contract must be written now

Create a separate documentation artifact before chart implementation:

```text
docs/product/FITDESK_DASHBOARD_METRIC_CONTRACT_V1.md
```

## First candidate metric

**Monthly collections**

Not “earnings” unless the business definition explicitly supports that term.

## Required contract fields

```text
Metric name
Trainer decision supported
Authoritative source
Recognition date
Payment-date or invoice-date basis
Package and pay-per-session treatment
Refunds and reversals
Currency behavior
Timezone
Incomplete-data behavior
Comparison period
Drill-down destination
Acceptance tests
```

## Future insight criteria

A chart or delta is approved only when:

- the metric contract is approved;
- the source is authoritative;
- incomplete data is handled;
- the visual supports a real trainer decision;
- the existing dependency situation is verified;
- the product owner approves the slice.

---

# 12. UX scorecard

The dashboard must be measured as a product, not only tested as code.

## Measurable now without product analytics

These can be measured through manual QA, focused tests, browser tooling, and the existing
performance baseline once verified.

| Metric | Initial target |
|---|---:|
| Time to identify first meaningful action | under 3 seconds |
| Warm primary-route perceived response | under 500ms |
| Common local interaction acknowledgement | under 100ms |
| Sheet perceived open time | under 200ms |
| Missing-session alert to reviewed booking | maximum 3–4 meaningful steps |
| Unexpected layout shift during dashboard load | effectively zero |
| Attention reason comprehension | understandable without opening detail |
| Protected mutation success shown before confirmation | 0 occurrences |

## Requires a separate instrumentation decision

These targets should be defined now, but they cannot be measured reliably at product
scale until event instrumentation is separately approved.

| Metric | Initial policy |
|---|---|
| Attention items resolved without leaving dashboard | establish baseline, then set target |
| First-run account to first booked session | establish baseline, then reduce |
| Prepared action review-to-confirm conversion | establish baseline |
| Client Pulse action follow-through | establish baseline |

## Instrumentation policy

Do not silently add analytics.

Product instrumentation requires a separate decision covering privacy, event naming,
tenant boundaries, data retention, dependency impact, and operational ownership.

---

# 13. Performance ambition

## Existing budgets

```text
Initial route < 2 seconds
Interaction < 100ms
Sheet open < 200ms
```

## Revised ambition

The dashboard should feel instant even when full data is not ready.

## Required outcomes

- Stable shell appears immediately.
- Correctly shaped skeletons.
- No spinner-to-layout jump.
- No avoidable layout shift.
- Primary-route warm navigation feels below 500ms.
- Rail content does not delay the main workspace.
- Contextual UI responds immediately while protected mutations remain confirmed-first.

## Audit opportunities

- parallelize independent server work;
- start promises early and await late where safe;
- stream non-critical sections;
- preserve stable layout dimensions;
- prefetch the four primary routes on safe hover/focus/viewport signals;
- minimize client-component payloads;
- avoid unnecessary global listeners;
- load heavy contextual content only when needed.

## Restrictions

- No new dependency without approval.
- No optimistic protected mutation.
- No client/server boundary change without contract review.
- No route architecture change in the foundation stage.
- Measure before and after with the existing performance baseline when verified.

---

# 14. Visual-system plan

## 14.1 Indigo re-accent

- Apply FitDesk Indigo globally through semantic tokens.
- Preserve compatibility aliases.
- No mass consumer rename.
- No new raw color values.
- Gold remains deprecated.
- Verify focus contrast.
- Keep rollback centered in token values.

## 14.2 Typography

### Decision to approve separately

- Whether Geist is already available.
- Whether adding it requires a package change.
- Whether system typography remains until a dedicated dependency slice.

### Global rule

Use tabular numerals for:

- money;
- session counts;
- package balances;
- KPI values;
- time slots where appropriate.

Do not wait for a new font dependency to improve numeric hierarchy when existing CSS capabilities are sufficient.

## 14.3 Radius

Radius migration remains separate from re-accenting.

It is not required for the first excellence release.

## 14.4 Conditional rail

Owner must choose:

1. fully hidden when empty;
2. collapsed compact affordance;
3. fixed rail with meaningful default content.

Recommended:

> Fully hidden when no useful context exists; compact affordance only when a discoverable AI entry point is required.

---

# 15. Accessibility acceptance plan

The dashboard must pass:

- one page-level heading;
- logical landmarks;
- logical keyboard order;
- visible focus;
- focus not obscured;
- focus restoration;
- semantic links and buttons;
- adequate target sizes;
- contrast;
- text plus color for status;
- screen-reader loading states;
- screen-reader empty and unavailable states;
- reduced motion;
- 200% zoom;
- long-name handling;
- large-currency handling;
- mobile bottom-sheet accessibility;
- no success animation before authoritative success.

Client Pulse additionally requires:

- status labels, not color alone;
- reason text;
- Unknown state;
- accessible explanation of why the state was assigned.

Prepared Actions additionally require:

- complete preview;
- editable content where applicable;
- consequence explanation;
- safe cancel;
- confirmation;
- focus restoration after success or failure.

---

# 16. Updated classified backlog

## Apply directly

| ID | Improvement | Value | Risk |
|---|---|---|---|
| AD-01 | Unavailable versus empty distinction | Prevents false calm | Medium |
| AD-02 | Truthful empty/sparse copy | Builds trust | Low |
| AD-03 | Today + Needs Attention hierarchy | Faster action | Low |
| AD-04 | Compact operational rows | Better density | Medium |
| AD-05 | Reason + consequence + action copy | Better decisions | Low |
| AD-06 | Reduce nested containers | Cleaner hierarchy | Low |
| AD-07 | Activation journey states | Faster first value | Medium |
| AD-08 | Trainer voice standard | Stronger product identity | Low |
| AD-09 | UX scorecard definitions | Makes excellence measurable | Low |
| AD-10 | Metric contract document | Unblocks future insight | Low |

## Apply via token or existing primitive

| ID | Improvement | Path | Risk |
|---|---|---|---|
| TP-01 | Indigo re-accent | `--fd-*` tokens | Medium |
| TP-02 | Tabular numerals | existing typography utilities | Low |
| TP-03 | Focus treatment | shared focus token | Medium |
| TP-04 | Status chips | existing Badge/Status primitive | Low |
| TP-05 | Prepared-action overlays | `WorkspaceShell` | High |
| TP-06 | Consequential confirmation | `ConfirmDialog` | High |
| TP-07 | Stable loading | existing Skeleton/Spinner/Button | Medium |
| TP-08 | Conditional rail | existing shell and rail | Medium |
| TP-09 | Client Pulse presentation | existing Badge/row/card primitives | Medium |
| TP-10 | Prefetch | existing Next.js capabilities | Medium |

## Stop — needs approval

| ID | Improvement | Reason |
|---|---|---|
| ST-01 | Client Pulse thresholds | Product/business rule |
| ST-02 | Expanded `missing_next_session` | Derivation change |
| ST-03 | Any change to the existing prepared-reminder payload or send contract | Messaging contract change; the current approved flow should be reused if Phase 0 verifies it |
| ST-04 | Suggested booking slots | Scheduling behavior |
| ST-05 | KPI-card navigation | Navigation change |
| ST-06 | New font dependency | Package and lockfile change |
| ST-07 | Financial chart | Metric/data/dependency decision |
| ST-08 | Radius migration | Visual identity change |
| ST-09 | Persistent onboarding checklist | Persistence scope |
| ST-10 | Global three-pane shell | Cross-route architecture |
| ST-11 | Persistent AI chat | Privacy and state scope |
| ST-12 | Product analytics instrumentation | Privacy/event/dependency decision |
| ST-13 | Protected optimistic success | Integrity risk; normally reject |

---

# 17. Revised implementation program

## Phase 0 — Reconcile and checkpoint the branch

### Goal

Create a trustworthy starting point without losing existing work.

### Actions

- use `docs/plans/FITDESK_UI_UX_MODERNIZATION_EXECUTION_LOG.md` as the starting inventory;
- verify the execution log against the current Git diff;
- classify only unexplained or changed deltas from scratch;
- verify `components/ui/MobileShell.tsx` is truly unused before any removal;
- verify `components/ui/primitives/ConfirmDialog.tsx` as the canonical confirmation primitive;
- audit all current changes;
- verify incomplete files;
- run relevant validation;
- classify changes;
- stage exact paths;
- commit only verified slices.

### Stop conditions

- broken or truncated application file;
- unrelated changes cannot be separated;
- package changes are unexplained;
- tests reveal high-risk regressions.

---

## Foundation layer

### Stage 1 — Operational truth and streamed shell

**Scope**

- explicit loading/unavailable/partial/ready state;
- stable dashboard shell;
- correctly shaped skeletons;
- no unavailable-as-zero;
- no “all clear” before successful checks.

**Likely files**

- `app/dashboard/page.tsx`;
- `DashboardView.tsx`;
- dashboard projection/types;
- focused tests.

**Commit**

```text
fix(dashboard): distinguish availability and operational truth
```

---

### Stage 2 — Empty, sparse, and activation states

**Scope**

- remove duplicate empty messages;
- add contextual first-run journey;
- one primary action;
- trainer-language copy.

**Commit**

```text
feat(dashboard): add truthful activation states
```

---

### Stage 3 — Hierarchy and compact operational rows

**Scope**

- Today + Needs Attention lead;
- compact repeated rows;
- stronger typography;
- less card nesting;
- tabular numerals where safe.

**Commit**

```text
refactor(dashboard): strengthen operational hierarchy
```

---

### Stage 4 — Accessibility and interaction stability

**Scope**

- focus;
- semantics;
- target sizes;
- loading announcements;
- reduced motion;
- focus restoration.

**Commit**

```text
fix(accessibility): harden dashboard interactions
```

---

### Stage 5 — Indigo re-accent

**Scope**

- global semantic token values;
- compatibility aliases;
- dashboard hardcoded-color cleanup;
- contrast verification.

**Important amendment**

Do not leave the product in a split gold/Indigo identity across long-lived routes.

The re-accent should be globally coherent at the token level, while component-level raw-color cleanup remains slice-based.

**Commit**

```text
refactor(design-system): apply FitDesk Indigo tokens
```

---

## Excellence layer

### Stage 6 — Client Pulse v1

**Sequencing precondition**

The product owner must decide the idle-rail behavior before Client Pulse UI is built.
This prevents the Pulse container from being implemented twice.

**Scope**

- deterministic Healthy / Watch / At Risk / Unknown;
- explainable reasons;
- dashboard rail presentation;
- Client Hub compatibility;
- derivation tests.

**Preconditions**

- owner-approved thresholds;
- verified data availability;
- tenant-safe projection;
- package and scheduling semantics agreed.

**Commit**

```text
feat(client-pulse): add explainable retention radar
```

---

### Stage 7 — Prepared Actions v1

**Scope**

Start with one flow only.

**Selected first flow, subject to Phase 0 verification:**

```text
Overdue invoice
→ existing Remind path
→ existing AI draft through `generateDraftMessage`
→ existing full-preview `ConfirmDialog`
→ existing approved send path
```

The implementation goal is to surface the prepared draft one step earlier and reduce
friction without changing the approved messaging payload or send contract.

The missing-next-session suggested-slot flow remains a later prepared action because it
carries greater scheduling and availability risk.

**Commit**

```text
feat(dashboard): add first prepared action
```

---

### Stage 8 — Conditional rail and perceived speed

**Scope**

- hide or collapse idle rail;
- expand main workspace;
- prefetch primary routes where safe;
- verify no layout shift;
- measure before/after.

**Commit**

```text
refactor(dashboard): improve rail density and perceived speed
```

---

### Stage 9 — Metric contract

**Scope**

Documentation only:

```text
docs/product/FITDESK_DASHBOARD_METRIC_CONTRACT_V1.md
```

Define monthly collections and future insight rules.

**Commit**

```text
docs(dashboard): define business metric contract
```

---

### Stage 10 — Insight layer

**Scope**

One approved metric and one purposeful visual.

No decorative chart collection.

**Commit**

```text
feat(dashboard): add approved business trend
```

---

## Optional visual refinement

### Stage 11 — Radius migration

Only after:

- Indigo is stable;
- core dashboard is approved;
- visual comparison proves the change is beneficial.

**Commit**

```text
refactor(design-system): migrate dashboard radius system
```

---

# 18. Validation matrix

| Stage | Unit | Integration | E2E | Accessibility | Visual QA | Performance | Owner review |
|---|---:|---:|---:|---:|---:|---:|---:|
| Branch reconciliation | N/A | N/A | N/A | N/A | N/A | N/A | Required |
| Operational truth | Yes | Yes | Yes | Yes | Yes | Yes | Required |
| Activation states | Yes | Optional | Yes | Yes | Yes | Yes | Required |
| Hierarchy/rows | Component | Optional | Yes | Yes | Required | Yes | Required |
| Accessibility | Yes | Optional | Yes | Required | Required | Yes | Required |
| Indigo tokens | Token checks | Optional | Yes | Contrast | Required | Yes | Required |
| Client Pulse | Required | Required | Required | Required | Required | Yes | Required |
| Prepared Actions | Required | Required | Required | Required | Required | Yes | Required |
| Rail/performance | Component | Optional | Yes | Required | Required | Required | Required |
| Metric contract | N/A | N/A | N/A | N/A | N/A | N/A | Required |
| Insight layer | Required | Required | Required | Required | Required | Required | Required |
| Radius | Component | Optional | Yes | Required | Required | Yes | Required |

---

# 19. Manual QA matrix

Test:

- 1900px desktop;
- 1440px desktop;
- narrow desktop;
- tablet;
- common mobile width;
- empty tenant;
- sparse tenant;
- populated tenant;
- ERP unavailable;
- partial data;
- long names;
- large currency values;
- keyboard only;
- reduced motion;
- 200% zoom;
- slow network;
- overlay open/close;
- browser back/forward where applicable;
- Healthy / Watch / At Risk / Unknown Client Pulse states;
- prepared-action preview, cancel, success, and failure.

---

# 20. Owner decisions required

## Immediate

1. Approve this revised program.
2. Approve branch reconciliation before new implementation.
3. Approve exact FitDesk Indigo values.
4. Decide whether Geist requires a dedicated dependency slice.
5. Approve tabular numerals as a global financial/count rule.
6. Choose idle-rail behavior before Stage 6 Client Pulse UI begins.

## Before Client Pulse

7. Approve health-state thresholds.
8. Approve signal priority.
9. Approve handling for new, paused, and package-exhausted clients.
10. Approve distinction between coaching risk and financial risk.

## Before Prepared Actions

11. Choose first prepared action:
    - overdue-payment reminder; or
    - suggested booking slot.
12. Approve preview and confirmation requirements.
13. Confirm WhatsApp and scheduling payload boundaries.

## Before insights

14. Approve the metric contract.
15. Approve whether a trend chart is valuable enough to implement.
16. Approve any new dependency if required.

## Optional

17. Approve or reject radius migration.
18. Approve product analytics instrumentation later.

---

# 21. Files and systems protected by default

Do not touch unless a later approved slice explicitly requires it:

- unrelated routes;
- database schemas;
- migrations;
- package or lockfiles;
- ERP credentials;
- direct ERP access paths;
- Control Plane;
- Provisioning Agent business logic;
- Docker and Dokploy files;
- unrelated scheduling engine logic;
- duplicate ADR trees;
- backups;
- archives;
- worktrees;
- production databases;
- production volumes.

Preserve:

```text
Route
→ Server Action
→ Repository
→ ERP client/proxy
→ Control Plane
→ ERP
```

Preserve scheduling ownership:

```text
lib/scheduling/engine.ts
lib/scheduling/bookingService.ts
lib/scheduling/sessionRepository.ts
actions/schedulingActions.ts
```

---

# 22. Recommended execution order

1. Reconcile the current branch.
2. Create a safe checkpoint with exact paths.
3. Implement operational truth and stable loading shell.
4. Implement activation and empty/sparse states.
5. Implement hierarchy and compact rows.
6. Complete accessibility hardening.
7. Complete the Indigo token re-accent.
8. Finalize the idle-rail behavior decision and container contract.
9. Build Client Pulse v1 using only already-available repository data.
10. Surface the existing overdue-reminder prepared action one step earlier.
11. Improve rail density and perceived speed.
12. Approve and commit the metric contract.
13. Add one justified insight.
14. Reassess radius migration.

---

# 23. Final handoff

## Status

**PASS WITH REPOSITORY VERIFICATION REQUIRED**

## First implementation action

Not dashboard code yet.

The first action is:

> Reconcile and safely checkpoint the current mixed branch.

## First product implementation slice

> Operational truth and stable loading shell.

## Highest-risk unresolved product decision

> Exact Client Pulse eligibility, thresholds, and precedence.

## Recommended Claude Code configuration — branch reconciliation

```text
Claude Code model:
- Model: sonnet[1m]
- Effort: high
- Mode: Explore
```

## Recommended Claude Code configuration — architecture and stage planning

```text
Claude Code model:
- Model: opusplan
- Effort: xhigh
- Mode: Plan
```

## Recommended Claude Code configuration — Stage 1 implementation

```text
Claude Code model:
- Model: sonnet
- Effort: high
- Mode: Implement
```

## Completion statement

This plan authorizes no implementation by itself.

It defines the target dashboard as:

- truthful;
- action-first;
- accessible;
- fast;
- visually coherent;
- trainer-specific;
- explainable;
- prepared to help;
- always under trainer confirmation.
