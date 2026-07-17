# Sprint 2 — US-027 Dashboard Needs Attention Expansion — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.3 (lines
> 298–323) — this is the canonical backlog per PD-012, not the executive
> manifest's Phase 3 paraphrase, which lists a slightly different set
> ("frequent cancellations", "follow-up due") not present in the backlog's own
> acceptance criteria. Following the backlog verbatim, not inventing scope from
> the paraphrase.

## Acceptance criteria (verbatim from the backlog)

```
Priority: NOW

Story:
As a trainer,
I want Needs Attention to include session, payment, communication, and renewal risks,
so that the dashboard becomes my daily operating inbox.

Acceptance criteria:
Surfaces session outcomes pending.
Surfaces clients with no next session.
Surfaces overdue payment follow-ups.
Surfaces package renewal prompts.
Surfaces communication follow-up needs.
Uses deterministic rules before AI.
```

## Honest status check against tonight's earlier work

| Criterion | Status |
|---|---|
| Surfaces session outcomes pending | **Already done** — US-057's `getUnresolvedSessions` + US-003's `getUnresolvedSessionAttentionItems`, wired into the dashboard tonight (commit `6ab703f`) |
| Surfaces clients with no next session | **Already done** — US-003's `getMissingNextSessionAttentionItems`, same commit |
| Surfaces overdue payment follow-ups | **Already done** — pre-existing `getAttentionItems`'s `overdue_invoice`/`pending_invoice` |
| Surfaces package renewal prompts | **Not done, deferred** — see below |
| Surfaces communication follow-up needs | **Explicitly out of scope tonight** — "don't touch anything WhatsApp-, consent-, or reminder-related" |
| Uses deterministic rules before AI | **Already true by construction** — every attention-item function tonight and pre-existing is a pure, deterministic function; no AI/LLM call is anywhere in this code path |

Three of six criteria were already satisfied by tonight's US-057/US-003 work,
exactly as this sprint's own sequencing predicted ("the Needs Attention
expansion work builds on what US-057 adds"). One is explicitly forbidden
tonight. That leaves one real gap (package renewal prompts) and one
verification-only item (deterministic-before-AI).

## Package renewal prompts — same architecture gap as US-003's low package balance, not duplicated

Both "low package balance" (US-003) and "package renewal prompts" (US-027)
require the same missing piece: a tenant-wide package-balance signal, plus a
product-decided "low"/"nearly finished" threshold that isn't recorded in
`FITDESK_PRODUCT_DECISIONS_V1_0.md` (PD-010 approves package renewal as a
priority *workflow* but does not define the balance threshold that triggers
it, and US-050 — the story that would formally define this — isn't built).
Not duplicating the "defer, document, don't guess" decision already made for
US-003; pointing at the same open item rather than re-deriving it.

## What's actually new and safe to build tonight: combining the three sources sensibly

While wiring US-003, the three attention sources (invoices, unresolved
sessions, missing-next-session) were simply concatenated on the dashboard
page with **no overall cap** — each source caps itself at 4–5 items, so a
busy trainer could see up to ~14 cards at once. `FITDESK_PRODUCT_PRINCIPLE_V1_1.md`
§4.1 is explicit: *"Calm... Avoid: Alert spam."* And this story's own premise
is that Needs Attention becomes "my daily operating inbox" — an inbox that
shows 14 things at once isn't meaningfully prioritized, it's a wall of noise.
This is exactly the "Dashboard Needs Attention **Expansion**" story's job:
not just adding more sources, but making the combined result still usable.
This is real, in-scope, safe (pure function, no new data dependency), and
directly serves "uses deterministic rules" — a documented, testable priority
order rather than an accident of concatenation order.

**Priority order** (highest urgency first, matching the Product Principle's
"Action Before Analytics"): invoice attention items (already internally
ordered overdue-before-pending by `getAttentionItems`, unchanged) →
unresolved sessions → missing next session. Not splitting `getAttentionItems`'s
internal overdue/pending ordering to interleave unresolved-session items
between them — that would mean touching already-tested, pre-existing code
for a marginal ordering refinement; financial risk as a whole first, then
session-outcome risk, then the softest/non-urgent missing-next-session nudge
last is still a defensible, deterministic priority order.

## Implementation plan

1. `lib/dashboard/derive.ts` — add `combineAttentionItems(sources:
   AttentionItem[][], cap: number): AttentionItem[]`. Concatenates in the
   caller-provided source order, truncates to `cap`, replaces any
   individual sources' own trailing overflow rows that got cut with a single
   combined overflow row (avoids "+2 more invoices" and "+3 more sessions"
   both showing when the real overall list is longer than the cap allows).
2. `app/dashboard/page.tsx` — call it with `[overdueAndPending,
   unresolvedSessionItems, missingNextSessionItems]` in that priority order,
   cap 6.
3. Tests in `lib/dashboard/derive.test.ts` for the new combining function,
   including the "overall cap cuts across sources, not just within one"
   case and the "individual overflow rows get consolidated into one" case.

## Gate

`node scripts/story-gate.mjs` must pass before commit.
