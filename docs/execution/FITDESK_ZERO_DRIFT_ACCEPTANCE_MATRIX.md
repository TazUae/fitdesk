# FitDesk Zero-Drift Acceptance Matrix

```text
Phase: 0 output — acceptance definition for the zero-drift implementation program
Generated: 2026-07-20
Acceptance is evaluated per batch at its gate and program-wide at Batch 15.
A batch is DONE only when every applicable level below passes and the PO checklist is signed.
Evidence lives with the batch PR: test output, browser-script log, screenshot pack.
```

## Level 1 — Verbatim compliance

| # | Check | Method | Source |
|---|---|---|---|
| 1.1 | Desktop nav labels exactly `Dashboard, Schedule, Clients, Inbox, Billing, Settings` in order | automated label+order assert (B5) | Sitemap §1 |
| 1.2 | Mobile nav labels exactly `Home, Schedule, Clients, Inbox, More` in order | automated assert (B5) | Sitemap §1 |
| 1.3 | Mobile More exactly `Billing, Settings, Help and support, Account, Sign out` | automated assert (B5) | Sitemap 4.3 |
| 1.4 | Primary action labeled **Start Workspace** | assert (B3) | JR-10-02 |
| 1.5 | Activation copy verbatim (three states incl. "Add your first client / Set up their billing and book the first session.") | copy asserts (B6) | JR-9-02 |
| 1.6 | Outcome labels `Completed / No Show / Cancelled / Rescheduled`; `Paid Now / Pay Later` | asserts (B9) | JR-5.5-01 |
| 1.7 | Completion field blocks: `Package name / Balance before / Units consumed / Balance after`; `Session rate / Invoice amount / Paid Now / Pay Later` | asserts (B9) | JR-13.2-01 |
| 1.8 | Statement labels `Balance due / Overdue / Invoiced / Paid / Credits`; header `Statement of account … As of <date and time>`; actions `Period / Download / Share / Close` | asserts (B11) | JR-12.8/12.9 |
| 1.9 | Statement six data-state copies verbatim (loading / confirmed-empty / unavailable / partial / stale / uncertain) | asserts (B11) | JR-12.13-01 |
| 1.10 | Honest-state copy set verbatim (15-state model incl. "Checking today's activity…", "Status unconfirmed. Do not retry yet.") | state-library asserts (B14, adopted everywhere) | JR-24-01 |
| 1.11 | Buffer-override, working-hours, location-confidence blocks verbatim incl. bracketed action labels | asserts (B7) | JR-14.1/14.2/14.3 |
| 1.12 | Exception reason codes verbatim (`Same location — no travel` … `Other`) | asserts (B14) | JR-15.4-01 |
| 1.13 | Smart-view names verbatim (nine views); message-pack names verbatim (seven packs); search groups verbatim | asserts (B8/B10/B13) | JR-18.10/17.14/18.13 |
| 1.14 | Hub section labels per Sitemap §6; Client Hub priority mapping labels per JR-17.4-01 | asserts (B8) | Sitemap/Journey |
| 1.15 | Forbidden copy absent: "Reliable client/Unreliable client/Bad attendance"; "all clear" on failed loads; numeric Pulse scores; "Auto-pay"; unverified compliance/metric claims | negative asserts (B6/B8/B2) | JR-17.9/5.1, CR-20/21/36 |
| 1.16 | No substituted wording anywhere a source specifies copy — the JR matrix "Required copy" fields are the checklist | per-batch copy sweep + B15 program sweep | JR matrix |

## Level 2 — Journey compliance

| # | Check | Method | Source |
|---|---|---|---|
| 2.1 | Journey Map acceptance criteria 1–130 each verified (131–190 verified as exclusions) | B15 checklist walk with per-criterion evidence link | JR-32-01 |
| 2.2 | All steps/branches reachable: activation loop; daily spine; unresolved loop-back; four outcome branches; billing-mode branches; payment Paid Now/Pay Later; statement round-trip; exception paths | twelve critical E2E journeys + completion matrix | Test Strategy §11/§9 |
| 2.3 | All documented states represented (dashboard 7-state; provisioning 4+queue; statement 6; shared S1–S16; booking conflict states) | forced-state browser scripts per batch | JR-5.1/10-01/12.13/24-01 |
| 2.4 | Confirmation and recovery loops present for every consequential mutation (preview → confirm → authoritative result → exact recovery) | per-flow scripts + partial-failure simulations | JR-3.2/13.2/25-01 |
| 2.5 | Future/pilot/hardening features ABSENT unless PO-enabled (Pulse, Prepared Actions, inbound Inbox, AI features, portal, disruption manager, correction resolver, etc.) | negative sweeps per batch | JR-26.1-01, scope tables |
| 2.6 | Highest-priority next action follows the state-derived order everywhere the success grammar renders | derivation tests (B14) | JR-27.5-01 |

## Level 3 — Sitemap compliance

| # | Check | Method | Source |
|---|---|---|---|
| 3.1 | Canonical routes live: `/`, auth set, `/onboarding`, `/dashboard`, `/schedule`, `/sessions/{id}`, `/clients`, `/clients/{id}`, `/inbox`, `/billing(+/invoices/{id})`, `/search`, `/settings/*` | route tests (per batch) | Route matrix R-rows |
| 3.2 | Aliases AL1–AL19 redirect safely; old deep links resolve (incl. `/messages`→`/inbox`, `/invoices`→`/billing`) | alias tests (B15 sweep) | Route matrix §17, D10 §16 |
| 3.3 | Exact desktop/mobile navigation (Level 1 checks) + Search persistent, never in More; FAB = four canonical entries; no prohibited primary-nav routes (§14 list) | asserts + manual sweep (B5/B15) | Sitemap §1/4/14 |
| 3.4 | Contextual workflows in prescribed surfaces (W1–W25 MVP set); URL-backed states restore on refresh/Back/Forward; reload never re-executes | URL restore tests per overlay | Sitemap §12 rules |
| 3.5 | Mobile surface rules per Sitemap 8.3 table (sheet vs drawer forms per surface) | viewport checks per batch | Sitemap 8.3 |
| 3.6 | Hub sections are contextual (no new primary destinations); internal/portal surfaces absent | route inventory diff (B15) | Sitemap §3/§14/§16 |

## Level 4 — Asset compliance

| # | Check | Method | Source |
|---|---|---|---|
| 4.1 | One implementation screenshot per relevant asset (A03–A81 app surfaces), captured at the row's viewport | B15 evidence pack; per-batch capture | Asset matrix rows |
| 4.2 | Desktop and mobile side-by-side comparison per surface (asset left, implementation right) | evidence pack layout | contract |
| 4.3 | Documented differences limited to source-authority conflicts — every visible delta annotates its CR number or JR copy authority | per-screenshot annotation review | Conflict register |
| 4.4 | Brand tokens match A01/A02/A73 (palette, type scale, radius, elevation, badge/button states) | token snapshot tests (B1) + visual review | A01/A02 |
| 4.5 | No asset silently omitted: 81/81 rows carry batch + approval status; "inspiration only" count = 0 | asset-matrix audit (B15) | Asset matrix summary |
| 4.6 | PO visual approval recorded per batch (checklists signed), incl. variant choices CR-22/23/33/37/38 | PR checklist | register |

## Level 5 — Domain safety

| # | Check | Method | Source |
|---|---|---|---|
| 5.1 | Protected files unchanged (global denylist) — diff audit per batch PR | `git diff --stat` gate | sequence denylist |
| 5.2 | Scheduling behavior preserved: engine conflict/DST/recurrence/idempotency suites green untouched | existing suites | JR-6.2-01 |
| 5.3 | Billing/payment: one payment contract from all entry points; PPS invoice only on confirmed completion; package consumption exactly-once; no negative balance; no silent billing-mode change (CR-42) | integration suites + completion matrix | JR-6.6/13.x |
| 5.4 | ERP boundary: no direct ERP I/O outside approved path; no ERP credentials anywhere in FitDesk/client bundle | static scan + security tests | JR-3.3-01 |
| 5.5 | Provisioning: idempotent start; no duplicate jobs; authoritative progress only | existing CP contract tests + B4 asserts | JR-10-02 |
| 5.6 | Auth: Better Auth contracts intact; session checks on all new routes; auth states honest | auth integration tests (B2) + route guards sweep | CAP-001 |
| 5.7 | Tenant isolation: cross-tenant denial for every new route/action/search/filter (extends US-025 suite); fail-closed on missing context | mandatory denial tests per batch | CLAUDE.md |
| 5.8 | Outbound messaging: trainer-confirmed only; consent gate fail-closed (post-CR-11); no auto-send anywhere (CR-30) | send-gate tests + negative sweeps | JR-19.1-01 |
| 5.9 | Session-completion consequences unchanged (immutable-status, version, duplicate-effect guards) | existing suites + duplicate-submit tests | JR-6.3-01 |

## Level 6 — Accessibility

| # | Check | Method | Source |
|---|---|---|---|
| 6.1 | Keyboard: all critical journeys operable keyboard-only (booking, completion, payment, message, search) | keyboard E2E scripts (B15) | Test Strategy §13 |
| 6.2 | Focus management: trap in sheets/drawers, return on close (statement → Statement button; nested sheets) | component tests + manual | JR-12.16-01 |
| 6.3 | Screen reader: landmarks/labels; loading/refresh/partial/error/success announced; review summaries linear | SR walkthrough per batch | JR-12.16/13.2 |
| 6.4 | Reduced motion respected (transitions/confetti degrade) | prefers-reduced-motion checks | contract |
| 6.5 | 200% zoom: no loss of content/function; wide content scrolls in-container | zoom sweep (B15) | contract |
| 6.6 | Touch targets: one-handed mobile targets on all critical controls; visible non-gesture alternatives for every swipe/drag | mobile sweep | JR-3.5-01 |
| 6.7 | Mobile safe areas respected (bottom nav, sheets, FAB clearances) | device-frame checks | contract |
| 6.8 | Non-color status cues everywhere (badges carry text/icon); contrast per A02 tokens validated | axe run + token audit | JR-12.16-01 |

## Program-level gate (Batch 15 sign-off)

GO requires: Levels 1–6 pass · JR-32 criteria 1–130 checked · zero unmapped items remain · every open "PO? yes" register entry either decided or explicitly deferred by the PO with its mechanical default shipped · protected-file diff audit clean across all batches · evidence pack delivered.
