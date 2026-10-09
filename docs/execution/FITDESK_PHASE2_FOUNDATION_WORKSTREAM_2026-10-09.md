# FitDesk Phase 2 — isolated workstream and supply-chain foundation

**Date:** 2026-10-09
**Workstream:** WS-MOBILE-P2-FOUNDATION-001
**Planning baseline:** FitDesk Backend & Native Mobile API Readiness — locked master plan v1.0
**Status:** IN PROGRESS; not a Phase 2 exit certification or release approval.

## Source control / ownership

- Product Owner and Technical Lead/Backend approver: the requesting FitDesk owner, confirmed in the Phase 1 conversation.
- Security, ERP/Finance and DevOps review duties **are not delegated by this statement**. Obtain their reviews for affected protected files, production controls and financial boundaries.
- The sole approved new task-scoped local worktree was created from `cbd9ebfada317f24bc2f1e12ca77f64d32af8942` on `feat/mobile-p2-foundation-node20`. Its directory was initially clean, with no `.env`, local secrets or copied `node_modules`.
- Subsequent developer-machine connectivity loss means the local worktree and this remote branch must be reconciled before attempting a push or any additional local state-changing operation.
- The committed B1 tip `460522236efb` and security/T1 tip `9d1a6ffd27fe` are **not merged**. Their common ancestor is `cbd9ebf`, with 1 B1-only and 19 security-only commits. Four paths overlap: `package.json`, `scripts/assert-typecheck-baseline.mjs`, `scripts/assert-vitest-clean.mjs`, and `typecheck-baseline.txt`. Do not silently choose one side.
- Canonical/historical registries and 25 preexisting worktree entries remain preserved. This scope record does not replace the historical registry.

## Scoped modifications in this review

1. Make the GitHub Actions workflow fail-closed and read-only, with Node 20, `npm ci`, bounded typecheck, tests, lint, build and Docker build verification.
2. Add a separate supply-chain job: `npm ci --ignore-scripts`, CycloneDX SBOM and `npm audit --omit=dev --audit-level=critical`. Upload the SBOM as a short-lived review artifact; no deployment or publication.
3. Add a separate Trivy source secret-scan job. A secrets scan of the checkout is **not** a historical Git scan or complete vulnerability review.
4. Add a typecheck script that emits no artifacts. This script is designed to fail CI on error/timeout; it does not waive existing errors.
5. Record evidence and rollback, without touching native API endpoints, auth/payment logic, ERP, database schema, production secrets, environment files or existing dirty worktrees.

## Baseline verification / blockers — accurate status

- Linux Node 20.20.2 container ran the pure Node security-hook suite from the separate security branch: **600 passed, 2 failed** on CRLF-normalization tests E4-6 and E4-7. Both isolated cases passed under Windows Node 24, confirming portability divergence, not release safety.
- A Node 20 container TypeScript check timed out at 90 seconds; no passing typecheck evidence.
- A Linux Vitest attempt using Windows-installed dependencies could not start because the Linux Rolldown native binding was absent. It did not run product assertions.
- Source-level security risks on the inspected security tip include a Next.js 14.2.21 lockfile with middleware guarding dashboard routes, Better Auth 1.5.6 with conditional Google OAuth, and a mock Whish payment link that can return success under a feature gate. Production exposure and deployed commit are **unverified**.
- Whether the new branch passes clean Linux dependency installation, all quality jobs, audit and scan gates must be determined from actual CI logs. The first local `npm ci` began in an isolated Docker container but its result was unavailable when the desktop connector went offline. Do not assert success.
- The committed GitHub branch is review-only. Any required fixes must be separate, attributable and tested; never suppress failing tests, critical vulnerabilities or secrets to obtain a green badge.

## Reproducibility and supply-chain tools

| Component | Declared source/version | Purpose |
|---|---|---|
| Node.js | major 20, CI setup-node v4, isolated Docker `node:20` | Runtime parity |
| npm | lockfile-driven `npm ci` | Reproducible install |
| TypeScript | lockfile version; CLI `tsc --noEmit` | Static type gate |
| Vitest | existing lockfile, currently 4.1.7 in inspected security branch | Unit/test runner |
| npm audit | installed npm CLI | Critical runtime vulnerability gate |
| npm sbom | installed npm CLI, CycloneDX JSON | Dependency inventory |
| Trivy | GitHub action tag 0.33.1 | Filesystem source secret detection |
| GitHub Actions | checkout/setup-node/upload-artifact v4 tags | CI execution/artifact retention |

Licenses, full third-party action pinning, artifact signing/provenance, branch-protection settings, and runtime dependency advisories require independent follow-up verification. Workflow tags are **not** immutable SHA pins.

## Exit checklist

- [x] One task-scoped source worktree created from a verified checkpoint; no secrets copied at creation.
- [x] Source checkpoint and ownership/overlap record prepared.
- [x] Scoped CI hardening review branch prepared; no protected product feature code changed.
- [ ] Worktree/remote history re-synchronized after developer-machine connectivity restores.
- [ ] Clean Linux Node 20 `npm ci` proven with exit code 0 and reproducible lockfile.
- [ ] Typecheck, Vitest full suite, lint, build and Docker build all pass on the same candidate SHA.
- [ ] Dependency audit and source-secret scan pass (no fail-open waivers).
- [ ] CycloneDX artifact, tool licenses/versions and artifact provenance independently verified.
- [ ] GitHub branch protections and least-privilege CI controls verified at repository settings level.
- [ ] Required Security and DevOps reviewers sign off; approved source/rollback/ownership records finalized.

**Phase 2 NOT DONE until every required exit criterion passes.**

## PR and rollback plan

- Keep this change in a **draft PR** until the full Node 20 baseline and security/DevOps controls are verified; never auto-merge.
- Review the GitHub `Files changed` view to ensure only intended CI, package-script and workstream documentation files changed; investigate any surprise path.
- Reproduce a clean `npm ci` on an isolated Linux environment with only synthetic fixtures, no production data or credentials.
- Rollback, if needed: revert this isolated PR's CI, package-script and documentation commits (or close the draft PR unmerged). Do **not** clean, reset or prune the original Git worktrees; do not delete the encrypted OneDrive recovery archives.
- Record a new workstream decision/ADR if the locked plan scope or security controls must change. Do not make changes by silently broadening this PR.
