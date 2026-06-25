# FitDesk 2026 — Auth & Onboarding Phase 1 Implementation Specification

> **Status:** Draft for approval — PLANNING ONLY (no code changed)
> **Date:** 2026-06-25
> **Scope:** Decouple Better Auth user-identity creation from workspace provisioning; move provisioning initiation to an explicit `/onboarding` action.
> **Author:** Claude Code (Opus 4.8) — read-only audit
> **Mode:** Specification document. No production code, schema, UI, route, action, migration, or config was modified. No migrations were run. No Control Plane / ERP / Frappe calls were made.

> **How to read this document:** Sections 1–12 describe *current truth* and *target behavior*. Sections 13–21 describe the *implementation blueprint, boundaries, and gates* for a later, separately-approved coding phase. Nothing in this document is an instruction to execute now. Every "implement" verb below is conditional on Phase 1 approval.

> **QA Correction — 2026-06-25:** Manual QA after Phase 1 implementation revealed the real running Control Plane contract requires `slug`, `country`, `companyName`, and `companyAbbr` — not `{ workspaceName, ownerEmail }` as originally stated in `types/controlplane.ts`. This document originally described locale as **display-only and not transmitted**. That was incorrect — **country is required by the existing Control Plane contract and is transmitted** as a detected setup default. Timezone and currency remain display-only and are not transmitted or persisted. `types/controlplane.ts` `CreateTenantInput` has been corrected to reflect the real runtime contract. See D1 in §1.1 for the updated discrepancy note.

---

## 1. Executive Summary

FitDesk currently couples **workspace provisioning** (a Control Plane tenant-creation job) directly to **Better Auth user creation** via the `databaseHooks.user.create.after` hook in [lib/auth.ts:81](lib/auth.ts). The instant a user record is created — by email/password sign-up *or* Google OAuth — the hook fires `createTenant()` against the Control Plane and writes a `WorkspaceProvisioning` row. The trainer never explicitly chooses to start a workspace, never names it, and never supplies locale data. The workspace name is silently derived from `user.name` or the email local-part.

The approved 2026 target decouples these two concerns:

1. **`/auth/register`** creates *only* the Better Auth identity and routes to `/onboarding`. No provisioning starts.
2. **`/onboarding`** shows a workspace setup form *when no provisioning row exists*. The form **requires only one input — Workspace name** — with a live slug preview and a single **Start Workspace** CTA. Country / Timezone / Currency are shown beneath the name as **Detected workspace defaults — Display-only in Phase 1 (Not persisted / Not transmitted)**.
3. **Start Workspace** explicitly initiates provisioning through the *existing* Control Plane client path, idempotently inserting-or-resuming a `WorkspaceProvisioning` row. It transmits **only `workspaceName` and `ownerEmail`** — the values the existing contract supports.
4. **Provisioning status** survives refresh/re-entry: shows status while active, retry on failure, redirect to `/dashboard` on completion.
5. **Dashboard activation** points the trainer at the first product-value action — **Add first client** — with no package/payment/WhatsApp/session setup injected into the flow.

This is achievable in Phase 1 **without** a schema migration, **without** new dependencies, and **without** changing the Control Plane contract. A core code-truth audit confirmed the constraint that drives this: the Control Plane's `createTenant()` contract today accepts only `{ workspaceName, ownerEmail }` ([types/controlplane.ts:17](types/controlplane.ts)), and the `WorkspaceProvisioning` table has **no** country/timezone/currency columns ([lib/db/schema.ts:109](lib/db/schema.ts)). Country / Timezone / Currency therefore have **nowhere to be sent or persisted** in Phase 1. To avoid collecting data that is silently discarded, Phase 1 **does not collect them as required inputs** — they appear only as **Detected workspace defaults — Display-only in Phase 1 (Not persisted / Not transmitted)**. True persistence is deferred to Production-Hardening, gated behind one of: a workspace-metadata **schema migration**, a **Control Plane `createTenant` contract update**, or a **dedicated tenant settings model** (each separately approved).

**Recommendation:** Phase 1 is well-scoped and safe to implement after approval, provided the display-only locale decision in §5 and §8 is accepted and the re-entry redirect gap in §6 is fixed. Phase 1 boundaries are clean. See §21 for the Go / No-Go.

### 1.1 Critical discrepancies discovered during audit

| # | Discrepancy | Where | Impact | Handling |
|---|-------------|-------|--------|----------|
| D1 | ~~`createTenant()` accepts only `{ workspaceName, ownerEmail }`~~ → **QA Correction:** real running CP contract requires `{ slug, country, companyName, companyAbbr }` | [types/controlplane.ts](types/controlplane.ts) (corrected 2026-06-25) | Country must be transmitted; slug and companyAbbr must be derived | **Corrected in Phase 1:** `CreateTenantInput` updated. Country is transmitted as a detected default. Timezone and currency remain display-only. No locale is persisted in local schema. |
| D2 | `WorkspaceProvisioning` has no country/timezone/currency columns | [lib/db/schema.ts:109](lib/db/schema.ts) | Cannot persist locale without migration | Out of Phase 1 scope (no migration). Timezone and currency display-only. Country is transmitted but not persisted. §5, §20. |
| D3 | `/onboarding` does **not** server-redirect a *completed* user to `/dashboard`; `ProvisioningStatus` only redirects on a live poll transition, and its poll early-returns when `status === "completed"` | [app/onboarding/page.tsx:9](app/onboarding/page.tsx), [components/onboarding/provisioning-status.tsx:54](components/onboarding/provisioning-status.tsx) | A completed user re-entering `/onboarding` is stuck on a spinner | Fixed by Phase 1E server-side redirect. §6, §12. |
| D4 | `ProvisioningStatus` renders "No provisioning job found yet. Please contact support" when `initialRecord` is `null` | [components/onboarding/provisioning-status.tsx:130](components/onboarding/provisioning-status.tsx) | Decoupled new users (no row) hit a dead-end instead of a setup form | Replaced by the setup form path. §6, §10. |
| D5 | `slugifyWorkspaceName` lives privately in `lib/auth.ts`, has no length cap, and is duplicated nowhere reusable | [lib/auth.ts:38](lib/auth.ts) | Slug logic must be shared by the Start Workspace action and the live preview | Extract to a shared util; add length cap. §7, §13. |
| D6 | Six reset users reportedly have zero `WorkspaceProvisioning` rows | (operational state, not in code) | They currently dead-end at the "contact support" message (D4) | Setup form (Phase 1C) is the intended recovery path. §6, §17. |
| D7 | Stray `prisma/` directory contains an `auth.db` artifact; **Prisma is not a dependency** | `prisma/auth.db`, [package.json](package.json) | None functional; violates "No Prisma" rule cosmetically | Out of scope. Note only. §19. |

---

## 2. Current State Audit

All findings below are read directly from source. Line references are clickable.

### 2.1 Auth instance — [lib/auth.ts](lib/auth.ts)

- Better Auth configured with the Drizzle adapter over LibSQL (`provider: 'sqlite'`), email/password (`requireEmailVerification: false`), and Google OAuth (only when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set).
- `user.additionalFields` pulls in `phone` from [lib/auth-user-fields.ts](lib/auth-user-fields.ts) (`type: 'string'`, optional, default `''`).
- **The coupling lives at [lib/auth.ts:81-122](lib/auth.ts)** — `databaseHooks.user.create.after`:
  - **L86–94:** queries `workspaceProvisioning` for an existing row in `['queued','running']` for this `user.id`; if found, returns early (the current idempotency guard).
  - **L96–97:** `resolveWorkspaceName(user.name, user.email)` then `slugifyWorkspaceName(workspaceName)`.
  - **L98–101:** `createTenant({ workspaceName, ownerEmail: user.email })` → Control Plane POST `/tenants`.
  - **L104–115:** `db.insert(workspaceProvisioning)` with `id: crypto.randomUUID()`, `userId`, `slug`, `tenantId`, `jobId`, `status` (from Control Plane), timestamps, `failureReason: null`, `lastSyncedAt`.
  - **L116–118:** `catch` logs `[control-plane-provision] failed ...` and **swallows** the error — user creation never fails even if provisioning fails. This is the behavior that must be preserved (user creation must stay isolated).
- Helper functions **[lib/auth.ts:38-46](lib/auth.ts)** `slugifyWorkspaceName` and **[lib/auth.ts:48-53](lib/auth.ts)** `resolveWorkspaceName` are *only* referenced inside the hook.
- `plugins: [nextCookies()]` — required for Set-Cookie in Server Actions / Route Handlers. **Must not change.**

`slugifyWorkspaceName` current rules: `.toLowerCase().trim()`, `.replace(/[^a-z0-9]+/g, '-')` (collapses non-alphanumeric *groups* to a single hyphen), `.replace(/^-+|-+$/g, '')` (strip leading/trailing), fallback `'workspace'`. **No explicit repeated-hyphen collapse step is needed** (the `+` in the character class already collapses runs), and **there is no length cap** today.

### 2.2 Browser auth client — [lib/auth-client.ts](lib/auth-client.ts)

- `createAuthClient` with `inferAdditionalFields({ user: userAdditionalFields })`.
- Re-exports `useSession, signIn, signOut, signUp`. No hardcoded `baseURL` (uses `window.location.origin`).

### 2.3 Database & schema — [lib/db.ts](lib/db.ts), [lib/db/schema.ts](lib/db/schema.ts)

- Single LibSQL client; `DATABASE_URL` defaults to `file:./auth.db`.
- Better Auth tables: `user` (incl. `phone`), `session`, `account`, `verification`.
- **`WorkspaceProvisioning`** ([lib/db/schema.ts:109-120](lib/db/schema.ts)): `id` (PK), `userId` (NOT NULL, **no FK**), `slug` (TEXT **NOT NULL, not unique**), `tenantId` (nullable), `jobId` (NOT NULL), `status` (TEXT, **free-form**), `failureReason`, `lastSyncedAt`, `createdAt`, `updatedAt` (timestamps are ISO-8601 **TEXT**).
- Migration source [scripts/migrate-app.mjs:26-39](scripts/migrate-app.mjs) creates the table with `CREATE TABLE IF NOT EXISTS` and only two non-unique indexes: `WorkspaceProvisioning_userId_idx` and `WorkspaceProvisioning_jobId_idx`. **No unique index on `slug`.**
- Other FitDesk tables (`trainer_mapping`, `trainer_whatsapp_connection`, `message_log`, and Client Management v1.2.1 tables) are **out of scope** for this work.

### 2.4 Control Plane client & types — [lib/controlplane/client.ts](lib/controlplane/client.ts), [types/controlplane.ts](types/controlplane.ts)

- `server-only`. Requires `CONTROL_PLANE_URL` + `CONTROL_PLANE_API_KEY`. `cpFetch` adds `Authorization: Bearer`, `cache: "no-store"`, JSON headers, throws on non-2xx with status + body.
- `createTenant(input: CreateTenantInput)` → POST `/tenants`. **`CreateTenantInput = { workspaceName: string; ownerEmail: string }`** ([types/controlplane.ts:17](types/controlplane.ts)) — **no locale fields**.
- `getJob(jobId)` → GET `/jobs/:id`. `retryJob(jobId)` → POST `/jobs/:id/retry-enqueue` with `{}` body.
- Also present (out of scope): `getTenant`, `listTenants`, `listPendingPaymentNotifications`.
- **`ProvisioningJobStatus = "queued" | "running" | "completed" | "failed"`** ([types/controlplane.ts:1](types/controlplane.ts)). There is **no `"in_progress"`** value in the contract — active = `queued | running`.
- `ProvisioningStep` (the progress *step* axis, distinct from *status*): `queued | site_created | erp_installed | scheduler_enabled | domain_registered | api_keys_generated | warmup_completed | completed`.
- `JobStatusResponse = { jobId, tenantId, status, currentStep, failureReason? }`.

### 2.5 Register page — [app/auth/register/page.tsx](app/auth/register/page.tsx)

- Client component. Redirects to `/dashboard` if already authenticated.
- Form fields **today**: Full name, Email, **Phone number**, Password, **Confirm password**. Client-side checks: passwords match, length ≥ 8.
- Submits `signUp.email({ name, email, password, phone: phone || undefined })`.
- Google: `signIn.social({ provider: 'google', callbackURL: '/onboarding' })`.
- On success: toast + `router.replace('/onboarding')`.
- Passwords use plain `type="password"` — **no visibility toggle**.

### 2.6 Login — [app/auth/login/page.tsx](app/auth/login/page.tsx) + [app/auth/login/login-content.tsx](app/auth/login/login-content.tsx)

- **Note:** the form component is `login-content.tsx`, **not** `login-form.tsx` (the latter does not exist).
- `page.tsx` is a Suspense wrapper around `LoginContent`.
- `LoginContent` reads `callbackUrl` (sanitized to start with `/`, else `/dashboard`), `signIn.email`, `signIn.social`. **Login is explicitly out of scope and must not change.**

### 2.7 Onboarding page — [app/onboarding/page.tsx](app/onboarding/page.tsx)

- Server component. `getSession`; if no user → `redirect('/auth/login?callbackUrl=/onboarding')`.
- Loads `latestProvisioning` (latest by `createdAt desc` for the user).
- **Always** renders the heading "Setting up your workspace" + `<ProvisioningStatus initialRecord={...} />`. **There is no workspace setup form, and no redirect for completed users.** This is the core gap Phase 1C/1E close.

### 2.8 Provisioning status component — [components/onboarding/provisioning-status.tsx](components/onboarding/provisioning-status.tsx)

- Client component. Polls `GET /api/controlplane/jobs/:jobId` with linear backoff 2s → max 8s; 120s "Still working…" slow-notice.
- On `status === "completed"` → `router.replace("/dashboard")`. On `status === "failed"` → renders Retry button → `POST /api/workspace/retry` → resets and re-polls (`pollingRunId`).
- `STEP_MESSAGE` maps internal *step* names to copy ("Creating ERP workspace", "Installing modules", "Configuring background services", etc.). These leak internal vocabulary and are refined in Phase 1F.
- When `initialRecord` is `null`: renders **"No provisioning job found yet. Please contact support if this persists."** — the dead-end (D4).

### 2.9 Route handlers

- **[app/api/workspace/retry/route.ts](app/api/workspace/retry/route.ts)** — `POST`: session-gated; finds latest `status === "failed"` row; `retryJob(jobId)`; updates row to `status: "queued"`, `failureReason: null`. Returns `{ success, jobId, status: "queued" }`.
- **[app/api/controlplane/jobs/[jobId]/route.ts](app/api/controlplane/jobs/[jobId]/route.ts)** — `GET`: session-gated; verifies the row belongs to the user; `getJob`; syncs local `status`/`failureReason`/`lastSyncedAt`. `POST`: same ownership check + `retryJob` + sync.
- **[app/api/provisioning/status/route.ts](app/api/provisioning/status/route.ts)** — `GET`: returns `{ status: latest?.status ?? null }`. Consumed by middleware.

### 2.10 Tenant context — [lib/tenant/context.ts](lib/tenant/context.ts)

- `getTenantContext()` returns the latest provisioning row's `{ userId, slug, tenantId, provisioningStatus, lastSyncedAt }` from local DB only (no ERP). Read-only consumer; unaffected structurally, but benefits from the same status vocabulary (§6).

### 2.11 Middleware — [middleware.ts](middleware.ts)

- `matcher: ['/dashboard/:path*']` — gates **only** `/dashboard`. `/auth/*` and `/onboarding` are **not** gated by middleware.
- Fetches session via `/api/auth/get-session`; no session → redirect `/auth/login?callbackUrl=<path>`.
- Fetches `/api/provisioning/status`; if `status !== 'completed'` (including `null`) → redirect `/onboarding`. On fetch error → redirect `/onboarding` (fail-safe).
- **Consequence for the new flow:** a freshly registered user with no row hitting `/dashboard` is correctly bounced to `/onboarding`. No middleware change is required for Phase 1, but its `completed`-gating behavior must stay consistent with §6.

### 2.12 Tests

- **There are no tests** covering auth, onboarding, provisioning, or workspace retry. (Existing `*.test.ts` files cover clients, invoices, sessions, messages, dashboard derive, ERPNext client, goals, scheduling, payments. The "workspace" matches are the *goals* workspace-reducer, unrelated.) `test/stubs/server-only.ts` exists to stub the `server-only` import under Vitest.
- **Implication:** Phase 1 must *add* the first tests for this flow (slug util + status state-machine are the high-value pure-function targets). See §16.

### 2.13 Verification tooling

- `npm test` → `vitest run`. `npm run lint` → `next lint`. `npm run build:verify` → [scripts/build-verify.mjs](scripts/build-verify.mjs) which runs `next build` into `.next-verify` (so it never clobbers a running `next dev`). `build:verify` is the canonical pre-commit build gate.

---

## 3. Target 2026 Product Flow

```text
/auth/register ──(Better Auth identity only)──▶ /onboarding
                                                  │
                          no provisioning row ─────┼──▶ Workspace Setup Form
                                                  │      (Workspace name = only required input + live slug preview;
                                                  │       country / tz / currency = detected defaults, DISPLAY-ONLY)
                                                  │             │ Start Workspace  →  sends ONLY { workspaceName, ownerEmail }
                                                  │             ▼
                          active (queued|running)─┼──▶ Provisioning Status (poll)
                                                  │             │ completed
                          failed ─────────────────┼──▶ Retry state
                                                  │             ▼
                          completed ──────────────┴──▶ /dashboard ──▶ "Add first client"
```

**Hard rules for the flow:**
- Registration triggers **zero** provisioning.
- Provisioning starts **only** on the explicit **Start Workspace** action.
- All states are **refresh-safe** and **re-entry-safe** (idempotent).
- No package / payment / WhatsApp / session / scheduling setup appears anywhere in this flow.

---

## 4. Architectural Justification

**Why decouple.** Binding provisioning to `user.create.after` conflates *authentication* (a synchronous, must-not-fail identity write) with *provisioning* (an asynchronous, fallible, externally-dependent orchestration). The current design hides this: the hook swallows all provisioning errors to protect user creation ([lib/auth.ts:116](lib/auth.ts)). That is the right instinct but the wrong location — it means:

1. **No trainer intent.** The workspace is named from `user.name`/email and provisioned before the trainer has expressed any intent or supplied locale. There is no opportunity to choose a name or correct a bad slug.
2. **OAuth blind-spot.** Google sign-up creates a user → hook fires immediately → a tenant is provisioned for anyone who clicks "Continue with Google," including accidental/abandoned sign-ups.
3. **Opaque failures.** A swallowed provisioning failure leaves the user authenticated but with a failed/absent workspace and only a "contact support" dead-end (D4).
4. **Testability.** Provisioning logic embedded in an auth side-effect cannot be unit-tested without standing up Better Auth's create lifecycle.

**Why this is safe.** Moving initiation to an explicit `/onboarding` server action:
- Keeps Better Auth's user/session/account tables and lifecycle **untouched** — login and sessions are unaffected.
- Reuses the **existing** Control Plane client path (`createTenant`/`getJob`/`retryJob`) — no new service, queue, or contract.
- Preserves the **idempotency guard** (active-row check) and **extends** it (completed-row check + slug-collision check).
- Leaves existing rows valid: `getTenantContext`, the status route, and middleware all continue to read the latest row exactly as before.

**Alignment with platform boundaries (workspace `CLAUDE.md`):** Product layer (FitDesk) → Control Plane (via existing client) → … ERPNext. This change keeps FitDesk on the *product* side, calling the *approved* Control Plane path. It does **not** add provisioning orchestration to the app, does **not** bypass the Control Plane, and does **not** touch ERP/Frappe.

---

## 5. Data Model Impact & Backward Compatibility

**No schema migration in Phase 1.** The `WorkspaceProvisioning` table is used exactly as it exists today.

| Field | Phase 1 usage |
|-------|---------------|
| `id` | `crypto.randomUUID()` (as today) |
| `userId` | session user id |
| `slug` | from the **shared slug util** (§7); used for the app-level collision check |
| `tenantId` | from `createTenant` response |
| `jobId` | from `createTenant` response |
| `status` | from Control Plane (`queued`/`running`/`completed`/`failed`) |
| `failureReason` | from Control Plane / cleared on retry |
| `lastSyncedAt` / `createdAt` / `updatedAt` | ISO-8601 TEXT, as today |

**Locale fields (Country / Timezone / Currency) have no column and no Control Plane sink (D1, D2).** In Phase 1 they are **Detected workspace defaults — Display-only (Not persisted / Not transmitted)**. They are **not a collected/required input**, are **not written to any table**, and are **not sent to the Control Plane** — so no locale data is silently discarded. The slug is derived from **Workspace name only**, never from locale. Rationale:
- Adding columns = schema migration = **forbidden in Phase 1**.
- Extending `CreateTenantInput` = Control Plane contract change = **forbidden in Phase 1** (use existing path only; no architecture change).

**True persistence of locale is deferred to Production-Hardening**, and only after one of the following is approved:
- a workspace-metadata **schema migration** (adds locale columns or a sibling table), **or**
- a **Control Plane `createTenant` contract update** (extends `CreateTenantInput`), **or**
- a **dedicated tenant settings model**.

**Backward compatibility guarantees:**
- Existing rows (any status) remain readable and correct — no shape change.
- Better Auth tables (`user`, `session`, `account`, `verification`) are **not touched**.
- Existing **completed** users: `getTenantContext`/status route/middleware behavior is unchanged; they land on `/dashboard` (and Phase 1E adds the explicit `/onboarding → /dashboard` redirect that is currently missing, D3).
- Existing users **with active** rows: see provisioning status on re-entry (already works; Phase 1E formalizes it).
- The six reset users **with zero rows** (D6): with the hook removed they will not auto-provision (the `create.after` hook never fired for already-existing users anyway), so removing it changes nothing for them — but Phase 1C gives them the **setup form** instead of the current "contact support" dead-end.

**Production-hardening note (deferred, separately approved):** persisting/forwarding locale will require one of the three approval gates listed above (workspace-metadata schema migration, `CreateTenantInput` contract update, or a dedicated tenant settings model). All are explicitly **out of Phase 1**. See §20.

---

## 6. Idempotency & Re-entry State Machine Design

The `/onboarding` route is the state machine's entry point. It must be a **server component** that reads the latest `WorkspaceProvisioning` row for the session user and branches **before rendering**, so refresh/re-entry is deterministic.

**Canonical status vocabulary (from the audited Control Plane contract, [types/controlplane.ts:1](types/controlplane.ts)):**

| Bucket | DB `status` values | `/onboarding` behavior |
|--------|--------------------|------------------------|
| **None** | no row | Render **Workspace Setup Form** (§10) |
| **Active** | `queued`, `running` | Render **Provisioning Status** (poll) (§11) |
| **Failed** | `failed` | Render **Retry state** (§12) |
| **Completed** | `completed` | **`redirect("/dashboard")`** server-side (closes D3) |

Notes:
- There is **no `in_progress`** in the contract; do not invent one. "Active" = `queued | running`. (The brief's "in-progress" maps to `running`.)
- Status comparisons must be **exact string matches** against the four contract values. Any unrecognized/unexpected value should be treated conservatively as **Active** (keep polling) rather than silently redirecting — and logged.
- The `currentStep` axis (`site_created` … `warmup_completed`) is **progress detail**, not state — it drives copy (§11/§1F) but never routing decisions.

**Idempotency of Start Workspace (the only mutating entry, §13):**
1. **Session required** — reject unauthenticated.
2. **Pre-check existing row** for the user: if an **active** or **completed** row exists, do **not** call `createTenant` again — return the existing row's state (resume). This is the primary duplicate-tenant guard and extends the current hook's `queued|running` check to also cover `completed`.
3. **App-level slug collision check** against `WorkspaceProvisioning.slug` (§7) — if taken by a *different* user, disambiguate before creating.
4. **Double-submit protection** — disable the CTA while in-flight (client) **and** rely on the server pre-check (step 2) as the source of truth (server-authoritative; a double POST that races the first still finds/More-importantly creates at most one tenant because the second request observes the row or is rejected).
5. **Ordering & orphan risk:** `createTenant` is a non-idempotent external POST that must run *before* we know `tenantId`/`jobId`. If `createTenant` succeeds but the subsequent `db.insert` fails, an orphan tenant exists with no local row. Mitigation: (a) insert immediately after the Control Plane returns, in the same request; (b) on insert failure, log structured error including the returned `tenantId`/`jobId` for manual reconciliation; (c) a `failed`-status retry path already exists. Document this residual risk; do **not** add compensating-transaction machinery in Phase 1.

**Re-entry safety matrix:**

| Scenario | Latest row | Result |
|----------|-----------|--------|
| New user, never started | none | Setup form |
| Mid-provisioning refresh | `queued`/`running` | Status (resumes polling) |
| Failed, refresh | `failed` | Retry state |
| Completed, re-enters `/onboarding` | `completed` | Redirect `/dashboard` |
| Double-click Start | active after first | Second request resumes; no second tenant |

---

## 7. Slug Generation & Local Validation Rules

A **single shared, pure, framework-free** slug utility is the source of truth, used by both the Start Workspace action (server) and the live preview (client). Reusable rules:

1. Lowercase.
2. Trim leading/trailing whitespace.
3. Replace each run of non-alphanumeric characters with a single hyphen (`[^a-z0-9]+ → "-"`).
4. Collapse any repeated hyphens (redundant given rule 3 but specified for clarity/robustness if rules are reordered).
5. Strip leading/trailing hyphens.
6. Apply a **reasonable length limit** (e.g. cap to ~48 chars, trimming a trailing hyphen if the cut lands on one). *(Exact cap to be fixed at implementation; the current code has none — this closes D5.)*
7. Fallback to `"workspace"` when the result is empty.

**Validation & uniqueness:**
- **App-level uniqueness check** before tenant creation, querying the existing **`WorkspaceProvisioning.slug`** column. No new column, no DB unique index.
- On collision with a *different* user's slug, disambiguate deterministically (e.g. numeric suffix) — exact strategy fixed at implementation.
- **Never** expose raw trainer input in routing or URLs — only the sanitized slug.
- **Do not** add a DB unique index on `slug` in Phase 1 (the table has none today and the migration uses `IF NOT EXISTS`; adding an index = migration = out of scope). A unique index is a §20 production-hardening candidate only.

**Migration of existing helpers (D5):** `slugifyWorkspaceName` (and, if still needed, `resolveWorkspaceName`) move out of [lib/auth.ts](lib/auth.ts) into a shared onboarding/workspace util (e.g. `lib/workspace/slug.ts`). When the hook is removed (Phase 1B), `slugifyWorkspaceName`'s only caller disappears — so it must be relocated, not left orphaned. `resolveWorkspaceName` (name-or-email-localpart fallback) is **retained only if** the Start Workspace action needs a default when the form somehow yields an empty name; since the form makes Workspace name required, `resolveWorkspaceName` is a candidate for **removal** unless reused for a default-name affordance. Decision recorded at implementation; default recommendation: **keep `slugifyWorkspaceName` (relocated), drop `resolveWorkspaceName`** if the required-name form makes it dead.

---

## 8. Localized Default Resolution

**Phase 1 uses browser-local detection only. IP geolocation is explicitly rejected for Phase 1.**

- Detect timezone client-side via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Map timezone → Country + Currency defaults via a **lightweight client-side MENA table**:

| Timezone | Country | Currency |
|----------|---------|----------|
| `Asia/Dubai` | United Arab Emirates | AED |
| `Asia/Riyadh` | Saudi Arabia | SAR |
| `Asia/Beirut` | Lebanon | USD |
| `Asia/Kuwait` | Kuwait | KWD |
| `Asia/Qatar` | Qatar | QAR |

- **Default fallback (no match):** United Arab Emirates / AED.

**Phase 1 treatment — label this block in the UI exactly as:**

> **Detected workspace defaults — Display-only in Phase 1 (Not persisted / Not transmitted)**

- These values are a **read-only visual preview** of what was detected. They are **not** editable form inputs in Phase 1, are **not** part of the Start Workspace payload, and are **not** written to any table — so nothing the trainer "sets" is silently discarded.
- The implementer must **not** wire a sink for these fields in Phase 1 (no DB column, no `createTenant` argument).
- **Deferred true persistence:** making these editable-and-saved is a Production-Hardening item gated behind one of — a workspace-metadata schema migration, a Control Plane `createTenant` contract update, or a dedicated tenant settings model (§5, §20).

---

## 9. Register UX Requirements (Phase 1A)

**Intent:** keep registration lightweight; remove provisioning-era cruft; add a small usability win. Better Auth behavior is preserved.

- **Fields:** Full name, Email, Password, + **Continue with Google**.
- **Removed from the UI:** **Phone** and **Confirm password**. (Phone was collected for later ERPNext sync; it is no longer part of registration. The `user.phone` additional field may remain in the schema/auth config — removing the *field* is out of scope; only the *registration input* is removed.)
- **Added:** password **visibility toggle** (show/hide).
- **Preserved behaviors:**
  - `signUp.email({ name, email, password })` (no `phone` argument once the input is gone).
  - `signIn.social({ provider: 'google', callbackURL: '/onboarding' })`.
  - On success → `router.replace('/onboarding')`.
  - Already-authenticated redirect to `/dashboard`.
  - Client-side min-length ≥ 8 check (kept; the confirm-match check is removed with the field).
- **Explicitly NOT in registration:** no workspace provisioning, no locale, no workspace name.

---

## 10. Onboarding UX Requirements (Phase 1C)

**Shown only when no provisioning row exists** (the "None" bucket, §6).

- **Required input — exactly one field:** **Workspace name**. This is the only value the trainer enters and the only value used to provision.
- **Live slug preview** rendered directly under **Workspace name**, recomputed on every keystroke using the **shared slug util** (§7). Show the sanitized slug (and, optionally, a hint of where it will appear) so the trainer sees exactly what will be used.
- **Detected workspace defaults — Display-only in Phase 1 (Not persisted / Not transmitted):** Country, Timezone, Currency, shown beneath the name as a **read-only preview** (§8). They are detected via `Intl.DateTimeFormat().resolvedOptions().timeZone` + the §8 MENA mapping (fallback UAE/AED). They are **not editable inputs**, **not** part of the Start Workspace payload, and **not** saved anywhere in Phase 1.
- **Single CTA: "Start Workspace."** No secondary provisioning actions.
- **No** package/payment/WhatsApp/session/scheduling fields. No client/billing/onboarding wizards.
- Mobile-first (per FitDesk `CLAUDE.md`): single-column, large tap targets, simple form.
- Validation: only **Workspace name** is validated — required and non-empty after slugification (the util guarantees a `"workspace"` fallback, but the UI should still require a deliberate name). No locale validation (nothing locale-related is submitted).

---

## 11. Provisioning Status UX Requirements (Phase 1B/1E shared surface)

- Shown for the **Active** bucket (`queued`/`running`).
- Poll the existing `GET /api/controlplane/jobs/:jobId` (keep the current backoff 2s→8s and 120s slow-notice).
- On `completed` → redirect `/dashboard` (existing client behavior **plus** the new server-side guard in §6/§12).
- Copy is **human-facing** (§1F) — no internal step jargon surfaced as primary copy.
- The `null`/no-row case must **never** render here (it routes to the setup form via the server component, closing D4).

---

## 12. Error, Retry, and Recovery States

- **Failed bucket (`failed`):** render a clear, non-technical failure message + **Retry**. Retry uses the existing `POST /api/workspace/retry` ([app/api/workspace/retry/route.ts](app/api/workspace/retry/route.ts)), which finds the latest failed row, calls `retryJob`, and resets `status: "queued"`. Re-poll afterward (existing `pollingRunId` mechanism).
- **Completed re-entry (D3 fix):** `/onboarding` server component must `redirect("/dashboard")` when the latest row is `completed`, instead of mounting the spinner that never advances.
- **No-row recovery (D4/D6 fix):** render the setup form, not "contact support."
- **Transient internal-API failure:** preserve the current fail-safe posture — keep the user on `/onboarding` and let them recover; never hard-fail the page.
- **Orphan tenant (createTenant ok, insert failed):** log structured reconciliation data (see §6.5); surface a generic retryable error to the user.

---

## 13. Phase Blueprint

> All phases are **future** work, contingent on approval. Each is independently shippable and ordered to minimize risk.

- **Phase 1A — Register UI.** Trim to Full name / Email / Password / Google; add password visibility toggle; preserve `signUp.email`, Google, `/onboarding` redirect. *No provisioning.* Lowest risk; pure UI; ship first to de-risk the visible surface.
- **Phase 1B — Auth hook decoupling.** Remove the `createTenant`/insert logic from `databaseHooks.user.create.after` in [lib/auth.ts](lib/auth.ts) (and the `crypto`/import surface it implies). Relocate `slugifyWorkspaceName` to the shared util; decide on `resolveWorkspaceName` (default: drop if dead). Better Auth tables and login/session untouched. **Gate:** must land together with — or immediately before — 1D so there is no window where nothing provisions.
- **Phase 1C — Onboarding interface.** Add the workspace setup form to the "None" branch of `/onboarding`. **One required input: Workspace name.** Live slug preview from the shared util. Country/Timezone/Currency rendered as **Detected workspace defaults — Display-only (Not persisted / Not transmitted)** via timezone detection + MENA mapping (§8). No locale persistence, no locale in the submit payload.
- **Phase 1D — Start Workspace action.** New authenticated server action / route handler (see §14). It **transmits only the values the existing Control Plane contract supports — `workspaceName` and `ownerEmail`** — and may use detected defaults for UI context only (never sent, never stored). Required design properties:
  - **Authenticated session requirement** — reject unauthenticated callers.
  - **Workspace name validation** — required, non-empty after slugification.
  - **Reusable slug generation** via the shared util (§7).
  - **App-level slug collision check** against `WorkspaceProvisioning.slug` (no DB unique index).
  - **Existing active/completed provisioning check** for the current user (resume instead of re-create).
  - **Protection against duplicate Control Plane tenant creation** (server-authoritative pre-check, §6).
  - **Use of the existing Control Plane client path only** (`createTenant`), no new client/contract.
  - **Insert-or-resume `WorkspaceProvisioning`** row behavior.
  - **Structured success/error response.**
  - **No direct ERP/Frappe access.**
  - **No package/payment/WhatsApp/session side effects.**
- **Phase 1E — Re-entry state machine.** Make `/onboarding` branch by status (§6): none→form, active→status, failed→retry, completed→`redirect('/dashboard')`. Closes D3.
- **Phase 1F — Provisioning status copy.** Replace internal step vocabulary with human-facing copy (§1F list). Copy-only.

**Recommended sequencing:** 1A → (1C scaffolding) → **1D + 1B together** → 1E → 1F. 1B and 1D are coupled because removing the hook (1B) without the explicit action (1D) would leave new users unable to provision. 1A, 1C, 1F are independently safe.

---

## 14. Exact Files Expected to Change in a Later Implementation

> Anticipated set for the *future* coding phase. Not exhaustive guarantees; the implementer confirms against the diff.

| File | Phase | Expected change |
|------|-------|-----------------|
| [app/auth/register/page.tsx](app/auth/register/page.tsx) | 1A | Remove Phone + Confirm-password fields; add password visibility toggle; drop `phone` from `signUp.email`. |
| [lib/auth.ts](lib/auth.ts) | 1B | Remove provisioning logic from `databaseHooks.user.create.after`; remove now-unused imports (`createTenant`, `CreateTenantResponse`, provisioning-only Drizzle ops); relocate/drop slug helpers. |
| `lib/workspace/slug.ts` *(new)* | 1B/1D | Shared pure slug util (relocated `slugifyWorkspaceName` + length cap + uniqueness helper signature). |
| [app/onboarding/page.tsx](app/onboarding/page.tsx) | 1C/1E | Branch by status; render setup form for "None"; `redirect('/dashboard')` for "completed". |
| `components/onboarding/workspace-setup-form.tsx` *(new)* | 1C | Client form: **one required input (Workspace name)** + live slug preview; Country/Timezone/Currency as display-only detected defaults; Start Workspace CTA. |
| `app/onboarding/start-workspace` action/route *(new)* | 1D | Authenticated Start Workspace handler (server action **or** route handler — pick one; server action preferred for CSRF/cookie ergonomics with `nextCookies()`). **Sends only `{ workspaceName, ownerEmail }`.** |
| [components/onboarding/provisioning-status.tsx](components/onboarding/provisioning-status.tsx) | 1E/1F | Remove the `null` "contact support" branch (handled upstream); refine `STEP_MESSAGE`/headline copy. |
| `lib/workspace/slug.test.ts` + state-machine test *(new)* | 16 | First tests for this flow. |

---

## 15. Exact Files That Must NOT Change

These are **out of scope** and protected by the task guardrails:

- [lib/db/schema.ts](lib/db/schema.ts) — **no schema migration in Phase 1.**
- [scripts/migrate-app.mjs](scripts/migrate-app.mjs), [scripts/migrate.mjs](scripts/migrate.mjs) — no migration changes; do not run migrations.
- [lib/db.ts](lib/db.ts) — DB client.
- [types/controlplane.ts](types/controlplane.ts) — **do not extend `CreateTenantInput`** (no Control Plane contract change).
- [lib/controlplane/client.ts](lib/controlplane/client.ts) — use as-is.
- [app/auth/login/page.tsx](app/auth/login/page.tsx), [app/auth/login/login-content.tsx](app/auth/login/login-content.tsx) — login unchanged.
- [middleware.ts](middleware.ts) — no change required (its `completed`-gating already aligns with §6).
- [app/api/provisioning/status/route.ts](app/api/provisioning/status/route.ts), [app/api/controlplane/jobs/[jobId]/route.ts](app/api/controlplane/jobs/[jobId]/route.ts), [app/api/workspace/retry/route.ts](app/api/workspace/retry/route.ts) — reused as-is (retry route already does what Phase 1 needs).
- [lib/tenant/context.ts](lib/tenant/context.ts) — read-only consumer; unchanged.
- [lib/auth-client.ts](lib/auth-client.ts), [lib/auth-user-fields.ts](lib/auth-user-fields.ts) — unchanged (the `phone` additional field stays; only the registration *input* is removed).
- Anything under billing, scheduling, packages, WhatsApp, payments, client management, dashboard implementation, Docker/deploy, or `package.json`/config.

---

## 16. Verification Plan

The future implementation must pass, in order:

```bash
npm test          # vitest run
npm run lint      # next lint
npm run build:verify   # next build → .next-verify (scripts/build-verify.mjs)
```

**New automated coverage to add (there is none today, §2.12):**
- **Slug util** (`lib/workspace/slug.ts`): lowercase, trim, non-alphanumeric collapse, repeated-hyphen collapse, leading/trailing strip, length cap, empty→`"workspace"` fallback. Pure function — fast, deterministic.
- **Re-entry state machine** (pure mapping from `status` → branch): none→form, `queued`/`running`→status, `failed`→retry, `completed`→redirect; unknown→active (conservative).
- Slug **collision** helper behavior against a seeded set of `WorkspaceProvisioning.slug` values (in-memory/stub DB; do not hit a real DB or Control Plane).
- **Start Workspace payload shape** (with `createTenant` mocked/stubbed): assert the action calls the Control Plane client with **only `{ workspaceName, ownerEmail }`** — no country/timezone/currency keys present.
- **No locale persistence:** assert the inserted `WorkspaceProvisioning` row contains no locale data (the table has no such columns; the test guards against accidental future wiring).

**Do not** add tests that call the live Control Plane, ERP, or run migrations.

---

## 17. Manual QA Plan

Run against a local/test environment with a test Control Plane (never production tenants). Steps map 1:1 to the brief:

1. New user registers (Full name / Email / Password) → success.
2. **Assert no `WorkspaceProvisioning` row is created** by registration.
3. User lands on `/onboarding`.
4. Workspace setup form appears (none-bucket) with **exactly one required input: Workspace name**. Country/Timezone/Currency appear as a **display-only** "Detected workspace defaults" block (read-only, not editable).
5. Slug preview updates live while typing the Workspace name.
6. **Start Workspace creates exactly one** provisioning row, and the Control Plane request body contains **only `workspaceName` and `ownerEmail`** (verify via network/log inspection) — no country/timezone/currency. The new row stores **no** locale data.
7. **Double-click Start Workspace does not duplicate** rows (server pre-check holds).
8. Browser refresh during provisioning **resumes status** (active bucket).
9. Completed provisioning **redirects to `/dashboard`**.
10. Failed provisioning **shows Retry**; Retry re-enqueues and re-polls.
11. Existing **completed** user → `/dashboard` (and `/onboarding` redirects them there — D3 fix).
12. Existing **active** user → sees status on entry.
13. **Six reset users with zero rows** → see the **setup form** (not "contact support" — D4/D6 fix).
14. **No client/package/session/payment/WhatsApp side effects** occur anywhere in the flow.

Additional checks:
- Google sign-up also lands on `/onboarding` with no provisioning row.
- Detected-defaults preview: in a `Asia/Beirut` browser the display-only block shows Country=Lebanon, Currency=USD; unknown tz → UAE/AED. Confirm these are **read-only** and that changing the browser timezone changes only the preview — never the provisioning payload or any stored row.

---

## 18. Rollback & Commit Strategy

- **Commits:** small and per-phase (1A, then 1B+1D, then 1C, 1E, 1F), each independently revertible. Follow workspace `CLAUDE.md` git rules: inspect `git status`/`git diff`, no unrelated files, run verification before commit, no secrets, **do not push without explicit instruction, no force-push, no branch switch without approval.**
- **Rollback:** because there is **no schema migration and no Control Plane contract change**, rollback is a pure code revert. Reverting 1B+1D restores the original hook behavior; existing rows remain valid throughout (no data shape change). Reverting 1A/1C/1E/1F is cosmetic/flow-only.
- **Panic-button (workspace `CLAUDE.md` §9):** if a change breaks auth, sessions, or provisioning, stop, revert the last own change if safe, report the failing file + exact error + safest next step. Do not fix-forward speculatively.
- **Suggested commit messages (future):**
  - `feat(auth): slim registration to name/email/password + password toggle`
  - `refactor(onboarding): move workspace provisioning out of better-auth user.create hook`
  - `feat(onboarding): explicit workspace setup form + Start Workspace action`
  - `feat(onboarding): status-driven re-entry state machine`
  - `chore(onboarding): humanize provisioning status copy`

---

## 19. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| 1B removes hook before 1D exists → new users can't provision | Med | High | Ship **1B + 1D together** (§13). |
| Duplicate tenant on double-submit / race | Low | High | Server-side pre-check for active/completed row + slug collision check; CTA disable (§6). |
| Orphan tenant (CP ok, insert fails) | Low | Med | Insert immediately; structured reconciliation log; existing retry path (§6.5/§12). |
| Locale silently dropped (collected then discarded) | Low | Low | Structurally avoided: locale is **display-only**, never a collected/required input, never in the payload or DB (§5/§8/§10). Deferred sink in §20. |
| Implementer wires a locale sink that doesn't exist (DB column / `createTenant` arg) | Low | Med | Spec forbids it explicitly (§5/§8/§14); verification asserts payload is `{workspaceName, ownerEmail}` only (§16). |
| Completed user stuck on `/onboarding` (D3) | Med (today) | Med | Server-side `redirect('/dashboard')` in 1E. |
| Status vocabulary drift (`in_progress` invented) | Low | Med | Pinned to the four contract values; unknown→active+log (§6). |
| Slug collision across users without a unique index | Low | Med | App-level check vs `WorkspaceProvisioning.slug`; index deferred to §20. |
| Removing `phone` input vs retaining `user.phone` field mismatch | Low | Low | Keep the schema/auth field; only remove the input (§9/§15). |
| Better Auth lifecycle regression from editing `lib/auth.ts` | Low | High | Touch only the `databaseHooks` block; leave adapter/secret/plugins intact; verify login+session in QA. |

---

## 20. MVP / Production-Hardening / Future Platform Separation

**MVP (this Phase 1):**
- Explicit, idempotent, re-entry-safe onboarding with a **single required input (Workspace name)**.
- Country/Timezone/Currency shown as **display-only detected defaults** (not persisted, not transmitted).
- Start Workspace sends **only `{ workspaceName, ownerEmail }`**.
- No migration, no new deps, no Control Plane contract change.

**Production-hardening (later, separately approved):**
- **Persist & forward locale — gated behind ONE of:** (a) a workspace-metadata **schema migration** (locale columns or sibling table), (b) a **Control Plane `createTenant` contract update** extending `CreateTenantInput`, or (c) a **dedicated tenant settings model**. Only after one is approved do the detected defaults become editable-and-saved.
- **Unique slug index:** add a DB unique index on `WorkspaceProvisioning.slug` (migration) once collision strategy is proven — replaces the app-level check.
- **Email verification:** `requireEmailVerification` is currently `false`; revisit when an email provider is configured.
- **Orphan reconciliation:** automated detection/cleanup of tenants created without a local row.

**Future platform separation:**
- As multi-tenant ambitions grow, provisioning initiation could move behind a dedicated platform/onboarding service rather than a Next.js server action — but only with Control Plane/architecture approval. Not in scope now.

---

## 21. Final Go / No-Go Assessment

**Verdict: GO for Phase 1, conditional on accepting two decisions.**

Phase 1 is cleanly bounded: it is achievable with **no schema migration, no new dependencies, no Control Plane contract change, and no changes to login/session/Better Auth tables.** The existing route handlers (`status`, `jobs/[jobId]`, `workspace/retry`), `getTenantContext`, and middleware all continue to work unchanged. Rollback is a pure code revert.

**Two decisions the approver must accept before implementation:**
1. **Locale is display-only in Phase 1** (D1/D2). The onboarding form requires **only Workspace name**; Country/Timezone/Currency are shown as **Detected workspace defaults — Display-only (Not persisted / Not transmitted)**. No locale data is collected-then-discarded, and Start Workspace sends **only `{ workspaceName, ownerEmail }`**. True persistence is deferred to production-hardening behind one of three gates (schema migration, `createTenant` contract update, or a dedicated tenant settings model). *(If the approver requires locale to reach the Control Plane in Phase 1, scope expands to one of those gates — which violates the Phase 1 guardrails and must be re-approved.)*
2. **Slug uniqueness is app-level only** (no DB unique index in Phase 1).

**Critical blockers/discrepancies surfaced:** D1 (no locale sink), D3 (completed re-entry doesn't redirect), D4/D6 (no-row dead-end vs setup form). All are addressed within Phase 1: the locale *sink* is resolved by making locale display-only (not a deferred risk to the flow), and persistence is deferred by design. None block the flow.

**Boundaries:** Clean and ready for execution after approval. The change stays on the product side of the platform boundary, reuses the approved Control Plane path, and touches no billing/scheduling/packages/WhatsApp/payments/client-management/dashboard/deploy surface.

---

*End of specification. This document changed no production code, schema, route, action, migration, or config. No migrations were run; no Control Plane / ERP / Frappe calls were made.*
