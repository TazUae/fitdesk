# Client Management Claude Code Prompts

```text
Project: FitDesk SaaS Platform
Plan: Client Management v1.2.1 - ERP-Authoritative Hybrid MVP
Purpose: Traceable Claude Code prompts for audit, planning, implementation, verification, and commit steps
```

## Global rules for every prompt

Every Claude Code prompt must begin with a model configuration block.

Never ask Claude Code to implement without first confirming:

- Active repository is the FitDesk product app.
- Current branch is correct.
- The task does not touch provisioning-agent or erp-execution-service.
- ERP I/O remains through the existing proxy path.
- No direct production mutations are performed.

## Phase 0 - Audit prompt

```text
Claude Code model:
- Model: sonnet
- Effort: high
- Mode: Explore

You are working inside the FitDesk SaaS Platform product app.

Task: perform a read-only audit for Client Management v1.2.1 - ERP-Authoritative Hybrid MVP.

Do not implement code.
Do not modify files.
Do not create migrations.
Do not stage or commit anything.

Read:
- docs/plans/Client_Management_v1_2_1_ERP_Authoritative_Hybrid_MVP.md
- docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md
- docs/plans/CLIENT_MANAGEMENT_PHASE_1_SCOPE.md
- docs/audits/CLIENT_MANAGEMENT_PHASE_0_AUDIT.md
- docs/audits/CLIENT_MANAGEMENT_V1_2_GAP_ANALYSIS.md
- docs/audits/CLIENT_MANAGEMENT_V1_2_FINAL_IMPLEMENTATION_PLAN.md

Audit the current client area and verify whether the Phase 1 scope is still correct.

Output:
- Updated risks if any
- Confirmed files likely touched for Phase 1
- GO / GO WITH CAUTIONS / NO-GO verdict
```

## Phase 1 - Planning prompt

```text
Claude Code model:
- Model: opusplan
- Effort: xhigh
- Mode: Plan

You are working inside the FitDesk SaaS Platform product app.

Task: produce a Phase 1 implementation plan only for Client Management v1.2.1.

Read first:
- docs/plans/Client_Management_v1_2_1_ERP_Authoritative_Hybrid_MVP.md
- docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md
- docs/plans/CLIENT_MANAGEMENT_PHASE_1_SCOPE.md
- docs/audits/CLIENT_MANAGEMENT_PHASE_0_AUDIT.md
- docs/audits/CLIENT_MANAGEMENT_V1_2_GAP_ANALYSIS.md
- docs/audits/CLIENT_MANAGEMENT_V1_2_FINAL_IMPLEMENTATION_PLAN.md

Scope for this plan:
- Data contracts
- Additive schema
- Tenant-scoped repository
- Phone normalization helper
- Duplicate helper
- Backfill skeleton or plan
- Phase 1 tests

Do not implement yet.
Do not modify files.
Do not create migrations yet.

Respect:
- ERPNext Customer remains canonical.
- client_index is local read model/enrichment.
- No UI work in Phase 1.
- No invoice/payment/WhatsApp/scheduling/program changes.
- No ERP proxy internals edited.

Output a file-level implementation plan with acceptance criteria and rollback strategy.
```

## Phase 1 - Implementation prompt

```text
Claude Code model:
- Model: sonnet
- Effort: high
- Mode: Implement

You are working inside the FitDesk SaaS Platform product app.

Task: implement Phase 1 only for Client Management v1.2.1.

Before editing:
1. Verify active repository path.
2. Verify current branch.
3. Re-read:
   - docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md
   - docs/plans/CLIENT_MANAGEMENT_PHASE_1_SCOPE.md
4. Confirm this implementation does not touch UI, invoices, payments, WhatsApp, scheduling, ERP proxy internals, auth internals, or sibling services.

Allowed work:
- Add TypeScript contracts for local client data.
- Add additive local schema/table definitions.
- Add idempotent migration statements.
- Add tenant-scoped repository.
- Add phone normalization helper.
- Add duplicate matching helper.
- Add backfill skeleton or utility if safe and additive.
- Add Phase 1 tests.

Forbidden:
- No Client Directory UI changes.
- No Add Client UI changes.
- No AI route.
- No Client Hub UI.
- No action queue UI.
- No invoice/payment changes.
- No WhatsApp sending changes.
- No scheduling changes.
- No direct ERP calls.
- No ERP credentials.
- No production mutations.

After implementation:
- Run targeted tests if available.
- Report files changed.
- Report verification status.
- Do not commit unless explicitly asked.
```

## Phase 1 - Verification prompt

```text
Claude Code model:
- Model: sonnet
- Effort: medium
- Mode: Verify

You are working inside the FitDesk SaaS Platform product app.

Task: verify Phase 1 implementation for Client Management v1.2.1.

Check:
- New schema is additive only.
- New migrations are idempotent.
- Every local client repository method requires tenant context.
- No UI code was changed unless explicitly approved.
- No invoice/payment/WhatsApp/scheduling/ERP proxy internals were changed.
- Duplicate detection is tenant-scoped.
- Backfill is idempotent and non-destructive.
- Tests cover tenant isolation and created-to-visible query.

Run verification:
- Targeted tests for client module.
- Full unit tests if feasible.
- Lint.
- Build.

Return:
- PASS / FAIL
- Files checked
- Tests run
- Remaining risks
- Recommended next step
```

## Commit prompt

```text
Claude Code model:
- Model: haiku
- Effort: low
- Mode: Commit

Prepare a conventional commit for the approved Client Management Phase 1 changes.

Commit message format:
feat(clients): add ERP-linked client read model foundation

Before committing, verify:
- Tests/lint/build status is documented.
- No forbidden files were modified.
- No secrets or ERP credentials were added.
- No production mutations were performed.

Do not push unless explicitly asked.
```

## Progress note template

Use this after each Claude Code run:

```text
Phase:
Mode:
Files changed:
Tests run:
Result:
Risks:
Next step:
```
