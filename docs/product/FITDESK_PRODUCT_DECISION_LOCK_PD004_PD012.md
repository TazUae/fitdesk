# FitDesk Product Decision Lock — PD-004 & PD-012

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md`. This record **resolves** two
> decisions the doc pack left open in
> `_inputs/fitdesk-final-doc-pack-v1-1/FITDESK_PRODUCT_DECISIONS_V1_0.md`
> (PD-004, PD-012). It is grounded in the current `main` codebase, not new intent.
> Date: 2026-07-11. Scope: docs-only; no runtime code changed to produce this record.

---

## PD-004 — Manual Invoice QuickAction Placement

**Status: RESOLVED → Option A (manual invoice hidden from the normal trainer workflow).**

The decision ledger left this open ("Option B if operationally needed, otherwise A;
reject Option C"). The current codebase has **already implemented and test-locked
Option A** — this record ratifies that reality rather than opening a fork:

- The dashboard Invoice quick action routes to the **invoice list**
  (`/dashboard/invoices`), not a create form — see
  [features/dashboard/components/QuickActions.tsx:8](../../features/dashboard/components/QuickActions.tsx).
  Its own comment: *"manual invoice creation is not part of the normal trainer
  workflow (invoices are generated automatically from package assignment /
  pay-per-session completion)."*
- The FD Session completion path explicitly documents "No manual invoice UI"
  ([actions/schedulingActions.ts:325](../../actions/schedulingActions.ts)).
- Absence of a manual-invoice CTA is **enforced by tests** across the client form,
  client details, and Client Hub — see
  [components/clients/__tests__/assign-package-source.test.ts](../../components/clients/__tests__/assign-package-source.test.ts)
  (`does not expose a manual invoice creation CTA`, `does not introduce a manual
  invoice CTA`).

**Rationale:** normal trainer billing flows through package assignment, pay-per-session
completion, payment recording, and package renewal — a manual invoice shortcut would
undermine the session-to-billing model (PD-001/PD-002).

**Caveat (product-owner call):** if a manual-invoice **admin/power shortcut** later
becomes operationally necessary (Option B), that is **net-new, approval-gated feature
work** — it must be labelled admin/power, hidden from primary mobile thumb actions,
confirmation-gated, context-showing, and audited (per the PD-004 Option-B acceptance
criteria), and it would require updating the tests above. It is **not** in scope for
this Phase 0 lock. Option C (manual invoice as a primary quick action) remains rejected.

---

## PD-012 — Canonical Backlog Version

**Status: RESOLVED → Adopt the Sovereign Product Backlog v2.1 as canonical.**

`FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` is adopted as the canonical implementation
backlog (NOW / NEXT / LATER = priority, not build status). The earlier
`FITDESK_USER_STORIES_BY_FLOW_EPIC_V1_0.md` is retained only as long-form traceability
reference. Build status remains governed by
`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` (refresh pending — it under-credits
US-025/026/030 and over-credits US-017/US-039; see
`docs/audits/OVERNIGHT_FINAL_DOC_PACK_AUDIT.md`).

**Follow-up (not this record):** the 12-file doc pack still physically lives under
`_inputs/fitdesk-final-doc-pack-v1-1/`. Importing it into `docs/product/*` as tier-3
canonical docs (per the authority map) is a separate, larger task; this record only
locks the *decision* to treat v2.1 as canonical.
