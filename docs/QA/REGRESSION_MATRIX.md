# Manual Regression Matrix

**Purpose:** every P0 flow must be reproducibly testable by a second person without ambiguity. Every row is either passed (with evidence) or waived (with named operator + reason).

**Tenant:** `phase-264-fitdesk-repeat-2` (`8168e424-ea93-4cf7-9903-a1b5241354d5`)
**Environment:** local docker stack with `PILOT_MODE=true` enabled
**Browser:** Chrome / Edge at 375px width (mobile profile) — primary; desktop verification optional
**Pre-flight:** `docker ps` shows all 17 containers Up; `npm run test && npm run lint && npm run build` clean

## Matrix

Mark `Pass` / `Fail` / `Waived` in the **Status** column. Attach screenshot file path under **Evidence**. If failed, link the hotfix branch under **Notes**.

| # | Route | Scenario | Expected | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | `/auth/login` | Email + password sign-in | Lands on `/dashboard` | | | |
| 2 | `/dashboard` | Initial render | Greeting, "This Month" hero, real outstanding/clients count | | | |
| 3 | `/dashboard` | "Packages running low" row | Shown only if any client has 1-3 sessions remaining | | | |
| 4 | `/dashboard` | "X of 20 sessions completed this week" | Shows real ISO-week-Mon-anchored count | | | |
| 5 | `/dashboard/settings` | Read | Trainer Settings + Session Types + TRAINING-SESSION + Whish all show "Connected"/"Missing" badges | | | |
| 6 | `/dashboard/settings` | Toggle Saturday → Save | Toast "Working days saved" | | | |
| 7 | `/dashboard/schedule` | Working days grid | Reflects edit from row 6 (Saturday now bookable) | | | |
| 8 | `/dashboard/clients` | List render | Real clients shown; "N left" badge where remainingSessions > 0 | | | |
| 9 | `/dashboard/clients/new` | Submit form | Client created in ERP; redirects to detail | | | |
| 10 | `/dashboard/clients/[id]` | Detail render | Contact + sessions + invoices + "N sessions remaining" row when present | | | |
| 11 | `/dashboard/clients/[id]/edit` | Update + save | Field changed in ERP | | | |
| 12 | `/dashboard/schedule` | Drag-create or BookingPanel | Session created, appears on calendar | | | |
| 13 | `/dashboard/schedule` | Click session → Mark complete | Status flips to Completed; invoice auto-created | | | |
| 14 | `/dashboard/schedule` | Mark No-Show | Status flips to No-Show | | | |
| 15 | `/dashboard/invoices` | List render | Real invoices, status filter tabs work | | | |
| 16 | `/dashboard/invoices/[id]` | Detail render | Header, amounts, dates, "Paid on …" branch when status=paid | | | |
| 17 | `/dashboard/invoices/[id]/pay` | Cash payment | Records Payment Entry in ERP, status flips to Paid | | | |
| 18 | `/dashboard/invoices/new` | Submit | Sales Invoice created in ERP | | | |
| 19 | `/dashboard/messages/[clientId]` | Pilot banner visible | Yellow "Pilot mode" banner at top of dashboard | | | Phase 5.0.6 |
| 20 | `/dashboard/messages/[clientId]` | Generate draft | Draft renders in textarea; preview banner visible | | | |
| 21 | `/dashboard/messages/[clientId]` | Send to allowlisted number | Confirm dialog ("PILOT MODE — …") → Send → toast "Message sent" → row appears in history | | | Requires `FITDESK_ALLOWED_TEST_PHONE=971…` set |
| 22 | `/dashboard/messages/[clientId]` | Send to NON-allowlisted number | Block with "Pilot mode: target phone is not on the test allowlist."; row still in history with status=failed | | | Phase 5.0.6 critical |
| 23 | `/dashboard/whatsapp` | Connection status visible | Either Connected (with phone) or Not Connected with QR | | | Evolution must be reachable |
| 24 | `/api/health` | curl (unauth) | 200, JSON, `configured.evolution: true`, fresh timestamp | | | Confirms 5.0.3a force-dynamic fix |
| 25 | `/api/health?deep=1` | curl (no cookie) | 401 | | | Phase 5.0.3a |
| 26 | `/api/health?deep=1` | curl (with cookie) | 200 + `deep` block with tenant + CP info | | | Phase 5.0.3a |
| 27 | `/api/dev/tenant-readiness` | curl in NODE_ENV=production | 404 | | | Phase 5.0.1 critical |
| 28 | Empty/error states | ERP unreachable mid-session (kill cp-api) | Pages render with friendly error, no white screens | | | Phase 4.0.9 |

## Replay protocol

1. Reset to a known state (no payment recorded today, message_log empty for the test client)
2. Walk the matrix top-to-bottom
3. Capture screenshots in `docs/QA/EVIDENCE_<date>/` per row
4. After completion, append summary to this file under "Execution log" below
5. If any row failed, OPEN A HOTFIX before continuing — don't waive without writing approval

## Execution log

| Date | Operator | Pass | Fail | Waived | Evidence dir | Notes |
|---|---|---|---|---|---|---|
| _pending_ | | | | | | |

## Out-of-scope

- Multi-trainer-per-tenant (deferred — single-trainer-per-tenant assumption documented)
- Live ERP integration tests in CI (deferred to Phase 6)
- Whish payment-link end-to-end (env not configured for pilot — cash/bank only)
- Real WhatsApp delivery confirmation (Evolution doesn't notify back; confirmation is by trainer's phone)
