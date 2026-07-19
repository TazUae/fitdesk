# FitDesk Active Plan Index

**Repository:** `C:\Users\Lenovo\Dev\axis-erp\FitDesk`  
**Status:** Active documentation authority index  
**Version:** 1.0  
**Date:** 2026-07-18  
**Scope:** `docs/plans`

---

## 1. Authority rule

This index identifies the current implementation-planning authorities for FitDesk.

A document that is not listed here is not an active implementation authority unless one of the following explicitly grants it higher standing:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/DOCUMENTATION_AUTHORITY_MAP.md`
4. an approved ADR
5. a current product or execution acceptance document

Current code remains the source of truth for as-built behavior. Plans describe intended work and must be revalidated when their baseline is stale.

---

## 2. Active plans

| Domain | Active authority | Status | Current gate | Supporting evidence |
|---|---|---|---|---|
| Overall product roadmap | [`FITDESK_ACTIVE_ROADMAP_V3.md`](FITDESK_ACTIVE_ROADMAP_V3.md) | Active | Reconcile and checkpoint the current modernization branch | Current Git state, execution log, current plans |
| Dashboard / command center | [`FITDESK_DASHBOARD_UI_UX_FULL_PLAN_V1_2.md`](FITDESK_DASHBOARD_UI_UX_FULL_PLAN_V1_2.md) | Proposed — binding blueprint after approval | Phase 0 branch reconciliation | `docs/execution/FITDESK_UI_UX_MODERNIZATION_EXECUTION_LOG.md` |
| Lebanon payment program | [`FITDESK_LEBANON_PAYMENT_PROGRAM_MASTER_EXECUTION_PLAN.md`](FITDESK_LEBANON_PAYMENT_PROGRAM_MASTER_EXECUTION_PLAN.md) | Master plan ready with recorded blockers | Payment Phase 1 preflight, ERP freeze, and owner approval | ADR-MKT-001 and phase handoff artifacts |
| Client/session projection | [`PHASE_5_CLIENT_RECONCILE_AND_NEXT_SESSION_PLAN.md`](PHASE_5_CLIENT_RECONCILE_AND_NEXT_SESSION_PLAN.md) | Active after revalidation | Verify current projection and dashboard derivation | Dashboard v1.2, FD Session repository, current code |

---

## 3. Active operational artifacts outside `docs/plans`

| Artifact | Canonical location | Classification | Current gate |
|---|---|---|---|
| UI/UX modernization change manifest | `docs/execution/FITDESK_UI_UX_MODERNIZATION_EXECUTION_LOG.md` | Execution evidence | Local typecheck, lint, tests, build, visual QA, exact-path checkpoint |
| PPS live ERP invoice QA | `docs/runbooks/PPS_LIVE_ERP_INVOICE_QA_RUNBOOK.md` | Approval-gated runbook | Confirm disposable test tenant and explicit ERP-write approval |

These files are intentionally not kept in `docs/plans` because they are execution evidence and an operational runbook, not planning authorities.

---

## 4. Superseded or completed planning families

The following files must be treated as historical evidence only after they receive a status banner and are moved to the repository's approved archive location:

### Client Management Phase 1

- `CLIENT_MANAGEMENT_PHASE_1_SCOPE.md`
- `CLIENT_MANAGEMENT_PHASE_1_IMPLEMENTATION_PLAN.md`
- `Client_Management_v1_2_1_ERP_Authoritative_Hybrid_MVP.md`

Current authority: ADR-001, current code, architecture handbook, and Roadmap v3.

### Goal System functional closure

- `FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_PLAN.md`

Current status: completed and frozen. The closeout/freeze report is the evidence source.

### Payment predecessor plans

- `FITDESK_TENANT_AWARE_PAYMENT_OPTIONS_IMPLEMENTATION_PLAN.md`
- `FITDESK_WORKSPACE_OPERATING_MARKET_AUTHORITY_PLAN.md`

Current authority: ADR-MKT-001 plus the Lebanon Payment Program Master Execution Plan.

### Completed billing hardening

- `PHASE_6_PACKAGE_LEDGER_HARDENING_PLAN.md`

Current status: completed; retain with closeout evidence.

### Stale feature-folder migration plan

- `PHASE_8_FEATURE_FOLDER_MIGRATION_PLAN.md`

Current status: superseded by the present repository shape. A new migration plan requires a fresh import and ownership audit after the modernization branch is stable.

### Superseded roadmap

- `FITDESK_REMAINING_ROADMAP_V2.md`

Current authority: `FITDESK_ACTIVE_ROADMAP_V3.md`.

---

## 5. File lifecycle rules

### Keep active

An active plan must include:

- current status;
- current repository and branch assumptions;
- controlling authority;
- current gate;
- superseded document references;
- stop conditions;
- verification requirements.

### Archive

Before moving a superseded plan, prepend:

```text
Status: Archived — historical evidence only
Superseded by: <current authority>
Archived date: <YYYY-MM-DD>
Do not execute this plan without a new current-state audit.
```

For completed work, prepend:

```text
Status: Completed and frozen
Closeout evidence: <report or commit>
This document records the historical implementation plan and is not a current task list.
```

### Delete

Permanent deletion is allowed only for:

- a byte-identical duplicate;
- an accidental downloaded copy such as a filename ending in `(1)`;
- a superseded file already preserved in Git history, after explicit approval.

Never delete a unique planning artifact merely because it is old.

---

## 6. Change-control rules

- Do not use `git add -A`.
- Stage exact documentation paths.
- Do not mix plan cleanup with application code.
- Do not reset, restore, stash, or clean the mixed modernization branch.
- Update links after moving files.
- Run `git diff --check`.
- Run any repository documentation-link checker when available.
- Commit authority/index changes separately from archive moves.

Recommended commits:

```text
docs(plans): establish active FitDesk planning authority
```

```text
docs(plans): archive completed and superseded plans
```

```text
docs(execution): classify UI modernization change manifest
```

```text
docs(runbooks): classify PPS live ERP QA procedure
```
