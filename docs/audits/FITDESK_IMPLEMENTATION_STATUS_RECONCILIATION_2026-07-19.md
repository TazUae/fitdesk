# FitDesk Implementation Status Reconciliation

## 1. Document control

- **Date:** 2026-07-19
- **Repository:** `C:\Users\Lenovo\Dev\axis-erp\FitDesk`
- **Branch:** `feat/ui-ux-modernization`
- **Audited HEAD:** `a316c5d` (`docs(fitdesk): preserve plan history and repair archival links`)
- **Status:** Verified repository snapshot — implementation truth, not product intent
- **Purpose:** Establish a single, evidence-based statement of what FitDesk actually does today, so that the canonical Journey Map, Sitemap, and documentation pack can be adopted without being mistaken for a description of current behavior.
- **Scope:** Application code and schema inside this repository only (`app/`, `components/`, `features/`, `lib/`, `actions/`, `docs/` as evidence, not as truth). Control Plane, Provisioning Agent, and ERP Execution Service internals are separate repositories and are explicitly **out of scope** — only FitDesk's side of the boundary (what it sends and how) is verified here.
- **Evidence standard:** Every capability claim below cites an exact file path and, where feasible, a line number or range. A capability is never inferred to exist because a component name, route name, label, schema column, or planning document mentions it — the code path was read and traced. Where something could not be verified from the repository alone (e.g. actual production/ERP/WhatsApp runtime behavior), this is stated explicitly in §14 rather than assumed.
- **Working-tree note:** This audit evaluates the repository as it currently sits on disk on `feat/ui-ux-modernization`, which includes committed work through `a316c5d` **and** a substantial uncommitted UI/UX systemization pass (component primitives, a proposed gold accent rebrand, per-view token migration) still present in the working tree. Where a finding depends on code that is uncommitted, this is noted. The scheduling engine, billing/package services, ERP boundary, and auth/onboarding code are all committed and unaffected by the uncommitted pass.

---

## 2. Executive summary

**Stable and implemented:** Authentication (Better Auth) and the onboarding→workspace-provisioning→dashboard flow are fully implemented and defense-in-depth gated (client redirect + server re-check + edge middleware, fail-closed on any provisioning-status fetch failure). The scheduling core (`lib/scheduling/engine.ts`, `bookingService.ts`, `sessionRepository.ts`) is mature: DST-safe, conflict-aware, recurrence-capped, and untouched by any uncommitted work. Session completion (Complete/No-show/Cancel/Reschedule) is a real, single-sheet, billing-dispatching workflow with synchronous, ordered, idempotent invoice/ledger writes. Package-mode billing, pay-per-session invoicing at completion, package consumption, and the ERP/Control Plane boundary (JWT-signed proxy, no ERP credentials in FitDesk, no client-side ERP access) are all implemented as designed.

**Partial:** WhatsApp consent is stored (3-state enum) and enforced — but only for one narrow reminder-candidate pathway (US-048/US-050); the primary manual message composer sends with no consent check at all. The dashboard's "AI Copilot" rail is fully real (link-only, zero model calls, deterministic) on desktop but silently replaced by a static placeholder card on mobile and tablet — the product's stated primary surface. Manual invoice creation exists as working code but is reachable only by typing a URL directly; nothing in the UI links to it (this appears to be an intentional guardrail, consistent with CLAUDE.md's manual-invoice-hidden rule, not a bug).

**Largest canonical-to-code gaps:** There is no Inbox concept, no `/inbox` route, and no inbound WhatsApp/webhook handling anywhere in the repository — messaging is outbound-only. There is no `/billing` route; `/invoices` remains the only financial destination. Pay-per-session "Paid Now / Pay Later" exists only at package-*assignment* time, not inside Session Completion as the canonical Journey Map describes. Program/Workout functionality is completely absent from the codebase, not merely incomplete — there is no exercise catalog, no program template, and the one UI placeholder that used to gesture at it was deliberately removed in the uncommitted UI pass. Offline behavior (cache, intent queue, sync) does not exist at any level — no service worker, no IndexedDB/localStorage draft logic, no PWA manifest.

**What must not be overclaimed:** Nothing in this repository should be described as "Inbox," "Billing," or a "Program" destination — those are canonical-direction names with no corresponding implementation. The AI Copilot rail must not be described as model-backed. WhatsApp consent must not be described as enforced in the general sense — it gates one specific workflow only.

**What remains safe for the pilot:** The core trainer loop — book a session, complete it, consume a package or invoice a pay-per-session client, record a payment — is real, tested (`lib/scheduling/__tests__/`, `lib/billing/__tests__/`, `actions/*.test.ts`), and does not depend on any of the missing/gap items above.

---

## 3. Status taxonomy

**Implemented** — The capability exists in the current repository and its primary path is usable end-to-end without additional work.

**Partial** — A meaningful portion exists, but an important workflow, enforcement point, integration, or production guardrail is missing.

**Target direction** — The capability is defined by the canonical Journey Map, Sitemap, PRD, or product specification but is not current implementation truth. No repository evidence supports it existing today.

**Future platform architecture** — The capability belongs to later multi-tenant platform architecture, Control Plane hardening, advanced automation, or future shared-module work, and is explicitly out of scope for the current repository.

**Absent** — No meaningful implementation was verified; a name, label, or comment referencing the idea does not count as evidence.

**Delivery priority:**
1. **MVP / pilot-safe now** — required or already present for the current pilot.
2. **Production-hardening soon** — needed before wider rollout, not blocking the pilot.
3. **Future platform architecture later** — deferred, no near-term dependency.

---

## 4. Route and navigation reconciliation

| Capability or destination | Canonical target | Current repository truth | Status | Priority | Evidence paths | Reconciliation note |
|---|---|---|---|---|---|---|
| Desktop primary nav | Dashboard, Schedule, Clients, Inbox, Billing, Settings | Home, Clients, Schedule, Invoices (Settings reachable only via footer/menu, not inline) | Implemented (as a *different* nav than canonical) | 2 | `features/dashboard/components/DashboardSidebar.tsx:21-26` | Order differs (Clients before Schedule); no Inbox; "Invoices" not "Billing" |
| Mobile bottom nav | Home, Schedule, Clients, Inbox, More | Home, Clients, Schedule, Invoices, More | Implemented (as a *different* nav than canonical) | 2 | `components/modules/DashboardClientShell.tsx:28-33`, `:233-248` | Same order/naming gap as desktop; `More` opens `UserMenuSheet` |
| `/inbox` route | Canonical global communication destination | Does not exist | Absent | 2 | repo-wide route enumeration (`app/**/page.tsx`) | No route, no nav entry, no component |
| `/billing` route | Canonical financial destination | Does not exist | Absent | 2 | repo-wide route enumeration | Only `/invoices` exists |
| `/invoices` route | Preserved via alias if `/billing` adopted | Fully operational: list, `[id]`, `[id]/pay`, `new` | Implemented | 1 | `app/dashboard/invoices/{page.tsx,[id]/page.tsx,[id]/pay/page.tsx,new/page.tsx}` | Must be preserved per Sitemap's own aliasing principle when `/billing` is eventually built |
| Manual invoice creation | Hidden from normal trainer workflow | Route exists, code is real, but zero inbound links found anywhere in the app | Implemented but intentionally unlinked | 1 | `app/dashboard/invoices/new/page.tsx`; grep for `invoices/new` across `app/components/features/lib/actions` returns no matches | Matches CLAUDE.md's "manual invoice creation stays hidden" guardrail — treat as working-as-intended, not a bug |
| `/messages` (per-client) | Reconciled with `/inbox` via alias | `app/dashboard/messages/[clientId]/page.tsx` exists; no top-level list/thread route | Partial | 2 | `app/dashboard/messages/[clientId]/page.tsx` | Outbound composer + history for one client only; no inbox-style aggregate view to alias from |
| WhatsApp connection management | N/A in canonical docs (infra concern) | `app/dashboard/whatsapp/page.tsx` — QR pairing/connection status, not a conversation view | Implemented (different purpose than "Inbox") | 1 | `app/dashboard/whatsapp/page.tsx` | Should not be conflated with the canonical Inbox destination |
| Program / Workout route | Inside Client Hub (`?view=program`) | No route, no component | Absent | 3 | repo-wide search, `components/modules/ClientHubPanel.tsx:822-824` (placeholder explicitly removed) | Nothing to alias or migrate — build from scratch when scheduled |
| Settings sub-routes | `/settings/program-library`, `/settings/exercise-catalog`, etc. | Only `app/dashboard/settings/{page.tsx,packages/page.tsx,loading.tsx}` exist | Absent (for program/exercise) / Implemented (for packages) | 1 (packages) / 3 (program/exercise) | `app/dashboard/settings/` full listing | Package template CRUD is real; nothing else canonical exists here yet |
| Intercepted quick-view sheets | Not specifically named in canonical docs | `app/dashboard/@overlay/(.)clients/[id]/page.tsx`, `app/dashboard/@overlay/(.)clients/new/page.tsx` | Implemented | 1 | file listing | Parallel-route pattern for client quick-view; functions independently of nav reconciliation |

---

## 5. Capability register

| Capability | Status | Priority | Evidence |
|---|---|---|---|
| Dashboard (Today/attention/derive) | Implemented | 1 | `app/dashboard/page.tsx:36-126`, `lib/dashboard/derive.ts` (pure, no I/O) |
| Schedule / booking | Implemented | 1 | `lib/scheduling/engine.ts`, `bookingService.ts`, `sessionRepository.ts`, `actions/schedulingActions.ts` |
| Clients (list/detail) | Implemented | 1 | `app/dashboard/clients/{page.tsx,[id]/page.tsx,new/page.tsx,[id]/edit/page.tsx}` |
| Client Hub (unified) | Implemented, one facet absent | 1 | `app/dashboard/clients/[id]/page.tsx` + `components/modules/ClientHubPanel.tsx` — covers profile, balance, sessions, attendance, invoices, goals, packages, activity, lifecycle actions; Program facet absent |
| Add Client | Implemented | 1 | `components/clients/AddClientForm.tsx` (4-step flow, uncommitted restructure, presentation-only per execution log) |
| Package billing | Implemented | 1 | `lib/billing/package-assignment-service.ts`; Paid Now/Pay Later at assignment via `components/clients/AssignPackageForm.tsx:353-367` |
| Pay-per-session billing | Implemented (invoice-at-completion) / Partial (payment timing) | 1 | `lib/scheduling/sessionCompletionService.ts:237-281`; Paid Now/Pay Later choice absent from completion flow itself (see §6) |
| Session Completion | Implemented | 1 | `components/scheduling/SessionCompletionSheet.tsx`, `lib/scheduling/sessionCompletionService.ts` |
| Invoices | Implemented | 1 | `app/dashboard/invoices/**`, `actions/invoices.ts` |
| Billing destination (`/billing`) | Absent | 2 | no route exists |
| Inbox | Absent | 2 | no route, no component |
| Messages (per-client outbound) | Partial | 1 | `app/dashboard/messages/[clientId]/page.tsx`, `actions/messages.ts` |
| WhatsApp (outbound) | Implemented | 1 | `lib/evolution.ts` (478 lines), `sendWhatsAppMessage`/`normalizePhone` |
| WhatsApp (inbound/webhook) | Absent | 2 | no webhook route, no receiver anywhere in repo |
| Programs | Absent | 3 | repo-wide search returns no exercise/workout files |
| Exercise Catalog | Absent | 3 | same |
| Settings (general) | Implemented | 1 | `app/dashboard/settings/page.tsx` |
| Settings → Package templates | Implemented | 1 | `app/dashboard/settings/packages/page.tsx`, `actions/packages.ts` |
| Authentication | Implemented | 1 | `lib/auth.ts:34-63` (Better Auth, email/password + Google) |
| Onboarding | Implemented | 1 | `app/onboarding/{page.tsx,actions.ts}`, `features/onboarding/components/` |
| Provisioning | Implemented | 1 | `lib/controlplane/client.ts:57-62`, `lib/db/schema.ts:110-121` (`workspaceProvisioning`) |
| Offline intent | Absent | 2 | no service worker, no IndexedDB/localStorage draft/queue logic, no PWA manifest anywhere |
| AI assistance (message drafts) | Implemented, deterministic-fallback | 1 | `lib/claude.ts` |
| AI assistance (client intake parsing) | Implemented | 1 | `lib/clients/ai-parse.ts` |
| AI assistance (dashboard "Copilot") | Partial (desktop only) | 1 | `features/dashboard/components/AiCopilotRail.tsx` (zero model calls, link-only); mobile/tablet shows a static placeholder (`components/modules/DashboardView.tsx:138-164`) |
| ERP integration | Implemented | 1 | `lib/erpnext/client.ts` (JWT-signed CP proxy, no raw ERP credentials) |
| Control Plane (FitDesk side) | Implemented | 1 | `lib/controlplane/client.ts` (`server-only`, no Docker/child_process bypass found) |
| Audit logging (message sends) | Implemented | 1 | `messageLog` table, `actions/messages.ts:24-55` |
| Accessibility foundations | Partial | 1/2 | `components/ui/WorkspaceShell.tsx`, `useFocusTrap.ts` (committed via `613f810` for `BookingSheet`; broader primitive-level rollout remains uncommitted) |

---

## 6. Financial workflow truth

**Package mode.** Billing mode is stored per client (`lib/db/schema.ts:158`, `billingMode` — `trial | package | pay_per_session | unset`). Package assignment creates the purchase and, for non-zero-amount packages, an ERP invoice via `lib/billing/package-assignment-service.ts`. **Paid Now / Pay Later is decided at package-assignment time**, via a radio choice in `components/clients/AssignPackageForm.tsx:353-367` (`pay_later` / `paid_now`), not during session completion. Routine session completion for package clients **does not** reopen any payment control — it consumes one ledger unit, synchronously, before the FD Session status write (`lib/scheduling/sessionCompletionService.ts:283-310`), with idempotency guarded by a caller-supplied key.

**Pay-per-session (PPS) mode.** The session price is stored on the client record (billing-mode-specific fields, resolved via the same repository path as package mode). The Sales Invoice is created **only at session completion**, synchronously and idempotently, **before** the FD Session status write (`lib/scheduling/sessionCompletionService.ts:237-281`, idempotency via `findInvoiceBySession`). **Paid Now / Pay Later does not exist inside the Session Completion flow** — `components/scheduling/SessionCompletionSheet.tsx:801-815` only previews the invoice amount that will be issued; there is no payment-timing selector anywhere in that sheet. This is a real, verified gap against the canonical Journey Map, which places this choice inside completion.

**Manual invoice creation.** Working code exists (`app/dashboard/invoices/new/page.tsx`) but is unreachable from any in-app link — consistent with CLAUDE.md's explicit rule that manual invoicing stays hidden from the normal trainer workflow.

**Financial hooks confirmed to exist:** invoice creation/submission (`lib/erpnext/client.ts`), payment recording (`actions/invoices.ts:209`, `recordPayment`, called from `app/dashboard/invoices/[id]/pay/RecordPaymentForm.tsx`), package ledger consumption (`actions/packages.ts:177-219`, `usePackageSession`), package-assignment payment (`lib/billing/package-assignment-service.ts`), and Statement of Account (`actions/statements.ts:26`, `getClientStatement`).

---

## 7. Scheduling truth

Core files, all **committed** and **untouched** by any uncommitted UI work:

- `lib/scheduling/engine.ts` (429 lines) — pure, no I/O.
  - Conflict detection: `engine.ts:191-241` (hard overlap + buffer-window test, batch self-conflict check).
  - DST safety: `engine.ts:41-59` — explicitly detects and throws `'DST_SKIP'` on spring-forward gaps; fall-back ambiguity resolves to the earlier UTC offset via Luxon.
  - Recurrence: `engine.ts:107-179` — weekly patterns, hard cap `MAX_SERIES_WEEKS = 12`.
  - Working-hours/buffer: `engine.ts:251-285` (`checkAvailability`).
- `lib/scheduling/bookingService.ts` (165 lines) — orchestration.
- `lib/scheduling/sessionRepository.ts` (326 lines) — persistence.
- `actions/schedulingActions.ts` (682 lines) — server actions: `completeSessionAction` (`:356-382`), `markNoShowAction`, `previewBatchCompletionAction`, `rescheduleSessionAction` (`:508-535`), `batchCompleteSessionsAction`.
- Rescheduling lives in a separate, financially-inert module (`sessionRescheduleService.ts`, confirmed via its own test file `lib/scheduling/__tests__/sessionRescheduleService.test.ts`), reusing the same pure engine primitives; never touches invoice/package ledger.
- Package/billing awareness is deliberately **not** in `engine.ts` (pure by design) — it lives one layer up in `lib/scheduling/sessionCompletionService.ts` and the server actions.

Test coverage confirmed present (listing only, pass/fail not re-verified in this batch): `lib/scheduling/__tests__/{attendance,bookingService,completionUI,engine,sessionInvoiceBuilder,sessionRepository,sessionRescheduleService}.test.ts`.

---

## 8. Communication and consent truth

**Directionality:** Outbound only, confirmed absolute. `lib/evolution.ts` (478 lines) implements `sendText`, instance create/connect/QR/status/disconnect against Evolution API — no inbound receiver, no webhook route anywhere in the repository (`app/api/**webhook**` does not exist).

**Composer and drafts:** `generateDraftMessage()` (`actions/messages.ts:66-106`) produces a draft via `lib/claude.ts` (template fallback if `ANTHROPIC_API_KEY` unset) for trainer review in `MessagesView.tsx`; sending is a separate, explicit trainer action (`sendMessage()`, `actions/messages.ts:116`), gated by a `ConfirmDialog` for financial message types (`invoice`/`reminder`) in `MessagesView.tsx:174-179`.

**Audit log:** every send attempt (success or failure) is written to `messageLog` (`actions/messages.ts:24-55`, `getMessages()`), with `status`, `errorDetail`, `evolutionMessageId` — a send audit log, not a bidirectional conversation store.

**Consent storage:** `whatsappConsentState` exists in `lib/db/schema.ts:150` — a **3-state** text enum (`unknown` default | `opted_in` | `opted_out`). The 4th state referenced in some product docs (`opt_in_requested`) **does not exist** in this schema or anywhere in application code.

**Consent enforcement — partial, and narrower than it may appear:**
- Pure predicates live in `lib/clients/consent.ts` (`canSendAutomatedWhatsApp` — true only for `opted_in`; `isOptedOut`).
- These predicates **are** enforced in one specific pathway: the trainer-approved reminder-candidate flow — `createWhatsAppReminderCandidateAction` (US-050, `actions/clients.ts:401-436`, consent-gated at creation) and `deliverWhatsAppReminderAction` (US-048, `actions/clients.ts:448-500`, re-checks consent at send time via `canSendAutomatedWhatsApp`, blocks `opted_out`/`unknown` with no override).
- These predicates are **not referenced anywhere** in `actions/messages.ts` — confirmed by direct grep of the file for `whatsappConsentState`, `canSendAutomatedWhatsApp`, `isOptedOut` (zero matches). The primary/manual composer path (`MessagesView.tsx` → `sendMessage()`) sends invoice/reminder/follow-up/reengagement messages with **no consent check at all**.
- Net finding: consent is enforced for the one narrow automated-candidate pathway that exists today, and unenforced for the general trainer-initiated send path. This should be described as **partial enforcement**, not "enforced" or "unenforced" without qualification.

---

## 9. AI truth

| Surface | Label shown to user | Actual implementation | Model-backed? | Status | Evidence |
|---|---|---|---|---|---|
| Dashboard right rail (desktop, `xl+`) | "AI Copilot" / "AI suggests. You decide." | Renders up to 3 pre-computed `AttentionItem[]` as link-only suggestion cards; imports are `next/link`, `lucide-react`, and a type-only import of `AttentionItem` | No | Implemented (as a rule-based UI, mislabeled as "AI") | `features/dashboard/components/AiCopilotRail.tsx` (112 lines, footer text at `:105`); source items from `lib/dashboard/derive.ts` `combineAttentionItems()` |
| Dashboard, mobile/tablet (`<xl`) | Same "AI Copilot" framing implied | Static hardcoded placeholder card ("AI Copilot is standing by...") — the real, data-driven rail never renders below `xl` | No | Partial / effectively Absent on mobile | `components/modules/DashboardView.tsx:138-164` (placeholder), `:188` (real rail, `xl+` only) |
| Message drafting (WhatsApp copy) | "AI-suggested" draft in composer | Calls `generateMessage()` via `lib/claude.ts`, falls back to a template if `ANTHROPIC_API_KEY` is unset | Yes (when key present) / No (template fallback) | Implemented, human-gated | `lib/claude.ts`; caller `actions/messages.ts:66-106` |
| Add Client "AI quick-add" | Parses freeform text into a client draft | `lib/clients/ai-parse.ts` | Yes (assumed same provider pattern; not independently re-verified this batch) | Implemented, human-gated | `lib/clients/ai-parse.ts` |
| Anything resembling autonomous booking/completion/payment/program AI | N/A | Not found anywhere in the repository | No | Absent | repo-wide search for provider adapters, prompt/schema registry, AI run audit log, "Ask FitDesk," booking/progress parsers, Workout Builder — none found |

No AI surface in this repository executes a mutation (booking, completion, package consumption, invoice creation, payment, WhatsApp send) without an explicit, separate trainer-confirmed action — consistent with CLAUDE.md's AI-copilot-not-autopilot rule, as far as this audit could verify.

---

## 10. Offline truth

**Absent, entirely, at every level.** A repository-wide search for `serviceWorker`, `IndexedDB`, `localStorage`, `sessionStorage`, offline queue patterns, `navigator.onLine`, `next-pwa`, and `workbox` returns zero matches in application code. No PWA manifest exists. There is no partial scaffold, no draft-persistence mechanism, and no completion-intent capture mechanism of any kind. This should not be described as "partial" — it is a clean absence, not a start.

---

## 11. Canonical gaps by priority

### MVP / pilot-safe now
- Core loop (book → complete → bill → pay) is already implemented and does not require any canonical-gap closure to remain pilot-safe.
- The unlinked manual-invoice route and the desktop-only real AI Copilot rail are both acceptable as-is for a pilot; neither blocks the current trainer workflow.

### Production-hardening soon
- WhatsApp consent enforcement should be extended from the single reminder-candidate pathway to the general composer send path before any broader automated-messaging rollout, per CLAUDE.md's own PD-005 rule.
- The AI Copilot mobile placeholder should either get the real data-driven rail or be relabeled so it doesn't imply parity with desktop.
- Nav/route reconciliation (Inbox, Billing) should proceed under the documentation-only adoption already in progress, with `/messages` and `/invoices` preserved via alias per the Sitemap's own stated principle — not deleted or hard-renamed.

### Future platform architecture later
- Inbound WhatsApp / webhook handling and a true Inbox.
- PPS Paid Now/Pay Later inside Session Completion (currently only at package-assignment time; would require new UI + service work, not just a rename).
- Programs / Workout and the Exercise Catalog — fully greenfield, no existing code to build on.
- Offline read cache, intent capture, and sync.

Not every canonical idea is classified MVP; the majority of the largest gaps above are explicitly placed in tiers 2–3.

---

## 12. Documentation adoption implications

Any canonical document adopted into this repository (Journey Map v1.12, Sitemap v1.1, PRD, and the rest of the 10-document pack) must carry a status banner pointing back to this audit and must not be read as a description of current behavior. Every gap identified in §4–§11 remains true regardless of what the adopted documents say the target direction is. In particular: adopted documents must not be cited as evidence that Inbox, Billing, Programs, offline sync, or in-flow PPS Paid Now/Pay Later exist — this audit is the evidence of record for current implementation state, and the canonical pack is the evidence of record for intended direction. Where the two conflict (e.g. nav order, Inbox naming), the conflict itself should be preserved and flagged in the adopted document, not silently resolved in either direction.

---

## 13. Open product decisions

- **Indigo versus gold accent — resolved 2026-07-19.** Explicit product-owner decision: Midnight `#0B1020` and Indigo `#635BFF` are approved for the FitDesk application; Gold is rejected as the default accent; Geist Sans/Geist Mono remain the application typography (no typeface change approved); the supplied FitDesk wordmark, F+D icon, and "FitDesk by Novarra" endorsed lockup are approved brand assets. This resolves the visual-direction question only. The uncommitted working-tree `app/globals.css` still implements gold (`--fd-primary: #E8C547`) and has not been updated to match; `ADR-UX-012` (Proposed, not approved) already specifies Indigo internally but still requires governance reconciliation before it is binding. Detailed brand rules, logo usage, semantic-token roles, and contrast requirements remain pending a future `ADR-UX-013`. Do not treat any current UI code as already matching the approved direction until it is verified against the eventual ADR-UX-013 and re-audited.
- **Inbox route and `/messages` compatibility.** No `/inbox` exists; `/messages` exists only as a per-client route. How (or whether) to alias one into the other is undecided.
- **Billing destination and `/invoices` compatibility.** No `/billing` exists. The Sitemap's own principle ("existing working routes win") argues for aliasing rather than a hard rename, but this hasn't been implemented or decided in code.
- **PPS Paid Now/Pay Later placement.** Currently only at package-assignment time; the canonical Journey Map wants it inside Session Completion. Whether to add it there, and how it interacts with the existing invoice-at-completion flow, is undecided.
- **Program rollout timing.** No code exists; timing and scope are entirely open.
- **WhatsApp consent-state expansion and enforcement.** Whether to add the missing `opt_in_requested` state, and whether to extend consent enforcement to the general composer path, are both open.
- **Naming of rule-based "AI" surfaces.** Whether "AI Copilot" should keep that name given it makes zero model calls, or be relabeled to avoid overclaiming, is undecided.

---

## 14. Verification limitations

- This audit is a **static code-reading exercise**. No browser session, no running dev server, no production environment, no live ERP instance, and no live WhatsApp/Evolution API call was exercised to confirm runtime behavior — all findings are based on reading source files and tracing imports/call chains, not on observed execution.
- Test *pass/fail* status was not re-run for this batch; §7's test list is a file inventory only (confirmed present, not confirmed passing).
- Control Plane, Provisioning Agent, and ERP Execution Service internals were not inspected — this audit verifies only what FitDesk sends to them and how, not their internal correctness.
- The `lib/clients/ai-parse.ts` AI-backed classification in §9 is carried over from a prior finding in this session and was not independently re-read line-by-line in this batch; treat as high-confidence but not freshly re-verified.
- Two commits landed on this branch since the working-tree state was first catalogued earlier in this session (`613f810` BookingSheet a11y fix, `a316c5d` this batch's predecessor); navigation files were re-checked fresh and confirmed unchanged, but not every previously-audited file was re-diffed against the current HEAD.
- No claim in this document should be read as a statement about what will be true after any future commit, including any commit that adopts the canonical documentation pack.
