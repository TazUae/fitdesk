# Sprint 3 — US-047 Automated Follow-Up Suggestions — Plan / Audit

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §5.4 (lines
> 870–885).
>
> **Scope for tonight: plan and audit only**, per your explicit decision for
> the whole of Sprint 3. This story turned out to be meaningfully less
> blocked than the other three (see below) — flagged clearly, but still not
> implemented tonight, since the "plan and audit only" scope was given for
> all four Sprint 3 stories together, not story-by-story, and re-scoping one
> story mid-session isn't this session's call to make alone.

## Acceptance criteria (verbatim from the backlog)

```
Priority: NEXT

Acceptance criteria:
Suggestions are rule-triggered first.
AI wording is optional.
Trainer approves every action.
Suggestions can be dismissed or completed.
```

## A genuinely good finding: this story is substantially less blocked than US-059/US-050/US-048

None of these four acceptance criteria actually require sending a WhatsApp
message. A "suggestion" is a prompt ("Bob hasn't been in touch in 2 weeks —
consider following up") with a lifecycle the trainer manages; the WhatsApp
send itself (if the trainer acts on the suggestion) is a separate, later
step through the *already-existing* message composer
(`features/messaging/components/MessagesView.tsx`), not part of this
story's own scope as written.

Checked against the actual schema and found the lifecycle infrastructure
**already exists and is already tested**, built for a different story
(US-012 Action Queue) in an earlier phase of this project:

- `client_action_intent` table (`lib/db/schema.ts` lines 197–216) has
  `type`, `status` (defaults `'pending'`), `priority`, `source` (defaults
  `'system'`), `reason`, `dueAtUtc`/`completedAtUtc`/`dismissedAtUtc`/`expiresAtUtc`
  — this is almost exactly the data model "rule-triggered... dismissed or
  completed" needs, already shipped.
- `ClientRepository.completeActionIntent` / `dismissActionIntent`
  (`lib/clients/repository.ts`) — already implemented **and already
  tenant-isolation-tested** (Sprint 1's US-025 work, confirmed last night:
  cross-tenant denial, fail-closed on blank tenant context).

**What's actually missing is narrower than the full story suggests:** the
rule-trigger logic itself (a deterministic function that looks at client
state — no next session, low package balance once that exists, no recent
note, etc. — per `FITDESK_PRODUCT_PRINCIPLE_V1_1.md`'s "Retention Is a Core
Product Loop" list) and creates `client_action_intent` rows of a new
`type` (e.g. `'follow_up_suggestion'`). Everything downstream of "a
suggestion row exists" — surfacing it, letting the trainer dismiss or
complete it — is already built and tested infrastructure, not new
construction.

## Why this still isn't built tonight

Despite being less blocked, this story is still explicitly grouped under
`FE-004 Retention and Renewal Loop` in every doc-pack source
(`FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md`, the executive manifest, Sprint
3's own name "Consent-Safe Retention"), and its entire product purpose is
steering trainers toward WhatsApp follow-ups — it's the suggestion half of
a WhatsApp-adjacent workflow, even though the mechanical implementation
doesn't touch WhatsApp code directly. Given the explicit, blanket "plan and
audit only" scope decision for all of Sprint 3 tonight, this session isn't
unilaterally carving this one story out for implementation — that's a
scope change worth a deliberate decision from you, not something to infer
mid-audit.

## What a real implementation would require (for a future approved session)

1. **Rule definitions** (product decision, not just engineering): which
   deterministic signals actually trigger a suggestion, and with what
   `reason` text? Candidates already available in existing data:
   client has no future session (already derivable — Sprint 2's
   `getMissingNextSessionAttentionItems` computes exactly this signal for
   the dashboard, could be reused/adapted as a trigger source rather than
   only a display function), no recent note/progress
   (`client_action_intent`/`clientEvent` could support this once note-dating
   is checked), frequent cancellations (needs session-outcome history,
   partially available). None of this is recorded as an approved rule set
   in `FITDESK_PRODUCT_DECISIONS_V1_0.md` yet.
2. **Where rules run**: on-demand (computed when the dashboard loads, like
   every other `derive.ts` function tonight) vs. a scheduled/background job
   that pre-creates rows. On-demand is simpler and matches this repo's
   existing pattern (no queue/scheduler infrastructure exists yet per
   `FITDESK_FUTURE_ARCHITECTURE_V1_0.md`'s deferred event/outbox
   architecture) — but on-demand suggestions can't easily support "already
   dismissed, don't show again" without still writing a row somewhere, so
   the two approaches aren't fully separable.
3. **New `client_action_intent.type` value(s)** for follow-up suggestions,
   plus wiring into the dashboard (would reuse Sprint 2's `AttentionItem`/
   `ActionCenter.tsx` pattern, or a separate "Suggestions" surface — a
   product/UX decision, not purely mechanical, since Needs Attention and
   Suggestions may want different visual treatment per
   `FITDESK_DASHBOARD_COMMAND_CENTER_FREEZE_HANDOVER.md`'s "Client Pulse"
   distinction from "Needs Attention").
4. **AI wording (optional per the AC)**: `lib/claude.ts`'s existing draft
   generator already provides the "AI drafts, never sends" pattern this
   would reuse — lowest-risk part of this story if/when built.

## Gate

`node scripts/story-gate.mjs` run for consistency even though this is a
docs-only change.
