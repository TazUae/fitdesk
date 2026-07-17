# Sprint 1 — US-026 Zero-Row Onboarding Validation — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> source: `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.1 US-026, cross-checked
> against `FITDESK_PRE_PILOT_GATES_V1_0.md` §4 Gate G2.

## Acceptance criteria (from the backlog)

```
Zero-row user routes to /onboarding.
Start Workspace is visible and can be triggered.
Working users remain untouched.
No stale cross-tenant mapping reappears.
Validation evidence is recorded.
```

## What already exists

`app/onboarding/actions.test.ts` (PR #26, merged prior to this session) already
covers, fully mocked: zero-row happy path, existing-row no-reset guarantee
(`completed`/`queued`/`running` all resume without re-provisioning), fail-closed
validation (blank workspace name, invalid country code), Control-Plane-failure safe
copy, and local-insert-failure ("orphan tenant") safe copy.

## Gap found by reading `app/onboarding/actions.ts` directly

The idempotency check (`startWorkspace` step 4) only resumes rows with status in
`['queued', 'running', 'completed']` — **`'failed'` is deliberately excluded.** A
user whose only prior row is `failed` therefore falls through to slug generation
(step 5), where the app-level collision check
(`collision.userId === userId → slug is usable`) must correctly recognize "this is
my own stale row, safe to proceed" rather than either (a) blocking as a real
collision, or (b) silently resuming/reusing the stale failed tenant mapping. **No
existing test exercised this fallthrough path** — the existing
`it.each(['completed', 'queued', 'running'])` idempotency test explicitly does not
include `'failed'`. This is precisely the backlog's "no stale cross-tenant mapping
reappears" criterion, on the one code path most likely to hit it (a user retrying
after a failed provisioning attempt).

## Implementation (test-only)

Added two tests to `app/onboarding/actions.test.ts`:

1. `'does not resume a stale failed-only row — proceeds to create a fresh
   workspace'` — mocks the idempotency check to return nothing (failed excluded)
   and the slug-collision check to return the user's own stale failed row; asserts
   a brand-new tenant/job is created and inserted, not the stale one.
2. `'does not let another user's slug collision block or leak into this user's
   workspace'` — mocks a slug collision against a *different* user's completed
   row; asserts the code regenerates a suffixed slug (`my-gym-2`) rather than
   reusing or leaking into the other user's tenant, and that the new row is
   correctly attributed to the current user.

Both pass. 17/17 tests in the file (15 existing + 2 new).

## Attempted and abandoned: `app/onboarding/page.tsx` routing test

`page.tsx` is the actual `/onboarding` route component and owns the literal
"zero-row user routes to /onboarding [and sees] Start Workspace" behavior — it has
**zero existing test coverage**, and no `page.tsx`-level test exists anywhere in
this repo to follow as precedent.

Attempted a Node-environment test (no jsdom needed — an unrendered React element is
a plain `{ type, props }` object, so `.type`/`.props` can be asserted directly).
This failed immediately: `tsconfig.json` sets `"jsx": "preserve"` (correct for
Next.js's own build, which does the JSX transform itself), but vitest's Vite-based
transform has no downstream step to consume that — it errors with "Failed to parse
source... make sure to not set jsx to preserve" on the very first `.tsx` import.

This is a real, pre-existing gap in the repo's test infrastructure (not something
introduced tonight), and fixing it means changing `vitest.config.ts`'s transform
behavior — a shared-infrastructure change that could affect how every other test
file in the suite is transformed, not something to make unattended and unreviewed
for a single story. Per this session's own instruction ("a test you can't get
passing after a reasonable number of attempts... stop... write down what you tried,
move to the next one"), this was abandoned rather than pursued into a vitest-config
change. The attempted test file was deleted, not left half-working.

**Recommendation for a future session:** if `page.tsx`/`layout.tsx`-level routing
tests become a priority, the fix is narrow and low-risk — add `esbuild: { jsx:
'automatic' }` (or equivalent) to `vitest.config.ts`'s `test` block, then verify
the full suite still passes before relying on it. Scoped to a dedicated
infra-only PR, not bundled into a story commit.

## Still blocked: live zero-row validation

Per `docs/audits/PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md` and
`PHASE_1C_ONBOARDING_CURRENT_USER_VALIDATION.md`, live validation (an actual user
with zero `WorkspaceProvisioning` rows reaching `/onboarding` and triggering
`Start Workspace` against a real Control Plane) remains blocked: as of the Phase 1C
snapshot, all 6 live users had exactly one row each (5 completed, 1 failed) — no
confirmed zero-row test account exists. Closing this requires either provisioning a
fresh test account or clearing an existing user's row, both of which are
**tenant-provisioning actions requiring explicit approval** per `CLAUDE.md` §4
("Creating, deleting, or retrying tenant provisioning jobs"). Not attempted
tonight — this is exactly the kind of decision this session was told to stop and
flag rather than guess on.

## Validation evidence recorded (the backlog's fifth criterion)

This plan doc plus the git history of `app/onboarding/actions.test.ts` (PR #26 +
tonight's two additions) is the validation evidence for the *mocked/unit* layer.
The *live* layer's evidence remains what Phase 1B/1C already recorded: blocked on
a test-data precondition, not re-attempted here.

## Gate

`node scripts/story-gate.mjs` must pass before commit. New tests fall under
`app/onboarding/*` — outside the gate's `TENANT_SENSITIVE_PATTERNS` regex (which
targets `*/repository.ts`, `*/actions/*.ts`, backfill/reconcile), so the heuristic
will not flag this story specifically; the isolation-relevant assertion here is
about provisioning-row reuse, not multi-tenant data leakage, and is covered by the
tests themselves.
