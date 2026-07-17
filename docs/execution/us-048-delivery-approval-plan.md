# US-048 — WhatsApp Delivery Approval Flow — Implementation Note

> Short plan note per the batch instructions. Governed by
> `docs/execution/us-050-reminder-candidates-plan.md` (consent + candidate infra this builds on).

## Canonical definition (confirmed via `_inputs/fitdesk-final-doc-pack-v1-1/FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md`)

US-048 — WhatsApp Reminder Workflow. Acceptance criteria: consent state required; message is
trainer-approved; reminder has a reason; message attempt is logged; local time/timezone respected.

## Audit finding: the send abstraction is already safe and testable — no new send path needed

`actions/messages.ts`'s `sendMessage()` already: requires the trainer to have reviewed/approved the
body before calling it (never auto-invoked), routes exclusively through `lib/evolution.ts`'s
`sendWhatsAppMessage` (the sole Evolution abstraction), logs every attempt — success or failure — to
`message_log`, and respects `PILOT_MODE` allowlisting. It has full existing test coverage
(`actions/messages.test.ts`) with `sendWhatsAppMessage` mocked. **This is the safe, testable send
path the task asks me to confirm before wiring delivery — confirmed, reused as-is, not touched.**

The actual gap: `sendMessage()` has **no consent check at all** — it will send to any phone
regardless of `whatsappConsentState`. US-048's job is to wire the US-050 candidate + US-059 consent
around this existing, unmodified send function.

## Design

New action `deliverWhatsAppReminderAction(intentId, body)` in `actions/clients.ts` (alongside the
other `client_action_intent` actions):

1. Auth/tenant resolve (existing pattern).
2. Look up the intent by id (new repository read: `findActionIntentById` — tenant-scoped; the
   existing `completeActionIntent`/`dismissActionIntent` do this lookup internally but never expose
   it, so this is a genuine small gap-fill, not new).
3. Reject if not found, not type `whatsapp_reminder_candidate`, or not `status: 'pending'`.
4. **Re-check consent at send time** (not just trusting the state at candidate-creation time —
   consent can change in between). Reuses `canSendAutomatedWhatsApp`/`isOptedOut` from US-059,
   applied to the client's *current* `whatsappConsentState`.
5. If not `opted_in` → blocked, no send attempted, intent untouched.
6. If `opted_in` → calls the **existing, unmodified** `sendMessage()`.
7. Send failure → return failure, **intent stays `pending`** (retryable — no status mutation).
8. Send success → `completeActionIntent` resolves the candidate. Completion only ever follows a
   confirmed send result, never precedes it.

No new schema. `message_log` doesn't need its own `reason` column — the *reason a reminder exists* is
already captured on the originating `client_action_intent.reason` (US-050); `message_log` remains the
audit trail for *what was sent and whether it succeeded*, which is a different, already-satisfied
concern. Duplicating the reason string into both tables would be redundant, not a completeness gap.

## "Local time and timezone respected" — scoped out safely, not ignored

This action is always synchronous and trainer-initiated (a button click after reviewing the draft) —
there is no automated/scheduled send path here, so there is no timing to get wrong by construction.
Building automatic timezone-aware *scheduling* would require background automation, which the batch's
global forbidden scope explicitly disallows ("no silent background automation that acts without
trainer review"). Deferred, not faked.

## Not in scope

- No new UI trigger (the task's own audit/test list for this story is action/lib-layer only). A
  "Send this reminder" button in `ClientHubPanel` is natural follow-up UI work, not built here.
- No `messageType` enum/CHECK constraint change — `message_type` is already free TEXT; `'reminder'`
  is passed as a value, not a new column.
