# Sprint 3 — US-048 WhatsApp Reminder Workflow — Plan / Audit

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §5.4 (lines
> 889–905).
>
> **Scope for tonight: plan and audit only** — same reasoning and same
> blanket scope decision as the other three Sprint 3 stories.

## Acceptance criteria (verbatim from the backlog)

```
Priority: NEXT

Acceptance criteria:
Consent state is required.
Message is trainer-approved.
Reminder has a reason.
Message attempt is logged.
Local time and timezone are respected.
```

## Current state, confirmed by direct code audit tonight

| Criterion | Status |
|---|---|
| Consent state is required | **Blocked on US-059** — no consent state exists to require. Same dependency as US-050, already documented in `sprint-3-us-059-plan.md`, not re-derived here. |
| Message is trainer-approved | **Already true.** `actions/messages.ts`'s `sendMessage()` (lines 116–198) is only ever invoked from the trainer-facing composer (`features/messaging/components/MessagesView.tsx`) after explicit review/edit/confirm. This criterion needs no new work regardless of what "reminder" workflow gets built on top. |
| Reminder has a reason | **Not built.** `messageLog` (`lib/db/schema.ts` lines 94–104) has `messageType` and `body`, but no `reason` field — there's nowhere to record *why* a given reminder was sent (e.g. "package balance low", "no session in 14 days", "invoice overdue"). This is a schema gap, same category as US-059's consent field. |
| Message attempt is logged | **Already true**, and already solid — every `sendMessage()` call writes to `messageLog` regardless of success/failure (lines 178–191), confirmed in Sprint 1/2's broader audit work too. Nothing new needed here. |
| Local time and timezone are respected | **Not built — no timezone handling exists anywhere in the send path.** Confirmed by direct read of `actions/messages.ts`: no timezone parameter, no local-time check, no "don't send outside business hours" guard. This matters in practice — the rest of the app (dashboard, scheduling) is careful about trainer/client timezone (`lib/dashboard/fdSessionAdapter.ts`'s `localTimeString`/`todayInTimezone`, `TrainerConfig.timezone`), but the messaging path was built before this mattered (WhatsApp connection management and manual trainer-initiated sends don't need it — timing only matters once *automated* reminders exist). |

**Net assessment:** this story is a genuine hybrid of "small, already-solved
pieces" (trainer-approval, send logging) and "two real gaps requiring
product decisions" (consent — blocked on US-059; reason tracking and
timezone-aware send timing — both schema/logic gaps not yet built).

## What a real implementation would require (for a future approved session)

1. **Depends on US-059 landing first** for the consent-required criterion —
   no way around this; already the sprint's own stated dependency order.
2. **`reason` field**: add to `messageLog` (small, additive schema change,
   same category of change as US-059's consent field — still needs the same
   explicit approval). Populated by whatever triggers the reminder — ties
   directly to US-047's rule-trigger work if that lands first (a follow-up
   suggestion's `reason` text is a natural source for a reminder's `reason`
   too — these two stories could share infrastructure rather than each
   inventing their own "why" field).
3. **Timezone-aware send timing**: needs a product decision on what "respects
   local time" actually means operationally — does it mean the *message
   content* states times in the client's local timezone (lower risk, mostly
   copy/formatting, reuses `fdSessionAdapter.ts`'s existing timezone
   helpers), or does it mean FitDesk *refuses to send* outside a
   reasonable local-time window (e.g. no WhatsApp sends before 8am or after
   9pm client-local-time)? The backlog's own wording ("local time and
   timezone are respected") is compatible with either reading, and they're
   different amounts of engineering — the second requires knowing the
   *client's* timezone (not just the trainer's), which isn't tracked
   anywhere in the schema today. Not something to guess at.
4. **Trigger source**: this story's "reminder" concept and US-047's
   "suggestion" concept and US-050's "renewal prompt" concept are three
   closely related ideas (a rule fires → something needs the trainer's
   attention → trainer approves an outbound message). A future session
   should decide whether these become three separate mechanisms or one
   shared "trigger → reason → trainer-approved send" pipeline before
   building any of them, to avoid three parallel, slightly-different
   implementations of the same underlying idea. Flagged for your
   consideration, not decided here.

## Gate

`node scripts/story-gate.mjs` run for consistency even though this is a
docs-only change.
