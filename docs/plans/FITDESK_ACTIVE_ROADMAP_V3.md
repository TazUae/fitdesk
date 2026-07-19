# FitDesk Active Roadmap v3.0

**Product:** FitDesk SaaS Platform  
**Repository:** `C:\Users\Lenovo\Dev\axis-erp\FitDesk`  
**Status:** Active planning authority  
**Date:** 2026-07-18  
**Supersedes:** `FITDESK_REMAINING_ROADMAP_V2.md`  
**Doctrine:** Truth-first · trainer sovereign · audit-first · atomic and reversible delivery

---

## 1. Purpose

This roadmap is the concise program-level sequencing authority for current FitDesk work.

It does not duplicate the detailed implementation plans. It links them, defines order, and prevents completed or superseded plans from being re-executed.

The current program priority is:

```text
Stabilize the branch
→ validate onboarding and tenant isolation
→ close dashboard truth and usability
→ establish reliable session projection
→ build Client Pulse and Prepared Actions
→ complete approval-gated QA and payment work
```

---

## 2. Current-state summary

### Confirmed program state

- The clean development reset is complete.
- Six affected test users have zero stale `WorkspaceProvisioning` rows.
- Working production users were not changed.
- The next onboarding action is for the six users to log in, reach `/onboarding`, and trigger `Start Workspace`.
- The UI/UX modernization branch contains a large mixed, uncommitted change set.
- The modernization execution log is the starting inventory for branch reconciliation.
- The Goal System functional-closure program is completed and frozen.
- Package/session ledger hardening is completed.
- PPS invoice-on-completion is implemented but still requires approval-gated live ERP QA on a disposable test tenant.
- The dashboard has a current v1.2 blueprint centered on operational truth, Client Pulse, and Prepared Actions.
- The Lebanon payment program has a current cross-repository master execution plan with recorded blockers.

### Immediate risk

The current modernization branch is unverified and uncommitted. No new broad implementation should begin before reconciliation, validation, and an exact-path checkpoint.

---

## 3. Program laws

1. Existing working logic is preferred over rewrites.
2. All ERP I/O uses the existing ERP client/proxy path.
3. FitDesk stores no ERP credentials.
4. Provisioning Agent remains a thin relay with no business logic.
5. No Control Plane direct Docker execution.
6. Billing, package, scheduling, payment, WhatsApp, and tenant flows remain confirmed-first.
7. Unavailable data is never treated as zero or success.
8. Manual invoice creation remains hidden from the trainer workflow.
9. Mobile uses bottom-sheet interactions.
10. Git is the source of truth; Dokploy deploys from Git.
11. No broad staging, resets, database resets, or volume deletion.
12. Every phase is independently reviewable and reversible.

---

# 4. MVP / pilot-safe now

## Phase 0 — Documentation authority and branch reconciliation

### Goal

Establish a trustworthy starting point without losing existing modernization work.

### Inputs

- `docs/plans/ACTIVE_PLAN_INDEX.md`
- `docs/execution/FITDESK_UI_UX_MODERNIZATION_EXECUTION_LOG.md`
- current Git status and diff
- current ADR-UX set
- `.claude/skills/fitdesk-guardrail/SKILL.md`

### Actions

1. Verify repository root, branch, and HEAD.
2. Reconcile the current diff against the execution log.
3. Classify files as complete, partial, broken, unrelated, or stale.
4. Verify high-risk files:
   - `SessionCompletionSheet.tsx`
   - `BookingSheet.tsx`
   - `WorkspaceShell.tsx`
   - `app/globals.css`
   - `lib/dashboard/derive.ts`
   - `package.json`
5. Confirm `components/ui/primitives/ConfirmDialog.tsx` is the canonical confirmation primitive.
6. Verify `components/ui/MobileShell.tsx` has no live consumer before removal.
7. Run typecheck, lint, tests, build, performance baseline, and targeted visual QA.
8. Stage explicit paths only.
9. Commit documentation and code separately where practical.

### Stop conditions

- truncated or syntactically broken application file;
- unexplained dependency or lockfile change;
- unresolved business-logic change hidden in a presentation slice;
- failed tenant-isolation or financial tests;
- inability to separate unrelated work safely.

### Proposed checkpoint commits

```text
docs(ux): adopt FitDesk ADR-UX v2 doctrine
```

```text
refactor(fitdesk): checkpoint verified UI modernization work
```

Exact commit boundaries must follow the verified diff, not these examples blindly.

---

## Phase 1 — Reset-user onboarding validation

### Goal

Validate the six reset test users without changing working production users.

### Flow

```text
Login
→ /onboarding
→ Start Workspace
→ workspace provisioning completes
→ FitDesk routes into the operational app
```

### Acceptance criteria

- all six users create exactly one correct provisioning record;
- no stale tenant mapping returns;
- no cross-tenant reference appears;
- working production users remain untouched;
- failures are recorded per user without destructive retry.

### Scope

Validation first. Any defect becomes a separate narrow fix.

---

## Phase 2 — Dashboard foundation

**Authority:** `FITDESK_DASHBOARD_UI_UX_FULL_PLAN_V1_2.md`

### Sequence

1. Operational truth and availability state.
2. Empty, sparse, and activation states.
3. Today and Needs Attention hierarchy.
4. Compact operational rows.
5. Accessibility and interaction stability.
6. Stable loading shell and perceived-performance baseline.
7. FitDesk Indigo semantic-token re-accent.

### Required outcomes

- unavailable is distinct from empty;
- no false “all clear” state;
- Today and Needs Attention lead;
- one activation action per verified state;
- no duplicate zero-state copy;
- no new route or contract in the foundation slices;
- protected mutations remain confirmed-first.

---

## Phase 3 — Client reconcile and `nextSessionAtUtc`

**Authority:** `PHASE_5_CLIENT_RECONCILE_AND_NEXT_SESSION_PLAN.md`

### Goal

Make the client projection honest and usable by Dashboard Client Pulse.

### Required outcomes

- projection uses existing FD Session repository paths;
- no new ERP surface;
- earliest valid future session is projected deterministically;
- unavailable session data is not interpreted as “not booked”;
- tenant isolation is enforced;
- dry-run reconcile defaults on;
- projection staleness is documented;
- refresh triggers are explicit.

### Sequencing

Complete after dashboard availability-state foundations and before Client Pulse scoring.

---

## Phase 4 — PPS live ERP QA

**Operational artifact:** `docs/runbooks/PPS_LIVE_ERP_INVOICE_QA_RUNBOOK.md`

### Goal

Validate the implemented pay-per-session invoice-on-completion flow against a disposable test tenant.

### Gates

- explicit owner approval;
- confirmed non-production tenant;
- preflight confirms ERP item and custom fields;
- single controlled completion;
- submitted ERP documents treated as non-deletable financial records;
- stop at first anomaly.

No production tenant is used for this phase.

---

# 5. Production-hardening soon

## Phase 5 — Client Pulse v1

### Goal

Build an explainable retention radar:

```text
Healthy
Watch
At Risk
Unknown
```

### Rules

- deterministic first version;
- existing repositories and projections only;
- no new ERP surface;
- missing data produces `Unknown`, never `At Risk`;
- every Watch or At Risk state includes a reason;
- owner approves thresholds and precedence before implementation;
- idle-rail behavior is decided before the container is built.

### Initial signals

Only signals verified as currently available:

- no upcoming session;
- long gap since last session;
- repeated cancellation or no-show;
- package balance state;
- overdue invoice;
- incomplete billing setup;
- unavailable or stale data confidence.

---

## Phase 6 — Prepared Actions v1

### Selected first flow

Subject to Phase 0 verification:

```text
Overdue invoice
→ existing Remind path
→ AI draft via generateDraftMessage
→ full preview
→ ConfirmDialog
→ approved WhatsApp send path
```

### Goal

Surface the prepared reminder one step earlier without changing the approved send contract.

### Guardrails

- no hidden send;
- no optimistic success;
- recipient and tenant context remain authoritative;
- full preview and edit;
- trainer confirmation;
- failure preserves context.

Suggested booking slots remain a later slice because they carry scheduling-engine and availability risk.

---

## Phase 7 — Dashboard metric contract and insight

### Documentation first

Create:

```text
docs/product/FITDESK_DASHBOARD_METRIC_CONTRACT_V1.md
```

### First candidate

Monthly collections, with an explicit definition for:

- source;
- payment-date basis;
- currency;
- refunds and reversals;
- incomplete data;
- comparison period;
- drill-down;
- tests.

Only one purposeful insight is implemented after the contract is approved.

---

## Phase 8 — Lebanon payment-program preflight

**Authority:** `FITDESK_LEBANON_PAYMENT_PROGRAM_MASTER_EXECUTION_PLAN.md`

### Goal

Begin the payment program with the master plan's Phase 1 safety controls.

### First required outcomes

- reverify repository and platform SHAs;
- protect the uncommitted payment worktree;
- verify the pilot ERP Mode of Payment state read-only;
- record and acknowledge the ERP configuration freeze;
- establish rollback anchors;
- resolve Control Plane CI blockers before feature code.

### Hard ordering

ERP payment provisioning must not precede a deployed market gate.

Every payment, schema, ERP, deployment, and production mutation remains explicitly approval-gated.

---

# 6. Future platform architecture later

## Phase 9 — Feature-folder migration replan

The old Phase 8 migration plan is archived.

A fresh plan is required after the modernization branch is stable because the current repository already contains more feature-owned components and compatibility shims than the old baseline recorded.

Constraints:

- UI-first;
- one domain per commit;
- re-export shims;
- no movement of ERP, auth, tenant, database, billing-service, or scheduling-engine boundaries merely for aesthetics.

## Phase 10 — Radius and optional visual refinements

Radius migration remains separate from Indigo re-accenting.

Approve only after:

- core dashboard is stable;
- side-by-side visual QA proves value;
- rollback is clear.

## Phase 11 — Platform deployment hardening

Cross-repository work involving:

- Control Plane;
- ERP Execution Service;
- Provisioning Agent;
- ERPNext/Frappe;
- fitdesk-platform;
- Dokploy deployment.

This remains outside normal product-UI implementation and requires repository-by-repository audits and explicit deployment gates.

## Phase 12 — Future durability

Potential later architecture:

- durable outbox;
- background reconciliation;
- scheduled projections;
- dead-letter handling;
- multi-device conflict resolution;
- offline workflows.

No current plan should claim these exist.

---

# 7. Active-plan dependency map

```text
Phase 0 branch reconciliation
├─ Phase 1 onboarding validation
├─ Phase 2 dashboard foundation
│  └─ Phase 3 nextSessionAtUtc projection
│     └─ Phase 5 Client Pulse
│        └─ Phase 6 Prepared Actions
│           └─ Phase 7 dashboard insight
├─ Phase 4 PPS live ERP QA
└─ Phase 8 payment-program preflight
```

Feature-folder migration and radius migration wait until the active product branch is stable.

---

# 8. UX success targets

## Measurable now

| Metric | Initial target |
|---|---:|
| Identify first meaningful dashboard action | under 3 seconds |
| Warm primary-route perceived response | under 500 ms |
| Local interaction acknowledgement | under 100 ms |
| Sheet perceived opening | under 200 ms |
| Unexpected dashboard layout shift | effectively zero |
| Protected mutation success shown before confirmation | zero |

## Requires instrumentation approval

- attention items resolved without leaving dashboard;
- first-run workspace to first booked session;
- prepared-action review-to-confirm conversion;
- Client Pulse action follow-through.

No analytics instrumentation is silently introduced.

---

# 9. Current owner decisions

Immediate:

1. Approve the active-plan consolidation.
2. Approve branch reconciliation.
3. Approve the exact modernization checkpoint scope.
4. Approve FitDesk Indigo values. **Resolved 2026-07-19** — Midnight `#0B1020`
   and Indigo `#635BFF` approved; Gold rejected as the default application
   accent. See `docs/DOCUMENTATION_AUTHORITY_MAP.md` "Resolved decisions."
5. Decide idle-rail behavior.
6. Approve tabular numerals as the standard for money and counts.

Before Client Pulse:

7. Approve thresholds and precedence.
8. Decide how new, paused, exhausted-package, and financially overdue clients are classified.
9. Decide whether coaching risk and financial risk are shown separately.

Before Prepared Actions:

10. Confirm the existing reminder flow and payload boundary.
11. Approve surfacing the reminder draft one step earlier.

Before payments:

12. Approve each critical mutation gate in the payment master plan.

---

# 10. Completion rule

A roadmap phase is complete only when:

- its acceptance criteria pass;
- required owner decisions are recorded;
- tests and verification are complete;
- documentation status is updated;
- its exact changes are committed;
- the next phase does not depend on uncommitted hidden state.
