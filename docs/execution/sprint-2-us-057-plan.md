# Sprint 2 — US-057 Unresolved Sessions Batch Resolution — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.3 (lines
> 238–263) and cross-checked against `FITDESK_PRE_PILOT_GATES_V1_0.md` §10 Gate
> G6 (lines 345–374) and the executive manifest's Phase 3 framing.

## Acceptance criteria (verbatim from the backlog)

```
Priority: NOW

Story:
As a trainer,
I want skipped session outcomes to appear as unresolved sessions,
so that I can batch-resolve them later when I have time.

Acceptance criteria:
Past sessions without outcomes appear in Needs Attention.
Trainer can resolve one or multiple sessions.
Financial consequences are shown before confirmation.
Resolved sessions leave the unresolved list.
Duplicate billing and package mutations are prevented.
Actions are auditable.
```

Gate G6 adds: "Batch resolution is mobile-friendly" and "Unresolved sessions
are visible" — UI-level criteria noted but not independently testable given
the `.tsx` component-testing gap documented in Sprint 1 (`vitest` can't
transform `.tsx` files against this repo's `"jsx": "preserve"` tsconfig).

## Status per the doc pack

`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` §7 lists this as **Not
built** — confirmed by code inspection: no "unresolved session" concept
exists anywhere in the repo (grep for "unresolved" returns one unrelated doc
mention). This is genuine new construction, not an upgrade — treated with
the extra care requested: real tests for the duplicate-prevention path
specifically, not just the happy path.

## What already exists that this can safely build on

- `lib/dashboard/derive.ts` — the established pattern for pure,
  well-tested dashboard-derivation functions (`getAttentionItems`,
  `getTodaySections`, `getNextUp`) operating on the legacy `Session[]` type.
  `getUnresolvedSessions` follows the same shape.
- `lib/scheduling/sessionCompletionService.ts`'s `completeSession(deps, id,
  expectedVersion)` — the **only live, tested, billing-consequential session
  mutation in the app** today. Critically, it **re-fetches the session fresh
  from `deps.findSessionById` on every call** and enforces two guards before
  any billing dispatch:
  1. **Version check** (optimistic concurrency) — `VersionConflictError` if
     `expectedVersion` doesn't match current state.
  2. **Immutable-state check** — `ImmutableSessionError` unless status is
     `'scheduled'` or `'confirmed'` (`MUTABLE_STATUSES`).
  Both package consumption (`PackageConsumptionService.consumeSession`) and
  PPS invoicing (`findInvoiceBySession` idempotency check before `createInvoice`)
  are themselves already idempotent. This means **duplicate-prevention for
  batch resolution does not need to be invented — it needs to be correctly
  reused**, sequentially, per item, exactly as `completeSessionAction`
  already does for one session.
- `actions/schedulingActions.ts`'s `completeSessionAction` — the existing
  single-session wrapper (auth → tenant context → deps construction →
  `completeSession` → error mapping). Its own header comment already states:
  *"Not included (deferred to C4C–C5): cancelSessionAction,
  rescheduleSessionAction, markNoShowAction."*

## Scope decision (documented, not guessed past)

**"Resolve" in this implementation means "complete."** No-show and
cancel/reschedule outcomes are explicitly out of scope tonight, for two
independent, reinforcing reasons:

1. This is US-057's own stated scope — the backlog's Sprint 2 framing pairs
   it with US-003/US-027 (dashboard surfacing), not with US-017/US-039
   (no-show and cancel/reschedule outcome handling, separate NEXT-priority
   stories). `completeSessionAction`'s own header comment confirms
   no-show/cancel/reschedule are deliberately deferred, not yet built on the
   live FD Session path.
2. Sprint 1's follow-up work (see `docs/execution/overnight-report.md`'s
   follow-up section) found that `actions/sessions.ts`'s no-show/cancel
   actions call an ERP function that unconditionally 503s and is orphaned —
   routing "batch resolve" through that path would directly violate this very
   story's "duplicate billing and package mutations are prevented" criterion,
   since a half-working mutation is a worse duplicate-prevention risk than a
   fully-working one.

If a future session wants "resolve" to also offer no-show/charge/deduct/waive
as batch outcomes, that requires US-017 to actually build a live no-show
mutation first — not something to bolt onto this story's scope tonight.

**"Financial consequences shown before confirmation" is a read-only preview,
not a replica of the real consumption algorithm.** Rather than reimplementing
`PackageConsumptionService`'s internal purchase-selection logic in a
"preview" path (risking silent drift between preview and reality — a worse
failure mode than no preview), the preview shows: billing mode, and for
package mode the client's **total** package balance across all active
purchases (`PackageLedgerRepository.deriveBalancesByClient`, summed), and for
pay-per-session mode the session's own rate as the invoice amount that will
be generated. This is honest and accurate without needing to predict exactly
which purchase row the real consumption will select.

## Implementation plan

1. **`lib/dashboard/derive.ts`** — add `getUnresolvedSessions(sessions,
   today, nowTime?)`, mirroring `getNextUp`'s date/time comparison (inverted:
   strictly *before* now, not after), filtering `status === 'scheduled'`
   (covers both FD `'scheduled'` and `'confirmed'` after the lossy
   `fdSessionAdapter.ts` mapping — both are legitimately "not yet resolved").
   Returns items sorted oldest-first (most overdue surfaces first).
2. **`lib/scheduling/sessionCompletionPreview.ts`** (new) — a pure function
   shaping already-fetched data (billing mode, package balance, session rate)
   into a discriminated preview result. No DB access in this file — testable
   without mocks.
3. **`actions/schedulingActions.ts`** — two additions:
   - `previewBatchCompletionAction(sessionIds: string[])` — read-only, fetches
     each session + billing mode + package balance, shapes via the pure
     preview function. No mutation.
   - `batchCompleteSessionsAction(items: {id: string; expectedVersion:
     number}[])` — resolves auth/tenant **once**, then loops calling the same
     `completeSession(deps, id, expectedVersion)` used by
     `completeSessionAction`, sequentially (not `Promise.all` — sequential
     matters for the duplicate-ID-in-one-batch test below, and avoids
     concurrent writes to the same underlying tables). Collects a per-item
     `{ id, success, data? , error? }` result — one failure must not abort
     the rest of the batch.
4. **Tests — extra emphasis on duplicate prevention, per instruction:**
   - `lib/dashboard/derive.test.ts` — `getUnresolvedSessions`: past scheduled
     sessions are unresolved; completed/cancelled/missed are not; today's
     session before `nowTime` is unresolved, after is not; sort order.
   - `lib/scheduling/sessionCompletionPreview.test.ts` — pure shaping logic
     for package/pay-per-session/trial/unset billing modes.
   - `actions/schedulingActions.test.ts` — `batchCompleteSessionsAction`:
     - **The same session ID appearing twice in one batch call is only
       processed once** — the second occurrence must fail with
       `ImmutableSessionError`/`VersionConflictError`-shaped safe failure,
       never a second package consumption or a second invoice.
     - **Calling the batch action twice with the same items** (simulating a
       double-submit / retry) — the second call's items all fail safely, none
       re-consume or re-invoice.
     - **A package-mode session with no balance** mixed into a batch with a
       healthy one — the no-balance one fails per-item, the healthy one still
       completes; batch does not abort early.
     - **Partial failure isolation** — one item throwing an unexpected error
       does not prevent subsequent items in the same batch from processing.
     - Happy path: multiple unresolved sessions across different billing
       modes complete correctly in one batch call.

## Gate

`node scripts/story-gate.mjs` must pass before commit.

## Scope decision made during implementation: no dedicated UI built tonight

Delivered: `getUnresolvedSessions` (detection), `previewSessionCompletion` +
`previewBatchCompletionAction` (financial-impact preview), and
`batchCompleteSessionsAction` (the actual batch mutation) — all real,
thoroughly tested, ready to be called from a UI.

**Not built tonight: a dedicated "batch resolve unresolved sessions" screen
or dialog.** Reasoning:

1. US-003 and US-027 (next in this sprint, in this exact order per
   instruction) are explicitly about extending the dashboard's Needs
   Attention surface — the natural place unresolved sessions become visible
   to a trainer. Building a separate, parallel UI surface tonight ahead of
   that work risks either duplicating it or conflicting with how US-003/027
   want to present the same data.
2. Sprint 1 already established that `.tsx` component files cannot be unit
   tested in this repo (`vitest` can't consume `"jsx": "preserve"`). A batch-
   resolve UI is exactly the kind of surface this story asked for "extra
   care" on — building a multi-step, financial-consequence-displaying,
   multi-select UI with zero automated test coverage is a materially
   different risk than the backend work above, all of which does have real
   test coverage.
3. Gate G6's "batch resolution is mobile-friendly" criterion cannot be
   verified by this session at all (no visual/browser testing available
   unattended) regardless of how much UI code gets written — building it
   wouldn't actually let this criterion be verified tonight either way.

**What this means concretely:** "Trainer can resolve one or multiple
sessions" and "financial consequences are shown before confirmation" are
satisfied at the API level (both actions exist, are callable, and are
tested) but not yet reachable by a trainer through the app UI. This is the
#1 item flagged in the Sprint 2 report for your review — building the actual
screen is a comparatively small, low-risk follow-up once you're ready for it
(the hard part — safe batch mutation — is done and tested), but it's a real
gap between "the acceptance criteria are code-true" and "a trainer can use
this."
