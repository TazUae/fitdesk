# FitDesk Zero-Drift Implementation Sequence

```text
Phase: 0 output — atomic batch plan for the zero-drift implementation program
Generated: 2026-07-20
Branch: feat/ui-ux-modernization (each batch = its own child branch + PR, rollback = batch branch point)
Order is fixed by the contract: 0 → 15. No batch merges multiple product surfaces.
Every batch ends with: automated tests green · browser script executed · screenshots captured
per listed viewports · PO acceptance checklist signed · conventional commit · push only on
explicit instruction (workspace git rules apply).
```

## Global protected denylist (every batch)

Never modified by any batch (presentation seams only; changes require explicit PO approval outside this program):

```text
lib/scheduling/engine.ts
lib/scheduling/bookingService.ts
lib/scheduling/sessionRepository.ts
lib/scheduling/sessionCompletionService.ts
actions/schedulingActions.ts            (contract surface; presentation-driven params only via approved seam)
actions/clients.ts / invoices.ts / packages.ts / messages.ts / statements.ts / whatsapp.ts (contracts preserved)
lib/erpnext/** (ERP client/proxy path)
lib/db/schema.ts                        (schema changes = separate approval, CR-11)
app/api/** (auth, controlplane, provisioning, workspace, health)
Better Auth configuration and session contracts
Control Plane / provisioning-agent / erp-execution-service repos (untouched)
Tenant-isolation guards; billing hooks; session-completion consequences
```

Global fixtures baseline (extends per batch): tenant T1 + trainer; clients in Package/PPS/Trial/Unset modes; active/low/exhausted/expired packages; sessions future/live/past-unresolved/completed/cancelled/no-show/recurring; invoices outstanding/overdue/paid; consent unknown/opted-in/opted-out (after CR-11); cross-tenant tenant T2 for denial tests (US-025 suite reused).

---

## Batch 0 — Source freeze and traceability  ✅ (this phase)

- **Requirement IDs:** JR-2-01, JR-33-01 · **Sitemap nodes:** all (mapping) · **Assets:** all (inventory)
- **Allowlist:** `docs/execution/FITDESK_ZERO_DRIFT_*`, `FITDESK_JOURNEY_REQUIREMENT_MATRIX.md`, `FITDESK_SITEMAP_ROUTE_MATRIX.md`, `FITDESK_ASSET_IMAGE_MATRIX.md` · **Denylist:** all app code.
- **Routes/fixtures/tests:** n/a (docs only). **Browser script:** n/a. **Screenshots:** n/a.
- **Rollback:** delete the seven docs. **Commit:** `docs(execution): add zero-drift phase 0 traceability package`
- **Acceptance:** counts in the Phase 0 report match the files; hashes recorded; no app-code diff (`git status` clean outside docs/execution).

## Batch 1 — Brand primitives and design system

- **Requirement IDs:** JR-3.5-01 (patterns), JR-24-01 (state primitives foundation) · **Sitemap nodes:** none (tokens) · **Assets:** A01, A02, A73, A81 (primitives only)
- **Allowlist:** `tailwind.config.ts`, `app/globals.css`/token files, `components/ui/**` (buttons, inputs, badges, cards, KPI tile, avatar, sheet/drawer primitives, table shell), `public/brand/**` (logo assets), font wiring (Inter). No route/page changes.
- **Denylist:** global list + all `app/**` pages, `features/**` logic.
- **Expected routes:** none new. **Fixtures:** Storybook-style preview page under a dev-only route or component test harness.
- **Automated tests:** existing suite green (`npx vitest run`); token snapshot tests; `npm run build`.
- **Browser script:** render primitive gallery; verify light/dark-agnostic tokens, focus states, touch-target sizes.
- **Screenshots:** primitive gallery 1440×900 + 390×844 vs A02 crops.
- **Rollback:** revert batch branch. **Commit:** `feat(design-system): adopt FitDesk brand tokens and component primitives`
- **Acceptance:** palette #0B1020/#635BFF + scale per A02; A73 lockup ("by Novarra") in place; badge/button/input states match A02; no page redesigned yet; CR-19/CR-20 elements absent.

## Batch 2 — Authentication (+ marketing entry)

- **Requirement IDs:** JR-10-01 (auth entry), R1–R11 · **Sitemap nodes:** Public and authentication (R1–R11) · **Assets:** A30, A31, A32, A68, A69 (sign-in), A35, A36, A37, A48, A49 (marketing)
- **Pre-decisions:** CR-17 (recovery flows, Apple), CR-36 (marketing copy pack), CR-37 (variant choice).
- **Allowlist:** `app/page.tsx` (marketing), `app/auth/**` presentation, new `app/(auth)/sign-in|sign-up|forgot-password|reset-password|verify-email` routes + aliases AL1/AL2, `app/privacy`, `app/terms`, auth-state displays (R9–R11), `components/` auth/marketing components.
- **Denylist:** global list; Better Auth config/contracts untouched (UI + supported flows only).
- **Expected routes:** `/`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`, `/privacy`, `/terms` + `/auth/login`→`/sign-in`, `/auth/register`→`/sign-up` redirects.
- **Fixtures:** test user creds; expired-session simulation.
- **Automated tests:** route/redirect tests; auth-flow integration (sign-in/up, recovery per capability); copy asserts (no unverified claims).
- **Browser script:** sign-up → sign-in → sign-out; recovery flow; alias redirects; session-expired state; mobile layouts.
- **Screenshots:** `/` and `/sign-in` at 1440×900 + 390×844 vs chosen variants.
- **Rollback:** batch branch. **Commit:** `feat(auth): rebuild marketing entry and authentication surfaces per zero-drift assets`
- **Acceptance:** verbatim journey labels; no Apple/SOC-2/testimonials unless PO-approved; aliases live; existing logins unaffected.

## Batch 3 — Onboarding

- **Requirement IDs:** JR-10-01/02, JR-9 handoff, R12–R14 · **Sitemap nodes:** Workspace activation (R12–R18 intro slice) · **Assets:** A18, A58 (welcome), A16/A57/A72 (reference), A14/A15/A19/A54/A55/A56/A59 (only per CR-28 decision)
- **Pre-decision:** **CR-28** (wizard scope — headline). Mechanical default: minimal activation.
- **Allowlist:** `app/onboarding/**` presentation, `components/onboarding/**`, `features/onboarding/**` presentation seam.
- **Denylist:** global list; provisioning request/idempotency logic untouched; no onboarding-only persistence (JR-9-03).
- **Expected routes:** `/onboarding` (welcome → Start Workspace).
- **Fixtures:** reset test user (zero WorkspaceProvisioning rows) per JR-10-03.
- **Automated tests:** welcome renders; **"Start Workspace"** verbatim label assert; no new persistence.
- **Browser script:** login → `/onboarding` → Start Workspace fires exactly one idempotent request.
- **Screenshots:** welcome 1440×900 + 390×844 vs A18/A58.
- **Rollback:** batch branch. **Commit:** `feat(onboarding): rebuild workspace introduction and start-workspace entry`
- **Acceptance:** CR-28 decision recorded and honored; CTA label verbatim; CR-30 toggles absent.

## Batch 4 — Provisioning and Workspace Ready

- **Requirement IDs:** JR-10-01/02/03, JR-25-01 (provisioning loops) · **Sitemap nodes:** R15–R18 · **Assets:** A20–A24, A34, A42, A60–A64, A70, A71, A23 (reference)
- **Pre-decision:** CR-31 (blocked-state content = real CP reasons).
- **Allowlist:** provisioning state components under `components/onboarding/**` / `features/onboarding/**`; polling presentation.
- **Denylist:** global list; `app/api/provisioning/status`, `app/api/workspace/retry` untouched; no timer-simulated progress.
- **Expected routes:** `/onboarding` states (waiting/queued, in-progress, blocked, failed, ready).
- **Fixtures:** mocked CP responses for all five states + queue position.
- **Automated tests:** state rendering per response; retry idempotency (existing contract tests reused); no-fake-progress assert (progress only from payload).
- **Browser script:** simulate each state; refresh-safe return; retry on failed; Continue to Dashboard on ready.
- **Screenshots:** all five states, both viewports, vs A20–A24/A60–A64/A34/A71.
- **Rollback:** batch branch. **Commit:** `feat(provisioning): implement authoritative provisioning state screens`
- **Acceptance:** four journey states + queue visible; explainability structure per A20/A21; no Stripe/multi-seat/push-notification content.

## Batch 5 — Desktop and mobile shell

- **Requirement IDs:** JR-4.1-01 (entry), N1–N24, JR-27.2-01 · **Sitemap nodes:** §1 nav (N1–N24), §20 statement · **Assets:** A03/A10 (light shell), A25 (dark variant), A38 (mobile nav), A52/A53 (More), A02 (patterns)
- **Pre-decision:** **CR-33** (skin — headline).
- **Allowlist:** `components/modules/DashboardClientShell.tsx` (or successor `components/shell/**`), `app/dashboard/layout.tsx` seam, More menu, FAB, header (search affordance, sync state, account), route aliases scaffolding.
- **Denylist:** global list; page contents unchanged (shell only).
- **Expected routes:** shell around existing pages; `/dashboard` default; More menu; placeholder targets for Inbox/Billing/Settings nav (routes land in B10–B12 — nav items may point to alias targets or staged stubs per PO preference recorded at batch start).
- **Fixtures:** none special.
- **Automated tests:** nav label + order asserts (desktop exactly `Dashboard, Schedule, Clients, Inbox, Billing, Settings`; mobile exactly `Home, Schedule, Clients, Inbox, More`); More = exactly five entries; FAB = four canonical entries; Search never in More.
- **Browser script:** desktop sidebar + mobile tabs navigation sweep; More menu; FAB opens canonical flows (stub targets allowed pre-B7/8/10/11); persistent header search affordance.
- **Screenshots:** shell desktop 1440×900, mobile 390×844 vs A03/A38.
- **Rollback:** batch branch. **Commit:** `feat(shell): implement canonical six-destination desktop and five-tab mobile navigation`
- **Acceptance:** verbatim labels/order; CR-19/25/39/40 exclusions honored; old routes still work via aliases.

## Batch 6 — Dashboard

- **Requirement IDs:** JR-4.x, JR-5.1→5.3, JR-9-01/02/03, JR-25-01(D), JR-26-01 · **Sitemap nodes:** R19–R30 · **Assets:** A10, A11, A45, A46, A76 (reference)
- **Pre-decisions:** CR-12 (charts omitted), CR-26 (no composite score), CR-20 (no Pulse).
- **Allowlist:** `app/dashboard/page.tsx` presentation, `features/dashboard/**` components, dashboard sections (Daily Brief/Today/Needs Attention/Business Health/activation), attention-resolver entry slots (grammar lands B14 — B6 ships list + focused item view).
- **Denylist:** global list; `lib/dashboard/derive.ts` and data reads unchanged (JR-6.1-01).
- **Expected routes:** `/dashboard` (+ `?resolver=attention&item=` URL slot).
- **Fixtures:** empty/sparse/populated days; unresolved sessions; overdue invoices; unavailable/partial reads (mocked).
- **Automated tests:** seven-state rendering (JR-5.1-01); activation copy verbatim (JR-9-02); Today content classes; attention priority order; forbidden-copy asserts ("all clear" on failed load).
- **Browser script:** forced loading/partial/unavailable/empty/sparse/populated; activation three-state progression; attention item → resolve → refresh loop.
- **Screenshots:** all dashboard states, both viewports, vs A10/A11/A45/A46.
- **Rollback:** batch branch. **Commit:** `feat(dashboard): rebuild command center per journey states and assets`
- **Acceptance:** five-question hierarchy; activation checklist derived (no persistence); no Pulse/Prepared Actions/Unread-messages card (inbound-gated) unless PO enabled; honest-state copy verbatim.

## Batch 7 — Schedule and Booking

- **Requirement IDs:** JR-14.x (MVP set per 14.16), JR-18.2-01, JR-16.6-01, JR-25-01(booking), R31–R48, AL3/AL4 · **Sitemap nodes:** Schedule + Session context · **Assets:** A25, A26, A27, A28, A65, A66, A78 (reference)
- **Pre-decisions:** CR-07 (readiness deferred), CR-34 (composed exception UIs), CR-24 (Month view/extra settings omitted).
- **Allowlist:** `app/dashboard/schedule/**` presentation + new `/schedule` alias + `/sessions/[sessionId]` route; `components/scheduling/**` (BookingSheet presentation, session cards, availability sheet); `features/scheduling/**` presentation seams.
- **Denylist:** global list — engine/bookingService/sessionRepository/schedulingActions logic untouched; structured-conflict contract consumed, never reimplemented.
- **Expected routes:** `/schedule` (day/week/availability), `/schedule?sheet=booking`, `/schedule?sheet=availability`, `/sessions/{sessionId}`, `/sessions/{sessionId}?sheet=reschedule`; AL3/AL4 redirects.
- **Fixtures:** conflicts (hard overlap; soft buffer-only; working-hours), recurrence series, locations w/ confident/uncertain identity, time-off blocks.
- **Automated tests:** BookingSheet always-visible field set (Client/Date and time/Duration/Location/Session type/Repeat — JR-14.6-01); buffer-override block verbatim copy + reasons (JR-14.1-01); working-hours exception copy (JR-14.2-01); location-confidence copy (JR-14.3-01); scope-selector labels (JR-14.4-01); session-card location-label privacy; engine conflict tests untouched and green.
- **Browser script:** book one-off; recurring with one conflict; soft-buffer override E2E (reason → review → confirm → audit event); outside-hours exception; uncertain-location prompt; reschedule via canonical sheet; dated-availability creation → affected review; URL-backed sheet restore on refresh/back.
- **Screenshots:** day/week/availability + BookingSheet steps + each exception block, both viewports, vs A25–A28/A65/A66.
- **Rollback:** batch branch. **Commit:** `feat(schedule): canonical BookingSheet with structured exceptions and dated availability`
- **Acceptance:** four exception UIs match journey verbatim copy; no request-banner/waitlist/Month view; hard conflicts never overridable; JR-14.16 MVP set complete, hardening set absent.

## Batch 8 — Clients and Client Hub

- **Requirement IDs:** JR-12.1/12.2, JR-16.1/16.2/16.6, JR-17.1→17.5, JR-17.9, JR-17.10 (honest basics), JR-18.10-01, JR-25-01(client), R49–R77, AL5–AL8 · **Sitemap nodes:** Clients + Client Hub · **Assets:** A05, A07, A08, A09, A40, A41, A43, A44, A75 (reference)
- **Pre-decisions:** CR-23 (A08 tab baseline), CR-09 (hardening-section rendering), CR-24 (undocumented fields omitted).
- **Allowlist:** `app/dashboard/clients/**` presentation + `/clients` aliases; `components/clients/**`, `features/clients/**` presentation; hub section components; smart-view filters; AddClientSheet presentation.
- **Denylist:** global list — client creation chain, duplicate detection, goal system logic, package assignment logic untouched.
- **Expected routes:** `/clients` (+9 smart views via URL filters), `/clients?sheet=add`, `/clients/{clientId}` + `?view=today|overview|goals|sessions|progress|billing|attendance|communication|activity`, `?panel=statement`, `?sheet=assign-package`, lifecycle sheet; AL5–AL8 redirects.
- **Fixtures:** clients across billing modes/lifecycle states; duplicates; goals w/ conflicts + safety states; packages active/low/exhausted.
- **Automated tests:** smart-view inclusion rules + URL state + no-mutation (JR-18.10-01); hub section labels verbatim (JR-17.2-01); Today-context assembly + honesty (JR-17.3-01); Next Safe Action mapping order (JR-17.4-01); attendance denominator + forbidden-copy assert (JR-17.9-01); Add Client 3-step + duplicate branch (JR-12.1-01); statement URL restore (JR-12.6-01); deactivation unresolved-state honesty.
- **Browser script:** add client (all 3 steps + duplicate path) → hub → assign package (Paid Now + Pay Later) → goals capture → statement open/refresh-restore → attendance → lifecycle basic deactivate honesty; smart-view sweep.
- **Screenshots:** clients list + each hub section + Add Client steps, both viewports, vs A05/A08/A09/A40–A44.
- **Rollback:** batch branch. **Commit:** `feat(clients): rebuild client list, smart views, and client hub per canonical IA`
- **Acceptance:** A08-baseline tabs incl. Today + Statement, no Documents/streak/auto-pay/demographics; goal layers preserved; no profile-completion %; hub actions launch canonical URL-backed workflows.

## Batch 9 — Session Completion

- **Requirement IDs:** JR-3.6-01, JR-5.5→5.8, JR-13.1→13.4, JR-13.8-01, JR-25-01 (completion/payment loops) · **Sitemap nodes:** SessionCompletionSheet (W4), offline states (R47 slot) · **Assets:** A80 (composition; CR-41/42 corrections)
- **Pre-decisions:** CR-41 (four outcomes), CR-42 (fail-closed expired), CR-08 (resolver depth).
- **Allowlist:** completion sheet presentation in `features/scheduling/**` + `components/scheduling/**`; `/sessions/{sessionId}?sheet=complete` URL-backing; next-session-focus capture UI.
- **Denylist:** global list — sessionCompletionService orchestration, idempotency, billing hooks, payment contract untouched.
- **Expected routes:** `/sessions/{sessionId}?sheet=complete` (from Today/Session/Needs Attention/Client Hub — all four entry points).
- **Fixtures:** sessions per billing mode incl. exhausted + expired packages; duplicate-submit; partial-failure simulations (progress-ok/invoice-fail etc.).
- **Automated tests:** four outcome choices verbatim; progressive disclosure per mode (package hides payment; PPS inline Paid Now/Pay Later; Trial no-charge; Unset fail-closed); package field block + PPS field block verbatim (JR-13.2-01); review ten-item matrix (JR-13.4-01); step-truth on partial failure; duplicate-effect prevention (existing suites); exhausted/expired → fail-closed路 no silent PPS (CR-42 assert); focus-capture lifecycle (JR-13.8-01).
- **Browser script:** complete each billing mode E2E; defer → resolve from Needs Attention; Paid Now inline payment; Pay Later leaves visible outstanding invoice; simulated invoice-step failure shows exact recovery; focus chip appears in Client Today.
- **Screenshots:** 3-step drawer + mobile sheet frames per branch vs A80 (corrected outcomes), both viewports.
- **Rollback:** batch branch. **Commit:** `feat(completion): unified URL-backed session completion sheet with billing branches`
- **Acceptance:** JR-5.5-01 items 1–6 verified; "Session progress" naming; no quality-rating outcomes; no auto-send captions; CR-42 behavior verified.

## Batch 10 — Inbox

- **Requirement IDs:** JR-5.9-01, JR-17.14-01, JR-19-01, JR-19.1-01, JR-18.15-01 (gate), JR-25-01(WhatsApp), R78–R87, AL9 · **Sitemap nodes:** Inbox + MessageComposer (W8) · **Assets:** A06, A12, A13, A50, A51, A77 (layout; CR-10/27 corrections)
- **Pre-decisions:** CR-10 (disabled-vs-hidden inbound filters), CR-11 (consent schema approval — blocking for send-gate work).
- **Allowlist:** new `app/(app)/inbox/**` (or dashboard-nested equivalent + alias), composer component (canonical, reused from five entry points), sent/failed/drafts views, per-client conversation view; AL9 reconciliation.
- **Denylist:** global list — send path/templates/logging contracts untouched; no inbound webhook work (hardening).
- **Expected routes:** `/inbox`, `?filter=sent|failed|drafts|all`, `?conversation={id}`; `/dashboard/messages/[clientId]` → alias; hub `?view=communication` shares records.
- **Fixtures:** outbound history sent/delivered-unknown/failed; drafts; message packs; consent states (post-CR-11).
- **Automated tests:** one-composer reuse across Dashboard/Client Hub/Session/Invoice/Package entry points (JR-5.9-01); pack names verbatim (JR-17.14-01); consent fail-closed matrix; send result states distinct (confirmed/failed/unknown); draft preservation; no inbound affordances in MVP mode.
- **Browser script:** compose from each entry point → confirm → logged result; failed-send visibility + retry; draft leave/return; conversation deep link; hub Communication = same records.
- **Screenshots:** inbox list + thread + composer, both viewports, vs A12/A13/A50/A51 (outbound-era content).
- **Rollback:** batch branch. **Commit:** `feat(inbox): canonical outbound inbox, message composer, and delivery truth`
- **Acceptance:** truthful staging (no fake inbound); Sitemap filter chrome per CR-10 decision; packs prefill live facts; global Sent Messages log exists.

## Batch 11 — Billing

- **Requirement IDs:** JR-6.7-01, JR-12.4→12.14, JR-12.16-01, JR-8-01 (statement rule), JR-25-01(payment), R88–R105, AL10–AL13 · **Sitemap nodes:** Billing + Invoice detail + RecordPaymentSheet (W6) + Statement (W11) · **Assets:** A03, A04, A38, A39, A74 (reference; CR-06/22/38 corrections)
- **Pre-decisions:** CR-22 (A03-vs-A04 composition), CR-06 (manual-invoice URL policy), CR-12 (no charts).
- **Allowlist:** new `/billing` overview + `/billing/invoices` + invoice detail presentation; RecordPaymentSheet (recast from pay route); statement view completion (labels/states/ledger); AL10–AL13 redirects; billing nav entry.
- **Denylist:** global list — recordPayment/statement actions untouched; ERP allocation contract reused.
- **Expected routes:** `/billing` (+filters), `/billing/invoices`, `/billing/invoices/{invoiceId}`, `?sheet=record-payment`, `?sheet=message`; aliases live; `/dashboard/invoices/new` removed from flow per CR-06.
- **Fixtures:** invoices all statuses; partial-allocation scenarios; degraded statement reads (stale/partial/unavailable/uncertain).
- **Automated tests:** summary labels verbatim ("Balance due/Overdue/Invoiced/Paid/Credits" — JR-12.9-01); statement six-state copy verbatim (JR-12.13-01); ledger desktop columns + mobile card structure (JR-12.10-01); state-derived actions matrix (JR-12.12-01); RecordPaymentSheet review fields + "[Confirm payment]" (JR-12.14-01); never-zero-on-failure; manual-invoice absence from flow; a11y checks (JR-12.16-01).
- **Browser script:** billing overview → invoice → record payment round-trip → refreshed statement; statement from hub + overdue attention; forced degraded states; overpayment blocked; alias deep links (old `/invoices` URLs resolve).
- **Screenshots:** billing overview + invoice detail + payment sheet + all six statement states, both viewports, vs A03/A38.
- **Rollback:** batch branch. **Commit:** `feat(billing): billing destination, canonical record payment sheet, and honest statement states`
- **Acceptance:** one payment contract from all entry points; JR-12.17 MVP nine items complete; hardening items absent; no Create Invoice affordance.

## Batch 12 — Settings

- **Requirement IDs:** JR-18.2-01 (editor), JR-14.1-01 (buffer config), R116–R134, AL14–AL18, settings guardrails (§13) · **Sitemap nodes:** Settings destinations · **Assets:** A29, A79 (reference; CR-24/29/35 corrections)
- **Allowlist:** `/settings` + destination pages (profile/workspace/working-hours/availability/scheduling/packages/payment-methods/locations/communications/integrations/security/data/help); AL14–AL18 redirects; section nav.
- **Denylist:** global list — no Policy Change Impact Preview claims (JR-18.12-01: plain saves without impact claims); pilot/hardening destinations hidden (program-library, exercise-catalog, offline, AI).
- **Expected routes:** as route matrix R116–R134 (MVP set).
- **Fixtures:** workspace settings; locations; package templates.
- **Automated tests:** guardrail asserts (no client-specific assignment/payment recording/manual invoice in Settings); one-off exceptions never rewrite globals; section-nav completeness vs matrix; alias redirects.
- **Browser script:** edit working hours; create dated availability exception → appears in Schedule; package template CRUD; payment-methods shows provider set; configure-in-context returns to origin.
- **Screenshots:** settings hub + key destinations, both viewports, vs A29/A79.
- **Rollback:** batch branch. **Commit:** `feat(settings): canonical settings destinations with policy guardrails`
- **Acceptance:** documented destinations only; no multi-seat/plan/gateway/integration inventions; dated availability live (CR-18).

## Batch 13 — Global Search

- **Requirement IDs:** JR-18.13-01, R106–R115 · **Sitemap nodes:** Global Search + persistent access · **Assets:** A33, A47, A67
- **Allowlist:** `/search` route + overlay (Cmd/Ctrl+K), header search affordances (desktop + mobile), tenant-scoped search reads (new read-only queries via existing repositories/services — no new write paths).
- **Denylist:** global list; no sensitive trainer-note indexing; no Ask FitDesk panel.
- **Expected routes:** `/search`; ⌘K overlay; mobile full-screen from header icon.
- **Fixtures:** cross-tenant corpus (T1 + T2) for permission tests; merged/archived identity labels.
- **Automated tests:** tenant/permission filtering (mandatory denial tests); group set complete (Recent/Clients/Sessions/Conversations/Invoices/Payments/Locations/Commands); commands visually distinct; no-result state; recent-search safety.
- **Browser script:** ⌘K → query → deep link into each group target; mobile full-screen flow; cross-tenant query returns nothing foreign.
- **Screenshots:** desktop overlay + `/search` + mobile, vs A33/A47/A67.
- **Rollback:** batch branch. **Commit:** `feat(search): tenant-scoped global search with canonical deep links`
- **Acceptance:** satisfies "hardening after canonical routes are stable" (all routes stable post-B12); search never in More; zero permission leaks.

## Batch 14 — Shared resolver and state library

- **Requirement IDs:** JR-3.7-01, JR-5.3-01 (grammar), JR-15.2→15.6, JR-18.5-01, JR-18.6-01, JR-18.16-01, JR-24-01, JR-27.5/27.6, S1–S16 · **Sitemap nodes:** shared states §15, AttentionResolver (W10), SyncConflictResolver slot (W5), Session Change Summary (W20), Explanation panel (W19) · **Assets:** A81 (primary), A02
- **Allowlist:** `components/ui/states/**` + `components/resolvers/**` (state library, explanation panel, exception interaction component w/ reason+scope+review, success grammar component, session change summary, undo-eligibility helper); adoption passes in dashboard/schedule/completion/billing surfaces (presentation swaps only).
- **Denylist:** global list — domain rule levels come from domain responses (UI never reclassifies); audit vocabulary extends existing contracts without schema change (or gated per CR-11-style approval if persistence needed).
- **Expected routes:** none new; `?resolver=attention&item=`, `?resolver=resume&item=` states wired.
- **Fixtures:** forced every state S1–S16; rule-level samples (hard/soft/advisory/alternate).
- **Automated tests:** JR-24-01 verbatim copy per state; resolver seven-step grammar; exception 8-step soft path; review 8-field block; reason codes verbatim; success grammar six parts + priority derivation; change-summary structure; undo eligibility matrix.
- **Browser script:** attention item resolve-one-reveal-next loop; soft exception E2E through shared component; consequential edit → change summary; forced state gallery.
- **Screenshots:** state gallery + resolver + success + change summary, both viewports, vs A81.
- **Rollback:** batch branch. **Commit:** `feat(state-library): shared honest states, resolver grammar, and exception components`
- **Acceptance:** all surfaces adopted (no bare "Saved" toasts on consequential flows); level classification domain-owned; A81 pattern fidelity.

## Batch 15 — Full journey and responsive acceptance

- **Requirement IDs:** JR-11-01, JR-32-01 (criteria 1–130), JR-34-01, acceptance matrix all levels · **Sitemap nodes:** all mapped nodes verification · **Assets:** all app-surface assets (side-by-side evidence)
- **Allowlist:** test files, fixtures, screenshots, acceptance evidence docs; defect fixes route back through the owning batch's allowlist as micro-PRs.
- **Denylist:** global list; no new features.
- **Expected routes:** all; aliases AL1–AL19 verified.
- **Fixtures:** full E2E tenant + cross-tenant.
- **Automated tests:** Master Test Strategy §11 twelve critical E2E journeys; completion matrix (§9); alias tests; a11y suite (keyboard/focus/SR/zoom/touch/reduced-motion per acceptance level 6); copy-verbatim sweep.
- **Browser script:** JR-34-01 final loop walked end-to-end (gated steps skipped); every asset's surface captured desktop+mobile side-by-side with the asset; differences annotated → each must trace to a register entry.
- **Screenshots:** one implementation screenshot per relevant asset (both viewports) — the asset-compliance evidence pack.
- **Rollback:** n/a (verification). **Commit:** `test(acceptance): zero-drift full-journey and responsive acceptance evidence`
- **Acceptance:** GO checklist = acceptance matrix all six levels pass; unresolved CR list empty or explicitly PO-deferred; counts reported.

---

## Post-B15 hardening backlog (explicitly out of program scope, from §30/17.16/18.18/15.7)

Ordered by source priority: Financial Correction Resolver (mandatory) · Duplicate Identity Resolver (mandatory before imports) · Recurring Schedule Manager mutations · Package-exhausted resolver + waiver (CR-08) · Package Runway · Resume Work queue · Receipt · Inbound Inbox stack (webhooks→filters→matching→Consent Center) · Day Disruption Manager · Weekly Planning Brief · Policy Change Impact Preview · Integration Health Center · Offline/sync hardening · Statement download/share/filters · command palette. Pilot AI features remain PO-gated (CR-14).
