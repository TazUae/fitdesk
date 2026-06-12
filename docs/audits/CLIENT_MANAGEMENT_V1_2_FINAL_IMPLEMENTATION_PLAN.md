# Client Management v1.2 — Final Implementation Plan

Read-only planning output. **No code has been written.** Pairs with
[CLIENT_MANAGEMENT_PHASE_0_AUDIT.md](CLIENT_MANAGEMENT_PHASE_0_AUDIT.md) and
[CLIENT_MANAGEMENT_V1_2_GAP_ANALYSIS.md](CLIENT_MANAGEMENT_V1_2_GAP_ANALYSIS.md).

---

## 1. Executive Summary

Build the FitDesk "client front door": a fast **Client Directory** backed by a local
`client_index` read model; a **manual-first Add Client** sheet (mobile) / drawer (desktop) with an
**optional, never-blocking AI parse**; **tenant-scoped duplicate detection** with an audited
override; an **atomic local creation transaction** (index + goal + action-intent + event) that
triggers **no** financial, ERP, WhatsApp, scheduling, or program side effects; and a **Client Hub**
with an **action queue**. ERP stays behind the existing proxy and is synced as a **separate, later
step** — not inside Add Client.

**Why:** today clients are read/written live from ERP with no local structure — no duplicate safety,
no action queue, no goal structure, no tests. The read model makes the directory instant and gives
FitDesk a place to attach goals, safety, onboarding, and next-action state without N+1 ERP calls.

**One decision gates everything (see §11, Phase 1):** does `client_index` own client identity, and
when is the ERP `Customer` created? The plan (§7) says local-owns-identity; FitDesk doctrine says
ERP-owns. This must be approved before schema is written.

---

## 2. Recommended Build Strategy

### MVP / pilot-safe now
- `client_index` + `client_goal` + `client_action_intent` + `client_event` tables (additive).
- Tenant-scoped repository layer (forced tenant filter).
- Directory reading `client_index` (feature-flagged; ERP-read fallback retained).
- Manual-first sheet/drawer; consolidate the two entry points.
- Optional AI parse route (reuse `lib/claude.ts` + 3s `AbortController`).
- Duplicate detection + override audit.
- Atomic local create transaction (local-only writes).
- Client Hub overview + action queue (read + complete/dismiss).
- Unit + required integration tests.

### Production-hardening soon
- `client_index_reconcile_job` **with a real host** (decision required — see §7) + env interval.
- ERP `Customer` sync worker/step (out-of-band; idempotent; sets `erpCustomerId`).
- Projection wired to billing/onboarding domain changes.
- E2E suite in CI; tenant-isolation test promoted to a merge gate.
- Backfill `client_index` from existing ERP customers for pilot tenants.

### Future platform architecture later
- Replace direct projection calls with a domain-event bus (plan §9.4).
- Move AI orchestration behind the Control Plane (plan §5.2) if it grows.
- `nextSessionAtUtc` real source once a Session store exists (PT Session DocType or local).
- Advanced urgency scoring, portal, medical intake, wearables (explicitly out of MVP).

---

## 3. Proposed File-Level Plan

| File | Change type | Purpose | Risk |
|---|---|---|---|
| `docs/plans/Client_Management_v1_2_Approved_MVP_Build_Plan.md` | Add | Commit the approved plan for traceability | None |
| `lib/db/schema.ts` | Edit (additive) | Add 4 tables (`client_index`, `client_goal`, `client_action_intent`, `client_event`) | Med |
| `scripts/migrate-app.mjs` | Edit (additive) | `CREATE TABLE IF NOT EXISTS` + indexes (tenant, phoneE164) | Med |
| `types/clients.ts` | Add | `ClientIndex`, `ClientGoal`, `ClientActionIntent`, `ClientEvent`, `ClientHubOverview`, `ParsedField`, `DuplicateClientMatch` | Low |
| `lib/clients/repository.ts` | Add | Tenant-scoped CRUD/query choke-point (no raw SQL elsewhere) | High |
| `lib/clients/projection.ts` | Add | `ClientIndexProjectionService.refreshClientSummary` (log-and-continue) | Med |
| `lib/clients/duplicates.ts` | Add | E.164 normalise + tenant-scoped match | Med |
| `lib/clients/create.ts` | Add | Atomic local create txn (index+goal+intent+event) | High |
| `lib/clients/hub.ts` | Add | `ClientHubOverview` hydration (no raw ERP/N+1) | Med |
| `lib/clients/phone.ts` | Add | E.164 normalisation helper (pure, unit-tested) | Low |
| `actions/clients.ts` | Edit | New actions: `createClientV2`, `findDuplicates`, `completeIntent`, `dismissIntent`; keep legacy | Med |
| `app/api/clients/parse/route.ts` | Add | Server AI parse, 3s timeout, key server-side, returns draft | Med |
| `components/clients/AddClientSheet.tsx` | Add (replaces dead one) | Responsive sheet/drawer, manual-first + AI field + confirm | Med |
| `components/clients/DuplicateWarning.tsx` | Add | Open existing / Continue anyway / Cancel + reason capture | Med |
| `components/clients/ClientHub.tsx` | Add | Hub overview + sections | Med |
| `components/clients/ActionQueue.tsx` | Add | Action cards + complete/dismiss | Med |
| `components/modules/ClientsView.tsx` | Edit | Directory → `client_index`; mount real sheet; delete dead `AddClientSheet` | Med |
| `app/dashboard/clients/page.tsx` | Edit | Query `client_index` (flagged) | Med |
| `app/dashboard/clients/[id]/page.tsx` | Edit | Render Hub overview; keep ERP invoice/session sections | Med |
| `app/dashboard/clients/new/page.tsx` | Edit/retire | Fold into sheet/drawer or keep as fallback route | Low |
| `lib/clients/reconcile.ts` + host | Add | Reconcile job (hardening phase; host TBD) | Med |
| `lib/clients/__tests__/*`, `actions/clients.test.ts` | Add | Unit + integration suite | Med |

> No edits proposed to `lib/erpnext/client.ts`, `lib/payments/*`, `actions/invoices.ts`, auth, or
> any sibling service repo.

---

## 4. Data Model Plan

Add **four new local tables** (all `tenantId`-scoped, indexed on `tenantId` and `tenantId+phoneE164`).
None already exist — there is nothing to reuse except the goal taxonomy values and `formatGoal` for
legacy ERP reads.

- **`client_index`** — read model + (pending §11 decision) identity. Fields per plan §8.2
  (`id, tenantId, erpCustomerId?, fullName, phoneE164, whatsappEnabled, status, primaryGoalLabel,
  primaryGoalId, safetyState, onboardingState, billingMode, paymentSummary, nextSessionAtUtc,
  lastActivityAtUtc, possibleDuplicateClientId?, duplicateOverrideReason?, createdAtUtc, updatedAtUtc`).
  `urgencyScore` intentionally omitted (use filters/badges).
- **`client_goal`** — plan §16.2 (`goalId, subGoalIds (JSON), urgency, source, confidence,
  safetyFlags (JSON), notes, status`). Reuse `GoalSelect.GOALS` values for `goalId`.
- **`client_action_intent`** — plan §17.3 (`type, status, priority, source, reason, dueAtUtc,
  completedAtUtc, dismissedAtUtc, expiresAtUtc`). Status machine in §17.4.
- **`client_event`** — plan §18.3 (`type, payload (JSON), createdByUserId, createdAtUtc`).
  Distinct from existing `message_log` (different purpose; do not overload it).

**Duplicate override fields:** `possibleDuplicateClientId` + `duplicateOverrideReason` on
`client_index`, plus a `duplicate.override` row in `client_event`.

**Goal confidence/source:** `confidence: high|medium|low|unknown`, `source: ai_parse|trainer_manual|
system_inferred` — new; no equivalent today.

**`ClientHubOverview` payload types:** define in `types/clients.ts` exactly per plan §19.2–19.3.

**SQLite/libsql notes:** arrays (`subGoalIds`, `safetyFlags`, `payload`) stored as JSON text;
timestamps as ISO-8601 text (matches existing `WorkspaceProvisioning`/`message_log` convention).

---

## 5. Service Plan

- **`ClientIndexProjectionService.refreshClientSummary(ctx, clientId)`** — recompute index summary
  fields from `client_goal` / activity. **Failure contract (plan §9.3):** log, do **not** roll back
  the domain action, leave repair to the reconcile job. Triggered per plan §9.2 where a source exists
  (goal change, note/activity); session/billing/onboarding triggers are stubs until those stores exist.
- **Client creation transaction service (`lib/clients/create.ts`)** — single libsql transaction
  writing index + goal + intent + event. **Forbidden inside:** invoice, payment, WhatsApp send,
  program gen, booking, ERP mutation (plan §15.2). ERP `Customer` sync is a **separate** post-commit
  step (failure-isolated).
- **Duplicate detection service (`lib/clients/duplicates.ts`)** — normalise to E.164, query
  `client_index` within `tenantId` only (plan §14). Returns `DuplicateClientMatch`. Never cross-tenant.
- **AI parse route (`app/api/clients/parse/route.ts`)** — reuse `lib/claude.ts` shape; **3s
  `AbortController`**; key server-side; returns `ParsedField<T>` draft, never a saved client; on
  timeout/error returns a `failed`/`timeout` state and keeps the trainer's text (plan §12).
- **Action-intent service** — guarded transitions + completion triggers (plan §17.4–17.5).
- **Client Hub hydration service (`lib/clients/hub.ts`)** — compose `ClientHubOverview` from
  `client_index` + `client_goal` + `client_action_intent` + notes/`client_event`. No raw ERP, no N+1
  (plan §19.4). ERP-backed invoice/session sections stay as their own existing server calls.

---

## 6. UI Plan

- **Client Directory** — keep `ClientsView` shell; source rows from `client_index`; add plan badges
  (Needs review, No next session, Billing not set, Onboarding not sent, Payment to collect).
- **Add Client — mobile bottom sheet / desktop drawer** — one responsive component; reuse the dead
  sheet's markup; delete the dead copy; retire or fallback the full-page `/new`.
- **Manual-first form** — required: name + phone only; optional: WhatsApp, goal/sub-goal, urgency,
  notes, billing mode, session price, package intent (billing never blocks).
- **AI assist field** — free-text box → parse route; inline `idle/parsing/partial/low/failed/timeout`
  states; confident fields filled, uncertain flagged; trainer always confirms.
- **Review / confirm step** — name, phone, WhatsApp, goal, notes, detected warnings, suggested next
  actions; primary CTA "Create Client". Lightweight; must not over-gate manual.
- **Duplicate warning** — inline on exact phone match: Open existing / Continue anyway / Cancel;
  Continue anyway requires a reason and shows a post-save "saved with duplicate warning" notice.
- **Client Hub overview** — extend `[id]/page.tsx` with summary, goals, action queue, notes,
  next-session/payment summaries, and training-program/progress placeholders.
- **Action queue** — cards with complete/dismiss; deep-links to schedule/billing/onboarding/safety.

---

## 7. Safety & Side-Effect Plan

The create transaction writes **local rows only**. Concretely:

| Forbidden effect | How it's prevented |
|---|---|
| Automatic invoice creation | Create txn never imports `actions/invoices` / `createInvoice`; billing fields are display-only on index |
| Automatic payment entry | No payment code path reachable from create; `lib/payments/*` untouched |
| Automatic WhatsApp send | `send_whatsapp_welcome` is an **intent row**, never a send; `actions/whatsapp` not called |
| Automatic program generation | No program engine invoked; `create_program` is an intent only |
| Booking during create | No scheduling call in the txn; `book_first_session` is an intent only |
| Direct ERP mutation | `erpFetch`/`createClient` adapter not called in the txn; ERP `Customer` sync is a separate post-commit, failure-isolated step |
| Cross-tenant duplicate visibility | Duplicate query runs through the tenant-scoped repository; `tenantId` filter mandatory; covered by an isolation test |

Additional: safety flags (e.g. rehab/pain) set `safetyState` and queue `review_safety_note` but
**never block** manual creation (plan §13.1). ERP credentials are never introduced (proxy/JWT only).

---

## 8. Test Plan

### Unit tests
- E.164 phone normalisation.
- AI draft → form mapping; `ParsedField<T>` handling; timeout/failure → manual fallback.
- Goal confidence/source rules; safety-state derivation.
- Action-intent transition guards.
- Duplicate-matching helper (exact phone / possible name).

### Integration tests (libsql-backed)
- Atomic create writes index+goal+intent+event together (all-or-nothing).
- **Required: client created → `client_index` row immediately visible in directory query.**
- Duplicate phone guard; override writes `duplicate.override` event + sets `possibleDuplicateClientId`.
- **Tenant isolation:** tenant A cannot read or duplicate-match tenant B.
- Client Hub hydration uses approved sources only (no raw ERP, no N+1).
- Projection refresh after goal change; projection failure logs and does **not** roll back.
- Reconcile job repairs a seeded stale `client_index` row.

### E2E tests
- Open Clients → add manually → appears in list.
- Add with AI assist; AI timeout → manual fallback retains typed text.
- Resolve duplicate warning (open existing / continue anyway).
- Open Client Hub after save; complete + dismiss an action intent.

**CI gate before merge:** unit + required integration + lint + build. E2E on a slower schedule.

---

## 9. Implementation Phases

### Phase 1 — Data contracts & read model
- **Objective:** resolve the source-of-truth decision (§11), then land additive schema + types + repo.
- **Files:** `types/clients.ts`, `lib/db/schema.ts`, `scripts/migrate-app.mjs`, `lib/clients/repository.ts`, `lib/clients/phone.ts`.
- **Acceptance:** tables create idempotently; repo enforces tenant scope; phone unit tests pass; no UI change.
- **Rollback:** tables are additive & unused — drop new files; `IF NOT EXISTS` DDL leaves existing data intact.

### Phase 2 — Directory shell & query
- **Objective:** directory reads `client_index` behind a flag; ERP-read fallback retained.
- **Files:** `app/dashboard/clients/page.tsx`, `components/modules/ClientsView.tsx`, `lib/clients/repository.ts`.
- **Acceptance:** empty index renders cleanly; flag off = current behaviour unchanged.
- **Rollback:** flip flag off.

### Phase 3 — Manual Add Client flow
- **Objective:** responsive sheet/drawer; manual-first; atomic local create; immediate visibility.
- **Files:** `components/clients/AddClientSheet.tsx`, `lib/clients/create.ts`, `actions/clients.ts`, `ClientsView.tsx` (mount sheet, delete dead code).
- **Acceptance:** create with name+phone in <30s; row visible immediately; **no** ERP/invoice/WhatsApp/booking side effects (asserted in tests).
- **Rollback:** keep `/new` route as fallback; revert sheet mount.

### Phase 4 — AI assist parse draft
- **Objective:** optional parse with 3s timeout + fallback.
- **Files:** `app/api/clients/parse/route.ts`, AI field in `AddClientSheet.tsx`.
- **Acceptance:** valid text fills confident fields; timeout/error → manual, text preserved; key never client-exposed.
- **Rollback:** hide AI field; manual flow untouched.

### Phase 5 — Conflict & duplicate resolution
- **Objective:** tenant-scoped dupe detection + audited override.
- **Files:** `lib/clients/duplicates.ts`, `components/clients/DuplicateWarning.tsx`, `lib/clients/create.ts`, `client_event`.
- **Acceptance:** exact-phone match warns; override stores `possibleDuplicateClientId` + writes `duplicate.override`; no cross-tenant matches (test).
- **Rollback:** feature-flag duplicate UI; create still works.

### Phase 6 — Client Hub MVP
- **Objective:** Hub overview from approved sources; keep ERP invoice/session sections.
- **Files:** `lib/clients/hub.ts`, `components/clients/ClientHub.tsx`, `app/dashboard/clients/[id]/page.tsx`.
- **Acceptance:** Hub hydrates without raw ERP/N+1; placeholders render; existing detail data preserved.
- **Rollback:** revert detail page to current profile.

### Phase 7 — Action queue interactions
- **Objective:** complete/dismiss/expire intents; deep-links.
- **Files:** `components/clients/ActionQueue.tsx`, `actions/clients.ts`, action-intent service.
- **Acceptance:** transitions guarded & audited; completion triggers fire where a source exists.
- **Rollback:** render queue read-only.

### Phase 8 — Tests & verification (+ hardening: reconcile job host, ERP sync)
- **Objective:** full suite green; reconcile job hosted; ERP `Customer` sync step.
- **Files:** `lib/clients/__tests__/*`, `actions/clients.test.ts`, `lib/clients/reconcile.ts` + host, ERP sync module.
- **Acceptance:** §8 CI gate passes; created→visible + tenant-isolation + projection-failure tests green.
- **Rollback:** tests are additive; sync/reconcile behind flags.

---

## 10. Verification Commands (run later — read-only here)

```bash
# from FitDesk/
npm test            # vitest — unit + integration
npm run lint
npm run build       # next build (scripts/build-verify.mjs)
npx vitest run lib/clients
```

Plus the plan's pre-staging checklist (§21): verify active repo, no direct ERP I/O added, no ERP
creds introduced, payment/scheduling hooks intact, tenant filter on every client query, and Add
Client creates no invoice/payment/WhatsApp/program/booking.

---

## 11. Final Recommendation

### GO WITH CAUTIONS

The plan is detailed, internally consistent, and ~70% of the UI/safe-pattern surface already exists.
Proceed — but **do not write schema until these cautions are closed in Phase 1:**

1. **Source of truth (blocking).** Plan §7 makes `client_index` authoritative for client identity;
   FitDesk/CLAUDE.md says ERPNext is the single source of truth. Get explicit approval for the
   inversion (or a hybrid where ERP remains authoritative and `client_index` is purely a cache).
2. **ERP `Customer` creation timing (blocking).** Define when the ERP customer is created and how
   `erpCustomerId` is backfilled — invoices/sessions/messages all key off the ERP docname today.
   Without this, invoicing breaks for newly created clients.
3. **Reconcile job host (high).** No scheduler exists and BullMQ is rejected for MVP. Decide the host
   (Docker sidecar / external cron hitting a route / boot-time interval) before relying on it for
   read-model integrity.
4. **`nextSessionAtUtc` source (high).** No Session store exists (PT Session DocType absent). Treat
   the field as a placeholder for MVP; don't promise live next-session data.
5. **Tenant isolation (high).** Shared `auth.db` has no ambient isolation. Land the tenant-scoped
   repository and its isolation test **before** any client write ships.

Close 1–2, accept 3–5 as scoped follow-ups, and this is a safe, reversible, phase-gated build.
