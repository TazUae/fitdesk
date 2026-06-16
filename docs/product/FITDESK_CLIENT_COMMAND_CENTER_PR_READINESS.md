# FitDesk Client Command Center — PR Readiness

## Status

| Field | Value |
|---|---|
| Branch | `feat/client-command-center` |
| Verdict | **PASS WITH CAUTIONS** |
| Tests | 406/406 |
| ESLint | Clean |
| build:verify | Clean |
| Push/merge | **Not yet — requires user approval** |
| Dokploy | **No deployment planned at this stage** |
| Feature flags | **All OFF** |

---

## Scope summary

This branch delivers five related areas:

1. **Dashboard Command Center** — responsive shell, Action Center, Business Health, overdue attention items
2. **Client Area redesign** — roster cards, client detail polish, email/status read improvements
3. **Client Management foundation reconciliation** — existing local `client_index` confirmed, directory and hub validation complete
4. **Backfill / data quality** — goal label normalization from ERP data
5. **New Add Client flow (Phases C–F)** — flagged slide-up sheet with duplicate detection, AI quick-add, billing guardrails, navigational success-state handoff

---

## Commit list

### Dashboard Command Center
| Hash | Message |
|---|---|
| `0062d38` | `feat(dashboard): add command center responsive shell` |
| `ae0b344` | `polish(dashboard): refine command center empty states` |
| `b8b67ac` | `polish(dashboard): reduce empty-day redundancy` |
| `c6a1f5e` | `polish(dashboard): tighten command center density` |
| `733904d` | `feat(dashboard): itemize overdue invoice attention` |
| `8afa6e1` | `docs(dashboard): add command center freeze handover` |

### Client Area redesign
| Hash | Message |
|---|---|
| `4931312` | `feat(clients): add command center roster` |
| `36f7120` | `polish(clients): refine client detail layout` |
| `953a44d` | `docs(clients): add ui freeze handover` |
| `b50d7a8` | `docs(clients): reconcile management foundation status` |

### Backfill / data quality
| Hash | Message |
|---|---|
| `4013363` | `fix(backfill): normalize goal labels from ERP data` |

### New Add Client flow
| Hash | Message |
|---|---|
| `7f16394` | `feat(clients): add flagged add client sheet shell` |
| `a3bfc90` | `feat(clients): wire add client sheet actions` |
| `af77697` | `feat(clients): add billing guardrails to add client sheet` |

---

## What is included

### Dashboard Command Center
- Responsive shell with mobile-first layout and desktop sidebar
- Action Center: overdue invoice attention items, client action intent queue, quick action FAB
- Business Health panel: outstanding balance, overdue count, client roster size
- AI Copilot rail placeholder (non-functional stub)
- Empty-day and empty-state handling

### Client Area redesign
- Client roster cards with billing mode, safety state, and outstanding signal derivation
- Client detail layout polish (invoice quick action removed, Hub conditionally rendered)
- Email and status read improvements from ERP Customer fields
- Loading skeleton for client list

### Client Management foundation
- Local `client_index`, `client_goal`, `client_action_intent`, `client_event` tables confirmed to exist and reconciled
- `deriveClientRoster()` view-model derivation from ERP + local data in parallel
- Local directory validation: tenant-scoped listing, phone search, duplicate detection
- Client Hub overview: goals, pending actions, recent notes — flag-gated, returns null when off
- `list-derive.test.ts` (225 lines), `repository.test.ts` (+21 cases), `create-draft.test.ts` (+33 cases)

### Backfill / data quality
- `backfill-clients.mjs` script: normalizes goal labels from raw ERP `custom_fitness_goals` strings
- `lib/clients/backfill.ts`: guard against malformed goal data in upsert path
- `lib/erpnext/client.ts`: minor normalization improvement

### New Add Client flow (Phases C–F)
- **Phase C** — Slide-up sheet (`AddClientSheet`) with mobile/desktop responsive positioning, goal multi-select, age input, trainer notes, AI quick-add from free text, escape/backdrop/body-scroll-lock
- **Phase D** — Full server action wiring: `addClient`, `findClientDuplicates`, `parseClientDetails`; inline duplicate warning panel with override reason; AI parse feedback banners
- **Phase E/F** — Billing guardrails: segmented control (Decide later / Package / Per session), conditional PPS default rate input, Package helper text; billing threaded from UI → `actions/clients.ts` → `create-draft.ts` → `repository.ts` → ERP payload; navigational success-state handoff (Book session, WhatsApp, Set up billing — no auto-sends, no auto-mutations)
- Feature-flag gated via `FITDESK_ADD_CLIENT_SHEET_ENABLED`; fallback to `/dashboard/clients/new` when OFF

---

## What is NOT included

The following are explicitly out of scope for this branch and must NOT be assumed ready:

- **No Dokploy deployment** — local Docker remains the only validated target
- **No production rollout** — all flags are OFF by default; tenant allowlists required
- **No global feature flag enablement** — each flag requires explicit per-tenant rollout decision
- **No package invoice automation** — billing mode stored; no invoice is created when Package is selected
- **No pay-per-session invoice-on-completion** — PPS rate stored; no invoice is created on session completion
- **No WhatsApp auto-send** — success-state links are navigational only; no Evolution API calls triggered
- **No session or program creation** — PT Session DocType absent in this workspace; session panel shows empty
- **No Client Pulse rail** — AiCopilotRail renders as a stub only
- **No real AI suggestions** — AI Copilot placeholder; no LLM inference on dashboard
- **No retention health strip** — planned for a later phase
- **No light/dark theme engine** — CSS variables used throughout; no theme toggle wired

---

## Validation summary

| Validation | Result |
|---|---|
| Unit/integration tests | 406/406 pass (21 test files) |
| ESLint | No warnings or errors |
| `build:verify` (Next.js production build + type check) | Clean — 21 routes |
| Local stack health (`npm run local:check`) | All 10 services healthy |
| Add Client Phase D E2E (authenticated curl) | PASS |
| Add Client Phase E/F E2E (3 billing modes) | PASS |
| — Decide later: `billing_mode = unset` | ✓ |
| — Package: ERP `custom_billing_mode = Package`, local `billing_mode = package` | ✓ |
| — PPS: ERP `custom_billing_mode = Pay Per Session`, `custom_default_session_rate = 25`, local `billing_mode = pay_per_session` | ✓ |
| No Sales Invoice created | ✓ |
| No Payment Entry created | ✓ |
| No WhatsApp/Evolution send | ✓ |
| No session created | ✓ |
| No program created | ✓ |
| Duplicate detection smoke (exact phone match) | ✓ |
| Flags rolled back OFF at end | ✓ |
| Final working tree | Clean (only `.claude/launch.json` untracked) |

---

## Known cautions

These are non-blocking for PR review but must be understood before production rollout:

1. **ERP `custom_billing_mode` defaults to `"Package"` when omitted** — Frappe Select fields auto-default to their first option when the field is absent from a POST payload. When the trainer selects "Decide later", FitDesk omits `custom_billing_mode` from the ERP create request; ERP records the Customer with `custom_billing_mode = "Package"`. The FitDesk local `client_index.billing_mode = 'unset'` is the authoritative UI source — `ClientHubPanel` correctly renders "Not set" for these clients. This is a known ERP/local read-model gap; acceptable for MVP. If ERP field parity is required, a `custom_billing_mode = ""` explicit send could be evaluated — but the ERP DocType may not accept empty string for a required Select field.

2. **AI parse requires `ANTHROPIC_API_KEY`** — `parseClientDetails` fails gracefully when the key is absent: returns `state: 'failed'`, shows a toast error, and leaves the form fully usable. No uncaught exception. Key must be set in the production environment before the Quick Add feature is useful.

3. **Test clients remain as local artifacts** — `Sheet Billing Unset Test`, `Sheet Billing Package Test`, `Sheet Billing PPS Test` were created in the local ERP site (`yasser-m-zaidan-p5rm`) and local SQLite DB during E2E validation. These are disposable; no invoices, payments, sessions, or WhatsApp messages are attached.

4. **Backfill script standalone dependency issue** — an earlier session observed that `backfill-clients.mjs` had a dependency resolution issue when run against the production Docker image standalone (outside the Next.js module context). This was not re-validated in the freeze audit. The script is a maintenance utility, not a runtime path, but should be verified before production use.

5. **Client Hub and local directory remain flag-gated** — `FITDESK_CLIENT_HUB_ENABLED` and `FITDESK_CLIENT_DIRECTORY_LOCAL_READ` are OFF by default. Hub returns `null` from `getClientHubOverview()` when the flag is absent, so the `ClientHubPanel` is never rendered. Both flags require explicit per-tenant enablement and tenant allowlist configuration before use.

---

## Feature flags

All flags are **OFF by default**. Setting any flag to `"1"` without a tenant allowlist applies to all tenants served by that container.

| Flag | Purpose | Default |
|---|---|---|
| `FITDESK_ADD_CLIENT_SHEET_ENABLED` | Replaces Add button navigation with slide-up sheet on `/dashboard/clients` | OFF |
| `FITDESK_CLIENT_DIRECTORY_LOCAL_READ` | Enables local `client_index` read for the client directory instead of live ERP fetch | OFF |
| `FITDESK_CLIENT_DIRECTORY_LOCAL_TENANTS` | Comma-separated tenant ID allowlist for local directory reads | `""` (all denied) |
| `FITDESK_CLIENT_HUB_ENABLED` | Enables Client Hub overview panel on client detail page | OFF |
| `FITDESK_CLIENT_HUB_TENANTS` | Comma-separated tenant ID allowlist for Client Hub | `""` (all denied) |

**Rollout guidance:**
- No global enablement recommended — use tenant allowlists
- Enable `FITDESK_ADD_CLIENT_SHEET_ENABLED` first as it has the lowest risk (fully flag-gated, falls back to `/new` page)
- Enable Hub and local directory only after backfill is confirmed complete for the target tenant
- Validate `ANTHROPIC_API_KEY` is set before enabling AI quick-add in production

---

## Safety boundaries preserved

The following architectural boundaries were respected throughout this branch:

- **ERP proxy preserved** — all ERP calls go through the approved `erpFetch` / `createClient` adapter path via Control Plane; no direct ERPNext API calls from client components
- **No ERP credentials in FitDesk** — ERP auth is fully contained in the Control Plane / ERP Execution Service layer
- **No direct ERP DB access** — no raw MariaDB queries from FitDesk
- **No payment provider changes** — Whish / Cash / Bank Transfer provider abstraction untouched
- **No WhatsApp API changes** — Evolution API integration untouched; no `sendMessage` calls added
- **No schema migrations in Add Client phases** — billing mode column was pre-existing in `client_index` DDL; no new DDL required
- **No production or Dokploy** — all validation was local Docker only
- **No manual invoice link in Add Client success state** — success state links to `/dashboard/schedule/new?client=…`, `/dashboard/messages/…`, and `/dashboard/clients/…` (Hub); `/dashboard/invoices/new` is absent

---

## PR reviewer checklist

Before approving the PR, reviewers should inspect:

- [ ] **Feature flag defaults** — confirm all flags default OFF; confirm no flag enables globally without a tenant allowlist
- [ ] **AddClientSheet no-side-effect behavior** — review `actions/clients.ts`; confirm no invoice, payment, session, or WhatsApp action is triggered during client creation
- [ ] **Billing mode mapping** — confirm `BillingMode → custom_billing_mode` string mapping in `actions/clients.ts` (`'package' → 'Package'`, `'pay_per_session' → 'Pay Per Session'`, `'unset' → omitted`)
- [ ] **Duplicate override flow** — confirm override requires non-empty reason server-side; confirm `possibleDuplicateClientId` is a local UUID, not an ERP ID
- [ ] **Success-state links** — confirm no `invoices/new` href in `AddClientSheet.tsx`; confirm all three links are `<Link>` (navigation only)
- [ ] **Tests** — review `lib/clients/__tests__/` for billing mode passthrough, repository persistence, and duplicate override coverage
- [ ] **Docs consistency** — confirm handover docs in `docs/product/` are consistent with committed implementation

---

## Recommended PR strategy

1. **Get user approval before pushing** — do not push this branch without explicit user sign-off
2. **Open PR against `main`** with this document as the PR description source
3. **PR review before merge** — at least one reviewer pass through the checklist above
4. **No Dokploy deployment until broader production readiness** — confirm backfill script is validated, `ANTHROPIC_API_KEY` is configured, and tenant allowlists are ready
5. **Local Docker validation remains the testing target** — use `npm run local:up` + `npm run local:check` for any pre-merge smoke testing
6. **Feature flag rollout order** (post-merge, when ready):
   1. `FITDESK_ADD_CLIENT_SHEET_ENABLED=1` — lowest risk, broadest value, clean fallback
   2. `FITDESK_CLIENT_DIRECTORY_LOCAL_READ=1` + tenant allowlist — after backfill confirmed
   3. `FITDESK_CLIENT_HUB_ENABLED=1` + tenant allowlist — after directory is stable
