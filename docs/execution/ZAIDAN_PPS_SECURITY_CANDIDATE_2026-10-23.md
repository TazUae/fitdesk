# FitDesk PPS pilot — security migration candidate (review only)

**Date:** 2026-10-23
**Source baseline:** Draft CI repair PR #56, commit `68614bfbb73f01c4845dcd1f09bee457d4e541bf`
**Compatibility reference:** Existing security/React migration PR #48, commit `5e866ce73ebbd2739ce0658f27a70a14baafecca`, compared with its foundation PR #46 `a5f176d92fc24d82d0cbbaf1328f8d9d02833696`.
**State:** IMPLEMENTED CANDIDATE, **NOT QUALIFIED**, DRAFT ONLY.

## Scope and composition

1. Restore PR #48's already reviewed migration delta onto the **separate PR #56** commit without changing either source branch. This includes Next 16 proxy, React 19 browser compatibility, Better Auth integration and regression test fixtures.
2. Update the pinned stable package targets to `next@16.4.2`, `eslint-config-next@16.4.2`, and `better-auth@1.7.12` (October 2026 stable, security-patched versions; not a promise of forward compatibility).
3. Regenerate the npm lockfile with a package-lock-only install. Retain exact-version lock entries.
4. Preserve the independently demonstrated native-libsql Docker fix: a **single** `npm ci --include=optional` followed by `require('@libsql/linux-x64-gnu')` as a mandatory image-build step; retain PR #48's temporary build secret and pinned default image.
5. Retain independent protected six-job GitHub CI, `npm audit --omit=dev --audit-level=critical`, pinned actions and Trivy source secret scan. PR #48 additionally includes synthetic ephemeral browser/auth/cookie smoke runs.

## Verified before candidate publication

- Git source refs and main checked: PR #56 `68614bfb...`, PR #48 `5e866ce...`; new clean isolated Windows checkout (separate from production and existing FitDesk worktrees).
- Node lockfile verification: both package and lockfile contain Next.js **16.4.2**, Better Auth **1.7.12**, eslint-config-next **16.4.2**, and optional Linux libsql `0.5.28`.
- `npm install --package-lock-only --ignore-scripts --include=optional` returned exit 0; `git diff --check` and staged diff check passed.
- `npm audit --omit=dev --audit-level=critical --json` returned exit **0**: **0 critical**, **10 high**, **8 moderate** advisories. Audit JSON stored locally in the factory evidence directory; high and moderate items require explicit assessment and mitigation, not silent waiver.
- These are **local dependency/structural checks**, not Linux integration, Next build, OAuth functionality or staging proof.

## Required acceptance before any merge

- All **six required GitHub pull-request checks** must PASS on the **exact final tested head/merge candidate** (no skipped typecheck, audit, Trivy or Docker).
- Validate tenant ownership, cookie/CSRF, OAuth state/PKCE, secret/billing isolation, server-calculated session totals, tampered client totals, invoice lifecycle and failure handling. Review React 19 browser behavior and incompatible downstream packages.
- Review each changed test: no weakening of product assertions or independently protected G1 acceptance suite. G1 suite version + SHA need separate owner approval and protection.
- Independent reviewer/security/DevOps approval and explicit owner authorization for protected CI/merge. Staging only on specific permission; production never implicit.
- Authenticate worker isolation, one-writer Forge leases/recovery/budget, Graphify inside worker; then complete all G1-G5 and 3 fresh-baseline qualification trials.

**NO-GO** until every mandatory gate is proven. To roll back, close the draft PR without merging. No production, staging, secret, permission or networking settings were changed.
