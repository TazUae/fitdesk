# Overnight Report — Sprint 1: Trust and Visible Financial Clarity

> Branch: `sprint-1/trust-and-financial-clarity` (6 commits, clean working tree,
> **not pushed, no PR opened** — nothing beyond local commit was authorized).
> Scope: US-025, US-026, US-030, US-018 only, in that order, per the overnight
> instruction. Sprint 2/Sprint 3 not started. WhatsApp/payment/invoice-execution
> code was not touched beyond what US-018 explicitly required (one read-only
> currency-display fix — no write path touched).

## TL;DR

All four Sprint 1 stories were completed to the extent safely possible tonight,
each plan-first, gate-verified, and committed separately. Along the way this
session found and documented three real, non-obvious findings that matter more
than the story checklist itself:

1. **A dead code path** (`actions/sessions.ts`'s no-show/cancel actions call an
   ERP function that unconditionally 503s) — orphaned, not reachable from any
   UI, but its test suite passing was giving false confidence.
2. **An unwired payment safety gate** (`isExternalPaymentsAllowed()` exists,
   is documented, is tested — and is never called from the actual payment-link
   code). Low risk today (the real Whish API call is commented out), but will
   matter the moment that integration is completed.
3. **A real financial-trust bug, fixed tonight**: the Statement of Account
   summary always displayed "USD" regardless of the client's actual invoice
   currency — wrong, not just missing, for every non-USD (AED/SAR/etc.) client.

## What shipped, and how it was verified

Every commit below passed `node scripts/story-gate.mjs` (build:verify + full
`vitest run` + `next lint`) before being committed. Test count grew from
1829 (start of tonight) → 1846 (end), zero failures at every step, zero
regressions.

| Commit | Story | What changed | Production code touched? |
|---|---|---|---|
| `01106f2` | (carried over from last session, committed tonight) | Doc-pack audit + traceability map + 3 unit-test files for previously-untested pure helpers | No |
| `311fcdc` | (precondition) | `CLAUDE.md` Sovereign Rules gaps closed (background-job tenant scoping, WhatsApp consent states, tightened AI rules); `scripts/story-gate.mjs` + `docs/execution/sprint-1-gate.md` | No (CLAUDE.md is governance, not runtime) |
| `916c4ef` | **US-025** | 5 new tests closing 2 confirmed gaps: `PackageAssignmentService` cross-tenant denial (service layer, not just repo layer), `sessionRepository.findSessionsInRange` trainer_id filter (feeds dashboard data) | No |
| `991df00` | **US-026** | 2 new tests: stale-failed-row fallthrough doesn't get resumed/reused; a different user's slug collision doesn't leak into the current user's workspace | No |
| `f0f777a` | **US-030** | Flag inventory doc (`sprint-1-us-030-flag-inventory.md`) + `lib/whish.test.ts` (8 tests) | No |
| `b04de89` | **US-018** | Statement currency fix (2 files: `assembleStatement.ts`, `StatementSheet.tsx`) + 2 new tests + 2 pre-existing test assertions updated | **Yes — read-only display fix, see below** |

Full diff vs. `main`: 21 files, +1642/−9 lines. Of those 21 files, **only two are
non-test/non-doc production files**: `lib/statements/assembleStatement.ts` and
`components/clients/StatementSheet.tsx`, both for the US-018 currency fix
described below. Everything else is a test file, a plan/audit doc, or the gate
script.

## The one production-code change made tonight, in full

**What:** `ClientStatementSummary` gained a `currency: string` field, derived
from the client's real invoices (same fallback pattern already used by
`lib/dashboard/derive.ts`'s `getMoneySnapshot`). `StatementSheet.tsx`'s
`SummaryGrid` now passes that value into `fmtMoney()` instead of relying on
its hardcoded `'USD'` default.

**Why it was made without stopping to ask:** it's a read-only display fix —
no financial mutation, no ERP write, no schema change, no touch to
`recordPayment`/`getPaymentLink`/any write path. It directly closes an
explicit acceptance criterion for the story ("Currency is visible") that was
provably false before the fix (a hardcoded default silently overriding real
data). I judged this squarely inside "implement against the plan" for a
Trust-and-Financial-Clarity story, not a "modify payment logic" action
requiring approval under `CLAUDE.md` §4 — that gate is about mutating
financial state, not correcting a display default. If this judgment call
should have gone the other way, it's a two-line revert
(`git revert b04de89`).

**What it does NOT cover:** individual statement rows (invoice/payment line
items) have the identical underlying gap — `Invoice`/`Payment` objects already
carry `.currency`, but the row builders in `assembleStatement.ts` drop it, so
row-level debit/credit/balance figures still render with the `fmtMoney`
default. Deliberately not touched tonight to keep the change small and
reviewable; documented in `docs/execution/sprint-1-us-018-plan.md`.

## The three findings worth your attention first

### 1. Dead code: `actions/sessions.ts`'s no-show/cancel/complete actions (Medium, informational)

`completeSession`/`cancelSession`/`noShowSession` in `actions/sessions.ts` have
solid, tested trainer-ownership gates — but the ERP functions they call
(`lib/erpnext/client.ts`'s `createSession`/`markSessionComplete`/
`cancelSession`/`markSessionMissed`) are unconditional 503 stubs targeting the
dead "PT Session" doctype. `actions/sessions.test.ts` passes because it mocks
that whole module away, which means the passing suite doesn't prove these
actions work — they can't, as written.

**Checked and lower-urgency than it sounds:** grepped every component and
`app/` route for a caller of these three functions — found none. The live UI
(`components/scheduling/SessionCompletionSheet.tsx`) calls
`completeSessionAction` from `actions/schedulingActions.ts` instead, which
correctly routes through the real FD Session backend. So this dead path
appears orphaned, not reachable from a trainer today.

**Recommended next step:** a scoped cleanup PR — either delete the three dead
functions/wrappers (if no no-show/cancel UI is planned to reuse this file), or
rewire them against FD Session if a genuine no-show/cancel/reschedule UI is
coming. Not urgent; not touched tonight (touching session-completion logic is
squarely under `CLAUDE.md`'s approval gate).

### 2. `isExternalPaymentsAllowed()` is documented, tested, and never called (documented, not fixed)

Full writeup in `docs/execution/sprint-1-us-030-flag-inventory.md` (Finding
F-1). Short version: this pilot-safety flag exists and is unit-tested, but
`actions/invoices.ts`'s `getPaymentLink` and `lib/whish.ts`'s `generateLink`
never check it. Not urgent today because the real Whish HTTP call is
commented out (mock-only) — but the flag needs to be wired into that call
path in the same change that eventually uncomments it, not assumed to already
be there.

### 3. Statement currency — fixed tonight, see above

## What's still open / blocked (not guessed at, per your instruction)

- **US-026 live zero-row validation** remains blocked exactly as
  `PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md`/`PHASE_1C` recorded: no confirmed
  zero-row test account exists, and creating/clearing one is a tenant-
  provisioning action requiring your explicit approval (`CLAUDE.md` §4).
  Tonight's work strengthened the *mocked* coverage of the exact code path
  most likely to matter for this (stale-row fallthrough) but did not attempt
  the live validation.
- **`.tsx` component-level testing is not possible in this repo today.**
  Discovered while attempting a routing test for `app/onboarding/page.tsx`
  (the literal `/onboarding` route): `tsconfig.json` sets `"jsx": "preserve"`
  (correct for Next.js's own build), but vitest's Vite transform has no
  downstream step to consume that, and fails immediately on any `.tsx` import.
  This blocked a `page.tsx` routing test for US-026 and a `SummaryGrid`
  currency-prop test for US-018. **Recommended fix** (not made tonight — a
  shared `vitest.config.ts` change affecting every test file, out of scope for
  an unattended single-story change): add `esbuild: { jsx: 'automatic' }` (or
  equivalent) to `vitest.config.ts`'s `test` block, then run the full suite
  once to confirm nothing regresses, in its own dedicated infra PR.
- **Row-level statement currency** — see US-018 section above. Same fix
  pattern as the summary-level fix, larger surface, deliberately deferred.
- **`isExternalPaymentsAllowed()` wiring** — see Finding 2 above.
- **`actions/sessions.ts` dead code** — see Finding 1 above.
- **Bare `npx tsc --noEmit` fails with ~15 pre-existing errors** unrelated to
  Sprint 1 (stale test-file type mismatches, one ES2018 regex flag, a
  narrowed `AppDb` test type) — discovered while building the story gate.
  `next build`'s own type-checker (the thing that actually gates real
  deploys) doesn't surface these and passes cleanly, which is why the gate
  uses `build:verify` rather than raw `tsc`. Flagged in
  `docs/execution/sprint-1-gate.md`; small, low-risk future cleanup, not
  attempted tonight (would touch several unrelated files).

## Decisions made without asking — and why each was judged safe

Per your instruction not to wait for input, here is every point where a
decision was made rather than a question asked, with the reasoning, so you can
override any of them in five minutes if you'd have decided differently:

1. **New branch instead of continuing on last night's `chore/overnight-final-
   doc-pack-build`.** That branch's name and prior scope (a different,
   completed audit task) didn't match tonight's Sprint 1 implementation work.
   `sprint-1/trust-and-financial-clarity` keeps the two efforts cleanly
   separated in history.
2. **Committed, but did not push or open a PR.** You asked for commits per
   story; you did not ask for a push or a PR, and `CLAUDE.md` §6 requires
   explicit instruction for either. Everything is sitting locally, reviewable,
   revertible.
3. **Gate is a script, not a Claude Code Stop hook.** Full reasoning in
   `docs/execution/sprint-1-gate.md`. Short version: a global hook that blocks
   every future session from stopping normally is a much larger, harder-to-
   reverse blast radius than a script a human or agent chooses to run — not
   something to install unattended and unreviewed for the first time overnight.
4. **US-018's currency fix was implemented as production code, not just
   documented as a gap.** Reasoning in the "one production-code change" section
   above — judged as a read-only display correction squarely inside this
   story's own acceptance criteria, not a "modify payment logic" action.
5. **Did not attempt US-026's live zero-row validation.** That would require a
   tenant-provisioning action explicitly gated by `CLAUDE.md` §4. Documented
   the block instead of working around it.
6. **Did not fix the dead `actions/sessions.ts` code or wire up
   `isExternalPaymentsAllowed()`**, even though both are precisely-diagnosed.
   Both require touching session-completion or payment logic respectively,
   both explicitly gated by `CLAUDE.md` §4. Documented instead of fixed.
7. **Did not touch `vitest.config.ts`** to fix the `.tsx`-testing gap, even
   though it blocked two planned tests. It's shared test infrastructure
   affecting every file in the suite — a change like that deserves its own
   reviewed PR with a full-suite verification pass, not a silent addition
   inside an unrelated story's commit.

## What to look at first this morning

1. **Skim `b04de89`** (the currency fix) — it's the only commit that touches
   non-test production code. Small, but touches something financial-facing.
2. **Read Finding F-1** in `docs/execution/sprint-1-us-030-flag-inventory.md`
   — decide whether the unwired external-payments gate needs a ticket now or
   can wait until the real Whish integration is built.
3. **Decide on `actions/sessions.ts`** (Finding 1) — delete the dead
   no-show/cancel/complete path, or keep it as a placeholder for a future
   rebuild against FD Session? Either is a small, scoped follow-up once you
   choose.
4. **If you want `.tsx` component tests to become possible**, the
   `vitest.config.ts` fix is one line plus a full-suite verification pass —
   happy to do that as its own PR whenever you say go.
5. **Everything else** (the six commits, the plan docs per story) is
   ready to review at your own pace — nothing is time-sensitive, nothing is
   pushed, nothing external was called.
