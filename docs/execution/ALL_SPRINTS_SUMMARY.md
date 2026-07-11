# All-Sprints Summary — Sprint 1, 2, 3 (Trust/Command-Center/Consent-Safe Retention)

**Reporting task only.** This document consolidates and independently
verifies three existing reports. Nothing was implemented, fixed, or modified
to produce it (beyond writing this file itself). Nothing was pushed, no PR
was opened.

## Verification note (read before trusting the per-sprint sections below)

All three prior reports (`overnight-report.md`, `sprint-2-report.md`,
`sprint-3-report.md`) **exist, are complete, and every factual claim checked
below matched the actual commit history, diffstats, and fresh test runs.**
None contradicted the commits. Specifically checked and confirmed exact:

- Sprint 2's claimed diffstat ("14 files, +1916/−55") — matches
  `git diff --shortstat` at the exact commit (`5fa078f`) the claim was made
  at, to the line.
- Sprint 3's claimed scope ("4 commits, 4 files, all `docs/execution/*.md`,
  zero code") — matches `git diff --stat sprint-2..sprint-3` exactly (5 files
  including the report itself, 0 code files).
- Test-count progression at every sprint boundary (see §3, table) — each
  number reproduced exactly by checking out that commit and running
  `vitest run` fresh, not by trusting the report's own text.

**One phrasing ambiguity, not an error, worth knowing:** Sprint 1's report
says test count "grew from 1829 (start of tonight)." That 1829 is real and
reproducible — but it's the count *after* the doc-pack-audit commit
(`01106f2`, the first commit on the branch, which itself adds 3 test files).
The true zero-baseline — `main` itself, before any of this multi-night work
touched anything — is **1781**, confirmed by checking out `main` fresh and
running the suite. So the honest full chain is `1781 (main) → 1829 (after
doc-pack audit) → 1846 (Sprint 1 end) → 1941 (Sprint 2 end) → 1941 (Sprint 3
end, no code added)`. "1829" was never wrong, just the start of Sprint 1
*proper* rather than the start of everything.

---

## 1. Merge / dependency state

**Nothing is merged. Nothing is pushed. All three sprints are local-only,
stacked directly on top of each other, not on `main`.** `main` sits at
`744c014` and has not moved since before Sprint 1 began. `sprint-1/trust-and-financial-clarity`
branched cleanly from that `main` tip (verified: `git merge-base main sprint-1`
== `main`'s HEAD). But `sprint-2/command-center-recovery` branched from
**Sprint 1's tip** (`ed22e05`), not from `main` — meaning Sprint 2 is built on
top of Sprint 1 work that has never been reviewed. `sprint-3/consent-safe-retention`
then branched from **Sprint 2's tip** (`7c2db29`) — the same pattern one level
deeper. The result is a three-deep unreviewed dependency chain:
`main ← sprint-1 (10 commits) ← sprint-2 (6 commits) ← sprint-3 (5 commits)`.
If Sprint 1 needs changes after review, Sprint 2 and Sprint 3 both need
rebasing or partial redoing; the same is true one level down for Sprint 2 →
Sprint 3. This is not a live risk today (nothing pushed, nothing merged, no
external system touched), but it is real accumulated review debt, and it is
the single most important fact to act on before merging any of this: **review
and merge in strict order — Sprint 1 first, then Sprint 2, then Sprint 3 —
rather than reviewing them independently or out of order.**

Sprint 3 itself, by contrast, carries no *new* code risk of its own — it is
four audit/plan documents and a report, zero production files, confirmed by
diff. Its dependency risk is entirely inherited from sitting on top of
Sprints 1 and 2.

---

## 2. Risk-ranked action list (deduplicated across all three sprints)

1. **[HIGH] Three-deep unmerged branch stack.** See §1. Review/merge in
   order: sprint-1 → sprint-2 → sprint-3. The longer this sits, the more
   expensive a rebase becomes if early feedback changes anything upstream.

2. **[HIGH] Two related "external-send gating" changes, worth reviewing
   together, not separately.** Sprint 1's follow-up (`665dd17`) wired
   `isExternalPaymentsAllowed()` into the real Whish payment-link call path —
   a **behavior change**: Whish link generation now requires
   `PILOT_ALLOW_EXTERNAL_PAYMENTS=true`, defaulting closed. Sprint 3's audit
   (`15ba83d`, US-059) independently found the *equivalent* gate for WhatsApp
   sends **does not exist at all** — no consent-state field, nothing enforces
   it. These are the same class of problem (a pilot-safety gate around an
   external send/link action) in two different subsystems, at two different
   states of readiness — one now enforced, one still wide open pending a
   schema decision. Worth reviewing as one "external-send safety" concern,
   not two unrelated tickets: confirm the Whish flag default doesn't
   surprise any environment relying on the old unwired behavior, **and**
   treat US-059's consent model as the actual prerequisite before any
   WhatsApp reminder/follow-up code (US-047/048/050) is built — not just a
   nice-to-have.

3. **[MEDIUM] Gate script's tenant-isolation heuristic was silently broken
   during Sprint 1 and the start of Sprint 2** (`dba3393`, fixed in Sprint 2).
   The regex never matched top-level `actions/*.ts` files, and the
   changed-files check missed unstaged modifications — the session's actual
   workflow. Build, full test suite, and lint all ran and passed regardless,
   and coverage decisions were made by reading the code, not the heuristic —
   but the automated "did this story get tenant-isolation coverage" signal
   was a no-op for that entire window, which includes **US-025** (the tenant-
   isolation story itself) and the start of **US-057**. Worth a manual
   second look at those two specifically, precisely because the tool meant
   to catch a gap there wasn't working yet.

4. **[MEDIUM] `lib/statements/assembleStatement.ts` currency fix** (`b04de89`,
   Sprint 1) — the only non-test production code Sprint 1 touched. Fixes a
   real bug (Statement of Account always showed "USD" regardless of the
   client's actual currency) but touches financial-display code; worth a
   direct read before merging. Row-level (as opposed to summary-level)
   statement currency has the identical gap and was deliberately left unfixed
   — see §5.

5. **[MEDIUM] `actions/sessions.ts` dead code** (Sprint 1, sharpened in the
   follow-up) — `completeSession`/`cancelSession`/`noShowSession` and the
   `getSessionById` ownership gate they depend on are all unconditional
   stubs/503s, unreachable from any UI (the live completion path uses
   `actions/schedulingActions.ts` instead). Not a runtime risk today, but a
   standing decision is owed: delete, or keep as a placeholder for
   US-017/US-039.

6. **[LOW] Dashboard session-fetch window widened 7→14 days** (`5fa078f`,
   Sprint 2, US-045) to support a week-over-week trend comparison. Reported
   as backward-compatible and verified not to affect the separate 7-day
   window used by the schedule calendar — low risk, but worth a quick
   confirmation given it touches a shared data-fetch path.

7. **[INFO, not a risk] US-047 found to be less blocked than its Sprint-3
   grouping suggests** — none of its four acceptance criteria actually
   require WhatsApp/consent; the lifecycle infrastructure it needs already
   exists (`client_action_intent` table, already tenant-isolation-tested).
   Deliberately not built despite this, because carving it out of the
   "plan and audit only" scope decision wasn't this session's call to make.
   Worth a product decision on whether to fast-track it independently of
   the rest of Sprint 3.

---

## 3. Per-sprint summary

### Test count progression (verified by checking out each commit and running `vitest run` fresh)

| Point | Commit | Tests |
|---|---|---|
| `main` — true baseline, before any of this work | `744c014` | **1781** |
| After doc-pack audit (first Sprint 1 commit) | `01106f2` | **1829** |
| Sprint 1 end (report commit) | `9419710` | **1846** |
| Sprint 1 end (after follow-up) | `ed22e05` | 1865 *(self-reported, not re-verified independently — see note)* |
| Sprint 2 end (report commit) | `7c2db29` | **1941** |
| Sprint 3 end (current tip) | `6ea4de8` | **1941** (unchanged — no code added) |

The 1865 figure (Sprint 1 follow-up) was not independently re-run this turn
(time-boxed to the boundaries most load-bearing for the merge/dependency
story); every other number in this table was freshly reproduced. No reason
to doubt 1865 — it sits exactly where two new, described test files
(`665dd17`, `7ab0c77`) would put it — but it's flagged here as self-reported
rather than re-verified, per the instruction to distinguish the two.

### Sprint 1 — Trust and Visible Financial Clarity (`sprint-1/trust-and-financial-clarity`, 10 commits, branched from `main`)

**Stories completed:** US-025 (tenant-isolation gap closure), US-026
(zero-row onboarding — mocked coverage only, live validation still blocked),
US-030 (feature-flag inventory + Whish gate tests), US-018 (statement
currency fix).

**Real findings/bugs, not just "tests passed":**
- A real financial-display bug, fixed: Statement of Account summary always
  showed "USD" regardless of the client's real currency.
- `isExternalPaymentsAllowed()` existed, was tested, and was never called —
  found in Sprint 1 proper, wired in the follow-up (`665dd17`).
- Dead code discovered in `actions/sessions.ts`: unreachable, unconditional
  503 stubs for no-show/cancel/complete, sharpened in the follow-up to show
  even the ownership-check function (`getSessionById`) is a stub.
- Fixing the payment-flag gap directly (via `lib/pilot.ts` import) broke
  `next build`, because `lib/whish.ts` is already imported by a client
  component — caught by the gate before commit, fixed via dependency
  injection instead.

**Left explicitly undone/deferred:** US-026 live zero-row validation
(requires tenant-provisioning approval); row-level statement currency;
`.tsx` component testing (repo-wide vitest/tsconfig limitation, see §5);
`lib/whish.ts`'s client-import inconsistency (flagged, not fixed).

**Decided without stopping to ask:** implementing the US-018 currency fix as
real production code (judged a display correction, not "modify payment
logic"); using dependency injection instead of a direct import for the
payment-flag fix once the direct version broke the build; not fixing the
dead `actions/sessions.ts` code or `vitest.config.ts`'s `.tsx` limitation
(both judged out of scope / gated).

### Sprint 2 — Command Center Recovery (`sprint-2/command-center-recovery`, 6 commits, branched from **Sprint 1's unreviewed tip**, not `main`)

**Stories completed:** US-057 (unresolved-sessions batch resolution
backend), US-003 (Needs Attention: unresolved outcomes + missing next
session), US-027 (single overall attention-item cap, replacing three
independently-capped sources), US-045 (sessions-this-week calculation).

**Real findings/bugs:**
- A real crash caught by US-057's own duplicate-prevention tests:
  `previewBatchCompletionAction` unconditionally fetched package balance,
  crashing (`Cannot convert undefined or null to object`) for trial sessions
  that never need it. Fixed by skipping the lookup for trial sessions.
- A real rendering bug: `ActionCenter.tsx` silently falls through to
  overdue-invoice styling for any unhandled `AttentionItem` type — would
  have mis-rendered both new US-003 item types if not caught.
- A pluralization bug in the new overflow-cap label ("+2 more need
  attention"), caught by its own test.
- The gate script's tenant-isolation heuristic bug (§2, item 3) — found and
  fixed here.
- A real conflict between the doc pack (marks US-045 "Built but needs
  upgrade") and the shipped code's own header comment (claims the opposite)
  — traced to a since-resolved historical blocker and resolved by building
  it, not by picking a side blindly.

**Left explicitly undone/deferred:** no UI screen exists yet to actually use
US-057's batch-resolve backend — "the single biggest gap between
acceptance-criteria-code-true and trainer-usable" per the report itself; low
package balance / renewal-prompt detection (needs a bulk query + an
undecided "low" threshold — same gap Sprint 3 later re-confirms for US-050,
not duplicated architecture); wiring `getSessionsThisWeek` into
`BusinessHealth.tsx`'s frozen 3-cell layout (a real layout decision, not
made unattended).

**Decided without stopping to ask:** branching from Sprint 1's tip per the
"not merged → branch from prior tip" instruction; "resolve" = "complete"
only, not no-show/cancel, for US-057 (grounded in Sprint 1's dead-code
finding); widening the dashboard session-fetch window 7→14 days; fixing the
gate script's real bug rather than leaving it silently broken.

### Sprint 3 — Consent-Safe Retention (`sprint-3/consent-safe-retention`, 5 commits, branched from **Sprint 2's unreviewed tip**, not `main`) — Plan and audit only

Scope for this sprint was explicitly narrowed by the user (via
`AskUserQuestion`) from "implement" to **"plan and audit only,"** because its
four stories (US-059, US-050, US-047, US-048) sit squarely in the
WhatsApp/consent/reminder domain every prior sprint excluded, and cross two
`CLAUDE.md` §4 CRITICAL gates (WhatsApp behavior, schema changes). Confirmed
by diff: 5 commits, all `docs/execution/*.md`, zero code files, zero schema
changes.

**Stories audited (not implemented):** US-059 (WhatsApp consent/opt-in —
confirmed no consent-state field exists anywhere in the schema; only a
`whatsappEnabled` trainer-preference boolean), US-050 (package renewal
reminder — blocked on US-059 plus the same undecided low-balance threshold
from Sprint 2), US-047 (automated follow-up suggestions — found to be less
blocked than expected, reusable `client_action_intent` infrastructure
already exists), US-048 (WhatsApp reminder workflow — trainer-approval and
send-logging already exist; consent gate blocked on US-059; timezone-aware
send timing has no implementation at all today).

**Real findings, not just "audit complete":** US-059 is confirmed the
load-bearing prerequisite for US-048 and US-050's own consent-related
acceptance criteria. US-047 is mechanically buildable today without touching
WhatsApp/consent at all — a real, evidence-based finding, not a guess.
`messageLog` has no `reason` field, needed by US-048. No timezone-respecting
send-timing logic exists anywhere in the current send path.

**Left explicitly undone/deferred:** everything — this is a plan-only
sprint by design. Notably: the consent-state schema shape itself (single
mutable column vs. append-only history table), a backfill decision for
existing clients, and whether the consent gate applies to all WhatsApp sends
or only reminder-class ones — all flagged as genuinely open, not answerable
from existing code.

**Decided without stopping to ask:** branching from Sprint 2's tip (same
established pattern); not implementing US-047 despite finding it less
blocked (a scope-boundary call, not this session's to make unilaterally);
running the full gate after every doc-only commit anyway, as cheap
insurance.

---

## 4. Sprint 3: did the "no real WhatsApp send" rule hold?

**Yes — confirmed independently, not by re-stating the self-report.**
Verified two ways:

1. **Sprint 3 added zero production code** (confirmed by diff in §1/§3) — so
   there is no new send path this sprint could have exercised, mocked or
   otherwise.
2. **The one real send path that exists at all in this repo**
   (`actions/messages.ts`'s `sendMessage()` → `lib/evolution.ts`'s
   `sendWhatsAppMessage()`, which does a real `fetch()` to
   `${EVOLUTION_URL}/message/sendText/...`) is exercised in tests only via
   `actions/messages.test.ts`, which explicitly mocks the send call:
   `vi.mock('@/lib/evolution', () => ({ sendWhatsAppMessage: vi.fn() }))`
   (`actions/messages.test.ts:52-53`). No test ever calls the real function.
3. **The other file that imports `lib/evolution.ts`**, `actions/whatsapp.ts`,
   **has no test file at all** — it is not exercised by the suite in any
   form, mocked or otherwise, so it cannot have sent anything for real
   during any test run this session.

No real WhatsApp send occurred, and none could have — this holds for the
entire multi-night session, not just Sprint 3.

---

## 5. Everything blocked / future-scope, in one place

- **`.tsx` component-level testing is not possible in this repo today.**
  `tsconfig.json` sets `"jsx": "preserve"` (correct for Next.js's own
  build), but vitest's Vite transform never consumes that, so any `.tsx`
  import fails immediately. Blocked a routing test and a component-prop
  test in Sprint 1. Fix identified but not applied: add
  `esbuild: { jsx: 'automatic' }` to `vitest.config.ts`'s `test` block, then
  run the full suite once — deliberately left for its own reviewed PR
  rather than a silent addition inside an unrelated story.
- **`actions/sessions.ts` dead code** (Sprint 1) — orphaned no-show/cancel/
  complete stubs, unreachable, now test-locked and comment-documented.
  Standing decision: delete, or keep as a placeholder for US-017/US-039.
- **`lib/whish.ts`'s client-component-import inconsistency** (Sprint 1
  follow-up) — the file's own header says "never import in a client
  component," but `InvoicesView.tsx` already does, for its non-secret
  types/constants. Not a secret leak today; flagged for awareness, not
  fixed.
- **Low package balance / renewal-prompt detection** (Sprint 2's US-003/
  US-027, re-confirmed by Sprint 3's US-050) — needs a bulk tenant-wide
  balance query (today's only query is per-client) and a product-decided
  "low" threshold that doesn't exist in `FITDESK_PRODUCT_DECISIONS_V1_0.md`.
  One gap, referenced by two sprints — not two separate gaps.
- **US-057 batch-resolve UI** (Sprint 2) — backend built and tested, no
  screen exists yet for a trainer to actually use it.
- **`BusinessHealth.tsx`'s 4th metric wiring** (Sprint 2, US-045) —
  `getSessionsThisWeek` is built and tested but not wired in; adding a 4th
  cell to a deliberately-frozen 3-cell layout is a layout decision, not
  made unattended.
- **US-026 live zero-row onboarding validation** (Sprint 1) — still blocked
  on a tenant-provisioning action requiring explicit approval; only mocked
  coverage exists.
- **Bare `npx tsc --noEmit`** has ~15 pre-existing errors unrelated to any
  sprint's work (stale test-file type mismatches, one ES2018 regex flag, a
  narrowed `AppDb` test type), discovered while building the gate script in
  Sprint 1. `next build`'s own type-checker doesn't surface these and passes
  cleanly, which is why the gate uses `build:verify` rather than raw `tsc`.
  Small, low-risk future cleanup, untouched.
- **US-059's consent-state model itself is entirely undesigned** (Sprint 3)
  — schema shape (mutable column vs. append-only history table), backfill
  rule for existing clients, and gate scope (all sends vs. reminder-class
  only) are all open. This is the prerequisite for US-048 and US-050, and
  the reason Sprint 3 built nothing.
- **`messageLog` has no `reason` field** (Sprint 3, US-048) — needed before
  reminder sends can record why they were sent.
- **No timezone-aware send-timing logic exists anywhere** (Sprint 3,
  US-048) — every existing send is manual/trainer-initiated, so timing has
  never mattered before now.
- **Whether US-047/US-048/US-050 should share one trigger→reason→approved-
  send pipeline or be built as three separate implementations** (Sprint 3)
  — flagged as a real design question, not decided.
- **US-047 could be built today without touching WhatsApp/consent at all**
  (Sprint 3) — not a blocker, but an open product decision on whether to
  fast-track it ahead of the rest of Sprint 3.

---

## Final health check (run once, on `sprint-3/consent-safe-retention` tip, the furthest-along branch)

```
node scripts/story-gate.mjs
```

- `build:verify` (typecheck + Next.js production build) — **passed**
- Full `vitest run` — **1941/1941 passed, 71 test files, 0 failures**
- `next lint` — **0 warnings, 0 errors**
- Tenant-isolation coverage heuristic — skipped (no query/mutation/
  background-job file changed since Sprint 3 added no code)

**GATE PASSED.**

Working tree is clean; no changes were made to produce this report beyond
the report file itself. Not pushed, no PR opened.
