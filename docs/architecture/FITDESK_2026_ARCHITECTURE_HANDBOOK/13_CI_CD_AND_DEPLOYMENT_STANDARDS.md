# 13 — CI/CD & Deployment Standards

> **Purpose:** Define local QA, the Dokploy-from-Git deploy flow, and the required checks.
> **Last verified:** 2026-06-25 · **Authority:** workspace `CLAUDE.md` §6–7, `FitDesk/CLAUDE.md`.

## Scope

Local verification, CI gates, and production deployment for FitDesk (and, by reference, the sibling services).

## Current known state (verified)

- Deploy flow today: **commit → push → Dokploy deploys from Git**, per service.
- Local full-stack QA exists: `npm run local:up` then `npm run local:check`
  (`scripts/check-local-stack.mjs` is a read-only preflight verifying FitDesk → cp-api →
  erp-backend/erp-frontend). The canonical local env file is root **`.env`** (volumes baked from it).
- FitDesk has a Dockerfile; the ERPNext image is unified at `docker/Dockerfile.erpnext`.
- CI pipelines are **not yet** standardized across repos (Phase H). Test counts are assumed, not re-run (`01`/H1).

## Architecture rules

### Local QA (before any push)
```bash
npm run local:up        # build + start the local stack
npm run local:check     # read-only chain preflight
# Then QA http://localhost:3000/dashboard
```
- **Local Docker success is not proof of VPS/Dokploy success.** Treat them as separate gates.

### Required checks (FitDesk)
```bash
npm test           # vitest suite
npm run lint       # next lint / eslint
npm run build      # next build
npx tsc --noEmit   # if configured — type integrity (use during Phase E migrations)
```
- A change is not "green" until the relevant checks above pass. If tests fail, say so — never hide it.

### Deployment rules (binding — see `00`)
- **Push only on explicit instruction.** No force-push. No rebasing/amending shared history.
- Dokploy pulls from Git per service; `main` is the deploy source and must be deployable.
- **No production server edits / env changes / container restarts / volume deletion** without approval.
- VPS debugging is **read-only first** (`docker ps`, `docker logs <c> --tail 100`, `curl -i .../health`).
- Health endpoints must not leak credentials; logs shown to humans are scrubbed.

### CI hardening (Phase H target)
- Per-repo pipelines reproduce the manual checks: FitDesk (test/lint/build/`tsc`); control-plane
  (`npm test` + `npm run test:integration`); `provisioning_api` (`pytest`).
- Add the local-stack smoke (`check-local-stack.mjs`) and the token-governance lint (`07`) as gates.

## Do-not-touch areas

- Production env values and secrets; the Dokploy deploy source contract.
- Docker/compose files are **out of scope for the handbook task** and changed only under Phase B with approval.

## Open decisions

- Confirm FitDesk's actual test/lint/build script names and whether `tsc --noEmit` is wired (run them in H).
- Whether CI runs on a remote (GitHub Actions) or locally only.

## Verification checklist

- [ ] `local:up` + `local:check` green before any deploy discussion.
- [ ] FitDesk test/lint/build (+`tsc --noEmit` if configured) green.
- [ ] No secret printed in logs or health output.
- [ ] No push/deploy without explicit instruction.

## Related files

- `package.json` (scripts), `Dockerfile`, root `docker-compose.local.yml`, `.env`,
  `scripts/check-local-stack.mjs`.

## Related ADRs

- Workspace `CLAUDE.md` §6–7 govern; a **Production Deployment Policy ADR** is still missing (`14`).

## Next actions

- In Phase H, verify the real script names and stand up per-repo pipelines; promote a Deployment ADR.
