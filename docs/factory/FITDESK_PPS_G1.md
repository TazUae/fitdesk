# FitDesk PPS Invoicing — G1 Target and Protected Acceptance Boundary

## Authority and state
- **Owner-approved business behavior**: `G1-DEC-01` through `G1-DEC-08` in `ZDN-G1-PPS-001 v0.2.0`, candidate SHA-256 `b6ae598771a8bd5f1afa1a359623760f50519843fd37179d791dae636aca7439`. Approval is for **target rules only**.
- **Independent acceptance candidate**: `ZDN_G1_v0.3.0`, 24 proposed executable cases; historical candidate ZIP SHA-256 `e5088dab74ab63de23c202a0e05c9d6bbb293f912a3294b54824cf6da4feff72` and cases manifest SHA-256 `0c68e99c8b6d45ed2702f2d3d33620651f51a48effbc68c1b29292adda32ec87`. 10 oracle selfchecks previously passed; **24 product acceptance tests NOT_RUN**.
- **NOT APPROVED**: final executable protected-suite content SHA, protected storage/ruleset, actual ERP schema change, first FitDesk staging release. Exact final suite content requires owner sign-off and independent enforcement. Do not rename the above candidate hash into a protected SHA.

## Target acceptance topics
1. PPS only; only an authenticated, authorized trainer for an owned completed session can initiate a synthetic invoice.
2. Persisted booking price must have tenant-approved provenance, not just frontend input stored in ERP.
3. Server derives price, currency, tax, rounding and total from verified authoritative synthetic fixtures; reject or ignore tampered client fields according to finalized protected contract, never trust them.
4. Enforce session/tenant/trainer/customer ownership at every action and read, including cross-tenant attempted IDOR.
5. At most one ERP Sales Invoice per session under true concurrency, retries, duplicate idempotency keys and ambiguous partial success.
6. Strict lifecycle and ERP docstatus mapping; unknown state fails closed. No real Payment Entry/provider link and no implicit paid state.
7. Fail closed and reconcile ERP timeouts/failures; never log credentials or sensitive data.
8. Unit/API/database and critical Playwright running-app proof; record screenshot/trace and exact build SHA.

## Existing repo findings, not automatically accepted behavior
- `actions/schedulingActions.ts` / `sessionCompletionService.ts` PPS path and an unverified `FD Session.rate` provenance.
- Some invoice builder paths lack explicit currency/tax and may default USD.
- `findInvoiceBySession(limit:1)` is a pre-create lookup, not atomic concurrency protection.
- `getInvoiceByIdForTrainer` relies partly on ERP site isolation; verify explicit trainer context and tenant model.
- Partial invoice create/submit/session update can leave recoverable ambiguity.

## Control separation
The coding agent cannot edit protected tests, protected runner, policy or branch protections; it may add nonprotected unit tests. Suite must live outside worker-writable mounts with independent author/reviewer and exact SHA. Any test waived requires preapproved policy; a skipped test is NOT_RUN. Once final suite approved, coding may proceed under conditional Q12 if ACP isolation and runtime budgets pass.
