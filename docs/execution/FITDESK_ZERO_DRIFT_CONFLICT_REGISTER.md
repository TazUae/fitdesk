# FitDesk Zero-Drift Conflict Register

```text
Phase: 0 — Zero-Drift Traceability
Generated: 2026-07-20
Sources: frozen per FITDESK_ZERO_DRIFT_SOURCE_MANIFEST.md
Fixed authority default (verbatim from the contract):
  - Journey beats asset for behavior and copy;
  - Sitemap beats asset for route and navigation placement;
  - Asset beats existing UI for visual composition;
  - existing domain and integration contracts remain protected.
No other precedence is invented. "PO?" = product-owner decision required before implementation.
Entry fields: A = source A excerpt/location · B = source B excerpt/location · Route = affected
route/screen · Rule = deterministic authority rule applied · Resolution = proposed mechanical
resolution · PO? = yes/no.
```

## Source-integrity conflicts

**CR-01 — Divergent `.tmp` document copies**
- A: repo `docs/product/FITDESK_JOURNEY_MAP_V1.md` (242,548 B; body sha `bd4a6bba…` verified) · B: `axis-erp/.tmp/fitdesk-build-20260719_234904/docs/product/FITDESK_JOURNEY_MAP_V1.md` (249,089 B, sha `35b28a16…`) + sitemap likewise.
- Route: all. Rule: contract binds "the repository sources"; repo adoption banners verified. Resolution: repo copies are frozen sources; `.tmp` copies non-authoritative. **PO? no** (informational: if `.tmp` holds a newer PO draft, a re-freeze would be a new Phase 0 revision).

**CR-02 — Search result groups differ between sitemap sections**
- A: Sitemap §3 Global Search children "Recent records/Clients/Sessions/Invoices/Payments/Locations/Conversations/Canonical commands"; §8.1 same · B: Journey 18.13 groups "Clients/Sessions/Invoices/Payments/Locations/Commands" (no Conversations/Recent).
- Route: `/search`. Rule: Sitemap owns navigation/destination content. Resolution: implement the sitemap superset (incl. Conversations, Recent); journey requirements (tenant scoping, distinct commands, no-result state) apply unchanged. **PO? no**.

**CR-03 — Statement route state illustrative vs canonical**
- A: Journey 12.6 "an illustrative state is: /dashboard/clients/{clientId}?panel=statement" · B: Sitemap §3/§12 `/clients/{clientId}?panel=statement`.
- Route: Client Hub statement. Rule: Sitemap beats journey for route naming; "exact route must follow the audited repository". Resolution: canonical `?panel=statement` on the hub route per alias plan (AL7). **PO? no**.

**CR-04 — Journey §27.8 adoption order vs contract batch order** *(referenced as CR-13 in matrices)*
- A: Journey 27.8 fifteen-step adoption order (Unified Complete Session first) · B: Zero-drift contract batches 0–15 (brand → auth → onboarding → … ).
- Route: program sequencing. Rule: the implementation contract is the operating directive for this program; journey order is product guidance. Resolution: contract batch order governs; 27.8 orders work *within* batches (e.g. B9 before B11 polish inside their windows). **PO? no**.

**CR-05 — Sitemap `/sessions/{sessionId}` route vs no current session detail route**
- A: Sitemap §3 "Session context /sessions/{sessionId}" · B: HEAD has no session detail route (R39).
- Route: `/sessions/{sessionId}`. Rule: sitemap owns routes; asset-beats-UI for composition. Resolution: new route in B7 with completion/reschedule actions mounted per canonical workflow matrix. **PO? no**.

## Journey/doc-internal scope conflicts

**CR-06 — Manual invoice creation exposed at HEAD**
- A: Journey 12.4 "Manual invoice creation stays hidden from the normal trainer flow." + 32.50 + CAP-059 · B: HEAD route `app/dashboard/invoices/new/page.tsx` reachable from invoice list; A74 shows "Create Invoice"/"Send Invoice" buttons.
- Route: `/billing`. Rule: Journey beats asset for behavior; guardrail is a locked decision. Resolution: remove manual-invoice entry points from nav/normal flow in B11; decide direct-URL policy (redirect vs keep for support). **PO? yes** (direct-URL policy only).

**CR-07 — Readiness checklist scope ambiguity**
- A: Journey 14.12 derived readiness display (state model) · B: Journey 14.16 "Equipment, client preparation, readiness, trainer reminder — PRODUCTION-HARDENING".
- Route: Session Detail. Rule: delivery-priority table is the explicit scope authority. Resolution: B7 ships the three state families; readiness checklist deferred to hardening unless pulled forward. **PO? yes**.

**CR-08 — Waiver + package-exhausted resolver batch placement**
- A: Journey 13.6/13.7 describe both inside the completion journey · B: Journey 15.7/§30 classify both "PRODUCTION-HARDENING SOON" (exhausted resolver "HIGH PRIORITY").
- Route: completion sheet. Rule: scope tables govern batches. Resolution: B9 ships fail-closed behavior (preserve progress, route to package review — JR-25-01) without the full resolver/waiver UI; both UIs land per PO pull-forward or hardening. **PO? yes**.

**CR-09 — Client Hub nine-section IA vs per-section hardening statuses**
- A: Sitemap §6 + Journey 17.2 full hub IA · B: Journey 17.16 marks Recurring Schedule Manager / Resume Work / Unified Progress / Pause-Resume / Deactivation resolver / Communication history as hardening.
- Route: `/clients/{clientId}`. Rule: Sitemap owns placement; journey delivery table owns depth. Resolution: B8 renders all MVP-designated sections + read-only shells where data exists; hardening-mutation surfaces gated. Section presence/labels per sitemap. **PO? yes** (which hardening sections render as read-only vs hidden).

**CR-10 — "Inbox" destination vs outbound-only MVP**
- A: Sitemap nav destination 4 "Inbox /inbox" with inbound filters; Inbox spec stages · B: Journey 17.7 "FitDesk uses **Resume Work**, not 'Inbox'…"; 19.1 "no inbound inbox journey"; 27.7 "build a fake inbox for an outbound-only product" prohibited; D10 §16 "Do not present a full inbound Inbox if only a sent log exists; stage the label and capability truthfully."
- Route: `/inbox`. Rule: Sitemap wins route/label; Journey wins behavior; staging doctrine reconciles. Resolution: B10 ships `/inbox` as the nav destination with truthful outbound-era content (Sent/Failed/Drafts/conversation composer, delivery states); inbound filters (Unread/Needs reply/Waiting/Unmatched) are hardening and render disabled or hidden. "Resume Work" remains the separate drafts queue name. **PO? yes** (disabled-vs-hidden presentation).

**CR-11 — Consent gate requires schema change**
- A: Journey 18.15/PD-005 four consent states; composer fails closed · B: HEAD `lib/db/schema.ts` has no consent field (CLAUDE.md R-2 gap).
- Route: composer (B10). Rule: protected contracts + CLAUDE.md schema-approval gate. Resolution: B10 needs a consent-state schema addition **before** any reminder/follow-up send path; requires explicit approval per workspace rules. **PO? yes** (schema change approval).

**CR-12 — Analytics/insight charts vs approval-gated insight layer**
- A: Assets A03/A04/A10/A26/A38/A39/A74/A76/A78 render revenue trend charts, utilization %, day-revenue summaries · B: Journey 26.1 "Do not treat these as MVP…: Insight layer and chart."
- Route: `/dashboard`, `/billing`, `/schedule`. Rule: Journey beats asset for behavior. Resolution: omit trend charts/utilization/insight tiles from B6/B7/B11; render authoritative operational facts (counts, balances) only; charts return only on PO approval of the insight layer. **PO? yes**.

**CR-13** — merged into CR-04.

**CR-14 — §29 lists pilot AI items as MVP**
- A: Journey §29 includes Quick Add, structured completion, brief, Pulse Lite, copilot, booking parser, Workout Builder, Ask FitDesk · B: same features carry PILOT/APPROVAL-GATED status in 4.3/5.10/5.11/16.7/20.x and CAP register "Pilot".
- Route: AI surfaces. Rule: the journey's own gating language beats list membership (no invention without approval). Resolution: AI items excluded from B0–B15; each ships only behind flags after PO enables its pilot. **PO? yes** (per feature).

**CR-15 — Items dual-listed in §29 (MVP) and §30 (hardening)**
- A: §29 "One contextual outbound WhatsApp composer…", statement, buffer override etc. · B: §30 "One canonical Record Payment surface across all entry points", "One canonical BookingSheet with URL-backed overlay behavior…" etc.
- Route: several. Rule: §29 wins inclusion; §30 defines hardening depth. Resolution: batches implement the §29 capability; §30 depth items (full URL-backing across every overlay, complete entry-point sweep) verified in B15 and topped up in hardening. **PO? no**.

**CR-16 — Canonical unprefixed routes vs current `/dashboard/*` nesting**
- A: Sitemap §3 routes `/schedule`, `/clients`, `/inbox`, `/billing`, `/settings`, `/search`, `/sessions/{id}` · B: HEAD nests all app routes under `/dashboard/*`; Sitemap IA principle 10 "Existing working routes win: Prefer aliases and incremental migration…".
- Route: all app routes. Rule: Sitemap owns canonical routes; principle 10 owns migration method. Resolution: per alias register AL1–AL19 — canonical routes added per surface batch with redirects both ways; old routes preserved until B15 verification; no bulk rewrite. **PO? no**.

**CR-17 — Auth surfaces beyond current Better Auth configuration**
- A: Sitemap routes /verify-email, /forgot-password, /reset-password; assets show "Continue with Apple" · B: HEAD auth = email/password + Google (CLAUDE.md); no recovery routes.
- Route: `/sign-in`, `/sign-up`, recovery routes. Rule: sitemap owns routes; protected auth contracts (Better Auth) own capability; no invention. Resolution: B2 implements recovery flows using Better Auth's supported capabilities (verify at build); Apple omitted until PO adds the provider. **PO? yes** (Apple; recovery-email infrastructure).

**CR-18 — Settings destinations MVP vs hardening lists disagree with journey**
- A: Journey 18.2 dated availability "MVP / PILOT-SAFE"; Sitemap §3 lists `/settings/availability` unbracketed · B: Sitemap §13 puts "Dated Availability" and "Data and Privacy" under Production-hardening.
- Route: `/settings/availability`, `/settings/data`. Rule: Journey wins behavior/scope for availability (MVP); sitemap §13 wins for pure-settings surfaces with no journey mandate. Resolution: dated-availability sheet ships in B7/B12 (journey-mandated); `/settings/data` ships minimal page in B12; full offline/data controls hardening. **PO? no**.

## Asset-vs-source conflicts (navigation and structure)

**CR-19 — Non-canonical navigation in design mocks**
- A: A02 side-nav mock `Today/Clients/Schedule/Inbox/Programs/Payments/Packages/Billing/Reports/Settings`, bottom-nav `Today/Clients/Quick Add/Schedule/Inbox`; A74–A79 10-item dark sidebar; A76/A78 mobile "Quick Add" center tab; A32/A36 preview mocks · B: Sitemap §1/§20 exact 6 desktop + 5 mobile labels; §14 prohibits Programs/Payments/Packages/Reports as primary nav.
- Route: shell (B5). Rule: Sitemap beats asset for navigation. Resolution: canonical navs only; showcase sidebars treated as non-binding illustration; FAB replaces "Quick Add" tab. **PO? no**.

**CR-20 — Numeric Client Pulse / client scoring in assets**
- A: A02 "Client Pulse 4.7", A76 "4.7 Great" distribution, A10 Pulse card, A11 "On Track/Needs Support" chips, A44 "Needs Review" client badge · B: Journey 5.10/20.15 pilot Pulse = Clear/Needs review/Unknown only, "no numerical risk score, prediction, character label"; 20.18 "Never: Sarah risk score: 73%"; 18.10 "A view is a filter, not a client status".
- Route: dashboard, clients, hub. Rule: Journey beats asset for behavior/copy. Resolution: omit all Pulse tiles/scores from B6/B8; if Pulse pilot is later enabled, states/wording per journey. **PO? no** (pilot enablement itself is CR-14).

**CR-21 — Pilot/mock affordances embedded in app frames**
- A: "Ask FitDesk" header buttons/banners (A03/A10/A11/A25/A33/A45/A46/A47/A67); "auto-pay" tips/labels (A03/A09/A43/A75); "Customize Dashboard" (A10) · B: Ask FitDesk = LIMITED PILOT LAST (20.14); auto-pay nonexistent (payment rules); no journey/sitemap source for dashboard customization.
- Route: several. Rule: Journey beats asset; no invention. Resolution: omit these elements; real billing state replaces auto-pay labels. **PO? no**.

**CR-22 — Billing overview variants disagree (A03 vs A04)**
- A: A03 tabs Overview/Invoices/Payments/Recovery, 4 KPIs · B: A04 tabs +Statements/Payment Plans/Corrections, 5 KPIs, Quick Actions rail.
- Route: `/billing`. Rule: sitemap owns tab set (Overview + Invoices MVP; others hardening); asset beats existing UI for composition. Resolution: B11 builds Overview+Invoices with A03/A04 composition choice at acceptance; Payment Plans omitted (installments gated). **PO? yes** (KPI/layout choice).

**CR-23 — Client Hub tab sets disagree across assets**
- A: A05 tabs include "Documents", omit Today/Statement · B: A08 tabs include Today+Statement, omit Documents; Sitemap §6 defines the canonical 12 sections (no Documents).
- Route: `/clients/{clientId}`. Rule: Sitemap beats asset for sections; A08 is the closest compliant baseline. Resolution: hub uses sitemap section set/labels; A08 structure as visual baseline; A05 content cards adopted where their section exists; "Documents" omitted. **PO? yes** (only if Documents is wanted → new scope).

**CR-24 — Undocumented fields/features depicted in assets (grouped)**
- A: demographics (age/gender/height/weight — A07/A08/A41), Emergency Contact (A08), "Training Streak" (A05), goal-% rings (A07/A41), plan names "Premium/Gold/Elite" (A41/A47/A13), revenue Goal tracker (A39), Month calendar view (A26/A78), min-notice/booking-window/slot-interval settings (A19/A59/A79), Export buttons (A09), Team Meeting blocks (A78), multi-trainer columns/roles/teams (A75/A52/A53/A29/A56/A70/A71/A79), Labels in Inbox (A12), call/video buttons (A06), client-support threads (A41) · B: no journey/sitemap source; several touch future-gated scopes (multi-seat, portal).
- Route: several. Rule: no unsupported feature invention; Journey/Sitemap silence = exclusion. Resolution: omit each unless PO adds scope; goal displays render structured goal-system data. **PO? yes** (per item, batched decision list).

**CR-25 — "Reports" in sidebar (A09)**
- A: A09 sidebar 7 items incl. Reports · B: Sitemap 6 destinations; §14 prohibits Reports-as-nav.
- Route: shell. Rule: Sitemap beats asset. Resolution: omit. **PO? no**.

**CR-26 — Business Health composite score (A10 "82 Good"; retention %)**
- A: A10 Business Health donut score + "Client Retention 91%" · B: Journey Business Health = derived summaries; 26.1 gates retention scoring; no score defined anywhere.
- Route: `/dashboard`. Rule: Journey beats asset. Resolution: render Business Health metric set without composite score or retention %. **PO? yes** (if PO wants a score, new journey copy needed).

**CR-27 — Inbox filters/channels/actions beyond spec**
- A: A12 Flagged/Resolved/Snoozed filters; SMS/Email/Instagram channels (A12/A13/A50/A51/A77); "Send Invoice"/"Schedule Call"/"Create Task"/"Send Plan" quick actions; "All Channels" selects; A77 "Handoff" teammate tab · B: Sitemap Inbox filter set; approved channel = WhatsApp/Evolution + native handoff; CR-06 guardrail; multi-seat future.
- Route: `/inbox`. Rule: Sitemap wins filters; Journey wins behavior; no invention. Resolution: canonical filters only; configured channels only; omit undocumented quick actions ("Share Payment Link" stays); teammate handoff omitted. **PO? no**.

## Asset-vs-source conflicts (behavior)

**CR-28 — Onboarding 7-step configuration wizard vs minimal activation (major)**
- A: A14–A19, A54–A59, A72, A16/A57 storyboards: 7-step wizard collecting business profile, brand colors, working hours, billing model, payment methods, communications before provisioning; step labels/ETAs; workspace URL; default package selection · B: Sitemap Onboarding node = "Workspace introduction / Start Workspace / Provisioning progress / Waiting-blocked-failed-completed / Safe retry / Continue to Dashboard"; Journey 10.1 minimal activation; 9 "No separate persistent onboarding workflow in the MVP… No new persistence solely for onboarding UI"; Settings owns hours/catalog/policy.
- Route: `/onboarding`. Rule: Journey beats asset for behavior/sequence; Sitemap beats asset for node set. Resolution (mechanical default): B3 ships Welcome (A18/A58 layout) → **Start Workspace** → B4 provisioning states → Ready (A34/A71); configuration steps live in Settings (B12) using the wizard screens' layouts; no onboarding-only persistence. If the PO wants the full pre-provisioning wizard, that is a scope decision overriding journey §9/§10 wording and requires new journey copy. **PO? yes (headline decision #1)**.

**CR-29 — SaaS subscription/plan surfaces (grouped)**
- A: "Pro Plan / Manage Plan" sidebar cards (A03/A09/A10 …), billing-plan review rows "Professional Monthly / Visa ••••4242" (A17/A56), Workspace Status plan/storage (A29), More→Billing "Manage plans" (A53), "payment method couldn't be verified" provisioning blockers (A23/A42/A60/A70), saved-cards Payment Methods copy (A52/A53) · B: no journey/sitemap node for trainer subscription management; payment stack has no card-on-file.
- Route: shell/settings/onboarding. Rule: no invention; Journey/Sitemap silence = exclusion. Resolution: omit all subscription-plan surfaces from B0–B15; provisioning blockers show real CP reasons. **PO? yes** (if subscription UX is wanted, new scope + docs).

**CR-30 — Automated client communications depicted**
- A: A14/A54 auto-send toggles ("Send instantly after a booking is made", reminders, follow-ups), A16/A57 Email/SMS notification toggles, A28 "Confirmation sent to <client>" on booking success, A80 "Invoice will be sent to client.", marketing "automate reminders/follow-ups" (A35/A48/A49) · B: Journey 3.1/19.1 outbound trainer-confirmed only; "no autonomous reminders"; CLAUDE.md "Auto-sending without user confirmation is not allowed in MVP".
- Route: onboarding/settings/booking/completion/marketing. Rule: Journey beats asset for behavior and copy. Resolution: omit auto-send toggles; success states offer "Prepare confirmation message" into composer; marketing copy revised. **PO? no** (behavior); **PO? yes** for marketing copy final wording (CR-36).

**CR-31 — Stripe / platform payment collection in assets**
- A: A20/A23/A42/A60/A70 "Connect Stripe / Reconnect Stripe" provisioning blockers; A57 "Collect Payments via FitDesk" + UPI/Cards/Net Banking/Wallets; A79 VISA/MC/AMEX gateways · B: payment stack = Whish/Cash/Bank Transfer via provider abstraction; ERP-authoritative billing; no Stripe, no platform collection; provisioning steps owned by Control Plane.
- Route: onboarding/settings. Rule: protected payment/provisioning contracts + no invention. Resolution: blocked-state layouts binding; content = real CP blockers; payment-method settings render the provider abstraction's configured set. **PO? yes** (only if a new provider/platform-collection scope is intended).

**CR-32 — Client self-booking depicted**
- A: A26 "2 pending session requests / Review Requests"; A19/A59 waitlist + "public booking page" toggles; A59 subcopy "make booking easy for your clients" · B: Journey 3.4 client has no direct interaction; inbound intent future-gated (19.x).
- Route: schedule/settings. Rule: Journey beats asset. Resolution: omit request banners/waitlist/public-booking toggles; "Pending" stays as trainer-side confirmation state. **PO? no**.

**CR-33 — Shell skin divergence (dark vs light sidebar)**
- A: A25 dark Midnight sidebar; A70 dark app bar; A74–A79 dark showcases · B: A03/A04/A09/A10/A29 light sidebar; same canonical labels.
- Route: shell (B5). Rule: asset beats existing UI for composition, but assets disagree → PO-visual choice. Resolution: B5 implements one skin (recommendation: light app shell, Midnight reserved for marketing/brand surfaces, matching the majority of app frames). **PO? yes (headline decision #2)**.

**CR-34 — Journey-required states with no matching asset (reverse gap)**
- A: Journey verbatim-copy requirements: buffer override (14.1), working-hours exception (14.2), location-confidence (14.3), scope selector (14.4), Session details group + Repeat field (14.6), No Show/Cancelled/Rescheduled branches + waiver (13.1/13.6), package-exhausted resolver (13.7), statement state copy (12.13), Add Client 3-step (12.1), activation copy/checklist (9), Session Change Summary (18.16), offline reconciliation states (§11.5 sitemap) · B: no dedicated asset depicts them (A28/A80 omit these branches).
- Route: B6–B11, B14. Rule: "a documented screen or state has no matching asset" → register + compose from design system. Resolution: build from A02/A81 primitives with journey verbatim copy; each carries PO-visual approval in its batch. **PO? no** (mechanical; approvals at batch acceptance).

**CR-35 — Undocumented integrations (Stripe/Mailchimp/Zoom/Zapier/Google Calendar rows)**
- A: A29/A79 integration rails · B: Sitemap Integrations = ERP health / WhatsApp health / Calendar [when enabled] / recovery.
- Route: `/settings/integrations`. Rule: Sitemap beats asset. Resolution: documented set only. **PO? yes** (only to add integrations scope).

**CR-36 — Marketing claims: fabricated metrics/testimonials/trials/compliance**
- A: A35–A37/A48/A49 "Trusted by 1,000+/2,000+ trainers", star ratings, testimonials, "14-day free trial", audience cards, "across India"; A69 "SOC 2 Compliant"; A71 "compliance verified"; A31/A32 testimonials; AI-capability tiles (A36) · B: no verified facts; confirmed-first copy rules; Novarra safeguard "Never invent clients, testimonials, case studies, metrics, prices, certifications…".
- Route: `/` marketing + auth pages. Rule: Journey/doctrine beats asset for copy; unverifiable claims excluded. Resolution: layouts binding; every commercial/social-proof/compliance claim replaced with PO-approved facts or removed. **PO? yes (headline decision #3 — marketing copy pack)**.

**CR-37 — Multiple variants for the same surface (sign-in, homepage)**
- A: sign-in A30/A31/A32 (+mobile A68/A69); homepage A35/A36/A37 (+mobile A48/A49) · B: one canonical surface each.
- Route: `/sign-in`, `/`. Rule: assets disagree → PO-visual choice; no blocking of batch start (default = A30 desktop + A68 mobile sign-in; A36 long-scroll homepage, doctrine-copy variant).
- Resolution: implement defaults, present variants at acceptance. **PO? yes** (variant selection).

**CR-38 — Mobile Billing variants (A38 cards vs A39 table)**
- A: A39 compact invoice table on mobile · B: Journey 12.6/12.10 mobile = readable cards, never squeezed tables; A38 card list.
- Route: `/billing` mobile. Rule: Journey beats asset. Resolution: A38 card pattern wins; A39's KPI/goal deltas rejected (goal tracker CR-24). **PO? no**.

**CR-39 — Search as a mobile bottom-nav tab (A47)**
- A: A47 bottom nav Home/Schedule/**Search**/Inbox/More · B: Sitemap mobile nav Home/Schedule/Clients/Inbox/More; Search = persistent header utility, never in More/tab.
- Route: mobile shell. Rule: Sitemap beats asset. Resolution: canonical five tabs; search via persistent header icon → full-screen `/search`. **PO? no**.

**CR-40 — Mobile More menu composition (A52/A53)**
- A: More promotes Working Hours/Payment Methods/Communications/Integrations to top level; role chips; System Status row · B: Sitemap 4.3 exact five entries "Billing/Settings/Help and support/Account/Sign out"; §14 guardrail.
- Route: More. Rule: Sitemap beats asset. Resolution: five canonical entries using the asset's row pattern; extra rows live under Settings; System Status row allowed as the sync-state persistent control (N15). **PO? no**.

**CR-41 — Completion outcome vocabulary (A80) (major)**
- A: A80 Step 1 "Session Outcome — How did the session go?" chips Excellent/Average/Needs Attention; no No Show/Cancelled/Rescheduled branches · B: Journey 5.5/13.1 outcomes "Completed / No Show / Cancelled / Rescheduled" with per-branch consequence previews; 13.2 six-part structure.
- Route: SessionCompletionSheet (B9). Rule: Journey beats asset for behavior and copy. Resolution: outcome selector = four canonical outcomes; branch flows per journey; A80's 3-step drawer/sheet composition retained for the Completed path; quality chips only as an optional progress field if PO adds it. **PO? yes** (quality-rating field only).

**CR-42 — Expired package auto-converts to Pay-Per-Session (A80) (major)**
- A: A80 billing-logic strip "Expired Package: Treated as No Active Package. Pay-Per-Session applies." · B: Journey 13.7 exhausted/exhausted-expired completion requires the explicit resolver ("Never create a negative package balance, invent a billing mode, or silently mark a session complimentary"); 5.7 unset/fail-closed rule; 15.8 silent billing-mode conversion is a hard boundary.
- Route: completion billing branch (B9). Rule: Journey beats asset; accounting boundary non-overridable. Resolution: expired/exhausted package → preserve progress + fail closed into package-review path (full resolver per CR-08); no silent PPS conversion. **PO? no**.

## Register summary

- Total entries: 41 active (CR-01–CR-42, CR-13 merged into CR-04).
- Material/behavioral: CR-06, CR-10, CR-28, CR-30, CR-31, CR-32, CR-41, CR-42.
- Headline product-owner decisions before their batches: **CR-28** (onboarding wizard scope → B3), **CR-33** (shell skin → B5), **CR-36** (marketing copy pack → B2), plus per-batch choices CR-17 (B2), CR-22 (B11), CR-23/CR-09 (B8), CR-37 (B2), CR-08/CR-41 (B9), CR-10/CR-11 (B10), CR-12 (B6/B11), CR-14 (any AI), CR-24/CR-29/CR-35 (scope additions).
- Zero conflicts resolved creatively: every resolution above applies only the fixed authority default; entries marked "PO? yes" stop at the mechanical default until decided.
