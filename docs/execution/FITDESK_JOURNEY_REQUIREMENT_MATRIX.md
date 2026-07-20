# FitDesk Journey Requirement Matrix

```text
Phase: 0 — Zero-Drift Traceability
Source: docs/product/FITDESK_JOURNEY_MAP_V1.md (v1.12, frozen — see FITDESK_ZERO_DRIFT_SOURCE_MANIFEST.md)
Source SHA-256 (full file): 92357e4f6b156418e248cebd6a21593a3c7e4682693d09446179b915c5d1ab4e
Generated: 2026-07-20
Rule: The "Exact source text" field is verbatim from the frozen source. It is never paraphrased.
Rule: Every Journey Map section is mapped. Sections that impose no directly implementable UI
      requirement are recorded as GOVERNANCE rows so that zero sections are silently unmapped.
```

## Conventions

- **ID scheme:** `JR-<section>-<seq>` where `<section>` is the Journey Map heading number (e.g. `JR-3.2-01` = section 3.2, first requirement).
- **Status values:** `exact` | `partial` | `conflicting` | `missing` | `governance` (constraint on how work is done, not a screen) | `future-gated` (Journey Map itself marks it FUTURE / APPROVAL-GATED / PWA-DECISION-GATED — excluded from MVP implementation batches and recorded to prevent invention).
- **Batches:** `B0`–`B15` per FITDESK_ZERO_DRIFT_IMPLEMENTATION_SEQUENCE.md (B0 source freeze, B1 brand primitives, B2 Authentication, B3 Onboarding, B4 Provisioning/Workspace Ready, B5 Shell, B6 Dashboard, B7 Schedule/Booking, B8 Clients/Client Hub, B9 Session Completion, B10 Inbox, B11 Billing, B12 Settings, B13 Global Search, B14 Shared resolver/state library, B15 Full journey acceptance).
- **Assets:** `A01`–`A81` per the manifest's PNG inventory.
- **Persona:** `Trainer` unless stated; the client has no direct MVP interaction (JR-3.4-01).
- **Approval gate values:** `none` (mechanical), `PO-visual` (product-owner screenshot approval), `PO-decision` (product-owner decision required before implementation).

---

## Section 1 — Purpose

#### JR-1-01 (GOVERNANCE)
- **Source heading:** 1. Purpose
- **Exact source text:** "The primary question is: **What does the trainer need to understand, decide, and complete next to run the coaching business safely?** The map follows the FitDesk dashboard north star: Detect meaningful operational risk → explain why it matters → prepare the next safe action → let the trainer review and confirm → reflect the verified result."
- **Journey stage:** Global · **Persona:** Trainer · **Trigger:** All surfaces
- **Route:** all · **Surface:** all
- **Desktop/Mobile behavior:** North-star sequencing governs every attention/resolver surface.
- **Required state:** n/a · **Required copy:** n/a
- **Authoritative data source:** n/a · **Action contract:** n/a
- **Confirmation requirement:** review-and-confirm precedes every consequential mutation.
- **Recovery requirement:** verified result reflected after execution.
- **Linked sitemap node:** all · **Linked assets:** all
- **Current implementation files:** n/a (doctrine)
- **Current status:** governance
- **Batch:** all · **Automated test:** n/a · **Browser test:** n/a · **Screenshot:** n/a
- **Approval gate:** none

## Section 2 — Evidence and Status Boundary

#### JR-2-01 (GOVERNANCE)
- **Source heading:** 2.1–2.4 Evidence and Status Boundary
- **Exact source text:** "MVP = capability verified on main + capability materially present on the active UI/UX modernization branch" … "Before adoption, verify the modernization execution log against the active Git diff. Treat the log as a high-value inventory, not unquestioned truth. Do not infer current build state from an old roadmap alone."
- **Journey stage:** Global · **Persona:** Engineering · **Trigger:** Planning
- **Route:** n/a · **Surface:** n/a
- **Desktop/Mobile behavior:** n/a — defines the status legend (MVP — MAIN / MVP — MODERNIZATION BRANCH / MVP — NEEDS UPGRADE / APPROVED JOURNEY REQUIREMENT / APPROVAL-GATED / FUTURE / PWA-DECISION-GATED / VERIFY AT ADOPTION) used throughout this matrix's status interpretation.
- **Required state/copy/data/action/confirmation/recovery:** n/a
- **Linked sitemap node:** n/a · **Linked assets:** n/a
- **Current implementation files:** n/a
- **Current status:** governance
- **Batch:** B0 · **Tests/Screenshot:** n/a · **Approval gate:** none

## Section 3 — Non-Negotiable Journey Rules

#### JR-3.1-01
- **Source heading:** 3.1 Trainer sovereignty
- **Exact source text:** "AI prepares. Trainer reviews. Trainer decides. System executes only after explicit confirmation. Outcome is recorded." … "no journey diagram may show AI directly: sending a WhatsApp message; creating an invoice; recording a payment; booking a session; completing, cancelling, no-showing, or rescheduling a session; consuming a package; changing billing mode; overriding a safety flag; creating or publishing a program."
- **Journey stage:** Global rule · **Persona:** Trainer · **Trigger:** every AI-assisted flow
- **Route:** all AI surfaces · **Surface:** all AI-prepared drafts/proposals
- **Desktop behavior:** every AI output is a draft requiring explicit confirm control. · **Mobile behavior:** same.
- **Required state:** draft → review → confirmed → recorded.
- **Required copy:** AI-prepared content labeled as prepared/draft.
- **Authoritative data source:** domain services only. · **Action contract:** AI has no execution edge (see JR-6.8-01).
- **Confirmation requirement:** explicit trainer confirmation before any listed mutation.
- **Recovery requirement:** outcome recorded after execution.
- **Linked sitemap node:** all · **Linked assets:** A81 (resolver/state library)
- **Current implementation files:** `features/*/` AI paths not present at HEAD (no AI execution edge exists — vacuously safe); protected actions in `actions/*.ts`.
- **Current status:** governance
- **Batch:** B14 (state library encodes draft/review/confirm grammar) · **Automated test:** assert no AI path invokes mutation actions without confirm · **Browser test:** confirm-gates present in AI-adjacent flows · **Screenshot:** n/a
- **Approval gate:** none

#### JR-3.2-01
- **Source heading:** 3.2 Confirmed-first actions
- **Exact source text:** "The UI must not claim success before authoritative confirmation for: client creation; ERP synchronization; booking; session outcomes; package assignment or consumption; invoice creation; payment recording; WhatsApp sending. Immediate local behavior is acceptable only for reversible presentation state such as opening a sheet, editing a draft, changing a filter, or previewing a consequence."
- **Journey stage:** Global rule · **Persona:** Trainer · **Trigger:** all eight mutation families
- **Route:** all mutation surfaces · **Surface:** sheets/forms/resolvers
- **Desktop behavior:** pending → confirmed / failed states rendered truthfully. · **Mobile behavior:** same.
- **Required state:** pending, confirmed, failed (per mutation).
- **Required copy:** no premature success wording.
- **Authoritative data source:** ERP/Control Plane confirmations via server actions.
- **Action contract:** existing server actions (`actions/clients.ts`, `actions/schedulingActions.ts`, `actions/invoices.ts`, `actions/packages.ts`, `actions/messages.ts`, `actions/whatsapp.ts`).
- **Confirmation requirement:** authoritative success only.
- **Recovery requirement:** failed step shown exactly (see JR-25 rows).
- **Linked sitemap node:** all mutation surfaces · **Linked assets:** A81
- **Current implementation files:** `actions/*.ts` (contract holds); UI truthfulness varies per surface — audited per-surface in later rows.
- **Current status:** partial (contract present server-side; per-surface UI truthfulness re-verified per batch)
- **Batch:** B14 + each surface batch · **Automated test:** action result-state tests (exist for actions) · **Browser test:** pending/confirmed/failed visible per flow · **Screenshot:** per surface
- **Approval gate:** none

#### JR-3.3-01
- **Source heading:** 3.3 ERP and ownership boundary
- **Exact source text:** "ERPNext remains authoritative for: ERP Customer identity; invoices; payments; accounting-facing records. FitDesk local data owns: fast trainer UX; goals and safety state; action intents; notes/events; duplicate audit; onboarding/workflow summaries; dashboard derivations." … "Route / UI surface → Server Action → Domain service or tenant-scoped repository → ERP client/proxy path → Control Plane → ERPNext" … "The journey map must not expose deeper infrastructure mechanics or suggest direct UI-to-ERP access."
- **Journey stage:** Global rule · **Persona:** Engineering · **Trigger:** every data read/write
- **Route:** all · **Surface:** all
- **Desktop/Mobile behavior:** n/a (boundary rule).
- **Required state:** n/a · **Required copy:** UI never exposes ERP internals.
- **Authoritative data source:** as quoted. · **Action contract:** approved chain only.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** all · **Linked assets:** n/a
- **Current implementation files:** `lib/erpnext/`, `lib/db/`, `actions/*` — boundary held at HEAD.
- **Current status:** exact (protected contract — denylist for all batches)
- **Batch:** all (protected) · **Automated test:** existing adapter tests · **Browser test:** n/a · **Screenshot:** n/a
- **Approval gate:** none

#### JR-3.4-01
- **Source heading:** 3.4 Client interaction boundary
- **Exact source text:** "**MVP:** the client has no direct FitDesk interaction. The client may receive: a booking confirmation; a reminder; an invoice or payment link; a trainer-approved WhatsApp message. The client does not currently: complete FitDesk forms; sign into a client portal; update their profile; interact with FitDesk AI; reply into a FitDesk inbox as part of this journey."
- **Journey stage:** Global rule · **Persona:** Client (excluded) · **Trigger:** n/a
- **Route:** none (no client-facing routes may be built) · **Surface:** none
- **Desktop/Mobile behavior:** no client-facing UI in MVP.
- **Required state/copy:** n/a
- **Authoritative data source:** n/a · **Action contract:** outbound-only messaging.
- **Confirmation requirement:** trainer approval for every outbound artifact.
- **Recovery requirement:** n/a
- **Linked sitemap node:** none · **Linked assets:** none
- **Current implementation files:** no client portal exists at HEAD — compliant.
- **Current status:** exact (absence is the requirement)
- **Batch:** all (guard) · **Tests:** n/a · **Approval gate:** FUTURE portal is PO-decision (JR-21 rows)

#### JR-3.5-01
- **Source heading:** 3.5 Mobile interaction boundary
- **Exact source text:** "Mobile uses bottom sheets and focused flows. Desktop may use drawers, split views, or contextual rails. Critical actions must never be gesture-only. Every swipe affordance has a visible control. One primary action should lead each state."
- **Journey stage:** Global rule · **Persona:** Trainer · **Trigger:** every interactive surface
- **Route:** all · **Surface:** sheets (mobile), drawers/split views/rails (desktop)
- **Desktop behavior:** drawers/split views/contextual rails. · **Mobile behavior:** bottom sheets, focused flows.
- **Required state:** one primary action leads each state.
- **Required copy:** n/a
- **Authoritative data source:** n/a · **Action contract:** n/a
- **Confirmation requirement:** critical actions have visible non-gesture controls.
- **Recovery requirement:** n/a
- **Linked sitemap node:** all · **Linked assets:** A02 (component library), all mobile assets
- **Current implementation files:** `components/ui/` sheet primitives exist; per-surface compliance re-verified per batch.
- **Current status:** partial
- **Batch:** B1 + all surface batches · **Automated test:** n/a · **Browser test:** gesture-alternative controls present · **Screenshot:** per surface mobile viewport
- **Approval gate:** PO-visual per batch

#### JR-3.6-01
- **Source heading:** 3.6 Session completion terminology
- **Exact source text:** "**Progress update / Session progress** = a brief entry made during one session's completion. **Progress report** = a formal multi-session or period-based report and is future/approval-gated. The completion UI uses progressive disclosure so package clients never see irrelevant payment controls and pay-per-session clients do not leave the flow to record Paid Now."
- **Journey stage:** Session completion · **Persona:** Trainer · **Trigger:** completing a session
- **Route:** completion sheet (contextual) · **Surface:** SessionCompletionSheet
- **Desktop behavior:** progressive disclosure per billing mode. · **Mobile behavior:** same, bottom sheet.
- **Required state:** package mode hides payment controls; PPS mode keeps Paid Now inline.
- **Required copy:** labels "Session progress" / "Progress update" (never "Progress report" for the per-session field).
- **Authoritative data source:** session + billing mode. · **Action contract:** completion service.
- **Confirmation requirement:** per JR-5.5 rows.
- **Recovery requirement:** per JR-5.6 rows.
- **Linked sitemap node:** Schedule → Session Completion (contextual) · **Linked assets:** A80
- **Current implementation files:** `features/scheduling/` + `components/scheduling/` completion surfaces; naming compliance to verify in B9.
- **Current status:** partial
- **Batch:** B9 · **Automated test:** billing-mode branch rendering · **Browser test:** package vs PPS disclosure · **Screenshot:** A80 comparison
- **Approval gate:** PO-visual

#### JR-3.7-01
- **Source heading:** 3.7 Operational recovery doctrine
- **Exact source text:** "FitDesk preserves the intended plan, detects when reality diverges, explains exactly what is affected, and coordinates safe recovery through canonical workflows—without silently cancelling sessions, messaging clients, changing accounting truth, or inventing a parallel operational system." … "Every consequential block, warning, recommendation, disruption, and policy change must identify: What happened / Why it happened / Which records are affected / What remains authoritative / What is uncertain / What the trainer may safely do next. Undo is permitted only for truly reversible local actions. Authoritative, financial, or externally visible effects use review, correction, or compensating-action flows."
- **Journey stage:** Global rule · **Persona:** Trainer · **Trigger:** every block/warning/disruption
- **Route:** all resolvers · **Surface:** resolver/state library
- **Desktop/Mobile behavior:** six-part explainability structure in every consequential surface.
- **Required state:** explainable block/warning states.
- **Required copy:** the six-part structure (What happened … safely do next).
- **Authoritative data source:** derived from authoritative records.
- **Action contract:** canonical workflows only; no parallel system.
- **Confirmation requirement:** review before recovery mutations.
- **Recovery requirement:** correction / compensating-action flows, never silent undo of authoritative effects.
- **Linked sitemap node:** shared resolver library · **Linked assets:** A81
- **Current implementation files:** no shared explainability/resolver library at HEAD; ad-hoc per-surface errors only.
- **Current status:** missing
- **Batch:** B14 · **Automated test:** resolver renders six-part structure · **Browser test:** yes · **Screenshot:** A81 comparison
- **Approval gate:** PO-visual

#### JR-3.8-01
- **Source heading:** 3.8 FitDesk intelligence doctrine
- **Exact source text:** "Use deterministic code when the answer or sequence is knowable. Use an LLM workflow when natural language must be interpreted, structured, summarized, or drafted. Use a bounded agent only when the model must choose among approved tools or continue a controlled conversation." … "AI proposal ≠ domain-valid result ≠ trainer approval ≠ authoritative mutation ≠ confirmed outcome. The pilot has no unrestricted AI memory, raw SQL, general database access, ERP credentials, shell/browser tools, general-purpose write tools, or multi-agent architecture."
- **Journey stage:** Global rule · **Persona:** Engineering · **Trigger:** any AI feature work
- **Route:** AI features · **Surface:** AI features
- **Desktop/Mobile behavior:** n/a (doctrine)
- **Required state/copy:** n/a
- **Authoritative data source:** n/a · **Action contract:** classification quoted in source (workflows vs bounded agents vs deterministic).
- **Confirmation/Recovery:** per JR-3.1-01.
- **Linked sitemap node:** n/a · **Linked assets:** n/a
- **Current implementation files:** `features/clients/` ai-parse path (Quick Add parsing) — within doctrine.
- **Current status:** governance
- **Batch:** guard for any AI batch work · **Tests:** n/a · **Approval gate:** PO-decision for any new AI feature

## Section 4 — Daily Operating Journey — Executive Layer

#### JR-4.1-01
- **Source heading:** 4.1 Daily objective
- **Exact source text:** "The trainer opens FitDesk to answer, within seconds: 1. What is happening today? 2. What needs attention? 3. Why does it matter? 4. What safe action should happen next? 5. Which client or revenue risk is developing?"
- **Journey stage:** D1 Open · **Persona:** Trainer · **Trigger:** opening the app
- **Route:** `/dashboard` · **Surface:** Dashboard
- **Desktop behavior:** dashboard answers all five questions above the fold hierarchy. · **Mobile behavior:** same questions, Today first.
- **Required state:** populated/sparse/empty honest states.
- **Required copy:** n/a (structural)
- **Authoritative data source:** dashboard read/derive path (JR-6.1-01).
- **Action contract:** read-only.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Dashboard · **Linked assets:** A10, A11, A45, A46, A76
- **Current implementation files:** `app/dashboard/page.tsx`, `lib/dashboard/derive.ts`, dashboard feature components.
- **Current status:** partial (dashboard exists; hierarchy/visual not per assets)
- **Batch:** B6 · **Automated test:** derive tests (exist) · **Browser test:** five-question hierarchy present · **Screenshot:** A10/A11 desktop, A45/A46 mobile
- **Approval gate:** PO-visual

#### JR-4.2-01
- **Source heading:** 4.2 Daily operating spine
- **Exact source text:** (sequence diagram) "Trainer→FitDesk: Open Dashboard … FitDesk→ERP: Read verified operational state through approved chain … ERP→FitDesk: Confirmed, partial, unavailable, or failed state … FitDesk→Trainer: Today + Needs Attention + truthful system state … alt First-time or sparse workspace: FitDesk→Trainer: One contextual activation action … else Populated operating day: Trainer→FitDesk: Open next session or attention item …" (full spine at source lines 307–358)
- **Journey stage:** D1–D9 spine · **Persona:** Trainer · **Trigger:** daily open
- **Route:** `/dashboard` and contextual flows · **Surface:** Dashboard → contextual sheets
- **Desktop behavior:** spine sequence navigable as diagrammed. · **Mobile behavior:** same.
- **Required state:** Confirmed / partial / unavailable / failed read states surfaced truthfully; first-time vs populated branching.
- **Required copy:** n/a
- **Authoritative data source:** approved read chain.
- **Action contract:** outcome flows per JR-5.5; outbound per JR-5.9.
- **Confirmation requirement:** all mutations confirmed-first.
- **Recovery requirement:** deferred outcomes loop back via Needs Attention.
- **Linked sitemap node:** Dashboard, Schedule, Client Hub · **Linked assets:** A10, A11, A80
- **Current implementation files:** `app/dashboard/page.tsx` + scheduling flows.
- **Current status:** partial
- **Batch:** B6, B7, B9 · **Automated test:** state branches in derive · **Browser test:** sparse vs populated branch · **Screenshot:** per state
- **Approval gate:** PO-visual

#### JR-4.3-01
- **Source heading:** 4.3 Daily journey stages
- **Exact source text:** (11-row stage table) "Open the day | See today's reality quickly | Stable dashboard shell with explicit loading/partial/unavailable/ready state | MVP — NEEDS UPGRADE / Modernization Stage 1" … "Reduce admin | Prepare the next action | Prepared Action shown before execution | APPROVAL-GATED / Dashboard Stage 7" (full table at source lines 362–374)
- **Journey stage:** D1–D11 index · **Persona:** Trainer · **Trigger:** n/a (index)
- **Route:** per stage rows below · **Surface:** per stage
- **Desktop/Mobile behavior:** expanded per JR-5.x rows.
- **Required state:** per-stage statuses as quoted (two stages APPROVAL-GATED: Retain/Client Pulse, Reduce admin/Prepared Actions).
- **Required copy:** n/a
- **Authoritative data source / Action contract / Confirmation / Recovery:** per stage rows.
- **Linked sitemap node:** Dashboard + contextual · **Linked assets:** per stage
- **Current implementation files:** per stage rows.
- **Current status:** governance (index row; statuses tracked per JR-5.x)
- **Batch:** B6–B9 · **Tests:** per stage · **Approval gate:** Pulse and Prepared Actions are PO-decision

## Section 5 — Daily Operating Journey — Product Layer

#### JR-5.1-01
- **Source heading:** 5.1 Stage D1 — Open Dashboard
- **Exact source text:** "Primary surfaces: Dashboard heading, Daily Brief, Today, Needs Attention, Business Health, Quick Actions; desktop command palette after canonical actions are stable." … "Required product behavior: Render a stable shell; distinguish loading, unavailable, partial, error, empty, sparse, and populated states." … "Forbidden behavior: Showing zero, 'all clear,' or a Healthy client state when required data did not load." … "Mobile pattern: Today first, then Needs Attention; no permanent right rail. Desktop pattern: Main operational workspace; contextual rail only when useful."
- **Journey stage:** D1 · **Persona:** Trainer · **Trigger:** open app / return to dashboard
- **Route:** `/dashboard` · **Surface:** Dashboard page
- **Desktop behavior:** main workspace with Dashboard heading, Daily Brief, Today, Needs Attention, Business Health, Quick Actions; contextual rail only when useful; command palette deferred until canonical actions stable.
- **Mobile behavior:** Today first, then Needs Attention; no permanent right rail.
- **Required state:** loading, unavailable, partial, error, empty, sparse, populated — all seven distinguished.
- **Required copy:** never "all clear"/zero/Healthy when data did not load.
- **Authoritative data source:** dashboard read/derive path.
- **Action contract:** read-only; Quick Actions launch canonical flows.
- **Confirmation requirement:** n/a (read surface).
- **Recovery requirement:** unavailable/partial states honest with retry.
- **Linked sitemap node:** Dashboard · **Linked assets:** A10, A11, A45, A46, A76
- **Current implementation files:** `app/dashboard/page.tsx`, `lib/dashboard/derive.ts`, `features/dashboard/`.
- **Current status:** partial (states exist in part; seven-state model + section set + hierarchy not per source/assets)
- **Batch:** B6 · **Automated test:** seven-state rendering · **Browser test:** forced unavailable/partial states · **Screenshot:** A10/A11/A45/A46 comparison
- **Approval gate:** PO-visual

#### JR-5.2-01
- **Source heading:** 5.2 Stage D2 — Review Today
- **Exact source text:** "Today should show: upcoming sessions; the current/live session when supported; recently ended sessions; past sessions whose outcome is unresolved; an honest empty-day state. The trainer should not need to visit every client profile to understand the schedule."
- **Journey stage:** D2 · **Persona:** Trainer · **Trigger:** dashboard view
- **Route:** `/dashboard` · **Surface:** Today section
- **Desktop behavior:** Today list with the five content classes. · **Mobile behavior:** Today first on screen.
- **Required state:** honest empty-day state; unresolved past sessions visible.
- **Required copy:** n/a
- **Authoritative data source:** session repository via dashboard reads.
- **Action contract:** items open session context (read → contextual flow).
- **Confirmation/Recovery:** n/a (read)
- **Linked sitemap node:** Dashboard → Today · **Linked assets:** A11, A46
- **Current implementation files:** dashboard Today/Timeline components (`features/dashboard/`).
- **Current status:** partial
- **Batch:** B6 · **Automated test:** content-class inclusion · **Browser test:** empty vs populated day · **Screenshot:** A11/A46
- **Approval gate:** PO-visual

#### JR-5.3-01
- **Source heading:** 5.3 Stage D3 — Review Needs Attention
- **Exact source text:** "Transactional items belong here, including verified: unresolved session outcomes; overdue or unpaid invoice risk; missing next session for an active client with prior activity; other confirmed operational blockers." … "Needs Attention must remain finite and prioritized. It should not become an alert wall. Each item opens a focused **resolver**, not a passive detail page: Why this item exists → one primary recommended action → relevant secondary action(s) → review → confirm → verified result → reveal the next unresolved priority. The recommendation is deterministic and state-derived first. AI may explain or prepare copy, but it never chooses or executes the mutation."
- **Journey stage:** D3 · **Persona:** Trainer · **Trigger:** attention items exist
- **Route:** `/dashboard` + resolver overlays · **Surface:** Needs Attention section + resolvers
- **Desktop behavior:** prioritized finite list; each item opens a resolver drawer/sheet. · **Mobile behavior:** same via bottom sheet.
- **Required state:** resolver seven-step grammar (quoted).
- **Required copy:** "Why this item exists" leading each resolver.
- **Authoritative data source:** deterministic derive of verified conditions.
- **Action contract:** resolver primary/secondary actions call canonical actions.
- **Confirmation requirement:** confirm step inside resolver.
- **Recovery requirement:** verified result then next priority revealed.
- **Linked sitemap node:** Dashboard → Needs Attention; shared resolver library · **Linked assets:** A10, A11, A81
- **Current implementation files:** Action Center components in `features/dashboard/`; no unified resolver grammar.
- **Current status:** partial (attention list exists; resolver grammar missing)
- **Batch:** B6 + B14 · **Automated test:** priority ordering; resolver step grammar · **Browser test:** resolve-one-reveal-next loop · **Screenshot:** A81 + A10
- **Approval gate:** PO-visual
- **Note:** "Future or approval-gated additions include: low package balance thresholds; cancellation-risk signals; trainer-approved communication follow-up prompts." → future-gated; do not implement in B6 without PO-decision.

#### JR-5.4-01
- **Source heading:** 5.4 Stage D4 — Prepare for the Next Client
- **Exact source text:** "The trainer opens a session or client context and sees only what is useful now: client identity; primary goal; safety state; recent note; billing mode; package or payment context; next session state."
- **Journey stage:** D4 · **Persona:** Trainer · **Trigger:** open next session/client
- **Route:** Client Hub / session context · **Surface:** client context panel or session sheet
- **Desktop behavior:** context panel with the seven items. · **Mobile behavior:** focused context sheet.
- **Required state:** only-what-is-useful-now filtering.
- **Required copy:** n/a
- **Authoritative data source:** client + safety + billing + session reads.
- **Action contract:** read; links to canonical flows.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Clients → Client Hub · **Linked assets:** A05, A08, A40, A41
- **Current implementation files:** `app/dashboard/clients/[id]/page.tsx` + `features/clients/` hub components.
- **Current status:** partial
- **Batch:** B8 · **Automated test:** context assembly · **Browser test:** context items present · **Screenshot:** A05/A40
- **Approval gate:** PO-visual
- **Note:** Pilot Pre-Session Client Brief ("Deterministic source assembly → optional constrained summarization → source-linked mobile brief… The structured brief remains usable if summarization fails.") → future-gated (pilot; PO-decision before build).

#### JR-5.5-01
- **Source heading:** 5.5 Stage D5 — Complete the Session in One Contextual Flow
- **Exact source text:** "The session outcome choices remain: Completed / No Show / Cancelled / Rescheduled. When **Completed** is selected, FitDesk keeps the trainer in the same URL-backed sheet/drawer and progressively reveals only what is relevant:" (flowchart lines 475–500: Select Completed → Add quick session progress → Billing mode → Package: Preview package unit deduction → Review progress + remaining balance | Pay per session: Preview session invoice → Paid Now: Choose payment method and confirm amount / Pay Later: Leave invoice outstanding | Trial: No billing mutation | Unset / Decide later: Fail closed or create billing follow-up → One completion summary → Trainer confirms → Persist outcome, progress, and conditional financial effects → Refresh Session, Client Hub, Invoice/Package state, and Dashboard)
- **Journey stage:** D5 · **Persona:** Trainer · **Trigger:** recording an outcome
- **Route:** URL-backed completion sheet/drawer (contextual from Schedule/Dashboard/Client Hub) · **Surface:** SessionCompletionSheet
- **Desktop behavior:** drawer, progressive disclosure per billing mode. · **Mobile behavior:** bottom sheet, same flow.
- **Required state:** four outcome choices; billing-mode branches (Package / Pay per session / Trial / Unset); one completion summary; URL-backed.
- **Required copy:** outcome labels "Completed", "No Show", "Cancelled", "Rescheduled"; "Paid Now" / "Pay Later".
- **Authoritative data source:** session + billing mode + package/invoice preview.
- **Action contract:** JR-6.3-01 path.
- **Confirmation requirement:** items 1–6 quoted: "1. Explain what will change. 2. Keep the quick progress update and the applicable financial decision in the same window. 3. Show package, invoice, and payment consequences before mutation. 4. Require explicit trainer confirmation. 5. Wait for authoritative success or show the exact recoverable step that failed. 6. Update the dashboard and Client Hub after confirmation."
- **Recovery requirement:** exact failed step shown; loop-back per JR-5.6-01.
- **Linked sitemap node:** Schedule → Session Completion (contextual workflow) · **Linked assets:** A80
- **Current implementation files:** completion components under `features/scheduling/` + `actions/schedulingActions.ts`, `lib/scheduling/sessionCompletionService.ts` (protected).
- **Current status:** partial (flow exists; unified progressive-disclosure UX is APPROVED JOURNEY REQUIREMENT; visual not per A80)
- **Batch:** B9 · **Automated test:** billing-mode branch tests · **Browser test:** all four outcomes + all billing branches · **Screenshot:** A80
- **Approval gate:** PO-visual
- **Note:** Pilot Text-to-Structured Session Completion ("Short trainer text → structured progress draft → source evidence and uncertainty → safety-signal highlighting → trainer edits → canonical completion review… Parsing never completes the session, clears safety, consumes a package, creates an invoice, records payment, or updates a program.") → future-gated (pilot).

#### JR-5.5-02
- **Source heading:** 5.5 (progress content)
- **Exact source text:** "The per-session field is called **Session progress** or **Progress update**." … "Progress should be fast: a brief trainer note; performance, measurement, or milestone; pain, safety, or recovery concern; recommended focus for the next session." … "A long narrative is not required. Safety-relevant entries may require acknowledgment before completion."
- **Journey stage:** D5 · **Persona:** Trainer · **Trigger:** Completed selected
- **Route:** completion sheet · **Surface:** progress entry inside completion
- **Desktop/Mobile behavior:** quick structured progress entry inside the same window.
- **Required state:** safety-relevant entries may gate completion on acknowledgment.
- **Required copy:** field labeled "Session progress" / "Progress update".
- **Authoritative data source:** progress persistence path (VERIFY AT ADOPTION per source 6.3).
- **Action contract:** completion service.
- **Confirmation requirement:** part of one completion summary.
- **Recovery requirement:** per JR-5.5-01.
- **Linked sitemap node:** Session Completion · **Linked assets:** A80
- **Current implementation files:** completion progress inputs in `features/scheduling/`.
- **Current status:** partial
- **Batch:** B9 · **Automated test:** safety-ack gate · **Browser test:** progress entry inline · **Screenshot:** A80
- **Approval gate:** PO-visual

#### JR-5.6-01
- **Source heading:** 5.6 Stage D6 — Unresolved-Outcome Loop-Back
- **Exact source text:** "Rules: An unresolved session must not disappear. The trainer must be able to return later without guessing what happened. Batch recovery may exist, but every item remains independently guarded. Duplicate completion/package/invoice effects must be prevented. A failed item must not silently mark the rest successful." (flowchart lines 546–557: Session ends → time now? Yes: contextual outcome flow → progress + conditional billing → one completion summary → authoritative result; No: leave unresolved → appears in Needs Attention → same completion flow later)
- **Journey stage:** D6 · **Persona:** Trainer · **Trigger:** outcome deferred
- **Route:** Dashboard → Needs Attention → same completion sheet · **Surface:** attention item + completion sheet
- **Desktop/Mobile behavior:** identical completion flow re-entered from attention item.
- **Required state:** unresolved session persistent until resolved; duplicate-effect prevention.
- **Required copy:** n/a
- **Authoritative data source:** session repository.
- **Action contract:** same completion path (no parallel flow).
- **Confirmation requirement:** per JR-5.5-01.
- **Recovery requirement:** independent guarding per item in any batch recovery.
- **Linked sitemap node:** Dashboard → Needs Attention; Session Completion · **Linked assets:** A80, A81
- **Current implementation files:** unresolved-session attention items in dashboard derive; completion re-entry exists.
- **Current status:** partial
- **Batch:** B6 + B9 · **Automated test:** idempotency/duplicate-effect tests (exist in scheduling suite) · **Browser test:** defer-then-resolve loop · **Screenshot:** attention item + sheet
- **Approval gate:** none

#### JR-5.7-01
- **Source heading:** 5.7 Stage D7 — Protect Revenue
- **Exact source text:** (billing-mode table, lines 571–576) "Package | Show the package and before/after balance beside the progress update. No payment form appears by default. | Consume the correct package session according to package rules. — Pay per session | Preview the auto-generated session invoice, then ask **Paid Now** or **Pay Later**. | Create the invoice only after completion. — Trial | Show that no charge will be created. | No billing mutation. — Decide later / unset | Explain that billing is unresolved. | Fail closed or surface a billing-setup action; never invent a charge."
- **Journey stage:** D7 · **Persona:** Trainer · **Trigger:** Completed within each billing mode
- **Route:** completion sheet · **Surface:** billing branch of completion
- **Desktop/Mobile behavior:** as table — before/after balance beside progress (package); invoice preview + Paid Now/Pay Later (PPS); no-charge notice (trial); fail-closed explain (unset).
- **Required state:** four billing-mode branches, each with quoted behavior.
- **Required copy:** "Paid Now" / "Pay Later"; no-charge and unresolved-billing explanations.
- **Authoritative data source:** package/invoice services.
- **Action contract:** invoice created only after completion; package consumed per rules; never invent a charge.
- **Confirmation requirement:** consequences shown before mutation.
- **Recovery requirement:** billing-setup follow-up action for unset mode.
- **Linked sitemap node:** Session Completion · **Linked assets:** A80
- **Current implementation files:** completion billing branches in `features/scheduling/` + billing services (protected).
- **Current status:** partial
- **Batch:** B9 · **Automated test:** four-branch behavior (exists in part) · **Browser test:** each mode · **Screenshot:** A80 per branch
- **Approval gate:** PO-visual

#### JR-5.8-01
- **Source heading:** 5.8 Stage D8 — Record or Defer Payment
- **Exact source text:** "Paid Now → choose an available payment method → confirm amount and optional reference → record authoritative payment" … "Pay Later → complete the session → create the invoice → leave it visibly outstanding → collect later from the invoice or dashboard attention flow" … "Unknown or unavailable financial data must be explained. It must not be replaced with a false Cash state. For package clients, the completion sheet normally shows progress plus package consumption only. Package purchase/payment remains owned by package assignment or renewal, not by routine session completion."
- **Journey stage:** D8 · **Persona:** Trainer · **Trigger:** PPS completion payment decision
- **Route:** completion sheet · **Surface:** payment step inside completion
- **Desktop/Mobile behavior:** method choice + amount confirm inline (Paid Now); visible outstanding invoice (Pay Later).
- **Required state:** unknown financial data explained, never false Cash.
- **Required copy:** as quoted.
- **Authoritative data source:** ERP payment entry via `actions/invoices.ts` recordPayment.
- **Action contract:** same payment mutation contract as invoice surface (JR-6.6-01).
- **Confirmation requirement:** amount + method confirm before record.
- **Recovery requirement:** collect later via invoice or attention flow.
- **Linked sitemap node:** Session Completion; Billing · **Linked assets:** A80
- **Current implementation files:** `app/dashboard/invoices/[id]/pay/page.tsx` exists as separate route — integrated completion placement is VERIFY AT ADOPTION per source 4.3.
- **Current status:** partial
- **Batch:** B9 (+B11 shared contract) · **Automated test:** payment record path (exists) · **Browser test:** Paid Now inline; Pay Later outstanding · **Screenshot:** A80
- **Approval gate:** PO-visual

#### JR-5.9-01
- **Source heading:** 5.9 Stage D9 — Follow Up
- **Exact source text:** "MVP communication is outbound only." … "No diagram should show the client replying into FitDesk in the MVP. All outbound entry points reuse one canonical message composer and send contract: Dashboard / Client Hub / Session / Invoice / Package → same contextual composer → same consent check → same editable draft → same trainer confirmation → same send result → global Sent Messages log + client activity timeline"
- **Journey stage:** D9 · **Persona:** Trainer · **Trigger:** follow-up need from any entry point
- **Route:** contextual composer (all listed entry points); Inbox for log · **Surface:** canonical message composer
- **Desktop behavior:** one composer component reused across entry points. · **Mobile behavior:** same composer as sheet.
- **Required state:** consent check precedes draft; send result logged globally + per client.
- **Required copy:** editable draft, explicit confirmation.
- **Authoritative data source:** consent state + fact bundle.
- **Action contract:** approved outbound path (`actions/whatsapp.ts` / messages).
- **Confirmation requirement:** trainer confirms recipient + message.
- **Recovery requirement:** send failures visible (JR-25.5-01).
- **Linked sitemap node:** Inbox; contextual composer entry points · **Linked assets:** A06, A12, A13, A50, A51, A77
- **Current implementation files:** `app/dashboard/messages/[clientId]/page.tsx`, `actions/messages.ts`, `actions/whatsapp.ts`; no single canonical composer reused across all five entry points; no global Sent Messages log surface.
- **Current status:** partial
- **Batch:** B10 · **Automated test:** composer contract reuse · **Browser test:** entry-point reuse + send result · **Screenshot:** A12/A13
- **Approval gate:** PO-visual
- **Note:** Pilot Contextual Message Copilot ("may prepare wording from a verified fact bundle. Dates, balances, package units, invoice references, locations, and policy facts remain locked to authoritative sources and are checked again before send.") → future-gated (pilot).

#### JR-5.10-01 (FUTURE-GATED)
- **Source heading:** 5.10 Stage D10 — Client Pulse Lite
- **Exact source text:** "**PILOT / DETERMINISTIC READ MODEL**" … "Pilot states: Clear / Needs review / Unknown" … "Mandatory rules: `Unknown` is distinct from `Clear`. Pulse is derived from authoritative records and is never a new source of truth. The pilot uses no numerical risk score, prediction, character label, or AI-assigned state. Each signal exposes evidence, freshness, unavailable sources, and one canonical safe action. Safety and uncertain operations outrank commercial recommendations. Pulse never changes a client status, clears a concern, mutates a package, books, pays, or sends." (priority list lines 667–678)
- **Journey stage:** D10 · **Persona:** Trainer · **Trigger:** pilot enablement (APPROVAL-GATED per 4.3 "Retain" row)
- **Route:** Dashboard / Client Hub Pulse surfaces · **Surface:** Pulse chips/panels
- **Status ruling:** APPROVAL-GATED pilot — **excluded from B0–B15 implementation**; recorded to prevent silent invention or accidental scope creep.
- **Linked sitemap node:** Dashboard (future), Client Hub (future) · **Linked assets:** none dedicated (conflict check in asset matrix)
- **Current implementation files:** none.
- **Current status:** future-gated
- **Batch:** none (out of scope) · **Approval gate:** PO-decision

#### JR-5.11-01 (FUTURE-GATED)
- **Source heading:** 5.11 Stage D11 — Prepared Actions
- **Exact source text:** "**PILOT FOUNDATION / BROADER AUTONOMY APPROVAL-GATED**. Pilot Prepared Actions are proposals inside existing canonical flows: Contextual message draft / Follow-up extracted from progress / Workout or exercise revision draft / Quick Add client draft / Booking draft. The first financial example remains: Overdue invoice → existing reminder path → verified fact bundle → AI-prepared editable draft → full preview → explicit confirmation → approved outbound send path. The missing-next-session suggested-slot flow remains later because it changes scheduling behavior."
- **Journey stage:** D11 · **Persona:** Trainer · **Trigger:** pilot enablement
- **Status ruling:** APPROVAL-GATED — excluded from B0–B15 implementation; recorded to prevent invention.
- **Linked sitemap node:** contextual flows (future) · **Linked assets:** none dedicated
- **Current implementation files:** none.
- **Current status:** future-gated
- **Batch:** none · **Approval gate:** PO-decision

## Section 6 — Daily Operating Journey — Verified Engineering Layer

#### JR-6.1-01 (PROTECTED CONTRACT)
- **Source heading:** 6.1 Dashboard read/derive path
- **Exact source text:** "app/dashboard/page.tsx → dashboard data reads → lib/dashboard/derive.ts → DashboardView / ActionCenter / BusinessHealth / related presentation. Responsibilities: Route/server layer obtains authorized tenant-scoped data. `derive.ts` produces deterministic attention and health summaries. Presentation renders explicit operational states. No dashboard display action mutates financial or scheduling state."
- **Ruling:** protected read path — B6 restyles presentation only; derive and data reads unchanged.
- **Current implementation files:** `app/dashboard/page.tsx`, `lib/dashboard/derive.ts` — present.
- **Current status:** exact (contract) · **Batch:** B6 seam definition · **Approval gate:** none

#### JR-6.2-01 (PROTECTED CONTRACT)
- **Source heading:** 6.2 Booking path
- **Exact source text:** "BookingSheet → actions/schedulingActions.ts → lib/scheduling/engine.ts for pure validation/planning → lib/scheduling/bookingService.ts → lib/scheduling/sessionRepository.ts → approved ERP proxy path. The engine remains: conflict-aware; DST-safe; package-aware; recurrence-aware; structured in its conflict responses."
- **Ruling:** protected mutation path — B7 restyles BookingSheet presentation only; engine/service/repository and action contracts unchanged (contract file denylist).
- **Current implementation files:** all five files present at HEAD.
- **Current status:** exact (contract) · **Batch:** B7 seam definition · **Approval gate:** none

#### JR-6.3-01 (PROTECTED CONTRACT)
- **Source heading:** 6.3 Session-outcome and progress path
- **Exact source text:** "URL-backed SessionCompletionSheet or outcome surface → actions/schedulingActions.ts → lib/scheduling/sessionCompletionService.ts → session progress persistence/event path [VERIFY AT ADOPTION] → lib/scheduling/sessionRepository.ts → approved package or invoice service when required → approved payment-recording action when Paid Now is selected → approved ERP proxy path. The action/orchestration boundary must preserve: immutable-status guards; version and idempotency checks; billing-mode branch behavior; package/invoice hooks; progress ownership and auditability; Paid Now / Pay Later choice for pay-per-session clients; confirmed-first UI; explicit partial-failure recovery. **One window does not mean one opaque cross-system transaction.**"
- **Ruling:** protected — B9 restyles the sheet; orchestration boundary unchanged.
- **Current implementation files:** path present; progress persistence flagged VERIFY AT ADOPTION → verified in B9 audit step.
- **Current status:** exact (contract; one VERIFY item) · **Batch:** B9 · **Approval gate:** none

#### JR-6.4-01 (PROTECTED CONTRACT)
- **Source heading:** 6.4 Add Client path
- **Exact source text:** "AddClientSheet / AddClientForm → actions/clients.ts → approved ERP Customer creation path → ERP proxy / Control Plane / ERPNext → tenant-scoped local client repository writes → Client Hub success state. No invoice, payment, WhatsApp send, session, or program is created by identity creation itself."
- **Ruling:** protected — B8 restyles forms/sheets; creation chain unchanged.
- **Current implementation files:** `app/dashboard/clients/new/page.tsx`, `actions/clients.ts` — present.
- **Current status:** exact (contract) · **Batch:** B8 · **Approval gate:** none

#### JR-6.5-01 (PROTECTED CONTRACT)
- **Source heading:** 6.5 Package assignment path
- **Exact source text:** "Add Client success CTA → Client Hub → AssignPackageSheet → assignPackage server action → package assignment service/repository → approved ERP invoice path → confirmed package and invoice state"
- **Ruling:** protected — presentation seam only.
- **Current implementation files:** `actions/packages.ts` + assignment sheet in `features/billing|clients`.
- **Current status:** exact (contract) · **Batch:** B8/B11 · **Approval gate:** none

#### JR-6.6-01 (PROTECTED CONTRACT)
- **Source heading:** 6.6 Payment path
- **Exact source text:** "Pay-per-session completion flow when Paid Now is selected or later Invoice payment surface → actions/invoices.ts recordPayment → approved ERP client/proxy → ERP Payment Entry → confirmed invoice/payment refresh. The same payment mutation contract is reused; the completion sheet is a contextual entry point, not a second payment implementation."
- **Ruling:** protected — one payment contract, two entry points; B9/B11 must not fork it.
- **Current implementation files:** `actions/invoices.ts` — present.
- **Current status:** exact (contract) · **Batch:** B9/B11 · **Approval gate:** none

#### JR-6.7-01
- **Source heading:** 6.7 Client statement-of-account read path
- **Exact source text:** "Client Hub → Statement of account → approved FitDesk ERP client/proxy → ERP-authoritative invoices, payments, credit notes, and outstanding balances → normalized read model / response → summary cards + chronological ledger → canonical Record Payment or Message Composer when action is needed. Rules: ERP remains authoritative for invoices, payments, credits, and outstanding balances. FitDesk may cache or normalize the response, but must expose freshness and unavailable/partial states honestly. A failed or unavailable read must never be rendered as `USD 0`. Statement actions reuse canonical payment and messaging contracts; the statement itself is not a second mutation implementation."
- **Journey stage:** Billing sub-journey · **Persona:** Trainer · **Trigger:** open statement from Client Hub
- **Route:** Client Hub → Statement · **Surface:** statement view (summary cards + ledger)
- **Desktop/Mobile behavior:** expanded in JR-12.5…12.17 rows.
- **Required state:** freshness + unavailable/partial honest; never `USD 0` on failure.
- **Required copy:** per §12 rows.
- **Authoritative data source:** ERP statement read path.
- **Action contract:** canonical Record Payment / composer reuse.
- **Confirmation/Recovery:** per §12 rows.
- **Linked sitemap node:** Client Hub → Billing/Statement · **Linked assets:** A05, A07 (billing panels)
- **Current implementation files:** `actions/statements.ts` (exists, with tests); statement UI in `features/billing/`.
- **Current status:** partial
- **Batch:** B8/B11 · **Automated test:** statement read states (exist) · **Browser test:** degraded read states · **Screenshot:** per §12
- **Approval gate:** PO-visual

#### JR-6.8-01 (PROTECTED CONTRACT / FUTURE-GATED EXECUTION)
- **Source heading:** 6.8 FitDesk Intelligence Layer path
- **Exact source text:** "FitDesk UI → feature-specific Server Action → AI Run Orchestrator → tenant and entity authorization → feature-scoped context builder → versioned prompt + strict output schema → model provider adapter → schema validation → deterministic domain validation → trainer review → canonical FitDesk action → existing domain service/repository → approved ERP proxy path when required. There is no AI-to-execution edge. The pilot model has no write tools."
- **Ruling:** architecture contract for any AI feature; pilot features themselves are gated (JR-20 rows).
- **Current implementation files:** partial (ai-parse for Quick Add in `features/clients/`).
- **Current status:** governance · **Batch:** guard · **Approval gate:** PO-decision per AI feature

#### JR-6.9-01 (PROTECTED CONTRACT)
- **Source heading:** 6.9 AI and outbound messaging path
- **Exact source text:** "Attention item or message action → authoritative fact bundle → draft generation → fact-integrity check → trainer review → confirmation → approved outbound integration → send result logged. The AI may change wording. It may not change authoritative amounts, dates, references, balances, locations, consent state, or policy facts."
- **Ruling:** contract for B10 composer and any AI drafting; fact fields locked.
- **Current implementation files:** outbound path in `actions/whatsapp.ts` (no AI drafting at HEAD).
- **Current status:** governance · **Batch:** B10 guard · **Approval gate:** none (AI drafting itself PO-decision)

## Section 7 — Client Lifecycle — Executive Layer

#### JR-7-01
- **Source heading:** 7. Client Lifecycle — Executive Layer
- **Exact source text:** (flowchart lines 884–920) "Lead or known contact → Trainer creates client → Choose billing mode → Capture goals and safety → Client Hub → Assign package or store session rate → Book first session → Deliver session → Outcome …" … "### Client role in MVP — The client lane is passive and receives confirmed outputs: appointment information; reminders; invoices/payment links; trainer-approved WhatsApp messages. The client does not operate FitDesk directly."
- **Journey stage:** Lifecycle spine · **Persona:** Trainer (Client passive) · **Trigger:** new client
- **Route:** Clients → Client Hub → Schedule → completion · **Surface:** lifecycle across surfaces
- **Desktop/Mobile behavior:** the lifecycle sequence must be completable exactly as diagrammed, each step in its canonical surface.
- **Required state:** outcome branches per JR-5.5-01; billing branches per JR-5.7-01.
- **Required copy:** n/a (structural)
- **Authoritative data source:** per protected paths JR-6.4/6.5/6.2/6.3/6.6.
- **Action contract:** canonical flows only.
- **Confirmation requirement:** per confirmed-first rule.
- **Recovery requirement:** per loop-back rule.
- **Linked sitemap node:** Clients, Client Hub, Schedule, Session Completion · **Linked assets:** A05, A08, A09, A28, A80
- **Current implementation files:** client/scheduling/billing flows at HEAD.
- **Current status:** partial (all steps exist; visual + flow-connection compliance per batches)
- **Batch:** B7–B9 · **Automated test:** lifecycle integration path · **Browser test:** full lifecycle E2E · **Screenshot:** per surface
- **Approval gate:** PO-visual per batch

## Section 8 — Client Lifecycle — Stage Map

#### JR-8-01
- **Source heading:** 8. Client Lifecycle — Stage Map
- **Exact source text:** (12-row stage table, lines 937–950) "Capture | Create identity quickly | … | MVP — MAIN" … "Review account | Understand invoiced, paid, outstanding, and overdue activity for one client | Receives accurate statement or payment reminder when trainer chooses | Show ERP-authoritative summary and ledger without exposing manual invoice creation | MVP / current visual exists; authoritative behavior VERIFY AT ADOPTION" … "Retain | Renew, follow up, reactivate | Receives trainer-led communication | Explain risk and prepare action | APPROVAL-GATED / FUTURE" … "Close/archive | Stop active workflow safely | No further active scheduling | Preserve audit and historical financial records | MVP / verify exact UI"
- **Journey stage:** Lifecycle index · **Persona:** Trainer · **Trigger:** per stage
- **Route:** per stage · **Surface:** per stage
- **Desktop/Mobile behavior:** stage-specific rows below/above govern details.
- **Required state:** **"without exposing manual invoice creation"** — the client statement surface must not offer manual invoice creation (locked product decision).
- **Required copy:** n/a
- **Authoritative data source:** per stage.
- **Action contract:** per stage.
- **Confirmation/Recovery:** per stage.
- **Linked sitemap node:** Clients, Client Hub, Billing · **Linked assets:** A05, A07, A08
- **Current implementation files:** `app/dashboard/invoices/new/page.tsx` exists — manual invoice creation route present at HEAD; statement surface must not expose it (checked in B8/B11).
- **Current status:** partial (Retain stage future-gated; manual-invoice exposure to reconcile — see conflict register CR-06)
- **Batch:** B8, B11 · **Automated test:** statement excludes manual invoice CTA · **Browser test:** yes · **Screenshot:** statement views
- **Approval gate:** PO-visual; Retain stage PO-decision

## Section 9 — First Client Activation Loop

#### JR-9-01
- **Source heading:** 9. First Client Activation Loop
- **Exact source text:** "The required first-time operating journey remains exactly: Add first client → configure billing mode → book first session → dashboard becomes operational"
- **Journey stage:** Activation · **Persona:** Trainer · **Trigger:** workspace ready, zero/sparse data
- **Route:** `/dashboard` (contextual activation), Clients, Schedule · **Surface:** dashboard activation states
- **Desktop/Mobile behavior:** one contextual activation action leads each state (per JR-4.2-01 sparse branch).
- **Required state:** No clients → client-no-session → session-booked progression.
- **Required copy:** see JR-9-02 (verbatim).
- **Authoritative data source:** derived from existing client/billing/goal/package/session state.
- **Action contract:** links to canonical Add Client / billing / booking flows.
- **Confirmation requirement:** n/a (navigation).
- **Recovery requirement:** resumable at any step.
- **Linked sitemap node:** Dashboard (activation states) · **Linked assets:** A10, A11, A45, A46
- **Current implementation files:** dashboard empty/sparse states in `features/dashboard/`.
- **Current status:** partial
- **Batch:** B6 · **Automated test:** activation-state derivation · **Browser test:** three states progression · **Screenshot:** each activation state
- **Approval gate:** PO-visual

#### JR-9-02
- **Source heading:** 9 (contextual activation copy)
- **Exact source text:** No clients: "Add your first client / Set up their billing and book the first session." — Client exists, no session: "Maya is ready to schedule / Book the first session to start the operating loop." — Session booked: "Your first session is on the schedule / FitDesk will surface what needs attention next."
- **Journey stage:** Activation · **Persona:** Trainer · **Trigger:** each activation state
- **Route:** `/dashboard` · **Surface:** activation cards
- **Desktop/Mobile behavior:** copy rendered verbatim ("Maya" = the actual first client's name placeholder).
- **Required state:** three states as quoted.
- **Required copy:** VERBATIM as quoted (client-name substitution only).
- **Authoritative data source:** derived state.
- **Action contract:** each card's primary action launches the named canonical flow.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Dashboard · **Linked assets:** A10/A45 (empty/sparse variants if depicted)
- **Current implementation files:** existing activation copy differs — verbatim compliance required.
- **Current status:** partial (copy not verbatim at HEAD)
- **Batch:** B6 · **Automated test:** copy assertion · **Browser test:** state copy check · **Screenshot:** yes
- **Approval gate:** PO-visual

#### JR-9-03
- **Source heading:** 9 (activation checklist + rules)
- **Exact source text:** "✓ Client created / ✓ Billing mode selected / ○ Package assigned or session rate confirmed / ○ Goals and safety captured / ○ First session booked — This is a compact, resumable checklist derived from existing state. It is not a mandatory wizard and does not require a separate onboarding-state store." … "Rules: Package-template setup is optional and non-blocking. Package templates are reusable trainer-level configuration only. Client-specific package assignment still happens after creation from the Client Hub through `AssignPackageSheet`. Skipping package-template setup never blocks Package, Per-session, or Decide later billing choices. No separate persistent onboarding workflow in the MVP. A contextual activation checklist may be rendered from existing client, billing, goal, package, and session state. No new persistence solely for onboarding UI. One primary action per state. Guidance derives from verified state."
- **Journey stage:** Activation · **Persona:** Trainer · **Trigger:** post-workspace-ready sparse state
- **Route:** `/dashboard` · **Surface:** activation checklist card
- **Desktop/Mobile behavior:** compact resumable checklist; never a blocking wizard.
- **Required state:** checklist items derived, no dedicated persistence.
- **Required copy:** checklist items as quoted.
- **Authoritative data source:** existing client/billing/goal/package/session state only.
- **Action contract:** items link to canonical flows; package templates optional via Settings/Catalog.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Dashboard; Settings → Catalog (templates) · **Linked assets:** A10/A45
- **Current implementation files:** no such checklist at HEAD.
- **Current status:** missing
- **Batch:** B6 · **Automated test:** derivation-without-persistence · **Browser test:** checklist progression · **Screenshot:** yes
- **Approval gate:** PO-visual

## Section 10 — Signup and Workspace Activation

#### JR-10-01
- **Source heading:** 10. Signup and Workspace Activation
- **Exact source text:** (sequence diagram lines 1038–1058) "Trainer→FitDesk: Register and sign in → FitDesk→Trainer: Route to onboarding → Trainer→FitDesk: Start Workspace → FitDesk→CP: Request idempotent provisioning → … → FitDesk→Trainer: Waiting / blocked / failed / completed. alt Completed: Continue to Dashboard. else Failed or blocked: Explain and offer safe retry/recovery."
- **Journey stage:** Signup/Provisioning · **Persona:** Trainer · **Trigger:** registration
- **Route:** `/auth/register`, `/auth/login`, `/onboarding` · **Surface:** auth pages + onboarding/provisioning screens
- **Desktop/Mobile behavior:** full state machine visible: waiting / blocked / failed / completed; Continue to Dashboard on completion; explain + safe retry on failure.
- **Required state:** waiting, blocked, failed, completed (all four).
- **Required copy:** per provisioning assets (A20–A24, A60–A64) and JR-10-02.
- **Authoritative data source:** Control Plane provisioning state (protected contract).
- **Action contract:** `app/api/provisioning/status`, `app/api/workspace/retry` (existing, protected).
- **Confirmation requirement:** Start Workspace explicit action.
- **Recovery requirement:** safe retry/recovery offered on failed/blocked.
- **Linked sitemap node:** Onboarding; Provisioning; Workspace Ready · **Linked assets:** A16, A18, A20–A24, A34, A57, A60–A64, A70, A71, A72
- **Current implementation files:** `app/onboarding/page.tsx`, `components/onboarding/`, `features/onboarding/`, `app/api/provisioning/status/route.ts`, `app/api/workspace/retry/route.ts`.
- **Current status:** partial (flow exists; multi-step onboarding + provisioning state visuals not per assets)
- **Batch:** B3 + B4 · **Automated test:** provisioning state rendering · **Browser test:** all four states (mocked) · **Screenshot:** per state vs assets
- **Approval gate:** PO-visual

#### JR-10-02
- **Source heading:** 10.1 Trainer journey
- **Exact source text:** "Goal: Reach a usable workspace without understanding infrastructure. Entry: Sign in and route to `/onboarding`. Primary action: **Start Workspace**. Required behavior: Idempotent request, authoritative progress, safe refresh/return, clear recovery. Forbidden behavior: Timer-based fake progress, duplicate provisioning, cross-tenant mapping, exposed credentials or internal container details. Completion: Workspace ready → trainer enters activation loop."
- **Journey stage:** Provisioning · **Persona:** Trainer · **Trigger:** first sign-in
- **Route:** `/onboarding` · **Surface:** onboarding + provisioning progress
- **Desktop/Mobile behavior:** authoritative progress; safe refresh/return preserves state.
- **Required state:** idempotent start; progress from authoritative state only.
- **Required copy:** primary action labeled "Start Workspace".
- **Authoritative data source:** Control Plane job state.
- **Action contract:** idempotent provisioning request (protected).
- **Confirmation requirement:** explicit Start Workspace.
- **Recovery requirement:** clear recovery; never fake progress.
- **Linked sitemap node:** Onboarding · **Linked assets:** A16–A19, A54–A59, A72
- **Current implementation files:** as JR-10-01.
- **Current status:** partial
- **Batch:** B3/B4 · **Automated test:** no timer-based progress; idempotency (existing CP tests protected) · **Browser test:** refresh-safe progress · **Screenshot:** yes
- **Approval gate:** PO-visual

#### JR-10-03 (GOVERNANCE)
- **Source heading:** 10.2 Current handover state
- **Exact source text:** "The clean development reset is complete for the affected six test users: zero `WorkspaceProvisioning` rows; stale tenant references cleared; no cross-tenant mapping; working production users untouched. The immediate product validation flow is: Log in → go to /onboarding → Start Workspace → validate provisioning → proceed to first-client activation"
- **Ruling:** operational handover context, not a UI requirement; defines the B3/B4 QA validation sequence.
- **Current status:** governance · **Batch:** B4 QA script · **Approval gate:** none

## Section 11 — Connected Master Journey

#### JR-11-01 (GOVERNANCE)
- **Source heading:** 11. Connected Master Journey
- **Exact source text:** (master flowchart lines 1098–1166 connecting First-time activation → Daily operating loop → Retention subgraphs; including "AR → NX{Highest-priority next action}: Partial failure → Recover the failed step / Safety concern → Review safety / Package exhausted → Renew or assign package / Payment outstanding → Collect or send payment reminder / Otherwise → Book next session"; Client Pulse and Prepared Actions marked APPROVAL-GATED dotted edges)
- **Ruling:** integrative index of previously mapped requirements; the post-completion "highest-priority next action" branch set is implementable and is covered by JR-13.8 rows (next-session focus loop) and JR-5.3-01 (priority queue). No unique new requirement beyond cross-linking; acceptance E2E (B15) must walk this master path.
- **Linked sitemap node:** all core nodes · **Linked assets:** A11, A80
- **Current status:** governance · **Batch:** B15 acceptance walk · **Approval gate:** none

## Section 12 — Add Client and Billing Handoff

#### JR-12.1-01
- **Source heading:** 12.1 Add Client flow
- **Exact source text:** (flowchart lines 1176–1203) "Open Add Client → Use Quick Add from Text? → No: Step 1: Name + phone + WhatsApp preference → Normalize phone and check tenant-scoped duplicates → Possible duplicate? Yes: Open existing / Continue with reason / Cancel → Step 2: Billing mode → Package: Store Package intent only / Per-session: Store default session rate / Decide later: Store unset mode and create follow-up action → Step 3: Goals and context → Review → Create ERP Customer through approved path → Write local client/goal/action/event rows → Confirmed success → View Client Hub | Book first session | Set up billing"
- **Journey stage:** Capture · **Persona:** Trainer · **Trigger:** Add Client
- **Route:** Clients → Add Client (sheet/route) · **Surface:** AddClientSheet / AddClientForm
- **Desktop behavior:** 3-step flow (identity → billing mode → goals/context) with review, duplicate interception, success CTAs. · **Mobile behavior:** same as focused sheet flow.
- **Required state:** duplicate-check branch with three choices ("Open existing / Continue with reason / Cancel"); three billing modes; confirmed success with three next-step CTAs.
- **Required copy:** step names and duplicate/branch options as quoted.
- **Authoritative data source:** ERP Customer creation path (JR-6.4-01 protected).
- **Action contract:** `actions/clients.ts` (protected).
- **Confirmation requirement:** Review step before creation; confirmed-first success.
- **Recovery requirement:** JR-25.1 (client-creation failure loop).
- **Linked sitemap node:** Clients → Add Client · **Linked assets:** A09, A43, A44
- **Current implementation files:** `app/dashboard/clients/new/page.tsx`, `@overlay/(.)clients/new`, `features/clients/` (3-step + duplicates built per foundation reports).
- **Current status:** partial (flow built; visual + verbatim compliance per assets pending)
- **Batch:** B8 · **Automated test:** duplicate branch + billing-mode storage (exist) · **Browser test:** full 3-step + duplicate path · **Screenshot:** Add Client flow
- **Approval gate:** PO-visual
- **Note:** Quick Add from Text is PILOT: "Free text → strict structured draft → evidence beside material fields → deterministic normalization → duplicate and safety checks → trainer review → canonical Add Client flow. Quick Add never: creates the client automatically; infers verified consent from a phone number; assigns a package; creates an invoice; books a session; diagnoses a condition; invents missing identity, price, date, goal, or preference; merges client-stated and trainer-assessed goals." → ai-parse exists at HEAD; exposure in new UI requires PO-decision.

#### JR-12.2-01
- **Source heading:** 12.2 Important correction
- **Exact source text:** "Billing mode is chosen during client creation, but package assignment does not occur inside identity creation. Add Client Step 2 → choose Package / Per-session / Decide later. After success → Client Hub → AssignPackageSheet → select package template → choose Paid Now or Pay Later → create package invoice → show confirmed balance and payment state"
- **Journey stage:** Activate · **Persona:** Trainer · **Trigger:** post-creation package setup
- **Route:** Client Hub → AssignPackageSheet · **Surface:** AssignPackageSheet
- **Desktop/Mobile behavior:** assignment only from Client Hub, never inside identity creation.
- **Required state:** Paid Now / Pay Later timing at assignment; confirmed balance + payment state.
- **Required copy:** "Paid Now" / "Pay Later".
- **Authoritative data source:** package assignment path (JR-6.5-01 protected).
- **Action contract:** assignPackage server action.
- **Confirmation requirement:** confirmed package and invoice state.
- **Recovery requirement:** per billing failure loops.
- **Linked sitemap node:** Client Hub → Packages/Billing · **Linked assets:** A05, A07
- **Current implementation files:** AssignPackageSheet (deferred-payment redesign shipped per Slice 1).
- **Current status:** partial
- **Batch:** B8 · **Automated test:** assignment timing branches (exist) · **Browser test:** assignment from hub · **Screenshot:** assignment sheet
- **Approval gate:** PO-visual

#### JR-12.4-01
- **Source heading:** 12.4 Guardrails
- **Exact source text:** "Manual invoice creation stays hidden from the normal trainer flow. Package invoice creation occurs only in package assignment. Pay-per-session invoicing occurs only as part of confirmed session completion. A pay-per-session trainer can choose Paid Now or Pay Later inside that same completion window. Package completion shows progress plus package consumption; it does not reopen package-purchase payment by default. Decide later creates no financial mutation. Client creation never auto-sends WhatsApp. Success deep-links to the correct workflow rather than executing it."
- **Journey stage:** Guardrail · **Persona:** Trainer · **Trigger:** all billing entry points
- **Route:** Clients, Client Hub, Billing, completion · **Surface:** all billing surfaces
- **Desktop/Mobile behavior:** all eight guardrails enforced structurally.
- **Required state:** manual invoice creation hidden from normal flow.
- **Required copy:** n/a
- **Authoritative data source / Action contract:** protected billing paths.
- **Confirmation requirement:** as quoted.
- **Recovery requirement:** n/a
- **Linked sitemap node:** Billing; Client Hub · **Linked assets:** A03, A04, A05
- **Current implementation files:** `app/dashboard/invoices/new/page.tsx` is a visible manual invoice route at HEAD → guardrail 1 violated in normal flow (CR-06).
- **Current status:** conflicting (manual invoice route exposure vs guardrail)
- **Batch:** B11 · **Automated test:** nav/entry-point asserts no manual-invoice CTA in normal flow · **Browser test:** yes · **Screenshot:** billing nav
- **Approval gate:** PO-decision already locked in journey (hide manual invoice); mechanical

#### JR-12.5-01
- **Source heading:** 12.5 Client Statement of Account — target experience
- **Exact source text:** "The Statement of Account is a **contextual, read-first financial workspace**. It answers three trainer questions immediately: How much does this client owe now? How was that balance produced? What is the safest next action? The trainer opens it from the Client Hub's Billing section. Other contextual entry points may include an overdue dashboard item, invoice detail, and the desktop command palette. Every entry point opens the same canonical statement surface."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** open statement
- **Route:** Client Hub → Billing → Statement (canonical; all entry points converge) · **Surface:** statement drawer/sheet
- **Desktop/Mobile behavior:** one canonical statement surface for every entry point.
- **Required state:** read-first; three-question hierarchy.
- **Required copy:** n/a (structural)
- **Authoritative data source:** JR-6.7-01 read path.
- **Action contract:** canonical actions only.
- **Confirmation/Recovery:** per JR-12.13.
- **Linked sitemap node:** Client Hub → Billing → Statement · **Linked assets:** A05, A07
- **Current implementation files:** statement UI in `features/billing/` + `actions/statements.ts`.
- **Current status:** partial
- **Batch:** B8/B11 · **Automated test:** entry-point convergence · **Browser test:** entry points open same surface · **Screenshot:** statement
- **Approval gate:** PO-visual

#### JR-12.6-01
- **Source heading:** 12.6 Responsive surface and routing
- **Exact source text:** "Desktop: open as a right-side drawer; use a standard width for a confirmed empty state; expand to a wider drawer when transaction history is present; allow a print/export route when the full statement requires more space. Mobile: use a full-height sheet or full-screen route; do not compress the ledger into a small half-height bottom sheet; render transactions as readable cards rather than a squeezed desktop table. The state is URL-backed so refresh, Back, Forward, and direct navigation preserve context. The exact route must follow the audited repository; an illustrative state is: /dashboard/clients/{clientId}?panel=statement"
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** statement open
- **Route:** URL-backed panel state (canonical route per sitemap route matrix) · **Surface:** drawer (desktop) / full-height sheet (mobile)
- **Desktop behavior:** right-side drawer, width adapts to history, print/export escape route.
- **Mobile behavior:** full-height sheet or route; ledger as cards, never squeezed table.
- **Required state:** URL-backed (refresh/Back/Forward-safe).
- **Required copy:** n/a
- **Authoritative data source:** as JR-12.5-01.
- **Action contract:** n/a
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Client Hub panel state · **Linked assets:** A05, A07, A40, A41
- **Current implementation files:** statement panel; URL-backing to verify in B8.
- **Current status:** partial
- **Batch:** B8 · **Automated test:** URL state restore · **Browser test:** refresh/back/forward · **Screenshot:** desktop drawer + mobile sheet
- **Approval gate:** PO-visual

#### JR-12.7-01
- **Source heading:** 12.7 End-to-end statement flow
- **Exact source text:** (flowchart lines 1328–1370) "Open Client Hub or financial attention item → Open canonical Statement of Account → Load ERP-authoritative invoices, payments, credits, and outstanding balances through approved proxy → Read result: Current and available → Show client, currency, period, and as-of timestamp / Confirmed no activity → Show confirmed zero state and useful next action / Stale cache → Show cached data with as-of timestamp and refresh / Partial → Show available data with explicit limitations / Unavailable → Show unavailable state and retry … Trainer action: Open invoice / Record payment → canonical RecordPaymentSheet / Send reminder → canonical MessageComposer / Download / Share / Close … Partial → Block actions that depend on missing authoritative data. Unavailable → Retry without replacing unknown values with zero."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** statement open
- **Route:** statement surface · **Surface:** statement + child sheets
- **Desktop/Mobile behavior:** five read-result states; six trainer actions; empty-state contextual next actions (assign package / book first session / none).
- **Required state:** current/confirmed-empty/stale/partial/unavailable — all five.
- **Required copy:** per JR-12.13 verbatim states.
- **Authoritative data source:** approved proxy read.
- **Action contract:** canonical RecordPaymentSheet + MessageComposer reuse.
- **Confirmation requirement:** payment round-trip per JR-12.14-01.
- **Recovery requirement:** retry semantics as quoted; never zero-substitution.
- **Linked sitemap node:** Client Hub → Statement · **Linked assets:** A05, A07
- **Current implementation files:** `actions/statements.ts` (degraded-state handling audited 2026-07); UI states partial.
- **Current status:** partial
- **Batch:** B8/B11 · **Automated test:** five read-state renderings · **Browser test:** forced degraded states · **Screenshot:** each state
- **Approval gate:** PO-visual

#### JR-12.8-01
- **Source heading:** 12.8 Header and account context
- **Exact source text:** "The header shows: Statement of account / Client name / Period / Currency / As of <date and time>. Header actions: Period / Download / Share / Close. Recommended period model: All time — MVP default / This month / Last 3 months / This year / Custom range. The MVP may support only **All time**, but the selected period must still be visible."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** statement open
- **Route:** statement surface · **Surface:** statement header
- **Desktop/Mobile behavior:** header block + four actions.
- **Required state:** period always visible even when only All time supported.
- **Required copy:** "Statement of account"; "As of <date and time>"; action labels "Period / Download / Share / Close"; period options as quoted.
- **Authoritative data source:** statement read.
- **Action contract:** Download/Share per JR-12.15-01 (hardening scope).
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Statement · **Linked assets:** A05, A07
- **Current implementation files:** statement header — verbatim compliance pending.
- **Current status:** partial
- **Batch:** B11 · **Automated test:** header copy assert · **Browser test:** yes · **Screenshot:** header
- **Approval gate:** PO-visual

#### JR-12.9-01
- **Source heading:** 12.9 Summary hierarchy
- **Exact source text:** "**Balance due** is visually dominant. Recommended information hierarchy: BALANCE DUE / USD 80 / USD 40 overdue since 10 July / Invoiced USD 400 · Paid USD 320 · Credits USD 0. Recommended UI terminology: Outstanding → **Balance due**; Overdue outstanding → **Overdue**; Submitted invoice value → **Invoiced**; Allocated confirmed payments → **Paid**; Credit notes and approved adjustments → **Credits**. The backend may retain accounting field names, but the trainer-facing interface should use the clearer labels above." … "Totals are derived from authoritative accounting state. The browser does not invent independent financial truth."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** statement summary
- **Route:** statement · **Surface:** summary cards
- **Desktop/Mobile behavior:** Balance due dominant; Invoiced/Paid/Credits secondary row.
- **Required state:** totals derived from authoritative state only.
- **Required copy:** labels exactly "Balance due", "Overdue", "Invoiced", "Paid", "Credits".
- **Authoritative data source:** ERP accounting state.
- **Action contract:** read-only.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Statement · **Linked assets:** A05, A07
- **Current implementation files:** statement summary components.
- **Current status:** partial (label verbatim compliance pending)
- **Batch:** B11 · **Automated test:** label asserts · **Browser test:** hierarchy · **Screenshot:** summary
- **Approval gate:** PO-visual

#### JR-12.10-01
- **Source heading:** 12.10 Chronological transaction ledger
- **Exact source text:** "The ledger combines all client financial activity in one chronology: package invoices; pay-per-session invoices; payment entries; partial payments; credit notes; approved corrections or refunds; due and overdue state. Desktop columns: Date / Type / Reference / description / Invoiced / Paid / credit / Balance / Status. Mobile transaction card: INVOICE · 18 JUL / Session — 18 July / INV-1042 / Amount USD 40 / Balance due USD 40 / Due 25 July / [Open invoice]. Each transaction row or card must preserve enough information to understand the event without exposing raw ERP complexity. A running balance is optional and appears only when the authoritative calculation is reliable."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** statement ledger
- **Route:** statement · **Surface:** ledger table (desktop) / cards (mobile)
- **Desktop behavior:** 7-column table as quoted. · **Mobile behavior:** card structure as quoted.
- **Required state:** unified chronology of all seven activity classes; optional running balance only when reliable.
- **Required copy:** desktop column headers and mobile card field labels as quoted.
- **Authoritative data source:** ERP ledger read.
- **Action contract:** row/card opens invoice detail.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Statement · **Linked assets:** A05, A07
- **Current implementation files:** ledger rendering in `features/billing/`.
- **Current status:** partial
- **Batch:** B11 · **Automated test:** column/card structure · **Browser test:** desktop vs mobile rendering · **Screenshot:** both viewports
- **Approval gate:** PO-visual

#### JR-12.11-01
- **Source heading:** 12.11 Filters and search
- **Exact source text:** "MVP: Period: All time / Status: All / Type: All activity. Production-hardening options: Status: All / Outstanding / Overdue / Paid / Partially paid / Credited / Cancelled. Activity type: All activity / Invoices / Payments / Credits and corrections. Search, pagination, and additional controls appear only when the statement volume justifies them. Avoid advanced accounting filters in the normal trainer workflow."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** ledger filtering
- **Route:** statement · **Surface:** filter controls
- **Desktop/Mobile behavior:** MVP fixed filter state visible; hardening filters deferred.
- **Required state:** MVP = All time / All / All activity.
- **Required copy:** filter labels as quoted.
- **Authoritative data source:** n/a · **Action contract:** n/a
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Statement · **Linked assets:** A05
- **Current implementation files:** statement filters.
- **Current status:** partial
- **Batch:** B11 (MVP set only) · **Automated test:** filter defaults · **Browser test:** yes · **Screenshot:** filters
- **Approval gate:** none (hardening filters = later scope, PO-decision to pull forward)

#### JR-12.12-01
- **Source heading:** 12.12 State-derived actions
- **Exact source text:** "Data unavailable → Retry. Balance due, no financial hold → Record payment. Overdue → Record payment → Send payment reminder. Explicit financial hold → Open controlled hold-resolution flow. Fully paid → Open invoice or receipt → Download or share statement. No financial activity → Assign package or book a session when contextually relevant. Rules: `Record payment` opens the one canonical payment flow. `Send reminder` opens the one canonical outbound WhatsApp composer. The statement does not contain a second inline payment implementation. An overdue warning and an explicit financial hold remain separate concepts. Manual invoice creation remains hidden. The statement is not an accounting-administration screen."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** statement state
- **Route:** statement · **Surface:** primary action area
- **Desktop/Mobile behavior:** primary action derived per authoritative state (six states quoted).
- **Required state:** hold vs overdue distinguished; no manual invoice creation.
- **Required copy:** action labels "Record payment", "Send payment reminder", "Retry".
- **Authoritative data source:** statement state.
- **Action contract:** canonical payment + composer reuse only.
- **Confirmation requirement:** within child flows.
- **Recovery requirement:** Retry on unavailable.
- **Linked sitemap node:** Statement · **Linked assets:** A05, A07
- **Current implementation files:** statement actions.
- **Current status:** partial
- **Batch:** B11 · **Automated test:** state→action derivation · **Browser test:** per state · **Screenshot:** per state
- **Approval gate:** PO-visual

#### JR-12.13-01
- **Source heading:** 12.13 Honest data-state model
- **Exact source text:** Loading: "Loading account activity…" (skeletons; "Never flash `USD 0` while loading.") — Confirmed empty: "No invoices or payments yet. / Financial activity will appear here after a package invoice or a completed pay-per-session session." — Unavailable: "Account information is temporarily unavailable. / Your financial records have not been changed. / [Try again]" ("Unknown values display as unavailable, never zero.") — Partial: "Some account activity could not be loaded. / Invoice totals are available. / Payment history may be incomplete. / [Try again]" ("Disable actions that depend on missing authoritative information.") — Stale cache: "Showing information as of 7:45 PM. / [Refresh]" — Uncertain result after mutation: "Payment status could not be confirmed. / No second payment has been created. / Check authoritative state before retrying."
- **Journey stage:** Review account · **Persona:** Trainer · **Trigger:** each data state
- **Route:** statement · **Surface:** state displays
- **Desktop/Mobile behavior:** all six states rendered with quoted copy.
- **Required state:** loading / confirmed-empty / unavailable / partial / stale / uncertain-after-mutation.
- **Required copy:** VERBATIM as quoted (timestamps substituted).
- **Authoritative data source:** statement read + mutation results.
- **Action contract:** Try again / Refresh actions.
- **Confirmation/Recovery:** uncertain-result copy prevents duplicate payment retries.
- **Linked sitemap node:** Statement · **Linked assets:** A05, A07
- **Current implementation files:** degraded-state audit exists (`STATEMENT_PAYMENT_HISTORY_DEGRADED_AUDIT.md`); copy not verbatim.
- **Current status:** partial
- **Batch:** B11 · **Automated test:** copy assertions per state · **Browser test:** forced states · **Screenshot:** all six states
- **Approval gate:** PO-visual

#### JR-12.14-01
- **Source heading:** 12.14 Canonical Record Payment round-trip
- **Exact source text:** "Statement → Record payment → canonical RecordPaymentSheet → select invoice allocation → enter amount and payment method → preview allocation and remaining balance → trainer confirms → approved ERP Payment Entry path → refresh statement. Review example: Amount received USD 60 / Applied to INV-1042 USD 40 / Applied to INV-1047 USD 20 / Remaining balance USD 20 / Method Whish / [Confirm payment]. The flow supports partial allocation only through the authoritative payment contract. Overpayment remains blocked unless customer-credit handling is explicitly approved."
- **Journey stage:** Collect · **Persona:** Trainer · **Trigger:** Record payment from statement
- **Route:** statement → RecordPaymentSheet · **Surface:** RecordPaymentSheet
- **Desktop/Mobile behavior:** allocation preview with remaining balance before confirm.
- **Required state:** partial allocation via authoritative contract; overpayment blocked.
- **Required copy:** review-block field labels as quoted; "[Confirm payment]".
- **Authoritative data source:** ERP Payment Entry path (JR-6.6-01 protected).
- **Action contract:** `actions/invoices.ts` recordPayment.
- **Confirmation requirement:** explicit Confirm payment.
- **Recovery requirement:** uncertain-result state per JR-12.13-01.
- **Linked sitemap node:** Statement; Billing · **Linked assets:** A05, A07
- **Current implementation files:** `app/dashboard/invoices/[id]/pay/page.tsx` (route-based, not canonical sheet with allocation preview).
- **Current status:** partial
- **Batch:** B11 · **Automated test:** allocation math via contract (protected tests) · **Browser test:** round-trip refresh · **Screenshot:** review step
- **Approval gate:** PO-visual

#### JR-12.15-01 (HARDENING SCOPE)
- **Source heading:** 12.15 Download and share
- **Exact source text:** "Download statement → choose period → preview totals → generate PDF. The generated statement includes: workspace/trainer identity; client name; statement period; currency; generated date and time; summary totals; transaction ledger; page numbers; `as of` timestamp. Share statement → choose approved outbound channel → preview message and attachment or secure link → trainer confirms → send result is logged. MVP sharing remains trainer-confirmed and outbound-only. Opening a statement never triggers an automatic send."
- **Ruling:** listed under 12.17 "Production-hardening soon" → not in MVP batches; header actions Download/Share may render disabled/hidden per PO decision (CR candidate if asset shows them active).
- **Linked sitemap node:** Statement · **Linked assets:** A05, A07
- **Current implementation files:** none.
- **Current status:** future-gated (hardening) · **Batch:** post-B15 hardening · **Approval gate:** PO-decision

#### JR-12.16-01
- **Source heading:** 12.16 Accessibility requirements
- **Exact source text:** "The statement must: avoid relying on red or green alone for status; include visible labels and status text; use real table headers on desktop; render readable transaction cards on mobile; trap focus correctly while the drawer/sheet is open; return focus to the Statement button when closed; give the close control an explicit accessible name; support keyboard row activation; announce loading, refresh, partial, and error states; use tabular numerals for aligned financial amounts; keep currency visible for every amount context; maintain readable contrast and touch-target sizes."
- **Journey stage:** Review account · **Persona:** Trainer (assistive tech) · **Trigger:** statement usage
- **Route:** statement · **Surface:** statement a11y
- **Desktop/Mobile behavior:** all twelve requirements as quoted.
- **Required state/copy:** as quoted.
- **Authoritative data source / Action contract:** n/a
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Statement · **Linked assets:** A05, A07
- **Current implementation files:** partial a11y in current statement.
- **Current status:** partial
- **Batch:** B11 (+B15 acceptance level 6) · **Automated test:** axe/a11y checks · **Browser test:** keyboard + SR walkthrough · **Screenshot:** n/a
- **Approval gate:** none

#### JR-12.17-01 (GOVERNANCE)
- **Source heading:** 12.17 Scope status
- **Exact source text:** "MVP / pilot-safe: 1. URL-backed Client Hub drawer or full-height mobile sheet. 2. Client, period, currency, and `as of` timestamp. 3. Dominant Balance due plus Overdue, Invoiced, and Paid. 4. Unified invoice/payment ledger. 5. Open invoice. 6. Canonical Record Payment. 7. Canonical Send Reminder. 8. Loading, confirmed-empty, unavailable, partial, stale, and uncertain-result states. 9. No manual invoice creation. Production-hardening soon: 1. Partial-payment display. 2. Credit-note, refund, and correction rows. 3. Period, status, and activity filters. 4. Search and pagination when needed. 5. PDF/print statement. 6. Trainer-confirmed WhatsApp or approved-channel sharing. 7. Optional running balance. 8. Full keyboard and screen-reader validation. Future: 1. Secure client-facing statement portal. 2. Client payment from the future portal. 3. Approved scheduled statement delivery. 4. Multi-currency statements. 5. AI-prepared account summaries that remain trainer-reviewed."
- **Ruling:** scope split governs B11 statement scope: MVP nine items in-batch; hardening eight items excluded; future five items excluded.
- **Current status:** governance · **Batch:** B11 scope contract · **Approval gate:** PO-decision to pull hardening items forward

## Section 13 — Session Lifecycle and Outcome Consequences

#### JR-13.1-01
- **Source heading:** 13.1 Main outcome map
- **Exact source text:** (flowchart lines 1738–1776) "Scheduled or confirmed session → What happened? Completed → Open unified completion sheet → Enter quick session progress → Billing mode … No Show → Preview attendance and financial choice → Trainer confirms approved result. Cancelled → Preview cancellation consequence → Trainer confirms approved result. Rescheduled → Open reschedule flow → Check conflicts and version → Trainer confirms new slot. → Refresh session, progress, Client Hub, package/invoice/payment, and dashboard state"
- **Journey stage:** Resolve · **Persona:** Trainer · **Trigger:** any outcome selection
- **Route:** completion sheet + reschedule flow · **Surface:** outcome branches
- **Desktop/Mobile behavior:** No Show and Cancelled show consequence preview before confirm; Rescheduled runs conflict+version-checked rebooking.
- **Required state:** four branches; post-confirm refresh of five state families.
- **Required copy:** outcome labels per JR-5.5-01.
- **Authoritative data source:** session completion service + engine.
- **Action contract:** JR-6.2/6.3 protected paths.
- **Confirmation requirement:** per branch as quoted.
- **Recovery requirement:** JR-25.3.
- **Linked sitemap node:** Session Completion; Schedule · **Linked assets:** A80, A25–A28
- **Current implementation files:** outcome branches in `features/scheduling/`; No Show financial-choice depth flagged "may need upgrade" (source 13.3).
- **Current status:** partial
- **Batch:** B9 · **Automated test:** branch consequences · **Browser test:** all four branches · **Screenshot:** A80
- **Approval gate:** PO-visual

#### JR-13.2-01
- **Source heading:** 13.2 Unified Session Completion Sheet
- **Exact source text:** "The completion experience is one URL-backed overlay that renders as a mobile bottom sheet or desktop drawer. Its progressive structure is: 1. Outcome 2. Session progress 3. Conditional billing impact 4. Payment timing/method for pay-per-session only 5. One review and confirmation 6. Verified result or exact recovery state." — Package client shows: "Package name / Balance before / Units consumed / Balance after." — Pay-per-session client shows: "Session rate / Invoice amount / Paid Now / Pay Later." — "One experience, explicit step truth: 'One window' is a UX rule, not permission to hide distributed failure. Never claim the whole flow succeeded when only one step succeeded. Prevent duplicate outcome, package, invoice, progress, and payment writes. Preserve entered progress when a financial step needs recovery. Query authoritative state before allowing a retry after an uncertain result. Show the trainer exactly what was saved and what still requires action."
- **Journey stage:** Resolve · **Persona:** Trainer · **Trigger:** Completed outcome
- **Route:** URL-backed overlay · **Surface:** SessionCompletionSheet (bottom sheet mobile / drawer desktop)
- **Desktop/Mobile behavior:** six-part progressive structure; billing-mode display blocks as quoted.
- **Required state:** step-truth on partial failure; progress preserved on financial recovery.
- **Required copy:** package fields "Package name / Balance before / Units consumed / Balance after"; PPS fields "Session rate / Invoice amount / Paid Now / Pay Later".
- **Authoritative data source:** JR-6.3-01 protected path.
- **Action contract:** completion orchestration (protected).
- **Confirmation requirement:** one review and confirmation (step 5).
- **Recovery requirement:** verified result or exact recovery state (step 6).
- **Linked sitemap node:** Session Completion · **Linked assets:** A80
- **Current implementation files:** completion sheet; URL-backing + six-part structure to verify.
- **Current status:** partial
- **Batch:** B9 · **Automated test:** structure + field blocks + step-truth · **Browser test:** partial-failure sim · **Screenshot:** A80
- **Approval gate:** PO-visual

#### JR-13.3-01 (GOVERNANCE)
- **Source heading:** 13.3 Implementation-status note
- **Exact source text:** (table lines 1841–1851) "Completed outcome | MVP — MAIN … Quick progress within completion | APPROVED JOURNEY REQUIREMENT — exact persistence/UI status VERIFY AT ADOPTION … Paid Now / Pay Later inside completion | APPROVED JOURNEY REQUIREMENT — reuse existing payment contract; placement VERIFY AT ADOPTION … No Show | Core backend exists; UX and financial-choice depth may need upgrade … Unresolved recovery | Detection and dashboard attention are materially built; dedicated batch UI status VERIFY AT ADOPTION"
- **Ruling:** VERIFY-AT-ADOPTION items become B9 audit checklist entries; no separate UI requirement.
- **Current status:** governance · **Batch:** B9 audit step · **Approval gate:** none

#### JR-13.4-01
- **Source heading:** 13.4 Completion preview content
- **Exact source text:** "The one review screen should state: client; session date/time; current and selected outcome; progress update and any safety concern; package name and units/balance affected; invoice amount or reason no invoice will be created; Paid Now / Pay Later choice; payment method and amount when Paid Now; any blocked or unconfigured state; whether a follow-up action will be suggested."
- **Journey stage:** Resolve · **Persona:** Trainer · **Trigger:** review step
- **Route:** completion sheet review · **Surface:** review screen
- **Desktop/Mobile behavior:** all ten content items present when applicable.
- **Required state:** blocked/unconfigured states surfaced in review.
- **Required copy:** content structure as quoted.
- **Authoritative data source:** assembled completion preview.
- **Action contract:** read (pre-confirm).
- **Confirmation requirement:** this is the confirmation gate.
- **Recovery requirement:** n/a
- **Linked sitemap node:** Session Completion · **Linked assets:** A80
- **Current implementation files:** completion review UI.
- **Current status:** partial
- **Batch:** B9 · **Automated test:** ten-item presence matrix · **Browser test:** per billing mode · **Screenshot:** review step
- **Approval gate:** PO-visual

#### JR-13.5-01 (FUTURE-GATED)
- **Source heading:** 13.5 Formal progress-report boundary
- **Exact source text:** "A formal progress report covers a period, multiple sessions, goal trends, measurements, and trainer-approved interpretation. It is **FUTURE / APPROVAL-GATED** and must not be confused with the quick progress entry used during routine completion."
- **Ruling:** excluded from batches; guard against invention.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-13.6-01
- **Source heading:** 13.6 Cancellation and no-show consequence waiver
- **Exact source text:** "When a default cancellation or no-show rule would deduct a package unit or create a charge, FitDesk may offer a one-occurrence waiver: Normal consequence: Deduct 1 package unit / Applied consequence: Waived / Reason: Medical emergency / Scope: This occurrence. The trainer sees the normal and waived results before confirming. Submitted invoices or confirmed payments are not silently edited; they require an approved correction flow."
- **Journey stage:** Resolve (exception) · **Persona:** Trainer · **Trigger:** cancel/no-show with consequence
- **Route:** completion sheet (cancel/no-show branch) · **Surface:** waiver block
- **Desktop/Mobile behavior:** normal vs applied consequence shown side-by-side before confirm.
- **Required state:** one-occurrence scope; no silent edits of submitted financial records.
- **Required copy:** field structure "Normal consequence / Applied consequence / Reason / Scope" as quoted.
- **Authoritative data source:** package/billing rules.
- **Action contract:** waiver recorded via exception contract (§15).
- **Confirmation requirement:** trainer confirms with both results visible.
- **Recovery requirement:** approved correction flow for submitted records.
- **Linked sitemap node:** Session Completion · **Linked assets:** A80
- **Current implementation files:** no waiver UI at HEAD.
- **Current status:** missing
- **Batch:** B9 · **Automated test:** waiver scope + audit row · **Browser test:** waiver path · **Screenshot:** waiver block
- **Approval gate:** PO-visual

#### JR-13.7-01
- **Source heading:** 13.7 Package-exhausted completion resolver
- **Exact source text:** "If a completed session has no available package balance, preserve the trainer's progress entry and offer explicit choices: Renew or assign package / Convert this session to pay-per-session / Mark as complimentary / Mark billing for review / Cancel completion. Never create a negative package balance, invent a billing mode, or silently mark a session complimentary."
- **Journey stage:** Resolve (exception) · **Persona:** Trainer · **Trigger:** completion with exhausted package
- **Route:** completion sheet resolver · **Surface:** package-exhausted resolver
- **Desktop/Mobile behavior:** five explicit choices; progress preserved.
- **Required state:** no negative balance; no invented billing mode; no silent complimentary.
- **Required copy:** the five choices VERBATIM as quoted.
- **Authoritative data source:** package balance.
- **Action contract:** each choice routes to canonical flow.
- **Confirmation requirement:** explicit choice + confirm.
- **Recovery requirement:** Cancel completion preserves progress entry.
- **Linked sitemap node:** Session Completion · **Linked assets:** A80
- **Current implementation files:** C6 groundwork exists (session_consumed ledger); resolver UI missing.
- **Current status:** missing
- **Batch:** B9 · **Automated test:** five-choice behavior · **Browser test:** exhausted-package sim · **Screenshot:** resolver
- **Approval gate:** PO-visual

#### JR-13.8-01
- **Source heading:** 13.8 Next-session focus loop
- **Exact source text:** "Complete current session → enter Next-session focus → store source session and captured time → show in Client Today and the next Session Detail → trainer marks addressed, updates, carries forward once, or removes. Example: Next focus: Increase squat load gradually / Source: Session completed 18 July. Rules: This is coaching context, not a formal program or progress report. It remains trainer-private unless deliberately included in a client message. It does not copy forward indefinitely. Carry-forward is explicit and bounded. Updating or clearing it never rewrites the completed source session. A stale focus must show its source and age rather than appearing as timeless truth."
- **Journey stage:** Resolve → Continue · **Persona:** Trainer · **Trigger:** completion with focus entry
- **Route:** completion sheet + Client Today + Session Detail · **Surface:** Next-session focus field + display chips
- **Desktop/Mobile behavior:** capture in completion; display with source and age in Client Today and next Session Detail.
- **Required state:** addressed / updated / carried-forward-once / removed lifecycle; staleness display.
- **Required copy:** display pattern "Next focus: … / Source: Session completed <date>".
- **Authoritative data source:** local session/notes ownership (JR-3.3-01).
- **Action contract:** focus mutations never rewrite source session.
- **Confirmation/Recovery:** n/a (trainer-private context)
- **Linked sitemap node:** Session Completion; Client Hub → Today · **Linked assets:** A80, A05
- **Current implementation files:** none at HEAD.
- **Current status:** missing
- **Batch:** B9 · **Automated test:** lifecycle transitions · **Browser test:** capture→display→address · **Screenshot:** focus chip
- **Approval gate:** PO-visual

## Section 14 — Scheduling, Recurrence, Pattern Slots, and Conflict Resolution

#### JR-14-01
- **Source heading:** 14 (booking flow + canonical BookingSheet)
- **Exact source text:** (flowchart lines 1931–1965) "Open BookingSheet → Select client, date, time, duration and location → One-off or recurring? … Check working hours, session overlap, and time buffers → Conflict type: None → Show booking review / Hard overlap / blocked rule → Return non-overridable structured conflict / Soft buffer only → Explain the required buffer and affected sessions … Trainer confirms → Persist booking plus any approved buffer override → Authoritative booking result and audit event → Update schedule, dashboard, and Client Hub" … "The same canonical `BookingSheet` is launched from Schedule, Client Hub, Dashboard, mobile FAB, desktop command palette, and the optional pilot **Natural-Language Booking Draft**. Entry context may prefill the client or time, but validation, preview, mutation, and recovery remain one implementation." … "Meaningful booking states are URL-backed so refresh, Back, Forward, and direct linking preserve context. On mobile the route renders as a bottom sheet; on desktop it renders as a drawer/dialog."
- **Journey stage:** Book · **Persona:** Trainer · **Trigger:** booking from any entry point
- **Route:** URL-backed booking overlay from Schedule/Client Hub/Dashboard/FAB · **Surface:** BookingSheet
- **Desktop behavior:** drawer/dialog; conflict branches as diagrammed. · **Mobile behavior:** bottom sheet; FAB entry.
- **Required state:** one-off vs recurring; conflict-type branches (none / hard / soft-buffer); URL-backed.
- **Required copy:** n/a (see JR-14.1-01 for buffer copy).
- **Authoritative data source:** scheduling engine (JR-6.2-01 protected).
- **Action contract:** `actions/schedulingActions.ts` (protected).
- **Confirmation requirement:** booking review before persist.
- **Recovery requirement:** structured conflict return; JR-25.2.
- **Linked sitemap node:** Schedule → Booking (contextual) · **Linked assets:** A25, A26, A27, A28, A65, A66, A78
- **Current implementation files:** BookingSheet in `components/scheduling/` + `features/scheduling/`; entry-point coverage and URL-backing to verify.
- **Current status:** partial
- **Batch:** B7 · **Automated test:** engine conflict tests (exist, protected) · **Browser test:** conflict branches + entry points · **Screenshot:** A28
- **Approval gate:** PO-visual
- **Note:** Natural-Language Booking Draft is pilot: "'Book Sarah next Monday at 5 PM for 60 minutes, at ABC Gym, every Monday for six weeks.' → parse BookingDraft → show absolute date, year, time, and timezone → expose ambiguity → open canonical BookingSheet → run normal conflict/recurrence validation → trainer confirms. The LLM interprets language only." → future-gated (PO-decision).

#### JR-14.1-01
- **Source heading:** 14.1 Trainer override for soft time-buffer conflicts
- **Exact source text:** "Your schedule normally requires 30 minutes between these sessions. / Both clients are at the same location, so you can override the travel buffer for this booking. / [Keep buffer and choose another time] / [Override buffer]" … reasons: "Same location — no travel needed / Online sessions / Trainer-approved shorter transition / Other — add note" … "The review state must show: the normal buffer; the reduced/effective buffer; both session times; both locations when known; whether the override applies to one occurrence or an explicitly selected recurring scope; the reason; any remaining warning. The override is trainer-controlled and confirmed-first. It creates an auditable scheduling event and does **not** silently change the trainer's global buffer setting." … "Hard session overlaps and blocked scheduling rules are never bypassed by the buffer override."
- **Journey stage:** Book (exception) · **Persona:** Trainer · **Trigger:** soft buffer-only conflict
- **Route:** BookingSheet conflict branch · **Surface:** buffer-override block
- **Desktop/Mobile behavior:** explanation + two actions; reason selection; seven-item review.
- **Required state:** occurrence-scoped by default; series scope needs regenerated preview; auditable event.
- **Required copy:** VERBATIM explanation and action labels; reason codes as quoted.
- **Authoritative data source:** engine structured conflicts (hard vs soft distinguished by engine, never by UI).
- **Action contract:** persist booking + override via protected path.
- **Confirmation requirement:** confirmed-first with review items visible.
- **Recovery requirement:** repeated confirmation cannot duplicate bookings.
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** engine soft/hard distinction to verify; override UI missing at HEAD.
- **Current status:** missing (UI); engine capability partial-verify
- **Batch:** B7 · **Automated test:** override audit event + scope · **Browser test:** override path · **Screenshot:** override block
- **Approval gate:** PO-visual

#### JR-14.2-01
- **Source heading:** 14.2 Working-hours exception
- **Exact source text:** "Outside working hours / Normal hours: 08:00–19:00 / Requested time: 19:30 / [Choose another time] / [Approve this booking exception]. Rules: The default scope is this booking or occurrence only. A recurring-series exception requires a regenerated series preview. The trainer selects a structured reason; typed detail is required only for `Other`. The exception never changes workspace working hours. A real session overlap remains a hard conflict."
- **Journey stage:** Book (exception) · **Persona:** Trainer · **Trigger:** booking outside configured hours
- **Route:** BookingSheet · **Surface:** working-hours exception block
- **Desktop/Mobile behavior:** exception block with quoted structure and two actions.
- **Required state:** occurrence scope default; series preview for series scope.
- **Required copy:** VERBATIM labels "[Choose another time] / [Approve this booking exception]".
- **Authoritative data source:** working-hours config + engine.
- **Action contract:** exception recorded per §15 contract.
- **Confirmation requirement:** explicit approval.
- **Recovery requirement:** n/a
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** none at HEAD (working-hours validation exists in engine; exception UI missing).
- **Current status:** missing
- **Batch:** B7 · **Automated test:** scope + no-global-change · **Browser test:** exception path · **Screenshot:** block
- **Approval gate:** PO-visual

#### JR-14.3-01
- **Source heading:** 14.3 Location-confidence confirmation
- **Exact source text:** "FitDesk must not infer 'same location' from loosely matching free text. When location identity is missing or uncertain: Location could not be confirmed. / [Confirm same location for this booking] / [Update location] / [Keep normal travel buffer]. A location confirmation is scoped to the booking unless the trainer separately updates the source location record. Structured location identifiers are preferred over free-text matching."
- **Journey stage:** Book (exception) · **Persona:** Trainer · **Trigger:** uncertain location identity during buffer evaluation
- **Route:** BookingSheet · **Surface:** location-confidence block
- **Desktop/Mobile behavior:** three quoted choices.
- **Required state:** booking-scoped confirmation.
- **Required copy:** VERBATIM as quoted.
- **Authoritative data source:** structured location identifiers.
- **Action contract:** confirmation scoped to booking.
- **Confirmation requirement:** explicit choice.
- **Recovery requirement:** n/a
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** none.
- **Current status:** missing
- **Batch:** B7 · **Automated test:** no free-text same-location inference · **Browser test:** uncertain-location path · **Screenshot:** block
- **Approval gate:** PO-visual

#### JR-14.4-01
- **Source heading:** 14.4 Shared recurring-scope selector
- **Exact source text:** "Scheduling exceptions use one consistent scope model: This occurrence only — default / This and selected future occurrences — explicit preview / Entire series — highest review level. For future or entire-series scope, FitDesk regenerates all affected occurrences and reruns conflict, buffer, working-hours, DST, location, duration, and billing checks before confirmation."
- **Journey stage:** Book (shared control) · **Persona:** Trainer · **Trigger:** any recurring exception
- **Route:** BookingSheet + exception blocks · **Surface:** shared scope selector component
- **Desktop/Mobile behavior:** one shared selector across all scheduling exceptions.
- **Required state:** three scopes; regeneration + recheck for non-occurrence scopes.
- **Required copy:** scope labels as quoted.
- **Authoritative data source:** engine regeneration.
- **Action contract:** rechecks before confirm.
- **Confirmation requirement:** scope-specific review levels.
- **Recovery requirement:** n/a
- **Linked sitemap node:** Schedule → Booking; shared library · **Linked assets:** A81
- **Current implementation files:** recurring-scope selector partially exists for reschedule; unify in B7/B14.
- **Current status:** partial
- **Batch:** B7 + B14 · **Automated test:** regeneration recheck matrix · **Browser test:** three scopes · **Screenshot:** selector
- **Approval gate:** PO-visual

#### JR-14.5-01 (GOVERNANCE)
- **Source heading:** 14.5 Structured session-context doctrine
- **Exact source text:** "Capture a field only when FitDesk can reuse it at a meaningful trainer moment. Prefer structured defaults over repeated typing, preserve occurrence-level history, reveal optional details progressively, distinguish trainer-private from client-visible content, show where reused information came from, and never let a contextual field silently trigger scheduling, communication, package, or financial consequences." … "Session context is reused across: Booking → preparation → reminders → conflict and buffer review → session delivery → completion → next-session preparation"
- **Ruling:** design doctrine constraining all §14 field work; no standalone surface.
- **Current status:** governance · **Batch:** B7 design contract · **Approval gate:** none

#### JR-14.6-01
- **Source heading:** 14.6 BookingSheet progressive disclosure
- **Exact source text:** "Always visible: Client / Date and time / Duration / Location / Session type / Repeat. Collapsed **Session details**: Trainer preparation / Access instructions / Equipment / Client preparation / Trainer reminder / Contact preference / Time flexibility / Environment. Derived after the trainer selects context: Payment context / Readiness checklist / Travel and buffer result / Communication state / Next safe action. FitDesk does not show every optional field on every booking. Session type, location type, client defaults, and current state determine which details are relevant."
- **Journey stage:** Book · **Persona:** Trainer · **Trigger:** BookingSheet open
- **Route:** BookingSheet · **Surface:** field layout
- **Desktop/Mobile behavior:** three disclosure tiers exactly as quoted.
- **Required state:** relevance-driven optional fields.
- **Required copy:** group label "Session details"; field labels as quoted.
- **Authoritative data source:** defaults hierarchy (JR-14.9-01).
- **Action contract:** n/a (layout)
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** BookingSheet progressive disclosure partially shipped (per 14.6 doc + prior audits); field set differs.
- **Current status:** partial
- **Batch:** B7 · **Automated test:** tier membership · **Browser test:** disclosure behavior · **Screenshot:** A28
- **Approval gate:** PO-visual

#### JR-14.7-01
- **Source heading:** 14.7 Session location model
- **Exact source text:** "Location is a first-class booking field: Trainer location / Client location / Saved location / Online / Custom location / Intentionally unknown. Useful shortcuts: Use client's usual location / Use trainer's default location / Same as last session / Use series location. Conceptual ownership: Reusable location record + session occurrence snapshot." … "Rules: The short Schedule card shows the location label, not unnecessary sensitive detail. Client-home addresses remain tenant-isolated and appear only where operationally necessary. Full home addresses do not appear in broad timelines, analytics, or unrelated exports. Online is a proper location type, not merely the text 'Zoom.' Unknown location is explicit and may create a Resume Work item for an in-person session. Structured location identity supports same-location confidence; free text alone does not silently prove a match."
- **Journey stage:** Book · **Persona:** Trainer · **Trigger:** location selection
- **Route:** BookingSheet · **Surface:** location field + snapshot model
- **Desktop/Mobile behavior:** six location types; four shortcuts; snapshot preserved per occurrence.
- **Required state:** record+snapshot ownership; unknown-location Resume Work item.
- **Required copy:** type and shortcut labels as quoted.
- **Authoritative data source:** location records (local ownership).
- **Action contract:** snapshot never rewritten by record edits.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** location model in scheduling schema — structured types to verify; snapshot semantics to verify.
- **Current status:** partial
- **Batch:** B7 · **Automated test:** snapshot immutability; privacy display rules · **Browser test:** type selection + card label · **Screenshot:** location field
- **Approval gate:** PO-visual

#### JR-14.8-01
- **Source heading:** 14.8 Session type and contextual defaults
- **Exact source text:** "Recommended session types: Standard training / Assessment / Trial session / Progress review / Consultation / Online session / Group/shared session." … "Hard boundary: Session type ≠ billing mode ≠ automatic price change ≠ automatic package consequence. Any financial consequence remains visible and explicitly confirmed through the existing billing flow."
- **Journey stage:** Book · **Persona:** Trainer · **Trigger:** type selection
- **Route:** BookingSheet · **Surface:** session-type field
- **Desktop/Mobile behavior:** seven types; type-driven contextual preparation fields (Assessment/Online/Progress review examples per source).
- **Required state:** type never mutates billing.
- **Required copy:** type labels as quoted.
- **Authoritative data source:** session type on session record.
- **Action contract:** no financial side effects from type.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** session type field exists; label set to verify.
- **Current status:** partial
- **Batch:** B7 · **Automated test:** no-billing-side-effect · **Browser test:** type-contextual fields · **Screenshot:** type field
- **Approval gate:** PO-visual

#### JR-14.9-01
- **Source heading:** 14.9 Defaults, inheritance, provenance, and snapshots
- **Exact source text:** "Default hierarchy: Workspace default → client usual default → recurring-series default → occurrence override. The most specific value wins." … "FitDesk shows provenance: Location: ABC Gym / From Sarah's usual booking … Changing a prefilled value requires an explicit scope: This booking only / This and future occurrences / Client's future default. These are separate decisions." … "Updating a default never rewrites completed sessions."
- **Journey stage:** Book · **Persona:** Trainer · **Trigger:** prefilled fields
- **Route:** BookingSheet · **Surface:** provenance chips + scope prompts
- **Desktop/Mobile behavior:** provenance shown under prefilled values; scope prompt on change.
- **Required state:** four-level hierarchy; three change scopes; snapshot protection.
- **Required copy:** provenance pattern "From …" as quoted.
- **Authoritative data source:** defaults hierarchy.
- **Action contract:** default updates never rewrite history.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** partial defaults exist; provenance display missing.
- **Current status:** partial (provenance missing) — series inheritance itself is PRODUCTION-HARDENING per 14.16
- **Batch:** B7 (MVP subset: client usual defaults + provenance for them) · **Automated test:** hierarchy resolution · **Browser test:** provenance + scope prompt · **Screenshot:** provenance chip
- **Approval gate:** PO-visual

#### JR-14.10-01
- **Source heading:** 14.10 Field visibility and privacy classes
- **Exact source text:** "**Trainer private** (Preparation note, coaching reminder, sensitive arrival detail): Never inserted into client communication automatically. **Client visible when selected** (What to bring, approved public access instructions): Included only after trainer review. **Operational system data** (Payment context, readiness result, communication state): Derived from authoritative sources; not free text. **Shared booking information** (Date, time, location label, session type): Suitable for confirmed booking/reminder context. For a home session: Schedule card → Client home. Session Detail → approved full address and required access information."
- **Journey stage:** Book/Deliver · **Persona:** Trainer · **Trigger:** field rendering + composer insertion
- **Route:** Schedule, Session Detail, composer · **Surface:** field visibility enforcement
- **Desktop/Mobile behavior:** four classes enforced everywhere fields render or are inserted into messages.
- **Required state:** home-session card shows "Client home" label only.
- **Required copy:** as quoted.
- **Authoritative data source:** field classification.
- **Action contract:** composer inserts client-visible fields only after review.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule; Inbox composer · **Linked assets:** A25, A27
- **Current implementation files:** no formal visibility classes at HEAD.
- **Current status:** missing (as a formal model)
- **Batch:** B7 + B10 · **Automated test:** class enforcement · **Browser test:** home-session card + composer · **Screenshot:** card
- **Approval gate:** none

#### JR-14.11-01
- **Source heading:** 14.11 Optional session fields
- **Exact source text:** "Trainer preparation note — Private, optional, concise, and visible shortly before the session… It is not a clinical record and is never sent automatically." … "Access and arrival instructions — Separate location identity from instructions: Location: ABC Gym — Hamra / Access: Use rear entrance; Studio 2. Scope choices: Use this session only / Save to reusable location." … (Equipment needed / Client preparation / Trainer reminder / Availability preference / Time flexibility / Environment blocks, lines 2360–2423)
- **Journey stage:** Book · **Persona:** Trainer · **Trigger:** optional field entry
- **Route:** BookingSheet Session details · **Surface:** optional fields
- **Desktop/Mobile behavior:** MVP subset = Trainer preparation note + Access/arrival instructions (per 14.16 delivery-priority table). Equipment, Client preparation, Trainer reminder, Availability preference, occurrence contact override = PRODUCTION-HARDENING. Time flexibility, multiple reminders = VALIDATE BEFORE BROAD ADOPTION. Environment/weather = FUTURE.
- **Required state:** access-instructions scope choices as quoted.
- **Required copy:** "Use this session only / Save to reusable location".
- **Authoritative data source:** local session context.
- **Action contract:** never auto-sent (trainer-private).
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule → Booking · **Linked assets:** A28
- **Current implementation files:** subset exists; field-by-field verify in B7.
- **Current status:** partial (MVP subset), future-gated (hardening subset)
- **Batch:** B7 (MVP subset only) · **Automated test:** private-field non-insertion · **Browser test:** field scoping · **Screenshot:** Session details
- **Approval gate:** PO-visual; hardening subset PO-decision

#### JR-14.12-01
- **Source heading:** 14.12 Operational states and derived readiness
- **Exact source text:** "Keep three state families separate: Session state → Scheduled / Arrived / Completed / Cancelled / No-show / Rescheduled. Communication state → Not prepared / Prepared / Sent / Delivered / Failed. Client confirmation → Not requested / Awaiting response / Confirmed / Declined / Manually confirmed. A delivered reminder never proves client confirmation. Derived readiness may show: ✓ Location confirmed / ✓ Goal context available / ✓ Safety reviewed / ✓ Package or pricing available / ! Client reminder not sent / ✕ Required safety clearance missing. Readiness is calculated from current state; do not create a second checklist record. Classify each item: Hard blocker / Soft warning / Optional preparation. The checklist appears only near the relevant session and does not become a mandatory wizard."
- **Journey stage:** Prepare/Deliver · **Persona:** Trainer · **Trigger:** session detail view
- **Route:** Session Detail · **Surface:** state chips + readiness checklist
- **Desktop/Mobile behavior:** three separate state families; derived readiness near session only.
- **Required state:** no second checklist record; three item classes.
- **Required copy:** state values and readiness items as quoted.
- **Authoritative data source:** derived from current records.
- **Action contract:** read-only derivation.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule → Session Detail · **Linked assets:** A25, A27, A66
- **Current implementation files:** session state exists; communication/confirmation families + readiness derivation missing.
- **Current status:** partial
- **Batch:** B7 · **Automated test:** derivation correctness · **Browser test:** readiness variants · **Screenshot:** session detail
- **Approval gate:** PO-visual

#### JR-14.13-01
- **Source heading:** 14.13 Read-only financial context
- **Exact source text:** "Before a session, FitDesk may show: Package session — 3 remaining / Pay per session — USD 40 / Balance due — USD 80 / Payment expected today. This context comes through the approved ERP-authoritative read path. Payment expected ≠ payment received ≠ invoice paid. The preparation view never creates a Payment Entry or changes the account balance."
- **Journey stage:** Prepare · **Persona:** Trainer · **Trigger:** pre-session view
- **Route:** Session Detail / brief · **Surface:** financial context chips
- **Desktop/Mobile behavior:** read-only chips as quoted.
- **Required state:** expected vs received vs paid distinct.
- **Required copy:** patterns as quoted.
- **Authoritative data source:** ERP read path.
- **Action contract:** strictly read-only.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Schedule → Session Detail · **Linked assets:** A27
- **Current implementation files:** partial financial context in session views.
- **Current status:** partial
- **Batch:** B7 · **Automated test:** read-only guarantee · **Browser test:** chip states · **Screenshot:** context chips
- **Approval gate:** none

#### JR-14.14-01 (FUTURE-GATED)
- **Source heading:** 14.14 Optional arrival and occurrence communication overrides
- **Exact source text:** "`Client arrived` is a pilot-only operational timestamp: Scheduled → Arrived → Completed. Arrival never: completes the session; deducts a package unit; creates an invoice; records payment. Occurrence-specific communication preference: Use client default / WhatsApp for this session / Phone call for this session / No reminder for this session. The override applies only to the occurrence and never silently changes consent, the client default, or future recurring sessions."
- **Ruling:** Client-arrived = PILOT VALIDATION FIRST; occurrence contact override = PRODUCTION-HARDENING (14.16). Excluded from B7; recorded to prevent invention.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-14.15-01 (FUTURE-GATED)
- **Source heading:** 14.15 Source freshness
- **Exact source text:** "Reused context must expose source and freshness where staleness matters: Usual location / Updated 3 months ago … Suggested states: Current / Needs review / Unknown / Occurrence-specific. FitDesk must not silently reuse old access details, safety context, or client preparation forever."
- **Ruling:** Source/freshness indicators = PRODUCTION-HARDENING per 14.16 (except Next focus staleness, which is MVP via JR-13.8-01).
- **Current status:** future-gated (hardening) · **Batch:** post-B15 · **Approval gate:** PO-decision

#### JR-14.16-01 (GOVERNANCE)
- **Source heading:** 14.16 Delivery priority
- **Exact source text:** (table lines 2542–2560) "Session location with reusable record and occurrence snapshot — MVP / PILOT-SAFE. Session type — MVP / PILOT-SAFE. Next-session focus — MVP / PILOT-SAFE. Trainer preparation note — MVP / PILOT-SAFE. Client usual booking defaults — MVP / PILOT-SAFE. Access/arrival instructions — MVP / PILOT-SAFE. Booking vs communication vs confirmation state separation — MVP / PILOT-SAFE. Read-only payment context — MVP / PILOT-SAFE. Equipment, client preparation, readiness, trainer reminder — PRODUCTION-HARDENING. Availability preference and occurrence contact override — PRODUCTION-HARDENING. Source/freshness indicators — PRODUCTION-HARDENING. Series inheritance and occurrence overrides — PRODUCTION-HARDENING. Client-arrived state — PILOT VALIDATION FIRST. Time flexibility — VALIDATE BEFORE BROAD ADOPTION. Multiple trainer reminders — VALIDATE BEFORE BROAD ADOPTION. Weather advisory — FUTURE / ADVISORY ONLY. Gap optimization using flexibility — FUTURE / RECOMMENDATION ONLY."
- **Ruling:** binding scope contract for B7 — the eight MVP/PILOT-SAFE capabilities are in-batch; everything else excluded without PO-decision.
- **Current status:** governance · **Batch:** B7 scope contract · **Approval gate:** PO-decision to pull items forward
- **Note:** 14.12's derived readiness checklist appears in the hardening row ("Equipment, client preparation, readiness, trainer reminder — PRODUCTION-HARDENING") while 14.12 describes it as part of the state model → recorded as conflict CR-07 (readiness checklist scope ambiguity).

## Section 15 — Structured Flexibility and Exception Decisions

#### JR-15.1-01 (GOVERNANCE)
- **Source heading:** 15.1 Product doctrine
- **Exact source text:** "FitDesk protects the trainer with safe defaults and non-negotiable safety, conflict, and accounting boundaries. When a legitimate exception exists, FitDesk allows the trainer to override only a soft operational rule—explicitly, with visible before-and-after consequences, the smallest practical scope, a structured reason, and an auditable, idempotent result—without silently changing the default policy. This is **structured flexibility**, not unrestricted override behavior."
- **Ruling:** doctrine governing all exception UI (B7/B9/B14).
- **Current status:** governance · **Batch:** B14 design contract · **Approval gate:** none

#### JR-15.2-01
- **Source heading:** 15.2 Rule levels
- **Exact source text:** "**Hard block** — Cannot be overridden in the current flow. Show the reason and safe recovery actions. (Actual session overlap, missing mandatory safety clearance, explicit financial hold, invalid accounting mutation.) **Soft constraint** — Safe default plus a deliberate, scoped trainer exception. (Time buffer, working hours, no-show consequence waiver, one-time grace use.) **Advisory** — Informational guidance that does not block submission. (Outstanding-balance warning when no financial hold exists.) **Allowed alternate path** — A valid domain route, not an override. (Book an assessment session while goals/setup are incomplete.) The domain layer returns the rule level. The UI renders it; UI components do not reclassify domain rules."
- **Journey stage:** Exception framework · **Persona:** Trainer · **Trigger:** any rule hit
- **Route:** all exception surfaces · **Surface:** rule-level rendering
- **Desktop/Mobile behavior:** four levels rendered distinctly; UI never reclassifies.
- **Required state:** level from domain layer.
- **Required copy:** n/a (level-appropriate framing)
- **Authoritative data source:** domain rule responses.
- **Action contract:** UI renders only.
- **Confirmation requirement:** per level (JR-15.3-01).
- **Recovery requirement:** hard block shows safe recovery actions.
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** engine returns structured conflicts; four-level vocabulary not formalized.
- **Current status:** partial
- **Batch:** B14 · **Automated test:** level rendering matrix · **Browser test:** each level · **Screenshot:** A81
- **Approval gate:** none

#### JR-15.3-01
- **Source heading:** 15.3 Exception interaction contract
- **Exact source text:** (flowchart lines 2585–2607) "Advisory → Explain context → Continue to normal review. Soft constraint → Explain default rule and why it exists → Show normal result and proposed exception result → Select structured reason → Choose bounded scope → Review before and after consequences → Trainer confirms exception → Execute with version and idempotency guards → Write result and audit event. Hard block → Explain non-overridable boundary → Offer safe recovery actions only. Allowed alternate path → Explain valid alternate journey → Trainer chooses alternate path. A soft exception remains inside the current contextual workflow. It does not send the trainer to an unrelated warning page."
- **Journey stage:** Exception framework · **Persona:** Trainer · **Trigger:** rule hit
- **Route:** in-context (never a separate warning page) · **Surface:** shared exception interaction component
- **Desktop/Mobile behavior:** per-level sequence as quoted, inline in the current workflow.
- **Required state:** soft path = 8 steps ending in audit event.
- **Required copy:** n/a
- **Authoritative data source:** domain rules.
- **Action contract:** version + idempotency guarded execution.
- **Confirmation requirement:** before/after consequence review.
- **Recovery requirement:** audit event written with result.
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** no shared exception component.
- **Current status:** missing
- **Batch:** B14 (component) consumed by B7/B9 · **Automated test:** per-level flow · **Browser test:** soft path E2E · **Screenshot:** A81
- **Approval gate:** PO-visual

#### JR-15.4-01
- **Source heading:** 15.4 Reason and scope rules
- **Exact source text:** "Use structured reason codes whenever possible: Same location — no travel / Online sessions / Medical emergency / Trainer caused cancellation / First approved exception / Approved relationship exception / Other. Rules: Only `Other` or a high-risk financial adjustment requires a typed note. Default scope is the smallest practical scope, normally one booking or occurrence. Series-level scope requires an explicit preview and separate confirmation. An exception never silently changes the default workspace policy."
- **Journey stage:** Exception framework · **Persona:** Trainer · **Trigger:** soft exception
- **Route:** exception component · **Surface:** reason + scope controls
- **Desktop/Mobile behavior:** structured codes; typed note only for Other/high-risk.
- **Required state:** smallest-practical default scope.
- **Required copy:** reason codes VERBATIM as quoted.
- **Authoritative data source:** n/a · **Action contract:** no silent policy change.
- **Confirmation requirement:** series scope separately confirmed.
- **Recovery requirement:** n/a
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** none.
- **Current status:** missing
- **Batch:** B14 · **Automated test:** note requirement matrix · **Browser test:** reason selection · **Screenshot:** controls
- **Approval gate:** none

#### JR-15.5-01
- **Source heading:** 15.5 Review contract
- **Exact source text:** "Before a consequential exception, show: Normal rule / Normal result / Applied exception / Result after exception / Reason / Scope / Related records / Confirm. Financial, package, scheduling, and safety-adjacent actions must be reviewable before mutation. Confirmed or submitted financial history is corrected through approved accounting flows, never by silently rewriting the original record."
- **Journey stage:** Exception framework · **Persona:** Trainer · **Trigger:** consequential exception
- **Route:** exception component review step · **Surface:** review block
- **Desktop/Mobile behavior:** eight-field review as quoted.
- **Required state:** review precedes mutation.
- **Required copy:** field structure as quoted.
- **Authoritative data source:** rule + records.
- **Action contract:** corrections via approved accounting flows only.
- **Confirmation requirement:** Confirm is final field.
- **Recovery requirement:** n/a
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** none.
- **Current status:** missing
- **Batch:** B14 · **Automated test:** field presence · **Browser test:** review render · **Screenshot:** review block
- **Approval gate:** PO-visual

#### JR-15.6-01 (PROTECTED/ENGINEERING)
- **Source heading:** 15.6 Audit and idempotency contract
- **Exact source text:** "Recommended decision/audit vocabulary: eventType / ruleCode / ruleVersion / tenantId / affectedEntityType / affectedEntityId / originalState / approvedState / reasonCode / reasonNote / scope / performedBy / performedAt / relatedEntityIds / decisionId / idempotencyKey / expectedVersion / result. Rules: `ruleVersion` identifies the policy that was active when the exception was approved. Free-text notes must not collect unnecessary sensitive detail. Retrying after a timeout must not duplicate a booking, package deduction, invoice, payment, or audit event. The audit event references the same decision/operation identity as the mutation. One-window UX never hides step-level uncertainty."
- **Ruling:** audit/idempotency vocabulary for the B14 exception library; extends existing scheduling idempotency contracts (protected).
- **Current status:** missing (vocabulary not formalized) · **Batch:** B14 · **Approval gate:** none

#### JR-15.7-01 (GOVERNANCE)
- **Source heading:** 15.7 Exception journey portfolio
- **Exact source text:** (18-row table lines 2684–2703) "Time-buffer exception — APPROVED JOURNEY REQUIREMENT; VERIFY AT ADOPTION. Location-confidence confirmation — MVP / PILOT-SAFE NEXT. Outside-working-hours booking — MVP / PILOT-SAFE NEXT. Recurring exception scope — MVP / PILOT-SAFE NEXT. Goal soft conflict — MVP / GOAL-SYSTEM SCOPE. Missing goals/setup — MVP / PILOT-SAFE NEXT. Cancellation/no-show waiver — PRODUCTION-HARDENING SOON. Package exhausted at completion — PRODUCTION-HARDENING SOON — HIGH PRIORITY. Package-expiry grace use — PRODUCTION-HARDENING SOON. Overdue-payment booking — PRODUCTION-HARDENING SOON. Client deactivation with unresolved work — PRODUCTION-HARDENING SOON. Session-price exception — PRODUCTION-HARDENING SOON. Partial payment — PRODUCTION-HARDENING SOON / PILOT-DEMAND GATE. Duration-based pricing — FUTURE / DEMAND-GATED. AI-prepared exception explanation — FUTURE / APPROVAL-GATED. Predictive exception suggestion — FUTURE / APPROVAL-GATED. Multi-trainer financial approval threshold — FUTURE / MULTI-SEAT-GATED. Generic configurable rules engine — FUTURE — DO NOT BUILD NOW."
- **Ruling:** binding scope table for exception work. MVP batch scope = time-buffer, location-confidence, working-hours, recurring scope, goal soft conflict, missing-goals alternate path. Hardening/future rows excluded. **Note:** 13.6 waiver and 13.7 package-exhausted resolver are classified PRODUCTION-HARDENING here while their §13 rows describe them inside the completion journey → recorded as conflict CR-08 (batch placement decision).
- **Current status:** governance · **Batch:** B7/B9/B14 scope contract · **Approval gate:** PO-decision for hardening rows

#### JR-15.8-01
- **Source heading:** 15.8 Accounting and safety boundaries
- **Exact source text:** "Never treat these as ordinary soft overrides: actual session overlap; missing mandatory safety clearance; hard goal contradiction; explicit financial hold; negative package balance; overpayment without approved customer-credit handling; silent conversion of billing mode; mutation of submitted or paid invoice history; AI execution of an override. Financial corrections follow the ERP-authoritative path: Draft invoice → normal review/correction. Submitted unpaid invoice → approved cancel/amend process. Paid invoice → credit note / correction / refund process."
- **Journey stage:** Guardrail · **Persona:** Trainer · **Trigger:** any of the nine listed conditions
- **Route:** all exception surfaces · **Surface:** hard-block rendering
- **Desktop/Mobile behavior:** nine conditions always hard-block; correction paths per invoice state.
- **Required state:** hard-block classification immutable in UI.
- **Required copy:** n/a
- **Authoritative data source:** domain rules + ERP correction flows.
- **Action contract:** ERP-authoritative correction paths only.
- **Confirmation/Recovery:** safe recovery actions only.
- **Linked sitemap node:** shared library; Billing · **Linked assets:** A81
- **Current implementation files:** engine hard conflicts exist; full nine-condition coverage to verify.
- **Current status:** partial
- **Batch:** B14 guard + B11 · **Automated test:** nine-condition block matrix · **Browser test:** sample blocks · **Screenshot:** hard block
- **Approval gate:** none

#### JR-15.9-01 (GOVERNANCE)
- **Source heading:** 15.9 Implementation strategy
- **Exact source text:** "Do not build a generic rules platform now. Implement explicit domain rules first: 1. Time buffer 2. Working hours 3. Goal conflict 4. No-show waiver. Then extract only proven common pieces: shared RuleDecision response types / shared reason and scope controls / shared review UI / shared audit vocabulary / shared idempotency/expected-version contract. The existing scheduling engine, booking service, repository, and structured conflict responses remain authoritative for booking logic. Business logic does not move into a generic UI component."
- **Ruling:** sequencing constraint for B7/B14 — explicit rules first, extraction second; engine authority protected.
- **Current status:** governance · **Batch:** B7/B14 sequencing · **Approval gate:** none

## Section 16 — Goals and Safety Sub-Journey

#### JR-16.1-01
- **Source heading:** 16.1 Goal journey
- **Exact source text:** (flowchart lines 2759–2783) "Capture goals and safety → Select one or more of 19 goals → First selected goal becomes primary → Configure client-stated sub-goals → Configure trainer-assessed sub-goals → Set urgency: Urgent / Warm / Background → Optional trainer notes → More selected goals? … Review all selected goals → Run conflict rules → Hard conflict? Yes: Block save until resolved → Run safety rules → Safety review needed? Yes: Set visible safety state and review action / No: Save clear state → Save full structured goal profile → Show goal summary in Client Hub. FUTURE → Program mapping / generation"
- **Journey stage:** Goals/safety · **Persona:** Trainer · **Trigger:** goal capture (Add Client step 3 or Client Hub)
- **Route:** Client Hub → Goals & Safety · **Surface:** goal capture flow
- **Desktop/Mobile behavior:** full flow as diagrammed; per-goal configuration loop.
- **Required state:** hard conflict blocks save; safety state visible after save.
- **Required copy:** urgency labels "Urgent / Warm / Background".
- **Authoritative data source:** local goal/safety ownership (JR-3.3-01).
- **Action contract:** goal system services (existing — FITDESK_GOAL_SYSTEM.md governs details).
- **Confirmation requirement:** review of all selected goals before save.
- **Recovery requirement:** blocked save loops back to review.
- **Linked sitemap node:** Client Hub → Goals & Safety · **Linked assets:** A05, A07, A40
- **Current implementation files:** `features/goals/` (goal system functional closure audit passed 2026-07).
- **Current status:** partial (system built; hub presentation per assets pending)
- **Batch:** B8 · **Automated test:** goal-system tests (exist, protected) · **Browser test:** capture loop · **Screenshot:** goals section
- **Approval gate:** PO-visual

#### JR-16.2-01
- **Source heading:** 16.2 As-built data split + 16.3 Single-primary rule + 16.4 Conflict handling + 16.5 Safety timing
- **Exact source text:** "**Client-stated sub-goals:** what the client says they want. **Trainer-assessed sub-goals:** what the trainer identifies through screening and professional judgment. The journey must preserve both layers. They must not be flattened into one generic list." … "Exactly one goal is primary when goals exist. Selecting a new primary automatically unsets the prior one. The primary goal is visible in review and Client Hub." … "Fat Loss + Muscle Gain: soft warning and prioritization/recomposition choice. Underweight/Safe Weight Gain + Fat Loss: hard conflict requiring resolution." … "Safety checks happen when goals are saved, not only when a future program is requested. Safety-sensitive goals include rehabilitation and pre/postnatal contexts."
- **Journey stage:** Goals/safety · **Persona:** Trainer · **Trigger:** goal edits
- **Route:** Client Hub → Goals & Safety · **Surface:** goal layers + primary marker + conflict prompts
- **Desktop/Mobile behavior:** two sub-goal layers rendered separately; primary visible; conflict prompts per level.
- **Required state:** single-primary invariant; save-time safety checks.
- **Required copy:** n/a
- **Authoritative data source:** goal system.
- **Action contract:** existing goal services (protected).
- **Confirmation requirement:** hard-conflict resolution required.
- **Recovery requirement:** n/a
- **Linked sitemap node:** Client Hub → Goals & Safety · **Linked assets:** A05, A40
- **Current implementation files:** `features/goals/` — invariants implemented.
- **Current status:** exact (behavior) / partial (presentation)
- **Batch:** B8 · **Automated test:** invariant tests (exist) · **Browser test:** layer rendering · **Screenshot:** goals section
- **Approval gate:** PO-visual

#### JR-16.6-01
- **Source heading:** 16.6 Assessment-session alternate path
- **Exact source text:** "Incomplete goals or setup do not automatically require a generic override. Client setup is incomplete. / [Book assessment session] / [Complete goals and safety]. An assessment or consultation is an allowed alternate journey. If mandatory safety clearance is missing, ordinary training remains blocked."
- **Journey stage:** Goals/safety (alternate path) · **Persona:** Trainer · **Trigger:** booking with incomplete setup
- **Route:** BookingSheet / Client Hub · **Surface:** alternate-path prompt
- **Desktop/Mobile behavior:** two quoted choices; assessment/consultation bookable; normal training safety-gated.
- **Required state:** allowed-alternate-path rule level (JR-15.2-01).
- **Required copy:** VERBATIM "Client setup is incomplete." + both action labels.
- **Authoritative data source:** goal/safety state.
- **Action contract:** assessment booking via canonical BookingSheet.
- **Confirmation requirement:** n/a (alternate path)
- **Recovery requirement:** n/a
- **Linked sitemap node:** Schedule → Booking; Client Hub · **Linked assets:** A28
- **Current implementation files:** none (prompt missing).
- **Current status:** missing
- **Batch:** B7/B8 · **Automated test:** gating matrix · **Browser test:** incomplete-setup booking · **Screenshot:** prompt
- **Approval gate:** PO-visual

#### JR-16.7-01 (FUTURE-GATED)
- **Source heading:** 16.7 Pilot Workout Builder boundary
- **Exact source text:** "AI-assisted program generation is approved for the pilot only as a **Constrained Workout Builder** after the required domain prerequisites are verified." … "It may not: publish without trainer confirmation; use an exercise outside the approved catalog; ignore unresolved safety state; diagnose a condition; define its own safety rules; invent equipment, measurements, or performance; silently change an approved program; change billing, packages, sessions, or messages; overwrite an approved version. Every approved program remains versioned."
- **Ruling:** pilot AI feature — excluded from B0–B15; recorded to prevent invention. Eligibility gate, flow, and expansion order quoted at source lines 2832–2867.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-16.8-01 (FUTURE-GATED)
- **Source heading:** 16.8 Future adaptive program boundary
- **Exact source text:** "Adaptive progression begins as advisory review, not autonomous mutation: Authoritative progress → deterministic signals → eligibility and data-quality gate → LLM prepares bounded options → trainer reviews structured diff → approved program-revision service. Autonomous program adaptation remains a separate far-future decision."
- **Ruling:** future — excluded; recorded.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

## Section 17 — Client Hub Operating Workspace and Lifecycle

#### JR-17.1-01
- **Source heading:** 17.1 Governing experience rule
- **Exact source text:** "Do not create a new module for every useful client view. Centralize client truth in one Client Hub, reveal the right context for the current moment, and launch one canonical, URL-backed workflow for each action. The Client Hub is a read-first operating surface, not a collection of embedded mutation forms. Understand current state → explain why it matters → show one next-safe action → preserve relevant alternatives → launch the canonical workflow → return to refreshed client context"
- **Journey stage:** Client Hub · **Persona:** Trainer · **Trigger:** open client
- **Route:** `/dashboard/clients/[id]` (canonical hub route per sitemap) · **Surface:** Client Hub
- **Desktop/Mobile behavior:** read-first hub; actions launch URL-backed canonical workflows and return to refreshed context.
- **Required state:** six-step grammar as quoted.
- **Required copy:** n/a
- **Authoritative data source:** per-section reads.
- **Action contract:** canonical workflows only, no embedded mutation forms.
- **Confirmation requirement:** in child workflows.
- **Recovery requirement:** refreshed context on return.
- **Linked sitemap node:** Clients → Client Hub · **Linked assets:** A05, A08, A40, A41, A75
- **Current implementation files:** `app/dashboard/clients/[id]/page.tsx` + `features/clients/` hub.
- **Current status:** partial
- **Batch:** B8 · **Automated test:** hub structure · **Browser test:** action round-trips · **Screenshot:** A05/A40
- **Approval gate:** PO-visual

#### JR-17.2-01
- **Source heading:** 17.2 Client Hub information architecture
- **Exact source text:** "Client Hub ├─ Today / Next Safe Action ├─ Goals & Safety ├─ Sessions & Recurring Schedule ├─ Progress ├─ Package & Billing ├─ Statement of Account ├─ Attendance ├─ Communication └─ Unified Activity. These are contextual sections in one client workspace. They are not separate primary application destinations. Actions render as URL-backed mobile bottom sheets/full-height sheets or desktop drawers/dialogs. Direct navigation may render a full page when appropriate."
- **Journey stage:** Client Hub · **Persona:** Trainer · **Trigger:** hub navigation
- **Route:** Client Hub sections (contextual, not primary destinations) · **Surface:** hub section navigation
- **Desktop/Mobile behavior:** all nine sections present as contextual sections; sheet/drawer action rendering.
- **Required state:** URL-backed sections/actions.
- **Required copy:** section labels VERBATIM: "Today / Next Safe Action", "Goals & Safety", "Sessions & Recurring Schedule", "Progress", "Package & Billing", "Statement of Account", "Attendance", "Communication", "Unified Activity".
- **Authoritative data source:** per-section.
- **Action contract:** per-section canonical flows.
- **Confirmation/Recovery:** per flows.
- **Linked sitemap node:** Clients → Client Hub (9 sections) · **Linked assets:** A05, A08, A40, A41
- **Current implementation files:** hub exists with different section set/labels.
- **Current status:** partial (sections incomplete/renamed; per 17.16 several sections are hardening-scope — see CR-09)
- **Batch:** B8 (MVP sections) · **Automated test:** section presence + labels · **Browser test:** section navigation · **Screenshot:** A05
- **Approval gate:** PO-visual

#### JR-17.3-01
- **Source heading:** 17.3 Client Today context
- **Exact source text:** "Today with Sarah / Session: 5:00–6:00 PM / Type: Standard training / Location: ABC Gym / Access: Studio 2 / Next focus: Review hip mobility / Preparation: Bring resistance bands / Primary goal: Fat loss / Recent concern: Mild knee discomfort / Package balance: 3 sessions / Payment state: Clear / Readiness: 1 optional item remaining. Primary actions: Open session / Review last progress / Send message. Rules: This is a contextual Client Hub state, not a separate 'Today' page. Safety and recovery concerns outrank commercial recommendations. The view reuses existing client, session, goal, package, billing, program, and progress data. Missing or unavailable information is shown honestly rather than guessed. Structured source data renders first; optional AI condensation never replaces the confirmed fields. Every generated sentence can be traced to a current source record or is labelled as an AI-prepared summary."
- **Journey stage:** Prepare · **Persona:** Trainer · **Trigger:** open client near session time
- **Route:** Client Hub (Today state) · **Surface:** Client Today context block
- **Desktop/Mobile behavior:** contextual emphasis state, not a separate page; field structure as quoted.
- **Required state:** honest missing-data display; safety outranks commercial.
- **Required copy:** field labels as quoted ("Today with <name>", "Next focus:", "Readiness:" etc.).
- **Authoritative data source:** existing records only.
- **Action contract:** three primary actions launch canonical flows.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Client Hub → Today · **Linked assets:** A05, A40
- **Current implementation files:** no Today-context state in hub at HEAD.
- **Current status:** missing
- **Batch:** B8 · **Automated test:** context assembly + honesty states · **Browser test:** near-session state · **Screenshot:** Today block
- **Approval gate:** PO-visual

#### JR-17.4-01
- **Source heading:** 17.4 Deterministic Next Safe Action
- **Exact source text:** "Safety prerequisite → Review safety. Uncertain mutation → Verify or recover. Unresolved session → Complete session. Explicit financial hold → Resolve hold. Package exhausted → Renew or change billing. Payment overdue → Record payment or send reminder. No next session → Book session. Otherwise → No urgent action. The recommendation: states why it appears; never executes automatically; does not hide valid alternatives; uses deterministic rules first; remains separate from future predictive ranking."
- **Journey stage:** Client Hub · **Persona:** Trainer · **Trigger:** hub open
- **Route:** Client Hub → Today / Next Safe Action · **Surface:** primary recommendation block
- **Desktop/Mobile behavior:** one explainable primary recommendation per quoted priority mapping.
- **Required state:** eight condition→action mappings, in order.
- **Required copy:** action labels as quoted.
- **Authoritative data source:** deterministic derivation.
- **Action contract:** recommendation links to canonical flow; never auto-executes.
- **Confirmation requirement:** in child flow.
- **Recovery requirement:** n/a
- **Linked sitemap node:** Client Hub → Today · **Linked assets:** A05, A40
- **Current implementation files:** none (Next Safe Action absent).
- **Current status:** missing — 17.16 marks implementation "MVP design direction / hardening implementation" (CR-09 scope note)
- **Batch:** B8 (design direction; full derivation hardening) · **Automated test:** priority mapping · **Browser test:** condition states · **Screenshot:** recommendation block
- **Approval gate:** PO-visual + PO-decision on derivation depth

#### JR-17.5-01
- **Source heading:** 17.5 Package and Billing Status
- **Exact source text:** "The Package & Billing section answers: What package or rate is active? How many sessions remain? When does the package expire? What has been consumed? What is the payment state? What should happen next? Example: 8-Session Package / Used: 6 / Remaining: 2 / Expires: 31 July / Payment: Paid. Contextual actions: Renew / Assign replacement / View usage history / Send renewal reminder / Open statement. Rules: Package template administration remains under Settings/Catalog. Client-specific package truth remains in Client Hub. Actions reuse canonical assignment, renewal, payment, message, and statement flows. Package exhaustion uses the explicit completion resolver; no negative balance is created silently."
- **Journey stage:** Client Hub · **Persona:** Trainer · **Trigger:** billing section view
- **Route:** Client Hub → Package & Billing · **Surface:** package status card + actions
- **Desktop/Mobile behavior:** six-question answer block; five contextual actions.
- **Required state:** template admin excluded (Settings/Catalog only).
- **Required copy:** field labels "Used / Remaining / Expires / Payment"; action labels as quoted.
- **Authoritative data source:** package + ERP reads.
- **Action contract:** canonical flow reuse.
- **Confirmation/Recovery:** per child flows.
- **Linked sitemap node:** Client Hub → Package & Billing; Settings → Catalog · **Linked assets:** A05, A07
- **Current implementation files:** package status in hub exists (C5/C6 work); action set differs.
- **Current status:** partial
- **Batch:** B8 · **Automated test:** action routing · **Browser test:** status card · **Screenshot:** billing section
- **Approval gate:** PO-visual

#### JR-17.6-01
- **Source heading:** 17.6 Recurring Schedule Manager
- **Exact source text:** "The Client Hub exposes the client's active recurring schedule: Every Monday and Wednesday / 5:00 PM / ABC Gym / 60 minutes / Valid until 30 September. Actions: Change future sessions / Pause series / Skip occurrence / End series. Scope: This occurrence only — default / This and future occurrences / Entire series. Before confirming future or series changes, FitDesk regenerates and previews affected sessions and reruns: actual overlaps; time buffers; working hours; location checks; timezone and DST; package availability; billing consequences; version checks. A one-occurrence location, price, duration, or buffer exception never spreads silently to the series."
- **Journey stage:** Client Hub · **Persona:** Trainer · **Trigger:** recurring schedule management
- **Route:** Client Hub → Sessions & Recurring Schedule · **Surface:** recurring schedule card + actions
- **Desktop/Mobile behavior:** schedule summary + four actions + shared scope selector (JR-14.4-01).
- **Required state:** regeneration + eight rechecks before series confirm.
- **Required copy:** action labels as quoted.
- **Authoritative data source:** engine regeneration (protected).
- **Action contract:** canonical scheduling actions.
- **Confirmation requirement:** preview before series changes.
- **Recovery requirement:** occurrence exceptions never spread.
- **Linked sitemap node:** Client Hub → Sessions · **Linked assets:** A05
- **Current implementation files:** recurring series data exists; manager UI missing.
- **Current status:** missing — 17.16: HIGH-PRIORITY PRODUCTION-HARDENING (CR-09 scope)
- **Batch:** B8 (read display) / hardening (mutations) per PO-decision · **Automated test:** recheck matrix · **Browser test:** scope flows · **Screenshot:** schedule card
- **Approval gate:** PO-decision (scope) + PO-visual

#### JR-17.7-01
- **Source heading:** 17.7 Resume Work queue
- **Exact source text:** "FitDesk uses **Resume Work**, not 'Inbox,' for unfinished trainer workflows. Include only: Saved booking draft / Incomplete session completion / Uncertain payment result / Unfinished package assignment / Message draft / Required recovery action. Do not include: general reminders; every overdue invoice; marketing announcements; completed notifications; low-value informational alerts. Each item shows: Why it is unfinished / What was safely saved / What is authoritative / What remains uncertain / Continue / Discard draft — only when reversible. Resume Work may be surfaced from Dashboard/Needs Attention and linked back to the relevant client or object. It must not become a second notification center."
- **Journey stage:** Recovery · **Persona:** Trainer · **Trigger:** unfinished workflow exists
- **Route:** Client Hub + Dashboard surfacing · **Surface:** Resume Work queue
- **Desktop/Mobile behavior:** six admissible item types; six-field item structure.
- **Required state:** never a general notification center.
- **Required copy:** label "Resume Work" (never "Inbox" for this queue); item fields as quoted.
- **Authoritative data source:** draft/uncertain-state records.
- **Action contract:** Continue re-enters canonical flow; Discard only when reversible.
- **Confirmation/Recovery:** items derive from recovery contract.
- **Linked sitemap node:** Client Hub; Dashboard · **Linked assets:** A81
- **Current implementation files:** none.
- **Current status:** missing — 17.16: HIGH-VALUE PRODUCTION-HARDENING (CR-09 scope)
- **Batch:** B14 foundation + hardening per PO-decision · **Automated test:** admissibility rules · **Browser test:** item lifecycle · **Screenshot:** queue
- **Approval gate:** PO-decision (scope) + PO-visual
- **Note:** the queue named "Resume Work" is distinct from the Inbox navigation destination (Sitemap). Naming collision recorded as CR-10.

#### JR-17.8-01
- **Source heading:** 17.8 Unified Progress and Activity history
- **Exact source text:** "Structured current state ├─ Active goals ├─ Measurements ├─ Safety status └─ Current next focus. Chronological history ├─ Session progress ├─ Measurement changes ├─ Goal updates ├─ Safety events ├─ Package and billing events ├─ Messages and delivery results └─ Trainer notes. Rules: The timeline explains how current state changed. Structured goals, measurements, and safety data remain authoritative outside free-text timeline entries. Quick progress entries come from the unified completion flow. Formal multi-session progress reports remain future/approval-gated. Timeline events deep-link to their canonical source or action."
- **Journey stage:** Client Hub · **Persona:** Trainer · **Trigger:** progress/activity view
- **Route:** Client Hub → Progress + Unified Activity · **Surface:** state block + timeline
- **Desktop/Mobile behavior:** structured state separated from chronological timeline; deep links.
- **Required state:** timeline event classes as quoted.
- **Required copy:** n/a
- **Authoritative data source:** structured records + event history.
- **Action contract:** deep-link to canonical sources.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Client Hub → Progress; Unified Activity · **Linked assets:** A07, A41
- **Current implementation files:** partial activity display in hub.
- **Current status:** partial — 17.16: PRODUCTION-HARDENING for full unified view (CR-09 scope)
- **Batch:** B8 (existing subset) + hardening · **Automated test:** event classes · **Browser test:** deep links · **Screenshot:** A07
- **Approval gate:** PO-decision (scope) + PO-visual

#### JR-17.9-01
- **Source heading:** 17.9 Factual Attendance Summary
- **Exact source text:** "The Attendance section uses neutral, factual language: Last 90 days / 12 of 15 scheduled sessions completed / Completed: 12 / Cancelled: 2 / No-show: 1 / Rescheduled: 3. Actions: Review missed sessions / Send follow-up / Adjust recurring schedule. Do not use: Reliable client / Unreliable client / Bad attendance. The period and denominator are always visible. Predictive retention or character judgments remain future-gated."
- **Journey stage:** Client Hub · **Persona:** Trainer · **Trigger:** attendance view
- **Route:** Client Hub → Attendance · **Surface:** attendance summary
- **Desktop/Mobile behavior:** factual counts with period + denominator always visible; three actions.
- **Required state:** no character labels ever.
- **Required copy:** count labels as quoted; FORBIDDEN copy: "Reliable client / Unreliable client / Bad attendance".
- **Authoritative data source:** session outcome history.
- **Action contract:** canonical flow links.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Client Hub → Attendance · **Linked assets:** A07, A41
- **Current implementation files:** none dedicated.
- **Current status:** missing (MVP / PILOT-SAFE per 17.16)
- **Batch:** B8 · **Automated test:** forbidden-copy assert; denominator presence · **Browser test:** summary render · **Screenshot:** attendance
- **Approval gate:** PO-visual

#### JR-17.10-01
- **Source heading:** 17.10 Client Pause, Resume, Reactivate, and Deactivate lifecycle
- **Exact source text:** "Pause client activity → choose start and expected resume dates → inspect future sessions → inspect recurring series → inspect package expiry → inspect outstanding balance → choose each consequence → preview → confirm. Separate decisions: Pause future sessions / Extend package expiry / Keep package expiry unchanged / Prepare client message. Pause is not archive, package cancellation, invoice cancellation, safety clearance, or automatic financial waiver." … Resume/Reactivate checklist: "Goals or safety review needed? / Package active or expired? / Outstanding balance? / Billing mode valid? / Next session booked? / Client confirmation prepared?" … Deactivate: "Before deactivation, show unresolved state: Future sessions / Recurring series / Outstanding invoices / Package balance / Saved drafts or prepared messages. The trainer resolves each item explicitly. Financial and scheduling history is preserved. Nothing is deleted silently."
- **Journey stage:** Lifecycle close/pause · **Persona:** Trainer · **Trigger:** pause/resume/deactivate
- **Route:** Client Hub lifecycle actions · **Surface:** pause flow + resume checklist + deactivation resolver
- **Desktop/Mobile behavior:** consequence-by-consequence pause; state-derived resume checklist; deactivation resolver with five unresolved-state classes.
- **Required state:** nothing deleted silently; history preserved.
- **Required copy:** decision/checklist items as quoted.
- **Authoritative data source:** derived from current records (no separate workflow record unless proven).
- **Action contract:** consequence choices route to canonical flows.
- **Confirmation requirement:** preview → confirm for pause; explicit resolution for deactivate.
- **Recovery requirement:** resumable checklist.
- **Linked sitemap node:** Client Hub lifecycle · **Linked assets:** A05
- **Current implementation files:** archive/deactivate basic path exists; resolver missing.
- **Current status:** missing (resolver) — 17.16: Pause/Resume PRODUCTION-HARDENING; Deactivation resolver MANDATORY PRODUCTION-HARDENING (CR-09 scope)
- **Batch:** B8 (basic deactivate honesty) + hardening resolver per PO-decision · **Automated test:** unresolved-state detection · **Browser test:** deactivation with open items · **Screenshot:** resolver
- **Approval gate:** PO-decision (scope) + PO-visual

#### JR-17.11-01 (FUTURE-GATED)
- **Source heading:** 17.11 Payment Promise and Installment boundaries
- **Exact source text:** "A Payment Promise is an operational expectation, not an accounting mutation: Outstanding balance: USD 80 / Expected payment: 25 July / Promise status: Active. States: Active / Due today / Missed / Resolved by confirmed payment / Cancelled by trainer. Rules: The invoice remains outstanding until an authoritative Payment Entry exists. Store amount, expected date, status, and optional note; do not rely on free text alone. Payment Promise is pilot-validation-gated." … "Changing an expected installment never rewrites historical payments or marks money received."
- **Ruling:** PILOT VALIDATION FIRST (17.16) — excluded from batches; recorded.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-17.12-01 (HARDENING SCOPE)
- **Source heading:** 17.12 Receipt and Proof of Payment
- **Exact source text:** "After a confirmed payment: Confirmed ERP payment → authoritative refresh → receipt preview → download or trainer-confirmed send → return to Statement of Account. Receipt content: client; amount and date; payment method; ERP/payment reference; invoice allocation, including multiple invoices when applicable; remaining balance; workspace/trainer identity. The receipt is generated from confirmed ERP state, never optimistic form values."
- **Ruling:** NEAR-TERM / PRODUCTION-HARDENING (17.16) — excluded from MVP batches; recorded.
- **Current status:** future-gated (hardening) · **Batch:** post-B15 · **Approval gate:** PO-decision

#### JR-17.13-01 (HARDENING SCOPE)
- **Source heading:** 17.13 Financial Correction Resolver
- **Exact source text:** "FitDesk asks what requires correction: Duplicate payment / Wrong invoice allocation / Wrong method or reference / Invoice amount incorrect / Refund needed / Credit required. Then it routes to the approved ERP-authoritative path: Draft correction / Cancel or amend / Reallocation / Credit note / Refund. Rules: Raw accounting administration remains hidden from the normal trainer workflow. Submitted or paid records are never silently edited. The trainer reviews the correction impact before confirmation. Every correction is versioned, idempotent where applicable, and auditable. This is required production hardening, not a frequent daily surface."
- **Ruling:** MANDATORY BEFORE BROAD PRODUCTION (17.16) but explicitly "required production hardening" — excluded from MVP batches; recorded with high priority for the hardening phase.
- **Current status:** future-gated (mandatory hardening) · **Batch:** post-B15 (first hardening item) · **Approval gate:** PO-decision

#### JR-17.14-01
- **Source heading:** 17.14 Communication history and contextual message packs
- **Exact source text:** "Client Hub activity shows client-specific sent messages and delivery results. A global Sent Messages log supports operational delivery review and failed sends. There is no inbound inbox while FitDesk remains outbound-only. Message packs: Booking confirmation / Session reminder / Payment reminder / Package renewal / No-show follow-up / Welcome message / Progress encouragement. Canonical flow: Reason → retrieve live authoritative context → prepare editable message → trainer reviews → trainer confirms → send → log result. Messages reuse current session time, location, balance due, invoice reference, package balance, and expiry rather than asking the trainer to retype known data."
- **Journey stage:** Communication · **Persona:** Trainer · **Trigger:** message send need
- **Route:** Client Hub → Communication; Inbox (global log) · **Surface:** message packs + composer + logs
- **Desktop/Mobile behavior:** seven message packs; canonical seven-step flow; live-context prefill.
- **Required state:** outbound-only; delivery results visible per client + globally.
- **Required copy:** pack names VERBATIM as quoted.
- **Authoritative data source:** live authoritative context bundle.
- **Action contract:** canonical composer (JR-5.9-01).
- **Confirmation requirement:** trainer review + confirm per send.
- **Recovery requirement:** failed sends visible in global log.
- **Linked sitemap node:** Client Hub → Communication; Inbox · **Linked assets:** A06, A12, A13, A50, A51
- **Current implementation files:** `app/dashboard/messages/[clientId]/`, `actions/messages.ts`; packs/prefill absent; no global log.
- **Current status:** partial — full communication history: PRODUCTION-HARDENING (17.16); packs: "MVP upgrade after canonical composer"
- **Batch:** B10 · **Automated test:** pack prefill integrity · **Browser test:** pack → send → log · **Screenshot:** A12
- **Approval gate:** PO-visual

#### JR-17.15-01 (FUTURE-GATED)
- **Source heading:** 17.15 Future scheduling assistance
- **Exact source text:** "Gap Optimizer … It never reserves or books automatically. Travel-aware scheduling — Adopt in stages: 1. Structured location records 2. Same-location confidence 3. Manual travel-duration setting 4. External travel estimates 5. Travel-aware suggestions. Session delay handling … Never use one opaque button to shorten, move, and message multiple sessions."
- **Ruling:** FUTURE (17.16) — excluded; recorded.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-17.16-01 (GOVERNANCE)
- **Source heading:** 17.16 Delivery status
- **Exact source text:** (table lines 3416–3441) "Client Today context inside Client Hub — MVP / PILOT-SAFE. Deterministic Next Safe Action — MVP design direction / hardening implementation. Package & Billing Status — MVP read context / high-priority hardening. Basic factual attendance summary — MVP / PILOT-SAFE. Contextual message packs — MVP upgrade after canonical composer. Receipt after confirmed payment — NEAR-TERM / PRODUCTION-HARDENING. Recurring Schedule Manager — HIGH-PRIORITY PRODUCTION-HARDENING. Resume Work queue — HIGH-VALUE PRODUCTION-HARDENING. Unified Progress and Activity — PRODUCTION-HARDENING. Pause / Resume / Reactivate — PRODUCTION-HARDENING. Deactivation resolver — MANDATORY PRODUCTION-HARDENING. Communication history and delivery status — PRODUCTION-HARDENING. Financial Correction Resolver — MANDATORY BEFORE BROAD PRODUCTION. Payment Promise — PILOT VALIDATION FIRST. Installment view — DEMAND-GATED HARDENING. Gap Optimizer — FUTURE / RECOMMENDATION-ONLY. Travel-time estimation — FUTURE; STRUCTURED LOCATIONS FIRST. Session-delay orchestration — FUTURE AFTER SCHEDULING AND MESSAGING HARDENING. Structured session location, type, focus, preparation, defaults, and access context — MVP / PILOT-SAFE. Derived readiness and clear session/communication/confirmation states — MVP DIRECTION / HARDENING VALIDATION. Equipment, client preparation, reminder, and availability preferences — PRODUCTION-HARDENING. Arrival timestamp and time flexibility — PILOT VALIDATION FIRST. Weather/environment advisory — FUTURE / ADVISORY ONLY."
- **Ruling:** binding scope contract for B8 (and cross-cutting B7/B10/B14). MVP in-batch: Client Today context, attendance summary, package/billing read context, session context fields; message packs after composer (B10). Hardening rows excluded from B0–B15 unless PO pulls forward. The tension between 17.2's nine-section IA and this table's hardening classifications is CR-09.
- **Current status:** governance · **Batch:** B8 scope contract · **Approval gate:** PO-decision for hardening rows

## Section 18 — Operational Disruption, Explainability, and Recovery

#### JR-18.1-01 (GOVERNANCE)
- **Source heading:** 18.1 Governing operating model
- **Exact source text:** "Preserve intended state → detect divergence → calculate impact → explain affected truth → choose explicit scope → coordinate canonical workflows → verify each result → surface unresolved exceptions. These capabilities remain embedded in Schedule, Client Hub, Dashboard/Needs Attention, Settings, and canonical resolvers. They are not separate top-level applications."
- **Ruling:** structural rule — no new top-level destinations for recovery capabilities; binds sitemap placement of all §18 features.
- **Current status:** governance · **Batch:** B14 doctrine · **Approval gate:** none

#### JR-18.2-01
- **Source heading:** 18.2 Dated trainer-availability exceptions
- **Exact source text:** "Normal working hours remain the recurring baseline. A dated exception changes availability for a specific date or period only." … examples: "Available this Saturday / 10:00 AM–2:00 PM — Unavailable next Monday / All day — Temporary venue availability / Tuesday, 4:00–8:00 PM" … "Rules: A dated exception never rewrites recurring weekly hours. Existing confirmed sessions are not silently cancelled. Overlapping confirmed sessions become affected items requiring review. Timezone and DST behavior reuse the canonical scheduling engine. One-off behavior ships before recurring exception patterns. The exception itself is versioned and auditable."
- **Journey stage:** Disruption · **Persona:** Trainer · **Trigger:** availability change need
- **Route:** Settings (working hours) + Schedule · **Surface:** dated-exception editor + affected-item review
- **Desktop/Mobile behavior:** exception forms per examples; overlapping sessions become review items.
- **Required state:** versioned, auditable exceptions; no silent cancellation.
- **Required copy:** n/a (structural)
- **Authoritative data source:** scheduling engine (protected).
- **Action contract:** canonical scheduling contracts.
- **Confirmation requirement:** review of affected items.
- **Recovery requirement:** unresolved overlaps surfaced.
- **Linked sitemap node:** Settings → Working hours; Schedule · **Linked assets:** A29, A79
- **Current implementation files:** working-hours settings exist (`app/dashboard/settings/`); dated exceptions missing.
- **Current status:** missing (MVP / PILOT-SAFE per 18.18)
- **Batch:** B12 (editor) + B7 (schedule impact) · **Automated test:** no-rewrite + overlap detection · **Browser test:** exception creation + affected review · **Screenshot:** editor
- **Approval gate:** PO-visual

#### JR-18.3-01 (HARDENING SCOPE)
- **Source heading:** 18.3 Trainer Time-Off and Day Disruption Manager
- **Exact source text:** "Declare disruption → calculate impact → resolve affected work." … "Per-session choices: Reschedule / Cancel with reviewed consequence / Keep as an explicit exception / Prepare client message / Leave unresolved for later review. Execution contract: create an immutable impact snapshot; require explicit selected scope; recheck versions before each mutation; execute scheduling, package, billing, and messaging effects through their canonical contracts; preserve per-item success, failure, skipped, and uncertain results; use idempotency keys; never bulk-message without trainer review; finish with a before/after summary and unresolved-item list. There is no opaque `Cancel everything and notify everyone` action."
- **Ruling:** HIGH-PRIORITY HARDENING (18.18) — excluded from MVP batches; recorded.
- **Current status:** future-gated (hardening) · **Batch:** post-B15 · **Approval gate:** PO-decision

#### JR-18.4-01 (FUTURE-GATED)
- **Source heading:** 18.4 Open Slot Recovery
- **Exact source text:** "Slot becomes available → derive eligible candidates → explain why each candidate appears → trainer selects one client → open canonical BookingSheet → revalidate → trainer confirms → optionally prepare message." … "Guardrails: Opening suggestions does not reserve the slot. No first-come message blast. One client never sees another client's identity or schedule. … Status: **controlled experiment after scheduling hardening**."
- **Ruling:** CONTROLLED EXPERIMENT — excluded; recorded.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-18.5-01
- **Source heading:** 18.5 Explainable decisions contract
- **Exact source text:** "Every domain block, warning, recommendation, and derived status returns structured explanation data: { ruleCode, ruleVersion, level, title, explanation, relatedEntityIds, consequences, allowedActions }. The UI renders: What happened? Why? Which records or rules matter? What remains unchanged? What can the trainer safely do next? Example: Booking blocked / Why / The proposed time overlaps an existing confirmed session. / Relevant time / Existing: 4:30–5:30 PM / Proposed: 5:00–6:00 PM / Safe actions / Choose another time / Open existing session / Cancel. Privacy rule: shared or client-visible surfaces do not expose another client's identity unless operationally necessary and authorized. The UI never invents explanations from raw exception strings."
- **Journey stage:** Explainability · **Persona:** Trainer · **Trigger:** any block/warning
- **Route:** all resolvers · **Surface:** shared explanation component
- **Desktop/Mobile behavior:** five-question render structure; example pattern as quoted.
- **Required state:** structured explanation payload; privacy filtering.
- **Required copy:** rendering structure as quoted.
- **Authoritative data source:** domain explanation payloads.
- **Action contract:** allowedActions drive safe-action buttons.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** structured conflicts exist in engine; shared explanation component missing.
- **Current status:** missing (component) — MVP / DESIGN-SYSTEM DOCTRINE per 18.18
- **Batch:** B14 · **Automated test:** payload rendering + privacy filter · **Browser test:** blocked-booking example · **Screenshot:** A81
- **Approval gate:** PO-visual

#### JR-18.6-01
- **Source heading:** 18.6 Safe Undo, correction, and compensating action
- **Exact source text:** "Undo → immediate local effect → reliably reversible → no external or accounting consequence. Correction → authoritative effect exists → approved mutation path repairs it. Compensating action → original external or financial effect cannot be erased → a new authoritative action offsets or supersedes it. Good Undo candidates: Draft discarded / Attention item dismissed / Filter changed / Reminder draft removed / Local note archived / Optional view change. Not eligible for casual Undo: Submitted invoice / Confirmed Payment Entry / Package unit consumed / WhatsApp message sent / Credit note issued / Cancellation already communicated. Undo eligibility is owned by the domain contract, not guessed by the UI."
- **Journey stage:** Recovery · **Persona:** Trainer · **Trigger:** reversal need
- **Route:** all surfaces · **Surface:** undo affordances
- **Desktop/Mobile behavior:** undo only for the six quoted candidate classes.
- **Required state:** domain-owned eligibility.
- **Required copy:** n/a
- **Authoritative data source:** domain contracts.
- **Action contract:** correction/compensating flows for authoritative effects.
- **Confirmation/Recovery:** as quoted.
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** no formal undo-eligibility contract.
- **Current status:** missing (as formal rule) — MVP DOMAIN/DESIGN-SYSTEM RULE per 18.18
- **Batch:** B14 · **Automated test:** eligibility matrix · **Browser test:** undo candidates · **Screenshot:** n/a
- **Approval gate:** none

#### JR-18.7-01 (HARDENING SCOPE)
- **Source heading:** 18.7 Package Runway
- **Exact source text:** "Available units: 4 / Confirmed future sessions: 3 / Unallocated units after bookings: 1 / Based on confirmed sessions, exhaustion: 5 August / Package expiry: 31 August. States: Enough for confirmed sessions / Exactly covers confirmed sessions / Insufficient for confirmed sessions / Expires before scheduled use / Unused units remain at expiry / No future sessions booked." … "It is deterministic, not predictive AI. Actions: Renew package / Review bookings / Send renewal reminder / Open package history."
- **Ruling:** HIGH-PRIORITY HARDENING (18.18) — excluded from MVP batches; recorded.
- **Current status:** future-gated (hardening) · **Batch:** post-B15 · **Approval gate:** PO-decision

#### JR-18.8-01 (HARDENING SCOPE)
- **Source heading:** 18.8 Just-in-Time Client Data Quality Resolver
- **Exact source text:** "FitDesk does not display a generic profile-completion percentage. It surfaces missing or uncertain truth only when it affects a meaningful task: Next in-person session has no location / Billing mode is unset before completion / Safety review required before assessment / Communication consent unknown before reminder / Possible duplicate identity / Package insufficient for next confirmed session. Each item shows: Why it matters / What is missing or uncertain / Primary resolver / Safe alternative."
- **Ruling:** HIGH-VALUE HARDENING (18.18) — excluded; the negative rule (no profile-completion percentage) binds B8 immediately.
- **Current status:** future-gated (hardening); the "no completion %" prohibition applies now · **Batch:** B8 guard + post-B15 · **Approval gate:** PO-decision

#### JR-18.9-01 (HARDENING SCOPE)
- **Source heading:** 18.9 Duplicate Client Identity Resolver
- **Exact source text:** "Possible duplicate → compare identities and relationships → choose survivor → preview transferred/relinked records → identify hard conflicts → confirm controlled consolidation → preserve alias and lineage." … "Hard boundaries: Cross-tenant merge is always blocked. … Status: **mandatory hardening before imports or high-volume adoption**."
- **Ruling:** MANDATORY HARDENING BEFORE IMPORTS (18.18) — excluded from MVP; duplicate *detection* at creation is MVP (JR-12.1-01); consolidation resolver is the gated part.
- **Current status:** future-gated (mandatory hardening) · **Batch:** post-B15 · **Approval gate:** PO-decision

#### JR-18.10-01
- **Source heading:** 18.10 Smart Client Views
- **Exact source text:** "The Clients screen may expose fixed deterministic views: Training today / No next session / Package low / Package exhausted / Payment overdue / Paused / Recently inactive / Safety review needed / Setup needs attention. Rules: A view is a filter, not a client status. Each view explains its inclusion rule. Counts distinguish current, stale, partial, unavailable, and unknown states. URL state preserves filters. Being added to or removed from a view never mutates the client. Custom views come later. Predictive labels such as 'likely to churn' remain future-gated."
- **Journey stage:** Clients list · **Persona:** Trainer · **Trigger:** client filtering
- **Route:** Clients (list) with URL-preserved filters · **Surface:** view chips/filters
- **Desktop/Mobile behavior:** nine fixed deterministic views; explained inclusion rules; honest counts.
- **Required state:** URL-preserved; views never mutate clients.
- **Required copy:** view names VERBATIM as quoted.
- **Authoritative data source:** deterministic derivation.
- **Action contract:** filters only.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Clients → views/filters · **Linked assets:** A09, A43, A44
- **Current implementation files:** basic client list filters at HEAD; smart views missing.
- **Current status:** missing (MVP / PILOT-SAFE per 18.18)
- **Batch:** B8 · **Automated test:** inclusion rules + URL state · **Browser test:** view switching · **Screenshot:** A09
- **Approval gate:** PO-visual

#### JR-18.11-01 (HARDENING SCOPE)
- **Source heading:** 18.11 Weekly Planning Brief
- **Exact source text:** "A read-only dashboard section summarizes deterministic next-week facts: 18 confirmed sessions / 3 scheduling gaps / 2 packages insufficient for booked sessions / 4 overdue balances / 1 in-person session without a location / 2 clients without a next booking. Sections: Schedule / Preparation / Packages / Billing / Client follow-up / Integration issues. Each item opens a canonical view or resolver. State must be explicit: Current as of <timestamp> / Partial data / Unavailable section / No issues found. AI narrative is future-only and remains trainer-reviewed."
- **Ruling:** PRODUCTION-HARDENING (18.18) — excluded; recorded.
- **Current status:** future-gated (hardening) · **Batch:** post-B15 · **Approval gate:** PO-decision

#### JR-18.12-01 (HARDENING SCOPE)
- **Source heading:** 18.12 Policy Change Impact Preview
- **Exact source text:** "Settings with downstream effects use: Propose change → calculate affected future records → show before/after → choose application scope → confirm → version policy → apply idempotently → show results and exceptions. Covered policies may include: Default buffer / Working hours / Cancellation policy / Package expiry defaults / Payment terms / Reminder timing. Safe default: Apply to new records only. … Completed sessions, paid invoices, and historical package usage remain unchanged."
- **Ruling:** PRODUCTION-HARDENING REQUIREMENT (18.18) — excluded from MVP; B12 settings must not fake this (plain saves acceptable with no impact claims).
- **Current status:** future-gated (hardening) · **Batch:** post-B15; B12 guard · **Approval gate:** PO-decision

#### JR-18.13-01
- **Source heading:** 18.13 Global Search
- **Exact source text:** "Desktop: Cmd/Ctrl + K. Mobile: Full-screen search. Result groups: Clients / Sessions / Invoices / Payments / Locations / Commands. Requirements: tenant-scoped indexing; permission-filtered results; canonical deep links; keyboard and screen-reader navigation; safe recent-search handling; explicit no-result state; no sensitive trainer-note indexing initially; merged and archived identities are labelled clearly; commands and record search remain visually distinct. Status: **hardening after canonical routes are stable**."
- **Journey stage:** Global · **Persona:** Trainer · **Trigger:** Cmd/Ctrl+K (desktop) / persistent search (mobile)
- **Route:** global overlay + mobile full-screen search · **Surface:** search overlay
- **Desktop behavior:** Cmd/Ctrl+K overlay with six result groups. · **Mobile behavior:** full-screen search from persistent nav Search.
- **Required state:** explicit no-result state; recent-search safety.
- **Required copy:** result group labels VERBATIM as quoted.
- **Authoritative data source:** tenant-scoped, permission-filtered index.
- **Action contract:** deep links to canonical routes only.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** persistent Search (mobile nav) + desktop shortcut · **Linked assets:** A33, A47, A67
- **Current implementation files:** none — no search at HEAD.
- **Current status:** missing
- **Batch:** B13 (satisfies "after canonical routes are stable" — B13 follows all route batches) · **Automated test:** tenant scoping + group rendering · **Browser test:** shortcut + mobile flow · **Screenshot:** A33/A47
- **Approval gate:** PO-visual

#### JR-18.14-01 (HARDENING SCOPE)
- **Source heading:** 18.14 Integration Health Center
- **Exact source text:** "Each integration reports user-facing capability health: Healthy / Degraded / Unavailable / Not configured / Unknown. For each integration show: Status / Last successful operation / Last failed operation / Affected capability / Whether drafts/data are preserved / Duplicate-protection state / Primary recovery action. … A responding endpoint alone does not qualify as Healthy."
- **Ruling:** PRODUCTION-HARDENING (18.18) — excluded; recorded. Existing `/dashboard/whatsapp` page is the closest current surface (route reconciliation in route matrix).
- **Current status:** future-gated (hardening) · **Batch:** post-B15 · **Approval gate:** PO-decision

#### JR-18.15-01
- **Source heading:** 18.15 Communication Consent Center
- **Exact source text:** "Consent state includes: Preferred channel / Verified consent state / Permitted purpose / Source / Confirmed date / Confirmed by / Withdrawal/revocation state / Occurrence override. Distinctions: Phone number exists ≠ WhatsApp consent. Preferred method ≠ verified permission. Message delivered ≠ client confirmation. Occurrence override ≠ permanent preference. The canonical Message Composer consumes this state and fails closed where required consent is absent or unknown."
- **Journey stage:** Communication guard · **Persona:** Trainer · **Trigger:** any outbound send
- **Route:** composer (consumer); consent center (hardening surface) · **Surface:** consent gate in composer
- **Desktop/Mobile behavior:** composer fails closed on absent/unknown required consent.
- **Required state:** consent distinctions as quoted.
- **Required copy:** n/a
- **Authoritative data source:** consent state model (PD-005: unknown / opt_in_requested / opted_in / opted_out).
- **Action contract:** fail-closed send gate.
- **Confirmation requirement:** n/a (gate)
- **Recovery requirement:** n/a
- **Linked sitemap node:** Inbox composer; Settings (center = hardening) · **Linked assets:** A06, A12
- **Current implementation files:** no consent-state field in `lib/db/schema.ts` at HEAD (known gap R-2, CLAUDE.md).
- **Current status:** missing — composer gate is REQUIRED BEFORE BROADER AUTOMATION (18.18); the full Center is hardening
- **Batch:** B10 (composer fail-closed gate) · schema addition requires PO approval (schema-change gate) · **Automated test:** fail-closed matrix · **Browser test:** unknown-consent block · **Screenshot:** gate state
- **Approval gate:** PO-decision (schema change) — flagged CR-11

#### JR-18.16-01
- **Source heading:** 18.16 Session Change Summary
- **Exact source text:** "Every consequential session edit uses a shared before/after success pattern: Session updated / Before / Monday, 5:00 PM / ABC Gym / 60 minutes / After / Tuesday, 6:00 PM / Client home / 60 minutes / Also changed / Travel buffer recalculated / Reminder draft needs review / Package allocation unchanged / Recurring series unchanged. For a series: 8 future sessions selected / 6 updated / 2 require separate review. Actions: Send updated confirmation / Review exceptions / Open session / Done. A generic `Saved` toast is insufficient for consequential schedule changes."
- **Journey stage:** Resolve/Disruption · **Persona:** Trainer · **Trigger:** consequential session edit
- **Route:** Schedule edit flows · **Surface:** shared change-summary component
- **Desktop/Mobile behavior:** before/after + "Also changed" + series counts + four actions.
- **Required state:** never a bare Saved toast for consequential edits.
- **Required copy:** structure labels "Session updated / Before / After / Also changed" + action labels as quoted.
- **Authoritative data source:** mutation results.
- **Action contract:** actions open canonical flows.
- **Confirmation/Recovery:** series exceptions require separate review.
- **Linked sitemap node:** Schedule; shared library · **Linked assets:** A81, A25
- **Current implementation files:** generic toasts at HEAD.
- **Current status:** missing — MVP / DESIGN-SYSTEM REQUIREMENT per 18.18
- **Batch:** B14 (component) + B7 (adoption) · **Automated test:** summary content · **Browser test:** edit → summary · **Screenshot:** summary
- **Approval gate:** PO-visual

#### JR-18.17-01 (FUTURE-GATED)
- **Source heading:** 18.17 Trainer Focus Mode
- **Exact source text:** "Focus Mode is a presentation layer over Today: NOW / Sarah — 5:00 PM / ABC Gym / Next focus: Hip mobility / Bring: Resistance bands / NEXT / Ali — 6:30 PM / Client home / 20-minute transition. Rules: no new authoritative state; no separate data model; no hidden safety or recovery item; accessible text and touch targets; easy return to full Dashboard; quick actions open canonical flows; no time-based automatic status progression. Status: **pilot validation**."
- **Ruling:** PILOT VALIDATION (18.18) — excluded; recorded.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-18.18-01 (GOVERNANCE)
- **Source heading:** 18.18 Delivery priority
- **Exact source text:** (table lines 4073–4094) "Dated availability exceptions — MVP / PILOT-SAFE. Explainable decisions contract — MVP / DESIGN-SYSTEM DOCTRINE. Session Change Summary — MVP / DESIGN-SYSTEM REQUIREMENT. Smart Client Views — MVP / PILOT-SAFE. Safe Undo eligibility — MVP DOMAIN/DESIGN-SYSTEM RULE. Time-Off and Day Disruption Manager — HIGH-PRIORITY HARDENING. Duplicate Client Identity Resolver — MANDATORY HARDENING BEFORE IMPORTS. Package Runway — HIGH-PRIORITY HARDENING. Just-in-Time Data Quality Resolver — HIGH-VALUE HARDENING. Weekly Planning Brief — PRODUCTION-HARDENING. Policy Change Impact Preview — PRODUCTION-HARDENING REQUIREMENT. Integration Health Center — PRODUCTION-HARDENING. Communication Consent Center — REQUIRED BEFORE BROADER AUTOMATION. Global Search — HARDENING AFTER ROUTE STABILITY. Open Slot Recovery — CONTROLLED EXPERIMENT. Trainer Focus Mode — PILOT VALIDATION. Custom client views — FUTURE / DEMAND-GATED. Capacity and revenue forecasting — FUTURE. AI-prepared weekly explanation — FUTURE / TRAINER-REVIEWED. Predictive recovery recommendations — FUTURE / NO AUTO-EXECUTION."
- **Ruling:** binding scope contract: the five MVP rows are in-batch (B7/B8/B12/B13/B14); all other rows excluded from B0–B15 unless PO pulls forward.
- **Current status:** governance · **Batch:** scope contract · **Approval gate:** PO-decision for non-MVP rows

## Section 19 — WhatsApp Messaging Journey

#### JR-19-01
- **Source heading:** 19 (outbound flow + canonical surface)
- **Exact source text:** (flowchart lines 4100–4113) "Verified reason to contact client → Consent / approved communication state known? No or unknown: Block send and offer safe consent/opt-in path. Yes: Prepare message draft → Show client, reason, and full message → Trainer edits or cancels → Confirm send? No: Close with no external effect. Yes: Send through approved outbound integration → Confirmed result? Success: Record send result. Failure: Preserve draft and show retry guidance." … "Canonical surface: Contextual entry point → one MessageComposer → consent state → prepared editable draft → trainer confirmation → approved send path → Sent Messages log → per-client activity timeline"
- **Journey stage:** Communication · **Persona:** Trainer · **Trigger:** verified reason to contact
- **Route:** MessageComposer (contextual) + Inbox log · **Surface:** composer
- **Desktop/Mobile behavior:** consent-gated draft → review → confirm → send → logged result; failure preserves draft.
- **Required state:** consent block state; send result states.
- **Required copy:** n/a (see JR-17.14 packs)
- **Authoritative data source:** consent + fact context.
- **Action contract:** `actions/whatsapp.ts` / `actions/messages.ts` (protected).
- **Confirmation requirement:** explicit confirm send.
- **Recovery requirement:** draft preserved on failure with retry guidance.
- **Linked sitemap node:** Inbox; contextual composer · **Linked assets:** A06, A12, A13, A50, A51, A77
- **Current implementation files:** per-client messages page; approval-gated send exists; consent gate missing (JR-18.15-01).
- **Current status:** partial
- **Batch:** B10 · **Automated test:** consent-block + result states · **Browser test:** send lifecycle · **Screenshot:** A12
- **Approval gate:** PO-visual

#### JR-19.1-01
- **Source heading:** 19.1 MVP boundaries
- **Exact source text:** "outbound only; trainer confirmed; no client forms; no inbound inbox journey; no autonomous reminders."
- **Journey stage:** Communication guard · **Persona:** Trainer · **Trigger:** all messaging work
- **Route:** Inbox · **Surface:** all messaging surfaces
- **Desktop/Mobile behavior:** the five boundaries hold everywhere; the Inbox destination is an outbound log/composer surface, not an inbound conversation inbox (see CR-10 naming reconciliation with Sitemap "Inbox").
- **Required state:** no inbound-reply affordances.
- **Required copy:** n/a
- **Authoritative data source / Action contract:** outbound path only.
- **Confirmation/Recovery:** n/a
- **Linked sitemap node:** Inbox · **Linked assets:** A06, A12, A13, A50, A51
- **Current implementation files:** outbound-only holds at HEAD.
- **Current status:** exact (boundary) — Inbox surface itself missing (B10)
- **Batch:** B10 guard · **Automated test:** no inbound affordance · **Browser test:** yes · **Screenshot:** n/a
- **Approval gate:** none

#### JR-19.2-01 (FUTURE-GATED)
- **Source heading:** 19.2–19.11 Future AI WhatsApp Concierge
- **Exact source text:** "Every inbound WhatsApp message receives a timely, useful, and honest response—even when the trainer cannot reply—without allowing an uncertain message to silently change scheduling, packages, billing, payments, safety state, consent, or client history." … autonomy ladder Levels 0–5 (lines 4297–4316); required controls (19.9); status table (19.11): "Inbound event capture and deduplication — FUTURE / APPROVAL-GATED FOUNDATION … Trainer takeover and conversation handoff — REQUIRED BEFORE AUTOMATIC REPLIES. Automatic scheduling or financial mutation — NOT APPROVED; SEPARATE FAR-FUTURE DECISION. Unrestricted autonomous WhatsApp agent — REJECTED."
- **Ruling:** entire Concierge journey (19.2–19.11) is FUTURE / APPROVAL-GATED — excluded from B0–B15; recorded to prevent invention. No inbound UI, no auto-replies, no inbound event capture in this program.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

## Section 20 — FitDesk Intelligence Layer

#### JR-20-01 (GOVERNANCE / FUTURE-GATED EXECUTION)
- **Source heading:** 20.1–20.7 Pilot foundation (objective, routing, boundary, state machine, registry, isolation, budgets)
- **Exact source text:** "Unstructured trainer/client input → tenant-scoped context → strict AI proposal → schema validation → deterministic domain validation → trainer review → canonical FitDesk workflow → confirmed result. The pilot uses one shared Intelligence Layer for several feature-specific workflows." … (20.2 workflow-vs-agent table; 20.3 `lib/ai/` module placement + "no new AI microservice until production evidence proves the product-server module insufficient"; 20.4 run state machine RECEIVED→…→CONFIRMED with failure states; 20.5 AIFeatureDefinition/AISourceReference contracts; 20.6 tenant isolation "Never: Model requests a client → global search → tenant filter afterward"; 20.7 AIRunBudget + "There is no unbounded self-reflection or repair loop.")
- **Ruling:** architecture contract for ANY AI feature work; the pilot features themselves are outside B0–B15. If any batch touches AI-adjacent UI (e.g. Quick Add entry in Add Client), these contracts bind it.
- **Linked sitemap node:** n/a · **Linked assets:** none
- **Current implementation files:** partial ai-parse in `features/clients/`.
- **Current status:** governance · **Batch:** guard · **Approval gate:** PO-decision per feature

#### JR-20.8-01 (FUTURE-GATED)
- **Source heading:** 20.8–20.15 Pilot features (Quick Add, Text-to-Structured Completion, Pre-Session Brief, Message Copilot, NL Booking, Workout Builder, Ask FitDesk, Client Pulse Lite)
- **Exact source text:** (20.8) "Every extracted field includes: Value / Status: extracted / ambiguous / missing / unsupported / Confidence: high / medium / low / Source phrase." … (20.14) "Boundaries: five to ten approved question families initially; six to eight narrow read tools; no raw SQL or generic query tool; no write tools; no ERP credentials; no answer without source links and freshness; explicit unavailable response instead of memory-based guessing." … (20.15) "Pilot Pulse has no `Healthy / Watch / At Risk`, numerical risk score, prediction, automatic message, or direct mutation."
- **Ruling:** all pilot AI features are PILOT-scoped and excluded from B0–B15 implementation. Existing Quick Add ai-parse code remains but no new AI surface ships in the zero-drift program without PO-decision. Recorded per feature to prevent silent invention or removal.
- **Current implementation files:** Quick Add parse path exists (`features/clients/`); all others absent.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

#### JR-20.16-01 (FUTURE-GATED / GOVERNANCE)
- **Source heading:** 20.16–20.25 Future AI + evaluation/governance/delivery
- **Exact source text:** (20.18) "Never: Sarah risk score: 73%." … (20.22) four evaluation layers "Component / Domain / End-to-end / Adversarial" + release gates; (20.23) run-record fields + privacy rules; (20.24) Waves 0–5 delivery sequence; (20.25) delivery-priority table ending "Autonomous program/schedule/financial action — FAR FUTURE / SEPARATE APPROVAL. Multi-agent business operations — FAR FUTURE / EVAL-EVIDENCE REQUIRED."
- **Ruling:** future AI scope + governance — excluded; recorded.
- **Current status:** future-gated · **Batch:** none · **Approval gate:** PO-decision

## Section 21 — Future Client Onboarding Portal

#### JR-21-01
- **Source heading:** 21.1 MVP / 21.2 Future portal / 21.3 Dedicated app
- **Exact source text:** "Trainer creates and manages the client. Client has no direct FitDesk account or portal." … 21.2 "**FUTURE / APPROVAL-GATED**" (flow + eight required decisions) … 21.3 "**PWA-DECISION-GATED** — A dedicated PWA or native app is not part of the current roadmap commitment."
- **Ruling:** MVP = absence of any client portal (enforced now); portal and app future-gated.
- **Current implementation files:** no portal — compliant.
- **Current status:** exact (absence) / future-gated (portal)
- **Batch:** guard · **Approval gate:** PO-decision for future scope

## Sections 22–23 — Service Blueprint and Ownership

#### JR-22-01 (GOVERNANCE)
- **Source heading:** 22. Cross-Actor Swimlane
- **Exact source text:** (18-row swimlane table lines 5266–5286, assigning Trainer/Client/FitDesk-AI/WhatsApp/ERP responsibilities per journey moment; e.g. "Outcome | Selects outcome, enters quick progress, chooses conditional billing/payment handling, and confirms once | Experiences coaching outcome | Keeps progress and consequences in one contextual flow; never auto-decides | — | Applies authoritative session/package/invoice/payment mutations; FitDesk owns progress workflow state")
- **Ruling:** ownership reference; consistency check for every batch — no batch may move a responsibility across actors/columns.
- **Current status:** governance · **Batch:** all (reference) · **Approval gate:** none

#### JR-23-01 (PROTECTED CONTRACT)
- **Source heading:** 23. Mutation Sovereignty Pattern
- **Exact source text:** (sequence diagram lines 5292–5310) "Trainer→UI: Choose consequential action → UI→Trainer: Show full consequence preview → Trainer→UI: Confirm → UI→Action: Submit confirmed intent → Action→Domain: Validate tenant, version, state, and rules → Domain→ERP: Execute through approved proxy path → ERP→Domain: Authoritative result → Domain→Action: Typed success or recoverable failure → Action→UI: Result → UI→Trainer: Reflect verified state. No AI participant is included in the authoritative execution chain."
- **Ruling:** the universal mutation pattern — protected; every batch's mutations must follow it.
- **Current status:** exact (contract) · **Batch:** all (protected) · **Approval gate:** none

## Section 24 — Honest State Model

#### JR-24-01
- **Source heading:** 24. Honest State Model
- **Exact source text:** (15-row table lines 5322–5338, VERBATIM copy column) Loading: "Checking today's activity…" — Unavailable: "We couldn't refresh this information yet." — Partial: "Schedule is current; payment activity could not be refreshed." — Rejected before mutation: "Nothing changed. Correct the issue and try again." — Confirmed success: Specific verified result — Confirmed but stale projection: "Saved. Some summaries are still refreshing." — Outcome uncertain: "Status unconfirmed. Do not retry yet." — Blocked: Explain why action cannot continue — Empty: Verified checks completed and no records exist — Sparse: contextual activation/reactivation guidance — AI draft pending review: "Prepared from your input. Review highlighted fields." — AI context stale: "Source information changed. Regenerate before approval." — AI output invalid: "The draft could not be validated." — AI budget exceeded: "The assistant stopped safely." — AI source unavailable: "Some source information could not be checked."
- **Journey stage:** Cross-journey state · **Persona:** Trainer · **Trigger:** every system state
- **Route:** all · **Surface:** shared state library
- **Desktop/Mobile behavior:** all fifteen states with required behavior column enforced ("Preserve known context, offer retry, never show zero/all clear" etc.).
- **Required state:** the full 15-state model.
- **Required copy:** VERBATIM trainer-facing responses as quoted (AI states apply only if AI features exist).
- **Authoritative data source:** per state.
- **Action contract:** state library consumed by all surfaces.
- **Confirmation/Recovery:** per required-behavior column.
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** ad-hoc states per surface; no shared library.
- **Current status:** missing (library); partial (per-surface behavior)
- **Batch:** B14 (library) + all surface batches (adoption) · **Automated test:** state-copy assertions · **Browser test:** forced states per surface · **Screenshot:** state gallery vs A81
- **Approval gate:** PO-visual

## Section 25 — Key Failure Loops

#### JR-25-01
- **Source heading:** 25.1–25.9 Key Failure Loops
- **Exact source text:** (25.1) "ERP Customer fails → no local rows; preserve form; retry. ERP succeeds and local projection fails → do not delete ERP Customer automatically; repair through backfill/reconcile. Duplicate warning → trainer may open existing, cancel, or continue with an audited reason." (25.2) "Conflict → return structured conflict; do not save. Stale version → refresh and ask trainer to review again. Unknown persistence result → do not encourage immediate retry until authoritative state is checked." (25.3) "Progress validation/persistence fails → preserve the draft and do not claim the progress was saved. Billing mode unset → fail closed or show the approved no-charge/follow-up state. Package unavailable/exhausted → preserve progress and route to package review without claiming package consumption. Invoice creation fails → state whether the session/progress was saved and keep financial recovery explicit. Paid Now payment fails or is uncertain → do not claim payment success; preserve the invoice and query authoritative state before retry. Duplicate submit → immutable/version/idempotency guards prevent repeated session, package, invoice, progress, or payment effects." (25.4) "Method unavailable … do not silently substitute Cash. ERP configuration incomplete → show a configuration-unavailable state and allow Pay Later where valid. Payment creation uncertain → query authoritative invoice/payment state before retry. Leaving the completion sheet must not lose a valid outstanding invoice or entered progress." (25.5) "Consent unknown/opted out → block send. Send fails → preserve draft and recipient context. Delivery state unknown → do not claim delivery." (25.6–25.9: operational disruption, duplicate identity, integration/consent, AI-run failure rules, lines 5378–5412)
- **Journey stage:** Recovery (all domains) · **Persona:** Trainer · **Trigger:** each failure condition
- **Route:** per domain surface · **Surface:** failure/recovery states
- **Desktop/Mobile behavior:** every quoted loop behavior implemented in its owning surface batch (25.1→B8, 25.2→B7, 25.3→B9, 25.4→B9/B11, 25.5→B10, 25.6→gated disruption scope, 25.7→gated resolver scope, 25.8→B10/B12 honesty states, 25.9→AI-gated).
- **Required state:** as quoted per loop.
- **Required copy:** honest failure wording per JR-24-01.
- **Authoritative data source:** authoritative state queries before retry.
- **Action contract:** idempotency/version guards (protected).
- **Confirmation/Recovery:** as quoted.
- **Linked sitemap node:** per domain · **Linked assets:** A81, A21, A61 (failed provisioning patterns)
- **Current implementation files:** server-side guards exist (scheduling/billing suites); UI recovery states partial.
- **Current status:** partial
- **Batch:** distributed (B7–B11, B14) · **Automated test:** per-loop failure simulations · **Browser test:** forced failure per domain · **Screenshot:** recovery states
- **Approval gate:** none

## Section 26 — Modernization Program Crosswalk

#### JR-26-01 (GOVERNANCE)
- **Source heading:** 26. Journey-to-Dashboard Plan v1.1
- **Exact source text:** (crosswalk table lines 5420–5429) "Stage 1 — Operational truth | D1 Open Dashboard; all recovery states | No unavailable-as-zero; no unsupported 'all clear.' … Stage 3 — Hierarchy/compact rows | Daily operating journey | Today and Needs Attention lead; unresolved outcomes visible. …"
- **Ruling:** crosswalk index — requirements already carried by JR-5.x rows; B6 honors Stage 1–3 requirements; Stages 6–7 gated.
- **Current status:** governance · **Batch:** B6 reference · **Approval gate:** none

#### JR-26.1-01 (GUARD)
- **Source heading:** 26.1 Approval-gated dashboard flags
- **Exact source text:** "Do not treat these as MVP merely because they appear in a plan: Predictive Pulse, adaptive thresholds, Healthy/Watch/At Risk labels, and retention scoring beyond pilot Pulse Lite. Prepared outbound reminder surfaced earlier. Suggested booking slots. Insight layer and chart. Persistent onboarding checklist. Persistent AI chat. Product analytics instrumentation. Inbound WhatsApp Signals. Automatic AI WhatsApp acknowledgments or answers. Any WhatsApp transaction automation. Autonomous program adaptation or publication. Predictive scheduling that reserves, moves, books, or messages. Multi-agent orchestration."
- **Ruling:** hard exclusion list for B6 (and all batches) — none of the thirteen items may be implemented; asset depictions of any of them become conflict-register entries. Also 26.2: "Client portal = APPROVAL-GATED FUTURE. Insight layer = APPROVAL-GATED. Programs = FUTURE / APPROVAL-GATED. Dedicated client app/PWA = PWA-DECISION-GATED."
- **Current status:** governance (guard) · **Batch:** all · **Approval gate:** PO-decision per item
- **Note:** "Insight layer and chart" is approval-gated, while assets A03/A04/A10/A38/A39 depict revenue/analytics charts → CR-12 (dashboard/billing chart depictions vs gated insight layer).

## Section 27 — 2026 Flow Consolidation Blueprint

#### JR-27.1-01 (GOVERNANCE)
- **Source heading:** 27.1 Governing rule
- **Exact source text:** "One real-world objective → one coherent contextual flow → one review point → explicit truth for every authoritative effect. A surface may have many entry points, but there should be one canonical action contract for validation, preview, mutation, audit, recovery, and success. Consolidation must reduce navigation and repeated entry without creating a mega-sheet or hiding distributed failure."
- **Ruling:** consolidation doctrine for all batches.
- **Current status:** governance · **Batch:** all · **Approval gate:** none

#### JR-27.2-01
- **Source heading:** 27.2 Consolidated operating map
- **Exact source text:** (flowchart lines 5481–5530) entry points "Dashboard / Needs Attention, Schedule, Client Hub, Invoice detail, Mobile FAB, Desktop Cmd/Ctrl+K" feeding canonical surfaces "Needs Attention Resolver, Complete Session, Canonical BookingSheet, Canonical Record Payment Sheet, Package Assignment / Renewal family, Canonical Message Composer" all ending in "Shared Success + Next Step" with state-derived next-priority branching.
- **Journey stage:** Cross-surface · **Persona:** Trainer · **Trigger:** all core objectives
- **Route:** all canonical surfaces · **Surface:** entry-point wiring
- **Desktop/Mobile behavior:** every listed entry point reaches its canonical surface; all flows end in shared success grammar.
- **Required state:** one contract per objective.
- **Required copy:** n/a
- **Authoritative data source / Action contract:** canonical contracts.
- **Confirmation/Recovery:** shared success grammar (JR-27.5-01).
- **Linked sitemap node:** all · **Linked assets:** A81
- **Current implementation files:** entry points fragmented at HEAD (e.g. payment via route not sheet; no FAB coverage of all flows; no command palette — palette is hardening).
- **Current status:** partial
- **Batch:** B5 (shell/FAB) + surface batches · **Automated test:** entry-point routing matrix · **Browser test:** entry-point sweep · **Screenshot:** n/a
- **Approval gate:** none

#### JR-27.3-01 (GOVERNANCE)
- **Source heading:** 27.3 Recommended ideas and status
- **Exact source text:** (52-row status table lines 5534–5587; MVP-classified rows include) "**Unified Complete Session** — APPROVED JOURNEY REQUIREMENT; exact code status VERIFY AT ADOPTION. **One canonical Record Payment flow** — MVP / production-hardening boundary. **One canonical BookingSheet** — MVP — NEEDS UPGRADE; buffer override is an APPROVED JOURNEY REQUIREMENT. **Shared success-and-next-step grammar** — MVP / design-system consolidation. **One contextual WhatsApp composer** — MVP — NEEDS UPGRADE; outbound only. **Needs Attention resolver** — MVP / dashboard modernization. **Client Statement of Account** — MVP / CURRENT VISUAL EXISTS. **Client Today + Next Safe Action** — MVP / PILOT-SAFE DIRECTION. **Structured Session Context** — MVP / PILOT-SAFE CORE. **Progressive Booking Details** — MVP UX REQUIREMENT. **Session State Separation** — MVP DOMAIN REQUIREMENT. **Dated Availability + Day Disruption** — MVP FOUNDATION / HIGH-PRIORITY HARDENING. **Explainable Decisions + Change Summaries** — MVP CROSS-CUTTING REQUIREMENT. **Smart Client Views + Weekly Planning** — MVP VIEWS / HARDENING BRIEF. **Safe Undo Boundary** — MVP DESIGN-SYSTEM RULE. **Working-hours and location exceptions** — MVP / PILOT-SAFE NEXT." (remaining rows classify hardening/pilot/future statuses consistent with §14–20 tables)
- **Ruling:** consolidated status authority reconfirming per-section classifications; feeds batch scope definitions.
- **Current status:** governance · **Batch:** scope reference · **Approval gate:** none

#### JR-27.4-01 (GOVERNANCE / BINDING SURFACE CONTRACT)
- **Source heading:** 27.4 Canonical entry-point matrix
- **Exact source text:** (34-row matrix lines 5591–5628; representative rows) "Add client | Clients, Dashboard, FAB, command palette | `AddClientSheet` / desktop drawer | One create, duplicate-check, review, and recovery contract. — Book or reschedule | Schedule, Client Hub, completion success, Dashboard, FAB, command palette | `BookingSheet` | One conflict-aware, recurrence-aware contract… — Record payment | Completion, Invoice detail, Client Hub, Needs Attention, FAB, command palette | `RecordPaymentSheet` | One payment validation, preview, mutation, and authoritative-result contract. — Send message | Client Hub, session, invoice, package, Needs Attention | `MessageComposer` | One consent, draft, confirmation, send, and logging contract. — Review client account | Client Hub, invoice detail, overdue attention item, command palette | URL-backed Statement of Account drawer/full-height mobile sheet | One ERP-authoritative read model… — Search FitDesk | Desktop command palette, mobile search | Tenant-scoped Global Search | Permission-filtered canonical links; commands and records remain distinct." (all 34 rows apply as written)
- **Ruling:** binding canonical-surface + entry-point contract for the sitemap route matrix and every batch; each row's "single contract rule" is an acceptance criterion for its batch.
- **Current status:** governance · **Batch:** all · **Approval gate:** none

#### JR-27.5-01
- **Source heading:** 27.5 Shared success grammar
- **Exact source text:** "Every canonical flow ends with: What succeeded / What changed / What remains unresolved / Highest-priority next action / Relevant secondary action(s) / Close / return. The highest-priority action is state-derived: Partial or uncertain failure → recover first. Safety concern → review safety. Package exhausted → renew or assign. Payment outstanding → record or request payment. Otherwise → book the next session."
- **Journey stage:** Cross-surface success · **Persona:** Trainer · **Trigger:** every flow completion
- **Route:** all canonical flows · **Surface:** shared success component
- **Desktop/Mobile behavior:** six-part success structure; state-derived priority as quoted.
- **Required state:** priority derivation order.
- **Required copy:** structural labels as quoted.
- **Authoritative data source:** post-mutation state.
- **Action contract:** next actions launch canonical flows.
- **Confirmation/Recovery:** unresolved items always listed.
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** generic toasts at HEAD.
- **Current status:** missing
- **Batch:** B14 (component) + all surface batches (adoption) · **Automated test:** grammar presence per flow · **Browser test:** completion sweeps · **Screenshot:** success states
- **Approval gate:** PO-visual

#### JR-27.6-01
- **Source heading:** 27.6 Draft and recovery model
- **Exact source text:** "Drafts may be optimistic because they are reversible: progress text; client creation fields; booking selections; payment reference; message draft; duplicate-override explanation. Authoritative effects remain confirmed-first and idempotent: session outcome; package deduction; invoice creation; payment entry; booking mutation; outbound message send. A resumed flow must show what is still a draft, what is confirmed, what is uncertain, and what needs recovery."
- **Journey stage:** Cross-surface state · **Persona:** Trainer · **Trigger:** interruption/resume
- **Route:** all flows · **Surface:** draft/confirmed state distinction
- **Desktop/Mobile behavior:** four-state resume display (draft/confirmed/uncertain/needs-recovery).
- **Required state:** the six draft classes vs six authoritative classes as quoted.
- **Required copy:** n/a
- **Authoritative data source:** per class.
- **Action contract:** idempotent authoritative effects.
- **Confirmation/Recovery:** resume shows all four states.
- **Linked sitemap node:** shared library · **Linked assets:** A81
- **Current implementation files:** partial (some drafts preserved; no unified model).
- **Current status:** partial
- **Batch:** B14 · **Automated test:** class behavior · **Browser test:** interrupt/resume · **Screenshot:** resumed flow
- **Approval gate:** none

#### JR-27.7-01 (GUARD)
- **Source heading:** 27.7 Consolidation guardrails
- **Exact source text:** "Do not: combine client identity creation, full goal setup, package purchase, and booking into one mandatory wizard; create separate payment or booking logic for each entry point; show routine payment controls to package clients when no payment is due; expose manual invoice creation in the normal trainer workflow; build a fake inbox for an outbound-only product; let AI execute a multi-action bundle; hide partial success behind one generic success message; send the trainer to Settings and lose the originating draft; make the Client Hub timeline another mutation surface without canonical actions; make a contextual sheet behave like an entire application; allow a buffer override to bypass an actual session overlap, a safety block, or another non-overridable scheduling rule; silently apply one buffer override to future recurring occurrences or change the global buffer setting."
- **Ruling:** twelve hard guardrails binding every batch. "build a fake inbox for an outbound-only product" interacts with the Sitemap's Inbox destination → resolved in CR-10 (Inbox = outbound log/composer surface, not inbound conversations).
- **Current status:** governance (guard) · **Batch:** all · **Approval gate:** none

#### JR-27.8-01 (GOVERNANCE)
- **Source heading:** 27.8 Recommended adoption order
- **Exact source text:** "1. Unified Complete Session 2. Canonical Record Payment flow 3. Canonical BookingSheet with inline conflict handling and explicit soft-buffer override 4. Needs Attention resolver 5. Shared success-and-next-step grammar 6. Contextual WhatsApp composer 7. Client activation checklist 8. State-derived next action 9. URL-backed overlays 10. Draft preservation and step-level recovery 11. Unified Client Hub timeline 12. Package lifecycle consolidation 13. Configure-in-context and return 14. Desktop command palette 15. Validate closeout, batch resolution, live notes, and AI summaries"
- **Ruling:** journey-side adoption order; the zero-drift contract's B0–B15 sequence governs THIS program (contract authority). Where the two orders differ, the contract's batch order wins mechanically; this list orders intra-batch work. Recorded as CR-13 (ordering reconciliation, mechanical).
- **Current status:** governance · **Batch:** sequencing reference · **Approval gate:** none

## Section 28 — Journey Metrics

#### JR-28-01 (GOVERNANCE)
- **Source heading:** 28.1–28.14 Journey Metrics
- **Exact source text:** (metric lists lines 5727–5933; e.g. 28.1) "Time to identify the top action. Needs Attention resolution time. Unresolved-session age and resolution rate. Percentage of sessions with outcome recorded same day. Percentage of completed sessions resolved in one contextual flow. Quick progress-update capture rate and average completion time. Duplicate mutation prevention. Dashboard unavailable/partial-state accuracy." (28.2 Activation; 28.3 Client lifecycle; 28.4 Billing; 28.5 Communication; 28.6 Flow consolidation; 28.7 Structured flexibility; 28.8 Session context; 28.9 Client Hub; 28.10 Operational recovery; 28.11–28.14 AI pilot metrics)
- **Ruling:** success-measure definitions, not UI requirements. Product analytics instrumentation is itself approval-gated (JR-26.1-01) — so no tracking code ships in B0–B15; metrics inform manual QA and acceptance evidence only.
- **Current status:** governance · **Batch:** B15 acceptance evidence framing · **Approval gate:** PO-decision for instrumentation

## Sections 29–31 — Scope Separation

#### JR-29-01 (GOVERNANCE / BINDING MVP SCOPE)
- **Source heading:** 29. MVP / Pilot-Safe Now
- **Exact source text:** (64-item list lines 5941–6004, including) "Signup and workspace onboarding route. Manual trainer-created clients. ERP-linked client identity. Local client read model and Client Hub. Billing mode choice during Add Client. Package assignment from Client Hub. Paid Now / Pay Later package invoice flow. Pay-per-session rate and invoice on completion. Goal taxonomy, primary goal, urgency, sub-goals, conflicts, and safety. Conflict-aware booking. Session completion. Approved unified completion journey… No-show/cancel capabilities where verified. Unresolved-session derivation and attention loop. Payment recording. Trainer-approved outbound WhatsApp path. Dashboard Today, Needs Attention, Business Health, and activation states… Needs Attention items open focused resolver flows with one primary action. Shared success-and-next-step grammar across core actions. One contextual outbound WhatsApp composer and send contract. Hard/soft/advisory rule classification owned by domain responses. Time-buffer override with reason, occurrence scope, review, audit, and idempotency. Location-confidence confirmation… Outside-working-hours booking exception… Shared occurrence-versus-series exception scope selector. Goal soft-conflict resolution. Assessment-session alternate path… Client Statement of Account… Client Today context embedded inside Client Hub. Deterministic Next Safe Action with reason and safe alternatives. Read-first Package & Billing Status inside Client Hub. Basic factual attendance summary… Contextual message packs through the canonical composer. Session location as a first-class BookingSheet field… Dated trainer-availability exceptions… Shared 'Why This Happened' explanation contract. Shared Session Change Summary… Deterministic Smart Client Views… Domain-owned Safe Undo eligibility… URL-backed operational resolver entry points." (AI items in this list remain pilot-gated per JR-20 rows: "Shared FitDesk Intelligence Layer kernel…", Quick Add, Text-to-Structured Completion, Pre-Session Brief, Pulse Lite, Message Copilot, NL Booking Draft, Follow-Up Extraction, Workout Builder, Ask FitDesk)
- **Ruling:** the §29 non-AI items are the binding MVP scope for B2–B14. The §29 AI items conflict with their own APPROVAL-GATED / PILOT classifications elsewhere (4.3, 5.10, 5.11, 20.x) → CR-14 records the AI-scope ambiguity; mechanical default = AI items stay gated pending PO-decision (Journey's own gating language wins over list membership).
- **Current status:** governance · **Batch:** scope contract · **Approval gate:** PO-decision for AI items

#### JR-30-01 (GOVERNANCE)
- **Source heading:** 30. Production-Hardening Soon
- **Exact source text:** (77-item list lines 6008–6084, including) "Complete visual and functional adoption of the modernization branch. Dedicated unresolved-session recovery/batch UI if still missing. Stronger cancel/no-show/reschedule consequence UX. … One canonical Record Payment surface across all entry points. One canonical BookingSheet with URL-backed overlay behavior and an audited soft-buffer override… Cancellation/no-show consequence waiver. Package-exhausted completion resolver. … Recurring Schedule Manager… Resume Work queue… Tenant-safe Global Search after canonical routes stabilize. …"
- **Ruling:** hardening backlog — items here that ALSO appear as MVP in §29 (canonical Record Payment, BookingSheet URL-backing, buffer override) are treated as MVP with hardening depth noted (CR-15 records the dual listing; mechanical default: §29 wins for inclusion, §30 defines the hardening depth). Waiver (13.6) and package-exhausted resolver (13.7) land here → B9 includes them only by PO-decision (CR-08).
- **Current status:** governance · **Batch:** post-B15 backlog + CR-08/CR-15 decisions · **Approval gate:** PO-decision

#### JR-31-01 (GOVERNANCE)
- **Source heading:** 31. Future Platform Architecture Later
- **Exact source text:** (53-item list lines 6088–6140, including) "Secure no-install client portal. Event/outbox architecture. Offline-safe local lead drafts. Native contact import. Voice-to-Structured Progress… Dedicated PWA/native client app. … AI WhatsApp Concierge that responds while the trainer is busy. … Limited transactional WhatsApp actions, autonomous program adaptation, autonomous schedule optimization, and multi-agent business operations only through separate far-future approvals."
- **Ruling:** future scope — fully excluded; guard against invention.
- **Current status:** governance · **Batch:** none · **Approval gate:** PO-decision

## Sections 32–34 — Acceptance and Adoption

#### JR-32-01 (GOVERNANCE / BINDING ACCEPTANCE SOURCE)
- **Source heading:** 32. Journey Map Acceptance Criteria
- **Exact source text:** (190 numbered criteria, lines 6150–6340; representative) "6. The first-time activation loop uses: Add client → billing mode → book first session → dashboard becomes operational. 10. Completing a session keeps outcome, quick progress, and relevant financial decisions in one contextual window. 14. The same authoritative payment contract is reused from the completion flow and invoice detail. 19. AI never has an execution arrow. 25. Needs Attention behaves as a resolver, not a passive alert wall. 31. Booking distinguishes non-overridable hard conflicts from trainer-overridable soft buffer conflicts. 47. A failed, partial, or unavailable statement read is never represented as zero financial activity. 50. Manual invoice creation remains hidden from the statement flow. 54. Balance due is the dominant trainer-facing summary value. 64. Client Today, Package Status, Attendance, Communication, Progress, and lifecycle controls remain contextual Client Hub sections rather than new primary modules. 82. BookingSheet always exposes Client, Date/time, Duration, Location, Session type, and Repeat before optional details. 94. Session state, communication state, and client-confirmation state remain independent. 102. Dated availability exceptions never rewrite normal weekly working hours. 110. Undo appears only for reliably reversible local actions… 119. Smart Client Views remain filters… 124. Global Search is tenant-scoped, permission-filtered… 127. Session Change Summary shows before, after, side effects, exceptions, and next actions. 131–190: AI/WhatsApp/portal gating criteria." (all 190 apply as written)
- **Ruling:** criteria 1–130 (non-AI) are the journey-compliance acceptance set consumed by FITDESK_ZERO_DRIFT_ACCEPTANCE_MATRIX level 2; criteria 131–190 are gating criteria enforced as exclusions.
- **Current status:** governance · **Batch:** B15 · **Approval gate:** none

#### JR-33-01 (GOVERNANCE)
- **Source heading:** 33. Adoption Checklist
- **Exact source text:** (verification list lines 6344–6471) "Verify active repository: `C:\Users\Lenovo\Dev\axis-erp\FitDesk`. Verify branch and HEAD. Read all applicable `CLAUDE.md` and `AGENTS.md`. Reconcile `FITDESK_UI_UX_MODERNIZATION_EXECUTION_LOG.md` with the current diff. Recheck exact status of: unresolved-session recovery UI; cancel/no-show/reschedule actions; …" (the full recheck list, ~120 items)
- **Ruling:** the recheck list becomes per-batch VERIFY checklists in the implementation sequence (each batch re-verifies its own items before claiming exactness).
- **Current status:** governance · **Batch:** distributed per batch · **Approval gate:** none

#### JR-34-01 (GOVERNANCE)
- **Source heading:** 34. Final Journey Statement
- **Exact source text:** "FitDesk succeeds when the trainer can move through this loop without hidden admin work or uncertain business state: Workspace ready → optional reusable package templates created or skipped → … → dashboard tells the trainer what matters next. The product should feel fast because the next safe action is clear—not because consequential actions are hidden, automated, or falsely optimistic." (full loop lines 6487–6535)
- **Ruling:** the B15 full-journey acceptance walk follows this loop end-to-end (future/pilot steps skipped per gating).
- **Current status:** governance · **Batch:** B15 · **Approval gate:** none
