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

---

## Sprint 1 follow-up (second session)

> Two items only, both from "what to look at first" above. Sprint 2 not
> started. Gate confirmed clean on the prior tip (1846/1846) before starting,
> per instruction. Two new commits, `665dd17` and `7ab0c77`, bringing the
> branch to 9 commits total. Test count: 1846 → 1865. Still not pushed, no PR.

### Item 1 — `isExternalPaymentsAllowed()` wiring (commit `665dd17`)

**Found:** exactly one call chain for external payments —
`InvoicesView.tsx` → `actions/invoices.ts:getPaymentLink` →
`lib/whish.ts:generatePaymentLink` → `whishAdapter.generateLink` (the
commented-out Whish API call). No other call site existed anywhere. Full
inventory in `docs/execution/sprint-1-followup-payment-flag-plan.md`.

**Assessed as a small, contained gating fix** (a guard clause against an
already-tested function, same shape as the WhatsApp pilot gate already in
`actions/messages.ts`) — not provider-integration work. Wired it in, per the
plan's Option A.

**A real complication surfaced mid-implementation, and was fixed correctly:**
the original plan called for `lib/whish.ts` to import `isExternalPaymentsAllowed`
directly from `lib/pilot.ts`. That broke `next build` — `lib/pilot.ts` has
`import 'server-only'`, and it turns out `lib/whish.ts`'s types/constants
(`PaymentProvider`, `PAYMENT_PROVIDERS`) are already imported directly by
`InvoicesView.tsx`, a **client** component (to build the payment-method
`<select>`) — despite `lib/whish.ts`'s own header comment saying never to do
that. The gate caught this before commit, as designed. Fixed with dependency
injection instead: `generatePaymentLink()` now takes `externalPaymentsAllowed`
as an explicit parameter (defaults to `false` — fails closed), and
`actions/invoices.ts` (a real `'use server'` file) resolves the flag and
passes it through. Same pattern `PackageAssignmentService` already uses for
its ERP adapter. Full account of the correction in the plan doc.

**A real, deliberate behavior change, disclosed:** Whish payment-link
generation (still a mock URL — the real API call remains commented out) now
additionally requires `PILOT_ALLOW_EXTERNAL_PAYMENTS=true`. Judged correct,
not a regression — the flag's own documented purpose in `.env.example` was
always exactly this, and the URL returned today has never been a real payable
link, only a mock for building the copy/share UX. Cash and bank transfer
(manual providers) are unaffected. **Regression tests exist at both layers**
(`lib/whish.test.ts` for the gate itself, `actions/invoices.test.ts` for the
action layer resolving and threading the real value rather than a hardcoded
`true`) — together they fail if the check is ever removed or bypassed at
either point, satisfying the "make it impossible to silently go live"
requirement.

**One new smaller finding, not fixed, no decision needed from you tonight:**
the pre-existing fact that `lib/whish.ts` is already imported by a client
component, contradicting its own "NEVER import this file in a client
component" header comment. It's not a secret leak (only non-secret
types/constants cross that boundary today), but it's the reason the direct
`lib/pilot.ts` import broke the build, and it's worth knowing about if this
file grows. Documented in the file's header comment and the plan doc; not
touched further.

### Item 2 — orphaned `actions/sessions.ts` stub (commit `7ab0c77`)

**Confirmed still orphaned:** re-ran the repo-wide grep from last night on
tonight's tip — only `actions/sessions.test.ts` and
`lib/business-data/index.ts` import from `actions/sessions.ts`, and the
latter only re-exports `bookSession`/`fetchSessions`, never
`completeSession`/`cancelSession`/`noShowSession`. No component or route
calls them. `SessionCompletionSheet.tsx` (the live completion UI) uses
`completeSessionAction` from `actions/schedulingActions.ts` instead — a
different function on a different, working backend.

**A sharper detail found while writing the lock-in tests:** it's not only the
mutation calls (`markSessionComplete`/`cancelSession`/`markSessionMissed`)
that are dead — `getSessionById`, the function these three actions call
*first* as their ownership gate, is **also** an unconditional stub (always
throws 404). This means today, even a perfectly legitimate, owned session id
can never pass the ownership check in the first place — the dead end starts
one step earlier than described in last night's report. Both layers are now
covered by tests (see below), so this doesn't change the risk picture, just
sharpens it.

**Did not build the real ERP-backed no-show/cancel flow** — out of scope, per
instruction; that's US-017/US-039.

**What was added:**
- `lib/erpnext/client.test.ts` — a new test block proving
  `getSessions`/`getSessionById`/`createSession`/`markSessionComplete`/
  `cancelSession`/`markSessionMissed` behave exactly as documented (empty
  list, or 404/503) — locks in the stub itself.
- `actions/sessions.test.ts` — a new test block proving the action layer
  converts a real-shaped ERP failure into `{ success: false }`, covering both
  "the ownership gate fails as it does today" and "ownership somehow passes
  but the mutation itself still fails" — the second case matters because a
  future half-finished fix could plausibly repair one without the other.
- A file-header comment on `actions/sessions.ts` explaining the orphaned
  state, linking it explicitly to US-017/US-039, and pointing at both new
  test blocks — so whoever picks this up next doesn't have to rediscover any
  of this from scratch.

No runtime behavior changed — this file already failed safe in every path;
these tests prove and preserve that, and the comment makes the "why" visible
without needing to read git history.

### Decisions made without asking tonight — and why

1. **Dependency injection instead of a direct import, for Item 1.** Not a
   choice between two equally-valid options — the direct-import version
   flat-out broke the build. Documented in detail above and in the plan doc
   so the reasoning is auditable, not just the outcome.
2. **Added tests at two layers for both items** (the stub/gate itself, and
   the caller that resolves/consumes it) rather than one. Reasoning: a
   single-layer test can pass while the *other* layer regresses — e.g. Item
   1's gate could be bypassed by a future caller forgetting to pass the flag
   even if the gate logic itself stays correct; Item 2's ownership check
   could get "fixed" without the mutation being fixed too. Both items'
   instructions asked for tests that "fail if the check is ever removed or
   bypassed" / "can't regress into doing the wrong thing quietly" — a
   single-layer test doesn't fully deliver that guarantee.
3. **Did not touch `lib/whish.ts`'s pre-existing client-component-import
   inconsistency**, even though it's what broke the build. Fixing *that*
   would mean deciding whether to split the file, mark only specific exports
   client-safe, or something else — a real design decision, not a gating fix,
   and out of scope for tonight's two items.

### What to look at first (updated)

1. **`665dd17`** — the payment-flag wiring. The behavior change (Whish links
   now need `PILOT_ALLOW_EXTERNAL_PAYMENTS=true`) is the one thing here that
   could theoretically surprise someone if any environment was quietly
   relying on the old unwired behavior — worth a quick mental check against
   what you know of current deployments before this reaches `main`.
2. **`7ab0c77`** — mostly test + comment additions, lower-stakes to review.
3. **Still open, still your call:** the `actions/sessions.ts` file itself —
   delete the dead functions now, or leave them (now clearly commented and
   test-locked) as a placeholder until US-017/US-039 are scheduled? Nothing
   forces this decision soon; the file is safe either way.
4. **Still open, still your call:** the `lib/whish.ts` client-import
   question noted above — no urgency, flagged for awareness only.
