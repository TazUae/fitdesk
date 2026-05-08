# Phase 4.0 — Demo Script

**Target tenant:** `phase-264-fitdesk-repeat-2` (`8168e424-ea93-4cf7-9903-a1b5241354d5`)
**Goal:** Replay the full FitDesk MVP loop in ≤5 minutes, no manual ERP edits.

## Pre-flight (one-time, before recording)

| Step | Command / action |
|---|---|
| 1 | Ensure ERPNext + Control Plane + FitDesk stack is running (`docker compose -f docker-compose.local.yml up -d`) |
| 2 | Run app schema migration (idempotent): `node scripts/migrate-app.mjs` — required for `message_log` table introduced in 4.0.6 |
| 3 | Confirm a Better Auth user exists and is mapped to a Trainer for the target tenant |
| 4 | Confirm at least one Customer exists in ERP with `custom_remaining_sessions = 5` (so the "low balance" attention row stays hidden during the demo or shows realistic data) |
| 5 | Confirm Trainer Settings has `working_days` with at least Mon–Fri enabled |

## Tenant assumptions

The script references real records. Have these ready:
- One Customer named e.g. **"Demo Client"** with `mobile_no` set
- One existing Sales Invoice (any status) for that customer
- WHISH_API_URL / WHISH_API_KEY / WHISH_MERCHANT_ID can be placeholders — only their presence is shown on the settings page

## Walkthrough

### 1. Login (≤30s)
1. Open `http://localhost:3000`
2. Log in with the trainer's credentials → land on `/dashboard`
3. Confirm: greeting renders the trainer's first name

### 2. Dashboard (≤45s)
1. Confirm "This Month" hero shows real revenue (not `—`)
2. Confirm the stats row shows real `Outstanding`, `Clients`, `This Month` numbers
3. Confirm "Coming Up" lists upcoming sessions if present
4. **New in 4.0.4:** confirm "Packages running low" appears in *Needs Attention* iff any client has 1–3 sessions left
5. **New in 4.0.1:** confirm the quick-actions progress text reads "*N* of 20 sessions completed this week" (not the broken "month count capped at 5" text)

### 3. Settings — live tenant data + writable working days (≤45s)
1. Tap the menu → Settings (or navigate to `/dashboard/settings`)
2. Confirm Trainer Settings card shows a **Connected** badge
3. Confirm Session Types and TRAINING-SESSION Item show **Connected**
4. **New in 4.0.7:** confirm the **Whish Payments** card shows "Connected" (env present) or "Missing" (otherwise) without leaking values
5. **New in 4.0.8:** scroll to "Edit working days". Toggle Saturday on, click **Save working days** → toast "Working days saved"
6. Open the Schedule page (next step) — Saturday is now bookable

### 4. Clients (≤45s)
1. Navigate to `/dashboard/clients`
2. **New in 4.0.2:** confirm clients with package balance show a "*N* left" pill on the card
3. Tap **Add** → fill in name + mobile + goal → submit
4. After redirect to detail, confirm **Sessions remaining** row shows when `custom_remaining_sessions` is set on that customer

### 5. Schedule a session (≤60s)
1. Navigate to `/dashboard/schedule`
2. **New in 4.0.3:** confirm working hours grid matches the trainer settings (no longer hardcoded Mon–Fri 9–20)
3. Drag-to-create or use BookingPanel → pick the demo client → book one session today or tomorrow
4. Toast "Booked"; session appears on the calendar

### 6. Mark session complete (auto-creates invoice) (≤30s)
1. Click the newly-booked session → details sheet opens
2. Tap **Mark complete** → toast "Marked complete"
3. Confirm the session shows the **Completed** badge and an `invoice_id`

### 7. Invoice detail + paidAt visible (≤45s)
1. Navigate to `/dashboard/invoices`
2. Tap the invoice ID link of the just-completed session → detail page
3. **New in 4.0.5:** if the invoice is paid, header shows "Paid on YYYY-MM-DD" instead of "Due …"
4. Tap **Record Payment** → choose Whish (or Cash) → submit
5. Reload the detail page; status flips to **paid**, paidAt visible

### 8. WhatsApp reminder preview (≤45s)
1. From the invoice detail page, tap **Send** (only visible for `sent`/`overdue`)
2. Lands on `/dashboard/messages/<clientId>`
3. **New in 4.0.6:** confirm the yellow **"Preview only — nothing is sent until you click Send"** banner above the textarea
4. Tap **Generate** → draft renders → tap **Send** → confirm dialog (financial messages) → toast "Message sent"
5. Reload the page → message appears in history (was always empty pre-4.0.6)

### 9. Wrap (≤30s)
1. Return to `/dashboard`
2. Confirm the new state is reflected: outstanding decreased, sessions-this-week incremented

## Total target: 5:00

If steps 5–6 take longer (drag-to-create on a phone is fiddly), use BookingPanel for a deterministic flow.

## Sanity checks before recording

- `npx vitest run` — must be green (≥225 tests)
- `npx next build` — must be clean
- Working tree clean (`git status --short`)
- Branch is in sync with origin if pushing
