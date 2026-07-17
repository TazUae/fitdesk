# US-047 — Client Action Intent Review / Follow-through — Audit

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md`. This is a tests/docs-only story per its own
> instruction: "If UI already supports this fully, add tests/docs only."

## Canonical definition

`_inputs/fitdesk-final-doc-pack-v1-1/FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` — US-047, "Automated
Follow-Up Suggestions." Acceptance criteria: suggestions are rule-triggered first; AI wording is
optional; trainer approves every action; suggestions can be dismissed or completed.

## Finding: already fully built — confirmed, not assumed

- **UI** (`components/modules/ClientHubPanel.tsx`): the "Next steps" section already renders every
  pending `client_action_intent` row generically via `ActionCard`, with a "Done" (complete) button and
  a "Dismiss" (X) button, wired to `completeClientAction`/`dismissClientAction`, with loading state,
  error toasts, and a refresh on success. This is the "safe display surface" — no new UI needed.
- **Rule-triggered suggestions**: `send_whatsapp_welcome`/`book_first_session`/`setup_billing` are
  system-triggered at client creation; `whatsapp_reminder_candidate` (US-050) is triggered by an
  explicit, deterministic rule the caller supplies a reason for. None are AI-generated — "AI wording
  is optional" is satisfied by simply not requiring it, not by needing to add AI.
- **Trainer approves every action**: `completeActionIntent`/`dismissActionIntent`
  (`lib/clients/repository.ts`) only ever transition on an explicit trainer-initiated call; nothing
  auto-completes or auto-dismisses.
- **Tenant isolation**: already extensively tested — `describe('US-025 completeActionIntent — tenant
  scoping', ...)` and the dismiss equivalent in `lib/clients/__tests__/repository.test.ts` predate
  this story and already prove tenant A cannot complete/dismiss tenant B's intents.

## Two genuine, small gaps closed by this story (tests only, no source changes)

1. `dismissClientAction` had no test exercising a `whatsapp_reminder_candidate` intent specifically —
   only the original default intent types. Added, confirming the dismiss path applies uniformly to
   the newest rule-triggered suggestion type too (a trainer declining a WhatsApp reminder suggestion).
2. `deliverWhatsAppReminderAction` (US-048) tested rejection of an already-*completed* candidate
   (no double-send) but not an already-*dismissed* one. Added — a dismissed candidate must be exactly
   as unreachable for delivery as a completed one.

No repository or action code changed. No new UI. This story's entire deliverable is verification that
the follow-through lifecycle already satisfies US-047, plus closing two test gaps that surfaced during
that verification.
