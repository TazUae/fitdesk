# Client Management v1.2 — Gap Analysis

Compares the **approved Client Management v1.2 plan** against the current FitDesk codebase
(`FitDesk/`, branch `main`). Read-only. Pairs with
[CLIENT_MANAGEMENT_PHASE_0_AUDIT.md](CLIENT_MANAGEMENT_PHASE_0_AUDIT.md).

---

## A. Current State Summary

FitDesk treats clients as the ERPNext `Customer` DocType, accessed **live** through a single
Control-Plane proxy (`erpFetch` → tenant JWT → `/api/erp/doctype/Customer`). **Nothing about a
client is persisted locally.** The directory (`ClientsView`), detail page, and a manual-first
`/new` form already exist and work. Goals are a JSON blob inside `custom_fitness_goals`; age is
folded into notes. Tenant isolation is provided by the ERP proxy's per-tenant JWT, **not** by local
row filters. There is a reusable server-side AI module (`lib/claude.ts`) and a pure scheduling
engine, but the `PT Session` DocType does not exist, so sessions are not persisted. There are **no
client-area tests**.

The plan asks for a **local read model + domain store** (`client_index`, `client_goal`,
`client_action_intent`, `client_event`), a projection service, a reconcile job, duplicate
detection with audit, optional AI parse, and a Client Hub — almost all net-new.

---

## B. What Already Matches the Plan (reusable)

| Plan element | Existing asset | Reuse |
|---|---|---|
| Manual-first Add Client | [new/page.tsx](../../app/dashboard/clients/new/page.tsx) | Form + validation skeleton; manual-first already satisfied (<30s) |
| Mobile bottom-sheet pattern | dead `AddClientSheet` in [ClientsView.tsx](../../components/modules/ClientsView.tsx) | Markup/animation reusable as the sheet shell |
| Client Directory + search/filter | [ClientsView.tsx](../../components/modules/ClientsView.tsx) | Directory shell; swap data source to `client_index` |
| Goal taxonomy (`goalId`, sub-goals) | [GoalSelect.tsx](../../components/ui/GoalSelect.tsx) / [GoalMultiSelect.tsx](../../components/ui/GoalMultiSelect.tsx) | Maps to `client_goal.goalId/subGoalIds`; `rehabilitation` ⇒ safety signal |
| Phone E.164 normalisation | `PhoneInput` (`phone_full`) | Feeds `phoneE164` + duplicate check |
| Server-side AI w/ fallback | [lib/claude.ts](../../lib/claude.ts) (Claude via fetch, template fallback, never-throws) | Base for AI parse route; **add 3s timeout + JSON parse** |
| Typed action envelope | `ActionResult<T>` in [types/index.ts](../../types/index.ts) | All new actions |
| Server-side trainer injection | `resolveTrainerId` in [actions/clients.ts](../../actions/clients.ts) | Tenant/owner injection for create |
| ERP boundary (no creds, proxy, JWT) | [lib/erpnext/client.ts](../../lib/erpnext/client.ts) | The only sanctioned ERP path; keep as the "later" sync channel |
| Additive migration pattern | [scripts/migrate-app.mjs](../../scripts/migrate-app.mjs) | `CREATE TABLE IF NOT EXISTS` for new tables |
| Graceful ERP-unavailable UX | [is-unavailable-error.ts](../../lib/erpnext/is-unavailable-error.ts) | Directory/hub error states |

---

## C. Missing Pieces — Requirement → Status Map

Status legend: ❌ none · 🟡 partial · ✅ present.

| Requirement | Current status | Files involved | Gap | Risk | Recommendation |
|---|---|---|---|---|---|
| Client Directory | 🟡 exists, reads **live ERP** | ClientsView.tsx; clients/page.tsx | Re-point to `client_index` query | Med | Add read model; feature-flag fallback to ERP read |
| Add Client Sheet / Drawer | 🟡 sheet markup exists but **dead**; live flow is full-page | ClientsView.tsx; new/page.tsx | Consolidate to one sheet(mobile)/drawer(desktop) | Low | Delete dead code; build responsive container |
| Manual-first creation | ✅ | new/page.tsx | — | — | Preserve; it is the reliable core |
| Optional AI parse | ❌ (only message-gen AI) | lib/claude.ts (pattern only) | New parse route + draft mapping | Med | Reuse claude.ts shape; structured JSON output |
| 3-second AI timeout | ❌ | lib/claude.ts has no timeout | Add `AbortController` 3000ms | Med | Server-side cap; never block create |
| AI failure / manual fallback | 🟡 pattern exists for messages | lib/claude.ts | Wire same fallback into parse UI states | Low | `idle/parsing/partial/low/failed/timeout` |
| Duplicate detection | ❌ | — | Tenant-scoped phoneE164 search | High | New service; normalise then query `client_index` |
| Duplicate override audit trail | ❌ | — | `duplicate.override` event + `possibleDuplicateClientId` | High | Write event in same txn as create |
| `client_index` read model | ❌ | lib/db/schema.ts | New table + repo | High | Additive schema; mandatory tenant filter |
| `ClientIndexProjectionService` | ❌ | — | New service `refreshClientSummary` | High | Direct projection (plan-approved); log-and-continue on failure |
| `client_goal` (confidence/source) | 🟡 taxonomy only; goals are JSON-in-ERP | GoalSelect/GoalMultiSelect; format/goal.ts | New table w/ urgency/source/confidence/safetyFlags | Med | Structured rows; keep `formatGoal` for legacy ERP reads |
| `client_action_intent` lifecycle | ❌ | — | New table + status machine | Med | `pending→in_progress→completed/dismissed/expired` |
| `client_event` | ❌ | message_log only (different shape) | New audit table | Med | Generic `{type,payload,createdByUserId}` |
| `ClientHubOverview` payload | ❌ | detail page is a basic profile | Hydration type + service | Med | Compose from index+goal+intent+notes |
| Client Hub MVP | 🟡 detail page (profile/sessions/invoices) | clients/[id]/page.tsx | Add overview, goals, action queue, placeholders | Med | Extend, don't rewrite; keep ERP invoice/session sections |
| Action queue | ❌ | — | UI + transitions actions | Med | Drive from `client_action_intent` |
| Tenant-safe repositories | ❌ (no local client tables) | lib/tenant/context.ts | New repo layer with forced tenant scope | **High** | Single choke-point repo; never raw SQL from actions |
| ERP boundary | ✅ | lib/erpnext/client.ts | Keep; do not mutate in create txn | — | Add ERP `Customer` sync as a **separate** later step |
| Billing boundary | ✅ (no auto-invoice today) | actions/invoices.ts | Ensure create txn touches none of it | Low | `billingMode` is display-only on index for MVP |
| Scheduling boundary | 🟡 engine pure; **no session store** | scheduling/engine.ts; actions/sessions.ts | `nextSessionAtUtc` has no source | High | Treat as placeholder; no booking in create txn |
| WhatsApp boundary | ✅ (approval-gated already) | actions/whatsapp.ts; lib/claude.ts | No auto-send in create | — | `send_whatsapp_welcome` stays an *intent*, not a send |
| Tests | ❌ for clients | (none) | Full unit/integration/E2E suite | **High** | Build libsql-backed harness; cover created→visible |

---

## D. Coupling Risks

| Coupling | Where | Why it matters for v1.2 |
|---|---|---|
| **Client identity ↔ ERP docname** | `Client.id` = ERP `Customer.name`; invoices/sessions/messages all key off it | If `client_index.id` becomes a local UUID and `erpCustomerId` is null until synced, `getInvoices({clientId})`, `/invoices/new?client=<id>`, and `message_log.client_id` all break for new clients. **This is the #1 coupling hazard.** |
| **Add Client ↔ ERP write** | `addClient → createClient → ERP POST Customer` | Plan forbids ERP mutation in the create txn. Removing the ERP write decouples identity from ERP and changes when invoicing becomes possible. Needs an explicit sync boundary. |
| **Directory ↔ live ERP read** | `ClientsView` renders `getClients()` (live) | "Immediate visibility after create" (plan §15.3) currently relies on an ERP round-trip + revalidate. A local `client_index` makes this trivial but introduces projection staleness. |
| **Goals ↔ free-text ERP field** | `custom_fitness_goals` JSON blob; age in notes | Structured `client_goal` must coexist with legacy ERP blobs; `formatGoal` must remain for back-compat reads. |
| **`nextSessionAtUtc` ↔ nonexistent session store** | PT Session DocType absent; `createSession` throws 503 | Projection trigger "session booked → refresh" is unbuildable until sessions persist. |
| **Tenant context ↔ three identifiers** | `tenantId` (provisioning), `trainerId` (ERP), `userId` (auth) | New tables need ONE canonical scoping key; mixing them invites isolation bugs. |
| **Reconcile job ↔ no scheduler** | No cron/worker; plan rejects BullMQ | The job has nowhere to run inside the current Next app. |

---

## E. Data Integrity Risks

- **Duplicate clients:** no detection today → real risk of dupes once volume grows. Plan's
  tenant-scoped `phoneE164` check is correct; integrity depends on **consistent E.164 normalisation**
  at every write (use `PhoneInput.phone_full`, normalise server-side too).
- **Phone normalisation:** `mobile_no` is free text in ERP today; mixed formats will defeat dupe
  matching. Normalise on the way into `client_index.phoneE164`.
- **Missing tenantId:** the gravest new risk. Shared `auth.db` means a forgotten tenant filter =
  cross-tenant data exposure. Mitigate with a repository layer that **requires** tenant context and
  forbids raw SQL from actions; add a tenant-isolation test.
- **Stale summaries:** projection-after-domain-change + 15-min reconcile is the plan's accepted
  trade-off (stale read model tolerated; no rollback). Acceptable **provided** the reconcile job
  actually runs — currently it has no host (see §D).
- **Uncontrolled side effects:** today `addClient` writes to ERP. The new create txn must write
  **local only** (index+goal+intent+event) and must **not** invoice/pay/send/book/generate.
- **Action queue lifecycle:** needs guarded transitions (`pending→…`), idempotent completion
  triggers, and `expiresAt` handling — none exist.
- **Create transaction safety:** libsql/SQLite supports a single local transaction for the 4-row
  write. The ERP sync must be **outside** that transaction (and failure-isolated), or a network
  hiccup rolls back a client the trainer thinks they created.

---

## F. UX Risks

- **Mobile usability:** strong baseline (sheets, safe-area insets, cards, `var(--fd-*)` tokens).
  Keep required fields to **name + phone** (plan §11.2); everything else optional/post-save.
- **Two entry points / pattern drift:** full-page `/new` vs dead bottom sheet contradicts the
  sheet/drawer requirement. Consolidate or trainers get inconsistent flows.
- **Confirm step missing:** plan wants a review/confirm screen surfacing warnings + suggested
  actions before save. Today create is immediate. Add a lightweight confirm (don't over-gate manual).
- **Conflict handling clarity:** duplicate "Open existing / Continue anyway / Cancel" and the
  reason-capture on override are new; must be unmistakable on a phone.
- **Desktop/mobile mismatch:** plan wants drawer on desktop, sheet on mobile. The app is mobile-first
  with a 480px column; a desktop drawer is net-new responsive work.
- **Over-gating safety:** ensure pain/rehab notes set a warning but **never block** manual creation
  (plan §13.1, guardrail "Safety conflicts block automation, not client creation").

---

## G. Test Gaps

**Unit (none today for clients):**
- Phone normalisation → E.164.
- AI draft validation / mapping `ParsedField<T>` → form.
- Goal confidence/source rules (trainer=high, AI-uncertain=medium/low).
- Action-intent transition guards.
- Duplicate-matching helper (exact phone, possible name).
- Safety-state derivation from goal/notes.

**Integration (none today; needs libsql-backed harness):**
- Create-client transaction writes index+goal+intent+event atomically.
- **Created → immediately visible in directory query** (plan-required).
- Duplicate phone guard; duplicate override writes `duplicate.override` event + sets `possibleDuplicateClientId`.
- Client goal + action-intent creation.
- **Tenant isolation** — tenant A cannot see/dup-match tenant B's clients.
- Client Hub hydration from approved sources only (no raw ERP, no N+1).
- Projection update after goal/billing/onboarding change.
- Projection failure logs and does **not** roll back the domain action.
- Reconcile job repairs a deliberately stale `client_index` row.

**E2E (none today):**
- Open Clients → add manually → see in list.
- Add with AI assist; AI timeout → manual fallback keeps typed text.
- Resolve duplicate warning paths.
- Open Client Hub after save; complete/dismiss an action intent.

---

## H. Bottom Line

~70% of the **UI surface** and all the **safe patterns** (ERP boundary, AI fallback, action
envelope, goal taxonomy, mobile sheets) already exist and are reusable. ~90% of the **data/domain
layer** (local tables, projection, reconcile, duplicate, events, action queue, Hub payload, tests)
is net-new. The build is dominated by **one unresolved architectural decision** — whether
`client_index` becomes the client source of truth and how/when the ERP `Customer` is created.
Resolve that before writing any schema.
