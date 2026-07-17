# US-053 Client Workflow Depth — Plan Note (Client Notes as Daily Workflow)

## Canonical definition

Per the batch's earlier canonical-lookup pass, US-053 in
`_inputs/fitdesk-final-doc-pack-v1-1/FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` is **"Client
Notes as Daily Workflow"** (absorbs US-044), acceptance criteria:

```
Fast note entry from Client Hub/session card.
Notes appear in timeline.
Notes are tenant-scoped.
Notes can later support suggestions.
```

## Audit findings

- The Client Hub "Recent activity" section (`ClientHubPanel.tsx`) already renders a timeline
  from `ClientHubOverview.recentNotes`, but that array is sourced entirely from
  `client_event` rows written by SYSTEM actions (`client.created`,
  `client.billing_mode_synced`, `action_intent.completed/dismissed`, etc.) — there is
  **no existing path for a trainer to write a free-text note**, and `ClientNoteSummary`
  (`types/clients.ts`) only carries `{id, type, createdAtUtc}` — no text is ever surfaced,
  even though `client_event.payloadJson` already stores arbitrary JSON.
- A **different**, unrelated `client.notes` field exists on the legacy `Client` type
  (`app/dashboard/clients/[id]/page.tsx:225`) — a single free-text field set at
  creation/edit time, not a timeline of multiple dated entries. Out of scope here; left
  untouched.
- `ClientRepository.insertClientEvent` (`lib/clients/repository.ts:629`) is already a
  generic, public, tenant-scoped event writer reused by several existing flows. No schema
  change is needed — a new note is just a `client_event` row with `type: 'client.note'` and
  `payloadJson: { text }`.

## Design

- **No new table/column.** Reuses `client_event` exactly as designed.
- `ClientRepository.addClientNote(ctx, clientIndexId, text)`: verifies the client belongs to
  the tenant (fail-closed, mirrors every other repository method), then delegates to
  `insertClientEvent` with `type: 'client.note'`.
- `hub-map.ts`: `ClientNoteSummary` gains `text: string | null`, populated only for
  `client.note` events (all other event types keep `text: null`, unaffected).
- `addClientNoteAction(clientIndexId, text)` (`actions/clients.ts`): trims and caps input
  (1–500 chars), rejects empty, tenant-scoped via `getTenantContext()`, no WhatsApp/ERP/
  payment side effects of any kind.
- UI: the existing "Recent activity" card gets a small always-visible "Add note" text input
  + submit button; new notes render their text directly instead of a generic type label.
  Card is now always rendered (previously hidden when `recentNotes` was empty) so the first
  note can be added from an empty state.
- **Session-card entry point deferred.** The criterion says "Client Hub/session card" — the
  Client Hub entry point covers the primary flow; wiring a second entry point from the
  session-completion UI is additive UI-only work left for a follow-up so this story stays a
  single, reviewable change.
- **"Notes can later support suggestions"** is satisfied structurally, not built now: notes
  live in the same `client_event` table already read by other signal-derivation code, so a
  future rule can query `type = 'client.note'` rows without any migration. No suggestion
  logic is added in this story.

## Not in scope

- No session-card note entry (deferred, see above).
- No note editing/deletion — notes are append-only, consistent with every other
  `client_event` row in the system.
- No AI summarization of notes.
