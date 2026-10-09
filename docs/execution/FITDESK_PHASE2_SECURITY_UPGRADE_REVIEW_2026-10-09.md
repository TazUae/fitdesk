# FitDesk Phase 2 — Auth and framework dependency upgrade review

**Date:** 2026-10-09
**Scope:** Draft PR #48, based on draft Phase 2 foundation PR #46 at exact commit `a5f176d92fc24d82d0cbbaf1328f8d9d02833696`.
**Decision state:** REVIEW CANDIDATE; no production authorization, merge, deployment, migration, environment copy, or independent security signoff.

## 1. Independently reviewable stages

**Stage A — committed**: Better Auth from installed 1.5.6/broad ^1.2.0 to pinned stable 1.6.33, with npm-generated package-lock. Commit `ba9096c869524551a5007397bfba2d621229afb5`. No runtime source changed. Node 20 Linux CI triggered using workflow_dispatch run 37966993718. Typecheck, 2,570 tests, lint, Docker build and source secret scan passed; critical dependency audit remained blocked because Next.js 14.2.21 was still present.

**Stage B — candidate, NOT accepted**: Next.js 16.4.0, React/React DOM 19.2.0, ESLint 9.39.1, eslint-config-next 16.4.0, React types 19.x and lockfile regeneration; migration of synchronous request APIs and route props, Next.js 16 proxy convention, legacy lint configuration. These upgrades are tested only on a separate task-scoped branch/worktree and must not be merged until independently verified. Keep stages attributable as separate commits.

## 2. Security, auth and tenant boundaries reviewed

- `lib/auth.ts`: Better Auth Drizzle SQLite adapter, server-derived secret (build-time placeholder only), email/password enabled, Google provider conditionally enabled only when credentials exist; `nextCookies()` plugin. No production credentials were copied into this branch. Whether deployed Google OAuth is enabled is unknown.
- `proxy.ts` (renamed from `middleware.ts`): restrict `/dashboard/:path*` using server-session Better Auth read and workspace provisioning status; redirects anonymous users to login, incomplete or failed provisioning to onboarding. Internal origin, session cookie forwarding and error behavior must receive security review. Next.js 16 proxy runtime differs from old Edge middleware.
- `lib/auth/resolve-trainer.ts` and `lib/tenant/context.ts`: request headers become awaitable; identity still derives server-side, not from user-supplied client identifiers.
- Provisioning routes `app/api/controlplane/jobs/[jobId]/route.ts`, `app/api/provisioning/status/route.ts`, `app/api/workspace/retry/route.ts`: async request header/route param migration must not loosen the ownership/provisioning gates. ERP and payment data are NOT modified.
- `proxy.test.ts` is synthetic, network-mocked negative-path coverage: anonymous redirect, pending workspace deny, provisioning backend failure deny, completed user allow, and cookie forwarding. Real OAuth/account-linking, credential rotation, session invalidation, and cross-tenant API authorization require additional independent Security tests.

## 3. Next.js 16 compatibility risks (not automatically fixed by semver change)

- Node >=20.9 required; GitHub CI is on Node 20 but runner version must be verified. Runtime React 19.2 may affect existing UI packages and server rendering.
- `headers()`, `cookies()`, `params`, `searchParams` are async; modified sites must be typechecked and tests run, including the client edit route receiving promised params via React `use`.
- `next lint` removed; use ESLint 9 flat config. Legacy `.eslintrc.json` retired in the isolated candidate. Preserve lint errors, do not mute globally to force green.
- `middleware.ts` deprecated/replaced with `proxy.ts` in Next 16; changes Edge-to-Node behavior and internal API calls. Verify session and tenant fail-closed behavior and deployment base origin.
- Turbopack default build and new `next/font` path may change reproducibility; Docker standalone output and `FITDESK_VERIFY_BUILD` separation require revalidation.
- Third-party React 19 support, TypeScript types, external CSS and schedule UI integrations may require additional changes; do not claim compatibility from `npm ci` alone.

## 4. Required tests / non-negotiable controls

- Linux Node 20 `npm ci` from package-lock with success exit code.
- `npm run typecheck`, all unit and mocked regression tests including `proxy.test.ts`, lint, `npm run build:verify`, Docker build, Trivy secrets scan, CycloneDX SBOM with SHA/version provenance, and fail-closed `npm audit --omit=dev --audit-level=critical`, all on the exact candidate SHA.
- Auth negative-path tests must explicitly assert anonymous/session-missing, incomplete provisioning and tenant-invalid cases. A mock-only unit test is not proof of production OAuth safety.
- Independent Security reviewer and DevOps reviewer signoff required. No self-approval. PR #48 is draft, targets foundation PR #46, and neither branch is production.
- Critical advisory issue #47 remains open until resolved. Other high-severity dependency advisories tracked in issue #49 and must be reviewed before rollout (particularly ORM SQL injection, PostCSS/Tailwind migration, transitive libraries).

## 5. Rollback

Revert stage B commit independently if Next/React/proxy incompatibilities arise while retaining verified Better Auth stage A. Revert stage A separately if Better Auth session behavior regresses. Close draft PR #48 unmerged if any blocking test/security check cannot be resolved. Do not reset, delete, prune, or overwrite original 26+ preserved worktree entries or encrypted OneDrive archives. No data migration was performed.
