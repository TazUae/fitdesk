# Sprint 3 Report — Consent-Safe Retention (Plan and Audit Only)

## Branch status — read this first

**Sprint 2 (`sprint-2/command-center-recovery`) was NOT merged into `main`**
at the start of tonight's session — confirmed via
`git merge-base --is-ancestor` against both local and `origin/main`; the
branch itself was never pushed. `main` is still at `744c014`, unchanged
since before Sprint 1.

Per the same pattern as Sprint 2, `sprint-3/consent-safe-retention` was
branched from the **tip of `sprint-2/command-center-recovery`** (commit
`7c2db29`), not from `main`. **Three branches now stack on each other,
none merged, none pushed:** `main` ← `sprint-1/trust-and-financial-clarity`
← `sprint-2/command-center-recovery` ← `sprint-3/consent-safe-retention`.
If Sprint 1 or Sprint 2 needs changes after your review, both Sprint 2 and
Sprint 3 may need rebasing. Nothing is pushed or merged, so nothing is at
risk of going live — but the dependency chain is now three deep, which is
worth resolving (by reviewing/merging in order) before it grows further.

Gate confirmed clean on the new branch before any work started:
build:verify + full vitest suite (1941/1941 at that point) + lint, all
green.

## Why tonight's scope is different from Sprint 1/2

You were asked directly, before any work started, how far tonight should go
— **because Sprint 3's four stories (US-059, US-050, US-047, US-048) are
exactly the WhatsApp/consent/reminder domain every prior overnight session
explicitly excluded**, and `CLAUDE.md` §4 lists "Modifying WhatsApp or
external messaging behavior" and "Changing database schemas" as CRITICAL —
requiring your explicit approval before touching either, not just care. You
chose **"Plan and audit only."** Tonight's output is four evidence-based
audit/plan documents and this report — **zero schema changes, zero
WhatsApp-behavior changes, zero new code.** 4 commits, 4 files, all
`docs/execution/*.md`, no production code touched at all (a first for this
overnight series — every prior sprint touched at least some real code).

## What the audit found, story by story

### US-059 — WhatsApp Consent and Opt-In Safeguards (`15ba83d`)

**100% new construction, and the correctly-identified blocker for the other
three.** No consent-state field exists anywhere in the schema — `clientIndex`
has a `whatsappEnabled` boolean (a trainer preference toggle), not a
consent record. No code enforces anything because there's nothing to
enforce yet. The one thing already true independent of this story:
trainer-approves-every-send (no auto-send path exists anywhere in the app).

Plan doc lays out the real design questions for whenever this gets built:
single mutable column vs. an append-only consent-history table (matching
this repo's existing `package_ledger` pattern), a backfill decision for
existing clients, and — genuinely open, not answerable from the code — does
the consent gate apply to *all* WhatsApp sends or only *reminder-class*
ones (the backlog says "reminder workflows" specifically, not "all
messages").

### US-050 — Package Renewal Reminder (`a792a89`)

Blocked on two independent things: US-059 (for the WhatsApp-follow-up half)
and a bulk package-balance query + product-decided "low" threshold (for the
detection half — the same gap Sprint 2 already flagged for US-003/US-027,
not re-derived).

**One useful, non-blocking observation:** the detection-and-dashboard-prompt
half of this story doesn't actually need WhatsApp or consent at all — it's
the same category of work as Sprint 2's dashboard signals. If you want
partial progress here without touching the WhatsApp gate, that half could
be sequenced on its own. Not started tonight; flagged as an option.

### US-047 — Automated Follow-Up Suggestions (`87f0253`)

**The most interesting finding of the night.** This story turns out to be
substantially less blocked than the other three — none of its four
acceptance criteria actually require sending a WhatsApp message. A
"suggestion" is a prompt with a dismiss/complete lifecycle; the lifecycle
infrastructure it needs (`client_action_intent` table,
`ClientRepository.completeActionIntent`/`dismissActionIntent`) **already
exists and is already tenant-isolation-tested** — built for a different
story (US-012 Action Queue) earlier in this project. What's actually
missing is narrower than the story suggests: just the rule-trigger logic
that would create suggestion rows in the first place.

**Still not built tonight, deliberately.** Despite being mechanically less
blocked, this story is grouped under `FE-004 Retention and Renewal Loop` in
every doc-pack source, and Sprint 3 itself is named "Consent-Safe
Retention." Carving one story out of your blanket "plan and audit only"
decision is a scope change that deserves your explicit call, not something
for this session to infer mid-audit and act on unilaterally.

### US-048 — WhatsApp Reminder Workflow (`e8b8a20`)

A genuine hybrid. Trainer-approval and send-attempt logging are already
true today (existing, working infrastructure — nothing new needed there).
Two real gaps: consent-required is blocked on US-059; "reminder has a
reason" needs a new `messageLog.reason` field (doesn't exist);
"local time and timezone are respected" has **no implementation at all**
today, confirmed by direct read of the send path — timing has simply never
mattered before, since every existing send is a manual, trainer-initiated
action, not an automated reminder.

**Flagged, not decided:** this story's "reminder," US-047's "suggestion,"
and US-050's "renewal prompt" are three closely related
trigger-→-reason-→-trainer-approved-send ideas. Worth deciding whether
they share one pipeline or get three separate implementations before
building any of them.

## The one thing spanning all four stories

**US-059 is the load-bearing prerequisite.** Two of the other three stories
(US-050, US-048) cannot honestly claim their own "respects consent" /
"consent required" criteria without it; the fourth (US-047) can proceed
without it in principle but is grouped with the others by product intent.
If you decide to move forward with any part of Sprint 3 in a future
session, US-059 is where that session should start — exactly as this
sprint's own backlog ordering already said.

## Decisions made without asking — and why

1. **Branched from Sprint 2's tip, not `main`**, per the same reasoning as
   Sprint 2 — flagged first and clearly, as established practice now.
2. **Asked before starting**, rather than proceeding under "please do the
   same" — the domain crosses two explicit `CLAUDE.md` CRITICAL gates
   (WhatsApp behavior, schema changes) that every prior message tonight had
   explicitly carved out; a three-word instruction isn't sufficient grounds
   to assume those gates were meant to be crossed too.
3. **Did not implement US-047 despite finding it's less blocked.** Explained
   above — a real, evidence-based finding worth surfacing, but not grounds
   to unilaterally expand tonight's agreed scope.
4. **Ran the full gate after every doc-only commit**, even though nothing
   code-level changed — consistent with "the gate must pass before every
   commit," and cheap insurance that a docs-only branch hasn't somehow
   drifted from a clean state.

## What to look at first

1. **The three-deep branch stack** (`main` ← sprint-1 ← sprint-2 ← sprint-3)
   — worth resolving via review/merge before it grows into a fourth branch
   on some future night.
2. **`docs/execution/sprint-3-us-059-plan.md`** — if you want to move
   forward with any of Sprint 3, this is both the prerequisite and the
   clearest single decision point (schema shape, backfill rule, gate scope).
3. **`docs/execution/sprint-3-us-047-plan.md`** — the "less blocked than
   expected" finding, in case you want to fast-track just this piece ahead
   of the WhatsApp-dependent stories.
4. **Everything else** is ready to review at your own pace — four short,
   focused audit docs, no code risk, nothing pushed, nothing external
   called, no schema touched.
